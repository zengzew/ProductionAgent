import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {emptyCheckpoint} from "@langchain/langgraph";
import {afterEach, describe, expect, it} from "vitest";
import {
  EpisodeLockManager,
  FineGrainedCacheStore,
  appendConcurrencyEvent,
  artifactIndexControlHash,
  artifactRefIsIndexed,
  buildArtifactRef,
  checkpointConfig,
  concurrencyEventPath,
  createConcurrencyEvent,
  createDeterministicStubAgent,
  createFoundationGraph,
  createPostgresCheckpoint,
  createInitialProductionState,
  createLocalCheckpoint,
  emptyArtifactIndex,
  episodeLockPath,
  humanDecisionSchema,
  readConcurrencyEvents,
  registerCandidate,
  resolveConcurrencyConfig,
  assertHumanDecisionForEpisode,
  withControlledOrchestrationRun,
} from "../../src/orchestration";
import {writeArtifactIndexCas} from "../../src/orchestration/artifact-registry";
import {stableJson} from "../../src/orchestration/stable-json";

const temporaryDirectories: string[] = [];

const makeRoot = (prefix: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
};

const identity = (episodeId: string, runId: string) => ({
  episodeId,
  runId,
  threadId: episodeId,
  traceId: `${episodeId}:run:${runId}`,
});

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const config = (input: {
  maxConcurrentRuns?: number;
  globalAdmission?: "wait" | "reject";
  lockAdmission?: "wait" | "reject";
  staleAfterMs?: number;
  heartbeatIntervalMs?: number;
}) =>
  resolveConcurrencyConfig({
    config: {
      global: {
        maxConcurrentRuns: input.maxConcurrentRuns ?? 2,
        admission: input.globalAdmission ?? "reject",
        pollIntervalMs: 5,
        waitTimeoutMs: 1000,
      },
      episodeLock: {
        admission: input.lockAdmission ?? "reject",
        staleAfterMs: input.staleAfterMs ?? 100,
        heartbeatIntervalMs: input.heartbeatIntervalMs ?? 10,
      },
    },
  });

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

describe("WP-M4-06 isolation, locks, CAS, and controlled concurrency", () => {
  it("runs different episodes in parallel while a same-episode second run is rejected", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-parallel-");
    const events: ReturnType<typeof createConcurrencyEvent>[] = [];
    const eventSink = (event: ReturnType<typeof createConcurrencyEvent>): void => {
      events.push(event);
    };
    let active = 0;
    let maximumActive = 0;
    const run = async (): Promise<void> => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await wait(50);
      active -= 1;
    };

    const first = withControlledOrchestrationRun({
      repoRoot,
      identity: identity("episode-a", "run-a"),
      config: config({maxConcurrentRuns: 2}),
      eventSink,
      run,
    });
    const second = withControlledOrchestrationRun({
      repoRoot,
      identity: identity("episode-b", "run-b"),
      config: config({maxConcurrentRuns: 2}),
      eventSink,
      run,
    });
    await Promise.all([first, second]);
    expect(maximumActive).toBe(2);

    const blocker = new Promise<void>((resolve) => {
      void withControlledOrchestrationRun({
        repoRoot,
        identity: identity("episode-same", "run-first"),
        config: config({maxConcurrentRuns: 2}),
        eventSink,
        run: async () => {
          await wait(40);
          resolve();
        },
      });
    });
    await wait(10);
    await expect(
      withControlledOrchestrationRun({
        repoRoot,
        identity: identity("episode-same", "run-second"),
        config: config({maxConcurrentRuns: 2}),
        eventSink,
        run: async () => undefined,
      }),
    ).rejects.toThrow("EPISODE_LOCK_HELD");
    await blocker;
    expect(events.some((event) => event.eventType === "lock.contention")).toBe(true);
  });

  it("releases an episode lock on failure and makes repeated release safe", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-release-");
    const manager = new EpisodeLockManager({repoRoot, config: config({})});
    const handle = await manager.acquire(identity("episode-release", "run-release"));
    await handle.release();
    await handle.release();
    expect(fs.existsSync(episodeLockPath(repoRoot, "episode-release"))).toBe(false);

    await expect(
      withControlledOrchestrationRun({
        repoRoot,
        identity: identity("episode-failure", "run-failure"),
        config: config({}),
        run: async () => {
          throw new Error("expected failure");
        },
      }),
    ).rejects.toThrow("expected failure");
    await expect(
      withControlledOrchestrationRun({
        repoRoot,
        identity: identity("episode-failure", "run-retry"),
        config: config({}),
        run: async () => undefined,
      }),
    ).resolves.toBeUndefined();
  });

  it("recovers a dead stale lock but never reclaims a live owner", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-stale-");
    const staleAt = new Date(Date.now() - 1000).toISOString();
    const stalePath = episodeLockPath(repoRoot, "episode-stale");
    fs.mkdirSync(path.dirname(stalePath), {recursive: true});
    fs.writeFileSync(
      stalePath,
      `${stableJson({
        schemaVersion: "orchestration-lease-v1",
        ...identity("episode-stale", "run-dead"),
        acquiredAt: staleAt,
        heartbeatAt: staleAt,
        ownerPid: 999999,
        token: "a".repeat(32),
      })}\n`,
    );
    const events: ReturnType<typeof createConcurrencyEvent>[] = [];
    const manager = new EpisodeLockManager({
      repoRoot,
      config: config({staleAfterMs: 10, heartbeatIntervalMs: 1}),
      eventSink: (event) => events.push(event),
    });
    const recovered = await manager.acquire(identity("episode-stale", "run-new"));
    expect(events.some((event) => event.eventType === "lock.stale-recovery")).toBe(true);
    await recovered.release();

    const activePath = episodeLockPath(repoRoot, "episode-active");
    const activeAt = new Date(Date.now() - 1000).toISOString();
    fs.mkdirSync(path.dirname(activePath), {recursive: true});
    fs.writeFileSync(
      activePath,
      `${stableJson({
        schemaVersion: "orchestration-lease-v1",
        ...identity("episode-active", "run-live"),
        acquiredAt: activeAt,
        heartbeatAt: activeAt,
        ownerPid: process.pid,
        token: "b".repeat(32),
      })}\n`,
    );
    await expect(manager.acquire(identity("episode-active", "run-new"))).rejects.toThrow(
      "EPISODE_LOCK_HELD",
    );
    expect(fs.existsSync(activePath)).toBe(true);
    fs.rmSync(activePath, {force: true});
  });

  it("enforces the global cap independently from the episode lock", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-cap-");
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withControlledOrchestrationRun({
      repoRoot,
      identity: identity("episode-cap-a", "run-a"),
      config: config({maxConcurrentRuns: 1}),
      run: () => held,
    });
    await wait(10);
    await expect(
      withControlledOrchestrationRun({
        repoRoot,
        identity: identity("episode-cap-b", "run-b"),
        config: config({maxConcurrentRuns: 1}),
        run: async () => undefined,
      }),
    ).rejects.toThrow("CONCURRENCY_LIMIT_REACHED");
    release?.();
    await first;
  });

  it("rejects same-revision checkpoint commits with a deterministic CAS conflict", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-checkpoint-");
    const databasePath = path.join(repoRoot, ".orchestration", "checkpoints.sqlite");
    const stateA = createInitialProductionState({episodeId: "episode-cas", runId: "run-a"});
    const stateB = {...stateA, runId: "run-b"};
    const makeCheckpoint = (state: typeof stateA) => {
      const checkpoint = emptyCheckpoint();
      checkpoint.channel_values = state;
      checkpoint.channel_versions = Object.fromEntries(
        Object.keys(state).map((key, index) => [key, index + 1]),
      );
      return checkpoint;
    };
    const saverA = createLocalCheckpoint({repoRoot, databasePath});
    const saverB = createLocalCheckpoint({repoRoot, databasePath});
    const results = await Promise.allSettled([
      saverA.put(
        checkpointConfig({episodeId: "episode-cas", runId: "run-a"}),
        makeCheckpoint(stateA),
        {
          source: "input",
          step: -1,
          parents: {},
        },
        {},
      ),
      saverB.put(
        checkpointConfig({episodeId: "episode-cas", runId: "run-b"}),
        makeCheckpoint(stateB),
        {
          source: "input",
          step: -1,
          parents: {},
        },
        {},
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({
      reason: expect.objectContaining({
        message: expect.stringMatching(/CHECKPOINT_CAS_CONFLICT|OPTIMISTIC_CONCURRENCY/),
      }),
    });
    const latest = await saverA.getTuple(checkpointConfig("episode-cas"));
    expect(["run-a", "run-b"]).toContain(latest?.checkpoint.channel_values.runId);
  });

  it("holds the episode lock across graph checkpoint writes and protects resume state", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-graph-");
    const episodeId = "episode-graph-lock";
    const controlPath = `content/${episodeId}/control/agent-contract.md`;
    fs.mkdirSync(path.dirname(path.join(repoRoot, controlPath)), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, controlPath), "reference-only contract\n");
    const controlRef = buildArtifactRef({
      repoRoot,
      artifactId: `${episodeId}:control:agent-contract`,
      episodeId,
      path: controlPath,
      mediaType: "text/markdown",
      schemaVersion: "test-v1",
      producer: "test",
    });
    const initial = createInitialProductionState({
      episodeId,
      runId: "run-first",
      artifacts: {control: controlRef},
    });
    let agentStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      agentStarted = resolve;
    });
    const stub = createDeterministicStubAgent();
    const graph = createFoundationGraph({
      repoRoot,
      checkpointer: createLocalCheckpoint({repoRoot}),
      runAgent: async (request) => {
        agentStarted?.();
        await wait(40);
        return stub(request);
      },
    });
    const firstConfig = checkpointConfig({episodeId, runId: "run-first"});
    const first = graph.invoke(initial, firstConfig);
    await started;
    const second = graph.invoke(
      {...initial, runId: "run-second"},
      checkpointConfig({episodeId, runId: "run-second"}),
    );
    await expect(second).rejects.toThrow("EPISODE_LOCK_HELD");
    await first;
    const tuple = await graph.getState(firstConfig);
    expect(tuple.values.runId).toBe("run-first");
  });

  it("keeps artifact, cache, event, and checkpoint identities episode-scoped", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-isolation-");
    for (const episodeId of ["episode-one", "episode-two"]) {
      const artifactPath = `content/${episodeId}/story/final-script.md`;
      fs.mkdirSync(path.dirname(path.join(repoRoot, artifactPath)), {recursive: true});
      fs.writeFileSync(path.join(repoRoot, artifactPath), "same logical artifact\n");
    }
    const refOne = buildArtifactRef({
      repoRoot,
      artifactId: "episode-one:story:final-script",
      episodeId: "episode-one",
      path: "content/episode-one/story/final-script.md",
      mediaType: "text/markdown",
      schemaVersion: "test-v1",
      producer: "test",
    });
    const refTwo = buildArtifactRef({
      repoRoot,
      artifactId: "episode-two:story:final-script",
      episodeId: "episode-two",
      path: "content/episode-two/story/final-script.md",
      mediaType: "text/markdown",
      schemaVersion: "test-v1",
      producer: "test",
    });
    expect(refOne.artifactId).not.toBe(refTwo.artifactId);
    expect(refOne.path).not.toBe(refTwo.path);
    expect(() => registerCandidate(emptyArtifactIndex("episode-one"), refTwo, "run", [])).toThrow();

    const cacheRoot = path.join(repoRoot, ".cache");
    const key = "a".repeat(64);
    const cacheOne = new FineGrainedCacheStore({root: cacheRoot, episodeId: "episode-one"});
    const cacheTwo = new FineGrainedCacheStore({root: cacheRoot, episodeId: "episode-two"});
    cacheOne.put({
      kind: "tts-segment",
      cacheKey: key,
      stage: "tts",
      logicalItem: "segment-1",
      mediaType: "audio/wav",
      bytes: Buffer.from("bytes"),
      metadata: {episodeId: "episode-one"},
    });
    expect(
      cacheTwo.lookup({kind: "tts-segment", cacheKey: key, stage: "tts", logicalItem: "segment-1"})
        .hit,
    ).toBe(false);
    expect(() =>
      cacheOne.put({
        kind: "tts-segment",
        cacheKey: "b".repeat(64),
        stage: "tts",
        logicalItem: "segment-2",
        mediaType: "audio/wav",
        bytes: Buffer.from("bytes"),
        metadata: {episodeId: "episode-two"},
      }),
    ).toThrow("CACHE_EPISODE_MISMATCH");

    const event = createConcurrencyEvent({
      eventType: "lock.acquired",
      identity: identity("episode-one", "run-one"),
      status: "succeeded",
      reason: "test",
    });
    const eventFile = concurrencyEventPath(repoRoot, "episode-one");
    appendConcurrencyEvent(eventFile, event);
    expect(readConcurrencyEvents(eventFile)[0]?.episodeId).toBe("episode-one");
    expect(fs.existsSync(concurrencyEventPath(repoRoot, "episode-two"))).toBe(false);
    expect(checkpointConfig("episode-one").configurable.thread_id).not.toBe(
      checkpointConfig("episode-two").configurable.thread_id,
    );
    expect(artifactRefIsIndexed(repoRoot, refOne)).toBe(false);
  });

  it("rejects a HumanDecision from another episode and reports a CAS version", async () => {
    const repoRoot = makeRoot("production-agent-concurrency-human-");
    const artifactPath = "content/episode-human-a/story/final-script.md";
    fs.mkdirSync(path.dirname(path.join(repoRoot, artifactPath)), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, artifactPath), "decision input\n");
    const ref = buildArtifactRef({
      repoRoot,
      artifactId: "episode-human-a:story:final-script",
      episodeId: "episode-human-a",
      path: artifactPath,
      mediaType: "text/markdown",
      schemaVersion: "test-v1",
      producer: "test",
    });
    const decision = humanDecisionSchema.parse({
      decisionId: "decision-1",
      gate: "content-approval",
      decision: "approve",
      reviewer: "reviewer",
      timestamp: "2026-08-14T00:00:00.000Z",
      reason: "approved",
      artifactRefs: [ref],
      approvalEpoch: 0,
      authorizations: [],
      edits: [],
    });
    expect(() => assertHumanDecisionForEpisode({decision, episodeId: "episode-human-b"})).toThrow(
      "HUMAN_DECISION_EPISODE_MISMATCH",
    );

    const indexPath = path.join(repoRoot, "content/episode-human-a/artifact-index.json");
    const index = emptyArtifactIndex("episode-human-a");
    const version = writeArtifactIndexCas({
      filePath: indexPath,
      index,
      expectedVersion: null,
      casRoot: repoRoot,
    });
    expect(version).toBe(artifactIndexControlHash(index));
    expect(() =>
      writeArtifactIndexCas({filePath: indexPath, index, expectedVersion: null, casRoot: repoRoot}),
    ).toThrow("ARTIFACT_INDEX_CAS_CONFLICT");
  });

  it("uses the same explicit identity contract for SQLite and Postgres factories", () => {
    const repoRoot = makeRoot("production-agent-concurrency-backends-");
    const sqliteConfig = checkpointConfig({episodeId: "episode-backend", runId: "run-backend"});
    expect(sqliteConfig.configurable).toMatchObject({
      thread_id: "episode-backend",
      episode_id: "episode-backend",
      run_id: "run-backend",
    });
    const postgres = createPostgresCheckpoint({
      connectionString: "postgresql://user:password@localhost:5432/database",
      schema: "production_checkpoints",
      casRoot: repoRoot,
    });
    expect(postgres).toBeDefined();
  });
});
