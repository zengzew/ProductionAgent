import {
  productionStateSchema,
  assertReferenceOnlyState,
  type ProductionState,
  type ProductionStateUpdate,
} from "./state";
import {
  productionStageCheckpointSchema,
  productionStageRequestSchema,
  type ProductionStageCheckpoint,
  type ProductionStageName,
  type ProductionStageRequest,
  type ProductionStageResult,
} from "./schemas/production";
import {
  createDeterministicToolAdapter,
  productionStageOrder,
  type DeterministicToolAdapterOptions,
  type ProductionStageAdapter,
} from "./agents/adapters/deterministic-tool";
import type {ArtifactRef} from "./schemas/artifact";

const boundedSummary = (value: string, maxBytes = 500): string => {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let output = value;
  while (Buffer.byteLength(output, "utf8") > maxBytes - 3) output = output.slice(0, -1);
  return `${output}...`;
};

export type ProductionPipelineInput = {
  repoRoot: string;
  state: ProductionState;
  adapter?: ProductionStageAdapter;
  adapterOptions?: Omit<DeterministicToolAdapterOptions, "repoRoot">;
};

export type ProductionPipelineResult = {
  status: "SUCCEEDED" | "FAILED";
  state: ProductionState;
  results: readonly ProductionStageResult[];
  failedStage?: ProductionStageName;
};

const stateArtifactRefs = (state: ProductionState): ArtifactRef[] =>
  Object.values(state.artifacts).sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );

const priorStageArtifacts = (state: ProductionState, stage: ProductionStageName): ArtifactRef[] => {
  const stageIndex = productionStageOrder.indexOf(stage);
  const refs: ArtifactRef[] = [];
  for (const priorStage of productionStageOrder.slice(0, stageIndex)) {
    const checkpoint = state.productionStages[priorStage];
    if (checkpoint?.status === "SUCCEEDED" || checkpoint?.status === "SKIPPED") {
      refs.push(...checkpoint.outputArtifacts);
    }
  }
  return refs.sort((left, right) => left.artifactId.localeCompare(right.artifactId));
};

export const productionStageInputArtifacts = (
  state: ProductionState,
  stage: ProductionStageName,
): ArtifactRef[] => {
  if (!state.contentManifestRef) throw new Error("PRODUCTION_CONTENT_MANIFEST_REQUIRED");
  return [state.contentManifestRef, ...priorStageArtifacts(state, stage)].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );
};

export const productionStageRequestForState = (input: {
  state: ProductionState;
  stage: ProductionStageName;
  upstreamArtifacts: readonly ArtifactRef[];
  authorizedArtifactIds?: readonly string[];
  forceRerun?: boolean;
}): ProductionStageRequest => {
  if (!input.state.contentManifestRef) {
    throw new Error("PRODUCTION_CONTENT_MANIFEST_REQUIRED");
  }
  const cached = input.state.productionStages[input.stage];
  return productionStageRequestSchema.parse({
    contractVersion: "production-stage-v1",
    executionId: `${input.state.runId}:production:${input.stage}:${(input.state.attempts[input.stage] ?? 0) + 1}`,
    episodeId: input.state.episodeId,
    stage: input.stage,
    attempt: (input.state.attempts[input.stage] ?? 0) + 1,
    revisionRound: input.state.round,
    contentManifestRef: input.state.contentManifestRef,
    inputArtifacts: [input.state.contentManifestRef, ...input.upstreamArtifacts],
    previousArtifacts: stateArtifactRefs(input.state),
    ...(input.authorizedArtifactIds
      ? {authorizedArtifactIds: [...new Set(input.authorizedArtifactIds)].sort()}
      : {}),
    ...(input.forceRerun ? {forceRerun: true} : {}),
    ...(cached ? {cached} : {}),
  });
};

export const productionStageStateUpdate = (
  request: ProductionStageRequest,
  result: ProductionStageResult,
  options: {enableDeliveryRepair?: boolean} = {},
): ProductionStateUpdate => {
  if (request.executionId !== result.executionId) {
    throw new Error("PRODUCTION_RESULT_EXECUTION_ID_MISMATCH");
  }
  if (request.stage !== result.stage || request.episodeId !== result.episodeId) {
    throw new Error("PRODUCTION_RESULT_STAGE_OR_EPISODE_MISMATCH");
  }
  const checkpoint: ProductionStageCheckpoint = productionStageCheckpointSchema.parse({
    stage: result.stage,
    status: result.status,
    attempt: result.attempt,
    inputSetHash: result.inputSetHash,
    outputArtifacts: result.outputArtifacts,
    issues: result.issues,
    decision: result.decision,
    ...(result.failure ? {failure: result.failure} : {}),
  });
  const update: ProductionStateUpdate = {
    phase:
      options.enableDeliveryRepair &&
      result.status === "FAILED" &&
      result.stage === "validate:delivery" &&
      result.issues.length > 0
        ? "production_revision"
        : result.status === "FAILED"
          ? "halted"
          : result.stage === "validate:delivery"
            ? "delivery_eval"
            : "production",
    artifacts: Object.fromEntries(
      [...result.outputArtifacts, ...result.issues.map((issue) => issue.issueRef)].map(
        (artifact) => [artifact.artifactId, artifact],
      ),
    ),
    attempts: {[result.stage]: result.attempt},
    productionStages: {[result.stage]: checkpoint},
    ...(result.issues.length > 0
      ? {
          productionIssues: Object.fromEntries(
            result.issues.map((issue) => [
              issue.issueId,
              {
                issueId: issue.issueId,
                issueRef: issue.issueRef,
                status: issue.status,
                owner: issue.ownerAgent,
                category: issue.category,
                severity: issue.severity,
                routeTarget: issue.routeTarget,
                restartAt: issue.restartAt,
                affectedArtifactId: issue.affectedArtifact.artifactId,
                affectedArtifactSha256: issue.affectedArtifact.sha256,
                locator: issue.locator,
                summary: issue.summary,
              },
            ]),
          ),
        }
      : {}),
  };
  if (result.failure && (result.issues.length === 0 || !options.enableDeliveryRepair)) {
    update.haltReason = boundedSummary(
      `${result.stage}:${result.failure.code}:${result.failure.detail}`,
    );
  }
  return update;
};

const applyStateUpdate = (
  state: ProductionState,
  update: ProductionStateUpdate,
): ProductionState => {
  const next = {
    ...state,
    ...update,
    artifacts: {...state.artifacts, ...(update.artifacts ?? {})},
    attempts: {...state.attempts, ...(update.attempts ?? {})},
    productionStages: {...state.productionStages, ...(update.productionStages ?? {})},
    productionIssues: {...state.productionIssues, ...(update.productionIssues ?? {})},
    productionRepair: update.productionRepair ?? state.productionRepair,
  };
  if (!update.haltReason && update.phase !== "halted") delete next.haltReason;
  return productionStateSchema.parse(assertReferenceOnlyState(next));
};

export const assertProductionStart = (state: ProductionState): void => {
  assertReferenceOnlyState(state);
  if (!state.contentManifestRef) throw new Error("PRODUCTION_CONTENT_MANIFEST_REQUIRED");
  if (!(
    state.phase === "frozen" ||
    state.phase === "production" ||
    state.phase === "delivery_eval" ||
    state.phase === "production_revision" ||
    state.phase === "production_ready" ||
    state.phase === "halted"
  )) {
    throw new Error(`PRODUCTION_PHASE_NOT_AUTHORIZED:${state.phase}`);
  }
};

/**
 * Framework-neutral sequential production execution. A graph may call this as
 * one node or use `createProductionStageNode` for one checkpoint per stage.
 */
export const runProductionPipeline = async (
  input: ProductionPipelineInput,
): Promise<ProductionPipelineResult> => {
  assertProductionStart(input.state);
  const adapter =
    input.adapter ??
    createDeterministicToolAdapter({
      repoRoot: input.repoRoot,
      ...input.adapterOptions,
    });
  let state = input.state;
  let upstreamArtifacts: ArtifactRef[] = [];
  const results: ProductionStageResult[] = [];

  for (const stage of productionStageOrder) {
    const request = productionStageRequestForState({state, stage, upstreamArtifacts});
    const result = await adapter(request);
    results.push(result);
    state = applyStateUpdate(state, productionStageStateUpdate(request, result));
    if (result.status === "FAILED") {
      return {status: "FAILED", state, results, failedStage: stage};
    }
    upstreamArtifacts = [...result.outputArtifacts];
  }
  return {status: "SUCCEEDED", state, results};
};

export const createProductionStageNode =
  (input: {
    stage: ProductionStageName;
    adapter: ProductionStageAdapter;
    authorizedArtifactIds?: (state: ProductionState) => readonly string[] | undefined;
    forceRerun?: (state: ProductionState) => boolean | undefined;
  }) =>
  async (state: ProductionState): Promise<ProductionStateUpdate> => {
    assertProductionStart(state);
    const request = productionStageRequestForState({
      state,
      stage: input.stage,
      upstreamArtifacts: priorStageArtifacts(state, input.stage),
      authorizedArtifactIds: input.authorizedArtifactIds?.(state),
      forceRerun: input.forceRerun?.(state),
    });
    const result = await input.adapter(request);
    const update = productionStageStateUpdate(request, result, {enableDeliveryRepair: true});
    if (request.forceRerun && state.productionRepair.forceRerunStage === input.stage) {
      update.productionRepair = {
        ...state.productionRepair,
        forceRerunStage: null,
      };
    }
    return update;
  };

export const productionCheckpointForState = (
  state: ProductionState,
  stage: ProductionStageName,
): ProductionStageCheckpoint | undefined => state.productionStages[stage];
