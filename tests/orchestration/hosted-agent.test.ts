import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  agentModelPolicyFile,
  agentNames,
  buildArtifactRef,
  createContentAgentAdapter,
  createFakeHostedChatProvider,
  createHostedAgentAdapter,
  createOpenAiCompatibleChatProvider,
  hashHostedResponseContent,
  HOSTED_AGENT_RESPONSE_CONTRACT,
  hostedLlmEligibleAgentNames,
  hostedLlmIneligibleAgentNames,
  HostedResponseContractError,
  loadAgentModelPolicyFile,
  parseAgentModelPolicyFile,
  resolveRoleModelPolicy,
  roleModelPolicySchema,
  stableJson,
  type AgentName,
  type HostedAgentCallRecord,
  type RoleModelPolicy,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const setup = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-hosted-"));
  temporaryDirectories.push(repoRoot);
  const promptPath = "content/episode-test/prompts/oral.md";
  const inputPath = "content/episode-test/story/script-draft.md";
  fs.mkdirSync(path.join(repoRoot, path.dirname(promptPath)), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, path.dirname(inputPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, promptPath), "prompt\n");
  fs.writeFileSync(path.join(repoRoot, inputPath), "draft\n");
  const createdAt = "2026-08-06T00:00:00.000Z";
  const promptRef = buildArtifactRef({
    repoRoot,
    artifactId: "episode-test:prompt:oral",
    episodeId: "episode-test",
    path: promptPath,
    mediaType: "text/markdown",
    schemaVersion: "prompt-v1",
    producer: "test",
    createdAt,
  });
  const inputRef = buildArtifactRef({
    repoRoot,
    artifactId: "episode-test:story:script-draft",
    episodeId: "episode-test",
    path: inputPath,
    mediaType: "text/markdown",
    schemaVersion: "script-draft-v1",
    producer: "test",
    createdAt,
  });
  return {repoRoot, promptRef, inputRef, inputPath};
};

const hostedPolicy = (overrides: Partial<RoleModelPolicy> = {}): RoleModelPolicy =>
  roleModelPolicySchema.parse({
    mode: "hosted-llm",
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "test-model",
    temperature: 0.4,
    apiKeyEnv: "OPENAI_API_KEY",
    allowedOrigins: ["https://api.openai.com"],
    timeoutMs: 30_000,
    maxRetries: 2,
    ...overrides,
  });

const outputDeclaration = {
  artifactId: "episode-test:story:final-script",
  path: "content/episode-test/story/final-script.md",
  schemaVersion: "final-script-v1",
};

const request = (
  promptRef: ReturnType<typeof buildArtifactRef>,
  inputRef: ReturnType<typeof buildArtifactRef>,
  expectedOutputs = [outputDeclaration],
  agentName: AgentName = "oral-rewriter",
) => ({
  contractVersion: "agent-execution-v1" as const,
  executionId: "exec-hosted-1",
  episodeId: "episode-test",
  agentName,
  attempt: 1,
  revisionRound: 0,
  promptRef,
  inputArtifacts: [inputRef],
  expectedOutputs,
  upstreamGateRefs: [],
  revisionBudgetRemaining: 3,
});

const cloneDefaultPolicies = () => structuredClone(agentModelPolicyFile);

describe("RoleModelPolicy", () => {
  it("resolves different models and settings per role", () => {
    const file = cloneDefaultPolicies();
    file.roles["story-director"].model = "story-model";
    file.roles["oral-judge"].model = "judge-model";
    file.roles["fact-guardian"].temperature = 0;
    const config = parseAgentModelPolicyFile(file);

    expect(resolveRoleModelPolicy("story-director", config).model).toBe("story-model");
    expect(resolveRoleModelPolicy("oral-judge", config).model).toBe("judge-model");
    expect(resolveRoleModelPolicy("fact-guardian", config).temperature).toBe(0);
    expect(resolveRoleModelPolicy("story-director", config)).not.toEqual(
      resolveRoleModelPolicy("oral-judge", config),
    );
  });

  it("resolves the same role deterministically", () => {
    const first = resolveRoleModelPolicy("script-writer");
    const second = resolveRoleModelPolicy("script-writer");
    expect(first).toEqual(second);
    expect(stableJson(first)).toBe(stableJson(second));
    expect(resolveRoleModelPolicy("script-writer", agentModelPolicyFile)).toEqual(first);
  });

  it("fails closed when a role policy is missing", () => {
    expect(() =>
      parseAgentModelPolicyFile({
        schemaVersion: "agent-model-policy-v1",
        roles: {},
      }),
    ).toThrow(/hosted-agent missing policy: research-analyst/u);
    expect(() =>
      loadAgentModelPolicyFile({
        file: {
          schemaVersion: "agent-model-policy-v1",
          roles: {
            "story-director": hostedPolicy({mode: "manual"}),
          },
        },
      }),
    ).toThrow(/hosted-agent missing policy/u);
  });

  it("keeps manual as the repository default for every role", () => {
    for (const name of agentNames) {
      expect(resolveRoleModelPolicy(name).mode).toBe("manual");
    }
    expect(hostedLlmEligibleAgentNames).toEqual([
      "story-director",
      "viral-director",
      "script-writer",
      "oral-rewriter",
      "oral-judge",
      "audience-critic",
      "fact-guardian",
      "retention-critic",
    ]);
    expect(hostedLlmIneligibleAgentNames).toEqual([
      "research-analyst",
      "visual-director",
      "delivery-critic",
    ]);
  });

  it("rejects hosted-llm for research, visual, and delivery roles", () => {
    const file = cloneDefaultPolicies();
    file.roles["visual-director"].mode = "hosted-llm";
    expect(() => parseAgentModelPolicyFile(file)).toThrow(/visual-director must remain manual/u);
  });
});

describe("HostedAgentBackend", () => {
  it("writes declared outputs and records provider metadata without the API key", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const records: HostedAgentCallRecord[] = [];
    const chat = vi.fn(async () => ({
      value: {outputs: [{...outputDeclaration, content: "hosted result\n"}]},
      usage: {inputTokens: 11, outputTokens: 7, totalTokens: 18},
    }));
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({provider: "openai-compatible", model: "role-test-model"}),
      apiKey: "super-secret-test-key",
      chat,
      onCall: (record) => records.push(record),
      createdAt: () => "2026-08-06T00:00:00.000Z",
      sleep: async () => undefined,
    });

    const result = await runner(request(promptRef, inputRef));
    expect(result.status).toBe("SUCCEEDED");
    expect(result.outputArtifacts[0]).toMatchObject({
      path: outputDeclaration.path,
      producer: "hosted-agent:oral-rewriter",
    });
    expect(fs.readFileSync(path.join(repoRoot, outputDeclaration.path), "utf8")).toBe(
      "hosted result\n",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      agentName: "oral-rewriter",
      provider: "openai-compatible",
      model: "role-test-model",
      executionId: "exec-hosted-1",
      attempt: 1,
      status: "SUCCEEDED",
      retryCount: 0,
      usage: {inputTokens: 11, outputTokens: 7, totalTokens: 18},
    });
    expect(records[0]?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(records[0])).not.toContain("super-secret-test-key");
    expect(JSON.stringify(records[0])).not.toMatch(/apiKey/iu);
  });

  it("fails closed when the API key env is missing", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => ({outputs: []}));
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      env: {},
      chat,
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).rejects.toThrow(
      /hosted-agent missing API key: OPENAI_API_KEY/u,
    );
    expect(chat).not.toHaveBeenCalled();
  });

  it("blocks non-HTTPS and unapproved origins before any chat call", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => ({outputs: []}));
    const httpRunner = createHostedAgentAdapter({
      repoRoot,
      policy: {
        ...hostedPolicy(),
        endpoint: "http://localhost:11434/v1/chat/completions",
      },
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(httpRunner(request(promptRef, inputRef))).rejects.toThrow(/HTTPS/u);

    const unapproved = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({
        endpoint: "https://evil.example/v1/chat/completions",
      }),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(unapproved(request(promptRef, inputRef))).rejects.toThrow(
      /endpoint is not approved: https:\/\/evil\.example/u,
    );
    expect(chat).not.toHaveBeenCalled();
  });

  it("appends the machine response contract to the user message only", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    let systemContent = "";
    let userContent = "";
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat: async (call) => {
        systemContent = call.messages.find((message) => message.role === "system")?.content ?? "";
        userContent = call.messages.find((message) => message.role === "user")?.content ?? "";
        return {outputs: [{...outputDeclaration, content: "hosted result\n"}]};
      },
      createdAt: () => "2026-08-06T00:00:00.000Z",
      sleep: async () => undefined,
    });
    await runner(request(promptRef, inputRef));
    expect(systemContent).toBe("prompt\n");
    expect(systemContent).not.toContain("MACHINE RESPONSE CONTRACT");
    expect(userContent.endsWith(HOSTED_AGENT_RESPONSE_CONTRACT)).toBe(true);
    expect(userContent).toContain("ONLY return one JSON object.");
    expect(userContent).toContain('{"outputs":[...]}');
    expect(userContent).toContain(outputDeclaration.artifactId);
    expect(userContent).toContain(outputDeclaration.path);
  });

  it("blocks malformed JSON, missing outputs, and undeclared outputs", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const malformed = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat: async () => ({broken: true}),
      sleep: async () => undefined,
    });
    await expect(malformed(request(promptRef, inputRef))).rejects.toThrow(/malformed JSON/u);

    const missing = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat: async () => ({outputs: []}),
      sleep: async () => undefined,
    });
    await expect(missing(request(promptRef, inputRef))).rejects.toThrow(/incomplete output set/u);

    const undeclared = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat: async () => ({
        outputs: [
          {
            artifactId: "episode-test:story:secret",
            path: "content/episode-test/story/secret.md",
            schemaVersion: "v1",
            content: "nope\n",
          },
        ],
      }),
      sleep: async () => undefined,
    });
    await expect(undeclared(request(promptRef, inputRef))).rejects.toThrow(
      /undeclared output: episode-test:story:secret/u,
    );
    expect(fs.existsSync(path.join(repoRoot, "content/episode-test/story/secret.md"))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, outputDeclaration.path))).toBe(false);
  });

  it("refuses to overwrite an input artifact even if the model asks", async () => {
    const {repoRoot, promptRef, inputRef, inputPath} = setup();
    const chat = vi.fn(async () => ({
      outputs: [
        {
          artifactId: outputDeclaration.artifactId,
          path: inputPath,
          schemaVersion: outputDeclaration.schemaVersion,
          content: "mutated draft\n",
        },
      ],
    }));
    const declaredOverwrite = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(
      declaredOverwrite(
        request(promptRef, inputRef, [
          {
            artifactId: outputDeclaration.artifactId,
            path: inputPath,
            schemaVersion: outputDeclaration.schemaVersion,
          },
        ]),
      ),
    ).rejects.toThrow(/cannot overwrite input artifact/u);
    expect(chat).not.toHaveBeenCalled();

    const modelOverwrite = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(modelOverwrite(request(promptRef, inputRef))).rejects.toThrow(
      /cannot overwrite input artifact|undeclared output/u,
    );
    expect(fs.readFileSync(path.join(repoRoot, inputPath), "utf8")).toBe("draft\n");
  });

  it("blocks cross-episode output paths before and after the model call", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => ({
      outputs: [
        {
          artifactId: outputDeclaration.artifactId,
          path: "content/episode-other/story/final-script.md",
          schemaVersion: outputDeclaration.schemaVersion,
          content: "leaked\n",
        },
      ],
    }));
    const declared = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(
      declared(
        request(promptRef, inputRef, [
          {
            artifactId: outputDeclaration.artifactId,
            path: "content/episode-other/story/final-script.md",
            schemaVersion: outputDeclaration.schemaVersion,
          },
        ]),
      ),
    ).rejects.toThrow(/cross-episode path blocked/u);
    expect(chat).not.toHaveBeenCalled();

    const fromModel = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(fromModel(request(promptRef, inputRef))).rejects.toThrow(
      /undeclared output|cross-episode path blocked/u,
    );
    expect(fs.existsSync(path.join(repoRoot, "content/episode-other/story/final-script.md"))).toBe(
      false,
    );
  });

  it("bounds provider retries to the policy maxRetries", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => {
      throw new Error("transient provider failure");
    });
    const records: HostedAgentCallRecord[] = [];
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({maxRetries: 2}),
      apiKey: "test-key",
      chat,
      onCall: (record) => records.push(record),
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).rejects.toThrow(
      /transient provider failure/u,
    );
    expect(chat).toHaveBeenCalledTimes(3);
    expect(records[0]).toMatchObject({status: "FAILED", retryCount: 2});

    let attempts = 0;
    const recovering = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({maxRetries: 2}),
      apiKey: "test-key",
      chat: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("transient provider failure");
        return {outputs: [{...outputDeclaration, content: "recovered\n"}]};
      },
      sleep: async () => undefined,
    });
    await expect(recovering(request(promptRef, inputRef))).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
    expect(attempts).toBe(3);
  });

  it("does not retry malformed JSON or missing credentials", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => {
      throw new Error("hosted-agent returned malformed JSON");
    });
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({maxRetries: 3}),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).rejects.toThrow(/malformed JSON/u);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("keeps research, visual, and delivery roles off the hosted path", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => ({outputs: []}));
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(
      runner(request(promptRef, inputRef, [outputDeclaration], "visual-director")),
    ).rejects.toThrow(/does not support visual-director/u);
    expect(chat).not.toHaveBeenCalled();
  });

  it("fails closed when the resolved policy is still manual", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const chat = vi.fn(async () => ({outputs: []}));
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({mode: "manual"}),
      apiKey: "test-key",
      chat,
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).rejects.toThrow(
      /requires hosted-llm policy/u,
    );
    expect(chat).not.toHaveBeenCalled();
  });

  it("leaves createContentAgentAdapter on the manual-file default", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    fs.mkdirSync(path.join(repoRoot, "content/episode-test/story"), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, outputDeclaration.path), "manual result\n");
    const runner = createContentAgentAdapter({
      repoRoot,
      createdAt: () => "2026-08-06T00:00:00.000Z",
    });
    const result = await runner(request(promptRef, inputRef));
    expect(result.status).toBe("SUCCEEDED");
    expect(result.outputArtifacts[0]?.producer).toBe("manual-file:oral-rewriter");
  });

  it("exposes hosted-agent as an explicit opt-in mode only", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const runner = createContentAgentAdapter({
      mode: "hosted-agent",
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      chat: async () => ({outputs: [{...outputDeclaration, content: "via factory\n"}]}),
      createdAt: () => "2026-08-06T00:00:00.000Z",
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).resolves.toMatchObject({
      status: "SUCCEEDED",
      outputArtifacts: [{producer: "hosted-agent:oral-rewriter"}],
    });
  });

  it("uses a fake HostedChatProvider without touching the network", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const provider = createFakeHostedChatProvider({
      handler: async () => ({
        value: {outputs: [{...outputDeclaration, content: "from provider\n"}]},
        usage: {inputTokens: 3, outputTokens: 2, totalTokens: 5},
      }),
    });
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      provider,
      createdAt: () => "2026-08-06T00:00:00.000Z",
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
    expect(fs.readFileSync(path.join(repoRoot, outputDeclaration.path), "utf8")).toBe(
      "from provider\n",
    );
  });

  it("parses OpenAI-compatible usage through the provider abstraction", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe("https://api.openai.com/v1/chat/completions");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-key");
      return new Response(
        JSON.stringify({
          choices: [{message: {content: JSON.stringify({ok: true})}}],
          usage: {prompt_tokens: 4, completion_tokens: 6, total_tokens: 10},
        }),
        {status: 200, headers: {"content-type": "application/json"}},
      );
    };
    const provider = createOpenAiCompatibleChatProvider({fetchImpl});
    const result = await provider.chatJson({
      provider: "openai-compatible",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "test-model",
      temperature: 0,
      timeoutMs: 1000,
      maxRetries: 0,
      apiKey: "test-key",
      messages: [{role: "user", content: "ping"}],
    });
    expect(result).toEqual({
      value: {ok: true},
      usage: {inputTokens: 4, outputTokens: 6, totalTokens: 10},
    });
  });

  it("accepts a legal outputs envelope from a fake provider", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const provider = createFakeHostedChatProvider({
      handler: async () => ({
        outputs: [{...outputDeclaration, content: "from envelope\n"}],
      }),
    });
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "test-key",
      provider,
      createdAt: () => "2026-08-06T00:00:00.000Z",
      sleep: async () => undefined,
    });
    await expect(runner(request(promptRef, inputRef))).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
    expect(fs.readFileSync(path.join(repoRoot, outputDeclaration.path), "utf8")).toBe(
      "from envelope\n",
    );
  });

  it("identifies a markdown-only fake-provider response", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const markdown = "# Script Draft\n\n状态：`draft-ready`\n";
    const provider = createFakeHostedChatProvider({
      handler: async () => markdown,
    });
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy({maxRetries: 2}),
      apiKey: "super-secret-test-key",
      provider,
      sleep: async () => undefined,
    });
    const error = await runner(request(promptRef, inputRef)).catch((caught) => caught);
    expect(error).toBeInstanceOf(HostedResponseContractError);
    expect(error).toMatchObject({
      layer: "hosted-agent",
      markdownOnly: true,
    });
    expect(error.message).toMatch(/markdown-only response/u);
    expect(error.message).toContain(`sha256=${hashHostedResponseContent(markdown)}`);
    expect(error.message).toContain("preview=");
    expect(error.message).not.toContain("super-secret-test-key");
    expect(error.message).not.toMatch(/apiKey/iu);
  });

  it("records diagnosable malformed JSON from a fake provider", async () => {
    const {repoRoot, promptRef, inputRef} = setup();
    const broken = {broken: true, note: "not an outputs envelope"};
    const provider = createFakeHostedChatProvider({
      handler: async () => broken,
    });
    const runner = createHostedAgentAdapter({
      repoRoot,
      policy: hostedPolicy(),
      apiKey: "super-secret-test-key",
      provider,
      sleep: async () => undefined,
    });
    const error = await runner(request(promptRef, inputRef)).catch((caught) => caught);
    expect(error).toBeInstanceOf(HostedResponseContractError);
    expect(error.markdownOnly).toBe(false);
    expect(error.message).toMatch(/hosted-agent returned malformed JSON/u);
    expect(error.message).toMatch(/status=n\/a/u);
    expect(error.message).toContain(`sha256=${hashHostedResponseContent(JSON.stringify(broken))}`);
    expect(error.message).toContain("preview=");
    expect(error.message).toContain("not an outputs envelope");
    expect(error.message).not.toContain("super-secret-test-key");
  });

  it("records HTTP status, hash, and redacted preview for hosted-chat parse failures", async () => {
    const secret = "super-secret-test-key";
    const markdown = `# MiniMax dumped markdown\n\nBearer ${secret}\n`;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{message: {content: markdown}}],
        }),
        {status: 200, headers: {"content-type": "application/json"}},
      );
    const provider = createOpenAiCompatibleChatProvider({fetchImpl});
    const error = await provider
      .chatJson({
        provider: "openai-compatible",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "test-model",
        temperature: 0,
        timeoutMs: 1000,
        maxRetries: 0,
        apiKey: secret,
        messages: [{role: "user", content: "ping"}],
      })
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(HostedResponseContractError);
    expect(error).toMatchObject({
      layer: "hosted-chat",
      markdownOnly: true,
      httpStatus: 200,
      contentHash: hashHostedResponseContent(markdown),
    });
    expect(error.message).toMatch(/hosted-chat returned markdown-only response/u);
    expect(error.message).toContain("status=200");
    expect(error.message).toContain("preview=");
    expect(error.message).not.toContain(secret);
    expect(error.preview).toContain("[redacted]");

    const malformedFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{message: {content: `{not-json ${secret}`}}],
        }),
        {status: 218, headers: {"content-type": "application/json"}},
      );
    const malformed = await createOpenAiCompatibleChatProvider({fetchImpl: malformedFetch})
      .chatJson({
        provider: "openai-compatible",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "test-model",
        temperature: 0,
        timeoutMs: 1000,
        maxRetries: 0,
        apiKey: secret,
        messages: [{role: "user", content: "ping"}],
      })
      .catch((caught) => caught);
    expect(malformed).toBeInstanceOf(HostedResponseContractError);
    expect(malformed.markdownOnly).toBe(false);
    expect(malformed.httpStatus).toBe(218);
    expect(malformed.message).toMatch(/hosted-chat returned malformed JSON/u);
    expect(malformed.message).not.toContain(secret);
  });
});
