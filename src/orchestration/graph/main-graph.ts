import {agentNames, type AgentName} from "../schemas/agent";
import type {AgentRunner} from "../agents/run-agent";
import type {ArtifactRef} from "../schemas/artifact";
import {hashArtifactInputs, stableEventId, type ExecutionEventSink} from "../observability";
import type {ExecutionEvent} from "../schemas/execution-event";
import {assertReferenceOnlyState, type ProductionState} from "../state";
import {compileFoundationGraph, pauseForStubApproval, type LocalCheckpointer} from "../lg-compat";

const phaseByAgent: Record<AgentName, ProductionState["phase"]> = {
  "research-analyst": "research",
  "story-director": "story",
  "viral-director": "viral",
  "script-writer": "script",
  "oral-rewriter": "oral",
  "oral-judge": "oral",
  "audience-critic": "content_eval",
  "fact-guardian": "content_eval",
  "visual-director": "visual",
  "retention-critic": "content_eval",
  "delivery-critic": "delivery_eval",
};

const firstArtifact = (artifacts: Record<string, ArtifactRef>): ArtifactRef => {
  const ref = Object.values(artifacts)[0];
  if (!ref) {
    throw new Error("foundation graph requires at least one referenced control artifact");
  }
  return ref;
};

export const createFoundationGraph = (input: {
  runAgent: AgentRunner;
  checkpointer: LocalCheckpointer;
  eventSink?: ExecutionEventSink;
  now?: () => string;
}) => {
  const now = input.now ?? (() => new Date().toISOString());

  const emit = (event: ExecutionEvent): void => input.eventSink?.(event);

  const initialize = (state: ProductionState) => {
    assertReferenceOnlyState(state);
    firstArtifact(state.artifacts);
    return {phase: "init" as const};
  };

  const executeNext = async (state: ProductionState) => {
    const agentName = agentNames.find((candidate) => !state.completedAgents.includes(candidate));
    if (!agentName) {
      return {};
    }
    const attempt = (state.attempts[agentName] ?? 0) + 1;
    const promptRef = firstArtifact(state.artifacts);
    const inputArtifacts = Object.values(state.artifacts);
    const executionId = `${state.runId}:${agentName}:${attempt}`;
    const startedAt = now();
    const result = await input.runAgent({
      contractVersion: "agent-execution-v1",
      executionId,
      episodeId: state.episodeId,
      agentName,
      attempt,
      revisionRound: state.round,
      promptRef,
      inputArtifacts,
      expectedOutputs: [],
      upstreamGateRefs: [],
      revisionBudgetRemaining: 0,
    });
    if (result.status !== "SUCCEEDED") {
      throw new Error(`foundation stub returned ${result.status} for ${agentName}`);
    }
    const endedAt = now();
    const baseEvent = {
      schemaVersion: "agent-execution-event-v1" as const,
      episodeId: state.episodeId,
      traceId: state.runId,
      executionId,
      parentExecutionId: null,
      agentName,
      executionKind: "deterministic-tool" as const,
      attempt,
      revisionRound: state.round,
      approvalEpoch: 0,
      model: null,
      prompt: null,
      inputArtifacts,
      outputArtifacts: result.outputArtifacts,
      usage: {
        availability: "not-applicable" as const,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        cost: {amount: "0", currency: "USD", pricingVersion: "not-applicable"},
      },
      error: null,
      checkpoint: null,
      environment: {
        repositoryCommit: null,
        worktreeState: "unknown" as const,
        inputSetHash: hashArtifactInputs(inputArtifacts),
        runtime: `node-${process.versions.node}`,
        runnerVersion: "m1-stub-v1",
      },
    };
    const startedEvent: ExecutionEvent = {
      ...baseEvent,
      eventId: stableEventId(executionId, "execution.started"),
      eventType: "execution.started",
      occurredAt: startedAt,
      timing: {startedAt, endedAt: null, durationMs: null, queueMs: null, providerMs: null},
      status: "STARTED",
      decision: null,
    };
    const completedEvent: ExecutionEvent = {
      ...baseEvent,
      eventId: stableEventId(executionId, "execution.completed"),
      eventType: "execution.completed",
      occurredAt: endedAt,
      timing: {startedAt, endedAt, durationMs: null, queueMs: null, providerMs: null},
      status: "SUCCEEDED",
      decision: {
        code: result.decision.code,
        summary: result.decision.summary,
        rubricVersion: null,
        score: null,
        verdict: null,
        issueIds: [],
        route: null,
        criticResultRef: result.criticResultRef ?? null,
      },
    };
    emit(startedEvent);
    emit(completedEvent);
    return {
      phase: phaseByAgent[agentName],
      completedAgents: [agentName],
      attempts: {[agentName]: attempt},
      decisions: {[agentName]: result.decision},
      events: [
        {eventId: startedEvent.eventId, executionId, status: startedEvent.status},
        {eventId: completedEvent.eventId, executionId, status: completedEvent.status},
      ],
      artifacts: Object.fromEntries(
        result.outputArtifacts.map((artifact) => [artifact.artifactId, artifact]),
      ),
    };
  };

  const contentApproval = (state: ProductionState) => {
    pauseForStubApproval({
      gate: "content-approval",
      episodeId: state.episodeId,
      runId: state.runId,
      artifactRefs: Object.values(state.artifacts),
    });
    return {phase: "frozen" as const};
  };

  const finalApproval = (state: ProductionState) => {
    pauseForStubApproval({
      gate: "final-approval",
      episodeId: state.episodeId,
      runId: state.runId,
      artifactRefs: Object.values(state.artifacts),
    });
    return {phase: "final_approval" as const};
  };

  const finalize = (state: ProductionState) => {
    assertReferenceOnlyState(state);
    return {
      phase: "halted" as const,
      haltReason: "M1.2 Golden Skeleton complete; formal approval semantics remain M3 scope",
    };
  };

  return compileFoundationGraph({
    initialize,
    executeNext,
    contentApproval,
    finalApproval,
    finalize,
    afterAgent: (state) => {
      const contentAgentsComplete = agentNames
        .slice(0, -1)
        .every((agentName) => state.completedAgents.includes(agentName));
      if (!contentAgentsComplete) return "continue";
      return state.completedAgents.includes("delivery-critic")
        ? "final_approval"
        : "content_approval";
    },
    checkpointer: input.checkpointer,
  });
};
