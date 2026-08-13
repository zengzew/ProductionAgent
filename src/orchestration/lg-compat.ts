import type {BaseCheckpointSaver} from "@langchain/langgraph";
import {Annotation, Command, END, START, StateGraph, interrupt} from "@langchain/langgraph";
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
  mergeMax,
  mergeProductionIssueSummaries,
  mergeProductionRepair,
  mergeProductionStageSummaries,
  mergeRevisionSummaries,
  mergeStrictRecord,
  pickBest,
  upsertIssues,
} from "./reducers";
import type {ProductionState, ProductionStateUpdate} from "./state";
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

export const createSqliteCheckpointer = (databasePath: string): LocalCheckpointer =>
  SqliteSaver.fromConnString(databasePath);

export const pauseForStubApproval = <T>(payload: T): unknown => interrupt(payload);

export const resumeAfterStubApproval = (value: unknown): Command => new Command({resume: value});

export const compileFoundationGraph = (input: {
  initialize: FoundationNode;
  executeNext: FoundationNode;
  contentApproval: FoundationNode;
  finalApproval: FoundationNode;
  finalize: FoundationNode;
  afterAgent: (state: ProductionState) => "continue" | "content_approval" | "final_approval";
  checkpointer: LocalCheckpointer;
}) =>
  new StateGraph(ProductionStateAnnotation)
    .addNode("initialize", input.initialize)
    .addNode("execute_agent", input.executeNext)
    .addNode("content_approval", input.contentApproval)
    .addNode("final_approval", input.finalApproval)
    .addNode("finalize", input.finalize)
    .addEdge(START, "initialize")
    .addEdge("initialize", "execute_agent")
    .addConditionalEdges("execute_agent", input.afterAgent, {
      continue: "execute_agent",
      content_approval: "content_approval",
      final_approval: "final_approval",
    })
    .addEdge("content_approval", "execute_agent")
    .addEdge("final_approval", "finalize")
    .addEdge("finalize", END)
    .compile({checkpointer: input.checkpointer});

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
  | ProductionStageName;

type ProductionGraphNodeName =
  | "production_ready"
  | "production_human_escalation"
  | "production_repair_router"
  | (typeof productionStageNodeNames)[ProductionStageName];

export const compileProductionGraph = (input: {
  initialize: FoundationNode;
  stageNodes: Record<ProductionStageName, FoundationNode>;
  repairRouter: FoundationNode;
  productionReady: FoundationNode;
  humanEscalation: FoundationNode;
  chooseStart: (state: ProductionState) => ProductionGraphDestination;
  afterStage: (state: ProductionState, stage: ProductionStageName) => ProductionGraphDestination;
  afterRepairRoute: (state: ProductionState) => ProductionGraphDestination;
  checkpointer: LocalCheckpointer;
}) => {
  const destinations: Record<ProductionGraphDestination, ProductionGraphNodeName> = {
    production_ready: "production_ready",
    production_human_escalation: "production_human_escalation",
    production_repair_router: "production_repair_router",
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
