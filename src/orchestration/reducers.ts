import {agentNames} from "./schemas/agent";
import type {ArtifactRef} from "./schemas/artifact";
import {stableJsonEqual} from "./stable-json";
import {productionPhases, type ProductionState} from "./state";

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
