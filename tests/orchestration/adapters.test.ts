import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  buildArtifactRef,
  createContentAgentAdapter,
  createHostedPolishAdapter,
  createManualFileAdapter,
  type HostedPolishAdapterOptions,
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

  it("requires explicit hosted opt-in, HTTPS, credentials, and oral-rewriter scope", async () => {
    const hostedOutput = {
      artifactId: "episode-test:story:hosted-script",
      path: "content/episode-test/story/hosted-script.md",
      schemaVersion: "final-script-v1",
    };
    const chatSpy = vi.fn(async () => ({
      outputs: [{...hostedOutput, content: "hosted result\n"}],
    }));
    const chat = chatSpy as unknown as NonNullable<HostedPolishAdapterOptions["chat"]>;
    const initial = setup();
    expect(() =>
      createHostedPolishAdapter({
        repoRoot: initial.repoRoot,
        enabled: false,
        endpoint: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "test-model",
        chat,
      }),
    ).toThrow(/explicit opt-in/u);
    expect(chatSpy).not.toHaveBeenCalled();

    const runner = createHostedPolishAdapter({
      repoRoot: initial.repoRoot,
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "test-model",
      chat,
    });
    await expect(runner(request(initial.promptRef, [hostedOutput]))).resolves.toMatchObject({
      status: "SUCCEEDED",
      outputArtifacts: [{path: hostedOutput.path, producer: "hosted-polish:oral-rewriter"}],
    });
    expect(fs.readFileSync(path.join(initial.repoRoot, hostedOutput.path), "utf8")).toBe(
      "hosted result\n",
    );
    expect(chatSpy).toHaveBeenCalledOnce();
    await expect(
      runner({...request(initial.promptRef), executionId: "exec-2", agentName: "story-director"}),
    ).rejects.toThrow(/only for oral-rewriter/u);
  });
});
