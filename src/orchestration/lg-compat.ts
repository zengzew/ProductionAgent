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
  mergeRevisionSummaries,
  mergeStrictRecord,
  pickBest,
  upsertIssues,
} from "./reducers";
import type {ProductionState, ProductionStateUpdate} from "./state";

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
