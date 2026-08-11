import {
  artifactDependencySchema,
  artifactIndexSchema,
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRecord,
  type ArtifactRef,
} from "../schemas/artifact";
import {
  emptyArtifactIndex,
  markStaleTransitively,
  registerCandidate,
  selectArtifact,
} from "../artifact-registry";
import {validateCriticResult} from "../evaluation";
import type {CriticIssue, CriticResult} from "../schemas/critic-output";
import {assertLockedRangesPreserved, type ArtifactLocator, type LockedRange} from "../freeze";
import {
  assessRevision,
  checkRevisionBudget,
  checkRevisionResourceBudget,
  createHumanEscalation,
  createRevisionLedger,
  inferRevisionBudgetKind,
  recordRevisionAttempt,
  selectBest,
  strategyForAttempt,
  strategyLadder,
  type EvaluationDimensionSelector,
  type RevisionHistoryEntry,
  type RevisionStrategyLevel,
} from "../revision";
import {stableJson} from "../stable-json";
import {
  defaultRevisionBudgetLimits,
  revisionLedgerSchema,
  type RevisionBudgetLimits,
  type RevisionHumanEscalation,
  type RevisionLedger,
} from "../schemas/revision-ledger";
import {
  defaultOwnershipConfig,
  selectPrimaryRoute,
  type AgentOwner,
  type HumanEscalation,
  type PrimaryRoute,
  type ProvenanceIndex,
  type RouteSelection,
  type RoutingConfig,
} from "../routing";
import {assertReferenceOnlyState, type ProductionState} from "../state";

export const contentCriticNames = [
  "audience-critic",
  "retention-critic",
  "fact-guardian",
  "compliance-critic",
] as const;
export type ContentCriticName = (typeof contentCriticNames)[number];

export type ContentArtifactRevision = {
  ref: ArtifactRef;
  dependencies?: readonly ArtifactDependency[];
  changedLocators?: readonly ArtifactLocator[];
};

export type ContentRevisionExecution = {
  revisions: readonly ContentArtifactRevision[] | ContentArtifactRevision | undefined;
  usage?: {
    costUsd?: number;
    wallclockSeconds?: number;
  };
};

export type ContentNodeContext = {
  episodeId: string;
  runId: string;
  round: number;
  artifacts: Readonly<Record<string, ArtifactRef>>;
  artifactIndex: ArtifactIndex;
};

export type ContentCriticExecution = {
  result: CriticResult;
  resultRef?: ArtifactRef;
};

export type ContentCriticOutput = CriticResult | ContentCriticExecution;
export type ContentCriticRunner = (
  context: ContentNodeContext,
) => ContentCriticOutput | Promise<ContentCriticOutput>;

export type ContentArtifactProducer = (
  context: ContentNodeContext,
) =>
  | readonly ContentArtifactRevision[]
  | ContentArtifactRevision
  | undefined
  | Promise<readonly ContentArtifactRevision[] | ContentArtifactRevision | undefined>;

export type OwnerRevisionRequest = {
  ownerAgent: AgentOwner;
  route: PrimaryRoute;
  issues: readonly CriticIssue[];
  context: ContentNodeContext;
  authorizedArtifactIds: readonly string[];
  strategyLevel: RevisionStrategyLevel;
  strategy: (typeof strategyLadder)[keyof typeof strategyLadder];
};

export type OwnerRevisionRunner = (
  request: OwnerRevisionRequest,
) =>
  | readonly ContentArtifactRevision[]
  | ContentArtifactRevision
  | ContentRevisionExecution
  | undefined
  | Promise<
      | readonly ContentArtifactRevision[]
      | ContentArtifactRevision
      | ContentRevisionExecution
      | undefined
    >;

export type DownstreamRefreshRequest = {
  round: number;
  staleArtifacts: readonly ArtifactRecord[];
  context: ContentNodeContext;
};

export type DownstreamRefreshRunner = (
  request: DownstreamRefreshRequest,
) =>
  | readonly ContentArtifactRevision[]
  | ContentArtifactRevision
  | undefined
  | Promise<readonly ContentArtifactRevision[] | ContentArtifactRevision | undefined>;

export type ContentLoopNodes = {
  visualDirector?: ContentArtifactProducer;
  critics: Readonly<Record<ContentCriticName, ContentCriticRunner>>;
  reviseOwner?: OwnerRevisionRunner;
  ownerRevisions?: Partial<Record<AgentOwner, OwnerRevisionRunner>>;
  downstreamRefresh?: DownstreamRefreshRunner;
};

export type ContentLoopInput = {
  state: ProductionState;
  artifactIndex?: ArtifactIndex;
  nodes: ContentLoopNodes;
  routingConfig?: RoutingConfig;
  provenance?: ProvenanceIndex;
  revisionLedger?: RevisionLedger;
  budgetLimits?: RevisionBudgetLimits;
  lockedRanges?: readonly LockedRange[];
  selectionPolicy?: {
    targetGain?: number;
    targetedDimensions?: readonly (string | EvaluationDimensionSelector)[];
    protectedDimensions?: readonly (string | EvaluationDimensionSelector)[];
  };
  now?: () => number;
};

export type ContentTraceStep = {
  node: string;
  round: number;
  status: "completed" | "rejected" | "escalated";
  parallel?: boolean;
  parallelGroup?: string;
  issueIds?: string[];
  artifactIds?: string[];
  changedArtifactIds?: string[];
  staleArtifactIds?: string[];
  refreshedArtifactIds?: string[];
  ownerAgent?: AgentOwner;
  routeTarget?: string;
  strategyLevel?: RevisionStrategyLevel;
  disposition?: "selected" | "rejected" | "human-required";
  selectionReason?: string;
};

export type ContentGateEvaluation = {
  verdict: "PASS" | "REJECT";
  gate: "pass" | "fail";
  issueIds: string[];
  issues: CriticIssue[];
  blockerCount: number;
};

export type ContentRevisionRound = {
  round: number;
  ownerAgent: AgentOwner;
  routeTarget: string;
  issueIds: string[];
  authorizedArtifactIds: string[];
  changedArtifactIds: string[];
  staleArtifactIds: string[];
  refreshedArtifactIds: string[];
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
  strategyLevel: RevisionStrategyLevel;
  disposition: "selected" | "rejected" | "human-required";
  selectionReason: string;
  regressionIds: string[];
  oscillationIds: string[];
  costUsd: number;
  wallclockSeconds: number;
};

export type ContentLoopStatus = "completed" | "needs-revision" | "escalated";

export type ContentLoopResult = {
  status: ContentLoopStatus;
  state: ProductionState;
  artifactIndex: ArtifactIndex;
  artifacts: Record<string, ArtifactRef>;
  gate: ContentGateEvaluation;
  route: RouteSelection;
  nextRoute: RouteSelection;
  closedIssueIds: string[];
  newIssues: CriticIssue[];
  criticReports: Readonly<Record<ContentCriticName, CriticResult>>;
  criticResultRefs: Readonly<Partial<Record<ContentCriticName, ArtifactRef>>>;
  revision?: ContentRevisionRound;
  revisions: ContentRevisionRound[];
  revisionLedger: RevisionLedger;
  humanEscalation?: RevisionHumanEscalation;
  trace: ContentTraceStep[];
};

type NormalizedCritics = Readonly<Record<ContentCriticName, ContentCriticExecution>>;

const isCriticExecution = (value: ContentCriticOutput): value is ContentCriticExecution =>
  typeof value === "object" && value !== null && "result" in value;

const normalizeCriticOutput = (output: ContentCriticOutput): ContentCriticExecution => {
  const execution = isCriticExecution(output) ? output : {result: output};
  const result = validateCriticResult(execution.result);
  const resultRef = execution.resultRef ? artifactRefSchema.parse(execution.resultRef) : undefined;
  if (resultRef && resultRef.episodeId !== result.episodeId) {
    throw new Error("CONTENT_CRITIC_RESULT_EPISODE_MISMATCH");
  }
  return {result, resultRef};
};

const outputArray = (
  output: readonly ContentArtifactRevision[] | ContentArtifactRevision | undefined,
): ContentArtifactRevision[] => {
  if (output === undefined) return [];
  return Array.isArray(output)
    ? ([...output] as ContentArtifactRevision[])
    : ([output] as ContentArtifactRevision[]);
};

const isRevisionExecution = (
  output:
    | readonly ContentArtifactRevision[]
    | ContentArtifactRevision
    | ContentRevisionExecution
    | undefined,
): output is ContentRevisionExecution =>
  typeof output === "object" && output !== null && !Array.isArray(output) && "revisions" in output;

const normalizeRevisionExecution = (
  output:
    | readonly ContentArtifactRevision[]
    | ContentArtifactRevision
    | ContentRevisionExecution
    | undefined,
): Required<Pick<ContentRevisionExecution, "usage">> & {revisions: ContentArtifactRevision[]} => {
  if (isRevisionExecution(output)) {
    return {
      revisions: outputArray(output.revisions),
      usage: {
        costUsd: output.usage?.costUsd ?? 0,
        wallclockSeconds: output.usage?.wallclockSeconds ?? 0,
      },
    };
  }
  return {revisions: outputArray(output), usage: {costUsd: 0, wallclockSeconds: 0}};
};

const selectedRecords = (index: ArtifactIndex): ArtifactRecord[] =>
  Object.entries(index.selected)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([artifactId, pointer]) => {
      const record = index.artifacts.find(
        (candidate) =>
          candidate.ref.artifactId === artifactId &&
          candidate.ref.revision === pointer.revision &&
          candidate.ref.sha256 === pointer.sha256,
      );
      if (!record || record.state !== "selected") {
        throw new Error("CONTENT_SELECTED_ARTIFACT_MISSING:" + artifactId);
      }
      return record;
    });

const selectedRefMap = (index: ArtifactIndex): Map<string, ArtifactRef> =>
  new Map(selectedRecords(index).map((record) => [record.ref.artifactId, record.ref]));

const currentRecord = (index: ArtifactIndex, artifactId: string): ArtifactRecord | undefined => {
  const pointer = index.selected[artifactId];
  if (!pointer) return undefined;
  return index.artifacts.find(
    (record) =>
      record.ref.artifactId === artifactId &&
      record.ref.revision === pointer.revision &&
      record.ref.sha256 === pointer.sha256,
  );
};

const ensureArtifactIndex = (state: ProductionState, source?: ArtifactIndex): ArtifactIndex => {
  let index = artifactIndexSchema.parse(source ?? emptyArtifactIndex(state.episodeId));
  const stateRefs = new Map<string, ArtifactRef>();
  for (const ref of Object.values(state.artifacts)) {
    const prior = stateRefs.get(ref.artifactId);
    if (prior && (prior.sha256 !== ref.sha256 || prior.revision !== ref.revision)) {
      throw new Error("CONTENT_STATE_ARTIFACT_COLLISION:" + ref.artifactId);
    }
    stateRefs.set(ref.artifactId, ref);
  }

  const selected = selectedRefMap(index);
  for (const ref of stateRefs.values()) {
    const selectedRef = selected.get(ref.artifactId);
    if (selectedRef && selectedRef.sha256 === ref.sha256 && selectedRef.revision === ref.revision) {
      continue;
    }
    if (selectedRef && ref.revision <= selectedRef.revision) {
      throw new Error("CONTENT_STATE_ARTIFACT_NOT_SELECTED:" + ref.artifactId);
    }
    index = registerCandidate(index, ref, "content:state:" + ref.artifactId, []);
    index = markStaleTransitively(index, [ref.artifactId]);
    index = selectArtifact(index, ref);
  }
  return artifactIndexSchema.parse(index);
};

const artifactsForState = (
  state: ProductionState,
  index: ArtifactIndex,
): Record<string, ArtifactRef> => {
  const selected = selectedRefMap(index);
  const result: Record<string, ArtifactRef> = {};
  const represented = new Set<string>();
  for (const [key, ref] of Object.entries(state.artifacts)) {
    const current = selected.get(ref.artifactId);
    if (current) {
      result[key] = current;
      represented.add(ref.artifactId);
    } else if (!index.artifacts.some((record) => record.ref.artifactId === ref.artifactId)) {
      result[key] = ref;
      represented.add(ref.artifactId);
    }
  }
  for (const [artifactId, ref] of selected.entries()) {
    if (!represented.has(artifactId)) result[artifactId] = ref;
  }
  return result;
};

const contextFor = (
  state: ProductionState,
  index: ArtifactIndex,
  round: number,
): ContentNodeContext => ({
  episodeId: state.episodeId,
  runId: state.runId,
  round,
  artifacts: artifactsForState(state, index),
  artifactIndex: index,
});

const assertReviewedArtifactsCurrent = (result: CriticResult, index: ArtifactIndex): void => {
  const selected = selectedRefMap(index);
  for (const reviewed of result.reviewedArtifacts) {
    const current = selected.get(reviewed.artifactId);
    if (!current || current.sha256 !== reviewed.sha256 || current.revision !== reviewed.revision) {
      throw new Error("CONTENT_CRITIC_STALE_REVIEW:" + result.critic + ":" + reviewed.artifactId);
    }
  }
};

const issueIdentity = (issue: CriticIssue): string =>
  stableJson({
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    status: issue.status,
    artifactId: issue.affectedArtifact.artifactId,
    sha256: issue.affectedArtifact.sha256,
    locator: issue.affectedArtifact.locator,
  });

const activeIssuesFrom = (executions: readonly ContentCriticExecution[]): CriticIssue[] => {
  const byId = new Map<string, CriticIssue>();
  for (const execution of executions) {
    if (execution.result.verdict !== "REJECT") continue;
    for (const issue of execution.result.issues) {
      if (issue.status !== "open" || issue.severity === "info") continue;
      const prior = byId.get(issue.id);
      if (prior && issueIdentity(prior) !== issueIdentity(issue)) {
        throw new Error("CONTENT_ISSUE_COLLISION:" + issue.id);
      }
      byId.set(issue.id, issue);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
};

const normalizeCriticMap = (
  outputs: readonly (readonly [ContentCriticName, ContentCriticOutput])[],
  index: ArtifactIndex,
): NormalizedCritics => {
  const entries = outputs.map(([name, output]) => {
    const execution = normalizeCriticOutput(output);
    assertReviewedArtifactsCurrent(execution.result, index);
    return [name, execution] as const;
  });
  return Object.fromEntries(entries) as NormalizedCritics;
};

const criticExecutions = (critics: NormalizedCritics): ContentCriticExecution[] =>
  contentCriticNames.map((name) => {
    const execution = critics[name];
    if (!execution) throw new Error("CONTENT_CRITIC_RESULT_MISSING:" + name);
    return execution;
  });

/** Pure gate aggregation over schema-validated critic reports. */
export const evaluateContentGate = (
  outputs: Readonly<Record<ContentCriticName, ContentCriticOutput>>,
  index?: ArtifactIndex,
): ContentGateEvaluation => {
  const pairs = contentCriticNames.map((name) => {
    const output = outputs[name];
    if (!output) throw new Error("CONTENT_CRITIC_RESULT_MISSING:" + name);
    return [name, output] as const;
  });
  const normalized = index
    ? normalizeCriticMap(pairs, artifactIndexSchema.parse(index))
    : (Object.fromEntries(
        pairs.map(([name, output]) => [name, normalizeCriticOutput(output)]),
      ) as NormalizedCritics);
  const executions = criticExecutions(normalized);
  const issues = activeIssuesFrom(executions);
  const verdict =
    issues.length === 0 && executions.every((execution) => execution.result.verdict === "PASS")
      ? "PASS"
      : "REJECT";
  return {
    verdict,
    gate: verdict === "PASS" ? "pass" : "fail",
    issueIds: issues.map((issue) => issue.id),
    issues,
    blockerCount: executions.reduce(
      (count, execution) => count + execution.result.blockers.length,
      0,
    ),
  };
};

const reportMap = (critics: NormalizedCritics): Readonly<Record<ContentCriticName, CriticResult>> =>
  Object.fromEntries(contentCriticNames.map((name) => [name, critics[name]!.result])) as Readonly<
    Record<ContentCriticName, CriticResult>
  >;

const reportRefMap = (
  critics: NormalizedCritics,
): Readonly<Partial<Record<ContentCriticName, ArtifactRef>>> =>
  Object.fromEntries(
    contentCriticNames
      .map((name) => [name, critics[name]!.resultRef] as const)
      .filter((entry): entry is [ContentCriticName, ArtifactRef] => entry[1] !== undefined),
  );

const duplicateArtifactIds = (outputs: readonly ContentArtifactRevision[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const output of outputs) {
    if (seen.has(output.ref.artifactId)) duplicates.add(output.ref.artifactId);
    seen.add(output.ref.artifactId);
  }
  return [...duplicates].sort();
};

const dependenciesFor = (
  index: ArtifactIndex,
  previous: ArtifactRecord | undefined,
  output: ContentArtifactRevision,
): ArtifactDependency[] => {
  if (output.dependencies) {
    return output.dependencies.map((dependency) => artifactDependencySchema.parse(dependency));
  }
  if (!previous) return [];
  const current = selectedRefMap(index);
  return previous.dependencies.map((dependency) => {
    const currentDependency = current.get(dependency.artifactId);
    return currentDependency
      ? {
          ...dependency,
          path: currentDependency.path,
          sha256: currentDependency.sha256,
        }
      : dependency;
  });
};

const normalizedRevision = (output: ContentArtifactRevision): ContentArtifactRevision => ({
  ...output,
  ref: artifactRefSchema.parse(output.ref),
  dependencies: output.dependencies?.map((dependency) =>
    artifactDependencySchema.parse(dependency),
  ),
});

const applySelectedRevisions = (input: {
  index: ArtifactIndex;
  outputs: readonly ContentArtifactRevision[];
  executionId: string;
  authorizedArtifactIds?: ReadonlySet<string>;
  previousRecords?: ReadonlyMap<string, ArtifactRecord>;
  requireChanged: boolean;
  allowNewArtifactIds: boolean;
  lockedRanges?: readonly LockedRange[];
}): {index: ArtifactIndex; changed: ArtifactRef[]} => {
  const outputs = input.outputs.map(normalizedRevision);
  const duplicateIds = duplicateArtifactIds(outputs);
  if (duplicateIds.length > 0) {
    throw new Error("CONTENT_REVISION_DUPLICATE_ARTIFACT:" + duplicateIds.join(","));
  }
  let index = artifactIndexSchema.parse(input.index);
  const changed: ArtifactRef[] = [];
  const dependenciesById = new Map<string, ArtifactDependency[]>();

  for (const output of outputs) {
    const artifactId = output.ref.artifactId;
    if (input.authorizedArtifactIds && !input.authorizedArtifactIds.has(artifactId)) {
      throw new Error("CONTENT_REVISION_UNAUTHORIZED_ARTIFACT:" + artifactId);
    }
    const previous = currentRecord(index, artifactId) ?? input.previousRecords?.get(artifactId);
    if (!previous && !input.allowNewArtifactIds) {
      throw new Error("CONTENT_REVISION_ARTIFACT_NOT_SELECTED:" + artifactId);
    }
    if (previous) {
      const changedBytes = previous.ref.sha256 !== output.ref.sha256;
      if (input.requireChanged && (!changedBytes || output.ref.revision <= previous.ref.revision)) {
        throw new Error("CONTENT_REVISION_NO_CHANGE:" + artifactId);
      }
      if (!input.requireChanged && !changedBytes) continue;
      if (output.ref.revision <= previous.ref.revision) {
        throw new Error("CONTENT_REVISION_NOT_NEWER:" + artifactId);
      }
    } else if (input.requireChanged) {
      throw new Error("CONTENT_REVISION_ARTIFACT_NOT_SELECTED:" + artifactId);
    }
    if (output.ref.episodeId !== index.episodeId) {
      throw new Error("CONTENT_REVISION_EPISODE_MISMATCH:" + artifactId);
    }
    const canonicalRef =
      index.artifacts.find(
        (record) =>
          record.ref.artifactId === output.ref.artifactId &&
          record.ref.sha256 === output.ref.sha256,
      )?.ref ?? output.ref;
    if (previous) {
      assertLockedRangesPreserved({
        before: previous.ref,
        candidate: canonicalRef,
        lockedRanges: input.lockedRanges,
        changedLocators: output.changedLocators,
      });
    }
    changed.push(canonicalRef);
    dependenciesById.set(artifactId, dependenciesFor(index, previous, output));
  }

  if (changed.length === 0) return {index, changed};
  for (const ref of changed) {
    index = registerCandidate(
      index,
      ref,
      input.executionId,
      dependenciesById.get(ref.artifactId) ?? [],
    );
  }
  index = markStaleTransitively(
    index,
    changed.map((ref) => ref.artifactId),
  );
  for (const ref of changed) index = selectArtifact(index, ref);
  return {index: artifactIndexSchema.parse(index), changed};
};

const reachableDownstreamIds = (
  index: ArtifactIndex,
  changedArtifactIds: ReadonlySet<string>,
): Set<string> => {
  const reachable = new Set(changedArtifactIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of index.artifacts) {
      if (
        !reachable.has(record.ref.artifactId) &&
        record.dependencies.some((dependency) => reachable.has(dependency.artifactId))
      ) {
        reachable.add(record.ref.artifactId);
        changed = true;
      }
    }
  }
  return reachable;
};

const depthOf = (
  record: ArtifactRecord,
  index: ArtifactIndex,
  memo: Map<string, number>,
  visiting: Set<string>,
): number => {
  const known = memo.get(record.ref.artifactId);
  if (known !== undefined) return known;
  if (visiting.has(record.ref.artifactId)) throw new Error("CONTENT_ARTIFACT_DEPENDENCY_CYCLE");
  visiting.add(record.ref.artifactId);
  const depth = record.dependencies.reduce((maximum, dependency) => {
    const dependencyRecord =
      currentRecord(index, dependency.artifactId) ??
      index.artifacts
        .filter((candidate) => candidate.ref.artifactId === dependency.artifactId)
        .sort((left, right) => right.ref.revision - left.ref.revision)[0];
    return dependencyRecord
      ? Math.max(maximum, depthOf(dependencyRecord, index, memo, visiting) + 1)
      : maximum;
  }, 0);
  visiting.delete(record.ref.artifactId);
  memo.set(record.ref.artifactId, depth);
  return depth;
};

const staleDescendantRecords = (
  index: ArtifactIndex,
  changedArtifactIds: readonly string[],
): ArtifactRecord[] => {
  const changed = new Set(changedArtifactIds);
  const reachable = reachableDownstreamIds(index, changed);
  const byArtifactId = new Map<string, ArtifactRecord>();
  for (const record of index.artifacts) {
    if (
      record.state === "stale" &&
      !changed.has(record.ref.artifactId) &&
      reachable.has(record.ref.artifactId)
    ) {
      const prior = byArtifactId.get(record.ref.artifactId);
      if (!prior || record.ref.revision > prior.ref.revision) {
        byArtifactId.set(record.ref.artifactId, record);
      }
    }
  }
  const memo = new Map<string, number>();
  return [...byArtifactId.values()].sort(
    (left, right) =>
      depthOf(left, index, memo, new Set()) - depthOf(right, index, memo, new Set()) ||
      left.ref.artifactId.localeCompare(right.ref.artifactId),
  );
};

const refreshDownstream = async (input: {
  index: ArtifactIndex;
  state: ProductionState;
  nodes: ContentLoopNodes;
  round: number;
  changedArtifactIds: readonly string[];
  lockedRanges?: readonly LockedRange[];
}): Promise<{index: ArtifactIndex; refreshed: ArtifactRef[]; stale: ArtifactRecord[]}> => {
  const stale = staleDescendantRecords(input.index, input.changedArtifactIds);
  if (stale.length === 0) return {index: input.index, refreshed: [], stale};
  if (!input.nodes.downstreamRefresh) throw new Error("CONTENT_DOWNSTREAM_REFRESH_MISSING");

  const outputs = outputArray(
    await input.nodes.downstreamRefresh({
      round: input.round,
      staleArtifacts: stale,
      context: contextFor(input.state, input.index, input.round),
    }),
  ).map(normalizedRevision);
  const expected = new Set(stale.map((record) => record.ref.artifactId));
  const actual = new Set(outputs.map((output) => output.ref.artifactId));
  const unexpected = [...actual].filter((artifactId) => !expected.has(artifactId));
  const missing = [...expected].filter((artifactId) => !actual.has(artifactId));
  if (unexpected.length > 0) {
    throw new Error("CONTENT_REFRESH_UNAUTHORIZED_ARTIFACT:" + unexpected.sort().join(","));
  }
  if (missing.length > 0) {
    throw new Error("CONTENT_REFRESH_INCOMPLETE:" + missing.sort().join(","));
  }
  if (duplicateArtifactIds(outputs).length > 0) {
    throw new Error("CONTENT_REFRESH_DUPLICATE_ARTIFACT");
  }

  let index = input.index;
  const previousRecords = new Map(stale.map((record) => [record.ref.artifactId, record] as const));
  const refreshed: ArtifactRef[] = [];
  for (const staleRecord of stale) {
    const output = outputs.find(
      (candidate) => candidate.ref.artifactId === staleRecord.ref.artifactId,
    );
    if (!output) throw new Error("CONTENT_REFRESH_INCOMPLETE:" + staleRecord.ref.artifactId);
    if (
      output.ref.sha256 === staleRecord.ref.sha256 ||
      output.ref.revision <= staleRecord.ref.revision
    ) {
      throw new Error("CONTENT_REFRESH_NO_CHANGE:" + staleRecord.ref.artifactId);
    }
    const dependencies = dependenciesFor(index, staleRecord, output);
    for (const dependency of dependencies) {
      const currentDependency = selectedRefMap(index).get(dependency.artifactId);
      if (currentDependency && currentDependency.sha256 !== dependency.sha256) {
        throw new Error("CONTENT_REFRESH_STALE_DEPENDENCY:" + staleRecord.ref.artifactId);
      }
    }
    const applied = applySelectedRevisions({
      index,
      outputs: [{...output, dependencies}],
      executionId: "content:round-" + input.round + ":downstream-refresh",
      previousRecords,
      requireChanged: true,
      allowNewArtifactIds: false,
      lockedRanges: input.lockedRanges,
    });
    index = applied.index;
    refreshed.push(...applied.changed);
  }

  const remaining = staleDescendantRecords(index, input.changedArtifactIds).filter(
    (record) => !index.selected[record.ref.artifactId],
  );
  if (remaining.length > 0) {
    throw new Error(
      "CONTENT_REFRESH_INCOMPLETE:" + remaining.map((record) => record.ref.artifactId).join(","),
    );
  }
  return {index: artifactIndexSchema.parse(index), refreshed, stale};
};

const addEvaluationSummaries = (
  state: ProductionState,
  critics: readonly NormalizedCritics[],
): ProductionState["evaluations"] => {
  const summaries = new Map(
    state.evaluations.map((evaluation) => [evaluation.evaluationId, evaluation]),
  );
  for (const criticMap of critics) {
    for (const name of contentCriticNames) {
      const execution = criticMap[name];
      if (!execution?.resultRef) continue;
      const result = execution.result;
      summaries.set(result.critic + ":" + result.executionId, {
        evaluationId: result.critic + ":" + result.executionId,
        resultRef: execution.resultRef,
        gate: result.verdict === "PASS" ? "pass" : "fail",
        blockerCount: result.blockers.length,
        issueIds: result.issues.filter((issue) => issue.status === "open").map((issue) => issue.id),
      });
    }
  }
  return [...summaries.values()].sort((left, right) =>
    left.evaluationId.localeCompare(right.evaluationId),
  );
};

const addIssueSummaries = (input: {
  state: ProductionState;
  critics: readonly NormalizedCritics[];
  initialRoute: RouteSelection;
  closedIssueIds: readonly string[];
  finalIssues: readonly CriticIssue[];
}): ProductionState["issues"] => {
  const summaries = {...input.state.issues};
  const routeOwner =
    input.initialRoute && "ownerAgent" in input.initialRoute
      ? input.initialRoute.ownerAgent
      : undefined;
  const finalIds = new Set(input.finalIssues.map((issue) => issue.id));
  const closed = new Set(input.closedIssueIds);
  for (const criticMap of input.critics) {
    for (const name of contentCriticNames) {
      const execution = criticMap[name];
      const resultRef = execution?.resultRef;
      if (!execution || !resultRef) continue;
      for (const issue of execution.result.issues) {
        if (issue.status !== "open") continue;
        const status = closed.has(issue.id)
          ? "resolved"
          : finalIds.has(issue.id)
            ? "open"
            : routeOwner
              ? "assigned"
              : "open";
        summaries[issue.id] = {
          issueId: issue.id,
          issueRef: resultRef,
          status,
          owner: status === "assigned" && routeOwner ? routeOwner : issue.ownerAgent,
        };
      }
    }
  }
  for (const issueId of input.closedIssueIds) {
    const existing = summaries[issueId];
    if (existing) summaries[issueId] = {...existing, status: "resolved"};
  }
  return summaries;
};

const buildState = (input: {
  base: ProductionState;
  index: ArtifactIndex;
  critics: readonly NormalizedCritics[];
  finalGate: ContentGateEvaluation;
  initialRoute: RouteSelection;
  closedIssueIds: readonly string[];
  revision?: ContentRevisionRound;
  status: ContentLoopStatus;
}): ProductionState => {
  const routeSummary = input.initialRoute
    ? "action" in input.initialRoute
      ? "content route escalated:" + input.initialRoute.reason
      : "content route " + input.initialRoute.ownerAgent + "/" + input.initialRoute.routeTarget
    : "content route none";
  const openSummary =
    input.finalGate.issueIds.length > 0 ? input.finalGate.issueIds.join(",") : "none";
  const nextState = {
    ...input.base,
    phase:
      input.status === "completed"
        ? ("content_eval" as const)
        : input.status === "needs-revision"
          ? ("content_revision" as const)
          : ("halted" as const),
    round: input.revision?.round ?? input.base.round,
    artifacts: artifactsForState(input.base, input.index),
    evaluations: addEvaluationSummaries(input.base, input.critics),
    issues: addIssueSummaries({
      state: input.base,
      critics: input.critics,
      initialRoute: input.initialRoute,
      closedIssueIds: input.closedIssueIds,
      finalIssues: input.finalGate.issues,
    }),
    gates: {
      ...input.base.gates,
      ...Object.fromEntries(
        input.critics.flatMap((criticMap) =>
          contentCriticNames.map((name) => [
            name,
            criticMap[name]!.result.verdict === "PASS" ? "pass" : "fail",
          ]),
        ),
      ),
      "content-evaluation": input.finalGate.gate,
    },
    revisionLog: [
      ...input.base.revisionLog,
      ...(input.revision?.disposition === "selected"
        ? input.revision.changedArtifactIds.map((artifactId) => {
            const pointer = input.index.selected[artifactId];
            const record = pointer
              ? input.index.artifacts.find(
                  (candidate) =>
                    candidate.ref.artifactId === artifactId &&
                    candidate.ref.revision === pointer.revision &&
                    candidate.ref.sha256 === pointer.sha256,
                )
              : undefined;
            if (!record) throw new Error("CONTENT_REVISION_LOG_REF_MISSING:" + artifactId);
            return {
              revisionId: "content:round-" + input.revision!.round + ":" + artifactId,
              artifactRef: record.ref,
            };
          })
        : []),
    ],
    decisions: {
      ...input.base.decisions,
      ["content-gate-r" + (input.revision?.round ?? input.base.round)]: {
        code: "CONTENT_" + input.finalGate.verdict,
        summary: "gate=" + input.finalGate.verdict + "; openIssues=" + openSummary,
      },
      "content-route": {code: "CONTENT_ROUTE", summary: routeSummary},
    },
    haltReason:
      input.status === "escalated"
        ? "content loop escalated to human editor"
        : input.base.haltReason,
  };
  return assertReferenceOnlyState(nextState);
};

const primaryRoute = (selection: RouteSelection): selection is PrimaryRoute =>
  selection !== null && !("action" in selection);

const humanRoute = (selection: RouteSelection): selection is HumanEscalation =>
  selection !== null && "action" in selection;

const runCritics = async (input: {
  state: ProductionState;
  index: ArtifactIndex;
  nodes: ContentLoopNodes;
  round: number;
  trace: ContentTraceStep[];
}): Promise<NormalizedCritics> => {
  const context = contextFor(input.state, input.index, input.round);
  const group = "content-critics-r" + input.round;
  const outputs = await Promise.all(
    contentCriticNames.map(async (name) => {
      const runner = input.nodes.critics[name];
      if (!runner) throw new Error("CONTENT_CRITIC_RUNNER_MISSING:" + name);
      return [name, await runner(context)] as const;
    }),
  );
  const normalized = normalizeCriticMap(outputs, input.index);
  for (const name of contentCriticNames) {
    const execution = normalized[name]!;
    input.trace.push({
      node: name,
      round: input.round,
      status: execution.result.verdict === "PASS" ? "completed" : "rejected",
      parallel: true,
      parallelGroup: group,
      issueIds: execution.result.issues
        .filter((issue) => issue.status === "open")
        .map((issue) => issue.id),
      artifactIds: execution.result.reviewedArtifacts.map((artifact) => artifact.artifactId),
    });
  }
  return normalized;
};

const refRecord = (refs: readonly ArtifactRef[]): Record<string, ArtifactRef> =>
  Object.fromEntries(refs.map((ref) => [ref.artifactId, ref]));

const selectedRefs = (index: ArtifactIndex): ArtifactRef[] =>
  selectedRecords(index).map((record) => record.ref);

const requireArtifactHash = (
  refs: ReadonlyMap<string, ArtifactRef>,
  artifactId: string,
  phase: "before" | "after",
): string => {
  const ref = refs.get(artifactId);
  if (!ref) throw new Error(`CONTENT_REVISION_${phase.toUpperCase()}_REF_MISSING:${artifactId}`);
  return ref.sha256;
};

const resultRefs = (critics: NormalizedCritics): ArtifactRef[] =>
  Object.values(reportRefMap(critics));

const targetDimensionsFor = (
  issues: readonly CriticIssue[],
): Array<string | EvaluationDimensionSelector> | undefined => {
  const selectors = new Set<string>();
  for (const issue of issues) {
    if (issue.category === "attention.hook") selectors.add("audience-critic:hook");
    if (issue.category === "retention.first-3-seconds") {
      selectors.add("retention-critic:first3Seconds");
    }
    if (issue.category === "retention.first-30-seconds") {
      selectors.add("retention-critic:first30Seconds");
    }
    if (issue.category === "retention.mid-video") {
      selectors.add("retention-critic:midVideoEngagement");
    }
    if (issue.category === "retention.ending") {
      selectors.add("retention-critic:endingSatisfaction");
    }
    if (issue.category === "compliance.platform-policy") {
      selectors.add("compliance-critic:platformPolicy");
    }
    if (issue.category === "compliance.advertising-language") {
      selectors.add("compliance-critic:advertisingLanguage");
    }
    if (issue.category === "compliance.brand-safety") {
      selectors.add("compliance-critic:brandSafety");
    }
  }
  return selectors.size > 0 ? [...selectors].sort() : undefined;
};

const strategyAt = (level: RevisionStrategyLevel): OwnerRevisionRequest["strategy"] =>
  strategyLadder[`L${level}` as keyof typeof strategyLadder];

const revisionKindAttempts = (
  ledger: RevisionLedger,
  kind: ReturnType<typeof inferRevisionBudgetKind>,
): number =>
  ledger.attempts.filter(
    (attempt) =>
      attempt.disposition === "rejected" &&
      inferRevisionBudgetKind({ownerAgent: attempt.ownerAgent}) === kind,
  ).length;

const routingEscalation = (
  reason: HumanEscalation["reason"],
  issueIds: readonly string[],
): HumanEscalation => ({
  action: "escalate",
  kind: "human-escalation",
  route: null,
  routeTarget: "human-editor",
  reason,
  reasonCode: reason,
  issueIds: [...issueIds],
});

const assertLedgerMatchesSelection = (ledger: RevisionLedger, index: ArtifactIndex): void => {
  const selected = selectedRefMap(index);
  for (const ref of [...Object.values(ledger.selected), ...Object.values(ledger.best)]) {
    const current = selected.get(ref.artifactId);
    if (!current || current.sha256 !== ref.sha256 || current.revision !== ref.revision) {
      throw new Error(`CONTENT_REVISION_LEDGER_SELECTION_MISMATCH:${ref.artifactId}`);
    }
  }
};

const retainCandidateRecords = (base: ArtifactIndex, candidate: ArtifactIndex): ArtifactIndex => {
  let retained = base;
  for (const record of candidate.artifacts) {
    if (
      retained.artifacts.some(
        (existing) =>
          existing.ref.artifactId === record.ref.artifactId &&
          existing.ref.sha256 === record.ref.sha256,
      )
    ) {
      continue;
    }
    retained = registerCandidate(
      retained,
      record.ref,
      record.producedByExecutionId,
      record.dependencies,
    );
  }
  return artifactIndexSchema.parse(retained);
};

/** Runs the bounded M2 single-owner loop until a Pareto-valid candidate passes or escalation fires. */
export const runContentLoop = async (input: ContentLoopInput): Promise<ContentLoopResult> => {
  const baseState = assertReferenceOnlyState(input.state);
  let index = ensureArtifactIndex(baseState, input.artifactIndex);
  const trace: ContentTraceStep[] = [];
  const revisions: ContentRevisionRound[] = [];
  const allCritics: NormalizedCritics[] = [];
  const initialRound = baseState.round;
  const budgetLimits = input.budgetLimits ?? defaultRevisionBudgetLimits;
  const now = input.now ?? Date.now;

  const visualOutput = input.nodes.visualDirector
    ? outputArray(await input.nodes.visualDirector(contextFor(baseState, index, initialRound)))
    : [];
  const visualApplied = applySelectedRevisions({
    index,
    outputs: visualOutput,
    executionId: baseState.runId + ":visual-director:r" + initialRound,
    requireChanged: false,
    allowNewArtifactIds: true,
    lockedRanges: input.lockedRanges,
  });
  index = visualApplied.index;
  trace.push({
    node: "visual-director",
    round: initialRound,
    status: "completed",
    artifactIds: visualOutput.map((output) => output.ref.artifactId),
    changedArtifactIds: visualApplied.changed.map((ref) => ref.artifactId),
  });

  let bestCritics = await runCritics({
    state: baseState,
    index,
    nodes: input.nodes,
    round: initialRound,
    trace,
  });
  allCritics.push(bestCritics);
  let bestGate = evaluateContentGate(bestCritics, index);
  trace.push({
    node: "gate-evaluator",
    round: initialRound,
    status: bestGate.verdict === "PASS" ? "completed" : "rejected",
    issueIds: bestGate.issueIds,
  });

  let ledger = input.revisionLedger
    ? revisionLedgerSchema.parse(input.revisionLedger)
    : createRevisionLedger({
        episodeId: baseState.episodeId,
        selected: refRecord(selectedRefs(index)),
        best: refRecord(selectedRefs(index)),
        baseline: {
          rubricVersions: Object.fromEntries(
            contentCriticNames.map((name) => [name, bestCritics[name]!.result.rubricVersion]),
          ),
        },
      });
  if (ledger.episodeId !== baseState.episodeId) {
    throw new Error("CONTENT_REVISION_LEDGER_EPISODE_MISMATCH");
  }
  assertLedgerMatchesSelection(ledger, index);

  if (bestGate.verdict === "PASS") {
    const state = buildState({
      base: baseState,
      index,
      critics: allCritics,
      finalGate: bestGate,
      initialRoute: null,
      closedIssueIds: [],
      status: "completed",
    });
    return {
      status: "completed",
      state,
      artifactIndex: index,
      artifacts: state.artifacts,
      gate: bestGate,
      route: null,
      nextRoute: null,
      closedIssueIds: [],
      newIssues: [],
      criticReports: reportMap(bestCritics),
      criticResultRefs: reportRefMap(bestCritics),
      revisions,
      revisionLedger: ledger,
      trace,
    };
  }

  let firstRoute: RouteSelection = null;
  let candidateHistory: RevisionHistoryEntry[] = [selectedRefs(index)];
  let lastCandidateRefs: ArtifactRef[] = [];

  for (;;) {
    const resourceBudget = checkRevisionResourceBudget(ledger, budgetLimits);
    let route = selectPrimaryRoute({
      issues: bestGate.issues,
      budget: {
        ...(resourceBudget.remainingCostUsd === undefined
          ? {}
          : {remainingCostUsd: resourceBudget.remainingCostUsd}),
        ...(resourceBudget.remainingWallclockSeconds === undefined
          ? {}
          : {remainingWallclockSeconds: resourceBudget.remainingWallclockSeconds}),
      },
      config: input.routingConfig ?? defaultOwnershipConfig,
      provenance: input.provenance,
    });
    if (firstRoute === null) firstRoute = route;

    if (primaryRoute(route)) {
      const routeIssues = bestGate.issues.filter((issue) => route!.issueIds.includes(issue.id));
      const budgetKind = inferRevisionBudgetKind({
        ownerAgent: route.ownerAgent,
        issueCategories: routeIssues.map((issue) => issue.category),
      });
      if (!checkRevisionBudget(ledger, budgetKind, budgetLimits).allowed) {
        route = routingEscalation("budget-exhausted", bestGate.issueIds);
      }
    }

    trace.push(
      route
        ? {
            node: "issue-router",
            round: baseState.round + revisions.length,
            status: humanRoute(route) ? "escalated" : "completed",
            issueIds: route.issueIds,
            ownerAgent: primaryRoute(route) ? route.ownerAgent : undefined,
            routeTarget: route.routeTarget,
          }
        : {
            node: "issue-router",
            round: baseState.round + revisions.length,
            status: "escalated",
            issueIds: bestGate.issueIds,
          },
    );

    if (!primaryRoute(route)) {
      const reason =
        humanRoute(route) && route.reason === "budget-exhausted"
          ? "budget-exhausted"
          : "unroutable";
      const humanEscalation = createHumanEscalation({
        episodeId: baseState.episodeId,
        reason,
        openIssueIds: bestGate.issueIds,
        selectedBestRefs: Object.values(ledger.best),
        rejectedCandidateRefs: lastCandidateRefs,
        decisionNeeded: "Review the unresolved content issues and choose a safe next revision.",
        forbiddenAutomaticActions: [
          "do not start production",
          "do not overwrite selected best artifacts",
        ],
      });
      const lastRevision = revisions.at(-1);
      const state = buildState({
        base: baseState,
        index,
        critics: allCritics,
        finalGate: bestGate,
        initialRoute: route,
        closedIssueIds: [],
        revision: lastRevision,
        status: "escalated",
      });
      return {
        status: "escalated",
        state,
        artifactIndex: index,
        artifacts: state.artifacts,
        gate: bestGate,
        route: firstRoute,
        nextRoute: route,
        closedIssueIds: [],
        newIssues: bestGate.issues,
        criticReports: reportMap(bestCritics),
        criticResultRefs: reportRefMap(bestCritics),
        revision: lastRevision,
        revisions,
        revisionLedger: ledger,
        humanEscalation,
        trace,
      };
    }

    const routeIssues = bestGate.issues.filter((issue) => route.issueIds.includes(issue.id));
    const authorizedArtifactIds = [
      ...new Set(routeIssues.map((issue) => issue.affectedArtifact.artifactId)),
    ].sort();
    const ownerRunner = input.nodes.reviseOwner ?? input.nodes.ownerRevisions?.[route.ownerAgent];
    if (!ownerRunner) {
      throw new Error("CONTENT_OWNER_REVISION_RUNNER_MISSING:" + route.ownerAgent);
    }
    const budgetKind = inferRevisionBudgetKind({
      ownerAgent: route.ownerAgent,
      issueCategories: routeIssues.map((issue) => issue.category),
    });
    const strategyLevel = strategyForAttempt(revisionKindAttempts(ledger, budgetKind) + 1);
    const revisionRound = baseState.round + revisions.length + 1;
    const beforeRefs = selectedRefs(index);
    const beforeRefMap = new Map(beforeRefs.map((ref) => [ref.artifactId, ref]));
    const startedAt = now();
    const execution = normalizeRevisionExecution(
      await ownerRunner({
        ownerAgent: route.ownerAgent,
        route,
        issues: routeIssues,
        context: contextFor(baseState, index, revisionRound),
        authorizedArtifactIds,
        strategyLevel,
        strategy: strategyAt(strategyLevel),
      }),
    );
    const measuredWallclockSeconds = Math.max(0, (now() - startedAt) / 1000);
    const usage = {
      costUsd: execution.usage.costUsd ?? 0,
      wallclockSeconds:
        execution.usage.wallclockSeconds && execution.usage.wallclockSeconds > 0
          ? execution.usage.wallclockSeconds
          : measuredWallclockSeconds,
    };

    const appliedRevision = applySelectedRevisions({
      index,
      outputs: execution.revisions,
      executionId: baseState.runId + ":round-" + revisionRound + ":" + route.ownerAgent,
      authorizedArtifactIds: new Set(authorizedArtifactIds),
      requireChanged: false,
      allowNewArtifactIds: false,
      lockedRanges: input.lockedRanges,
    });
    let candidateIndex = appliedRevision.index;
    trace.push({
      node: route.routeTarget,
      round: revisionRound,
      status: "completed",
      ownerAgent: route.ownerAgent,
      routeTarget: route.routeTarget,
      issueIds: route.issueIds,
      changedArtifactIds: appliedRevision.changed.map((ref) => ref.artifactId),
      strategyLevel,
    });

    const staleBeforeRefresh = staleDescendantRecords(
      candidateIndex,
      appliedRevision.changed.map((ref) => ref.artifactId),
    );
    const refreshed = await refreshDownstream({
      index: candidateIndex,
      state: baseState,
      nodes: input.nodes,
      round: revisionRound,
      changedArtifactIds: appliedRevision.changed.map((ref) => ref.artifactId),
      lockedRanges: input.lockedRanges,
    });
    candidateIndex = refreshed.index;
    trace.push({
      node: "downstream-refresh",
      round: revisionRound,
      status: "completed",
      changedArtifactIds: appliedRevision.changed.map((ref) => ref.artifactId),
      staleArtifactIds: staleBeforeRefresh.map((record) => record.ref.artifactId),
      refreshedArtifactIds: refreshed.refreshed.map((ref) => ref.artifactId),
    });

    const candidateCritics = await runCritics({
      state: baseState,
      index: candidateIndex,
      nodes: input.nodes,
      round: revisionRound,
      trace,
    });
    allCritics.push(candidateCritics);
    const candidateGate = evaluateContentGate(candidateCritics, candidateIndex);
    trace.push({
      node: "gate-evaluator",
      round: revisionRound,
      status: candidateGate.verdict === "PASS" ? "completed" : "rejected",
      issueIds: candidateGate.issueIds,
    });

    const candidateRefs = selectedRefs(candidateIndex);
    const candidateRefMap = new Map(candidateRefs.map((ref) => [ref.artifactId, ref]));
    lastCandidateRefs = candidateRefs;
    const history = [...candidateHistory, candidateRefs];
    const assessment = assessRevision({
      before: beforeRefs,
      candidate: candidateRefs,
      beforeEvaluations: reportMap(bestCritics),
      candidateEvaluations: reportMap(candidateCritics),
      beforeIssues: bestGate.issues,
      candidateIssues: candidateGate.issues,
      targetIssueIds: route.issueIds,
      currentArtifacts: candidateRefs,
      history,
      ledger,
      budgetKind,
      budgetLimits,
    });
    const selection = selectBest({
      best: beforeRefs,
      candidate: candidateRefs,
      beforeEvaluations: reportMap(bestCritics),
      candidateEvaluations: reportMap(candidateCritics),
      beforeIssues: bestGate.issues,
      candidateIssues: candidateGate.issues,
      targetIssueIds: route.issueIds,
      currentArtifacts: candidateRefs,
      targetGain: input.selectionPolicy?.targetGain,
      targetedDimensions:
        input.selectionPolicy?.targetedDimensions ?? targetDimensionsFor(routeIssues),
      protectedDimensions: input.selectionPolicy?.protectedDimensions,
    });
    const disposition = assessment.requiresHuman
      ? "human-required"
      : assessment.disposition === "candidate-eligible" && selection.selected
        ? "selected"
        : "rejected";
    const selectionReason =
      assessment.oscillation.action === "escalate"
        ? "oscillation"
        : assessment.noProgress.detected
          ? "no-progress"
          : assessment.regression.rejected
            ? "regression"
            : selection.reason;
    const revision: ContentRevisionRound = {
      round: revisionRound,
      ownerAgent: route.ownerAgent,
      routeTarget: route.routeTarget,
      issueIds: route.issueIds,
      authorizedArtifactIds,
      changedArtifactIds: appliedRevision.changed.map((ref) => ref.artifactId),
      staleArtifactIds: staleBeforeRefresh.map((record) => record.ref.artifactId),
      refreshedArtifactIds: refreshed.refreshed.map((ref) => ref.artifactId),
      beforeHashes: Object.fromEntries(
        authorizedArtifactIds.map((artifactId) => [
          artifactId,
          requireArtifactHash(beforeRefMap, artifactId, "before"),
        ]),
      ),
      afterHashes: Object.fromEntries(
        authorizedArtifactIds.map((artifactId) => [
          artifactId,
          requireArtifactHash(candidateRefMap, artifactId, "after"),
        ]),
      ),
      strategyLevel,
      disposition,
      selectionReason,
      regressionIds: assessment.regression.findings.map((finding) => finding.id),
      oscillationIds: assessment.oscillation.oscillationIds,
      costUsd: usage.costUsd,
      wallclockSeconds: usage.wallclockSeconds,
    };
    revisions.push(revision);
    trace.push({
      node: "candidate-selector",
      round: revisionRound,
      status:
        disposition === "selected"
          ? "completed"
          : disposition === "human-required"
            ? "escalated"
            : "rejected",
      issueIds: route.issueIds,
      changedArtifactIds: revision.changedArtifactIds,
      strategyLevel,
      disposition,
      selectionReason,
    });

    ledger = recordRevisionAttempt(ledger, {
      revisionId: baseState.runId + ":revision:" + revisionRound,
      executionId: baseState.runId + ":round-" + revisionRound + ":" + route.ownerAgent,
      ownerAgent: route.ownerAgent,
      issueIds: route.issueIds,
      before: beforeRefs,
      candidate: candidateRefs,
      evaluations: resultRefs(candidateCritics),
      disposition,
      regressionIds: revision.regressionIds,
      oscillationIds: revision.oscillationIds,
      createdAt: new Date(now()).toISOString(),
      budgetKind,
      budgetLimits,
      costUsd: usage.costUsd,
      wallclockSeconds: usage.wallclockSeconds,
    });

    if (disposition === "selected") {
      index = candidateIndex;
      bestCritics = candidateCritics;
      bestGate = candidateGate;
      const closedIssueIds = route.issueIds.filter(
        (issueId) => !candidateGate.issueIds.includes(issueId),
      );
      const state = buildState({
        base: baseState,
        index,
        critics: allCritics,
        finalGate: bestGate,
        initialRoute: firstRoute,
        closedIssueIds,
        revision,
        status: "completed",
      });
      return {
        status: "completed",
        state,
        artifactIndex: index,
        artifacts: state.artifacts,
        gate: bestGate,
        route: firstRoute,
        nextRoute: null,
        closedIssueIds,
        newIssues: [],
        criticReports: reportMap(bestCritics),
        criticResultRefs: reportRefMap(bestCritics),
        revision,
        revisions,
        revisionLedger: ledger,
        trace,
      };
    }

    index = retainCandidateRecords(index, candidateIndex);
    candidateHistory = history;
    if (disposition === "human-required") {
      const escalationRoute = routingEscalation("oscillation", bestGate.issueIds);
      const humanEscalation = createHumanEscalation({
        episodeId: baseState.episodeId,
        reason: "oscillation",
        openIssueIds: bestGate.issueIds,
        selectedBestRefs: Object.values(ledger.best),
        rejectedCandidateRefs: candidateRefs,
        decisionNeeded: "Choose a stable content direction after repeated candidate oscillation.",
        forbiddenAutomaticActions: [
          "do not dispatch another automatic revision",
          "do not replace the selected best artifacts",
        ],
      });
      const state = buildState({
        base: baseState,
        index,
        critics: allCritics,
        finalGate: bestGate,
        initialRoute: escalationRoute,
        closedIssueIds: [],
        revision,
        status: "escalated",
      });
      return {
        status: "escalated",
        state,
        artifactIndex: index,
        artifacts: state.artifacts,
        gate: bestGate,
        route: firstRoute,
        nextRoute: escalationRoute,
        closedIssueIds: [],
        newIssues: bestGate.issues,
        criticReports: reportMap(bestCritics),
        criticResultRefs: reportRefMap(bestCritics),
        revision,
        revisions,
        revisionLedger: ledger,
        humanEscalation,
        trace,
      };
    }
  }
};

/** Graph-shaped adapter for callers that prefer invoke semantics. */
export const createContentSubgraph = (nodes: ContentLoopNodes) => ({
  invoke: (input: Omit<ContentLoopInput, "nodes">) => runContentLoop({...input, nodes}),
});
