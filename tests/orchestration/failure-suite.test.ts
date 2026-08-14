import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  appendExecutionEvent,
  assertArtifactRefsBytes,
  assertArtifactRefsSelected,
  assertCheckpointControlHash,
  assertHumanDecisionArtifactRefsCurrent,
  assertHumanDecisionReplay,
  buildArtifactRef,
  checkRevisionBudget,
  checkpointConfig,
  createAgentRunner,
  createDeterministicStubAgent,
  DeterministicFailureInjector,
  createFakeClock,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  createRevisionLedger,
  ensureArtifactIndexForRefs,
  FailureSignal,
  markStaleTransitively,
  persistHumanDecision,
  recordRevisionAttempt,
  readExecutionEventLog,
  restoreVerifiedCheckpoint,
  runDeclaredProviderFallback,
  runAgentWithBoundedRetry,
  runBoundedRetry,
  runProductionStageWithRetry,
  stableJson,
  writeArtifactIndex,
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type AgentName,
  type ArtifactRef,
  type ProductionStageResult,
} from "../../src/orchestration";
import type {LocalCheckpointer} from "../../src/orchestration/lg-compat";
import {productionStageInputSetHash} from "../../src/orchestration/agents/adapters/deterministic-tool";
import {humanDecisionSchema} from "../../src/orchestration/schemas/human-decision";
import {productionStageResultSchema} from "../../src/orchestration/schemas/production";
import {selectedArtifactIndexFixture, writeArtifactFixture} from "../helpers/artifacts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const failure = (input: {
  code: string;
  class:
    | "transient-api"
    | "rate-limit"
    | "authentication"
    | "invalid-output"
    | "stale-input"
    | "tooling"
    | "checkpoint"
    | "unknown";
  retryable: boolean;
  message: string;
  retryAfterMs?: number | null;
}) => ({...input, retryAfterMs: input.retryAfterMs ?? null});

const agentRequest = (): AgentExecutionRequest => {
  const ref = {
    artifactId: "episode-failure:control:contract",
    episodeId: "episode-failure",
    path: "content/episode-failure/control/contract.md",
    mediaType: "text/markdown",
    schemaVersion: "contract-v1",
    revision: 1,
    sha256: "a".repeat(64),
    sizeBytes: 1,
    producer: "fixture",
    createdAt: "2026-08-14T00:00:00.000Z",
  } satisfies ArtifactRef;
  return {
    contractVersion: "agent-execution-v1",
    executionId: "run-failure:provider:1",
    episodeId: "episode-failure",
    agentName: "story-director",
    attempt: 1,
    revisionRound: 0,
    promptRef: ref,
    inputArtifacts: [ref],
    expectedOutputs: [],
    upstreamGateRefs: [],
    revisionBudgetRemaining: 1,
  };
};

const validAgentResult = (request: AgentExecutionRequest): AgentExecutionResult => ({
  contractVersion: "agent-execution-result-v1",
  executionId: request.executionId,
  status: "SUCCEEDED",
  outputArtifacts: [],
  decision: {code: "FIXTURE_OK", summary: "deterministic fixture success"},
});

const createProductionFixture = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-failure-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-failure";
  const manifestPath = `content/${episodeId}/production/content-manifest.json`;
  fs.mkdirSync(path.dirname(path.join(repoRoot, manifestPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, manifestPath), '{"schemaVersion":"fixture-manifest-v1"}\n');
  const manifestRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:production:manifest`,
    episodeId,
    path: manifestPath,
    mediaType: "application/json",
    schemaVersion: "fixture-manifest-v1",
    producer: "fixture",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  writeArtifactIndex(
    path.join(repoRoot, `content/${episodeId}/artifact-index.json`),
    selectedArtifactIndexFixture(episodeId, [{ref: manifestRef}]),
  );
  const initial = createInitialProductionState({
    episodeId,
    runId: "run-failure-stage",
    artifacts: {manifest: manifestRef},
  });
  return {
    repoRoot,
    manifestRef,
    state: {
      ...initial,
      phase: "frozen" as const,
      contentManifestRef: manifestRef,
    },
  };
};

const resultFor = (
  request: Parameters<NonNullable<Parameters<typeof runProductionStageWithRetry>[0]["adapter"]>>[0],
  status: "FAILED" | "SUCCEEDED",
  outputArtifacts: readonly ArtifactRef[] = [],
): ProductionStageResult => ({
  contractVersion: "production-stage-result-v1",
  executionId: request.executionId,
  episodeId: request.episodeId,
  stage: request.stage,
  status,
  attempt: request.attempt,
  inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
  inputArtifacts: request.inputArtifacts,
  outputArtifacts: [...outputArtifacts],
  issues: [],
  decision: {
    code: status === "FAILED" ? "FIXTURE_RETRYABLE_FAILURE" : "FIXTURE_OK",
    summary: status === "FAILED" ? "transient fixture stage failure" : "fixture stage success",
  },
  ...(status === "FAILED"
    ? {
        failure: {
          code: "FIXTURE_PROVIDER_TIMEOUT",
          retryable: true,
          detail: "deterministic provider timeout",
        },
      }
    : {}),
});

const checkpointWithPutFailure = (
  base: LocalCheckpointer,
  point: "checkpoint-before" | "checkpoint-after",
): LocalCheckpointer => {
  const fault = {
    code: point === "checkpoint-before" ? "CHECKPOINT_BEFORE_COMMIT" : "CHECKPOINT_AFTER_COMMIT",
    class: "checkpoint" as const,
    retryable: false,
    message: `deterministic ${point} interruption`,
    retryAfterMs: null,
  };
  const injector = new DeterministicFailureInjector([{point, failure: fault}]);
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "put") return Reflect.get(target, property, receiver);
      return async (...args: Parameters<LocalCheckpointer["put"]>) => {
        if (point === "checkpoint-before") injector.hit(point);
        const result = await target.put(...args);
        if (point === "checkpoint-after") injector.hit(point);
        return result;
      };
    },
  }) as LocalCheckpointer;
};

const checkpointWithTamperedState = (base: LocalCheckpointer): LocalCheckpointer =>
  new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "getTuple") return Reflect.get(target, property, receiver);
      return async (...args: Parameters<LocalCheckpointer["getTuple"]>) => {
        const tuple = await target.getTuple(...args);
        if (!tuple) return tuple;
        return {
          ...tuple,
          checkpoint: {
            ...tuple.checkpoint,
            channel_values: {
              ...tuple.checkpoint.channel_values,
              phase: "published",
            },
          },
        };
      };
    },
  }) as LocalCheckpointer;

const establishFailedCheckpoint = async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-checkpoint-"));
  temporaryDirectories.push(repoRoot);
  const controlPath = "content/episode-checkpoint/control/contracts.md";
  fs.mkdirSync(path.dirname(path.join(repoRoot, controlPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, controlPath), "reference-only checkpoint control\n");
  const controlRef = buildArtifactRef({
    repoRoot,
    artifactId: "episode-checkpoint:control:contracts",
    episodeId: "episode-checkpoint",
    path: controlPath,
    mediaType: "text/markdown",
    schemaVersion: "contracts-v1",
    producer: "fixture",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  const state = createInitialProductionState({
    episodeId: "episode-checkpoint",
    runId: "run-checkpoint",
    artifacts: {contracts: controlRef},
  });
  const checkpointer = createLocalCheckpoint({repoRoot, databasePath: "checkpoint.sqlite"});
  const config = checkpointConfig(state.episodeId);
  await expect(
    createFoundationGraph({
      runAgent: createDeterministicStubAgent({failOnceAt: "viral-director"}),
      checkpointer,
      now: () => "2026-08-14T00:00:00.000Z",
    }).invoke(state, config),
  ).rejects.toThrow(/stub failure/u);
  return {repoRoot, state, checkpointer, config};
};

describe("WP-M4-02 failure injection contracts", () => {
  it("FAILURE-001 retries a transient provider failure with a total cap and fake clock", async () => {
    const clock = createFakeClock();
    let calls = 0;
    const result = await runBoundedRetry({
      policy: {maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 60_000},
      clock,
      operation: (attempt) => {
        calls += 1;
        if (attempt < 3) {
          throw new FailureSignal(
            failure({
              code: "PROVIDER_TIMEOUT",
              class: "transient-api",
              retryable: true,
              message: "deterministic timeout",
            }),
          );
        }
        return "ok";
      },
    });
    expect(result).toMatchObject({status: "SUCCEEDED", attempts: 3, delaysMs: [1000, 2000]});
    expect(calls).toBe(3);
    expect(clock.delays).toEqual([1000, 2000]);
  });

  it("FAILURE-002 caps Retry-After at 60 seconds without sleeping", async () => {
    const clock = createFakeClock();
    const result = await runBoundedRetry({
      policy: {maxAttempts: 2, baseDelayMs: 1_000, maxDelayMs: 60_000},
      clock,
      operation: (attempt) => {
        if (attempt === 1) {
          throw new FailureSignal(
            failure({
              code: "RATE_LIMIT",
              class: "rate-limit",
              retryable: true,
              message: "deterministic rate limit",
              retryAfterMs: 120_000,
            }),
          );
        }
        return "ok";
      },
    });
    expect(result).toMatchObject({status: "SUCCEEDED", attempts: 2, delaysMs: [60_000]});
    expect(clock.delays).toEqual([60_000]);
  });

  it("FAILURE-003 never retries authentication failures", async () => {
    let calls = 0;
    const result = await runBoundedRetry({
      operation: () => {
        calls += 1;
        throw new FailureSignal(
          failure({
            code: "AUTH_FAILURE",
            class: "authentication",
            retryable: true,
            message: "provider credentials rejected",
          }),
        );
      },
    });
    expect(result).toMatchObject({
      status: "FAILED",
      attempts: 1,
      failure: {class: "authentication"},
    });
    expect(calls).toBe(1);
  });

  it("FAILURE-004 repairs one invalid contract response and does not consume a revision budget", async () => {
    const request = agentRequest();
    const runner = createAgentRunner((current) => {
      if (current.attempt === 1) return {notAContract: true} as unknown as AgentExecutionResult;
      return validAgentResult(current);
    });
    const repairNumbers: number[] = [];
    const result = await runAgentWithBoundedRetry({
      runAgent: runner,
      request,
      policy: {maxAttempts: 3, maxContractRepairs: 1},
      repairContract: ({repairNumber}) => {
        repairNumbers.push(repairNumber);
      },
    });
    expect(result).toMatchObject({status: "SUCCEEDED", attempts: 2, contractRepairs: 1});
    expect(repairNumbers).toEqual([1]);
  });

  it("FAILURE-005 quarantines repeated schema failures after the repair cap", async () => {
    const request = agentRequest();
    const runner = createAgentRunner(
      () => ({notAContract: true}) as unknown as AgentExecutionResult,
    );
    const result = await runAgentWithBoundedRetry({
      runAgent: runner,
      request,
      policy: {maxAttempts: 3, maxContractRepairs: 1},
      repairContract: () => undefined,
    });
    expect(result).toMatchObject({
      status: "FAILED",
      attempts: 2,
      contractRepairs: 1,
      quarantined: true,
      failure: {class: "invalid-output"},
    });
  });

  it("FAILURE-006 cancels a retry when the frozen input hash becomes stale", async () => {
    let frozenInputHash = "before";
    const result = await runBoundedRetry({
      policy: {maxAttempts: 3},
      operation: (attempt) => {
        if (attempt === 1) {
          frozenInputHash = "after";
          throw new FailureSignal(
            failure({
              code: "PROVIDER_TIMEOUT",
              class: "transient-api",
              retryable: true,
              message: "retry is initially allowed",
            }),
          );
        }
        if (frozenInputHash !== "before") {
          throw new FailureSignal(
            failure({
              code: "STALE_INPUT",
              class: "stale-input",
              retryable: false,
              message: "frozen input changed before retry",
            }),
          );
        }
        return "must-not-run";
      },
    });
    expect(result).toMatchObject({status: "FAILED", attempts: 2, failure: {class: "stale-input"}});
  });

  it("FAILURE-007 preserves the prior verified checkpoint across before/after interruptions", async () => {
    for (const point of ["checkpoint-before", "checkpoint-after"] as const) {
      const fixture = await establishFailedCheckpoint();
      const interrupted = createFoundationGraph({
        runAgent: createDeterministicStubAgent(),
        checkpointer: checkpointWithPutFailure(fixture.checkpointer, point),
        now: () => "2026-08-14T00:00:00.000Z",
      });
      await expect(interrupted.invoke(null, fixture.config)).rejects.toThrow(
        new RegExp(`checkpoint-${point === "checkpoint-before" ? "before" : "after"}`, "u"),
      );

      const resumedCalls: AgentName[] = [];
      const resumed = createFoundationGraph({
        runAgent: createDeterministicStubAgent({onCall: (agent) => resumedCalls.push(agent)}),
        checkpointer: fixture.checkpointer,
        now: () => "2026-08-14T00:00:00.000Z",
      });
      const contentPause = await resumed.invoke(null, fixture.config);
      expect(
        (contentPause as {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value,
      ).toMatchObject({gate: "content-approval"});
      expect(resumedCalls).not.toContain("research-analyst");
      expect(resumedCalls).not.toContain("story-director");
      if (point === "checkpoint-after") expect(resumedCalls).not.toContain("viral-director");
    }
  });

  it("FAILURE-008 rejects a checkpoint whose persisted state no longer matches its control hash", async () => {
    const fixture = await establishFailedCheckpoint();
    const tampered = checkpointWithTamperedState(fixture.checkpointer);
    await expect(
      restoreVerifiedCheckpoint({checkpointer: tampered, config: fixture.config}),
    ).rejects.toMatchObject({code: "CHECKPOINT_CONTROL_HASH_MISMATCH"});
    expect(() =>
      assertCheckpointControlHash({
        state: fixture.state,
        expectedHash: "0".repeat(64),
        requireHash: true,
      }),
    ).toThrow(/CHECKPOINT_CONTROL_HASH_MISMATCH/u);
  });

  it("FAILURE-009 uses only a declared Edge fallback after a primary provider failure", async () => {
    const calls: string[] = [];
    const result = await runDeclaredProviderFallback({
      providers: [
        {
          name: "primary-tts",
          run: () => {
            calls.push("primary-tts");
            throw new FailureSignal(
              failure({
                code: "PRIMARY_TTS_TIMEOUT",
                class: "transient-api",
                retryable: true,
                message: "primary provider unavailable",
              }),
            );
          },
        },
        {
          name: "edge-tts",
          run: () => {
            calls.push("edge-tts");
            return {providerMetadata: "edge", audioRef: "fixture-audio-ref"};
          },
        },
      ],
    });
    expect(result).toMatchObject({status: "SUCCEEDED", provider: "edge-tts"});
    expect(calls).toEqual(["primary-tts", "edge-tts"]);
    expect(result.status === "SUCCEEDED" ? result.value : null).toMatchObject({
      providerMetadata: "edge",
    });
  });

  it("FAILURE-010 stops before timeline/render when both declared TTS providers fail", async () => {
    const calls: string[] = [];
    const result = await runDeclaredProviderFallback({
      providers: [
        {
          name: "primary-tts",
          run: () => {
            calls.push("primary-tts");
            throw new FailureSignal(
              failure({
                code: "PRIMARY_TTS_FAILURE",
                class: "transient-api",
                retryable: true,
                message: "primary provider unavailable",
              }),
            );
          },
        },
        {
          name: "edge-tts",
          run: () => {
            calls.push("edge-tts");
            throw new FailureSignal(
              failure({
                code: "EDGE_TTS_FAILURE",
                class: "tooling",
                retryable: false,
                message: "declared fallback unavailable",
              }),
            );
          },
        },
      ],
    });
    if (result.status === "FAILED") {
      calls.push("halt-before-timeline");
    }
    expect(result).toMatchObject({status: "FAILED", failure: {code: "EDGE_TTS_FAILURE"}});
    expect(calls).toEqual(["primary-tts", "edge-tts", "halt-before-timeline"]);
  });

  it("STAGE-RETRY-001 bounds production-stage retries and never exposes failed partial outputs", async () => {
    const fixture = createProductionFixture();
    const clock = createFakeClock();
    let calls = 0;
    const adapter = async (
      request: Parameters<
        NonNullable<Parameters<typeof runProductionStageWithRetry>[0]["adapter"]>
      >[0],
    ) => {
      calls += 1;
      if (calls < 3) return resultFor(request, "FAILED");
      const outputPath = `content/${request.episodeId}/production/retry-output.json`;
      fs.mkdirSync(path.dirname(path.join(fixture.repoRoot, outputPath)), {recursive: true});
      fs.writeFileSync(path.join(fixture.repoRoot, outputPath), '{"ok":true}\n');
      const output = buildArtifactRef({
        repoRoot: fixture.repoRoot,
        artifactId: `${request.episodeId}:production:retry-output`,
        episodeId: request.episodeId,
        path: outputPath,
        mediaType: "application/json",
        schemaVersion: "retry-output-v1",
        producer: "fixture",
        createdAt: "2026-08-14T00:00:00.000Z",
      });
      return resultFor(request, "SUCCEEDED", [output]);
    };
    const result = await runProductionStageWithRetry({
      state: fixture.state,
      stage: "capture",
      adapter,
      retryPolicy: {maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000},
      retryClock: clock,
    });
    expect(result.result.status).toBe("SUCCEEDED");
    expect(result.results.map((item) => item.status)).toEqual(["FAILED", "FAILED", "SUCCEEDED"]);
    expect(result.state.attempts.capture).toBe(3);
    expect(clock.delays).toEqual([100, 200]);
    expect(result.results.slice(0, 2).every((item) => item.outputArtifacts.length === 0)).toBe(
      true,
    );
  });

  it("CONTRACT-001 fails closed on an invalid stage contract before advancing its checkpoint", () => {
    const fixture = createProductionFixture();
    expect(() =>
      productionStageResultSchema.parse({
        executionId: "wrong",
        stage: "capture",
        status: "SUCCEEDED",
      }),
    ).toThrow();
    expect(fixture.state.productionStages).toEqual({});
  });

  it("FAILURE-011 stops when the event sink fails and leaves no approval side effect", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-event-failure-"));
    temporaryDirectories.push(repoRoot);
    const controlRef = writeArtifactFixture({
      repoRoot,
      artifactId: "episode-event-failure:control:contract",
      episodeId: "episode-event-failure",
      relativePath: "content/episode-event-failure/control/contract.md",
      body: "reference-only\n",
    });
    const state = createInitialProductionState({
      episodeId: "episode-event-failure",
      runId: "run-event-failure",
      artifacts: {contract: controlRef},
    });
    const logPath = path.join(repoRoot, "events.jsonl");
    let calls = 0;
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      checkpointer: createLocalCheckpoint({repoRoot, databasePath: "events.sqlite"}),
      eventSink: (event) => {
        appendExecutionEvent(logPath, event);
        calls += 1;
        if (calls === 1)
          throw new FailureSignal(
            failure({
              code: "EVENT_LOG_WRITE_FAILED",
              class: "checkpoint",
              retryable: false,
              message: "event sink interrupted",
            }),
          );
      },
      now: () => "2026-08-14T00:00:00.000Z",
    });
    await expect(graph.invoke(state, checkpointConfig(state.episodeId))).rejects.toThrow(
      /event sink interrupted/u,
    );
    expect(() => fs.readFileSync(logPath, "utf8")).not.toThrow();
    expect(() => readExecutionEventLog(logPath)).toThrow(/EVENT_LOG_INVALID/u);
  });

  it("FAILURE-012 redacts secrets and never serializes artifact bodies into failure events", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-redaction-"));
    temporaryDirectories.push(directory);
    const logPath = path.join(directory, "events.jsonl");
    const base = {
      schemaVersion: "agent-execution-event-v1" as const,
      eventId: "event-redaction",
      eventType: "execution.started" as const,
      occurredAt: "2026-08-14T00:00:00.000Z",
      episodeId: "episode-event-failure",
      traceId: "run-redaction",
      executionId: "exec-redaction",
      parentExecutionId: null,
      agentName: "orchestrator" as const,
      executionKind: "deterministic-tool" as const,
      attempt: 1,
      revisionRound: 0,
      approvalEpoch: 0,
      model: null,
      prompt: null,
      inputArtifacts: [],
      outputArtifacts: [],
      usage: {
        availability: "not-applicable" as const,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        cost: {amount: "0", currency: "USD", pricingVersion: "fixture"},
      },
      timing: {
        startedAt: "2026-08-14T00:00:00.000Z",
        endedAt: null,
        durationMs: null,
        queueMs: null,
        providerMs: null,
      },
      status: "STARTED" as const,
      decision: null,
      error: null,
      checkpoint: null,
      environment: {
        repositoryCommit: null,
        worktreeState: "unknown" as const,
        inputSetHash: "0".repeat(64),
        runtime: "node-fixture",
        runnerVersion: "fixture",
      },
    };
    appendExecutionEvent(logPath, {
      ...base,
      eventType: "execution.failed",
      eventId: "event-redaction-failed",
      status: "FAILED",
      decision: null,
      timing: {...base.timing, endedAt: base.occurredAt},
      error: {
        code: "AUTH_FAILURE",
        class: "authentication",
        retryable: false,
        message: "Bearer secret_token_123456789 api_key=sk-test_123456789012345",
        providerRequestId: null,
        retryAfterMs: null,
        invalidOutputHash: null,
      },
    });
    const raw = fs.readFileSync(logPath, "utf8");
    expect(raw).toContain("[REDACTED]");
    expect(raw).not.toContain("secret_token_123456789");
    expect(raw).not.toContain("sk-test_123456789012345");
    expect(raw).not.toMatch(
      /"(?:body|content|narration|transcript|captions|claimLedger|sourcePassage)"/u,
    );
  });

  it("FAILURE-013 blocks tampered and stale artifacts, duplicate HumanDecision collision, and revision exhaustion", () => {
    const fixture = createProductionFixture();
    assertArtifactRefsBytes(fixture.repoRoot, [fixture.manifestRef]);
    fs.writeFileSync(path.join(fixture.repoRoot, fixture.manifestRef.path), "tampered\n");
    expect(() => assertArtifactRefsBytes(fixture.repoRoot, [fixture.manifestRef])).toThrow(
      /ARTIFACT_HASH_MISMATCH/u,
    );
    fs.writeFileSync(
      path.join(fixture.repoRoot, fixture.manifestRef.path),
      '{"schemaVersion":"fixture-manifest-v1"}\n',
    );
    const staleIndex = markStaleTransitively(
      selectedArtifactIndexFixture(fixture.state.episodeId, [{ref: fixture.manifestRef}]),
      [fixture.manifestRef.artifactId],
    );
    writeArtifactIndex(
      path.join(fixture.repoRoot, `content/${fixture.state.episodeId}/artifact-index.json`),
      staleIndex,
    );
    expect(() => assertArtifactRefsSelected(fixture.repoRoot, [fixture.manifestRef])).toThrow(
      /ARTIFACT_STALE_OR_NOT_SELECTED/u,
    );

    const decision = humanDecisionSchema.parse({
      decisionId: "failure-decision-1",
      gate: "content-approval",
      decision: "approve",
      reviewer: "failure-reviewer",
      timestamp: "2026-08-14T00:10:00.000Z",
      reason: "deterministic approval for replay test",
      artifactRefs: [fixture.manifestRef],
      approvalEpoch: 0,
    });
    const index = ensureArtifactIndexForRefs({
      repoRoot: fixture.repoRoot,
      episodeId: fixture.state.episodeId,
      refs: [fixture.manifestRef],
    });
    const persisted = persistHumanDecision({
      repoRoot: fixture.repoRoot,
      decision,
      artifactIndex: index,
    });
    expect(
      persistHumanDecision({
        repoRoot: fixture.repoRoot,
        decision,
        artifactIndex: persisted.artifactIndex,
      }).decisionRef,
    ).toEqual(persisted.decisionRef);
    expect(
      assertHumanDecisionReplay({
        repoRoot: fixture.repoRoot,
        decision,
        decisionRef: persisted.decisionRef,
      }),
    ).toEqual(decision);
    expect(() =>
      assertHumanDecisionReplay({
        repoRoot: fixture.repoRoot,
        decision: {...decision, reason: "conflicting replay"},
        decisionRef: persisted.decisionRef,
      }),
    ).toThrow(/HUMAN_DECISION_REPLAY_CONFLICT/u);
    expect(() =>
      assertHumanDecisionArtifactRefsCurrent({
        repoRoot: fixture.repoRoot,
        refs: [fixture.manifestRef],
      }),
    ).not.toThrow();

    let ledger = createRevisionLedger({episodeId: fixture.state.episodeId});
    const limits = {maxOralRounds: 3, maxCreativeRounds: 1, maxDeliveryRounds: 3};
    const attempt = {
      revisionId: "failure-revision-1",
      executionId: "failure-revision-exec-1",
      ownerAgent: "story-director" as const,
      issueIds: [],
      before: [],
      candidate: [],
      evaluations: [],
      disposition: "rejected" as const,
      regressionIds: [],
      oscillationIds: [],
      createdAt: "2026-08-14T00:11:00.000Z",
    };
    ledger = recordRevisionAttempt(ledger, {
      ...attempt,
      budgetKind: "creative",
      budgetLimits: limits,
    });
    expect(checkRevisionBudget(ledger, "creative", limits)).toMatchObject({
      allowed: false,
      reason: "budget-exhausted",
    });
    expect(() =>
      recordRevisionAttempt(ledger, {
        ...attempt,
        revisionId: "failure-revision-2",
        executionId: "failure-revision-exec-2",
        budgetKind: "creative",
        budgetLimits: limits,
      }),
    ).toThrow(/REVISION_BUDGET_EXHAUSTED/u);
    expect(stableJson(fixture.state.approvals)).toBe(stableJson({}));
  });
});
