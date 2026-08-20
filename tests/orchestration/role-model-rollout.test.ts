import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  agentModelPolicyFile,
  agentNames,
  buildArtifactRef,
  createContentAgentAdapter,
  createRoleModelRolloutAdapter,
  mergeRoleModelPolicyLayers,
  parseAgentModelPolicyFile,
  resolveEffectiveRoleModelPolicy,
  resolveRoleModelPolicy,
  roleModelPolicySchema,
  selectPrimaryRoute,
  shadowArtifactId,
  shadowOutputPath,
  type AgentName,
  type AgentModelPolicyFile,
  type RoleModelExecutionRecord,
  type RoleModelPolicy,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const setup = (episodeId = "episode-test") => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-rollout-"));
  temporaryDirectories.push(repoRoot);
  const promptPath = `content/${episodeId}/prompts/oral.md`;
  const inputPath = `content/${episodeId}/story/script-draft.md`;
  const outputPath = `content/${episodeId}/story/final-script.md`;
  fs.mkdirSync(path.join(repoRoot, path.dirname(promptPath)), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, path.dirname(inputPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, promptPath), "prompt\n");
  fs.writeFileSync(path.join(repoRoot, inputPath), "draft\n");
  fs.writeFileSync(path.join(repoRoot, outputPath), "canonical manual\n");
  const createdAt = "2026-08-19T00:00:00.000Z";
  const promptRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:prompt:oral`,
    episodeId,
    path: promptPath,
    mediaType: "text/markdown",
    schemaVersion: "prompt-v1",
    producer: "test",
    createdAt,
  });
  const inputRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:story:script-draft`,
    episodeId,
    path: inputPath,
    mediaType: "text/markdown",
    schemaVersion: "script-draft-v1",
    producer: "test",
    createdAt,
  });
  return {repoRoot, episodeId, promptRef, inputRef, outputPath};
};

const outputDeclaration = (episodeId = "episode-test") => ({
  artifactId: `${episodeId}:story:final-script`,
  path: `content/${episodeId}/story/final-script.md`,
  schemaVersion: "final-script-v1",
});

const request = (
  promptRef: ReturnType<typeof buildArtifactRef>,
  inputRef: ReturnType<typeof buildArtifactRef>,
  input: {
    episodeId?: string;
    agentName?: AgentName;
    expectedOutputs?: Array<{artifactId: string; path: string; schemaVersion: string}>;
  } = {},
) => ({
  contractVersion: "agent-execution-v1" as const,
  executionId: "exec-rollout-1",
  episodeId: input.episodeId ?? "episode-test",
  agentName: input.agentName ?? "oral-rewriter",
  attempt: 1,
  revisionRound: 0,
  promptRef,
  inputArtifacts: [inputRef],
  expectedOutputs: input.expectedOutputs ?? [outputDeclaration(input.episodeId)],
  upstreamGateRefs: [],
  revisionBudgetRemaining: 3,
});

const withModes = (
  file: AgentModelPolicyFile,
  modes: Partial<Record<AgentName, RoleModelPolicy["mode"]>>,
) => {
  const next = structuredClone(file);
  for (const [name, mode] of Object.entries(modes) as Array<[AgentName, RoleModelPolicy["mode"]]>) {
    next.roles[name].mode = mode;
  }
  return parseAgentModelPolicyFile(next);
};

describe("Role → ModelPolicy precedence", () => {
  it("applies global default → role → episode → run in that order", () => {
    const defaults = roleModelPolicySchema.parse({
      ...agentModelPolicyFile.defaults,
      model: "default-model",
      temperature: 0.1,
    });
    const role = roleModelPolicySchema.parse({
      ...agentModelPolicyFile.roles["script-writer"],
      model: "role-model",
      temperature: 0.2,
    });
    const mergedRole = mergeRoleModelPolicyLayers(defaults, role);
    expect(mergedRole.model).toBe("role-model");
    expect(mergedRole.temperature).toBe(0.2);

    const withEpisode = mergeRoleModelPolicyLayers(defaults, role, {
      model: "gpt-5.6",
      provider: "openai",
    });
    expect(withEpisode.model).toBe("gpt-5.6");
    expect(withEpisode.provider).toBe("openai");
    expect(withEpisode.temperature).toBe(0.2);

    const withRun = mergeRoleModelPolicyLayers(
      defaults,
      role,
      {model: "gpt-5.6"},
      {model: "run-model"},
    );
    expect(withRun.model).toBe("run-model");

    const file = parseAgentModelPolicyFile({
      ...agentModelPolicyFile,
      defaults,
      roles: {...agentModelPolicyFile.roles, "script-writer": role},
    });
    expect(
      resolveEffectiveRoleModelPolicy({
        agentName: "script-writer",
        episodeId: "episode-test",
        config: file,
      }).model,
    ).toBe("role-model");
    expect(
      resolveEffectiveRoleModelPolicy({
        agentName: "script-writer",
        episodeId: "episode-004",
        config: file,
      }).model,
    ).toBe("gpt-5.6");
    expect(
      resolveEffectiveRoleModelPolicy({
        agentName: "script-writer",
        episodeId: "episode-004",
        runOverride: {model: "run-model"},
        config: file,
      }).model,
    ).toBe("run-model");
  });

  it("keeps committed episode-004 and episode-005 script-writer overrides isolated", () => {
    const episode004 = resolveEffectiveRoleModelPolicy({
      agentName: "script-writer",
      episodeId: "episode-004",
    });
    const episode005 = resolveEffectiveRoleModelPolicy({
      agentName: "script-writer",
      episodeId: "episode-005",
    });
    const other = resolveEffectiveRoleModelPolicy({
      agentName: "script-writer",
      episodeId: "episode-test",
    });
    expect(episode004).toMatchObject({provider: "openai", model: "gpt-5.6", mode: "manual"});
    expect(episode005).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      mode: "manual",
    });
    expect(other.model).toBe(resolveRoleModelPolicy("script-writer").model);
    expect(other.model).not.toBe("gpt-5.6");
    expect(other.model).not.toBe("deepseek-chat");
    expect(episode004.appliedLayers.episode).toBe(true);
    expect(other.appliedLayers.episode).toBe(false);
  });

  it("keeps manual as the repository default", () => {
    expect(agentModelPolicyFile.defaults.mode).toBe("manual");
    expect(agentModelPolicyFile.defaults.fallbackMode).toBe("none");
    for (const name of agentNames) {
      expect(resolveRoleModelPolicy(name).mode).toBe("manual");
      expect(
        resolveEffectiveRoleModelPolicy({agentName: name, episodeId: "episode-test"}).mode,
      ).toBe("manual");
    }
    expect(agentModelPolicyFile.rollout).toEqual({
      hostedLlm: ["oral-rewriter"],
      shadow: [
        "story-director",
        "viral-director",
        "script-writer",
        "oral-judge",
        "audience-critic",
        "fact-guardian",
        "retention-critic",
      ],
      manualOnly: ["research-analyst", "visual-director", "delivery-critic"],
    });
  });

  it("fails closed when a role policy is missing", () => {
    expect(() =>
      parseAgentModelPolicyFile({
        schemaVersion: "agent-model-policy-v2",
        policyVersion: "role-model-rollout-v1",
        defaults: agentModelPolicyFile.defaults,
        rollout: agentModelPolicyFile.rollout,
        roles: {},
      }),
    ).toThrow(/hosted-agent missing policy: research-analyst/u);
  });

  it("rejects hosted-llm and shadow for roles outside the phase-1 allowlist", () => {
    expect(() =>
      resolveEffectiveRoleModelPolicy({
        agentName: "story-director",
        episodeId: "episode-test",
        runOverride: {mode: "hosted-llm"},
      }),
    ).toThrow(/hosted-llm is not enabled for story-director/u);
    expect(() =>
      resolveEffectiveRoleModelPolicy({
        agentName: "oral-rewriter",
        episodeId: "episode-test",
        runOverride: {mode: "shadow"},
      }),
    ).toThrow(/shadow is not enabled for oral-rewriter/u);
    expect(() =>
      resolveEffectiveRoleModelPolicy({
        agentName: "visual-director",
        episodeId: "episode-test",
        runOverride: {mode: "hosted-llm"},
      }),
    ).toThrow(/visual-director must remain manual/u);
  });
});

describe("Role → ModelPolicy rollout adapter", () => {
  it("leaves createContentAgentAdapter on the manual-file default", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const runner = createContentAgentAdapter({
      repoRoot,
      createdAt: () => "2026-08-19T00:00:00.000Z",
    });
    const result = await runner(request(promptRef, inputRef));
    expect(result.status).toBe("SUCCEEDED");
    expect(result.outputArtifacts[0]?.producer).toBe("manual-file:oral-rewriter");
  });

  it("never lets shadow replace the canonical output", async () => {
    const {repoRoot, promptRef, inputRef, outputPath} = setup();
    const chat = vi.fn(async () => ({
      outputs: [
        {
          artifactId: shadowArtifactId(
            "episode-test",
            "script-writer",
            outputDeclaration().artifactId,
          ),
          path: shadowOutputPath("episode-test", "script-writer", outputPath),
          schemaVersion: "final-script-v1",
          content: "shadow candidate\n",
        },
      ],
    }));
    const records: RoleModelExecutionRecord[] = [];
    const runner = createRoleModelRolloutAdapter({
      repoRoot,
      policies: withModes(agentModelPolicyFile, {"script-writer": "shadow"}),
      apiKey: "super-secret-test-key",
      chat,
      onCall: (record) => records.push(record),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });

    const result = await runner(request(promptRef, inputRef, {agentName: "script-writer"}));
    expect(result.status).toBe("SUCCEEDED");
    expect(result.decision.code).toBe("SHADOW_CANONICAL_UNCHANGED");
    expect(result.outputArtifacts[0]).toMatchObject({
      path: outputPath,
      producer: "manual-file:script-writer",
    });
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("canonical manual\n");
    expect(
      fs.readFileSync(
        path.join(repoRoot, shadowOutputPath("episode-test", "script-writer", outputPath)),
        "utf8",
      ),
    ).toBe("shadow candidate\n");
    const comparison = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          "content/episode-test/rollout/comparisons/script-writer-exec-rollout-1.json",
        ),
        "utf8",
      ),
    ) as {shadowIsSourceOfTruth: boolean; criticGateResult: {status: string}};
    expect(comparison.shadowIsSourceOfTruth).toBe(false);
    expect(comparison.criticGateResult.status).toBe("not-evaluated");
    expect(JSON.stringify(records[0])).not.toContain("super-secret-test-key");
    expect(records[0]).toMatchObject({
      agentName: "script-writer",
      mode: "shadow",
      provider: "openai-compatible",
      model: "gpt-5-mini",
      reasoningProfile: "none",
      policyVersion: "role-model-rollout-v1",
      executionId: "exec-rollout-1",
      status: "SUCCEEDED",
    });
  });

  it("lets hosted output become canonical only in hosted-llm mode", async () => {
    const {repoRoot, promptRef, inputRef, outputPath} = setup();
    const hosted = createRoleModelRolloutAdapter({
      repoRoot,
      policies: withModes(agentModelPolicyFile, {"oral-rewriter": "hosted-llm"}),
      apiKey: "test-key",
      chat: async () => ({
        outputs: [{...outputDeclaration(), content: "hosted canonical\n"}],
      }),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    const hostedResult = await hosted(request(promptRef, inputRef));
    expect(hostedResult.status).toBe("SUCCEEDED");
    expect(hostedResult.outputArtifacts[0]?.producer).toBe("hosted-agent:oral-rewriter");
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("hosted canonical\n");

    const blocked = createRoleModelRolloutAdapter({
      repoRoot,
      runOverrides: {"story-director": {mode: "hosted-llm"}},
      apiKey: "test-key",
      chat: async () => ({outputs: [{...outputDeclaration(), content: "should not write\n"}]}),
      sleep: async () => undefined,
    });
    await expect(
      blocked(request(promptRef, inputRef, {agentName: "story-director"})),
    ).rejects.toThrow(/hosted-llm is not enabled for story-director/u);
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("hosted canonical\n");
  });

  it("fails closed on a missing API key unless fallbackMode is explicit manual", async () => {
    const {repoRoot, promptRef, inputRef, outputPath} = setup();
    const chat = vi.fn(async () => ({outputs: [{...outputDeclaration(), content: "nope\n"}]}));
    const none = createRoleModelRolloutAdapter({
      repoRoot,
      policies: withModes(agentModelPolicyFile, {"oral-rewriter": "hosted-llm"}),
      env: {},
      chat,
      sleep: async () => undefined,
    });
    await expect(none(request(promptRef, inputRef))).rejects.toThrow(
      /hosted-agent missing API key: OPENAI_API_KEY/u,
    );
    expect(chat).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("canonical manual\n");

    const file = structuredClone(agentModelPolicyFile);
    file.roles["oral-rewriter"].mode = "hosted-llm";
    file.roles["oral-rewriter"].fallbackMode = "manual";
    const fallback = createRoleModelRolloutAdapter({
      repoRoot,
      policies: parseAgentModelPolicyFile(file),
      env: {},
      chat,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    const result = await fallback(request(promptRef, inputRef));
    expect(result.decision.code).toBe("HOSTED_AGENT_FALLBACK_MANUAL");
    expect(result.outputArtifacts[0]?.producer).toBe("manual-file:oral-rewriter");
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("canonical manual\n");
  });

  it("blocks malformed hosted-llm output and does not silently switch models", async () => {
    const {repoRoot, promptRef, inputRef, outputPath} = setup();
    const chat = vi.fn(async () => ({broken: true}));
    const runner = createRoleModelRolloutAdapter({
      repoRoot,
      policies: withModes(agentModelPolicyFile, {"oral-rewriter": "hosted-llm"}),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).rejects.toThrow(/malformed JSON/u);
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("canonical manual\n");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("keeps a malformed shadow candidate off the canonical path", async () => {
    const {repoRoot, promptRef, inputRef, outputPath} = setup();
    const runner = createRoleModelRolloutAdapter({
      repoRoot,
      policies: withModes(agentModelPolicyFile, {"script-writer": "shadow"}),
      apiKey: "test-key",
      chat: async () => ({broken: true}),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    const result = await runner(request(promptRef, inputRef, {agentName: "script-writer"}));
    expect(result.status).toBe("SUCCEEDED");
    expect(result.outputArtifacts[0]?.producer).toBe("manual-file:script-writer");
    expect(fs.readFileSync(path.join(repoRoot, outputPath), "utf8")).toBe("canonical manual\n");
    const comparison = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          "content/episode-test/rollout/comparisons/script-writer-exec-rollout-1.json",
        ),
        "utf8",
      ),
    ) as {schemaValidity: string; shadowOutputRef: null};
    expect(comparison.schemaValidity).toBe("invalid");
    expect(comparison.shadowOutputRef).toBeNull();
  });

  it("records provider/model metadata without the API key", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const records: RoleModelExecutionRecord[] = [];
    const runner = createRoleModelRolloutAdapter({
      repoRoot,
      policies: withModes(agentModelPolicyFile, {"oral-rewriter": "hosted-llm"}),
      apiKey: "super-secret-test-key",
      chat: async () => ({
        value: {outputs: [{...outputDeclaration(), content: "meta\n"}]},
        usage: {inputTokens: 9, outputTokens: 4, totalTokens: 13},
      }),
      onCall: (record) => records.push(record),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    await runner(request(promptRef, inputRef));
    expect(records[0]).toMatchObject({
      agentName: "oral-rewriter",
      mode: "hosted-llm",
      provider: "openai-compatible",
      model: "gpt-5-mini",
      reasoningProfile: "none",
      policyVersion: "role-model-rollout-v1",
      executionId: "exec-rollout-1",
      attempt: 1,
      usage: {inputTokens: 9, outputTokens: 4, totalTokens: 13},
    });
    expect(records[0]?.promptRef.path).toBe(promptRef.path);
    expect(records[0]?.inputArtifacts[0]?.path).toBe(inputRef.path);
    expect(records[0]?.outputArtifacts[0]?.path).toBe(outputDeclaration().path);
    expect(JSON.stringify(records[0])).not.toContain("super-secret-test-key");
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          "content/episode-test/rollout/executions/oral-rewriter-exec-rollout-1.json",
        ),
        "utf8",
      ),
    ) as RoleModelExecutionRecord;
    expect(saved.executionId).toBe("exec-rollout-1");
    expect(JSON.stringify(saved)).not.toContain("super-secret-test-key");
  });

  it("does not change deterministic routing from shadow or hosted metadata", () => {
    const route = selectPrimaryRoute(
      [
        {
          id: "issue-hook",
          category: "attention.hook",
          severity: "medium",
          status: "open",
          affectedArtifact: {
            artifactId: "episode-test:story:final-script",
            path: "content/episode-test/story/final-script.md",
            sha256: "a".repeat(64),
            locator: {kind: "whole-artifact", value: "final-script"},
          },
        },
        {
          id: "issue-research",
          category: "research.evidence-gap",
          severity: "medium",
          status: "open",
          affectedArtifact: {
            artifactId: "episode-test:story:final-script",
            path: "content/episode-test/story/final-script.md",
            sha256: "a".repeat(64),
            locator: {kind: "whole-artifact", value: "final-script"},
          },
        },
      ],
      {remaining: 3},
    );
    expect(route).toEqual({
      ownerAgent: "research-analyst",
      routeTarget: "research-analyst",
      restartAt: "research-analyst",
      reasonCode: "research.evidence-gap",
      issueIds: ["issue-research"],
    });
  });

  it("uses episode overrides only for the requested episode during hosted execution", async () => {
    const first = setup("episode-004");
    const second = setup("episode-005");
    const seen: string[] = [];
    const chat = vi.fn(async (call: {model: string}) => {
      seen.push(call.model);
      return {
        outputs: [
          {
            ...outputDeclaration(call.model === "gpt-5.6" ? "episode-004" : "episode-005"),
            content: `${call.model}\n`,
          },
        ],
      };
    });
    const file = withModes(agentModelPolicyFile, {"oral-rewriter": "hosted-llm"});
    const policies = parseAgentModelPolicyFile({
      ...file,
      episodeOverrides: {
        "episode-004": {
          "oral-rewriter": {model: "gpt-5.6", provider: "openai"},
        },
        "episode-005": {
          "oral-rewriter": {
            model: "deepseek-chat",
            provider: "deepseek",
            endpoint: "https://api.deepseek.com/v1/chat/completions",
            allowedOrigins: ["https://api.deepseek.com"],
            apiKeyEnv: "DEEPSEEK_API_KEY",
          },
        },
      },
    });

    await createRoleModelRolloutAdapter({
      repoRoot: first.repoRoot,
      policies,
      apiKey: "test-key",
      chat,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    })(request(first.promptRef, first.inputRef, {episodeId: "episode-004"}));
    await createRoleModelRolloutAdapter({
      repoRoot: second.repoRoot,
      policies,
      apiKey: "test-key",
      chat,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    })(request(second.promptRef, second.inputRef, {episodeId: "episode-005"}));

    expect(seen).toEqual(["gpt-5.6", "deepseek-chat"]);
    expect(fs.readFileSync(path.join(first.repoRoot, first.outputPath), "utf8")).toBe("gpt-5.6\n");
    expect(fs.readFileSync(path.join(second.repoRoot, second.outputPath), "utf8")).toBe(
      "deepseek-chat\n",
    );
  });
});
