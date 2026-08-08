import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {buildArtifactRef} from "./artifact-registry";
import {
  artifactIndexSchema,
  artifactRefSchema,
  type ArtifactIndex,
  type ArtifactRecord,
  type ArtifactRef,
} from "./schemas/artifact";
import {
  CONTENT_MANIFEST_SCHEMA_VERSION,
  contentManifestGateSnapshotSchema,
  contentManifestSchema,
  hashContentSelection,
  type ContentManifest,
  type ContentManifestGateSnapshot,
} from "./schemas/freeze-manifest";
import type {CriticResult} from "./schemas/critic-output";
import type {ProductionState} from "./state";

export const DEFAULT_CONTENT_MANIFEST_PRODUCER = "content-freeze";
export const DEFAULT_CONTENT_MANIFEST_ARTIFACT_ID_SUFFIX = "control:content-manifest";

const activeStatuses = new Set(["open", "assigned", "escalated"]);
const severityRank: Readonly<Record<string, number>> = {
  info: 0,
  low: 1,
  minor: 1,
  medium: 2,
  high: 3,
  major: 3,
  blocker: 4,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const uniqueSorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

const normalizeRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const root = path.resolve(repoRoot);
  const absolutePath = path.resolve(root, repositoryPath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`content manifest path escapes repository: ${repositoryPath}`);
  }
  return relative.split(path.sep).join("/");
};

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const normalized = normalizeRepositoryPath(repoRoot, repositoryPath);
  return path.resolve(repoRoot, normalized);
};

const sha256Bytes = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const referenceBytesMatch = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const bytes = fs.readFileSync(resolveRepositoryPath(repoRoot, ref.path));
    return bytes.byteLength === ref.sizeBytes && sha256Bytes(bytes) === ref.sha256;
  } catch {
    return false;
  }
};

type ExplicitArtifactSelection = readonly ArtifactRef[] | Readonly<Record<string, ArtifactRef>>;

/**
 * Returns only caller-supplied selections. In particular, it never reads `artifactIndex.selected`
 * or derives a selection from a generic artifact collection.
 */
const selectedRefsFromInput = (input: ContentFreezeInput): ArtifactRef[] => {
  const source: ExplicitArtifactSelection | undefined =
    input.selectedArtifactRefs ?? input.selectedRefs ?? input.selectedArtifacts ?? input.selected;
  if (source === undefined) return [];
  return Array.isArray(source) ? [...source] : Object.values(source);
};

const normalizeIssueValues = (input: ContentFreezeInput): unknown[] => {
  const values: unknown[] = [];
  for (const collection of [input.issues, input.openIssues]) {
    if (collection === undefined) continue;
    values.push(...(Array.isArray(collection) ? collection : Object.values(collection)));
  }
  for (const result of [...(input.criticResults ?? []), ...(input.evaluations ?? [])]) {
    values.push(result);
  }
  return values;
};

type NormalizedIssue = {
  id: string;
  severity: string;
  status: string;
};

const issueFromValue = (value: unknown, fallbackId: string): NormalizedIssue[] => {
  if (!isRecord(value)) return [];

  if (Array.isArray(value.issues)) {
    const byId = new Map<string, NormalizedIssue>();
    for (const [index, issue] of value.issues.entries()) {
      for (const normalized of issueFromValue(issue, `${fallbackId}-${index + 1}`)) {
        byId.set(normalized.id, normalized);
      }
    }

    // A critic result's blocker list is an explicit active-blocker declaration. Keep it
    // fail-closed even if a malformed result also marks the corresponding issue resolved.
    if (Array.isArray(value.blockers)) {
      for (const blocker of value.blockers) {
        if (typeof blocker !== "string" || blocker.length === 0) continue;
        byId.set(blocker, {id: blocker, severity: "blocker", status: "open"});
      }
    }
    return [...byId.values()];
  }

  const rawId = value.id ?? value.issueId;
  const id = typeof rawId === "string" && rawId.length > 0 ? rawId : fallbackId;
  const severity = typeof value.severity === "string" ? value.severity : "info";
  const status = typeof value.status === "string" ? value.status : "open";
  return [{id, severity, status}];
};

const normalizedIssues = (input: ContentFreezeInput): NormalizedIssue[] => {
  const byId = new Map<string, NormalizedIssue>();
  for (const [index, value] of normalizeIssueValues(input).entries()) {
    for (const issue of issueFromValue(value, `freeze-issue-${index + 1}`)) {
      const previous = byId.get(issue.id);
      if (!previous) {
        byId.set(issue.id, issue);
        continue;
      }

      const previousRank = severityRank[previous.severity] ?? 0;
      const issueRank = severityRank[issue.severity] ?? 0;
      byId.set(issue.id, {
        id: issue.id,
        severity: issueRank >= previousRank ? issue.severity : previous.severity,
        status:
          activeStatuses.has(previous.status) || activeStatuses.has(issue.status)
            ? "open"
            : previous.status,
      });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
};

const isOpenBlockingIssue = (issue: NormalizedIssue): boolean =>
  activeStatuses.has(issue.status) &&
  (issue.severity === "blocker" || issue.severity === "major" || issue.severity === "high");

const recordForRef = (index: ArtifactIndex, ref: ArtifactRef): ArtifactRecord | undefined =>
  index.artifacts.find(
    (record) =>
      record.ref.artifactId === ref.artifactId &&
      record.ref.revision === ref.revision &&
      record.ref.sha256 === ref.sha256,
  );

const selectedPointerMatches = (index: ArtifactIndex, ref: ArtifactRef): boolean => {
  const pointer = index.selected[ref.artifactId];
  return Boolean(
    pointer &&
    pointer.revision === ref.revision &&
    pointer.sha256 === ref.sha256 &&
    pointer.path === ref.path,
  );
};

const dependencyRecordFor = (
  index: ArtifactIndex,
  dependency: ArtifactRecord["dependencies"][number],
): ArtifactRecord | undefined => {
  const selected = index.selected[dependency.artifactId];
  if (
    !selected ||
    selected.revision <= 0 ||
    selected.sha256 !== dependency.sha256 ||
    selected.path !== dependency.path
  ) {
    return undefined;
  }

  return index.artifacts.find(
    (record) =>
      record.ref.artifactId === dependency.artifactId &&
      record.ref.revision === selected.revision &&
      record.ref.sha256 === selected.sha256 &&
      record.ref.path === selected.path,
  );
};

/**
 * Checks the selected record and its dependency closure without consulting mutable latest paths.
 * A selected artifact with an invalid dependency is treated as stale for freeze purposes.
 */
const selectedArtifactIsStale = (
  index: ArtifactIndex,
  record: ArtifactRecord,
  visiting = new Set<string>(),
  repoRoot?: string,
  verifyArtifactBytes = false,
): boolean => {
  if (record.state === "stale") return true;
  if (visiting.has(record.ref.artifactId)) return true;

  const nextVisiting = new Set(visiting).add(record.ref.artifactId);
  return record.dependencies.some((dependency) => {
    const dependencyRecord = dependencyRecordFor(index, dependency);
    return (
      !dependencyRecord ||
      dependencyRecord.state !== "selected" ||
      (verifyArtifactBytes &&
        repoRoot !== undefined &&
        !referenceBytesMatch(repoRoot, dependencyRecord.ref)) ||
      selectedArtifactIsStale(index, dependencyRecord, nextVisiting, repoRoot, verifyArtifactBytes)
    );
  });
};

const currentArtifactHashMismatches = (
  repoRoot: string | undefined,
  refs: readonly ArtifactRef[],
  verifyArtifactBytes: boolean,
): {missing: string[]; mismatched: string[]} => {
  if (!repoRoot || !verifyArtifactBytes) return {missing: [], mismatched: []};

  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const ref of refs) {
    const filePath = resolveRepositoryPath(repoRoot, ref.path);
    try {
      const bytes = fs.readFileSync(filePath);
      if (sha256Bytes(bytes) !== ref.sha256 || bytes.byteLength !== ref.sizeBytes) {
        mismatched.push(ref.artifactId);
      }
    } catch {
      missing.push(ref.artifactId);
    }
  }
  return {missing: uniqueSorted(missing), mismatched: uniqueSorted(mismatched)};
};

export type ContentFreezeIssue = {
  id?: string;
  issueId?: string;
  severity?: string;
  status?: string;
};

export type ContentFreezeInput = {
  repoRoot?: string;
  episodeId: string;
  artifactIndex?: ArtifactIndex;
  /** The only artifact refs eligible for this freeze. No latest-pointer lookup is performed. */
  selectedArtifactRefs?: readonly ArtifactRef[];
  /** Compatibility aliases for callers that still name the explicit selection differently. */
  selectedRefs?: readonly ArtifactRef[];
  selectedArtifacts?: readonly ArtifactRef[] | Readonly<Record<string, ArtifactRef>>;
  selected?: readonly ArtifactRef[] | Readonly<Record<string, ArtifactRef>>;
  issues?: readonly ContentFreezeIssue[] | Readonly<Record<string, ContentFreezeIssue>>;
  openIssues?: readonly ContentFreezeIssue[] | Readonly<Record<string, ContentFreezeIssue>>;
  criticResults?: readonly Pick<CriticResult, "issues" | "blockers" | "rubricVersion">[];
  evaluations?: readonly Pick<CriticResult, "issues" | "blockers" | "rubricVersion">[];
  frozenAt?: string;
  frozenBy?: string;
  runId?: string;
  manifestPath?: string;
  manifestArtifactId?: string;
  manifestProducer?: string;
  previousManifestRef?: ArtifactRef;
  /** Defaults to true when a repository root is supplied. */
  verifyArtifactBytes?: boolean;
};

export type ContentFreezePreconditionReport = {
  ready: boolean;
  selectedArtifactIds: string[];
  duplicateArtifactIds: string[];
  staleArtifactIds: string[];
  openIssueIds: string[];
  blockerIssueIds: string[];
  majorIssueIds: string[];
  notSelectedArtifactIds: string[];
  missingArtifactIds: string[];
  hashMismatchedArtifactIds: string[];
  episodeMismatch: boolean;
};

export class ContentFreezeError extends Error {
  readonly report: ContentFreezePreconditionReport;

  constructor(report: ContentFreezePreconditionReport) {
    const reasons: string[] = [];
    if (report.selectedArtifactIds.length === 0) reasons.push("FREEZE_NO_SELECTED_ARTIFACTS");
    if (report.duplicateArtifactIds.length > 0) {
      reasons.push(`FREEZE_DUPLICATE_ARTIFACTS:${report.duplicateArtifactIds.join(",")}`);
    }
    if (report.staleArtifactIds.length > 0) {
      reasons.push(`FREEZE_STALE_ARTIFACTS:${report.staleArtifactIds.join(",")}`);
    }
    if (report.blockerIssueIds.length > 0) {
      reasons.push(`FREEZE_OPEN_BLOCKERS:${report.blockerIssueIds.join(",")}`);
    }
    if (report.majorIssueIds.length > 0) {
      reasons.push(`FREEZE_OPEN_MAJOR_ISSUES:${report.majorIssueIds.join(",")}`);
    }
    if (report.notSelectedArtifactIds.length > 0) {
      reasons.push(`FREEZE_ARTIFACT_NOT_SELECTED:${report.notSelectedArtifactIds.join(",")}`);
    }
    if (report.missingArtifactIds.length > 0) {
      reasons.push(`FREEZE_ARTIFACT_MISSING:${report.missingArtifactIds.join(",")}`);
    }
    if (report.hashMismatchedArtifactIds.length > 0) {
      reasons.push(`FREEZE_ARTIFACT_HASH_MISMATCH:${report.hashMismatchedArtifactIds.join(",")}`);
    }
    if (report.episodeMismatch) reasons.push("FREEZE_EPISODE_MISMATCH");
    super(`content freeze rejected: ${reasons.join(";") || "FREEZE_PRECONDITION_FAILED"}`);
    this.name = "ContentFreezeError";
    this.report = report;
  }
}

export const evaluateContentFreezePreconditions = (
  input: ContentFreezeInput,
): ContentFreezePreconditionReport => {
  const selectedRefs = selectedRefsFromInput(input).map((ref) => artifactRefSchema.parse(ref));
  const selectedArtifactIds = uniqueSorted(selectedRefs.map((ref) => ref.artifactId));
  const duplicateArtifactIds = uniqueSorted(
    selectedRefs
      .map((ref) => ref.artifactId)
      .filter((artifactId, index, refs) => refs.indexOf(artifactId) !== index),
  );
  const staleArtifactIds = new Set<string>();
  const notSelectedArtifactIds = new Set<string>();
  let episodeMismatch = false;
  const artifactIndex = input.artifactIndex
    ? artifactIndexSchema.parse(input.artifactIndex)
    : undefined;
  const verifyArtifactBytes = input.verifyArtifactBytes ?? input.repoRoot !== undefined;

  for (const ref of selectedRefs) {
    if (ref.episodeId !== input.episodeId) episodeMismatch = true;
  }
  if (artifactIndex && artifactIndex.episodeId !== input.episodeId) {
    episodeMismatch = true;
  }

  if (artifactIndex) {
    for (const ref of selectedRefs) {
      const record = recordForRef(artifactIndex, ref);
      if (!record) {
        notSelectedArtifactIds.add(ref.artifactId);
        continue;
      }
      if (
        selectedArtifactIsStale(
          artifactIndex,
          record,
          new Set(),
          input.repoRoot,
          verifyArtifactBytes,
        )
      ) {
        staleArtifactIds.add(ref.artifactId);
        continue;
      }
      if (record.state !== "selected" || !selectedPointerMatches(artifactIndex, ref)) {
        notSelectedArtifactIds.add(ref.artifactId);
      }
    }
  }

  const issues = normalizedIssues(input);
  const openIssueIds = issues
    .filter((issue) => activeStatuses.has(issue.status))
    .map((issue) => issue.id);
  const blockerIssueIds = issues
    .filter((issue) => isOpenBlockingIssue(issue) && issue.severity === "blocker")
    .map((issue) => issue.id);
  const majorIssueIds = issues
    .filter((issue) => isOpenBlockingIssue(issue) && issue.severity !== "blocker")
    .map((issue) => issue.id);

  const {missing, mismatched} = currentArtifactHashMismatches(
    input.repoRoot,
    selectedRefs,
    verifyArtifactBytes,
  );

  return {
    ready:
      selectedRefs.length > 0 &&
      duplicateArtifactIds.length === 0 &&
      staleArtifactIds.size === 0 &&
      blockerIssueIds.length === 0 &&
      majorIssueIds.length === 0 &&
      notSelectedArtifactIds.size === 0 &&
      missing.length === 0 &&
      mismatched.length === 0 &&
      !episodeMismatch,
    selectedArtifactIds,
    duplicateArtifactIds,
    staleArtifactIds: uniqueSorted(staleArtifactIds),
    openIssueIds: uniqueSorted(openIssueIds),
    blockerIssueIds: uniqueSorted(blockerIssueIds),
    majorIssueIds: uniqueSorted(majorIssueIds),
    notSelectedArtifactIds: uniqueSorted(notSelectedArtifactIds),
    missingArtifactIds: missing,
    hashMismatchedArtifactIds: mismatched,
    episodeMismatch,
  };
};

export const assertContentFreezePreconditions = (
  input: ContentFreezeInput,
): ContentFreezePreconditionReport => {
  const report = evaluateContentFreezePreconditions(input);
  if (!report.ready) throw new ContentFreezeError(report);
  return report;
};

export const assertFreezeReady = assertContentFreezePreconditions;

export type CreateContentManifestInput = {
  episodeId: string;
  selectedArtifactRefs: readonly ArtifactRef[];
  frozenAt?: string;
  frozenBy?: string;
  runId?: string;
  gateSnapshot?: ContentManifestGateSnapshot;
};

const sortArtifactRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] =>
  refs
    .map((ref) => artifactRefSchema.parse(ref))
    .sort((left, right) => {
      const artifactIdOrder = left.artifactId.localeCompare(right.artifactId);
      if (artifactIdOrder !== 0) return artifactIdOrder;
      const revisionOrder = left.revision - right.revision;
      if (revisionOrder !== 0) return revisionOrder;
      return left.sha256.localeCompare(right.sha256);
    });

const sortGateSnapshot = (gateSnapshot: ContentManifestGateSnapshot): ContentManifestGateSnapshot =>
  contentManifestGateSnapshotSchema.parse({
    ...gateSnapshot,
    openIssueIds: uniqueSorted(gateSnapshot.openIssueIds),
    blockerIssueIds: uniqueSorted(gateSnapshot.blockerIssueIds),
    majorIssueIds: uniqueSorted(gateSnapshot.majorIssueIds),
    rubricVersions: uniqueSorted(gateSnapshot.rubricVersions),
  });

export const createContentManifest = (input: CreateContentManifestInput): ContentManifest => {
  const artifacts = sortArtifactRefs(input.selectedArtifactRefs);
  const gateSnapshot = sortGateSnapshot(
    input.gateSnapshot ?? {
      contentGate: "pass",
      openIssueIds: [],
      blockerIssueIds: [],
      majorIssueIds: [],
      rubricVersions: [],
    },
  );

  return contentManifestSchema.parse({
    schemaVersion: CONTENT_MANIFEST_SCHEMA_VERSION,
    episodeId: input.episodeId,
    frozenAt: input.frozenAt ?? new Date().toISOString(),
    frozenBy: input.frozenBy ?? "system:content-freeze",
    selectionHash: hashContentSelection(artifacts),
    artifacts,
    gateSnapshot,
    ...(input.runId === undefined ? {} : {runId: input.runId}),
  });
};

export type ContentFreezeStateUpdate = Pick<ProductionState, "phase" | "contentManifestRef">;

export const contentFreezeStateUpdateSchema = z
  .object({
    phase: z.literal("frozen"),
    contentManifestRef: artifactRefSchema,
  })
  .strict();

export const assertReferenceOnlyFreezeStateUpdate = (update: unknown): ContentFreezeStateUpdate =>
  contentFreezeStateUpdateSchema.parse(update);

const writeManifestAtomically = (filePath: string, manifest: ContentManifest): void => {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, {force: true});
  }
};

export type ContentFreezeResult = {
  manifest: ContentManifest;
  manifestRef: ArtifactRef;
  contentManifestRef: ArtifactRef;
  manifestPath: string;
  preconditions: ContentFreezePreconditionReport;
  /** The only payload intended to be merged into ProductionState/LangGraph state. */
  stateUpdate: ContentFreezeStateUpdate;
};

export const freezeContent = (
  input: ContentFreezeInput & {repoRoot: string},
): ContentFreezeResult => {
  const selectedArtifactRefs = selectedRefsFromInput(input);
  const preconditions = assertContentFreezePreconditions({
    ...input,
    selectedArtifactRefs,
  });
  const manifestPath = normalizeRepositoryPath(
    input.repoRoot,
    input.manifestPath ?? `content/${input.episodeId}/_manifest/content_manifest.json`,
  );

  for (const ref of selectedArtifactRefs.map((candidate) => artifactRefSchema.parse(candidate))) {
    if (normalizeRepositoryPath(input.repoRoot, ref.path) === manifestPath) {
      throw new Error(`content manifest path collides with selected artifact: ${ref.artifactId}`);
    }
  }

  const rubricVersions = uniqueSorted([
    ...(input.criticResults ?? []).map((result) => result.rubricVersion),
    ...(input.evaluations ?? []).map((result) => result.rubricVersion),
  ]);
  const manifest = createContentManifest({
    episodeId: input.episodeId,
    selectedArtifactRefs,
    frozenAt: input.frozenAt,
    frozenBy: input.frozenBy,
    runId: input.runId,
    gateSnapshot: {
      contentGate: "pass",
      openIssueIds: preconditions.openIssueIds,
      blockerIssueIds: preconditions.blockerIssueIds,
      majorIssueIds: preconditions.majorIssueIds,
      rubricVersions,
    },
  });

  const absoluteManifestPath = resolveRepositoryPath(input.repoRoot, manifestPath);
  writeManifestAtomically(absoluteManifestPath, manifest);

  const manifestRef = artifactRefSchema.parse(
    buildArtifactRef({
      repoRoot: input.repoRoot,
      artifactId:
        input.manifestArtifactId ??
        `${input.episodeId}:${DEFAULT_CONTENT_MANIFEST_ARTIFACT_ID_SUFFIX}`,
      episodeId: input.episodeId,
      path: manifestPath,
      mediaType: "application/json",
      schemaVersion: CONTENT_MANIFEST_SCHEMA_VERSION,
      producer: input.manifestProducer ?? DEFAULT_CONTENT_MANIFEST_PRODUCER,
      previous: input.previousManifestRef,
      createdAt: manifest.frozenAt,
    }),
  );
  const stateUpdate = assertReferenceOnlyFreezeStateUpdate({
    phase: "frozen",
    contentManifestRef: manifestRef,
  });

  return {
    manifest,
    manifestRef,
    contentManifestRef: manifestRef,
    manifestPath,
    preconditions,
    stateUpdate,
  };
};

export const freezeContentManifest = freezeContent;
