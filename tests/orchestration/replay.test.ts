import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  appendExecutionEvent,
  buildArtifactRef,
  checkpointConfig,
  createDeterministicStubAgent,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  createProductionSubgraph,
  hashExecutionEvents,
  markStaleTransitively,
  readArtifactIndex,
  readExecutionEventLog,
  rebuildExecutionView,
  restoreVerifiedReplayState,
  resumeCheckpoint,
  runAgentWithBoundedRetry,
  stableJson,
  verifyExecutionEventLog,
  writeArtifactIndex,
  type AgentExecutionResult,
  type ArtifactRef,
  type ExecutionEvent,
  type ProductionStageAdapter,
} from "../../src/orchestration";
import {
  productionStageInputSetHash,
  productionStageOrder,
} from "../../src/orchestration/agents/adapters/deterministic-tool";
import {humanDecisionSchema} from "../../src/orchestration/schemas/human-decision";
import {selectedArtifactIndexFixture, writeArtifactFixture} from "../helpers/artifacts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

type LoggedRun = {
  repoRoot: string;
  state: ReturnType<typeof createInitialProductionState>;
  checkpointer: ReturnType<typeof createLocalCheckpoint>;
  config: ReturnType<typeof checkpointConfig>;
  logPath: string;
  eventLogSha256: string;
  events: ExecutionEvent[];
  controlRef: ArtifactRef;
};

const createLoggedRun = async (): Promise<LoggedRun> => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-replay-"));
  temporaryDirectories.push(repoRoot);
  const controlRef = writeArtifactFixture({
    repoRoot,
    artifactId: "episode-replay:control:contract",
    episodeId: "episode-replay",
    relativePath: "content/episode-replay/control/contract.md",
    body: "reference-only replay contract\n",
  });
  writeArtifactIndex(
    path.join(repoRoot, "content/episode-replay/artifact-index.json"),
    selectedArtifactIndexFixture("episode-replay", [{ref: controlRef}]),
  );
  const state = createInitialProductionState({
    episodeId: "episode-replay",
    runId: "run-replay",
    artifacts: {contract: controlRef},
  });
  const config = checkpointConfig(state.episodeId);
  const checkpointer = createLocalCheckpoint({repoRoot, databasePath: "replay.sqlite"});
  const logPath = path.join(repoRoot, "content/episode-replay/observability/executions.jsonl");
  const events: ExecutionEvent[] = [];
  const graph = createFoundationGraph({
    runAgent: createDeterministicStubAgent(),
    checkpointer,
    eventSink: (event) => {
      appendExecutionEvent(logPath, event);
      events.push(event);
    },
    now: () => "2026-08-14T00:00:00.000Z",
  });
  const contentPause = await graph.invoke(state, config);
  expect(
    (contentPause as {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value,
  ).toMatchObject({
    gate: "content-approval",
  });
  const finalPause = await graph.invoke(resumeCheckpoint({stub: "resume"}), config);
  expect(
    (finalPause as {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value,
  ).toMatchObject({
    gate: "final-approval",
  });
  const final = await graph.invoke(resumeCheckpoint({stub: "resume"}), config);
  const persistedEvents = readExecutionEventLog(logPath);
  expect(final.phase).toBe("halted");
  return {
    repoRoot,
    state: final,
    checkpointer,
    config,
    logPath,
    eventLogSha256: hashExecutionEvents(persistedEvents),
    events,
    controlRef,
  };
};

const productionFixture = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-production-replay-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-replay-production";
  const manifestPath = `content/${episodeId}/production/content-manifest.json`;
  fs.mkdirSync(path.dirname(path.join(repoRoot, manifestPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, manifestPath), '{"schemaVersion":"manifest-v1"}\n');
  const manifestRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:production:manifest`,
    episodeId,
    path: manifestPath,
    mediaType: "application/json",
    schemaVersion: "manifest-v1",
    producer: "fixture",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  writeArtifactIndex(
    path.join(repoRoot, `content/${episodeId}/artifact-index.json`),
    selectedArtifactIndexFixture(episodeId, [{ref: manifestRef}]),
  );
  const initial = createInitialProductionState({
    episodeId,
    runId: "run-production-replay",
    artifacts: {manifest: manifestRef},
  });
  return {
    repoRoot,
    manifestRef,
    state: {...initial, phase: "frozen" as const, contentManifestRef: manifestRef},
  };
};

const createReplayAdapter =
  (repoRoot: string): ProductionStageAdapter =>
  async (request) => {
    const slug = request.stage.replaceAll(":", "-");
    const outputPath = `content/${request.episodeId}/production/replay-${slug}.json`;
    fs.mkdirSync(path.dirname(path.join(repoRoot, outputPath)), {recursive: true});
    fs.writeFileSync(
      path.join(repoRoot, outputPath),
      JSON.stringify({stage: request.stage}) + "\n",
    );
    const output = buildArtifactRef({
      repoRoot,
      artifactId:
        request.stage === "validate:delivery"
          ? `${request.episodeId}:production:receipt-validate-delivery`
          : `${request.episodeId}:production:replay-${slug}`,
      episodeId: request.episodeId,
      path: outputPath,
      mediaType: "application/json",
      schemaVersion: "replay-output-v1",
      producer: "replay-fixture",
      createdAt: "2026-08-14T00:00:00.000Z",
    });
    return {
      contractVersion: "production-stage-result-v1",
      executionId: request.executionId,
      episodeId: request.episodeId,
      stage: request.stage,
      status: "SUCCEEDED",
      attempt: request.attempt,
      inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
      inputArtifacts: request.inputArtifacts,
      outputArtifacts: [output],
      issues: [],
      decision: {code: "REPLAY_FIXTURE_OK", summary: "hash-bound deterministic output"},
    };
  };

describe("WP-M4-02 replay contracts", () => {
  it("REPLAY-001 restores a recorded run deterministically with identical state, refs, and log hash", async () => {
    const first = await createLoggedRun();
    const second = await createLoggedRun();
    expect(stableJson(first.state)).toBe(stableJson(second.state));
    expect(first.eventLogSha256).toBe(second.eventLogSha256);
    expect(first.events.map((event) => event.eventId)).toEqual(
      second.events.map((event) => event.eventId),
    );
    expect(stableJson(first.state.events)).toBe(stableJson(second.state.events));
  });

  it("REPLAY-002 resumes from the persistent checkpoint without rerunning hash-valid agents or stages", async () => {
    const run = await createLoggedRun();
    const verified = await restoreVerifiedReplayState({
      checkpointer: run.checkpointer,
      config: run.config,
      repoRoot: run.repoRoot,
      eventLogPath: run.logPath,
      expectedEventLogSha256: run.eventLogSha256,
    });
    expect(stableJson(verified.state)).toBe(stableJson(run.state));
    const calls: string[] = [];
    const resumedGraph = createFoundationGraph({
      runAgent: createDeterministicStubAgent({onCall: (agent) => calls.push(agent)}),
      checkpointer: run.checkpointer,
      now: () => "2026-08-14T00:00:00.000Z",
    });
    const resumed = await resumedGraph.invoke(null, run.config);
    expect(resumed.phase).toBe("halted");
    expect(calls).toEqual([]);

    const fixture = productionFixture();
    const stageCalls: string[] = [];
    const adapter = async (request: Parameters<ProductionStageAdapter>[0]) => {
      stageCalls.push(request.stage);
      return createReplayAdapter(fixture.repoRoot)(request);
    };
    const firstProduction = await createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "production.sqlite",
      }),
      adapter,
    }).invoke(fixture.state, {configurable: {thread_id: "production-replay"}});
    expect(firstProduction.phase).toBe("production_ready");
    const callsAfterFirst = [...stageCalls];
    const secondProduction = await createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "production.sqlite",
      }),
      adapter,
    }).invoke(firstProduction, {configurable: {thread_id: "production-replay-resume"}});
    expect(secondProduction.phase).toBe("production_ready");
    expect(stageCalls).toEqual(callsAfterFirst);
    expect(callsAfterFirst).toEqual([...productionStageOrder]);
  });

  it("REPLAY-003 rebuilds execution views from a verified log and rejects missing, reordered, and tampered logs", async () => {
    const run = await createLoggedRun();
    const events = readExecutionEventLog(run.logPath);
    const verified = verifyExecutionEventLog({
      filePath: run.logPath,
      expectedSha256: run.eventLogSha256,
      episodeId: run.state.episodeId,
    });
    expect(rebuildExecutionView(verified.events)).toHaveLength(11);

    const reorderedPath = path.join(run.repoRoot, "reordered.jsonl");
    const lines = fs.readFileSync(run.logPath, "utf8").trim().split("\n");
    fs.writeFileSync(reorderedPath, [lines[1], lines[0], ...lines.slice(2)].join("\n") + "\n");
    expect(() =>
      verifyExecutionEventLog({
        filePath: reorderedPath,
        expectedSha256: run.eventLogSha256,
        episodeId: run.state.episodeId,
      }),
    ).toThrow(/EVENT_LOG_REORDERED/u);

    const tamperedPath = path.join(run.repoRoot, "tampered.jsonl");
    fs.writeFileSync(
      tamperedPath,
      fs.readFileSync(run.logPath, "utf8").replace("execution.started", "execution.failed"),
    );
    expect(() =>
      verifyExecutionEventLog({
        filePath: tamperedPath,
        expectedSha256: run.eventLogSha256,
        episodeId: run.state.episodeId,
      }),
    ).toThrow(/EVENT_LOG_TAMPERED/u);
    expect(() =>
      verifyExecutionEventLog({
        filePath: path.join(run.repoRoot, "missing.jsonl"),
        expectedSha256: run.eventLogSha256,
        episodeId: run.state.episodeId,
      }),
    ).toThrow(/EVENT_LOG_MISSING/u);
    expect(events.length).toBeGreaterThan(0);
  });

  it("REPLAY-004 keeps routing and retry state deterministic when live sample text differs", async () => {
    const request = {
      contractVersion: "agent-execution-v1" as const,
      executionId: "run-live-sample:agent:1",
      episodeId: "episode-replay",
      agentName: "story-director" as const,
      attempt: 1,
      revisionRound: 0,
      promptRef: {
        ...({
          artifactId: "episode-replay:control:contract",
          episodeId: "episode-replay",
          path: "content/episode-replay/control/contract.md",
          mediaType: "text/markdown",
          schemaVersion: "contract-v1",
          revision: 1,
          sha256: "a".repeat(64),
          sizeBytes: 1,
          producer: "fixture",
          createdAt: "2026-08-14T00:00:00.000Z",
        } satisfies ArtifactRef),
      },
      inputArtifacts: [],
      expectedOutputs: [],
      upstreamGateRefs: [],
      revisionBudgetRemaining: 1,
    };
    const sample = (text: string) => async (): Promise<AgentExecutionResult> => ({
      contractVersion: "agent-execution-result-v1",
      executionId: request.executionId,
      status: "SUCCEEDED",
      outputArtifacts: [],
      decision: {code: "ROUTE_NEXT", summary: text},
    });
    const first = await runAgentWithBoundedRetry({
      runAgent: async () => sample("live-a")(),
      request,
    });
    const second = await runAgentWithBoundedRetry({
      runAgent: async () => sample("live-b")(),
      request,
    });
    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");
    expect(first.status === "SUCCEEDED" && first.value.decision.code).toBe(
      second.status === "SUCCEEDED" ? second.value.decision.code : "",
    );
    expect(stableJson(first.status === "SUCCEEDED" ? first.value.decision : null)).not.toBe(
      stableJson(second.status === "SUCCEEDED" ? second.value.decision : null),
    );
  });

  it("REPLAY-005 refuses approval/production-ready recovery after artifact tampering and stale registry state", async () => {
    const run = await createLoggedRun();
    fs.writeFileSync(path.join(run.repoRoot, run.controlRef.path), "tampered control bytes\n");
    await expect(
      restoreVerifiedReplayState({
        checkpointer: run.checkpointer,
        config: run.config,
        repoRoot: run.repoRoot,
        eventLogPath: run.logPath,
        expectedEventLogSha256: run.eventLogSha256,
      }),
    ).rejects.toThrow(/ARTIFACT_HASH_MISMATCH/u);
    expect(run.state.gates["content-approval"]).toBeUndefined();
    expect(run.state.phase).not.toBe("published");

    fs.writeFileSync(
      path.join(run.repoRoot, run.controlRef.path),
      "reference-only replay contract\n",
    );
    const indexPath = path.join(run.repoRoot, "content/episode-replay/artifact-index.json");
    const staleIndex = markStaleTransitively(readArtifactIndex(indexPath), [
      run.controlRef.artifactId,
    ]);
    writeArtifactIndex(indexPath, staleIndex);
    await expect(
      restoreVerifiedReplayState({
        checkpointer: run.checkpointer,
        config: run.config,
        repoRoot: run.repoRoot,
        eventLogPath: run.logPath,
        expectedEventLogSha256: run.eventLogSha256,
      }),
    ).rejects.toThrow(/ARTIFACT_STALE_OR_NOT_SELECTED/u);
  });

  it("REPLAY-006 rejects a tampered final-approval input before publishing", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-human-replay-"));
    temporaryDirectories.push(repoRoot);
    const ref = writeArtifactFixture({
      repoRoot,
      artifactId: "episode-human-replay:story:final-script",
      episodeId: "episode-human-replay",
      relativePath: "content/episode-human-replay/story/final-script.md",
      body: "final script bytes\n",
    });
    const state = createInitialProductionState({
      episodeId: "episode-human-replay",
      runId: "run-human-replay",
      artifacts: {finalScript: ref},
    });
    const config = checkpointConfig(state.episodeId);
    const checkpointer = createLocalCheckpoint({repoRoot, databasePath: "human.sqlite"});
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      repoRoot,
      humanDecision: {repoRoot},
      checkpointer,
      now: () => "2026-08-14T00:00:00.000Z",
    });
    const contentPause = await graph.invoke(state, config);
    const contentPayload = (contentPause as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    const contentDecision = humanDecisionSchema.parse({
      decisionId: "human-content-replay",
      gate: "content-approval",
      decision: "approve",
      reviewer: "replay-reviewer",
      timestamp: "2026-08-14T00:10:00.000Z",
      reason: "content approved for deterministic replay",
      artifactRefs: contentPayload?.artifactRefs,
      approvalEpoch: contentPayload?.approvalEpoch,
    });
    const finalPause = await graph.invoke(resumeCheckpoint(contentDecision), config);
    const finalPayload = (finalPause as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    fs.writeFileSync(path.join(repoRoot, ref.path), "tampered after content approval\n");
    const finalDecision = humanDecisionSchema.parse({
      decisionId: "human-final-replay",
      gate: "final-approval",
      decision: "approve",
      reviewer: "replay-reviewer",
      timestamp: "2026-08-14T00:11:00.000Z",
      reason: "final approval must not pass tampered bytes",
      artifactRefs: finalPayload?.artifactRefs,
      approvalEpoch: finalPayload?.approvalEpoch,
    });
    await expect(graph.invoke(resumeCheckpoint(finalDecision), config)).rejects.toThrow(
      /HUMAN_DECISION_ARTIFACT_HASH_MISMATCH/u,
    );
    const snapshot = await graph.getState(config);
    expect(snapshot.values.phase).toBe("frozen");
    expect(snapshot.values.gates["final-approval"]).not.toBe("pass");
    expect(snapshot.values.processedDecisionIds).toEqual(["human-content-replay"]);
  });
});
