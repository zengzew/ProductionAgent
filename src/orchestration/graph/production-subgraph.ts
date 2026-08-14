import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  compileProductionGraph,
  type FoundationNode,
  type LocalCheckpointer,
  type ProductionGraphDestination,
  pauseForUnfreezeApproval,
} from "../lg-compat";
import {
  createDeterministicToolAdapter,
  productionStageInputSetHash,
  productionStageOrder,
  type DeterministicToolAdapterOptions,
  type ProductionStageAdapter,
} from "../agents/adapters/deterministic-tool";
import {
  assertProductionStart,
  createProductionStageNode,
  productionStageInputArtifacts,
  type ProductionObservabilityOptions,
} from "../production";
import {
  DEFAULT_PRODUCTION_REPAIR_ROUNDS,
  productionRepairRouteSchema,
  productionRepairStateSchema,
  type ProductionIssue,
  type ProductionRepairRoute,
  type ProductionStageName,
} from "../schemas/production";
import type {ArtifactRef} from "../schemas/artifact";
import {
  artifactRefIsIndexed,
  artifactRefSelectionMatches,
  markStaleTransitively,
  readArtifactIndex,
} from "../artifact-registry";
import type {BoundedRetryPolicy, FailureClock} from "../failure-replay";
import {
  selectPrimaryRoute,
  type PrimaryRoute,
  type RouteSelection,
  type RoutingIssue,
} from "../routing";
import {assertReferenceOnlyState, type ProductionState, type ProductionStateUpdate} from "../state";
import {
  applyUnfreezeEdits,
  createUnfreezeRequest,
  persistUnfreezeDecision,
  readUnfreezeDecision,
  readUnfreezeRequest,
  refreezeAfterUnfreeze,
} from "../freeze";
import {
  applyHumanDirectEdits,
  ensureArtifactIndexForRefs,
  persistHumanDecision,
  persistHumanIssue,
  readHumanDecision,
} from "../human-decision";
import {humanDecisionSchema, type HumanDecision} from "../schemas/human-decision";
import {
  unfreezeContentGateResultSchema,
  unfreezeResumeSchema,
  type UnfreezeAuthorization,
  type UnfreezeContentGateResult,
  type UnfreezeEdit,
  type UnfreezeRequest,
} from "../schemas/unfreeze";
import type {ArtifactIndex} from "../schemas/artifact";
import type {ConcurrencyConfig} from "../concurrency";
import {
  createObservabilityCheckpoint,
  createObservabilityControlEvent,
  type ObservabilityEvent,
} from "../observability-gate";

export type ProductionSubgraphOptions = {
  repoRoot: string;
  checkpointer: LocalCheckpointer;
  adapter?: ProductionStageAdapter;
  adapterOptions?: Omit<DeterministicToolAdapterOptions, "repoRoot">;
  maxRepairRounds?: number;
  requireFormalApproval?: boolean;
  retryPolicy?: Partial<BoundedRetryPolicy>;
  retryClock?: FailureClock;
  observability?: ProductionObservabilityOptions;
  unfreeze?: ProductionUnfreezeOptions;
  concurrency?: ConcurrencyConfig;
};

export type ProductionSubgraphRunInput = ProductionSubgraphOptions & {
  state: ProductionState;
  config?: {
    configurable: {
      thread_id: string;
      episode_id?: string;
      run_id?: string;
      trace_id?: string;
      checkpoint_id?: string;
      [key: string]: unknown;
    };
  };
};

export type UnfreezeRequestPlanInput = {
  state: ProductionState;
  issues: readonly ProductionIssue[];
  contentManifestRef: ArtifactRef;
};

export type UnfreezeRequestPlan = {
  authorizedEdits: readonly UnfreezeAuthorization[];
  restartAt: ProductionStageName;
};

export type UnfreezeRequestPlanner = (
  input: UnfreezeRequestPlanInput,
) => UnfreezeRequestPlan | Promise<UnfreezeRequestPlan>;

export type UnfreezeEditorInput = {
  repoRoot: string;
  state: ProductionState;
  request: UnfreezeRequest;
  decision: ReturnType<typeof readUnfreezeDecision>;
};

export type UnfreezeEditor = (
  input: UnfreezeEditorInput,
) => readonly UnfreezeEdit[] | Promise<readonly UnfreezeEdit[]>;

export type UnfreezeContentGateInput = {
  repoRoot: string;
  state: ProductionState;
  request: UnfreezeRequest;
  decision: ReturnType<typeof readUnfreezeDecision>;
  changedArtifactRefs: readonly ArtifactRef[];
  artifactIndex: ArtifactIndex;
};

export type UnfreezeContentGateRunner = (
  input: UnfreezeContentGateInput,
) => UnfreezeContentGateResult | Promise<UnfreezeContentGateResult>;

export type ProductionUnfreezeOptions = {
  plan?: UnfreezeRequestPlanner;
  edit?: UnfreezeEditor;
  validate?: UnfreezeContentGateRunner;
  now?: () => string;
};

const boundedSummary = (value: string, maxBytes = 500): string => {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let output = value;
  while (Buffer.byteLength(output, "utf8") > maxBytes - 3) output = output.slice(0, -1);
  return `${output}...`;
};

const sha256 = (bytes: Buffer): string => crypto.createHash("sha256").update(bytes).digest("hex");

const currentRefMatches = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const bytes = fs.readFileSync(path.resolve(repoRoot, ref.path));
    return bytes.byteLength === ref.sizeBytes && sha256(bytes) === ref.sha256;
  } catch {
    return false;
  }
};

const checkpointIsReusable = (
  repoRoot: string,
  state: ProductionState,
  stage: ProductionStageName,
): boolean => {
  const checkpoint = state.productionStages[stage];
  if (!checkpoint || (checkpoint.status !== "SUCCEEDED" && checkpoint.status !== "SKIPPED")) {
    return false;
  }
  const inputs = productionStageInputArtifacts(state, stage);
  if (checkpoint.inputSetHash !== productionStageInputSetHash(stage, inputs)) return false;
  return (
    currentRefMatches(repoRoot, state.contentManifestRef!) &&
    inputs.every((ref) => currentRefMatches(repoRoot, ref)) &&
    checkpoint.outputArtifacts.every((ref) => currentRefMatches(repoRoot, ref)) &&
    [...inputs, ...checkpoint.outputArtifacts].every(
      (ref) => !artifactRefIsIndexed(repoRoot, ref) || artifactRefSelectionMatches(repoRoot, ref),
    )
  );
};

const firstNonReusableStage = (
  repoRoot: string,
  state: ProductionState,
): ProductionStageName | undefined =>
  productionStageOrder.find((stage) => !checkpointIsReusable(repoRoot, state, stage));

const stageIndex = (stage: ProductionStageName): number => productionStageOrder.indexOf(stage);

const repairClosure = (restartAt: ProductionStageName): readonly ProductionStageName[] =>
  productionStageOrder.slice(stageIndex(restartAt));

const authorizedArtifactsForRepair = (
  state: ProductionState,
  restartAt: ProductionStageName,
  affectedArtifactIds: readonly string[],
): string[] => {
  const ids = new Set(affectedArtifactIds);
  for (const stage of repairClosure(restartAt)) {
    for (const artifact of state.productionStages[stage]?.outputArtifacts ?? []) {
      ids.add(artifact.artifactId);
    }
  }
  if (repairClosure(restartAt).includes("validate:delivery")) {
    ids.add(`${state.episodeId}:production:receipt-validate-delivery`);
  }
  return [...ids].sort();
};

const predictedStaleArtifacts = (
  repoRoot: string,
  episodeId: string,
  changedArtifactIds: readonly string[],
): string[] => {
  const registryPath = path.resolve(repoRoot, `content/${episodeId}/artifact-index.json`);
  if (!fs.existsSync(registryPath)) return [];
  try {
    const before = readArtifactIndex(registryPath);
    const after = markStaleTransitively(before, changedArtifactIds);
    const changed = new Set(changedArtifactIds);
    return after.artifacts
      .filter((record) => {
        if (changed.has(record.ref.artifactId) || record.state !== "stale") return false;
        const previous = before.artifacts.find(
          (candidate) =>
            candidate.ref.artifactId === record.ref.artifactId &&
            candidate.ref.revision === record.ref.revision &&
            candidate.ref.sha256 === record.ref.sha256,
        );
        return previous?.state === "selected";
      })
      .map((record) => record.ref.artifactId)
      .sort();
  } catch {
    return [];
  }
};

const issueSummary = (issue: ProductionIssue): ProductionState["productionIssues"][string] => ({
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
});

const deliveryIssues = (state: ProductionState): ProductionIssue[] => {
  const checkpoint = state.productionStages["validate:delivery"];
  return (checkpoint?.issues ?? []).filter((issue) => issue.status === "open");
};

const routingIssue = (issue: ProductionIssue): RoutingIssue => ({
  id: issue.issueId,
  category: issue.category,
  severity: issue.severity,
  status: issue.status,
  affectedArtifact: {
    artifactId: issue.affectedArtifact.artifactId,
    path: issue.affectedArtifact.path,
    sha256: issue.affectedArtifact.sha256,
    locator: issue.locator,
    producer: issue.affectedArtifact.producer,
  },
  ownerAgent: issue.ownerAgent,
  routeTarget: issue.routeTarget,
});

const restartStageForTarget = (target: string): ProductionStageName | undefined => {
  if (target === "captions" || target === "timeline") return "timeline";
  if (target === "tts") return "tts";
  if (target === "render") return "render:smoke";
  return undefined;
};

const productionRoute = (selection: RouteSelection): ProductionRepairRoute | undefined => {
  if (!selection || !("ownerAgent" in selection)) return undefined;
  if (selection.ownerAgent !== "production-executor") return undefined;
  const restartAt = restartStageForTarget(selection.routeTarget);
  if (!restartAt) return undefined;
  return productionRepairRouteSchema.parse({
    ownerAgent: selection.ownerAgent,
    routeTarget: selection.routeTarget,
    restartAt,
    reasonCode: selection.reasonCode,
    issueIds: selection.issueIds,
  });
};

const isPrimaryRoute = (selection: RouteSelection): selection is PrimaryRoute =>
  Boolean(selection && "ownerAgent" in selection);

const routeReason = (selection: RouteSelection): string =>
  selection && "reason" in selection ? selection.reason : "no-deterministic-production-owner";

const stageDestination = (stage: ProductionStageName): ProductionGraphDestination => {
  const next = productionStageOrder[stageIndex(stage) + 1];
  return next ?? "production_ready";
};

const changedOutputArtifactIds = (
  request: Parameters<ProductionStageAdapter>[0],
  result: Awaited<ReturnType<ProductionStageAdapter>>,
): string[] => {
  const previous = new Map(
    request.previousArtifacts.map((artifact) => [artifact.artifactId, artifact]),
  );
  return result.outputArtifacts
    .filter((artifact) => {
      const previousArtifact = previous.get(artifact.artifactId);
      return (
        !previousArtifact ||
        previousArtifact.revision !== artifact.revision ||
        previousArtifact.sha256 !== artifact.sha256 ||
        previousArtifact.path !== artifact.path
      );
    })
    .map((artifact) => artifact.artifactId)
    .sort();
};

const selectedPointerSignature = (index: ArtifactIndex, artifactId: string): string | undefined => {
  const pointer = index.selected[artifactId];
  return pointer ? `${pointer.revision}:${pointer.sha256}:${pointer.path}` : undefined;
};

const assertUnfreezeValidationScope = (input: {
  repoRoot: string;
  before: ArtifactIndex;
  after: ArtifactIndex;
  request: UnfreezeRequest;
  decisionRef: ArtifactRef;
  validatorRefs: readonly ArtifactRef[];
  criticRefs: readonly ArtifactRef[];
}): void => {
  for (const ref of [...input.validatorRefs, ...input.criticRefs]) {
    if (!currentRefMatches(input.repoRoot, ref)) {
      throw new Error(`UNFREEZE_VALIDATION_REF_HASH_MISMATCH:${ref.artifactId}`);
    }
  }
  const allowed = new Set([
    ...input.request.authorizedEdits.map((authorization) => authorization.artifactRef.artifactId),
    input.request.contentManifestRef.artifactId,
    input.decisionRef.artifactId,
    ...input.validatorRefs.map((ref) => ref.artifactId),
    ...input.criticRefs.map((ref) => ref.artifactId),
  ]);
  const ids = new Set([
    ...Object.keys(input.before.selected),
    ...Object.keys(input.after.selected),
  ]);
  for (const artifactId of ids) {
    if (
      selectedPointerSignature(input.before, artifactId) ===
      selectedPointerSignature(input.after, artifactId)
    ) {
      continue;
    }
    if (!allowed.has(artifactId)) {
      throw new Error(`UNFREEZE_VALIDATOR_UNAUTHORIZED_ARTIFACT:${artifactId}`);
    }
  }
};

const unfreezeAuditRefs = (request: UnfreezeRequest, requestRef: ArtifactRef): ArtifactRef[] => [
  requestRef,
  request.contentManifestRef,
  ...request.authorizedEdits.map((authorization) => authorization.artifactRef),
];

const isFormalHumanResume = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.gate === "unfreeze-approval" ||
    typeof record.decisionId === "string" ||
    typeof record.reviewer === "string" ||
    record.decision === "direct-edit" ||
    record.action === "direct-edit"
  );
};

const formalDecisionIdForLegacyUnfreeze = (input: {
  request: UnfreezeRequest;
  decision: "approve" | "reject";
  actorId: string;
  reason: string;
  decidedAt: string;
  authorizations: readonly {artifactId: string; owner: string}[];
}): string =>
  `human-unfreeze-${crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        requestId: input.request.requestId,
        approvalEpoch: input.request.approvalEpoch,
        decision: input.decision,
        actorId: input.actorId,
        reason: input.reason,
        decidedAt: input.decidedAt,
        authorizations: [...input.authorizations].sort((left, right) =>
          left.artifactId.localeCompare(right.artifactId),
        ),
      }),
    )
    .digest("hex")
    .slice(0, 24)}`;

const defaultUnfreezeHumanIssue = (ref: ArtifactRef) => ({
  category: "delivery.timeline" as const,
  severity: "blocker" as const,
  locator: {kind: "whole-artifact" as const, value: "unfreeze-request"},
  affectedArtifactRef: ref,
});

const parseFormalUnfreezeDecision = (input: {
  value: unknown;
  request: UnfreezeRequest;
  requestRef: ArtifactRef;
  now: string;
}): HumanDecision => {
  if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) {
    throw new Error("HUMAN_DECISION_REQUIRED");
  }
  const value = input.value as Record<string, unknown>;
  const refs = unfreezeAuditRefs(input.request, input.requestRef);
  const raw: Record<string, unknown> = {
    schemaVersion: value.schemaVersion,
    decisionId: value.decisionId,
    runId: value.runId ?? input.request.runId,
    gate: "unfreeze-approval",
    decision: value.decision ?? value.action,
    reviewer: value.reviewer ?? value.actorId,
    timestamp: value.timestamp ?? value.decidedAt ?? input.now,
    reason: value.reason,
    artifactRefs: value.artifactRefs ?? refs,
    approvalEpoch: value.approvalEpoch ?? input.request.approvalEpoch,
    authorizations: value.authorizations,
    issue: value.issue,
    edits: value.edits ?? value.directEdits,
  };
  if (raw.decision === "reject" && raw.issue === undefined) {
    raw.issue = defaultUnfreezeHumanIssue(input.request.contentManifestRef);
  }
  const decision = humanDecisionSchema.parse(raw);
  if (decision.gate !== "unfreeze-approval") throw new Error("HUMAN_DECISION_GATE_MISMATCH");
  if (decision.approvalEpoch !== input.request.approvalEpoch) {
    throw new Error("UNFREEZE_APPROVAL_EPOCH_MISMATCH");
  }
  if (decision.runId && decision.runId !== input.request.runId) {
    throw new Error("HUMAN_DECISION_RUN_MISMATCH");
  }
  if (decision.artifactRefs.some((ref) => ref.episodeId !== input.request.episodeId)) {
    throw new Error("HUMAN_DECISION_EPISODE_MISMATCH");
  }
  const requestedRefs = unfreezeAuditRefs(input.request, input.requestRef);
  const afterRefs = new Set(
    decision.edits.map(
      (edit) => `${edit.after.artifactId}:${edit.after.revision}:${edit.after.sha256}`,
    ),
  );
  for (const ref of decision.artifactRefs) {
    if (afterRefs.has(`${ref.artifactId}:${ref.revision}:${ref.sha256}`)) continue;
    const requested = requestedRefs.find((candidate) => candidate.artifactId === ref.artifactId);
    if (!requested || !sameArtifactIdentity(requested, ref)) {
      throw new Error(`UNFREEZE_STALE_ARTIFACT_REF:${ref.artifactId}`);
    }
  }
  return decision;
};

const ensureFormalUnfreezeScope = (input: {
  request: UnfreezeRequest;
  decision: HumanDecision;
}): void => {
  const requested = new Map(
    input.request.authorizedEdits.map((authorization) => [
      authorization.artifactRef.artifactId,
      authorization,
    ]),
  );
  for (const authorization of input.decision.authorizations) {
    const expected = requested.get(authorization.artifactId);
    if (!expected || expected.owner !== authorization.owner) {
      throw new Error(`UNFREEZE_AUTHORIZATION_MISMATCH:${authorization.artifactId}`);
    }
  }
  for (const edit of input.decision.edits) {
    const expected = requested.get(edit.artifactId);
    if (
      !expected ||
      expected.owner !== edit.owner ||
      !sameArtifactIdentity(edit.before, expected.artifactRef) ||
      !edit.after.path.startsWith(`content/${input.request.episodeId}/`) ||
      edit.after.path.includes("/production/")
    ) {
      throw new Error(`UNFREEZE_AUTHORIZATION_MISMATCH:${edit.artifactId}`);
    }
  }
};

const sameArtifactIdentity = (left: ArtifactRef, right: ArtifactRef): boolean =>
  left.artifactId === right.artifactId &&
  left.episodeId === right.episodeId &&
  left.path === right.path &&
  left.revision === right.revision &&
  left.sha256 === right.sha256;

const guardedAdapter =
  (adapter: ProductionStageAdapter): ProductionStageAdapter =>
  async (request) => {
    const result = await adapter(request);
    if (request.authorizedArtifactIds) {
      const authorized = new Set(request.authorizedArtifactIds);
      const unauthorized = changedOutputArtifactIds(request, result).filter(
        (artifactId) => !authorized.has(artifactId),
      );
      if (unauthorized.length > 0)
        return {
          ...result,
          status: "FAILED",
          outputArtifacts: [],
          issues: [],
          decision: {
            code: "PRODUCTION_UNAUTHORIZED_ARTIFACT",
            summary: boundedSummary(
              `repair attempted to change unauthorized artifact(s): ${unauthorized.join(",")}`,
            ),
          },
          failure: {
            code: "PRODUCTION_UNAUTHORIZED_ARTIFACT",
            retryable: false,
            detail: boundedSummary(`unauthorized artifact(s): ${unauthorized.join(",")}`),
          },
        };
    }
    return result;
  };

export const createProductionSubgraph = (input: ProductionSubgraphOptions) => {
  const adapter = guardedAdapter(
    input.adapter ??
      createDeterministicToolAdapter({
        repoRoot: input.repoRoot,
        ...input.adapterOptions,
      }),
  );
  const maxRepairRounds = input.maxRepairRounds ?? DEFAULT_PRODUCTION_REPAIR_ROUNDS;

  const emitControl = (control: {
    state: ProductionState;
    eventType: Parameters<typeof createObservabilityControlEvent>[0]["eventType"];
    stage: string;
    executionId: string;
    attempt?: number;
    decisionId?: string;
    inputArtifacts?: readonly ArtifactRef[];
    decisionCode?: string;
    decisionSummary?: string;
  }): ObservabilityEvent | undefined => {
    if (!input.observability) return undefined;
    const occurredAt = input.observability.now?.() ?? new Date().toISOString();
    const event = createObservabilityControlEvent({
      state: control.state,
      eventType: control.eventType,
      stage: control.stage,
      executionId: control.executionId,
      attempt: control.attempt ?? 1,
      decisionId: control.decisionId,
      inputArtifacts:
        control.inputArtifacts ??
        (control.state.contentManifestRef ? [control.state.contentManifestRef] : []),
      checkpoint: createObservabilityCheckpoint({
        state: control.state,
        checkpointId: `${control.state.episodeId}:${control.state.runId}:checkpoint:control:${control.eventType}:${control.executionId}`,
        checkpointVersion: input.observability.checkpointVersion,
        committedAt: occurredAt,
      }),
      occurredAt,
      decisionCode: control.decisionCode,
      decisionSummary: control.decisionSummary,
    });
    input.observability.eventSink(event);
    return event;
  };

  const eventSummary = (event: ObservabilityEvent | undefined): ProductionState["events"] =>
    event ? [{eventId: event.eventId, executionId: event.executionId, status: event.status}] : [];

  const eventSummaries = (
    events: readonly (ObservabilityEvent | undefined)[],
  ): ProductionState["events"] => events.flatMap((event) => eventSummary(event));

  const initialize: FoundationNode = (state) => {
    assertReferenceOnlyState(state);
    assertProductionStart(state, {requireFormalApproval: input.requireFormalApproval});
    const currentRepair = productionRepairStateSchema.parse(state.productionRepair);
    if (
      currentRepair.maxRounds === maxRepairRounds ||
      currentRepair.status !== "idle" ||
      currentRepair.round !== 0
    ) {
      return {};
    }
    return {
      productionRepair: {
        ...currentRepair,
        maxRounds: maxRepairRounds,
      },
    };
  };

  const chooseStart = (state: ProductionState): ProductionGraphDestination => {
    if (
      state.productionRepair.status === "production-ready" ||
      state.phase === "production_ready"
    ) {
      return firstNonReusableStage(input.repoRoot, state) ?? "production_ready";
    }
    if (state.productionRepair.status === "unfreeze-review") {
      return "production_unfreeze_review";
    }
    if (
      (state.productionRepair.status === "unfreeze-approved" ||
        state.productionRepair.status === "unfreeze-complete") &&
      state.productionRepair.forceRerunStage
    ) {
      return state.productionRepair.forceRerunStage;
    }
    if (state.productionRepair.status === "human-escalation") return "production_human_escalation";
    if (state.productionRepair.status === "repairing" && state.productionRepair.route) {
      return state.productionRepair.route.restartAt;
    }
    const deliveryCheckpoint = state.productionStages["validate:delivery"];
    if (deliveryCheckpoint?.status === "FAILED" && deliveryCheckpoint.issues.length > 0) {
      return "production_repair_router";
    }
    if (state.phase === "halted") return "production_human_escalation";
    return firstNonReusableStage(input.repoRoot, state) ?? "production_ready";
  };

  const stageNodes = Object.fromEntries(
    productionStageOrder.map((stage) => [
      stage,
      createProductionStageNode({
        stage,
        adapter,
        requireFormalApproval: input.requireFormalApproval,
        authorizedArtifactIds: (state) =>
          state.productionRepair.status === "repairing" ||
          state.productionRepair.status === "unfreeze-approved" ||
          state.productionRepair.status === "unfreeze-complete"
            ? state.productionRepair.authorizedArtifactIds
            : undefined,
        forceRerun: (state) =>
          (state.productionRepair.status === "repairing" ||
            state.productionRepair.status === "unfreeze-approved" ||
            state.productionRepair.status === "unfreeze-complete") &&
          state.productionRepair.forceRerunStage === stage,
        retryPolicy: input.retryPolicy,
        retryClock: input.retryClock,
        observability: input.observability,
      }),
    ]),
  ) as Record<ProductionStageName, FoundationNode>;

  const repairRouter: FoundationNode = async (state) => {
    const issues = deliveryIssues(state);
    const repair = productionRepairStateSchema.parse(state.productionRepair);
    const summaries = Object.fromEntries(
      issues.map((issue) => [issue.issueId, issueSummary(issue)]),
    );
    const escalate = (reason: string): ProductionStateUpdate => ({
      phase: "halted",
      productionRepair: {
        ...repair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds: issues.map((issue) => issue.issueId).sort(),
        decision: {
          code: "PRODUCTION_HUMAN_ESCALATION",
          summary: boundedSummary(`production repair stopped: ${reason}`),
        },
      },
      productionIssues: Object.fromEntries(
        issues.map((issue) => [issue.issueId, {...issueSummary(issue), status: "escalated"}]),
      ),
      gates: {delivery: "fail"},
      haltReason: boundedSummary(`production-human-escalation:${reason}`),
    });

    if (issues.length === 0) return escalate("delivery issue is missing");
    if (repair.round >= repair.maxRounds) {
      if (state.budget.unfreezeUsed >= state.budget.maxUnfreeze) {
        return escalate("unfreeze-budget-exhausted");
      }
      if (!issues.every((issue) => issue.severity === "blocker")) {
        return escalate("unfreeze-requires-blocker");
      }
      if (!state.contentManifestRef || !input.unfreeze?.plan) {
        return escalate("unfreeze-authorization-required");
      }
      try {
        const plan = await input.unfreeze.plan({
          state,
          issues,
          contentManifestRef: state.contentManifestRef,
        });
        const created = createUnfreezeRequest({
          repoRoot: input.repoRoot,
          episodeId: state.episodeId,
          runId: state.runId,
          contentManifestRef: state.contentManifestRef,
          issues,
          authorizedEdits: plan.authorizedEdits,
          restartAt: plan.restartAt,
          approvalEpoch: state.approvalEpoch,
          unfreezeUsed: state.budget.unfreezeUsed,
          maxUnfreeze: state.budget.maxUnfreeze,
        });
        const authorizedArtifactIds = created.request.authorizedEdits
          .map((authorization) => authorization.artifactRef.artifactId)
          .sort();
        const authorizedOwners = [
          ...new Set(created.request.authorizedEdits.map((authorization) => authorization.owner)),
        ].sort();
        const unfreezeEvent = emitControl({
          state,
          eventType: "unfreeze.requested",
          stage: "unfreeze",
          executionId: `${state.runId}:unfreeze:${created.request.requestId}`,
          attempt: state.budget.unfreezeUsed + 1,
          inputArtifacts: [state.contentManifestRef, created.requestRef].filter(
            (ref): ref is ArtifactRef => Boolean(ref),
          ),
          decisionCode: "UNFREEZE_REQUESTED",
          decisionSummary: "unfreeze request requires explicit human approval",
        });
        return {
          events: eventSummary(unfreezeEvent),
          phase: "unfreeze_review" as const,
          artifacts: {[created.requestRef.artifactId]: created.requestRef},
          decisions: {
            "unfreeze-request": {
              code: "UNFREEZE_REQUESTED",
              summary: boundedSummary(
                `blocker=${created.request.blockerIssues.map((issue) => issue.issueId).join(",")}; artifacts=${authorizedArtifactIds.join(",")}`,
              ),
            },
          },
          unfreeze: {
            status: "pending" as const,
            requestRef: created.requestRef,
            decisionRef: null,
            humanDecisionRef: null,
            authorizedArtifactIds,
            authorizedOwners,
            changedArtifactIds: [],
            staleArtifactIds: [],
            validatorRefs: [],
            criticRefs: [],
            resumeAt: created.request.restartAt,
            decision: {
              code: "UNFREEZE_REQUESTED",
              summary: boundedSummary("production is paused for explicit L4 unfreeze approval"),
            },
          },
          productionRepair: {
            ...repair,
            status: "unfreeze-review" as const,
            route: null,
            forceRerunStage: null,
            issueIds: created.request.blockerIssues.map((issue) => issue.issueId).sort(),
            authorizedArtifactIds: [],
            staleArtifactIds: [],
            decision: {
              code: "UNFREEZE_REQUESTED",
              summary: boundedSummary("L4 unfreeze request is awaiting human approval"),
            },
          },
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return escalate(`unfreeze-invalid:${reason}`);
      }
    }

    const routeIssues = issues.map(routingIssue);
    const selection = selectPrimaryRoute({
      issues: routeIssues,
      budget: {
        remainingRounds: repair.maxRounds - repair.round,
        maxRoundsProduction: repair.maxRounds,
        roundsUsed: {production: repair.round},
      },
    });
    const route = productionRoute(selection);
    if (!route || !isPrimaryRoute(selection)) return escalate(routeReason(selection));

    const changedIds = issues.map((issue) => issue.affectedArtifact.artifactId);
    const authorizedArtifactIds = authorizedArtifactsForRepair(state, route.restartAt, changedIds);
    const staleArtifactIds = predictedStaleArtifacts(input.repoRoot, state.episodeId, changedIds);
    const repairEvent = emitControl({
      state,
      eventType: "repair.started",
      stage: route.restartAt,
      executionId: `${state.runId}:repair:${repair.round + 1}:${route.restartAt}`,
      attempt: repair.round + 1,
      inputArtifacts: productionStageInputArtifacts(state, route.restartAt),
      decisionCode: "PRODUCTION_REPAIR_STARTED",
      decisionSummary: `${route.ownerAgent}/${route.routeTarget} reruns from ${route.restartAt}`,
    });
    const nextRepair = productionRepairStateSchema.parse({
      status: "repairing",
      round: repair.round + 1,
      maxRounds: repair.maxRounds,
      route,
      forceRerunStage: route.restartAt,
      issueIds: route.issueIds,
      authorizedArtifactIds,
      staleArtifactIds,
      decision: {
        code: "PRODUCTION_REPAIR_ROUTED",
        summary: boundedSummary(
          `${route.ownerAgent}/${route.routeTarget} will rerun from ${route.restartAt}`,
        ),
      },
    });
    return {
      events: eventSummary(repairEvent),
      phase: "production_revision",
      productionRepair: nextRepair,
      productionIssues: summaries,
      budget: {
        ...state.budget,
        roundsUsed: {
          ...state.budget.roundsUsed,
          production: repair.round + 1,
          "production-executor": repair.round + 1,
        },
      },
    };
  };

  const afterRepairRoute = (state: ProductionState): ProductionGraphDestination => {
    if (state.productionRepair.status === "human-escalation") return "production_human_escalation";
    if (state.productionRepair.status === "unfreeze-review") return "production_unfreeze_review";
    if (state.productionRepair.status === "production-ready") return "production_ready";
    return state.productionRepair.route?.restartAt ?? "production_human_escalation";
  };

  const afterUnfreezeReview = (
    state: ProductionState,
  ): "production_unfreeze_apply" | "production_human_escalation" =>
    state.productionRepair.status === "unfreeze-approved"
      ? "production_unfreeze_apply"
      : "production_human_escalation";

  const afterStage = (
    state: ProductionState,
    stage: ProductionStageName,
  ): ProductionGraphDestination => {
    const checkpoint = state.productionStages[stage];
    if (!checkpoint) return "production_human_escalation";
    if (checkpoint.status === "FAILED") {
      return stage === "validate:delivery" && checkpoint.issues.length > 0
        ? "production_repair_router"
        : "production_human_escalation";
    }
    if (stage === "validate:delivery") return "production_ready";
    return stageDestination(stage);
  };

  const unfreezeEscalation = (state: ProductionState, reason: string): ProductionStateUpdate => {
    const requestRef = state.unfreeze.requestRef;
    const issueIds = requestRef
      ? state.productionRepair.issueIds
      : Object.values(state.productionIssues)
          .filter((issue) => issue.status === "open")
          .map((issue) => issue.issueId)
          .sort();
    return {
      phase: "halted",
      productionRepair: {
        ...state.productionRepair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds,
        decision: {
          code: "UNFREEZE_HUMAN_ESCALATION",
          summary: boundedSummary(`unfreeze stopped: ${reason}`),
        },
      },
      unfreeze: {
        ...state.unfreeze,
        status: "escalated",
        decision: {
          code: "UNFREEZE_HUMAN_ESCALATION",
          summary: boundedSummary(`unfreeze stopped: ${reason}`),
        },
      },
      productionIssues: Object.fromEntries(
        Object.values(state.productionIssues)
          .filter((issue) => issue.status === "open")
          .map((issue) => [issue.issueId, {...issue, status: "escalated"}]),
      ),
      gates: {delivery: "fail", "content-evaluation": "fail"},
      haltReason: boundedSummary(`production-unfreeze-human-escalation:${reason}`),
    };
  };

  const unfreezeReview: FoundationNode = (state) => {
    const requestRef = state.unfreeze.requestRef;
    if (!requestRef) return unfreezeEscalation(state, "request-reference-missing");
    let request: UnfreezeRequest;
    try {
      request = readUnfreezeRequest(input.repoRoot, requestRef);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return unfreezeEscalation(state, `request-read-failed:${reason}`);
    }
    const resumeValue = pauseForUnfreezeApproval({
      gate: "production-unfreeze",
      requestRef,
      episodeId: state.episodeId,
      approvalEpoch: request.approvalEpoch,
      blockerIssueIds: request.blockerIssues.map((issue) => issue.issueId),
      authorizedArtifactIds: request.authorizedEdits.map(
        (authorization) => authorization.artifactRef.artifactId,
      ),
      authorizedOwners: request.authorizedEdits.map((authorization) => ({
        artifactId: authorization.artifactRef.artifactId,
        owner: authorization.owner,
      })),
      decisionOptions: ["approve", "reject"],
    });
    try {
      const formal = isFormalHumanResume(resumeValue);
      let formalDecision: HumanDecision | undefined;
      let formalPersisted: ReturnType<typeof persistHumanDecision> | undefined;
      let resume: ReturnType<typeof unfreezeResumeSchema.parse>;
      let legacyAuthorizations: {artifactId: string; owner: UnfreezeAuthorization["owner"]}[] = [];
      if (formal) {
        formalDecision = parseFormalUnfreezeDecision({
          value: resumeValue,
          request,
          requestRef,
          now: input.unfreeze?.now?.() ?? new Date().toISOString(),
        });
        if (state.processedDecisionIds.includes(formalDecision.decisionId)) {
          return {};
        }
        ensureFormalUnfreezeScope({request, decision: formalDecision});
        const editAfterIds = new Set(formalDecision.edits.map((edit) => edit.after.artifactId));
        const seededIndex = ensureArtifactIndexForRefs({
          repoRoot: input.repoRoot,
          episodeId: state.episodeId,
          refs: formalDecision.artifactRefs.filter((ref) => !editAfterIds.has(ref.artifactId)),
          executionId: `human-decision:${formalDecision.decisionId}:inputs`,
        });
        formalPersisted = persistHumanDecision({
          repoRoot: input.repoRoot,
          decision: formalDecision,
          artifactIndex: seededIndex,
          executionId: `human-decision:${formalDecision.decisionId}`,
        });
        const requestedAuthorizations = request.authorizedEdits.map((authorization) => ({
          artifactId: authorization.artifactRef.artifactId,
          owner: authorization.owner,
        }));
        legacyAuthorizations =
          formalDecision.decision === "reject"
            ? []
            : formalDecision.authorizations.length > 0
              ? formalDecision.authorizations
              : formalDecision.edits.length > 0
                ? formalDecision.edits.map((edit) => ({
                    artifactId: edit.artifactId,
                    owner: edit.owner,
                  }))
                : requestedAuthorizations;
        resume = {
          requestId: request.requestId,
          requestRef,
          decision: formalDecision.decision === "reject" ? "reject" : "approve",
          actorId: formalDecision.reviewer,
          authorizations: legacyAuthorizations,
          reason: formalDecision.reason,
          decidedAt: formalDecision.timestamp,
        };
      } else {
        const parsed = unfreezeResumeSchema.parse(resumeValue);
        if (parsed.requestId && parsed.requestId !== request.requestId) {
          throw new Error("UNFREEZE_AUTHORIZATION_MISMATCH");
        }
        if (parsed.requestRef && !sameArtifactIdentity(parsed.requestRef, requestRef)) {
          throw new Error("UNFREEZE_AUTHORIZATION_MISMATCH");
        }
        resume = parsed;
        legacyAuthorizations = [...resume.authorizations];
        const decidedAt = resume.decidedAt ?? input.unfreeze?.now?.() ?? new Date().toISOString();
        const formalDecisionId = formalDecisionIdForLegacyUnfreeze({
          request,
          decision: resume.decision,
          actorId: resume.actorId,
          reason: resume.reason,
          decidedAt,
          authorizations: legacyAuthorizations,
        });
        formalDecision = humanDecisionSchema.parse({
          decisionId: formalDecisionId,
          gate: "unfreeze-approval",
          decision: resume.decision,
          reviewer: resume.actorId,
          timestamp: decidedAt,
          reason: resume.reason,
          artifactRefs: unfreezeAuditRefs(request, requestRef),
          approvalEpoch: request.approvalEpoch,
          authorizations: legacyAuthorizations,
          ...(resume.decision === "reject"
            ? {issue: defaultUnfreezeHumanIssue(request.contentManifestRef)}
            : {}),
        });
        ensureFormalUnfreezeScope({request, decision: formalDecision});
        const seededIndex = ensureArtifactIndexForRefs({
          repoRoot: input.repoRoot,
          episodeId: state.episodeId,
          refs: formalDecision.artifactRefs,
          executionId: `human-decision:${formalDecision.decisionId}:inputs`,
        });
        formalPersisted = persistHumanDecision({
          repoRoot: input.repoRoot,
          decision: formalDecision,
          artifactIndex: seededIndex,
          executionId: `human-decision:${formalDecision.decisionId}`,
        });
      }
      const persisted = persistUnfreezeDecision({
        repoRoot: input.repoRoot,
        request,
        requestRef,
        decision: resume.decision,
        actorId: resume.actorId,
        authorizations: legacyAuthorizations,
        reason: resume.reason,
        decidedAt: resume.decidedAt,
      });
      const decisionRef = persisted.decisionRef;
      const auditDecisionRef = formalPersisted?.decisionRef ?? decisionRef;
      const decisionId = formalDecision?.decisionId ?? persisted.decision.decisionId;
      const approvalEpoch =
        formalDecision?.decision === "approve" || formalDecision?.decision === "direct-edit"
          ? state.approvalEpoch + 1
          : state.approvalEpoch;
      const humanDecisionEvent = formalDecision
        ? emitControl({
            state,
            eventType: "human-decision.recorded",
            stage: "unfreeze-approval",
            executionId: `${state.runId}:human-decision:${formalDecision.decisionId}`,
            decisionId: formalDecision.decisionId,
            inputArtifacts: unfreezeAuditRefs(request, requestRef),
            decisionCode: `HUMAN_UNFREEZE_${formalDecision.decision.toUpperCase().replaceAll("-", "_")}`,
            decisionSummary: formalDecision.reason,
          })
        : undefined;
      const unfreezeDecisionEvent = emitControl({
        state,
        eventType: resume.decision === "reject" ? "unfreeze.rejected" : "unfreeze.approved",
        stage: "unfreeze",
        executionId: `${state.runId}:unfreeze:${request.requestId}:${resume.decision}`,
        attempt: state.budget.unfreezeUsed + 1,
        inputArtifacts: unfreezeAuditRefs(request, requestRef),
        decisionCode: resume.decision === "reject" ? "UNFREEZE_REJECTED" : "UNFREEZE_APPROVED",
        decisionSummary: resume.reason,
      });
      const base = {
        artifacts: {
          [decisionRef.artifactId]: decisionRef,
          ...(formalPersisted
            ? {[formalPersisted.decisionRef.artifactId]: formalPersisted.decisionRef}
            : {}),
        },
        approvals: {
          [decisionId]: formalDecision
            ? {
                decisionRef: auditDecisionRef,
                status:
                  formalDecision.decision === "approve"
                    ? ("approved" as const)
                    : formalDecision.decision === "reject"
                      ? ("rejected" as const)
                      : ("direct-edit" as const),
                gate: "unfreeze-approval" as const,
                decision: formalDecision.decision,
                approvalEpoch,
                reason: formalDecision.reason,
              }
            : {
                decisionRef,
                status:
                  resume.decision === "approve" ? ("approved" as const) : ("rejected" as const),
              },
        },
        decisions: {
          [decisionId]: {
            code:
              formalDecision?.decision === "direct-edit"
                ? "UNFREEZE_DIRECT_EDIT"
                : resume.decision === "approve"
                  ? "UNFREEZE_APPROVED"
                  : "UNFREEZE_REJECTED",
            summary: boundedSummary(resume.reason),
          },
        },
        ...(formalDecision ? {processedDecisionIds: [formalDecision.decisionId]} : {}),
        ...(humanDecisionEvent || unfreezeDecisionEvent
          ? {events: eventSummaries([humanDecisionEvent, unfreezeDecisionEvent])}
          : {}),
      };
      if (resume.decision === "reject") {
        if (formalDecision && formalPersisted) {
          const issue = persistHumanIssue({
            repoRoot: input.repoRoot,
            decision: formalDecision,
            decisionRef: formalPersisted.decisionRef,
            artifactIndex: formalPersisted.artifactIndex,
            executionId: `human-decision:${formalDecision.decisionId}:issue`,
          });
          return {
            ...base,
            ...unfreezeEscalation(state, `rejected:${resume.reason}`),
            artifacts: {
              ...base.artifacts,
              [issue.issueRef.artifactId]: issue.issueRef,
            },
            issues: {
              [issue.issue.issueId]: {
                issueId: issue.issue.issueId,
                issueRef: issue.issueRef,
                status: "open" as const,
                owner: issue.route.ownerAgent,
              },
            },
            pendingHumanRoute: {
              ownerAgent: issue.route.ownerAgent,
              routeTarget: issue.route.routeTarget,
              restartAt: issue.route.restartAt,
              issueIds: [issue.issue.issueId],
            },
            unfreeze: {
              ...state.unfreeze,
              status: "rejected" as const,
              decisionRef,
              humanDecisionRef: formalPersisted.decisionRef,
              decision: {
                code: "UNFREEZE_REJECTED",
                summary: boundedSummary(resume.reason),
              },
            },
          };
        }
        return {
          ...base,
          ...unfreezeEscalation(state, `rejected:${resume.reason}`),
          unfreeze: {
            ...state.unfreeze,
            status: "rejected" as const,
            decisionRef,
            decision: {
              code: "UNFREEZE_REJECTED",
              summary: boundedSummary(resume.reason),
            },
          },
        };
      }
      if (state.budget.unfreezeUsed >= state.budget.maxUnfreeze) {
        return unfreezeEscalation(state, "budget-exhausted-before-approval");
      }
      const productionAuthorizedArtifactIds = authorizedArtifactsForRepair(
        state,
        request.restartAt,
        [],
      );
      return {
        ...base,
        approvalEpoch: state.approvalEpoch + 1,
        budget: {
          ...state.budget,
          unfreezeUsed: state.budget.unfreezeUsed + 1,
        },
        unfreeze: {
          ...state.unfreeze,
          status: "approved" as const,
          decisionRef,
          ...(formalPersisted ? {humanDecisionRef: formalPersisted.decisionRef} : {}),
          authorizedArtifactIds: request.authorizedEdits.map(
            (authorization) => authorization.artifactRef.artifactId,
          ),
          authorizedOwners: [
            ...new Set(request.authorizedEdits.map((authorization) => authorization.owner)),
          ].sort(),
          decision: {
            code: "UNFREEZE_APPROVED",
            summary: boundedSummary("human approved the explicit L4 artifact scope"),
          },
        },
        productionRepair: {
          ...state.productionRepair,
          status: "unfreeze-approved" as const,
          route: null,
          forceRerunStage: request.restartAt,
          authorizedArtifactIds: productionAuthorizedArtifactIds,
          staleArtifactIds: [],
          decision: {
            code: "UNFREEZE_APPROVED",
            summary: boundedSummary(
              "content edit is authorized; content gate must run before production",
            ),
          },
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return unfreezeEscalation(state, `invalid-decision:${reason}`);
    }
  };

  const unfreezeApply: FoundationNode = async (state) => {
    const requestRef = state.unfreeze.requestRef;
    const decisionRef = state.unfreeze.decisionRef;
    if (!requestRef || !decisionRef) return unfreezeEscalation(state, "approval-reference-missing");
    if (!input.unfreeze?.validate || (!input.unfreeze.edit && !state.unfreeze.humanDecisionRef)) {
      return unfreezeEscalation(state, "editor-or-content-gate-runner-missing");
    }
    try {
      const request = readUnfreezeRequest(input.repoRoot, requestRef);
      const decision = readUnfreezeDecision(input.repoRoot, decisionRef);
      if (decision.decision !== "approve") throw new Error("UNFREEZE_DECISION_NOT_APPROVED");
      const formalDecision = state.unfreeze.humanDecisionRef
        ? readHumanDecision(
            input.repoRoot,
            state.unfreeze.humanDecisionRef,
            state.episodeId,
            state.runId,
          )
        : undefined;
      let applied: {
        artifactIndex: ArtifactIndex;
        changedArtifactRefs: ArtifactRef[];
        staleArtifactIds: string[];
        lockedRanges?: ProductionState["lockedRanges"];
      };
      if (formalDecision?.decision === "direct-edit") {
        const humanApplied = applyHumanDirectEdits({
          repoRoot: input.repoRoot,
          decision: formalDecision,
          decisionRef: state.unfreeze.humanDecisionRef ?? undefined,
          existingLockedRanges: state.lockedRanges,
          executionId: `${state.runId}:unfreeze:${request.requestId}`,
        });
        applied = humanApplied;
      } else {
        const edits = await input.unfreeze.edit!({
          repoRoot: input.repoRoot,
          state,
          request,
          decision,
        });
        applied = applyUnfreezeEdits({
          repoRoot: input.repoRoot,
          request,
          decision,
          edits,
          executionId: `${state.runId}:unfreeze:${request.requestId}`,
        });
      }
      const validation = unfreezeContentGateResultSchema.parse(
        await input.unfreeze.validate({
          repoRoot: input.repoRoot,
          state,
          request,
          decision,
          changedArtifactRefs: applied.changedArtifactRefs,
          artifactIndex: applied.artifactIndex,
        }),
      );
      if (validation.gate !== "pass") throw new Error("UNFREEZE_CONTENT_GATE_FAILED");
      assertUnfreezeValidationScope({
        repoRoot: input.repoRoot,
        before: applied.artifactIndex,
        after: validation.artifactIndex,
        request,
        decisionRef,
        validatorRefs: validation.validatorRefs,
        criticRefs: validation.criticRefs,
      });
      const refrozen = refreezeAfterUnfreeze({
        repoRoot: input.repoRoot,
        request,
        decision,
        validation,
        runId: state.runId,
        approvalEpoch: state.approvalEpoch,
        previousManifestRef: request.contentManifestRef,
        frozenAt: input.unfreeze.now?.() ?? new Date().toISOString(),
      });
      const productionAuthorizedArtifactIds = authorizedArtifactsForRepair(
        state,
        request.restartAt,
        [],
      );
      const auditRefs = [
        ...applied.changedArtifactRefs,
        refrozen.manifestRef,
        ...validation.validatorRefs,
        ...validation.criticRefs,
      ];
      return {
        phase: "frozen" as const,
        contentManifestRef: refrozen.manifestRef,
        artifacts: Object.fromEntries(auditRefs.map((ref) => [ref.artifactId, ref])),
        gates: {"content-evaluation": "pass" as const},
        unfreeze: {
          ...state.unfreeze,
          status: "completed" as const,
          changedArtifactIds: applied.changedArtifactRefs.map((ref) => ref.artifactId).sort(),
          staleArtifactIds: applied.staleArtifactIds,
          validatorRefs: validation.validatorRefs,
          criticRefs: validation.criticRefs,
          resumeAt: request.restartAt,
          decision: {
            code: "UNFREEZE_CONTENT_REFREEZED",
            summary: boundedSummary(validation.summary),
          },
        },
        productionRepair: {
          ...state.productionRepair,
          status: "unfreeze-complete" as const,
          route: null,
          forceRerunStage: request.restartAt,
          authorizedArtifactIds: productionAuthorizedArtifactIds,
          staleArtifactIds: applied.staleArtifactIds,
          decision: {
            code: "UNFREEZE_CONTENT_REFREEZED",
            summary: boundedSummary(
              `content gate passed; production resumes at ${request.restartAt} with retained stale artifacts`,
            ),
          },
        },
        ...(applied.lockedRanges ? {lockedRanges: applied.lockedRanges} : {}),
        ...(formalDecision
          ? {
              productionAuthorization: {
                decisionRef: state.unfreeze.humanDecisionRef!,
                manifestRef: refrozen.manifestRef,
                decisionId: formalDecision.decisionId,
                gate: "unfreeze-approval" as const,
                approvalEpoch: state.approvalEpoch,
              },
            }
          : {}),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return unfreezeEscalation(state, `apply-failed:${reason}`);
    }
  };

  const productionReady: FoundationNode = (state) => {
    if (
      state.phase === "production_ready" &&
      state.productionRepair.status === "production-ready" &&
      Object.values(state.productionIssues).every((issue) => issue.status !== "open")
    ) {
      return {};
    }
    const issueIds = Object.values(state.productionIssues)
      .filter((issue) => issue.status === "open")
      .map((issue) => issue.issueId)
      .sort();
    const repairEvent = emitControl({
      state,
      eventType: "repair.completed",
      stage: "production",
      executionId: `${state.runId}:repair:${state.productionRepair.round}:completed`,
      attempt: Math.max(1, state.productionRepair.round),
      inputArtifacts: state.contentManifestRef ? [state.contentManifestRef] : [],
      decisionCode: "PRODUCTION_REPAIR_COMPLETED",
      decisionSummary: "production and delivery validation completed",
    });
    return {
      events: eventSummary(repairEvent),
      phase: "production_ready",
      gates: {production: "pass", delivery: "pass"},
      productionIssues: Object.fromEntries(
        Object.values(state.productionIssues)
          .filter((issue) => issue.status === "open")
          .map((issue) => [issue.issueId, {...issue, status: "resolved"}]),
      ),
      productionRepair: productionRepairStateSchema.parse({
        ...state.productionRepair,
        status: "production-ready",
        route: null,
        forceRerunStage: null,
        issueIds,
        decision: {
          code: "PRODUCTION_READY",
          summary: "delivery evaluation passed; production is ready",
        },
      }),
    };
  };

  const humanEscalation: FoundationNode = (state) => {
    if (state.phase === "halted" && state.productionRepair.status === "human-escalation") {
      return {};
    }
    const issueIds = Object.values(state.productionIssues)
      .filter((issue) => issue.status === "open")
      .map((issue) => issue.issueId)
      .sort();
    const repair = productionRepairStateSchema.parse(state.productionRepair);
    const finalIssueIds =
      repair.status === "human-escalation"
        ? repair.issueIds
        : issueIds.length > 0
          ? issueIds
          : repair.issueIds;
    const update: ProductionStateUpdate = {
      phase: "halted",
      productionRepair: {
        ...repair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds: finalIssueIds,
        decision: {
          code: "PRODUCTION_HUMAN_ESCALATION",
          summary: boundedSummary(
            repair.decision.summary || "production requires human escalation",
          ),
        },
      },
      productionIssues: Object.fromEntries(
        Object.values(state.productionIssues)
          .filter((issue) => issue.status === "open")
          .map((issue) => [issue.issueId, {...issue, status: "escalated"}]),
      ),
      gates: {delivery: "fail"},
    };
    if (!state.haltReason) {
      update.haltReason = boundedSummary(`production-human-escalation:${repair.decision.summary}`);
    }
    return update;
  };

  return compileProductionGraph({
    initialize,
    stageNodes,
    repairRouter,
    unfreezeReview,
    unfreezeApply,
    productionReady,
    humanEscalation,
    chooseStart,
    afterStage,
    afterRepairRoute,
    afterUnfreezeReview,
    checkpointer: input.checkpointer,
    repoRoot: input.repoRoot,
    concurrency: input.concurrency,
  });
};

export const createLangGraphProductionSubgraph = createProductionSubgraph;

export const runProductionSubgraph = async (input: ProductionSubgraphRunInput) => {
  const graph = createProductionSubgraph(input);
  return graph.invoke(
    input.state,
    input.config ?? {
      configurable: {
        thread_id: input.state.episodeId,
        episode_id: input.state.episodeId,
        run_id: input.state.runId,
        trace_id: `${input.state.episodeId}:run:${input.state.runId}`,
      },
    },
  );
};
