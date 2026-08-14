import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  markStaleTransitively,
  readArtifactIndex,
  registerCandidate,
  selectArtifact,
  writeArtifactIndex,
} from "./artifact-registry";
import {
  artifactDependencySchema,
  artifactIndexSchema,
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRecord,
  type ArtifactRef,
} from "./schemas/artifact";
import {
  humanDecisionSchema,
  humanIssueArtifactSchema,
  humanLockedRangeSchema,
  type HumanDecision,
  type HumanDecisionEdit,
  type HumanIssueArtifact,
  type HumanLockedRange,
} from "./schemas/human-decision";
import {artifactLocatorSchema} from "./schemas/critic-output";
type ArtifactLocator = z.infer<typeof artifactLocatorSchema>;
import {
  selectPrimaryRoute,
  type PrimaryRoute,
  type RouteSelection,
  type RoutingIssue,
} from "./routing";
import {stableJson, stableJsonEqual} from "./stable-json";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const repositoryPath = (repoRoot: string, repositoryRelativePath: string): string => {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, repositoryRelativePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`HUMAN_DECISION_PATH_ESCAPES_REPOSITORY:${repositoryRelativePath}`);
  }
  return absolute;
};

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

const readHashBoundJson = <T>(
  repoRoot: string,
  ref: ArtifactRef,
  parse: (value: unknown) => T,
): T => {
  const bytes = fs.readFileSync(repositoryPath(repoRoot, ref.path));
  if (bytes.byteLength !== ref.sizeBytes || sha256(bytes) !== ref.sha256) {
    throw new Error(`HUMAN_DECISION_ARTIFACT_HASH_MISMATCH:${ref.artifactId}`);
  }
  return parse(JSON.parse(bytes.toString("utf8")) as unknown);
};

const assertCurrentBytes = (repoRoot: string, ref: ArtifactRef, code: string): void => {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(repositoryPath(repoRoot, ref.path));
  } catch (error) {
    throw new Error(`${code}:${ref.artifactId}`, {cause: error});
  }
  if (bytes.byteLength !== ref.sizeBytes || sha256(bytes) !== ref.sha256) {
    throw new Error(`${code}:${ref.artifactId}`);
  }
};

const registryPath = (repoRoot: string, episodeId: string): string =>
  repositoryPath(repoRoot, `content/${episodeId}/artifact-index.json`);

const readOrCreateIndex = (
  repoRoot: string,
  episodeId: string,
  supplied?: ArtifactIndex,
): ArtifactIndex => {
  if (supplied) return artifactIndexSchema.parse(supplied);
  const filePath = registryPath(repoRoot, episodeId);
  return fs.existsSync(filePath)
    ? artifactIndexSchema.parse(readArtifactIndex(filePath))
    : emptyArtifactIndex(episodeId);
};

const dependencyFromRef = (
  ref: ArtifactRef,
  relation: ArtifactDependency["relation"] = "reads",
): ArtifactDependency =>
  artifactDependencySchema.parse({
    artifactId: ref.artifactId,
    path: ref.path,
    sha256: ref.sha256,
    relation,
  });

const selectedRecord = (index: ArtifactIndex, ref: ArtifactRef): ArtifactRecord | undefined => {
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

const addSelectedArtifact = (input: {
  index: ArtifactIndex;
  ref: ArtifactRef;
  executionId: string;
  dependencies?: readonly ArtifactDependency[];
}): ArtifactIndex => {
  const index = registerCandidate(input.index, input.ref, input.executionId, [
    ...(input.dependencies ?? []),
  ]);
  return selectArtifact(index, input.ref);
};

/**
 * Makes the state-provided explicit refs available to the local registry. It never resolves a
 * mutable latest pointer in place of a caller-supplied ref.
 */
export const ensureArtifactIndexForRefs = (input: {
  repoRoot: string;
  episodeId: string;
  refs: readonly ArtifactRef[];
  artifactIndex?: ArtifactIndex;
  executionId?: string;
}): ArtifactIndex => {
  let index = readOrCreateIndex(input.repoRoot, input.episodeId, input.artifactIndex);
  for (const ref of input.refs.map((value) => artifactRefSchema.parse(value))) {
    if (ref.episodeId !== input.episodeId) throw new Error("HUMAN_DECISION_EPISODE_MISMATCH");
    if (selectedRecord(index, ref)) continue;
    const previous = index.artifacts
      .filter((record) => record.ref.artifactId === ref.artifactId && record.state === "selected")
      .sort((left, right) => right.ref.revision - left.ref.revision)[0];
    if (previous && ref.revision <= previous.ref.revision) {
      throw new Error(`HUMAN_DECISION_REF_NOT_CURRENT:${ref.artifactId}`);
    }
    if (previous) index = markStaleTransitively(index, [ref.artifactId]);
    index = addSelectedArtifact({
      index,
      ref,
      executionId: input.executionId ?? `human:seed:${ref.artifactId}`,
      dependencies: previous?.dependencies,
    });
  }
  writeArtifactIndex(registryPath(input.repoRoot, input.episodeId), index);
  return index;
};

const safeSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "decision";

const identitySuffix = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 12);

const decisionArtifactPath = (episodeId: string, decisionId: string): string =>
  `content/${episodeId}/production/human-decisions/${safeSlug(decisionId)}-${identitySuffix(decisionId)}.json`;

const decisionArtifactId = (episodeId: string, decisionId: string): string =>
  `${episodeId}:production:human-decision-${safeSlug(decisionId)}-${identitySuffix(decisionId)}`;

export type PersistHumanDecisionInput = {
  repoRoot: string;
  decision: HumanDecision;
  artifactIndex?: ArtifactIndex;
  executionId?: string;
};

export type PersistHumanDecisionResult = {
  decision: HumanDecision;
  decisionRef: ArtifactRef;
  artifactIndex: ArtifactIndex;
};

const normalizedDecision = (input: HumanDecision): HumanDecision => {
  const parsed = humanDecisionSchema.parse(input);
  return humanDecisionSchema.parse({
    ...parsed,
    edits: parsed.edits.map((edit) => ({
      ...edit,
      provenance: edit.provenance ?? {
        source: "human" as const,
        reviewer: parsed.reviewer,
        decisionId: parsed.decisionId,
        timestamp: parsed.timestamp,
        approvalEpoch: parsed.approvalEpoch,
      },
    })),
  });
};

/** Persists one immutable, hash-bound HumanDecision and safely replays the same decisionId. */
export const persistHumanDecision = (
  input: PersistHumanDecisionInput,
): PersistHumanDecisionResult => {
  const decision = normalizedDecision(input.decision);
  const decisionPath = decisionArtifactPath(
    decision.artifactRefs[0]!.episodeId,
    decision.decisionId,
  );
  const absolutePath = repositoryPath(input.repoRoot, decisionPath);
  if (fs.existsSync(absolutePath)) {
    const existing = humanDecisionSchema.parse(
      JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown,
    );
    if (!stableJsonEqual(existing, decision)) {
      throw new Error(`HUMAN_DECISION_ID_COLLISION:${decision.decisionId}`);
    }
  } else {
    writeJsonAtomically(absolutePath, decision);
  }
  const decisionRef = artifactRefSchema.parse(
    buildArtifactRef({
      repoRoot: input.repoRoot,
      artifactId: decisionArtifactId(decision.artifactRefs[0]!.episodeId, decision.decisionId),
      episodeId: decision.artifactRefs[0]!.episodeId,
      path: decisionPath,
      mediaType: "application/json",
      schemaVersion: "human-decision-v1",
      producer: `human:${decision.reviewer}`,
      createdAt: decision.timestamp,
    }),
  );
  let index = readOrCreateIndex(input.repoRoot, decisionRef.episodeId, input.artifactIndex);
  index = addSelectedArtifact({
    index,
    ref: decisionRef,
    executionId: input.executionId ?? `human-decision:${decision.decisionId}`,
    dependencies: decision.artifactRefs.map((ref) => dependencyFromRef(ref)),
  });
  writeArtifactIndex(registryPath(input.repoRoot, decisionRef.episodeId), index);
  return {decision, decisionRef, artifactIndex: index};
};

export const readHumanDecision = (repoRoot: string, decisionRef: ArtifactRef): HumanDecision =>
  readHashBoundJson(repoRoot, artifactRefSchema.parse(decisionRef), (value) =>
    humanDecisionSchema.parse(value),
  );

const locatorOverlaps = (left: ArtifactLocator, right: ArtifactLocator): boolean => {
  if (left.kind === "whole-artifact" || right.kind === "whole-artifact") return true;
  if (left.kind !== right.kind) return false;
  if (left.kind === "line-range") {
    const parse = (value: string): readonly [number, number] => {
      const match = /^(\d+)(?:\s*[-:]\s*(\d+))?$/u.exec(value.trim());
      if (!match) throw new Error(`LOCKED_RANGE_LINE_LOCATOR_INVALID:${value}`);
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      if (start <= 0 || end < start) throw new Error(`LOCKED_RANGE_LINE_LOCATOR_INVALID:${value}`);
      return [start, end];
    };
    const [leftStart, leftEnd] = parse(left.value);
    const [rightStart, rightEnd] = parse(right.value);
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }
  if (left.kind === "json-pointer") {
    return (
      left.value === right.value ||
      left.value.startsWith(`${right.value}/`) ||
      right.value.startsWith(`${left.value}/`)
    );
  }
  return left.value === right.value;
};

/** Fails closed when an automated candidate overlaps a human-protected range. */
export const assertLockedRangesPreserved = (input: {
  before: ArtifactRef;
  candidate: ArtifactRef;
  lockedRanges?: readonly HumanLockedRange[];
  changedLocators?: readonly ArtifactLocator[];
}): void => {
  const before = artifactRefSchema.parse(input.before);
  const candidate = artifactRefSchema.parse(input.candidate);
  if (before.artifactId !== candidate.artifactId) throw new Error("LOCKED_RANGE_ARTIFACT_MISMATCH");
  if (before.sha256 === candidate.sha256) return;
  const locks = (input.lockedRanges ?? [])
    .map((lock) => humanLockedRangeSchema.parse(lock))
    .filter((lock) => lock.artifactRef.artifactId === before.artifactId);
  if (locks.length === 0) return;
  for (const lock of locks) {
    if (
      lock.artifactRef.sha256 !== before.sha256 ||
      lock.artifactRef.revision !== before.revision ||
      lock.artifactRef.path !== before.path
    ) {
      throw new Error(`LOCKED_RANGE_BASE_MISMATCH:${lock.lockId}`);
    }
  }
  const changedLocators = input.changedLocators?.map((locator) =>
    artifactLocatorSchema.parse(locator),
  ) ?? [{kind: "whole-artifact" as const, value: "*"}];
  const overwritten = locks
    .filter((lock) => changedLocators.some((changed) => locatorOverlaps(lock.locator, changed)))
    .map((lock) => lock.lockId)
    .sort();
  if (overwritten.length > 0) throw new Error(`LOCKED_RANGE_OVERWRITE:${overwritten.join(",")}`);
};

const issueIdFor = (decision: HumanDecision, category: string, ref: ArtifactRef): string =>
  `issue-human-${createHash("sha256")
    .update(stableJson({category, decisionId: decision.decisionId, ref: ref.sha256}))
    .digest("hex")
    .slice(0, 24)}-r1-01`;

const defaultIssueForGate = (gate: HumanDecision["gate"]): NonNullable<HumanDecision["issue"]> => ({
  category:
    gate === "final-approval"
      ? "delivery.render"
      : gate === "unfreeze-approval"
        ? "delivery.timeline"
        : "story.structure",
  severity: gate === "content-approval" ? "high" : "blocker",
  locator: {kind: "whole-artifact", value: "human-rejection"},
});

const routeInputForIssue = (input: {
  issueId: string;
  category: string;
  severity: string;
  affectedArtifact: ArtifactRef;
  locator: ArtifactLocator;
}): RoutingIssue => ({
  id: input.issueId,
  category: input.category,
  severity: input.severity,
  status: "open",
  affectedArtifact: {
    artifactId: input.affectedArtifact.artifactId,
    path: input.affectedArtifact.path,
    sha256: input.affectedArtifact.sha256,
    locator: input.locator,
    producer: input.affectedArtifact.producer,
  },
});

export const routeHumanIssue = (input: {
  issueId: string;
  category: string;
  severity: string;
  affectedArtifact: ArtifactRef;
  locator: ArtifactLocator;
}): RouteSelection => selectPrimaryRoute({issues: [routeInputForIssue(input)]});

export type PersistHumanIssueInput = {
  repoRoot: string;
  decision: HumanDecision;
  decisionRef: ArtifactRef;
  artifactIndex?: ArtifactIndex;
  executionId?: string;
};

export type PersistHumanIssueResult = {
  issue: HumanIssueArtifact;
  issueRef: ArtifactRef;
  route: PrimaryRoute;
  artifactIndex: ArtifactIndex;
};

/** Converts a reject into a deterministic, persisted Issue without changing any content bytes. */
export const persistHumanIssue = (input: PersistHumanIssueInput): PersistHumanIssueResult => {
  const decision = humanDecisionSchema.parse(input.decision);
  if (decision.decision !== "reject") throw new Error("HUMAN_ISSUE_REQUIRES_REJECT");
  const decisionRef = artifactRefSchema.parse(input.decisionRef);
  const proposed = decision.issue ?? defaultIssueForGate(decision.gate);
  const affectedArtifact = proposed.affectedArtifactRef ?? decision.artifactRefs[0]!;
  if (affectedArtifact.episodeId !== decisionRef.episodeId) {
    throw new Error("HUMAN_ISSUE_EPISODE_MISMATCH");
  }
  if (!decision.artifactRefs.some((ref) => ref.artifactId === affectedArtifact.artifactId)) {
    throw new Error("HUMAN_ISSUE_ARTIFACT_NOT_RELATED");
  }
  const issueId = issueIdFor(decision, proposed.category, affectedArtifact);
  const route = routeHumanIssue({
    issueId,
    category: proposed.category,
    severity: proposed.severity,
    affectedArtifact,
    locator: proposed.locator,
  });
  if (!route || !("ownerAgent" in route)) {
    throw new Error(`HUMAN_ISSUE_ROUTE_UNRESOLVED:${issueId}`);
  }
  const issue = humanIssueArtifactSchema.parse({
    schemaVersion: "human-issue-v1",
    issueId,
    episodeId: decisionRef.episodeId,
    sourceDecisionId: decision.decisionId,
    gate: decision.gate,
    approvalEpoch: decision.approvalEpoch,
    status: "open",
    category: proposed.category,
    severity: proposed.severity,
    ownerAgent: route.ownerAgent,
    routeTarget: route.routeTarget,
    restartAt: route.restartAt,
    affectedArtifactRef: affectedArtifact,
    locator: proposed.locator,
    summary: decision.reason,
  });
  const issuePath = `content/${issue.episodeId}/production/issues/${issue.issueId}.json`;
  const absolutePath = repositoryPath(input.repoRoot, issuePath);
  if (fs.existsSync(absolutePath)) {
    const existing = humanIssueArtifactSchema.parse(
      JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown,
    );
    if (!stableJsonEqual(existing, issue)) throw new Error(`HUMAN_ISSUE_ID_COLLISION:${issueId}`);
  } else {
    writeJsonAtomically(absolutePath, issue);
  }
  const issueRef = artifactRefSchema.parse(
    buildArtifactRef({
      repoRoot: input.repoRoot,
      artifactId: `${issue.episodeId}:production:human-issue-${issueId.replace(/^issue-human-/u, "")}`,
      episodeId: issue.episodeId,
      path: issuePath,
      mediaType: "application/json",
      schemaVersion: "human-issue-v1",
      producer: `human:${decision.reviewer}`,
      createdAt: decision.timestamp,
    }),
  );
  let artifactIndex = readOrCreateIndex(input.repoRoot, issue.episodeId, input.artifactIndex);
  artifactIndex = addSelectedArtifact({
    index: artifactIndex,
    ref: issueRef,
    executionId: input.executionId ?? `human-issue:${issueId}`,
    dependencies: [dependencyFromRef(decisionRef), dependencyFromRef(affectedArtifact, "reviews")],
  });
  writeArtifactIndex(registryPath(input.repoRoot, issue.episodeId), artifactIndex);
  return {issue, issueRef, route, artifactIndex};
};

const lockIdFor = (decisionId: string, edit: HumanDecisionEdit, locator: ArtifactLocator): string =>
  `lock-${safeSlug(decisionId)}-${safeSlug(edit.artifactId)}-${identitySuffix(
    `${locator.kind}:${locator.value}`,
  )}`;

export type ApplyHumanDirectEditsInput = {
  repoRoot: string;
  decision: HumanDecision;
  decisionRef?: ArtifactRef;
  artifactIndex?: ArtifactIndex;
  existingLockedRanges?: readonly HumanLockedRange[];
  executionId?: string;
};

export type ApplyHumanDirectEditsResult = {
  artifactIndex: ArtifactIndex;
  changedArtifactRefs: ArtifactRef[];
  staleArtifactIds: string[];
  lockedRanges: HumanLockedRange[];
};

/** Applies only already-materialized human files; the decision never carries an artifact body. */
export const applyHumanDirectEdits = (
  input: ApplyHumanDirectEditsInput,
): ApplyHumanDirectEditsResult => {
  const decision = humanDecisionSchema.parse(input.decision);
  if (decision.decision !== "direct-edit") throw new Error("HUMAN_DIRECT_EDIT_REQUIRED");
  let index = readOrCreateIndex(
    input.repoRoot,
    decision.artifactRefs[0]!.episodeId,
    input.artifactIndex,
  );
  const existingLocks = (input.existingLockedRanges ?? []).map((lock) =>
    humanLockedRangeSchema.parse(lock),
  );
  const changedArtifactRefs: ArtifactRef[] = [];
  const pending: Array<{
    edit: HumanDecisionEdit;
    previous: ArtifactRecord;
    dependencies: ArtifactDependency[];
  }> = [];

  for (const rawEdit of decision.edits) {
    const edit = rawEdit;
    const before = artifactRefSchema.parse(edit.before);
    const after = artifactRefSchema.parse(edit.after);
    if (edit.owner === "production-executor" && decision.gate !== "final-approval") {
      throw new Error(`HUMAN_DIRECT_EDIT_OWNER_INVALID:${edit.artifactId}`);
    }
    if (!decision.artifactRefs.some((ref) => ref.artifactId === edit.artifactId)) {
      throw new Error(`HUMAN_DIRECT_EDIT_ARTIFACT_NOT_RELATED:${edit.artifactId}`);
    }
    if (after.producer !== `human:${decision.reviewer}`) {
      throw new Error(`HUMAN_DIRECT_EDIT_PROVENANCE_INVALID:${edit.artifactId}`);
    }
    if (before.path !== after.path || before.episodeId !== decision.artifactRefs[0]!.episodeId) {
      throw new Error(`HUMAN_DIRECT_EDIT_PATH_INVALID:${edit.artifactId}`);
    }
    const alreadyApplied =
      index.selected[after.artifactId]?.sha256 === after.sha256 &&
      index.artifacts.some(
        (record) =>
          record.ref.artifactId === after.artifactId &&
          record.ref.sha256 === after.sha256 &&
          record.producedByExecutionId.includes(`human-decision:${decision.decisionId}`),
      );
    // A checkpoint replay may already have selected the human version. In that case the old
    // `before` bytes are intentionally no longer current, so idempotency is checked first.
    if (alreadyApplied) {
      changedArtifactRefs.push(after);
      continue;
    }
    // The human version normally replaces the same repository path, so the old ref cannot still
    // be the file's current bytes. Its hash is anchored by the selected artifact-index record;
    // the new version is verified below.
    assertCurrentBytes(input.repoRoot, after, "HUMAN_DIRECT_EDIT_AFTER_HASH_MISMATCH");
    const previous = selectedRecord(index, before);
    if (!previous) throw new Error(`HUMAN_DIRECT_EDIT_BEFORE_NOT_SELECTED:${edit.artifactId}`);
    assertLockedRangesPreserved({
      before,
      candidate: after,
      lockedRanges: existingLocks.map((lock) =>
        lock.artifactRef.artifactId === before.artifactId ? {...lock, artifactRef: before} : lock,
      ),
      changedLocators: edit.changedLocators,
    });
    pending.push({edit, previous, dependencies: previous.dependencies});
  }

  if (pending.length === 0) {
    return {
      artifactIndex: index,
      changedArtifactRefs: decision.edits.map((edit) => edit.after),
      staleArtifactIds: index.artifacts
        .filter((record) => record.state === "stale")
        .map((record) => record.ref.artifactId)
        .sort(),
      lockedRanges: existingLocks,
    };
  }

  index = markStaleTransitively(
    index,
    pending.map(({edit}) => edit.artifactId),
  );
  for (const {edit, dependencies} of pending) {
    index = registerCandidate(
      index,
      edit.after,
      input.executionId ?? `human-decision:${decision.decisionId}`,
      dependencies,
    );
    index = selectArtifact(index, edit.after);
    changedArtifactRefs.push(edit.after);
  }
  const rebasedExistingLocks = existingLocks.map((lock) => {
    const edit = pending.find(
      ({edit: candidate}) => candidate.artifactId === lock.artifactRef.artifactId,
    );
    if (!edit) return lock;
    return {...lock, artifactRef: edit.edit.after};
  });
  const newLocks = pending.flatMap(({edit}) =>
    edit.changedLocators.map((locator) =>
      humanLockedRangeSchema.parse({
        lockId: lockIdFor(decision.decisionId, edit, locator),
        artifactRef: edit.after,
        locator,
        ...(input.decisionRef ? {sourceDecisionRef: input.decisionRef} : {}),
        reviewer: decision.reviewer,
        decisionId: decision.decisionId,
      }),
    ),
  );
  const locksById = new Map(
    [...rebasedExistingLocks, ...newLocks].map((lock) => [lock.lockId, lock]),
  );
  const staleArtifactIds = [
    ...new Set(
      index.artifacts
        .filter((record) => record.state === "stale")
        .map((record) => record.ref.artifactId),
    ),
  ].sort();
  writeArtifactIndex(registryPath(input.repoRoot, decision.artifactRefs[0]!.episodeId), index);
  return {
    artifactIndex: index,
    changedArtifactRefs,
    staleArtifactIds,
    lockedRanges: [...locksById.values()].sort((left, right) =>
      left.lockId.localeCompare(right.lockId),
    ),
  };
};

export type {HumanDecision, HumanDecisionEdit, HumanIssueArtifact, HumanLockedRange};
