import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  codexCapabilityGates,
  createCodexCapabilityAdapter,
  createContentAgentAdapter,
  createManualFileAdapter,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const setup = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-adapter-"));
  temporaryDirectories.push(repoRoot);
  const promptPath = "content/episode-test/prompts/oral.md";
  fs.mkdirSync(path.join(repoRoot, path.dirname(promptPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, promptPath), "prompt\n");
  const promptRef = buildArtifactRef({
    repoRoot,
    artifactId: "episode-test:prompt:oral",
    episodeId: "episode-test",
    path: promptPath,
    mediaType: "text/markdown",
    schemaVersion: "prompt-v1",
    producer: "test",
    createdAt: "2026-08-06T00:00:00.000Z",
  });
  return {repoRoot, promptRef};
};

const request = (
  promptRef: ReturnType<typeof buildArtifactRef>,
  expectedOutputs = [] as Array<{
    artifactId: string;
    path: string;
    schemaVersion: string;
  }>,
) => ({
  contractVersion: "agent-execution-v1" as const,
  executionId: "exec-adapter-1",
  episodeId: "episode-test",
  agentName: "oral-rewriter" as const,
  attempt: 1,
  revisionRound: 0,
  promptRef,
  inputArtifacts: [promptRef],
  expectedOutputs,
  upstreamGateRefs: [],
  revisionBudgetRemaining: 3,
});

describe("M2.1 content-agent adapters", () => {
  it("uses manual-file by default and binds pre-existing output bytes", async () => {
    const {repoRoot, promptRef} = setup();
    const outputPath = "content/episode-test/story/final-script.md";
    fs.mkdirSync(path.join(repoRoot, path.dirname(outputPath)), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, outputPath), "manual result\n");
    const runner = createContentAgentAdapter({
      repoRoot,
      createdAt: () => "2026-08-06T00:00:00.000Z",
    });

    const result = await runner(
      request(promptRef, [
        {
          artifactId: "episode-test:story:final-script",
          path: outputPath,
          schemaVersion: "final-script-v1",
        },
      ]),
    );

    expect(result.status).toBe("SUCCEEDED");
    expect(result.outputArtifacts[0]).toMatchObject({
      path: outputPath,
      producer: "manual-file:oral-rewriter",
      sizeBytes: 14,
    });
  });

  it("preserves pending manual behavior as a retryable, network-free result", async () => {
    const {repoRoot, promptRef} = setup();
    const result = await createManualFileAdapter({repoRoot})(
      request(promptRef, [
        {
          artifactId: "episode-test:story:missing",
          path: "content/episode-test/story/missing.md",
          schemaVersion: "v1",
        },
      ]),
    );
    expect(result).toMatchObject({
      status: "FAILED",
      failure: {code: "MANUAL_OUTPUT_MISSING", retryable: true},
    });
  });

  it("binds capability-gated role output as a Codex 5.6 artifact", async () => {
    const {repoRoot, promptRef} = setup();
    const outputPath = "content/episode-test/research/facts.json";
    fs.mkdirSync(path.join(repoRoot, path.dirname(outputPath)), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, outputPath), "{}\n");
    const result = await createCodexCapabilityAdapter({repoRoot})({
      ...request(promptRef, [
        {
          artifactId: "episode-test:research:facts",
          path: outputPath,
          schemaVersion: "facts-v1",
        },
      ]),
      agentName: "research-analyst",
    });
    expect(codexCapabilityGates.executor).toEqual({
      kind: "codex",
      model: "gpt-5.6",
      interaction: "in-session-file-handoff",
      apiKeyRequired: false,
    });
    expect(result.outputArtifacts[0]?.producer).toBe("codex:gpt-5.6:research-analyst");
    await expect(createCodexCapabilityAdapter({repoRoot})(request(promptRef))).rejects.toThrow(
      /not a Codex capability-gated role/u,
    );
  });
});
