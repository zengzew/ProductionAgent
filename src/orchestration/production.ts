import fs from "node:fs";
import path from "node:path";
import {
  productionStateSchema,
  assertReferenceOnlyState,
  type ProductionState,
  type ProductionStateUpdate,
} from "./state";
import {withControlledOrchestrationRun, type ConcurrencyConfig} from "./concurrency";
import {
  productionStageCheckpointSchema,
  productionStageRequestSchema,
  productionStageResultSchema,
  type ProductionStageCheckpoint,
  type ProductionStageName,
  type ProductionStageRequest,
  type ProductionStageResult,
} from "./schemas/production";
import {
  createDeterministicToolAdapter,
  productionStageInputSetHash,
  productionStageOrder,
  type DeterministicToolAdapterOptions,
  type ProductionStageAdapter,
} from "./agents/adapters/deterministic-tool";
import {assertArtifactRefsBytes} from "./artifact-registry";
import {ensureArtifactIndexForRefs} from "./human-decision";
import {readExecutionEventLog, stableEventId} from "./observability";
import {
  defaultBoundedRetryPolicy,
  resolveBoundedRetryPolicy,
  retryDelayMilliseconds,
  type BoundedRetryPolicy,
  type FailureClock,
} from "./failure-replay";
import type {ArtifactRef} from "./schemas/artifact";
import type {CacheEvent} from "./schemas/cache-event";
import {
  createCheckpointCommittedEvent,
  createObservabilityCheckpoint,
  createStageStartedEvent,
  createStageTerminalEvent,
  createObservabilityControlEvent,
  writeRunReport,
  type ObservabilityEvent,
  type ObservabilityEventSink,
} from "./observability-gate";
import {mediaProductionInputArtifacts} from "./graph/media-lifecycle";

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
  requireFormalApproval?: boolean;
  retryPolicy?: Partial<BoundedRetryPolicy>;
  retryClock?: FailureClock;
  onRetry?: (input: {
    stage: ProductionStageName;
    attempt: number;
    nextAttempt: number;
    delayMs: number;
    code: string;
  }) => void | Promise<void>;
  observability?: ProductionObservabilityOptions;
  concurrency?: ConcurrencyConfig;
};

export type ProductionObservabilityOptions = {
  eventSink: ObservabilityEventSink;
  now?: () => string;
  checkpointVersion?: string;
  runnerVersion?: string;
  eventLogPath?: string;
  reportPath?: string;
  cacheEvents?: () => readonly CacheEvent[];
  cacheEventLogPath?: string;
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
  const refs = [
    state.contentManifestRef,
    ...priorStageArtifacts(state, stage),
    ...mediaProductionInputArtifacts(state, stage),
  ];
  const byIdentity = new Map<string, ArtifactRef>();
  for (const ref of refs) {
    byIdentity.set(`${ref.artifactId}:${ref.revision}:${ref.sha256}`, ref);
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );
};

export const productionStageRequestForState = (input: {
  state: ProductionState;
  stage: ProductionStageName;
  upstreamArtifacts: readonly ArtifactRef[];
  authorizedArtifactIds?: readonly string[];
  forceRerun?: boolean;
  attempt?: number;
}): ProductionStageRequest => {
  if (!input.state.contentManifestRef) {
    throw new Error("PRODUCTION_CONTENT_MANIFEST_REQUIRED");
  }
  const cached = input.state.productionStages[input.stage];
  const attempt = input.attempt ?? (input.state.attempts[input.stage] ?? 0) + 1;
  return productionStageRequestSchema.parse({
    contractVersion: "production-stage-v1",
    executionId: `${input.state.runId}:production:${input.stage}:${attempt}`,
    episodeId: input.state.episodeId,
    stage: input.stage,
    attempt,
    revisionRound: input.state.round,
    approvalEpoch: input.state.approvalEpoch,
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
    events: update.events
      ? [...state.events, ...update.events]
          .reduce(
            (merged, event) => {
              const existing = merged.find((candidate) => candidate.eventId === event.eventId);
              if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
                throw new Error(`PRODUCTION_EVENT_SUMMARY_COLLISION:${event.eventId}`);
              }
              return existing ? merged : [...merged, event];
            },
            [] as ProductionState["events"],
          )
          .sort((left, right) => left.eventId.localeCompare(right.eventId))
      : state.events,
  };
  if (!update.haltReason && update.phase !== "halted") delete next.haltReason;
  return productionStateSchema.parse(assertReferenceOnlyState(next));
};

const persistedStageAttempt = (input: {
  state: ProductionState;
  stage: ProductionStageName;
  eventLogPath?: string;
}): number => {
  if (!input.eventLogPath) return 0;
  const eventLogPath = path.resolve(input.eventLogPath);
  if (!fs.existsSync(eventLogPath)) return 0;
  const executionPrefix = `${input.state.runId}:production:${input.stage}:`;
  return Math.max(
    0,
    ...readExecutionEventLog(eventLogPath)
      .filter(
        (event) =>
          event.episodeId === input.state.episodeId &&
          event.stage === input.stage &&
          event.executionId.startsWith(executionPrefix),
      )
      .map((event) => event.attempt),
  );
};

export type ProductionStageRetryResult = {
  state: ProductionState;
  request: ProductionStageRequest;
  result: ProductionStageResult;
  results: readonly ProductionStageResult[];
  delaysMs: readonly number[];
  observabilityEvents: readonly ObservabilityEvent[];
};

/** Runs one stage with a total-attempt cap; failed attempts never publish partial outputs. */
export const runProductionStageWithRetry = async (input: {
  state: ProductionState;
  stage: ProductionStageName;
  adapter: ProductionStageAdapter;
  upstreamArtifacts?: readonly ArtifactRef[];
  authorizedArtifactIds?: readonly string[];
  forceRerun?: boolean;
  retryPolicy?: Partial<BoundedRetryPolicy>;
  retryClock?: FailureClock;
  enableDeliveryRepair?: boolean;
  onRetry?: ProductionPipelineInput["onRetry"];
  observability?: ProductionObservabilityOptions;
}): Promise<ProductionStageRetryResult> => {
  const policy = resolveBoundedRetryPolicy({...defaultBoundedRetryPolicy, ...input.retryPolicy});
  let state = input.state;
  const results: ProductionStageResult[] = [];
  const delaysMs: number[] = [];
  const observabilityEvents: ObservabilityEvent[] = [];
  const upstreamArtifacts = [
    ...(input.upstreamArtifacts ?? priorStageArtifacts(state, input.stage)),
  ];
  const stateAttempt = (state.attempts[input.stage] ?? 0) + 1;
  const persistedAttempt = persistedStageAttempt({
    state,
    stage: input.stage,
    eventLogPath: input.observability?.eventLogPath,
  });
  const recoveryAttempt = Math.max(stateAttempt, persistedAttempt + 1);
  let restartEventPending = recoveryAttempt > stateAttempt || stateAttempt > 1;

  for (let dispatch = 0; dispatch < policy.maxAttempts; dispatch += 1) {
    const request = productionStageRequestForState({
      state,
      stage: input.stage,
      upstreamArtifacts,
      authorizedArtifactIds: input.authorizedArtifactIds,
      forceRerun: input.forceRerun,
      attempt: dispatch === 0 ? recoveryAttempt : undefined,
    });
    const inputSetHash = productionStageInputSetHash(input.stage, request.inputArtifacts);
    const startedAt = input.observability?.now?.() ?? new Date().toISOString();
    if (input.observability) {
      if (restartEventPending) {
        const restartEvent = createObservabilityControlEvent({
          state,
          eventType: "retry.scheduled",
          stage: input.stage,
          executionId: `${state.runId}:restart:${input.stage}:${recoveryAttempt}`,
          attempt: recoveryAttempt - 1,
          nextAttempt: recoveryAttempt,
          inputArtifacts: request.inputArtifacts,
          occurredAt: startedAt,
          decisionCode:
            recoveryAttempt > stateAttempt
              ? "EXECUTION_RECOVERY_SCHEDULED"
              : "PRODUCTION_STAGE_RESTART_SCHEDULED",
          decisionSummary:
            recoveryAttempt > stateAttempt
              ? `${input.stage} resumed after persisted interruption at attempt ${persistedAttempt}`
              : `${input.stage} restarted from persisted attempt ${recoveryAttempt - 1}`,
        });
        input.observability.eventSink(restartEvent);
        observabilityEvents.push(restartEvent);
        state = applyStateUpdate(state, {
          events: [
            {
              eventId: restartEvent.eventId,
              executionId: restartEvent.executionId,
              status: restartEvent.status,
            },
          ],
        });
        restartEventPending = false;
      }
      const startCheckpoint = createObservabilityCheckpoint({
        state,
        checkpointId: `${state.episodeId}:${state.runId}:checkpoint:${input.stage}:${request.attempt}:start`,
        checkpointVersion: input.observability.checkpointVersion,
        committedAt: startedAt,
      });
      const startedEvent = createStageStartedEvent({
        state,
        stage: input.stage,
        executionId: request.executionId,
        attempt: request.attempt,
        inputArtifacts: request.inputArtifacts,
        checkpoint: startCheckpoint,
        occurredAt: startedAt,
        inputSetHash,
      });
      input.observability.eventSink(startedEvent);
      observabilityEvents.push(startedEvent);
    }
    let adapterError: unknown;
    let result: ProductionStageResult;
    try {
      result = await input.adapter(request);
    } catch (error) {
      adapterError = error;
      const detail = boundedSummary(error instanceof Error ? error.message : String(error));
      result = productionStageResultSchema.parse({
        contractVersion: "production-stage-result-v1",
        executionId: request.executionId,
        episodeId: request.episodeId,
        stage: request.stage,
        status: "FAILED",
        attempt: request.attempt,
        inputSetHash,
        inputArtifacts: request.inputArtifacts,
        outputArtifacts: [],
        issues: [],
        decision: {code: "PRODUCTION_ADAPTER_THROWN", summary: detail},
        failure: {code: "PRODUCTION_ADAPTER_THROWN", retryable: false, detail},
      });
    }
    results.push(result);
    state = applyStateUpdate(
      state,
      productionStageStateUpdate(request, result, {
        enableDeliveryRepair: input.enableDeliveryRepair,
      }),
    );
    if (input.observability) {
      const terminalAt = input.observability.now?.() ?? new Date().toISOString();
      const observabilityState = productionStateSchema.parse({
        ...state,
        events: [
          ...state.events,
          {
            eventId: stableEventId(request.executionId, "execution.started"),
            executionId: request.executionId,
            status: "STARTED",
          },
          {
            eventId: stableEventId(request.executionId, "checkpoint.committed"),
            executionId: request.executionId,
            status: "SUCCEEDED",
          },
          {
            eventId: stableEventId(
              request.executionId,
              result.status === "SUCCEEDED"
                ? "execution.completed"
                : result.status === "FAILED"
                  ? "execution.failed"
                  : "execution.skipped",
            ),
            executionId: request.executionId,
            status:
              result.status === "SUCCEEDED"
                ? "SUCCEEDED"
                : result.status === "FAILED"
                  ? "FAILED"
                  : "SKIPPED",
          },
        ],
      });
      const terminalCheckpoint = createObservabilityCheckpoint({
        state: observabilityState,
        checkpointId: `${state.episodeId}:${state.runId}:checkpoint:${input.stage}:${request.attempt}`,
        checkpointVersion: input.observability.checkpointVersion,
        committedAt: terminalAt,
      });
      const checkpointEvent = createCheckpointCommittedEvent({
        state,
        stage: input.stage,
        executionId: request.executionId,
        attempt: request.attempt,
        inputArtifacts: result.inputArtifacts,
        outputArtifacts: result.outputArtifacts,
        checkpoint: terminalCheckpoint,
        status:
          result.status === "SUCCEEDED"
            ? "succeeded"
            : result.status === "FAILED"
              ? "failed"
              : "skipped",
        occurredAt: terminalAt,
        inputSetHash: result.inputSetHash,
      });
      input.observability.eventSink(checkpointEvent);
      observabilityEvents.push(checkpointEvent);
      const terminalEvent = createStageTerminalEvent({
        state: observabilityState,
        stage: input.stage,
        executionId: request.executionId,
        attempt: request.attempt,
        status:
          result.status === "SUCCEEDED"
            ? "succeeded"
            : result.status === "FAILED"
              ? "failed"
              : "skipped",
        inputArtifacts: result.inputArtifacts,
        outputArtifacts: result.outputArtifacts,
        checkpoint: terminalCheckpoint,
        occurredAt: terminalAt,
        startedAt,
        inputSetHash: result.inputSetHash,
        decision: {
          code: result.decision.code,
          summary: result.decision.summary,
          rubricVersion: null,
          score: null,
          verdict:
            result.status === "SUCCEEDED" ? "PASS" : result.status === "FAILED" ? "REJECT" : null,
          issueIds: result.issues.map((issue) => issue.issueId),
          route: null,
          criticResultRef: null,
        },
        ...(result.failure
          ? {
              error: {
                code: result.failure.code,
                class: "tooling" as const,
                retryable: result.failure.retryable,
                message: result.failure.detail,
                providerRequestId: null,
                retryAfterMs: null,
                invalidOutputHash: null,
              },
            }
          : {}),
        runnerVersion: input.observability.runnerVersion,
      });
      input.observability.eventSink(terminalEvent);
      observabilityEvents.push(terminalEvent);
      state = applyStateUpdate(state, {
        events: [
          ...observabilityEvents.map((event) => ({
            eventId: event.eventId,
            executionId: event.executionId,
            status: event.status,
          })),
        ],
      });
    }
    if (adapterError !== undefined) throw adapterError;
    if (result.status !== "FAILED") {
      return {state, request, result, results, delaysMs, observabilityEvents};
    }

    const shouldRetry = Boolean(result.failure?.retryable) && dispatch + 1 < policy.maxAttempts;
    if (!shouldRetry) return {state, request, result, results, delaysMs, observabilityEvents};

    const failure = {
      code: result.failure?.code ?? "PRODUCTION_STAGE_FAILED",
      class: "transient-api" as const,
      retryable: true,
      message: result.failure?.detail ?? `${input.stage} failed`,
      retryAfterMs: null,
    };
    const delayMs = retryDelayMilliseconds({
      failure,
      failedAttempt: request.attempt,
      policy,
    });
    delaysMs.push(delayMs);
    await input.onRetry?.({
      stage: input.stage,
      attempt: request.attempt,
      nextAttempt: request.attempt + 1,
      delayMs,
      code: failure.code,
    });
    if (input.retryClock) await input.retryClock.sleep(delayMs);
    state = applyStateUpdate(state, {phase: "production"});
    if (input.observability) {
      const retryAt = input.observability.now?.() ?? new Date().toISOString();
      const retryEvent = createObservabilityControlEvent({
        state,
        eventType: "retry.scheduled",
        stage: input.stage,
        executionId: request.executionId,
        attempt: request.attempt,
        nextAttempt: request.attempt + 1,
        inputArtifacts: request.inputArtifacts,
        occurredAt: retryAt,
        decisionCode: "RETRY_SCHEDULED",
        decisionSummary: `${input.stage} retry scheduled after ${failure.code}`,
      });
      input.observability.eventSink(retryEvent);
      observabilityEvents.push(retryEvent);
      state = applyStateUpdate(state, {
        events: [
          {
            eventId: retryEvent.eventId,
            executionId: retryEvent.executionId,
            status: retryEvent.status,
          },
        ],
      });
    }
  }

  throw new Error("PRODUCTION_RETRY_LOOP_INTERNAL_ERROR");
};

export type ProductionStartOptions = {
  /** M3.4 callers opt in; legacy M3.1-M3.3 fixture APIs remain framework-compatible. */
  requireFormalApproval?: boolean;
};

export const assertProductionAuthorization = (state: ProductionState): void => {
  const authorization = state.productionAuthorization;
  if (!authorization) throw new Error("PRODUCTION_HUMAN_APPROVAL_REQUIRED");
  if (authorization.approvalEpoch !== state.approvalEpoch) {
    throw new Error(
      `PRODUCTION_APPROVAL_EPOCH_STALE:${authorization.approvalEpoch}:${state.approvalEpoch}`,
    );
  }
  if (
    authorization.manifestRef.artifactId !== state.contentManifestRef?.artifactId ||
    authorization.manifestRef.revision !== state.contentManifestRef?.revision ||
    authorization.manifestRef.sha256 !== state.contentManifestRef?.sha256 ||
    authorization.manifestRef.path !== state.contentManifestRef?.path
  ) {
    throw new Error("PRODUCTION_AUTHORIZATION_MANIFEST_MISMATCH");
  }
  const approval = state.approvals[authorization.decisionId];
  if (
    !approval ||
    approval.status !== "approved" ||
    approval.decision !== "approve" ||
    approval.gate !== authorization.gate ||
    approval.approvalEpoch !== authorization.approvalEpoch
  ) {
    throw new Error("PRODUCTION_HUMAN_APPROVAL_RECORD_MISSING");
  }
};

export const assertProductionStart = (
  state: ProductionState,
  options: ProductionStartOptions = {},
): void => {
  assertReferenceOnlyState(state);
  if (!state.contentManifestRef) throw new Error("PRODUCTION_CONTENT_MANIFEST_REQUIRED");
  if (options.requireFormalApproval) assertProductionAuthorization(state);
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
const runProductionPipelineInternal = async (
  input: ProductionPipelineInput,
): Promise<ProductionPipelineResult> => {
  assertProductionStart(input.state, {requireFormalApproval: input.requireFormalApproval});
  assertArtifactRefsBytes(input.repoRoot, [
    ...(input.state.contentManifestRef ? [input.state.contentManifestRef] : []),
    ...stateArtifactRefs(input.state),
  ]);
  const adapter =
    input.adapter ??
    createDeterministicToolAdapter({
      repoRoot: input.repoRoot,
      ...input.adapterOptions,
    });
  let state = input.state;
  let upstreamArtifacts: ArtifactRef[] = [];
  const results: ProductionStageResult[] = [];
  const observabilityEvents: ObservabilityEvent[] = [];

  const recordObservabilityEvents = (events: readonly ObservabilityEvent[]): void => {
    for (const event of events) {
      if (!observabilityEvents.some((candidate) => candidate.eventId === event.eventId)) {
        observabilityEvents.push(event);
      }
    }
  };

  const writeReport = (finalState: ProductionState): void => {
    if (!input.observability) return;
    writeRunReport({
      repoRoot: input.repoRoot,
      episodeId: finalState.episodeId,
      runId: finalState.runId,
      state: finalState,
      events: observabilityEvents,
      cacheEvents: input.observability.cacheEvents?.(),
      cacheEventLogPath: input.observability.cacheEventLogPath,
      reportPath: input.observability.reportPath,
    });
  };

  for (const stage of productionStageOrder) {
    const execution = await runProductionStageWithRetry({
      state,
      stage,
      adapter,
      upstreamArtifacts,
      retryPolicy: input.retryPolicy,
      retryClock: input.retryClock,
      enableDeliveryRepair: false,
      onRetry: input.onRetry,
      observability: input.observability,
    });
    state = execution.state;
    recordObservabilityEvents(execution.observabilityEvents);
    results.push(...execution.results);
    if (execution.result.status === "FAILED") {
      writeReport(state);
      return {status: "FAILED", state, results, failedStage: stage};
    }
    upstreamArtifacts = [...execution.result.outputArtifacts];
  }
  writeReport(state);
  return {status: "SUCCEEDED", state, results};
};

export const runProductionPipeline = async (
  input: ProductionPipelineInput,
): Promise<ProductionPipelineResult> =>
  withControlledOrchestrationRun({
    repoRoot: input.repoRoot,
    identity: {
      episodeId: input.state.episodeId,
      runId: input.state.runId,
      threadId: input.state.episodeId,
      traceId: `${input.state.episodeId}:run:${input.state.runId}`,
    },
    config: input.concurrency,
    run: () => runProductionPipelineInternal(input),
  });

export const createProductionStageNode =
  (input: {
    repoRoot?: string;
    stage: ProductionStageName;
    adapter: ProductionStageAdapter;
    authorizedArtifactIds?: (state: ProductionState) => readonly string[] | undefined;
    forceRerun?: (state: ProductionState) => boolean | undefined;
    requireFormalApproval?: boolean;
    retryPolicy?: Partial<BoundedRetryPolicy>;
    retryClock?: FailureClock;
    onRetry?: ProductionPipelineInput["onRetry"];
    observability?: ProductionObservabilityOptions;
  }) =>
  async (state: ProductionState): Promise<ProductionStateUpdate> => {
    assertProductionStart(state, {requireFormalApproval: input.requireFormalApproval});
    const execution = await runProductionStageWithRetry({
      state,
      stage: input.stage,
      adapter: input.adapter,
      upstreamArtifacts: productionStageInputArtifacts(state, input.stage).filter(
        (ref) => ref.artifactId !== state.contentManifestRef?.artifactId,
      ),
      authorizedArtifactIds: input.authorizedArtifactIds?.(state),
      forceRerun: input.forceRerun?.(state),
      retryPolicy: input.retryPolicy,
      retryClock: input.retryClock,
      enableDeliveryRepair: true,
      onRetry: input.onRetry,
      observability: input.observability,
    });
    const request = execution.request;
    const result = execution.result;
    const resultArtifacts = [
      ...result.outputArtifacts,
      ...result.issues.map((issue) => issue.issueRef),
    ];
    if (input.repoRoot && resultArtifacts.length > 0) {
      assertArtifactRefsBytes(input.repoRoot, resultArtifacts);
      ensureArtifactIndexForRefs({
        repoRoot: input.repoRoot,
        episodeId: state.episodeId,
        refs: resultArtifacts,
        executionId: request.executionId,
      });
    }
    const update = productionStageStateUpdate(request, result, {enableDeliveryRepair: true});
    if (
      request.forceRerun &&
      state.productionRepair.forceRerunStage === input.stage &&
      ["repairing", "unfreeze-approved", "unfreeze-complete"].includes(
        state.productionRepair.status,
      )
    ) {
      update.productionRepair = {
        ...state.productionRepair,
        forceRerunStage: null,
      };
    }
    if (execution.observabilityEvents.length > 0) {
      update.events = execution.observabilityEvents.map((event) => ({
        eventId: event.eventId,
        executionId: event.executionId,
        status: event.status,
      }));
    }
    return update;
  };

export const productionCheckpointForState = (
  state: ProductionState,
  stage: ProductionStageName,
): ProductionStageCheckpoint | undefined => state.productionStages[stage];
