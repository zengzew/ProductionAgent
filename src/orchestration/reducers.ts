import {agentNames} from "./schemas/agent";
import type {ArtifactRef} from "./schemas/artifact";
import {stableJsonEqual} from "./stable-json";
import {productionRepairStateSchema, productionStageCheckpointSchema} from "./schemas/production";
import {humanLockedRangeSchema, productionAuthorizationSchema} from "./schemas/human-decision";
import {unfreezeStateSchema, type UnfreezeState} from "./schemas/unfreeze";
import {productionPhases, type ProductionState, type ProductionStageSummary} from "./state";

export const firstWriteImmutable = <T>(current: T, update: T): T => {
  if (!stableJsonEqual(current, update)) {
    throw new Error("immutable state field received conflicting values");
  }
  return current;
};

export const mergePhase = (
  current: ProductionState["phase"],
  update: ProductionState["phase"],
): ProductionState["phase"] => {
  if (current === "unfreeze_review" && update === "frozen") return update;
  if (
    current === "content_approval" &&
    (update === "content_eval" || update === "content_revision")
  ) {
    return update;
  }
  if (current === "final_approval" && update === "production_revision") return update;
  const currentRank = productionPhases.indexOf(current);
  const updateRank = productionPhases.indexOf(update);
  return updateRank > currentRank ? update : current;
};

export const mergeMax = (current: number, update: number): number => Math.max(current, update);

const mergeArtifactRecord = (current: ArtifactRef, update: ArtifactRef): ArtifactRef => {
  if (current.artifactId !== update.artifactId) {
    throw new Error("artifact reducer key received different artifact IDs");
  }
  if (current.revision === update.revision) {
    if (current.sha256 !== update.sha256) {
      throw new Error(`artifact revision collision for ${current.artifactId}`);
    }
    if (!stableJsonEqual(current, update)) {
      throw new Error(`artifact reference collision for ${current.artifactId}`);
    }
    return current;
  }
  return update.revision > current.revision ? update : current;
};

export const mergeArtifactRefs = (
  current: Record<string, ArtifactRef>,
  update: Record<string, ArtifactRef>,
): Record<string, ArtifactRef> => {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(update)])].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const left = current[key];
      const right = update[key];
      if (!left) return [key, right as ArtifactRef];
      if (!right) return [key, left];
      return [key, mergeArtifactRecord(left, right)];
    }),
  );
};

// M2 replaces candidate eligibility with ADR-003 Pareto selection. M1 only needs
// deterministic reference convergence, so best pointers use the same identity rule.
export const pickBest = mergeArtifactRefs;

export const appendDedupeBy = <T>(current: T[], update: T[], key: (value: T) => string): T[] => {
  const merged = new Map<string, T>();
  for (const value of [...current, ...update]) {
    const itemKey = key(value);
    const existing = merged.get(itemKey);
    if (existing && !stableJsonEqual(existing, value)) {
      throw new Error(`state reducer collision for ${itemKey}`);
    }
    merged.set(itemKey, existing ?? value);
  }
  return [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
};

export const mergeCompletedAgents = (
  current: ProductionState["completedAgents"],
  update: ProductionState["completedAgents"],
): ProductionState["completedAgents"] => {
  const completed = new Set([...current, ...update]);
  return agentNames.filter((agentName) => completed.has(agentName));
};

export const mergeEvaluationSummaries = (
  current: ProductionState["evaluations"],
  update: ProductionState["evaluations"],
): ProductionState["evaluations"] => appendDedupeBy(current, update, (item) => item.evaluationId);

export const mergeRevisionSummaries = (
  current: ProductionState["revisionLog"],
  update: ProductionState["revisionLog"],
): ProductionState["revisionLog"] => appendDedupeBy(current, update, (item) => item.revisionId);

export const mergeEventSummaries = (
  current: ProductionState["events"],
  update: ProductionState["events"],
): ProductionState["events"] => appendDedupeBy(current, update, (item) => item.eventId);

export const mergeLockedRanges = (
  current: ProductionState["lockedRanges"],
  update: ProductionState["lockedRanges"],
): ProductionState["lockedRanges"] =>
  appendDedupeBy(
    current.map((lock) => humanLockedRangeSchema.parse(lock)),
    update.map((lock) => humanLockedRangeSchema.parse(lock)),
    (lock) => lock.lockId,
  );

export const mergeProcessedDecisionIds = (
  current: ProductionState["processedDecisionIds"],
  update: ProductionState["processedDecisionIds"],
): ProductionState["processedDecisionIds"] => [...new Set([...current, ...update])].sort();

export const mergeProductionAuthorization = (
  current: ProductionState["productionAuthorization"],
  update: ProductionState["productionAuthorization"],
): ProductionState["productionAuthorization"] => {
  const left = current === null ? null : productionAuthorizationSchema.parse(current);
  const right = update === null ? null : productionAuthorizationSchema.parse(update);
  if (!left) return right;
  if (!right) return left;
  if (stableJsonEqual(left, right)) return left;
  if (right.approvalEpoch > left.approvalEpoch) return right;
  if (right.approvalEpoch < left.approvalEpoch) return left;
  throw new Error("production authorization collision");
};

export const mergePendingHumanRoute = (
  current: ProductionState["pendingHumanRoute"],
  update: ProductionState["pendingHumanRoute"],
): ProductionState["pendingHumanRoute"] => {
  if (!current) return update;
  if (!update) return null;
  if (stableJsonEqual(current, update)) return current;
  throw new Error("pending human route collision");
};

export const mergeStrictRecord = <T>(
  current: Record<string, T>,
  update: Record<string, T>,
): Record<string, T> => {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(update)])].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const left = current[key];
      const right = update[key];
      if (left !== undefined && right !== undefined && !stableJsonEqual(left, right)) {
        throw new Error(`state reducer collision for ${key}`);
      }
      return [key, left ?? (right as T)];
    }),
  );
};

const productionStatusRank: Record<ProductionStageSummary["status"], number> = {
  FAILED: 0,
  SKIPPED: 1,
  SUCCEEDED: 2,
};

/**
 * Production stage summaries are retryable checkpoint records. For the same
 * input-set hash, the latest attempt is authoritative; status only breaks a
 * same-attempt tie, so an older late write cannot regress a newer checkpoint.
 */
export const mergeProductionStageSummaries = (
  current: ProductionState["productionStages"],
  update: ProductionState["productionStages"],
): ProductionState["productionStages"] => {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(update)])].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const left = current[key];
      const right = update[key];
      if (!left) return [key, productionStageCheckpointSchema.parse(right)];
      if (!right) return [key, left];
      const validatedRight = productionStageCheckpointSchema.parse(right);
      if (left.stage !== validatedRight.stage) {
        throw new Error(`production stage reducer collision for ${key}`);
      }
      if (left.inputSetHash !== validatedRight.inputSetHash) {
        return [key, validatedRight.attempt >= left.attempt ? validatedRight : left];
      }
      if (validatedRight.attempt > left.attempt) return [key, validatedRight];
      if (validatedRight.attempt < left.attempt) return [key, left];
      if (productionStatusRank[validatedRight.status] > productionStatusRank[left.status]) {
        return [key, validatedRight];
      }
      if (productionStatusRank[validatedRight.status] < productionStatusRank[left.status]) {
        return [key, left];
      }
      if (!stableJsonEqual(left, validatedRight)) {
        throw new Error(`production stage checkpoint collision for ${key}`);
      }
      return [key, left];
    }),
  );
};

const productionIssueStatusRank: Record<
  ProductionState["productionIssues"][string]["status"],
  number
> = {
  open: 0,
  resolved: 1,
  escalated: 2,
};

export const mergeProductionIssueSummaries = (
  current: ProductionState["productionIssues"],
  update: ProductionState["productionIssues"],
): ProductionState["productionIssues"] => {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(update)])].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const left = current[key];
      const right = update[key];
      if (!left) return [key, right as NonNullable<typeof right>];
      if (!right) return [key, left];
      const leftIdentity = {...left, status: "open" as const};
      const rightIdentity = {...right, status: "open" as const};
      if (!stableJsonEqual(leftIdentity, rightIdentity)) {
        throw new Error(`production issue reducer collision for ${key}`);
      }
      const leftRank = productionIssueStatusRank[left.status];
      const rightRank = productionIssueStatusRank[right.status];
      if (leftRank === rightRank && left.status !== right.status) {
        throw new Error(`production issue terminal status collision for ${key}`);
      }
      return [key, rightRank > leftRank ? right : left];
    }),
  );
};

const productionRepairStatusRank: Record<ProductionState["productionRepair"]["status"], number> = {
  idle: 0,
  repairing: 1,
  "unfreeze-review": 2,
  "unfreeze-approved": 3,
  "unfreeze-complete": 4,
  "production-ready": 5,
  "human-escalation": 6,
};

export const mergeProductionRepair = (
  current: ProductionState["productionRepair"],
  update: ProductionState["productionRepair"],
): ProductionState["productionRepair"] => {
  const left = productionRepairStateSchema.parse(current);
  const right = productionRepairStateSchema.parse(update);
  if (left.status === "idle" && right.status === "idle" && left.round === 0 && right.round === 0) {
    const leftWithoutBudget = {...left, maxRounds: 0};
    const rightWithoutBudget = {...right, maxRounds: 0};
    if (stableJsonEqual(leftWithoutBudget, rightWithoutBudget)) return right;
  }
  if (right.round > left.round) return right;
  if (right.round < left.round) return left;
  const leftRank = productionRepairStatusRank[left.status];
  const rightRank = productionRepairStatusRank[right.status];
  if (rightRank > leftRank) return right;
  if (rightRank < leftRank) return left;
  if (left.forceRerunStage !== right.forceRerunStage) {
    const leftWithoutForce = {...left, forceRerunStage: null};
    const rightWithoutForce = {...right, forceRerunStage: null};
    if (stableJsonEqual(leftWithoutForce, rightWithoutForce)) {
      return left.forceRerunStage === null ? left : right;
    }
  }
  if (!stableJsonEqual(left, right)) {
    throw new Error("production repair state collision");
  }
  return left;
};

const unfreezeStatusRank: Record<UnfreezeState["status"], number> = {
  idle: 0,
  pending: 1,
  approved: 2,
  completed: 3,
  rejected: 4,
  escalated: 5,
};

export const mergeUnfreezeState = (
  current: ProductionState["unfreeze"],
  update: ProductionState["unfreeze"],
): ProductionState["unfreeze"] => {
  const left = unfreezeStateSchema.parse(current);
  const right = unfreezeStateSchema.parse(update);
  const leftRank = unfreezeStatusRank[left.status];
  const rightRank = unfreezeStatusRank[right.status];
  if (rightRank > leftRank) return right;
  if (rightRank < leftRank) return left;
  if (!stableJsonEqual(left, right)) throw new Error("unfreeze state collision");
  return left;
};

const issueStatusRank: Record<ProductionState["issues"][string]["status"], number> = {
  open: 0,
  assigned: 1,
  resolved: 2,
  wontfix: 2,
  escalated: 2,
};

export const upsertIssues = (
  current: ProductionState["issues"],
  update: ProductionState["issues"],
): ProductionState["issues"] => {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(update)])].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const left = current[key];
      const right = update[key];
      if (!left) return [key, right as NonNullable<typeof right>];
      if (!right) return [key, left];
      const leftIdentity = {...left, status: "open" as const};
      const rightIdentity = {...right, status: "open" as const};
      if (!stableJsonEqual(leftIdentity, rightIdentity)) {
        throw new Error(`issue reducer collision for ${key}`);
      }
      const leftRank = issueStatusRank[left.status];
      const rightRank = issueStatusRank[right.status];
      if (leftRank === rightRank && left.status !== right.status) {
        throw new Error(`issue terminal status collision for ${key}`);
      }
      return [key, rightRank > leftRank ? right : left];
    }),
  );
};

export const mergeNumberMap = (
  current: Record<string, number>,
  update: Record<string, number>,
): Record<string, number> =>
  Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(update)])]
      .sort()
      .map((key) => [key, Math.max(current[key] ?? 0, update[key] ?? 0)]),
  );

export const mergeBudget = (
  current: ProductionState["budget"],
  update: ProductionState["budget"],
): ProductionState["budget"] => {
  for (const key of [
    "maxRoundsContent",
    "maxRoundsProduction",
    "maxRoundsPerOwner",
    "maxUnfreeze",
    "maxCostUsd",
    "maxWallclockSeconds",
  ] as const) {
    if (current[key] !== update[key]) {
      throw new Error(`budget configuration changed during merge: ${key}`);
    }
  }
  return {
    ...current,
    spentCostUsd: Math.max(current.spentCostUsd, update.spentCostUsd),
    spentWallclockSeconds: Math.max(current.spentWallclockSeconds, update.spentWallclockSeconds),
    roundsUsed: mergeNumberMap(current.roundsUsed, update.roundsUsed),
    unfreezeUsed: Math.max(current.unfreezeUsed, update.unfreezeUsed),
  };
};

export const mergeOptionalArtifactRef = (
  current: ArtifactRef | undefined,
  update: ArtifactRef | undefined,
): ArtifactRef | undefined => {
  if (!current) return update;
  if (!update) return current;
  return mergeArtifactRecord(current, update);
};

export const mergeOptionalImmutable = <T>(
  current: T | undefined,
  update: T | undefined,
): T | undefined => {
  if (current === undefined) return update;
  if (update === undefined) return current;
  return firstWriteImmutable(current, update);
};
