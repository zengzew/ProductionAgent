import {
  Annotation,
  BaseCheckpointSaver,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import type {Checkpoint, CheckpointMetadata, CheckpointTuple} from "@langchain/langgraph";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {SqliteSaver} from "@langchain/langgraph-checkpoint-sqlite";
import {
  firstWriteImmutable,
  mergeArtifactRefs,
  mergeBudget,
  mergeCompletedAgents,
  mergeEvaluationSummaries,
  mergeEventSummaries,
  mergeNumberMap,
  mergeOptionalArtifactRef,
  mergeOptionalImmutable,
  mergePhase,
  mergePendingHumanRoute,
  mergeProcessedDecisionIds,
  mergeProductionAuthorization,
  mergeMax,
  mergeLockedRanges,
  mergeProductionIssueSummaries,
  mergeProductionRepair,
  mergeProductionStageSummaries,
  mergeRevisionSummaries,
  mergeStrictRecord,
  mergeUnfreezeState,
  pickBest,
  upsertIssues,
} from "./reducers";
import type {ProductionState, ProductionStateUpdate} from "./state";
import {assertReferenceOnlyState, productionStateFieldNames} from "./state";
import {
  migrateCheckpointMetadata,
  migrateProductionState,
  type CheckpointMetadataWithSchema,
} from "./schemas/migrations";
import {stableJsonEqual} from "./stable-json";
import {
  DEFAULT_PRODUCTION_REPAIR_ROUNDS,
  productionStageNames,
  type ProductionStageName,
} from "./schemas/production";

export type FoundationNode = (
  state: ProductionState,
) => ProductionStateUpdate | Promise<ProductionStateUpdate>;

const ProductionStateAnnotation = Annotation.Root({
  schemaVersion: Annotation<ProductionState["schemaVersion"]>({reducer: firstWriteImmutable}),
  episodeId: Annotation<string>({reducer: firstWriteImmutable}),
  runId: Annotation<string>({reducer: firstWriteImmutable}),
  phase: Annotation<ProductionState["phase"]>({reducer: mergePhase}),
  approvalEpoch: Annotation<number>({reducer: mergeMax, default: () => 0}),
  round: Annotation<number>({reducer: mergeMax}),
  artifacts: Annotation<ProductionState["artifacts"]>({
    reducer: mergeArtifactRefs,
    default: () => ({}),
  }),
  best: Annotation<ProductionState["best"]>({
    reducer: pickBest,
    default: () => ({}),
  }),
  evaluations: Annotation<ProductionState["evaluations"]>({
    reducer: mergeEvaluationSummaries,
    default: () => [],
  }),
  issues: Annotation<ProductionState["issues"]>({
    reducer: upsertIssues,
    default: () => ({}),
  }),
  gates: Annotation<ProductionState["gates"]>({
    reducer: mergeStrictRecord,
    default: () => ({}),
  }),
  revisionLog: Annotation<ProductionState["revisionLog"]>({
    reducer: mergeRevisionSummaries,
    default: () => [],
  }),
  events: Annotation<ProductionState["events"]>({
    reducer: mergeEventSummaries,
    default: () => [],
  }),
  budget: Annotation<ProductionState["budget"]>({reducer: mergeBudget}),
  approvals: Annotation<ProductionState["approvals"]>({
    reducer: mergeStrictRecord,
    default: () => ({}),
  }),
  contentManifestRef: Annotation<ProductionState["contentManifestRef"]>({
    reducer: mergeOptionalArtifactRef,
  }),
  strategyLevel: Annotation<number>({reducer: mergeMax}),
  completedAgents: Annotation<ProductionState["completedAgents"]>({
    reducer: mergeCompletedAgents,
    default: () => [],
  }),
  attempts: Annotation<ProductionState["attempts"]>({
    reducer: mergeNumberMap,
    default: () => ({}),
  }),
  decisions: Annotation<ProductionState["decisions"]>({
    reducer: mergeStrictRecord,
    default: () => ({}),
  }),
  productionStages: Annotation<ProductionState["productionStages"]>({
    reducer: mergeProductionStageSummaries,
    default: () => ({}),
  }),
  productionIssues: Annotation<ProductionState["productionIssues"]>({
    reducer: mergeProductionIssueSummaries,
    default: () => ({}),
  }),
  lockedRanges: Annotation<ProductionState["lockedRanges"]>({
    reducer: mergeLockedRanges,
    default: () => [],
  }),
  processedDecisionIds: Annotation<ProductionState["processedDecisionIds"]>({
    reducer: mergeProcessedDecisionIds,
    default: () => [],
  }),
  productionAuthorization: Annotation<ProductionState["productionAuthorization"]>({
    reducer: mergeProductionAuthorization,
    default: () => null,
  }),
  pendingHumanRoute: Annotation<ProductionState["pendingHumanRoute"]>({
    reducer: mergePendingHumanRoute,
    default: () => null,
  }),
  unfreeze: Annotation<ProductionState["unfreeze"]>({
    reducer: mergeUnfreezeState,
    default: () => ({
      status: "idle",
      requestRef: null,
      decisionRef: null,
      humanDecisionRef: null,
      authorizedArtifactIds: [],
      authorizedOwners: [],
      changedArtifactIds: [],
      staleArtifactIds: [],
      validatorRefs: [],
      criticRefs: [],
      resumeAt: null,
      decision: {code: "UNFREEZE_IDLE", summary: "unfreeze flow is idle"},
    }),
  }),
  productionRepair: Annotation<ProductionState["productionRepair"]>({
    reducer: mergeProductionRepair,
    default: () => ({
      status: "idle",
      round: 0,
      maxRounds: DEFAULT_PRODUCTION_REPAIR_ROUNDS,
      route: null,
      forceRerunStage: null,
      issueIds: [],
      authorizedArtifactIds: [],
      staleArtifactIds: [],
      decision: {code: "PRODUCTION_REPAIR_IDLE", summary: "production repair loop is idle"},
    }),
  }),
  haltReason: Annotation<string | undefined>({reducer: mergeOptionalImmutable}),
});

export type LocalCheckpointer = BaseCheckpointSaver;

type CheckpointConfig = Parameters<BaseCheckpointSaver["getTuple"]>[0];
type CheckpointListOptions = Parameters<BaseCheckpointSaver["list"]>[1];
type PendingWrite = Parameters<BaseCheckpointSaver["putWrites"]>[1][number];
type CheckpointPutVersions = Parameters<BaseCheckpointSaver["put"]>[3];

type CheckpointBackend = BaseCheckpointSaver & {
  end?: () => void | Promise<void>;
};

type StateChannelValues = Record<string, unknown>;

const looksLikeProductionState = (values: StateChannelValues): boolean =>
  "schemaVersion" in values || "episodeId" in values || "runId" in values;

const productionStateValues = (values: StateChannelValues): StateChannelValues =>
  Object.fromEntries(
    Object.entries(values).filter(([key]) => productionStateFieldNames.includes(key)),
  );

const checkpointMetadataFor = (migrated: CheckpointMetadataWithSchema): CheckpointMetadata =>
  migrated as unknown as CheckpointMetadata;

/**
 * Keeps the graph-facing BaseCheckpointSaver contract stable while enforcing
 * state/checkpoint versioning at the persistence boundary.
 */
export class VersionedCheckpointSaver extends BaseCheckpointSaver {
  private readonly backend: CheckpointBackend;
  private setupPromise: Promise<void> | undefined;

  constructor(backend: CheckpointBackend) {
    super(backend.serde);
    this.backend = backend;
  }

  private async ensureSetup(): Promise<void> {
    const setup = (this.backend as unknown as {setup?: () => void | Promise<void>}).setup;
    if (!setup) return;
    this.setupPromise ??= Promise.resolve(setup.call(this.backend));
    await this.setupPromise;
  }

  async setup(): Promise<void> {
    await this.ensureSetup();
  }

  private normalizeTuple(tuple: CheckpointTuple): CheckpointTuple {
    const values = tuple.checkpoint.channel_values as StateChannelValues;
    const stateValues = productionStateValues(values);
    if (!looksLikeProductionState(stateValues)) return tuple;

    const stateResult = migrateProductionState(stateValues);
    const metadataResult = migrateCheckpointMetadata(
      tuple.metadata,
      stateResult.to,
      stateResult.state as unknown as StateChannelValues,
    );
    assertReferenceOnlyState(stateResult.state);
    return {
      ...tuple,
      checkpoint: {
        ...tuple.checkpoint,
        channel_values: {
          ...values,
          ...stateResult.state,
        },
      },
      metadata: checkpointMetadataFor(metadataResult.metadata),
    };
  }

  private normalizeForWrite(
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: CheckpointPutVersions,
  ): {checkpoint: Checkpoint; metadata: CheckpointMetadata; newVersions: CheckpointPutVersions} {
    const values = checkpoint.channel_values as StateChannelValues;
    const stateValues = productionStateValues(values);
    if (!looksLikeProductionState(stateValues)) return {checkpoint, metadata, newVersions};

    const stateResult = migrateProductionState(stateValues);
    const metadataResult = migrateCheckpointMetadata(
      metadata,
      stateResult.to,
      stateResult.state as unknown as StateChannelValues,
    );
    assertReferenceOnlyState(stateResult.state);
    const migratedValues = {
      ...values,
      ...stateResult.state,
    };
    const versions = {...newVersions};
    for (const [key, value] of Object.entries(stateResult.state)) {
      if (!stableJsonEqual(stateValues[key], value) && versions[key] === undefined) {
        const currentVersion = checkpoint.channel_versions[key];
        versions[key] =
          typeof currentVersion === "number" || currentVersion === undefined
            ? this.getNextVersion(currentVersion)
            : currentVersion;
      }
    }
    return {
      checkpoint: {
        ...checkpoint,
        channel_values: migratedValues,
      },
      metadata: checkpointMetadataFor(metadataResult.metadata),
      newVersions: versions,
    };
  }

  async getTuple(config: CheckpointConfig): Promise<CheckpointTuple | undefined> {
    await this.ensureSetup();
    const tuple = await this.backend.getTuple(config);
    return tuple ? this.normalizeTuple(tuple) : undefined;
  }

  async *list(
    config: CheckpointConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    await this.ensureSetup();
    for await (const tuple of this.backend.list(config, options)) {
      yield this.normalizeTuple(tuple);
    }
  }

  async put(
    config: CheckpointConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: CheckpointPutVersions,
  ): Promise<ReturnType<BaseCheckpointSaver["put"]> extends Promise<infer T> ? T : never> {
    await this.ensureSetup();
    const normalized = this.normalizeForWrite(checkpoint, metadata, newVersions);
    return this.backend.put(
      config,
      normalized.checkpoint,
      normalized.metadata,
      normalized.newVersions,
    );
  }

  async putWrites(config: CheckpointConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    await this.ensureSetup();
    await this.backend.putWrites(config, writes, taskId);
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.ensureSetup();
    await this.backend.deleteThread(threadId);
  }

  async end(): Promise<void> {
    await this.ensureSetup();
    if (this.backend.end) await this.backend.end();
  }
}

export const createSqliteCheckpointer = (databasePath: string): LocalCheckpointer =>
  new VersionedCheckpointSaver(SqliteSaver.fromConnString(databasePath));

export const createPostgresCheckpointer = (
  connectionString: string,
  options: {schema?: string} = {},
): LocalCheckpointer =>
  new VersionedCheckpointSaver(
    PostgresSaver.fromConnString(connectionString, {
      schema: options.schema ?? "production_checkpoints",
    }),
  );

export const pauseForStubApproval = <T>(payload: T): unknown => interrupt(payload);

export const pauseForUnfreezeApproval = <T>(payload: T): unknown => interrupt(payload);

export const resumeAfterStubApproval = (value: unknown): Command => new Command({resume: value});

export const compileFoundationGraph = (input: {
  initialize: FoundationNode;
  executeNext: FoundationNode;
  contentApproval: FoundationNode;
  production?: FoundationNode;
  finalApproval: FoundationNode;
  finalize: FoundationNode;
  afterAgent: (state: ProductionState) => "continue" | "content_approval" | "final_approval";
  afterContentApproval?: (state: ProductionState) => "production" | "execute_agent";
  afterFinalApproval?: (state: ProductionState) => "final_approval" | "finalize";
  checkpointer: LocalCheckpointer;
}) => {
  const productionNode: FoundationNode = input.production ?? (() => ({}));
  const graph = new StateGraph(ProductionStateAnnotation)
    .addNode("initialize", input.initialize)
    .addNode("execute_agent", input.executeNext)
    .addNode("content_approval", input.contentApproval)
    .addNode("production", productionNode)
    .addNode("final_approval", input.finalApproval)
    .addNode("finalize", input.finalize)
    .addEdge(START, "initialize")
    .addEdge("initialize", "execute_agent")
    .addConditionalEdges("execute_agent", input.afterAgent, {
      continue: "execute_agent",
      content_approval: "content_approval",
      final_approval: "final_approval",
    })
    .addConditionalEdges(
      "content_approval",
      input.afterContentApproval ?? (() => "execute_agent"),
      {production: "production", execute_agent: "execute_agent"},
    )
    .addConditionalEdges("final_approval", input.afterFinalApproval ?? (() => "finalize"), {
      final_approval: "final_approval",
      finalize: "finalize",
    })
    .addEdge("finalize", END);
  graph.addEdge("production", "final_approval");
  return graph.compile({checkpointer: input.checkpointer});
};

const productionStageNodeNames = {
  "materialize:story": "production_materialize_story",
  "validate:content": "production_validate_content",
  capture: "production_capture",
  tts: "production_tts",
  timeline: "production_timeline",
  "render:smoke": "production_render_smoke",
  "render:vertical": "production_render_vertical",
  "inspect:output": "production_inspect_output",
  "validate:delivery": "production_validate_delivery",
} as const;

export const productionStageNodeName = (
  stage: ProductionStageName,
): (typeof productionStageNodeNames)[ProductionStageName] => productionStageNodeNames[stage];

export type ProductionGraphDestination =
  | "production_ready"
  | "production_human_escalation"
  | "production_repair_router"
  | "production_unfreeze_review"
  | "production_unfreeze_apply"
  | ProductionStageName;

type ProductionGraphNodeName =
  | "production_ready"
  | "production_human_escalation"
  | "production_repair_router"
  | "production_unfreeze_review"
  | "production_unfreeze_apply"
  | (typeof productionStageNodeNames)[ProductionStageName];

export const compileProductionGraph = (input: {
  initialize: FoundationNode;
  stageNodes: Record<ProductionStageName, FoundationNode>;
  repairRouter: FoundationNode;
  unfreezeReview: FoundationNode;
  unfreezeApply: FoundationNode;
  productionReady: FoundationNode;
  humanEscalation: FoundationNode;
  chooseStart: (state: ProductionState) => ProductionGraphDestination;
  afterStage: (state: ProductionState, stage: ProductionStageName) => ProductionGraphDestination;
  afterRepairRoute: (state: ProductionState) => ProductionGraphDestination;
  afterUnfreezeReview: (
    state: ProductionState,
  ) => "production_unfreeze_apply" | "production_human_escalation";
  checkpointer: LocalCheckpointer;
}) => {
  const destinations: Record<ProductionGraphDestination, ProductionGraphNodeName> = {
    production_ready: "production_ready",
    production_human_escalation: "production_human_escalation",
    production_repair_router: "production_repair_router",
    production_unfreeze_review: "production_unfreeze_review",
    production_unfreeze_apply: "production_unfreeze_apply",
    "materialize:story": productionStageNodeNames["materialize:story"],
    "validate:content": productionStageNodeNames["validate:content"],
    capture: productionStageNodeNames.capture,
    tts: productionStageNodeNames.tts,
    timeline: productionStageNodeNames.timeline,
    "render:smoke": productionStageNodeNames["render:smoke"],
    "render:vertical": productionStageNodeNames["render:vertical"],
    "inspect:output": productionStageNodeNames["inspect:output"],
    "validate:delivery": productionStageNodeNames["validate:delivery"],
  };
  let graph = new StateGraph(ProductionStateAnnotation)
    .addNode("production_start", input.initialize)
    .addNode("production_repair_router", input.repairRouter)
    .addNode("production_unfreeze_review", input.unfreezeReview)
    .addNode("production_unfreeze_apply", input.unfreezeApply)
    .addNode("production_ready", input.productionReady)
    .addNode("production_human_escalation", input.humanEscalation)
    .addNode(productionStageNodeNames["materialize:story"], input.stageNodes["materialize:story"])
    .addNode(productionStageNodeNames["validate:content"], input.stageNodes["validate:content"])
    .addNode(productionStageNodeNames.capture, input.stageNodes.capture)
    .addNode(productionStageNodeNames.tts, input.stageNodes.tts)
    .addNode(productionStageNodeNames.timeline, input.stageNodes.timeline)
    .addNode(productionStageNodeNames["render:smoke"], input.stageNodes["render:smoke"])
    .addNode(productionStageNodeNames["render:vertical"], input.stageNodes["render:vertical"])
    .addNode(productionStageNodeNames["inspect:output"], input.stageNodes["inspect:output"])
    .addNode(productionStageNodeNames["validate:delivery"], input.stageNodes["validate:delivery"])
    .addConditionalEdges("production_start", input.chooseStart, destinations)
    .addConditionalEdges("production_repair_router", input.afterRepairRoute, destinations)
    .addConditionalEdges("production_unfreeze_review", input.afterUnfreezeReview, {
      production_unfreeze_apply: "production_unfreeze_apply",
      production_human_escalation: "production_human_escalation",
    })
    .addEdge("production_unfreeze_apply", "production_start")
    .addEdge("production_ready", END)
    .addEdge("production_human_escalation", END);
  for (const stage of productionStageNames) {
    graph = graph.addConditionalEdges(
      productionStageNodeName(stage),
      (state) => input.afterStage(state, stage),
      destinations,
    );
  }
  graph = graph.addEdge(START, "production_start");
  return graph.compile({checkpointer: input.checkpointer});
};
