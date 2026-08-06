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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("M1.1 SQLite checkpoint resume", () => {
  it("resumes after a failed node without rerunning already-valid agents", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-resume-"));
    temporaryDirectories.push(repoRoot);
    const artifactPath = "content/episode-resume/control/agent-contract.md";
    fs.mkdirSync(path.join(repoRoot, path.dirname(artifactPath)), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, artifactPath), "reference only\n");
    const controlRef = buildArtifactRef({
      repoRoot,
      artifactId: "episode-resume:control:agent-contract",
      episodeId: "episode-resume",
      path: artifactPath,
      mediaType: "text/markdown",
      schemaVersion: "engineering-contracts-v1",
      producer: "test",
    });
    const state = createInitialProductionState({
      episodeId: "episode-resume",
      runId: "run-resume-1",
      artifacts: {"control:agent-contract": controlRef},
    });
    const config = checkpointConfig(state.episodeId);
    const firstCalls: AgentName[] = [];
    const firstGraph = createFoundationGraph({
      runAgent: createDeterministicStubAgent({
        onCall: (agent) => firstCalls.push(agent),
        failOnceAt: "viral-director",
      }),
      checkpointer: createLocalCheckpoint({repoRoot}),
    });

    await expect(firstGraph.invoke(state, config)).rejects.toThrow(/stub failure/u);
    expect(firstCalls).toEqual(["research-analyst", "story-director", "viral-director"]);
    const failedSnapshot = await firstGraph.getState(config);
    expect(failedSnapshot.values.completedAgents).toEqual(["research-analyst", "story-director"]);

    const resumedCalls: AgentName[] = [];
    const resumedGraph = createFoundationGraph({
      runAgent: createDeterministicStubAgent({onCall: (agent) => resumedCalls.push(agent)}),
      checkpointer: createLocalCheckpoint({repoRoot}),
    });
    const contentPause = await resumedGraph.invoke(null, config);
    expect(
      (contentPause as typeof contentPause & {__interrupt__?: {value: unknown}[]})
        .__interrupt__?.[0]?.value,
    ).toMatchObject({gate: "content-approval"});
    const finalPause = await resumedGraph.invoke(resumeCheckpoint({stub: "resume"}), config);
    expect(
      (finalPause as typeof finalPause & {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]
        ?.value,
    ).toMatchObject({gate: "final-approval"});
    const resumed = await resumedGraph.invoke(resumeCheckpoint({stub: "resume"}), config);

    expect(resumedCalls[0]).toBe("viral-director");
    expect(resumedCalls).not.toContain("research-analyst");
    expect(resumedCalls).not.toContain("story-director");
    expect(resumed.completedAgents).toEqual(agentNames);
    expect(resumed.phase).toBe("halted");
    expect(
      fs
        .readFileSync(path.join(repoRoot, ".orchestration/checkpoints.sqlite"))
        .includes(Buffer.from("reference only")),
    ).toBe(false);
  });
});
