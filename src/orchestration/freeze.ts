import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  markStaleTransitively,
  registerCandidate,
  readArtifactIndex,
  selectArtifact,
  writeArtifactIndex,
} from "./artifact-registry";
import {
  artifactIndexSchema,
  type ArtifactDependency,
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
import {artifactLocatorSchema, type CriticResult} from "./schemas/critic-output";
import {assertLockedRangesPreserved} from "./human-decision";
import {humanLockedRangeSchema, type HumanLockedRange} from "./schemas/human-decision";
import {
  productionStageNames,
  type ProductionStageName,
  type ProductionIssue,
} from "./schemas/production";
import {
  unfreezeDecisionSchema,
  unfreezeEditSchema,
  unfreezeRequestSchema,
  type UnfreezeAuthorization,
  type UnfreezeBlocker,
  type UnfreezeContentGateResult,
  type UnfreezeDecision,
  type UnfreezeEdit,
  type UnfreezeRequest,
} from "./schemas/unfreeze";
import {stableJson} from "./stable-json";
import type {ProductionState} from "./state";

export const DEFAULT_CONTENT_MANIFEST_PRODUCER = "content-freeze";
export const DEFAULT_CONTENT_MANIFEST_ARTIFACT_ID_SUFFIX = "control:content-manifest";

const activeStatuses = new Set(["open", "assigned", "escalated"]);
const recognizedStatuses = new Set([
  "open",
  "assigned",
  "escalated",
  "resolved",
  "waived",
  "wontfix",
]);
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

export const lockedRangeSchema = humanLockedRangeSchema;
export type ArtifactLocator = z.infer<typeof artifactLocatorSchema>;
export type LockedRange = HumanLockedRange;
export {assertLockedRangesPreserved};

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

/**
 * Returns only caller-supplied selections. In particular, it never reads `artifactIndex.selected`
 * or derives a selection from a generic artifact collection.
 */
const selectedRefsFromInput = (input: ContentFreezeInput): ArtifactRef[] => {
  return input.selectedArtifactRefs ? [...input.selectedArtifactRefs] : [];
};

const normalizeIssueValues = (input: ContentFreezeInput): unknown[] => {
  const values: unknown[] = [];
  if (input.issues !== undefined) {
    values.push(...(Array.isArray(input.issues) ? input.issues : Object.values(input.issues)));
  }
  for (const result of input.criticResults ?? []) {
    values.push(result);
  }
  return values;
};

type NormalizedIssue = {
  id: string;
  severity: string;
  status: string;
};

type IssueNormalization = {
  issues: NormalizedIssue[];
  unrecognizedIds: string[];
};

const issueFromValue = (value: unknown, fallbackId: string): IssueNormalization => {
  if (!isRecord(value)) return {issues: [], unrecognizedIds: [fallbackId]};

  if (Array.isArray(value.issues)) {
    const byId = new Map<string, NormalizedIssue>();
    const unrecognizedIds: string[] = [];
    for (const [index, issue] of value.issues.entries()) {
      const normalized = issueFromValue(issue, `${fallbackId}-${index + 1}`);
      unrecognizedIds.push(...normalized.unrecognizedIds);
      for (const item of normalized.issues) {
        byId.set(item.id, item);
      }
    }

    // A critic result's blocker list is an explicit active-blocker declaration. Keep it
    // fail-closed even if a malformed result also marks the corresponding issue resolved.
    if (Array.isArray(value.blockers)) {
      for (const [index, blocker] of value.blockers.entries()) {
        if (typeof blocker !== "string" || blocker.length === 0) {
          unrecognizedIds.push(`${fallbackId}-blocker-${index + 1}`);
          continue;
        }
        byId.set(blocker, {id: blocker, severity: "blocker", status: "open"});
      }
    }
    return {issues: [...byId.values()], unrecognizedIds};
  }

  const rawId = value.id ?? value.issueId;
  const id = typeof rawId === "string" && rawId.length > 0 ? rawId : fallbackId;
  const severity = typeof value.severity === "string" ? value.severity : "";
  const status = typeof value.status === "string" ? value.status : "";
  const unrecognizedIds = [
    ...(typeof rawId === "string" && rawId.length > 0 ? [] : [id]),
    ...(severityRank[severity] === undefined ? [id] : []),
    ...(recognizedStatuses.has(status) ? [] : [id]),
  ];
  const valid = unrecognizedIds.length === 0;
  return {
    issues: [
      {
        id,
        severity: valid ? severity : "blocker",
        status: valid ? status : "open",
      },
    ],
    unrecognizedIds,
  };
};

const normalizedIssues = (
  input: ContentFreezeInput,
): {issues: NormalizedIssue[]; unrecognizedIds: string[]} => {
  const byId = new Map<string, NormalizedIssue>();
  const unrecognizedIds: string[] = [];
  for (const [index, value] of normalizeIssueValues(input).entries()) {
    const normalized = issueFromValue(value, `freeze-issue-${index + 1}`);
    unrecognizedIds.push(...normalized.unrecognizedIds);
    for (const issue of normalized.issues) {
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
  return {
    issues: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    unrecognizedIds: uniqueSorted(unrecognizedIds),
  };
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
  issues?: readonly ContentFreezeIssue[] | Readonly<Record<string, ContentFreezeIssue>>;
  criticResults?: readonly Pick<CriticResult, "issues" | "blockers" | "rubricVersion">[];
  frozenAt?: string;
  frozenBy?: string;
  approvalEpoch?: number;
  runId?: string;
  manifestPath?: string;
  manifestArtifactId?: string;
  manifestProducer?: string;
  previousManifestRef?: ArtifactRef;
  /** Defaults to true when a repository root is supplied. */
  verifyArtifactBytes?: boolean;
  /** Optional rubric snapshot supplied by an external content-gate runner. */
  rubricVersions?: readonly string[];
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
  unrecognizedIssueIds: string[];
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
    if (report.unrecognizedIssueIds.length > 0) {
      reasons.push(`FREEZE_UNRECOGNIZED_ISSUES:${report.unrecognizedIssueIds.join(",")}`);
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

  const normalized = normalizedIssues(input);
  const issues = normalized.issues;
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
      normalized.unrecognizedIds.length === 0 &&
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
    unrecognizedIssueIds: normalized.unrecognizedIds,
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

export type CreateContentManifestInput = {
  episodeId: string;
  selectedArtifactRefs: readonly ArtifactRef[];
  frozenAt?: string;
  frozenBy?: string;
  approvalEpoch?: number;
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
    approvalEpoch: input.approvalEpoch ?? 0,
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
    ...(input.rubricVersions ?? []),
  ]);
  const manifest = createContentManifest({
    episodeId: input.episodeId,
    selectedArtifactRefs,
    frozenAt: input.frozenAt,
    frozenBy: input.frozenBy,
    approvalEpoch: input.approvalEpoch,
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

export type CreateUnfreezeRequestInput = {
  repoRoot: string;
  episodeId: string;
  runId: string;
  contentManifestRef: ArtifactRef;
  issues: readonly ProductionIssue[];
  authorizedEdits: readonly UnfreezeAuthorization[];
  restartAt: ProductionStageName;
  approvalEpoch: number;
  unfreezeUsed: number;
  maxUnfreeze: number;
  requestedAt?: string;
  requestId?: string;
};

export type CreateUnfreezeRequestResult = {
  request: UnfreezeRequest;
  requestRef: ArtifactRef;
  artifactIndex: ArtifactIndex;
};

export type PersistUnfreezeDecisionInput = {
  repoRoot: string;
  request: UnfreezeRequest;
  requestRef: ArtifactRef;
  decision: "approve" | "reject";
  actorId: string;
  authorizations?: readonly {artifactId: string; owner: UnfreezeAuthorization["owner"]}[];
  reason: string;
  decidedAt?: string;
};

export type PersistUnfreezeDecisionResult = {
  decision: UnfreezeDecision;
  decisionRef: ArtifactRef;
  artifactIndex: ArtifactIndex;
};

export type ApplyUnfreezeEditsInput = {
  repoRoot: string;
  request: UnfreezeRequest;
  decision: UnfreezeDecision;
  edits: readonly UnfreezeEdit[];
  artifactIndex?: ArtifactIndex;
  executionId: string;
};

export type ApplyUnfreezeEditsResult = {
  artifactIndex: ArtifactIndex;
  changedArtifactRefs: ArtifactRef[];
  staleArtifactIds: string[];
};

export type RefreezeAfterUnfreezeInput = {
  repoRoot: string;
  request: UnfreezeRequest;
  decision: UnfreezeDecision;
  validation: UnfreezeContentGateResult;
  runId: string;
  approvalEpoch: number;
  previousManifestRef: ArtifactRef;
  frozenAt?: string;
  frozenBy?: string;
};

export type RefreezeAfterUnfreezeResult = ContentFreezeResult & {
  artifactIndex: ArtifactIndex;
};

const unfreezeRegistryPath = (repoRoot: string, episodeId: string): string =>
  path.resolve(repoRoot, `content/${episodeId}/artifact-index.json`);

const unfreezeRequestPath = (episodeId: string, requestId: string): string =>
  `content/${episodeId}/production/unfreeze-requests/${requestId}.json`;

const unfreezeDecisionPath = (episodeId: string, requestId: string, decisionId: string): string =>
  `content/${episodeId}/production/unfreeze-requests/${requestId}/${decisionId}.json`;

const writeJsonAtomically = (filePath: string, value: unknown): void => {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, {force: true});
  }
};

const readJsonArtifact = <T>(
  repoRoot: string,
  ref: ArtifactRef,
  parser: (value: unknown) => T,
): T => {
  const bytes = fs.readFileSync(resolveRepositoryPath(repoRoot, ref.path));
  if (bytes.byteLength !== ref.sizeBytes || sha256Bytes(bytes) !== ref.sha256) {
    throw new Error(`UNFREEZE_ARTIFACT_HASH_MISMATCH:${ref.artifactId}`);
  }
  return parser(JSON.parse(bytes.toString("utf8")) as unknown);
};

const assertCurrentArtifactBytes = (repoRoot: string, ref: ArtifactRef, code: string): void => {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(resolveRepositoryPath(repoRoot, ref.path));
  } catch (error) {
    throw new Error(`${code}:${ref.artifactId}`, {cause: error});
  }
  if (bytes.byteLength !== ref.sizeBytes || sha256Bytes(bytes) !== ref.sha256) {
    throw new Error(`${code}:${ref.artifactId}`);
  }
};

const contentManifestFromRef = (repoRoot: string, ref: ArtifactRef): ContentManifest =>
  readJsonArtifact(repoRoot, ref, (value) => contentManifestSchema.parse(value));

const dependencyFromRef = (
  ref: ArtifactRef,
  relation: ArtifactDependency["relation"],
): ArtifactDependency => ({
  artifactId: ref.artifactId,
  path: ref.path,
  sha256: ref.sha256,
  relation,
});

const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();

const stageIndexFor = (stage: ProductionStageName): number => productionStageNames.indexOf(stage);

/**
 * Any content artifact in the frozen manifest is an input to materialization. A content
 * unfreeze therefore always restarts at the first production stage; it never resumes from
 * a later stage using a manifest whose selection hash has changed.
 */
export const minimumProductionRestartAtForUnfreeze = (): ProductionStageName => "materialize:story";

const assertMinimumProductionRestart = (restartAt: ProductionStageName): void => {
  if (stageIndexFor(restartAt) > stageIndexFor(minimumProductionRestartAtForUnfreeze())) {
    throw new Error(`UNFREEZE_RESTART_NOT_MINIMAL:${restartAt}`);
  }
};

const assertManifestAuthorization = (
  repoRoot: string,
  manifest: ContentManifest,
  authorizations: readonly UnfreezeAuthorization[],
): void => {
  const manifestById = new Map(manifest.artifacts.map((ref) => [ref.artifactId, ref]));
  for (const authorization of authorizations) {
    const frozen = manifestById.get(authorization.artifactRef.artifactId);
    if (
      !frozen ||
      frozen.sha256 !== authorization.artifactRef.sha256 ||
      frozen.revision !== authorization.artifactRef.revision ||
      frozen.path !== authorization.artifactRef.path
    ) {
      throw new Error(
        `UNFREEZE_ARTIFACT_NOT_IN_FROZEN_MANIFEST:${authorization.artifactRef.artifactId}`,
      );
    }
    assertCurrentArtifactBytes(
      repoRoot,
      authorization.artifactRef,
      "UNFREEZE_FROZEN_ARTIFACT_HASH_MISMATCH",
    );
  }
};

const blockerForIssue = (issue: ProductionIssue): UnfreezeBlocker => {
  if (issue.severity !== "blocker" || issue.status !== "open") {
    throw new Error(`UNFREEZE_BLOCKER_REQUIRED:${issue.issueId}`);
  }
  if (!issue.category.startsWith("delivery.")) {
    throw new Error(`UNFREEZE_PRODUCTION_ISSUE_REQUIRED:${issue.issueId}`);
  }
  return {
    issueId: issue.issueId,
    issueRef: artifactRefSchema.parse(issue.issueRef),
    category: issue.category,
    severity: "blocker",
    status: "open",
    ownerAgent: "production-executor",
    routeTarget: issue.routeTarget,
    affectedArtifactId: issue.affectedArtifact.artifactId,
    affectedArtifactSha256: issue.affectedArtifact.sha256,
    locator: artifactLocatorSchema.parse(issue.locator),
    summary: issue.summary,
  };
};

export const assertUnfreezeRequestEligible = (input: {
  repoRoot: string;
  contentManifest: ContentManifest;
  issues: readonly ProductionIssue[];
  authorizedEdits: readonly UnfreezeAuthorization[];
  restartAt: ProductionStageName;
  unfreezeUsed: number;
  maxUnfreeze: number;
}): {blockerIssues: UnfreezeBlocker[]; authorizedEdits: UnfreezeAuthorization[]} => {
  if (!Number.isInteger(input.unfreezeUsed) || input.unfreezeUsed < 0) {
    throw new Error("UNFREEZE_COUNTER_INVALID");
  }
  if (!Number.isInteger(input.maxUnfreeze) || input.maxUnfreeze < 0) {
    throw new Error("UNFREEZE_MAX_INVALID");
  }
  if (input.unfreezeUsed >= input.maxUnfreeze) {
    throw new Error("UNFREEZE_BUDGET_EXHAUSTED");
  }
  assertMinimumProductionRestart(input.restartAt);
  if (input.issues.length === 0) throw new Error("UNFREEZE_BLOCKER_REQUIRED");
  const blockerIssues = input.issues.map(blockerForIssue);
  const authorizedEdits = input.authorizedEdits.map((authorization) =>
    unfreezeRequestSchema.shape.authorizedEdits.element.parse(authorization),
  );
  assertManifestAuthorization(input.repoRoot, input.contentManifest, authorizedEdits);
  return {blockerIssues, authorizedEdits};
};

const defaultUnfreezeRequestId = (input: {
  episodeId: string;
  approvalEpoch: number;
  contentManifestRef: ArtifactRef;
  issues: readonly ProductionIssue[];
  authorizedEdits: readonly UnfreezeAuthorization[];
}): string =>
  `unfreeze-${createHash("sha256")
    .update(
      stableJson({
        approvalEpoch: input.approvalEpoch,
        artifactIds: input.authorizedEdits
          .map((authorization) => authorization.artifactRef.artifactId)
          .sort(),
        episodeId: input.episodeId,
        issueIds: input.issues.map((issue) => issue.issueId).sort(),
        manifestSha256: input.contentManifestRef.sha256,
      }),
    )
    .digest("hex")
    .slice(0, 24)}`;

const addAuditArtifact = (input: {
  repoRoot: string;
  episodeId: string;
  index: ArtifactIndex;
  ref: ArtifactRef;
  executionId: string;
  dependencies: readonly ArtifactDependency[];
}): ArtifactIndex => {
  let index = registerCandidate(input.index, input.ref, input.executionId, [...input.dependencies]);
  index = selectArtifact(index, input.ref);
  writeArtifactIndex(unfreezeRegistryPath(input.repoRoot, input.episodeId), index);
  return index;
};

const seedManifestArtifacts = (input: {
  repoRoot: string;
  manifest: ContentManifest;
  manifestRef: ArtifactRef;
  index?: ArtifactIndex;
}): ArtifactIndex => {
  let index = artifactIndexSchema.parse(
    input.index ?? emptyArtifactIndex(input.manifest.episodeId),
  );
  if (index.episodeId !== input.manifest.episodeId) {
    throw new Error("UNFREEZE_ARTIFACT_INDEX_EPISODE_MISMATCH");
  }
  const refs = [input.manifestRef, ...input.manifest.artifacts];
  for (const ref of refs) {
    const existing = index.artifacts.find(
      (record) =>
        record.ref.artifactId === ref.artifactId &&
        record.ref.revision === ref.revision &&
        record.ref.sha256 === ref.sha256,
    );
    if (existing) continue;
    index = registerCandidate(
      index,
      ref,
      `unfreeze:seed:${ref.artifactId}`,
      ref.artifactId === input.manifestRef.artifactId
        ? input.manifest.artifacts.map((artifact) => dependencyFromRef(artifact, "reads"))
        : [],
    );
    index = selectArtifact(index, ref);
  }
  writeArtifactIndex(unfreezeRegistryPath(input.repoRoot, input.manifest.episodeId), index);
  return index;
};

export const createUnfreezeRequest = (
  input: CreateUnfreezeRequestInput,
): CreateUnfreezeRequestResult => {
  const contentManifestRef = artifactRefSchema.parse(input.contentManifestRef);
  if (contentManifestRef.episodeId !== input.episodeId) {
    throw new Error("UNFREEZE_MANIFEST_EPISODE_MISMATCH");
  }
  const contentManifest = contentManifestFromRef(input.repoRoot, contentManifestRef);
  if (contentManifest.episodeId !== input.episodeId) {
    throw new Error("UNFREEZE_MANIFEST_EPISODE_MISMATCH");
  }
  if ((contentManifest.approvalEpoch ?? 0) !== input.approvalEpoch) {
    throw new Error("UNFREEZE_APPROVAL_EPOCH_MISMATCH");
  }
  const eligible = assertUnfreezeRequestEligible({
    repoRoot: input.repoRoot,
    contentManifest,
    issues: input.issues,
    authorizedEdits: input.authorizedEdits,
    restartAt: input.restartAt,
    unfreezeUsed: input.unfreezeUsed,
    maxUnfreeze: input.maxUnfreeze,
  });
  const requestId =
    input.requestId ??
    defaultUnfreezeRequestId({
      episodeId: input.episodeId,
      approvalEpoch: input.approvalEpoch,
      contentManifestRef,
      issues: input.issues,
      authorizedEdits: input.authorizedEdits,
    });
  const request = unfreezeRequestSchema.parse({
    schemaVersion: "unfreeze-request-v1",
    requestId,
    episodeId: input.episodeId,
    runId: input.runId,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    requestedBy: "production-executor",
    approvalEpoch: input.approvalEpoch,
    contentManifestRef,
    blockerIssues: eligible.blockerIssues,
    authorizedEdits: eligible.authorizedEdits,
    restartAt: input.restartAt,
    unfreezeUsed: input.unfreezeUsed,
    maxUnfreeze: input.maxUnfreeze,
    forbiddenAutomaticActions: [
      "production must not edit story, fact, or content artifacts",
      "production must not modify an artifact outside authorizedEdits",
      "production must not continue before an approved unfreeze decision",
    ],
  });
  const requestPath = unfreezeRequestPath(input.episodeId, request.requestId);
  const absoluteRequestPath = resolveRepositoryPath(input.repoRoot, requestPath);
  writeJsonAtomically(absoluteRequestPath, request);
  const requestRef = artifactRefSchema.parse(
    buildArtifactRef({
      repoRoot: input.repoRoot,
      artifactId: `${input.episodeId}:production:unfreeze-request-${request.requestId.replace(/^unfreeze-/u, "")}`,
      episodeId: input.episodeId,
      path: requestPath,
      mediaType: "application/json",
      schemaVersion: "unfreeze-request-v1",
      producer: "production-unfreeze-gate",
      createdAt: request.requestedAt,
    }),
  );
  const registryPath = unfreezeRegistryPath(input.repoRoot, input.episodeId);
  let index = seedManifestArtifacts({
    repoRoot: input.repoRoot,
    manifest: contentManifest,
    manifestRef: contentManifestRef,
    index: fs.existsSync(registryPath) ? readArtifactIndex(registryPath) : undefined,
  });
  index = addAuditArtifact({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    index,
    ref: requestRef,
    executionId: `${input.runId}:unfreeze-request`,
    dependencies: [
      dependencyFromRef(contentManifestRef, "reads"),
      ...eligible.blockerIssues.map((issue) => dependencyFromRef(issue.issueRef, "reviews")),
      ...eligible.authorizedEdits.map((authorization) =>
        dependencyFromRef(authorization.artifactRef, "reads"),
      ),
    ],
  });
  return {request, requestRef, artifactIndex: index};
};

export const readUnfreezeRequest = (repoRoot: string, requestRef: ArtifactRef): UnfreezeRequest =>
  readJsonArtifact(repoRoot, artifactRefSchema.parse(requestRef), (value) =>
    unfreezeRequestSchema.parse(value),
  );

export const assertUnfreezeDecisionMatchesRequest = (
  request: UnfreezeRequest,
  decision: UnfreezeDecision,
): void => {
  const parsedRequest = unfreezeRequestSchema.parse(request);
  const parsedDecision = unfreezeDecisionSchema.parse(decision);
  if (
    parsedDecision.requestId !== parsedRequest.requestId ||
    parsedDecision.episodeId !== parsedRequest.episodeId ||
    parsedDecision.requestedApprovalEpoch !== parsedRequest.approvalEpoch ||
    parsedDecision.requestRef.artifactId !==
      `${parsedRequest.episodeId}:production:unfreeze-request-${parsedRequest.requestId.replace(/^unfreeze-/u, "")}`
  ) {
    throw new Error("UNFREEZE_AUTHORIZATION_MISMATCH");
  }
  if (parsedDecision.decision === "reject") return;

  const requested = new Map(
    parsedRequest.authorizedEdits.map((authorization) => [
      authorization.artifactRef.artifactId,
      authorization.owner,
    ]),
  );
  for (const authorization of parsedDecision.authorizations) {
    const requestedOwner = requested.get(authorization.artifactId);
    if (!requestedOwner || requestedOwner !== authorization.owner) {
      throw new Error(`UNFREEZE_AUTHORIZATION_MISMATCH:${authorization.artifactId}`);
    }
  }
};

const decisionIdFor = (input: {
  requestId: string;
  decision: "approve" | "reject";
  actorId: string;
  authorizations: readonly {artifactId: string; owner: UnfreezeAuthorization["owner"]}[];
  decidedAt: string;
}): string =>
  `unfreeze-decision-${createHash("sha256").update(stableJson(input)).digest("hex").slice(0, 24)}`;

export const persistUnfreezeDecision = (
  input: PersistUnfreezeDecisionInput,
): PersistUnfreezeDecisionResult => {
  const request = unfreezeRequestSchema.parse(input.request);
  const requestRef = artifactRefSchema.parse(input.requestRef);
  const persistedRequest = readUnfreezeRequest(input.repoRoot, requestRef);
  if (stableJson(persistedRequest) !== stableJson(request)) {
    throw new Error("UNFREEZE_AUTHORIZATION_MISMATCH");
  }
  const authorizations = [...(input.authorizations ?? [])].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  const decision = unfreezeDecisionSchema.parse({
    schemaVersion: "unfreeze-decision-v1",
    decisionId: decisionIdFor({
      requestId: request.requestId,
      decision: input.decision,
      actorId: input.actorId,
      authorizations,
      decidedAt,
    }),
    requestId: request.requestId,
    requestRef,
    episodeId: request.episodeId,
    requestedApprovalEpoch: request.approvalEpoch,
    decision: input.decision,
    actorId: input.actorId,
    decidedAt,
    authorizations,
    reason: input.reason,
  });
  assertUnfreezeDecisionMatchesRequest(request, decision);
  const decisionPath = unfreezeDecisionPath(
    request.episodeId,
    request.requestId,
    decision.decisionId,
  );
  writeJsonAtomically(resolveRepositoryPath(input.repoRoot, decisionPath), decision);
  const decisionRef = artifactRefSchema.parse(
    buildArtifactRef({
      repoRoot: input.repoRoot,
      artifactId: `${request.episodeId}:production:${decision.decisionId}`,
      episodeId: request.episodeId,
      path: decisionPath,
      mediaType: "application/json",
      schemaVersion: "unfreeze-decision-v1",
      producer: "human:unfreeze-decision",
      createdAt: decision.decidedAt,
    }),
  );
  const registryPath = unfreezeRegistryPath(input.repoRoot, request.episodeId);
  const index = fs.existsSync(registryPath)
    ? readArtifactIndex(registryPath)
    : emptyArtifactIndex(request.episodeId);
  const artifactIndex = addAuditArtifact({
    repoRoot: input.repoRoot,
    episodeId: request.episodeId,
    index,
    ref: decisionRef,
    executionId: `${request.runId}:unfreeze-decision`,
    dependencies: [dependencyFromRef(requestRef, "reads")],
  });
  return {decision, decisionRef, artifactIndex};
};

export const readUnfreezeDecision = (
  repoRoot: string,
  decisionRef: ArtifactRef,
): UnfreezeDecision =>
  readJsonArtifact(repoRoot, artifactRefSchema.parse(decisionRef), (value) =>
    unfreezeDecisionSchema.parse(value),
  );

const selectedRecordFor = (index: ArtifactIndex, ref: ArtifactRef): ArtifactRecord | undefined => {
  const pointer = index.selected[ref.artifactId];
  return index.artifacts.find(
    (record) =>
      record.state === "selected" &&
      record.ref.artifactId === ref.artifactId &&
      record.ref.revision === ref.revision &&
      record.ref.sha256 === ref.sha256 &&
      record.ref.path === ref.path &&
      pointer?.revision === ref.revision &&
      pointer.sha256 === ref.sha256 &&
      pointer.path === ref.path,
  );
};

export const applyUnfreezeEdits = (input: ApplyUnfreezeEditsInput): ApplyUnfreezeEditsResult => {
  const request = unfreezeRequestSchema.parse(input.request);
  const decision = unfreezeDecisionSchema.parse(input.decision);
  assertUnfreezeDecisionMatchesRequest(request, decision);
  if (decision.decision !== "approve") throw new Error("UNFREEZE_DECISION_NOT_APPROVED");
  if (input.edits.length === 0) throw new Error("UNFREEZE_NO_EDIT");

  const registryPath = unfreezeRegistryPath(input.repoRoot, request.episodeId);
  let index = artifactIndexSchema.parse(
    input.artifactIndex ??
      (fs.existsSync(registryPath)
        ? readArtifactIndex(registryPath)
        : emptyArtifactIndex(request.episodeId)),
  );
  const authorizations = new Map(
    request.authorizedEdits.map((authorization) => [
      authorization.artifactRef.artifactId,
      authorization,
    ]),
  );
  const approved = new Map(
    decision.authorizations.map((authorization) => [authorization.artifactId, authorization.owner]),
  );
  const seen = new Set<string>();
  const changedArtifactRefs: ArtifactRef[] = [];

  for (const rawEdit of input.edits) {
    const edit = unfreezeEditSchema.parse(rawEdit);
    if (seen.has(edit.artifactId)) throw new Error(`UNFREEZE_DUPLICATE_EDIT:${edit.artifactId}`);
    seen.add(edit.artifactId);
    const authorization = authorizations.get(edit.artifactId);
    if (!authorization || approved.get(edit.artifactId) !== edit.owner) {
      throw new Error(`UNFREEZE_AUTHORIZATION_MISMATCH:${edit.artifactId}`);
    }
    if (
      edit.before.artifactId !== authorization.artifactRef.artifactId ||
      edit.before.sha256 !== authorization.artifactRef.sha256 ||
      edit.before.revision !== authorization.artifactRef.revision ||
      edit.before.path !== authorization.artifactRef.path
    ) {
      throw new Error(`UNFREEZE_BEFORE_REF_MISMATCH:${edit.artifactId}`);
    }
    if (
      edit.after.artifactId !== edit.artifactId ||
      edit.after.episodeId !== request.episodeId ||
      edit.after.sha256 === edit.before.sha256 ||
      edit.after.revision <= edit.before.revision
    ) {
      throw new Error(`UNFREEZE_EDIT_NOT_NEW:${edit.artifactId}`);
    }
    if (
      !edit.after.path.startsWith(`content/${request.episodeId}/`) ||
      edit.after.path.includes("/production/")
    ) {
      throw new Error(`UNFREEZE_CONTENT_ARTIFACT_REQUIRED:${edit.artifactId}`);
    }
    assertCurrentArtifactBytes(input.repoRoot, edit.after, "UNFREEZE_AFTER_HASH_MISMATCH");
    const previous = selectedRecordFor(index, edit.before);
    if (!previous) throw new Error(`UNFREEZE_BEFORE_NOT_SELECTED:${edit.artifactId}`);
    changedArtifactRefs.push(edit.after);
  }

  for (const artifactId of approved.keys()) {
    if (!seen.has(artifactId)) throw new Error(`UNFREEZE_APPROVED_SCOPE_NOT_EDITED:${artifactId}`);
  }

  const changedIds = changedArtifactRefs.map((ref) => ref.artifactId);
  index = markStaleTransitively(index, changedIds);
  for (const ref of changedArtifactRefs) {
    const previous = input.artifactIndex
      ? input.artifactIndex.artifacts.find(
          (record) =>
            record.ref.artifactId === ref.artifactId &&
            record.ref.revision ===
              request.authorizedEdits.find((item) => item.artifactRef.artifactId === ref.artifactId)
                ?.artifactRef.revision,
        )
      : undefined;
    const previousSelected =
      previous ?? index.artifacts.find((record) => record.ref.artifactId === ref.artifactId);
    const dependencies = previousSelected?.dependencies ?? [];
    index = registerCandidate(index, ref, input.executionId, dependencies);
    index = selectArtifact(index, ref);
  }
  const staleArtifactIds = sortedUnique(
    index.artifacts
      .filter((record) => record.state === "stale")
      .map((record) => record.ref.artifactId),
  );
  writeArtifactIndex(registryPath, index);
  return {artifactIndex: index, changedArtifactRefs, staleArtifactIds};
};

export const refreezeAfterUnfreeze = (
  input: RefreezeAfterUnfreezeInput,
): RefreezeAfterUnfreezeResult => {
  const request = unfreezeRequestSchema.parse(input.request);
  const decision = unfreezeDecisionSchema.parse(input.decision);
  assertUnfreezeDecisionMatchesRequest(request, decision);
  if (decision.decision !== "approve") throw new Error("UNFREEZE_DECISION_NOT_APPROVED");
  if (input.approvalEpoch <= request.approvalEpoch) {
    throw new Error("UNFREEZE_APPROVAL_EPOCH_NOT_ADVANCED");
  }
  const validation = input.validation;
  if (validation.gate !== "pass") throw new Error("UNFREEZE_CONTENT_GATE_FAILED");
  if (validation.artifactIndex.episodeId !== request.episodeId) {
    throw new Error("UNFREEZE_VALIDATION_INDEX_EPISODE_MISMATCH");
  }
  const approvedIds = new Set(
    decision.authorizations.map((authorization) => authorization.artifactId),
  );
  const selectedById = new Map(
    validation.selectedArtifactRefs.map((ref) => [ref.artifactId, artifactRefSchema.parse(ref)]),
  );
  for (const artifactId of approvedIds) {
    if (!selectedById.has(artifactId)) throw new Error(`UNFREEZE_EDIT_NOT_SELECTED:${artifactId}`);
  }
  const freeze = freezeContent({
    repoRoot: input.repoRoot,
    episodeId: request.episodeId,
    // A refreeze must preserve the byte identity of the previous manifest referenced by
    // earlier execution events. The initial freeze keeps the canonical filename; subsequent
    // approval epochs get immutable manifest paths so historical hashes remain verifiable.
    manifestPath: `content/${request.episodeId}/_manifest/content_manifest.r${input.approvalEpoch}.json`,
    artifactIndex: validation.artifactIndex,
    selectedArtifactRefs: validation.selectedArtifactRefs,
    issues: validation.issues,
    rubricVersions: validation.rubricVersions,
    frozenAt: input.frozenAt,
    frozenBy: input.frozenBy ?? `human-unfreeze:${decision.actorId}`,
    approvalEpoch: input.approvalEpoch,
    runId: input.runId,
    previousManifestRef: input.previousManifestRef,
  });

  const registryPath = unfreezeRegistryPath(input.repoRoot, request.episodeId);
  let artifactIndex = validation.artifactIndex;
  artifactIndex = registerCandidate(
    artifactIndex,
    freeze.manifestRef,
    `${input.runId}:unfreeze-refreeze`,
    validation.selectedArtifactRefs.map((ref) => dependencyFromRef(ref, "reads")),
  );
  artifactIndex = selectArtifact(artifactIndex, freeze.manifestRef);
  writeArtifactIndex(registryPath, artifactIndex);
  return {...freeze, artifactIndex};
};
