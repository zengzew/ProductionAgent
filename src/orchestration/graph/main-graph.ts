import {agentNames, type AgentName} from "../schemas/agent";
import type {AgentRunner} from "../agents/run-agent";
import type {ArtifactIndex, ArtifactRef} from "../schemas/artifact";
import {hashArtifactInputs, stableEventId, type ExecutionEventSink} from "../observability";
import type {ExecutionEvent} from "../schemas/execution-event";
import {assertReferenceOnlyState, type ProductionState} from "../state";
import {
  ensureArtifactIndexForRefs,
  applyHumanDirectEdits,
  persistHumanDecision,
  persistHumanIssue,
} from "../human-decision";
import {freezeContent} from "../freeze";
import {
  humanDecisionSchema,
  type HumanDecision,
  type HumanDecisionGate,
} from "../schemas/human-decision";
import {
  compileFoundationGraph,
  pauseForStubApproval,
  type FoundationNode,
  type LocalCheckpointer,
} from "../lg-compat";

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

const promptControlArtifact = (artifacts: Record<string, ArtifactRef>): ArtifactRef => {
  // The foundation stub has no role-specific prompt registry yet. Prefer an explicit control
  // artifact, then use artifact identity ordering so object insertion order cannot change traces.
  const ordered = Object.values(artifacts).sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );
  const ref =
    ordered.find(
      (artifact) =>
        artifact.artifactId.includes(":control:") || artifact.path.includes("/control/"),
    ) ?? ordered[0];
  if (!ref) {
    throw new Error("foundation graph requires at least one referenced control artifact");
  }
  return ref;
};

const refsForContentGate = (state: ProductionState): ArtifactRef[] =>
  Object.values(state.artifacts)
    .filter(
      (ref) =>
        !ref.path.includes("/production/") &&
        !ref.path.includes("/_manifest/") &&
        ref.artifactId !== state.contentManifestRef?.artifactId,
    )
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));

const refsForFinalGate = (state: ProductionState): ArtifactRef[] =>
  Object.values(state.artifacts).sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );

const decisionInputRefs = (decision: HumanDecision): ArtifactRef[] =>
  decision.artifactRefs.filter(
    (ref) =>
      !decision.edits.some(
        (edit) =>
          edit.after.artifactId === ref.artifactId &&
          edit.after.revision === ref.revision &&
          edit.after.sha256 === ref.sha256,
      ),
  );

const sameArtifactVersion = (left: ArtifactRef, right: ArtifactRef): boolean =>
  left.artifactId === right.artifactId &&
  left.episodeId === right.episodeId &&
  left.path === right.path &&
  left.revision === right.revision &&
  left.sha256 === right.sha256;

const defaultHumanIssue = (gate: HumanDecisionGate, ref: ArtifactRef) => ({
  category: gate === "final-approval" ? ("delivery.render" as const) : ("story.structure" as const),
  severity: gate === "final-approval" ? ("blocker" as const) : ("high" as const),
  locator: {kind: "whole-artifact" as const, value: "human-rejection"},
  affectedArtifactRef: ref,
});

/**
 * The interrupt payload exposes the required reference-only defaults, while the persisted
 * artifact is still parsed as a complete formal HumanDecision. Reviewer, timestamp, reason and
 * decisionId are never invented by the runtime.
 */
const readFormalDecision = (input: {
  value: unknown;
  gate: HumanDecisionGate;
  state: ProductionState;
  artifactRefs: readonly ArtifactRef[];
}): HumanDecision => {
  if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) {
    throw new Error("HUMAN_DECISION_REQUIRED");
  }
  const raw = {...(input.value as Record<string, unknown>)};
  if (raw.gate === undefined) raw.gate = input.gate;
  if (raw.artifactRefs === undefined) raw.artifactRefs = input.artifactRefs;
  if (raw.approvalEpoch === undefined) raw.approvalEpoch = input.state.approvalEpoch;
  const decisionKind = raw.decision ?? raw.action;
  if (decisionKind === "reject" && raw.issue === undefined) {
    const firstRef = input.artifactRefs[0];
    if (!firstRef) throw new Error("HUMAN_DECISION_ARTIFACT_REFS_REQUIRED");
    raw.issue = defaultHumanIssue(input.gate, firstRef);
  }
  const decision = humanDecisionSchema.parse(raw);
  if (decision.gate !== input.gate) throw new Error("HUMAN_DECISION_GATE_MISMATCH");
  if (decision.approvalEpoch !== input.state.approvalEpoch) {
    throw new Error(
      `HUMAN_DECISION_APPROVAL_EPOCH_STALE:${decision.approvalEpoch}:${input.state.approvalEpoch}`,
    );
  }
  if (decision.artifactRefs.some((ref) => ref.episodeId !== input.state.episodeId)) {
    throw new Error("HUMAN_DECISION_EPISODE_MISMATCH");
  }
  const afterRefs = new Set(
    decision.edits.map(
      (edit) => `${edit.after.artifactId}:${edit.after.revision}:${edit.after.sha256}`,
    ),
  );
  for (const ref of decision.artifactRefs) {
    if (afterRefs.has(`${ref.artifactId}:${ref.revision}:${ref.sha256}`)) continue;
    const current = input.artifactRefs.find((candidate) => candidate.artifactId === ref.artifactId);
    if (!current || !sameArtifactVersion(current, ref)) {
      throw new Error(`HUMAN_DECISION_STALE_ARTIFACT_REF:${ref.artifactId}`);
    }
  }
  return decision;
};

const approvalSummaryFor = (
  decision: HumanDecision,
  decisionRef: ArtifactRef,
): ProductionState["approvals"][string] => ({
  decisionRef,
  status:
    decision.decision === "approve"
      ? "approved"
      : decision.decision === "reject"
        ? "rejected"
        : "direct-edit",
  gate: decision.gate,
  decision: decision.decision,
  approvalEpoch: decision.approvalEpoch,
  reason: decision.reason,
});

const humanDecisionIsProcessed = (state: ProductionState, decisionId: string): boolean =>
  state.processedDecisionIds.includes(decisionId);

const issueStateUpdate = (
  issueResult: ReturnType<typeof persistHumanIssue>,
): Pick<ProductionState, "issues" | "pendingHumanRoute"> => ({
  issues: {
    [issueResult.issue.issueId]: {
      issueId: issueResult.issue.issueId,
      issueRef: issueResult.issueRef,
      status: "open",
      owner: issueResult.route.ownerAgent,
    },
  },
  pendingHumanRoute: {
    ownerAgent: issueResult.route.ownerAgent,
    routeTarget: issueResult.route.routeTarget,
    restartAt: issueResult.route.restartAt,
    issueIds: [issueResult.issue.issueId],
  },
});

export const createFoundationGraph = (input: {
  runAgent: AgentRunner;
  checkpointer: LocalCheckpointer;
  eventSink?: ExecutionEventSink;
  now?: () => string;
  /** Enables the formal M3.4 protocol for this repository-backed graph. */
  repoRoot?: string;
  humanDecision?: {
    repoRoot: string;
    artifactIndex?: ArtifactIndex;
    now?: () => string;
  };
  production?: FoundationNode;
}) => {
  const now = input.now ?? (() => new Date().toISOString());
  const formalRepoRoot = input.humanDecision?.repoRoot ?? input.repoRoot;
  const formalHumanDecision = formalRepoRoot !== undefined;
  const decisionNow = input.humanDecision?.now ?? now;

  const emit = (event: ExecutionEvent): void => input.eventSink?.(event);

  const initialize = (state: ProductionState) => {
    assertReferenceOnlyState(state);
    promptControlArtifact(state.artifacts);
    return {phase: "init" as const};
  };

  const executeNext = async (state: ProductionState) => {
    const routedOwner = state.pendingHumanRoute?.ownerAgent;
    const routedAgent =
      routedOwner && agentNames.includes(routedOwner as AgentName)
        ? (routedOwner as AgentName)
        : undefined;
    const agentName =
      routedAgent ?? agentNames.find((candidate) => !state.completedAgents.includes(candidate));
    if (!agentName) {
      return state.pendingHumanRoute ? {phase: "production_revision" as const} : {};
    }
    const attempt = (state.attempts[agentName] ?? 0) + 1;
    const promptRef = promptControlArtifact(state.artifacts);
    const inputArtifacts = Object.values(state.artifacts);
    const executionId = `${state.runId}:${agentName}:${attempt}`;
    const startedAt = now();
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
      approvalEpoch: state.approvalEpoch,
      model: null,
      prompt: null,
      inputArtifacts,
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
      outputArtifacts: [],
      eventId: stableEventId(executionId, "execution.started"),
      eventType: "execution.started",
      occurredAt: startedAt,
      timing: {startedAt, endedAt: null, durationMs: null, queueMs: null, providerMs: null},
      status: "STARTED",
      decision: null,
    };
    emit(startedEvent);
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
    const completedEvent: ExecutionEvent = {
      ...baseEvent,
      outputArtifacts: result.outputArtifacts,
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
      ...(routedAgent ? {pendingHumanRoute: null} : {}),
    };
  };

  const contentApproval = (state: ProductionState) => {
    const artifactRefs = refsForContentGate(state);
    const payload = {
      gate: "content-approval",
      episodeId: state.episodeId,
      runId: state.runId,
      artifactRefs,
      approvalEpoch: state.approvalEpoch,
      reviewStartedAt: decisionNow,
      decisionOptions: ["approve", "reject", "direct-edit"] as const,
    };
    const resumeValue = pauseForStubApproval(payload);
    if (!formalHumanDecision) return {phase: "frozen" as const};
    const decision = readFormalDecision({
      value: resumeValue,
      gate: "content-approval",
      state,
      artifactRefs,
    });
    if (humanDecisionIsProcessed(state, decision.decisionId)) return {};
    const seededIndex = ensureArtifactIndexForRefs({
      repoRoot: formalRepoRoot!,
      episodeId: state.episodeId,
      refs: [...artifactRefs, ...decisionInputRefs(decision)],
      artifactIndex: input.humanDecision?.artifactIndex,
      executionId: `human-decision:${decision.decisionId}:inputs`,
    });
    const persisted = persistHumanDecision({
      repoRoot: formalRepoRoot!,
      decision,
      artifactIndex: seededIndex,
      executionId: `human-decision:${decision.decisionId}`,
    });
    const approval = approvalSummaryFor(decision, persisted.decisionRef);
    const base = {
      artifacts: {[persisted.decisionRef.artifactId]: persisted.decisionRef},
      approvals: {[decision.decisionId]: approval},
      decisions: {
        [decision.decisionId]: {
          code: `HUMAN_CONTENT_${decision.decision.toUpperCase().replaceAll("-", "_")}`,
          summary: decision.reason,
        },
      },
      processedDecisionIds: [decision.decisionId],
    };
    if (decision.decision === "reject") {
      const issue = persistHumanIssue({
        repoRoot: formalRepoRoot!,
        decision,
        decisionRef: persisted.decisionRef,
        artifactIndex: persisted.artifactIndex,
        executionId: `human-decision:${decision.decisionId}:issue`,
      });
      return {
        ...base,
        ...issueStateUpdate(issue),
        phase: "content_revision" as const,
        gates: {"content-approval": "fail" as const},
        artifacts: {
          [persisted.decisionRef.artifactId]: persisted.decisionRef,
          [issue.issueRef.artifactId]: issue.issueRef,
        },
      };
    }
    if (decision.decision === "direct-edit") {
      const applied = applyHumanDirectEdits({
        repoRoot: formalRepoRoot!,
        decision,
        decisionRef: persisted.decisionRef,
        artifactIndex: persisted.artifactIndex,
        existingLockedRanges: state.lockedRanges,
        executionId: `human-decision:${decision.decisionId}`,
      });
      return {
        ...base,
        phase: "content_eval" as const,
        approvalEpoch: state.approvalEpoch + 1,
        gates: {"content-approval": "fail" as const},
        artifacts: Object.fromEntries(
          [persisted.decisionRef, ...applied.changedArtifactRefs].map((ref) => [
            ref.artifactId,
            ref,
          ]),
        ),
        lockedRanges: applied.lockedRanges,
      };
    }
    const nextEpoch = state.approvalEpoch + 1;
    const frozen = freezeContent({
      repoRoot: formalRepoRoot!,
      episodeId: state.episodeId,
      artifactIndex: persisted.artifactIndex,
      selectedArtifactRefs: artifactRefs,
      issues: [],
      approvalEpoch: nextEpoch,
      runId: state.runId,
      frozenAt: decision.timestamp,
      frozenBy: `human:${decision.reviewer}`,
      manifestProducer: "human-content-freeze",
      ...(state.contentManifestRef ? {previousManifestRef: state.contentManifestRef} : {}),
    });
    ensureArtifactIndexForRefs({
      repoRoot: formalRepoRoot!,
      episodeId: state.episodeId,
      refs: [frozen.manifestRef],
      artifactIndex: persisted.artifactIndex,
      executionId: `human-decision:${decision.decisionId}:freeze`,
    });
    return {
      ...base,
      phase: "frozen" as const,
      approvalEpoch: nextEpoch,
      contentManifestRef: frozen.manifestRef,
      productionAuthorization: {
        decisionRef: persisted.decisionRef,
        manifestRef: frozen.manifestRef,
        decisionId: decision.decisionId,
        gate: "content-approval" as const,
        approvalEpoch: nextEpoch,
      },
      gates: {"content-approval": "pass" as const},
      pendingHumanRoute: null,
      artifacts: {
        [persisted.decisionRef.artifactId]: persisted.decisionRef,
        [frozen.manifestRef.artifactId]: frozen.manifestRef,
      },
      approvals: {
        [decision.decisionId]: {...approval, approvalEpoch: nextEpoch},
      },
    };
  };

  const finalApproval = (state: ProductionState) => {
    const artifactRefs = refsForFinalGate(state);
    const payload = {
      gate: "final-approval",
      episodeId: state.episodeId,
      runId: state.runId,
      artifactRefs,
      approvalEpoch: state.approvalEpoch,
      reviewStartedAt: decisionNow,
      decisionOptions: ["approve", "reject", "direct-edit"] as const,
    };
    const resumeValue = pauseForStubApproval(payload);
    if (!formalHumanDecision) return {phase: "final_approval" as const};
    const decision = readFormalDecision({
      value: resumeValue,
      gate: "final-approval",
      state,
      artifactRefs,
    });
    if (humanDecisionIsProcessed(state, decision.decisionId)) return {};
    const seededIndex = ensureArtifactIndexForRefs({
      repoRoot: formalRepoRoot!,
      episodeId: state.episodeId,
      refs: [...artifactRefs, ...decisionInputRefs(decision)],
      artifactIndex: input.humanDecision?.artifactIndex,
      executionId: `human-decision:${decision.decisionId}:inputs`,
    });
    const persisted = persistHumanDecision({
      repoRoot: formalRepoRoot!,
      decision,
      artifactIndex: seededIndex,
      executionId: `human-decision:${decision.decisionId}`,
    });
    const approval = approvalSummaryFor(decision, persisted.decisionRef);
    const base = {
      artifacts: {[persisted.decisionRef.artifactId]: persisted.decisionRef},
      approvals: {[decision.decisionId]: approval},
      decisions: {
        [decision.decisionId]: {
          code: `HUMAN_FINAL_${decision.decision.toUpperCase().replaceAll("-", "_")}`,
          summary: decision.reason,
        },
      },
      processedDecisionIds: [decision.decisionId],
    };
    if (decision.decision === "reject") {
      const issue = persistHumanIssue({
        repoRoot: formalRepoRoot!,
        decision,
        decisionRef: persisted.decisionRef,
        artifactIndex: persisted.artifactIndex,
        executionId: `human-decision:${decision.decisionId}:issue`,
      });
      return {
        ...base,
        ...issueStateUpdate(issue),
        phase: "production_revision" as const,
        gates: {"final-approval": "fail" as const},
        artifacts: {
          [persisted.decisionRef.artifactId]: persisted.decisionRef,
          [issue.issueRef.artifactId]: issue.issueRef,
        },
      };
    }
    if (decision.decision === "direct-edit") {
      const applied = applyHumanDirectEdits({
        repoRoot: formalRepoRoot!,
        decision,
        decisionRef: persisted.decisionRef,
        artifactIndex: persisted.artifactIndex,
        existingLockedRanges: state.lockedRanges,
        executionId: `human-decision:${decision.decisionId}`,
      });
      return {
        ...base,
        phase: "production_revision" as const,
        approvalEpoch: state.approvalEpoch + 1,
        gates: {"final-approval": "fail" as const},
        artifacts: Object.fromEntries(
          [persisted.decisionRef, ...applied.changedArtifactRefs].map((ref) => [
            ref.artifactId,
            ref,
          ]),
        ),
        lockedRanges: applied.lockedRanges,
      };
    }
    return {
      ...base,
      phase: "published" as const,
      gates: {"final-approval": "pass" as const},
      haltReason: "FINAL_APPROVED_INTERNAL_ONLY:no external publication performed",
    };
  };

  const finalize = (state: ProductionState) => {
    assertReferenceOnlyState(state);
    if (state.phase === "published") {
      return {
        phase: "published" as const,
        haltReason:
          state.haltReason ?? "FINAL_APPROVED_INTERNAL_ONLY:no external publication performed",
      };
    }
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
    afterContentApproval: (state) =>
      formalHumanDecision && state.productionAuthorization?.approvalEpoch === state.approvalEpoch
        ? "production"
        : "execute_agent",
    afterFinalApproval: (state) =>
      !formalHumanDecision ||
      Object.values(state.approvals).some(
        (approval) =>
          approval.gate === "final-approval" &&
          approval.status === "approved" &&
          approval.decision === "approve" &&
          approval.approvalEpoch === state.approvalEpoch,
      )
        ? "finalize"
        : "final_approval",
    production: input.production,
    checkpointer: input.checkpointer,
  });
};
