import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentNames,
  assertReferenceOnlyState,
  buildArtifactRef,
  checkpointConfig,
  createDeterministicStubAgent,
  createExecutionEventSink,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  importLegacyEpisode001,
  resumeCheckpoint,
  type AgentName,
  type ArtifactRef,
  type ProductionState,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const runGolden = async (fixture: {
  repoRoot: string;
  state: ProductionState;
  expectedRefs: Record<string, ArtifactRef>;
  forbiddenBody: string;
}) => {
  const config = checkpointConfig(fixture.state.episodeId);
  const calls: AgentName[] = [];
  const makeGraph = () =>
    createFoundationGraph({
      runAgent: createDeterministicStubAgent({onCall: (agent) => calls.push(agent)}),
      checkpointer: createLocalCheckpoint({repoRoot: fixture.repoRoot}),
      eventSink: createExecutionEventSink({
        repoRoot: fixture.repoRoot,
        episodeId: fixture.state.episodeId,
      }),
      now: () => "2026-08-05T00:00:00.000Z",
    });

  const first = await makeGraph().invoke(fixture.state, config);
  expect(
    (first as typeof first & {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value,
  ).toMatchObject({gate: "content-approval"});
  expect(calls).toEqual(agentNames.slice(0, -1));

  const secondGraph = makeGraph();
  const second = await secondGraph.invoke(resumeCheckpoint({stub: "resume"}), config);
  expect(
    (second as typeof second & {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value,
  ).toMatchObject({gate: "final-approval"});
  expect(calls).toEqual(agentNames);

  const callsBeforeFinalResume = [...calls];
  const final = await makeGraph().invoke(resumeCheckpoint({stub: "resume"}), config);
  expect(calls).toEqual(callsBeforeFinalResume);
  expect(final.phase).toBe("halted");
  expect(final.completedAgents).toEqual(agentNames);
  expect(final.artifacts).toEqual(fixture.expectedRefs);
  expect(assertReferenceOnlyState(final)).toEqual(final);
  expect(JSON.stringify(final)).not.toContain(fixture.forbiddenBody);

  const logPath = path.join(
    fixture.repoRoot,
    `content/${fixture.state.episodeId}/observability/executions.jsonl`,
  );
  const events = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as {eventType: string; executionId: string});
  expect(events).toHaveLength(agentNames.length * 2);
  expect(new Set(events.map((event) => `${event.executionId}:${event.eventType}`)).size).toBe(
    events.length,
  );
};

describe("M1 Golden Skeleton", () => {
  it("pauses and resumes a synthetic reference-only episode at both stub gates", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-golden-"));
    temporaryDirectories.push(repoRoot);
    const artifactPath = "content/episode-golden/control/contract.md";
    fs.mkdirSync(path.join(repoRoot, path.dirname(artifactPath)), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, artifactPath), "synthetic fixture body\n");
    const controlRef = buildArtifactRef({
      repoRoot,
      artifactId: "episode-golden:control:contract",
      episodeId: "episode-golden",
      path: artifactPath,
      mediaType: "text/markdown",
      schemaVersion: "test-v1",
      producer: "test",
      createdAt: "2026-08-05T00:00:00.000Z",
    });
    const state = createInitialProductionState({
      episodeId: "episode-golden",
      runId: "run-golden",
      artifacts: {contract: controlRef},
    });
    await runGolden({
      repoRoot,
      state,
      expectedRefs: state.artifacts,
      forbiddenBody: "synthetic fixture body",
    });
  });

  it("runs the same persistent skeleton from the read-only Episode 001 import", async () => {
    const sourceRoot = path.resolve(import.meta.dirname, "../..");
    const imported = importLegacyEpisode001({
      repoRoot: sourceRoot,
      occurredAt: "2026-08-05T00:00:00.000Z",
    });
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-legacy-golden-"));
    temporaryDirectories.push(runtimeRoot);
    const state = createInitialProductionState({
      episodeId: imported.episodeId,
      runId: "run-legacy-golden",
      artifacts: imported.artifacts,
    });
    await runGolden({
      repoRoot: runtimeRoot,
      state,
      expectedRefs: state.artifacts,
      forbiddenBody: "Poke 为什么出现在联系人列表里",
    });
  });
});
