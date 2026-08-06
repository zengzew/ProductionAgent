import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentNames,
  buildArtifactRef,
  checkpointConfig,
  createDeterministicStubAgent,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  resumeCheckpoint,
  type AgentName,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

const createFixture = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-graph-"));
  temporaryDirectories.push(repoRoot);
  const artifactPath = "content/episode-graph/control/agent-contract.md";
  fs.mkdirSync(path.join(repoRoot, path.dirname(artifactPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, artifactPath), "fixture contract\n");
  const controlRef = buildArtifactRef({
    repoRoot,
    artifactId: "episode-graph:control:agent-contract",
    episodeId: "episode-graph",
    path: artifactPath,
    mediaType: "text/markdown",
    schemaVersion: "engineering-contracts-v1",
    producer: "test",
  });
  return {repoRoot, controlRef};
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("M1.1 minimal LangGraph skeleton", () => {
  it("executes all deterministic stub roles in the existing contract order", async () => {
    const {repoRoot, controlRef} = createFixture();
    const calls: AgentName[] = [];
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent({onCall: (agent) => calls.push(agent)}),
      checkpointer: createLocalCheckpoint({repoRoot}),
    });
    const state = createInitialProductionState({
      episodeId: "episode-graph",
      runId: "run-graph-1",
      artifacts: {"control:agent-contract": controlRef},
    });

    const config = checkpointConfig(state.episodeId);
    const contentPause = await graph.invoke(state, config);
    expect(
      (contentPause as typeof contentPause & {__interrupt__?: {value: unknown}[]})
        .__interrupt__?.[0]?.value,
    ).toMatchObject({gate: "content-approval"});
    const finalPause = await graph.invoke(resumeCheckpoint({stub: "resume"}), config);
    expect(
      (finalPause as typeof finalPause & {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]
        ?.value,
    ).toMatchObject({gate: "final-approval"});
    const result = await graph.invoke(resumeCheckpoint({stub: "resume"}), config);

    expect(calls).toEqual(agentNames);
    expect(result.completedAgents).toEqual(agentNames);
    expect(result.phase).toBe("halted");
    expect(result.haltReason).toMatch(/formal approval semantics remain M3 scope/u);
    expect(JSON.stringify(result)).not.toContain("fixture contract");
  });
});
