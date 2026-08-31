import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  appendExecutionEvent,
  assertApprovalObservability,
  buildArtifactRef,
  checkpointConfig,
  createCheckpointCommittedEvent,
  createDeterministicStubAgent,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  createObservabilityCheckpoint,
  createObservabilityControlEvent,
  createStageStartedEvent,
  createStageTerminalEvent,
  evaluateObservabilityCompleteness,
  generateRunReport,
  hashExecutionEvents,
  readExecutionEventLog,
  resumeCheckpoint,
  sha256Json,
  type CacheEvent,
  type ExecutionEvent,
  type ObservabilityEvent,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const createFixture = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-observability-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-observability";
  const runId = "run-observability-1";
  const inputPath = "content/episode-observability/source/input.txt";
  const outputPath = "content/episode-observability/production/output.txt";
  fs.mkdirSync(path.join(repoRoot, path.dirname(inputPath)), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, path.dirname(outputPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, inputPath), "input artifact\n");
  fs.writeFileSync(path.join(repoRoot, outputPath), "output artifact\n");
  const inputRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:source:input`,
    episodeId,
    path: inputPath,
    mediaType: "text/plain",
    schemaVersion: "fixture-v1",
    producer: "test",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  const outputRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:production:output`,
    episodeId,
    path: outputPath,
    mediaType: "text/plain",
    schemaVersion: "fixture-v1",
    producer: "test",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  const state = createInitialProductionState({
    episodeId,
    runId,
    artifacts: {[inputRef.artifactId]: inputRef, [outputRef.artifactId]: outputRef},
  });
  return {repoRoot, episodeId, runId, inputRef, outputRef, state};
};

const cacheEvent = (input: Omit<CacheEvent, "eventId">): CacheEvent => ({
  ...input,
  eventId: sha256Json(input),
});

const createStageRun = (input: ReturnType<typeof createFixture>, attempt = 1) => {
  const executionId = `${input.runId}:capture:${attempt}`;
  const startedMinute = String(attempt * 2 - 1).padStart(2, "0");
  const terminalMinute = String(attempt * 2).padStart(2, "0");
  const startedAt = `2026-08-14T00:${startedMinute}:00.000Z`;
  const terminalAt = `2026-08-14T00:${terminalMinute}:00.000Z`;
  const checkpoint = createObservabilityCheckpoint({
    state: input.state,
    checkpointId: `${input.runId}:checkpoint:capture:${attempt}`,
    checkpointVersion: "production-checkpoint-v1",
    committedAt: terminalAt,
  });
  const started = createStageStartedEvent({
    state: input.state,
    stage: "capture",
    executionId,
    attempt,
    inputArtifacts: [input.inputRef],
    checkpoint: createObservabilityCheckpoint({
      state: input.state,
      checkpointId: `${checkpoint.checkpointId}:start`,
      checkpointVersion: checkpoint.checkpointVersion,
      committedAt: startedAt,
    }),
    occurredAt: startedAt,
    inputSetHash: undefined,
  });
  const committed = createCheckpointCommittedEvent({
    state: input.state,
    stage: "capture",
    executionId,
    attempt,
    inputArtifacts: [input.inputRef],
    outputArtifacts: [input.outputRef],
    checkpoint,
    status: "succeeded",
    occurredAt: terminalAt,
  });
  const terminal = createStageTerminalEvent({
    state: input.state,
    stage: "capture",
    executionId,
    attempt,
    status: "succeeded",
    inputArtifacts: [input.inputRef],
    outputArtifacts: [input.outputRef],
    checkpoint,
    occurredAt: terminalAt,
    startedAt,
    decision: {
      code: "CAPTURE_OK",
      summary: "capture completed",
      rubricVersion: null,
      score: null,
      verdict: "PASS",
      issueIds: [],
      route: null,
      criticResultRef: null,
    },
  });
  return {started, committed, terminal};
};

const createControlEvents = (input: ReturnType<typeof createFixture>): ObservabilityEvent[] => {
  const humanDecision = createObservabilityControlEvent({
    state: input.state,
    eventType: "human-decision.recorded",
    stage: "human-decision:content-approval",
    executionId: `${input.runId}:human-decision:content-1`,
    decisionId: "content-1",
    inputArtifacts: [input.inputRef],
    occurredAt: "2026-08-14T00:02:00.000Z",
    executionKind: "human-decision",
    decisionCode: "HUMAN_CONTENT_APPROVE",
    decisionSummary: "reviewer approved; token=super-secret-value",
  });
  const repair = createObservabilityControlEvent({
    state: input.state,
    eventType: "repair.started",
    stage: "capture",
    executionId: `${input.runId}:repair:1:capture`,
    attempt: 1,
    inputArtifacts: [input.inputRef],
    occurredAt: "2026-08-14T00:02:30.000Z",
    decisionCode: "REPAIR_STARTED",
    decisionSummary: "capture repair started",
  });
  const retry = createObservabilityControlEvent({
    state: input.state,
    eventType: "retry.scheduled",
    stage: "capture",
    executionId: `${input.runId}:capture:1`,
    attempt: 1,
    nextAttempt: 2,
    inputArtifacts: [input.inputRef],
    occurredAt: "2026-08-14T00:02:45.000Z",
    decisionCode: "RETRY_SCHEDULED",
    decisionSummary: "retry scheduled after transient failure",
  });
  return [humanDecision, repair, retry];
};

const createCacheEvents = (input: ReturnType<typeof createFixture>): CacheEvent[] => {
  const common = {
    schemaVersion: "cache-event-v1" as const,
    episodeId: input.episodeId,
    runId: input.runId,
    traceId: `${input.runId}:cache`,
    executionId: `${input.runId}:capture:1`,
    attempt: 1,
    revisionRound: 0,
    approvalEpoch: 0,
    stage: "capture",
    logicalItem: "shot-1",
    cacheKey: "a".repeat(64),
    usage: {
      availability: "not-applicable" as const,
      inputTokens: 0 as const,
      outputTokens: 0 as const,
      cacheReadTokens: 0 as const,
      cacheWriteTokens: 0 as const,
      totalTokens: 0 as const,
    },
    cost: {amount: "0", currency: "USD" as const, pricingVersion: "cache-v1"},
  };
  return [
    cacheEvent({
      ...common,
      eventType: "cache.lookup",
      occurredAt: "2026-08-14T00:00:30.000Z",
      hit: null,
      reason: "lookup",
    }),
    cacheEvent({
      ...common,
      eventType: "cache.hit",
      occurredAt: "2026-08-14T00:00:31.000Z",
      hit: true,
      reason: "hash-valid-cache",
    }),
  ];
};

describe("WP-M4-04 observability completeness gate", () => {
  it("passes a complete run and derives an auditable report", () => {
    const fixture = createFixture();
    const stage = createStageRun(fixture);
    const events = [
      stage.started,
      ...createControlEvents(fixture).slice(0, 1),
      stage.committed,
      stage.terminal,
    ];
    const result = evaluateObservabilityCompleteness({
      episodeId: fixture.episodeId,
      runId: fixture.runId,
      state: fixture.state,
      events,
      cacheEvents: createCacheEvents(fixture),
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });

    expect(result.status).toBe("observability-complete");
    expect(result.approvalAllowed).toBe(true);
    const report = generateRunReport({
      episodeId: fixture.episodeId,
      runId: fixture.runId,
      state: fixture.state,
      events,
      cacheEvents: createCacheEvents(fixture),
      repoRoot: fixture.repoRoot,
    });
    expect(report.report).toContain("## Stage timeline");
    expect(report.report).toContain("## Usage / cost availability");
    expect(report.report).toContain("unavailable");
    expect(report.report).toContain("cost=0");
    expect(report.report).not.toContain("super-secret-value");
    expect(
      events.find((event) => event.eventType === "human-decision.recorded")?.decision?.summary,
    ).toContain("[REDACTED]");
  });

  it("blocks approval when a stage has no terminal event", () => {
    const fixture = createFixture();
    const stage = createStageRun(fixture);
    const result = evaluateObservabilityCompleteness({
      state: fixture.state,
      events: [stage.started, stage.committed],
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });

    expect(result.approvalAllowed).toBe(false);
    expect(result.status).toBe("observability-degraded");
    expect(result.reasons.join(" ")).toMatch(/TERMINAL|CHECKPOINT/u);
    expect(() =>
      assertApprovalObservability({
        state: fixture.state,
        events: [stage.started, stage.committed],
        executedStages: ["capture"],
        repoRoot: fixture.repoRoot,
      }),
    ).toThrow(/OBSERVABILITY_DEGRADED/u);
  });

  it("blocks checkpoint/event mismatch and tampered event hashes", () => {
    const fixture = createFixture();
    const stage = createStageRun(fixture);
    const wrongCheckpoint = createObservabilityCheckpoint({
      state: fixture.state,
      checkpointId: `${fixture.runId}:checkpoint:wrong`,
      checkpointVersion: "production-checkpoint-v1",
    });
    const wrongCommit = createCheckpointCommittedEvent({
      state: fixture.state,
      stage: "capture",
      executionId: stage.terminal.executionId,
      attempt: 1,
      inputArtifacts: [fixture.inputRef],
      outputArtifacts: [fixture.outputRef],
      checkpoint: wrongCheckpoint,
      occurredAt: "2026-08-14T00:01:00.000Z",
    });
    const mismatch = evaluateObservabilityCompleteness({
      events: [stage.started, wrongCommit, stage.terminal],
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });
    expect(mismatch.approvalAllowed).toBe(false);
    expect(mismatch.reasons.join(" ")).toContain("CHECKPOINT_EVENT_CONFLICT");

    const tampered = {
      ...stage.terminal,
      decision: {...stage.terminal.decision!, summary: "tampered"},
    };
    const tamperedResult = evaluateObservabilityCompleteness({
      events: [stage.started, stage.committed, tampered],
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });
    expect(tamperedResult.approvalAllowed).toBe(false);
    expect(tamperedResult.reasons.join(" ")).toMatch(/HASH|REDACTION/u);
  });

  it("tracks retry, repair, HumanDecision, cache hit and unavailable usage", () => {
    const fixture = createFixture();
    const first = createStageRun(fixture, 1);
    const second = createStageRun(fixture, 2);
    const events = [
      first.started,
      first.committed,
      first.terminal,
      ...createControlEvents(fixture),
      second.started,
      second.committed,
      second.terminal,
    ];
    const result = evaluateObservabilityCompleteness({
      state: fixture.state,
      events,
      cacheEvents: createCacheEvents(fixture),
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });
    expect(result.approvalAllowed).toBe(true);
    expect(result.cacheEvents.find((event) => event.eventType === "cache.hit")?.cost.amount).toBe(
      "0",
    );
    const report = generateRunReport({
      state: fixture.state,
      events,
      cacheEvents: createCacheEvents(fixture),
      repoRoot: fixture.repoRoot,
    }).report;
    expect(report).toContain("retry.scheduled");
    expect(report).toContain("repair.started");
    expect(report).toContain("human-decision.recorded");
    expect(report).toContain("cache.hit");
    expect(report).toContain("unavailable");
  });

  it("recovers after completeness is repaired and keeps repeated resume idempotent", () => {
    const fixture = createFixture();
    const stage = createStageRun(fixture);
    const incomplete = evaluateObservabilityCompleteness({
      events: [stage.started, stage.committed],
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });
    expect(incomplete.approvalAllowed).toBe(false);
    const repaired = evaluateObservabilityCompleteness({
      events: [stage.started, stage.committed, stage.terminal],
      executedStages: ["capture"],
      repoRoot: fixture.repoRoot,
    });
    expect(repaired.approvalAllowed).toBe(true);

    const logPath = path.join(
      fixture.repoRoot,
      "content/episode-observability/observability/events.jsonl",
    );
    for (const event of [
      stage.started,
      stage.committed,
      stage.terminal,
      stage.started,
      stage.committed,
      stage.terminal,
    ]) {
      appendExecutionEvent(logPath, event as ExecutionEvent);
    }
    const replayed = readExecutionEventLog(logPath);
    expect(replayed).toHaveLength(3);
    expect(hashExecutionEvents(replayed)).toBe(
      hashExecutionEvents([stage.started, stage.committed, stage.terminal]),
    );
  });

  it("reports historical epoch replay debt without blocking current approval refs", () => {
    const fixture = createFixture();
    const historical = createStageRun(fixture);
    fs.writeFileSync(path.join(fixture.repoRoot, fixture.inputRef.path), "later revision bytes\n");

    const result = evaluateObservabilityCompleteness({
      episodeId: fixture.episodeId,
      runId: fixture.runId,
      state: {...fixture.state, approvalEpoch: 1},
      events: [historical.started, historical.committed, historical.terminal],
      repoRoot: fixture.repoRoot,
      approvalScope: {approvalEpoch: 1, artifactRefs: [fixture.outputRef]},
    });

    expect(result.approvalAllowed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(
      /historical observability debt: ARTIFACT_HASH_MISMATCH/u,
    );
  });

  it("still blocks a current approval ref whose bytes no longer match", () => {
    const fixture = createFixture();
    const historical = createStageRun(fixture);
    fs.writeFileSync(
      path.join(fixture.repoRoot, fixture.inputRef.path),
      "tampered current bytes\n",
    );

    const result = evaluateObservabilityCompleteness({
      episodeId: fixture.episodeId,
      runId: fixture.runId,
      state: {...fixture.state, approvalEpoch: 1},
      events: [historical.started, historical.committed, historical.terminal],
      repoRoot: fixture.repoRoot,
      approvalScope: {approvalEpoch: 1, artifactRefs: [fixture.inputRef]},
    });

    expect(result.approvalAllowed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/ARTIFACT_HASH_MISMATCH/u);
  });

  it("blocks the formal graph approval boundary until canonical events are complete", async () => {
    const fixture = createFixture();
    const events: ObservabilityEvent[] = [];
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      repoRoot: fixture.repoRoot,
      humanDecision: {repoRoot: fixture.repoRoot},
      observability: {
        eventSink: (event) => events.push(event),
        events: () => events,
        repoRoot: fixture.repoRoot,
      },
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "observability-complete.sqlite",
      }),
    });
    const config = checkpointConfig(fixture.episodeId);
    const first = await graph.invoke(fixture.state, config);
    const payload = (first as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    expect(payload?.gate).toBe("content-approval");
    const decision = {
      decisionId: "observability-content-1",
      gate: "content-approval" as const,
      decision: "approve" as const,
      reviewer: "observability-reviewer",
      timestamp: "2026-08-14T00:10:00.000Z",
      reason: "canonical observability is complete",
      artifactRefs: payload?.artifactRefs,
      approvalEpoch: payload?.approvalEpoch,
    };
    const resumed = await graph.invoke(resumeCheckpoint(decision), config);
    expect(
      (resumed as {__interrupt__?: {value: Record<string, unknown>}[]}).__interrupt__?.[0]?.value,
    ).toMatchObject({gate: "final-approval"});
    expect(events.filter((event) => event.eventType === "execution.started")).toHaveLength(10);
    expect(events.some((event) => event.eventType === "human-decision.recorded")).toBe(true);
  });
});
