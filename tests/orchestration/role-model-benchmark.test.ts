import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentModelPolicyFile,
  buildArtifactRef,
  buildScriptWriterBenchmarkRequest,
  createContentAgentAdapter,
  createFakeHostedChatProvider,
  createOpenAiCompatibleChatProvider,
  candidateCachePath,
  evaluatePromotionEligibility,
  hashBenchmarkIdentity,
  hashBenchmarkInput,
  hashRepairContext,
  EMPTY_REPAIR_CONTEXT_HASH,
  HOSTED_AGENT_RESPONSE_CONTRACT,
  hashHostedResponseContent,
  loadRoleModelBenchmarkConfig,
  parseRoleModelBenchmarkConfig,
  relocateBenchmarkOutputPath,
  resolveBenchmarkCandidates,
  resolveRoleModelPolicy,
  runRoleModelBenchmark,
  type AgentExecutionRequest,
  type BenchmarkProgressEvent,
  type RoleModelBenchmarkConfig,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const factsJson = `[
  {
    "id": "claim-alpha-001",
    "claim": "Product opens a browser after a task is delegated.",
    "metricName": "",
    "value": "",
    "period": "2024",
    "eventDate": "2024-03-12",
    "sourceIds": ["src-1"],
    "confidence": "high",
    "reportingType": "independently-verified",
    "allowedInNarration": true,
    "notes": ""
  },
  {
    "id": "claim-alpha-002",
    "claim": "Founders wanted the agent to finish engineering work.",
    "metricName": "",
    "value": "",
    "period": "2024",
    "eventDate": "2024-03-12",
    "sourceIds": ["src-1"],
    "confidence": "high",
    "reportingType": "founder-reported",
    "allowedInNarration": true,
    "notes": ""
  }
]`;

const draftFor = (claims: string[]): string => `# Script Draft

状态：\`draft-ready\`

## seg-001

- Section: \`hook\`
- Time range: \`0:00–0:04\`
- Target seconds: \`4\`
- Claim IDs: ${claims.map((claim) => `\`${claim}\``).join(", ")}
- Source identity: official demo
- On-screen text: demo
- Scene: hook
- Visual intent: browser opens
- Pace switch: none
- Fact boundary: no success rate

### Narration

任务交出去，它自己打开浏览器。
`;

const writeFile = (repoRoot: string, repositoryPath: string, content: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, content);
};

const candidatePolicy = (model: string) => ({
  provider: "openai-compatible",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model,
  reasoning: {profile: "none"},
  temperature: 0.4,
  apiKeyEnv: "OPENAI_API_KEY",
  allowedOrigins: ["https://api.openai.com"],
  timeoutMs: 30_000,
  maxRetries: 0,
});

const benchmarkConfig = (): RoleModelBenchmarkConfig =>
  parseRoleModelBenchmarkConfig({
    schemaVersion: "model-benchmark-config-v1",
    policyVersion: "role-model-rollout-v1",
    allowedRoles: ["script-writer"],
    defaultModelSet: "default",
    modelSets: {
      default: ["model-a", "model-b"],
    },
    candidates: {
      "model-a": candidatePolicy("model-a"),
      "model-b": candidatePolicy("model-b"),
    },
  });

const setup = (episodeId = "episode-test") => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-benchmark-"));
  temporaryDirectories.push(repoRoot);
  const createdAt = "2026-08-19T00:00:00.000Z";
  writeFile(repoRoot, `content/${episodeId}/prompts/script-writer.md`, "write the draft\n");
  writeFile(repoRoot, `content/${episodeId}/research/facts.json`, `${factsJson}\n`);
  for (const name of [
    "director-brief.md",
    "story-bible.md",
    "story-angle.md",
    "three-act-structure.md",
    "hook-candidates.md",
    "viral-strategy.md",
  ]) {
    writeFile(repoRoot, `content/${episodeId}/story/${name}`, `${name}\n`);
  }
  writeFile(
    repoRoot,
    `content/${episodeId}/story/script-draft.md`,
    draftFor(["claim-alpha-001", "claim-alpha-002"]),
  );
  const request = buildScriptWriterBenchmarkRequest({repoRoot, episodeId, createdAt});
  return {repoRoot, episodeId, request, createdAt};
};

const hostedOutput = (request: AgentExecutionRequest, content: string) => ({
  value: {
    outputs: request.expectedOutputs.map((output) => ({...output, content})),
  },
  usage: {inputTokens: 8, outputTokens: 5, totalTokens: 13},
});

describe("model-benchmark-v1", () => {
  it("sends the same frozen inputs to every candidate", async () => {
    const {repoRoot, request} = setup();
    const payloads: string[] = [];
    const systems: string[] = [];
    const users: string[] = [];
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      apiKeyForCandidate: () => "test-key",
      chat: async (call) => {
        const system = call.messages.find((message) => message.role === "system")?.content ?? "";
        const user = call.messages.find((message) => message.role === "user")?.content ?? "";
        systems.push(system);
        users.push(user);
        payloads.push(call.messages.map((message) => message.content).join("\n---\n"));
        return hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"]));
      },
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toBe(payloads[1]);
    expect(systems[0]).toBe(systems[1]);
    expect(users[0]).toBe(users[1]);
    expect(systems[0]).toBe("write the draft\n");
    expect(systems[0]).not.toContain("MACHINE RESPONSE CONTRACT");
    expect(users[0]).toContain(HOSTED_AGENT_RESPONSE_CONTRACT);
    expect(users[0]).toContain("ONLY return one JSON object.");
    expect(payloads[0]).toContain(request.expectedOutputs[0]?.path);
    expect(result.automaticPromotion).toBe(false);
    expect(result.candidateIds).toEqual(["model-a", "model-b"]);
  });

  it("never changes the canonical script-writer output", async () => {
    const {repoRoot, episodeId, request} = setup();
    const canonical = path.join(repoRoot, `content/${episodeId}/story/script-draft.md`);
    const before = fs.readFileSync(canonical, "utf8");
    const {manifest, result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      apiKeyForCandidate: () => "test-key",
      chat: async () => hostedOutput(request, draftFor(["claim-alpha-001"])),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(fs.readFileSync(canonical, "utf8")).toBe(before);
    expect(result.canonicalUnchanged).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          relocateBenchmarkOutputPath(
            episodeId,
            manifest.benchmarkId,
            "model-a",
            `content/${episodeId}/story/script-draft.md`,
          ),
        ),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(
          repoRoot,
          relocateBenchmarkOutputPath(
            episodeId,
            manifest.benchmarkId,
            "model-a",
            `content/${episodeId}/story/script-draft.md`,
          ),
        ),
        "utf8",
      ),
    ).toContain("claim-alpha-001");
  });

  it("fails closed when the prompt or an input is tampered", async () => {
    const {repoRoot, request} = setup();
    let calls = 0;
    await expect(
      runRoleModelBenchmark({
        repoRoot,
        request,
        config: benchmarkConfig(),
        apiKeyForCandidate: () => "test-key",
        chat: async () => {
          calls += 1;
          if (calls === 1) {
            fs.writeFileSync(path.join(repoRoot, request.promptRef.path), "tampered prompt\n");
          }
          return hostedOutput(request, draftFor(["claim-alpha-001"]));
        },
        createdAt: () => "2026-08-19T00:00:00.000Z",
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/BENCHMARK_INPUT_TAMPERED/u);
  });

  it("blocks a malformed candidate and keeps the other isolated", async () => {
    const {repoRoot, episodeId, request} = setup();
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      apiKeyForCandidate: () => "test-key",
      chat: async (call) => {
        if (call.model === "model-a") return {broken: true};
        return hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"]));
      },
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    const malformed = result.candidates.find((candidate) => candidate.candidateId === "model-a");
    const valid = result.candidates.find((candidate) => candidate.candidateId === "model-b");
    expect(malformed?.status).toBe("FAILED");
    expect(malformed?.schemaValid).toBe(false);
    expect(malformed?.promotionEligible).toBe(false);
    expect(valid?.status).toBe("SUCCEEDED");
    expect(valid?.outputArtifacts[0]?.path).toContain("/model-b/");
    expect(
      fs.readFileSync(path.join(repoRoot, `content/${episodeId}/story/script-draft.md`), "utf8"),
    ).toContain("claim-alpha-002");
  });

  it("marks a hard-validator failure ineligible", async () => {
    const {repoRoot, request} = setup();
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "test-key",
      chat: async () => hostedOutput(request, draftFor(["claim-unknown-999"])),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(result.candidates[0]?.hardValidators.status).toBe("FAIL");
    expect(result.candidates[0]?.factualContract.unsupportedClaimCount).toBeGreaterThan(0);
    expect(result.candidates[0]?.promotionEligible).toBe(false);
    expect(result.eligibleCandidateIds).toEqual([]);
  });

  it("does not promote a complete envelope whose markdown lacks ## seg-* headings", async () => {
    const {repoRoot, episodeId, request} = setup();
    const canonical = fs.readFileSync(
      path.join(repoRoot, `content/${episodeId}/story/script-draft.md`),
      "utf8",
    );
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "test-key",
      chat: async () =>
        hostedOutput(
          request,
          `# Script Draft\n\n## Segment 1 — Hook\n- **旁白**：任务交出去，它自己打开浏览器。\n- **Claim**：\`claim-alpha-001\`\n`,
        ),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(result.candidates[0]?.status).toBe("SUCCEEDED");
    expect(result.candidates[0]?.expectedOutputsComplete).toBe(true);
    expect(result.candidates[0]?.schemaValid).toBe(false);
    expect(result.candidates[0]?.hardValidators).toEqual({
      status: "FAIL",
      failures: ["script-draft-missing-segments"],
    });
    expect(result.candidates[0]?.promotionEligible).toBe(false);
    expect(result.automaticPromotion).toBe(false);
    expect(result.canonicalUnchanged).toBe(true);
    expect(
      fs.readFileSync(path.join(repoRoot, `content/${episodeId}/story/script-draft.md`), "utf8"),
    ).toBe(canonical);
  });

  it("aggregates pairwise comparisons deterministically and records usage", async () => {
    const {repoRoot, request} = setup();
    const first = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      apiKeyForCandidate: () => "test-key",
      chat: async (call) =>
        hostedOutput(
          request,
          draftFor(
            call.model === "model-a" ? ["claim-alpha-001"] : ["claim-alpha-001", "claim-alpha-002"],
          ),
        ),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(first.result.pairwise).toHaveLength(1);
    expect(first.result.pairwise[0]).toMatchObject({
      leftCandidateId: "model-a",
      rightCandidateId: "model-b",
    });
    expect(first.result.candidates[0]?.usage).toEqual({
      inputTokens: 8,
      outputTokens: 5,
      totalTokens: 13,
    });
    expect(first.result.candidates[0]?.reasoningProfile).toBe("none");
    expect(first.result.candidates[0]?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(first.result)).not.toContain("reasoning_content");
    const second = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      apiKeyForCandidate: () => "test-key",
      chat: async () => {
        throw new Error("network should not be used on cache hit");
      },
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(second.manifest.inputHash).toBe(first.manifest.inputHash);
    expect(second.result.pairwise).toEqual(first.result.pairwise);
    expect(second.result.candidates.every((candidate) => candidate.cacheHit)).toBe(true);
  });

  it("never auto-promotes and leaves repository policy on manual", () => {
    expect(resolveRoleModelPolicy("script-writer").mode).toBe("manual");
    expect(agentModelPolicyFile.defaults.mode).toBe("manual");
    expect(agentModelPolicyFile.rollout.hostedLlm).toEqual(["oral-rewriter"]);
    expect(
      evaluatePromotionEligibility({
        schemaValid: true,
        expectedOutputsComplete: true,
        hardValidatorStatus: "PASS",
        unsupportedClaimCount: 0,
        canonicalUnsupportedClaimCount: 0,
        newBlockerCount: 0,
        canonicalUnchanged: true,
      }).eligible,
    ).toBe(true);
    expect(
      evaluatePromotionEligibility({
        schemaValid: true,
        expectedOutputsComplete: true,
        hardValidatorStatus: "PASS",
        unsupportedClaimCount: 0,
        canonicalUnsupportedClaimCount: 0,
        newBlockerCount: 0,
        canonicalUnchanged: true,
        repairRound: 1,
      }),
    ).toMatchObject({eligible: false, reasons: ["repaired-payload"]});
    expect(
      evaluatePromotionEligibility({
        schemaValid: true,
        expectedOutputsComplete: true,
        hardValidatorStatus: "FAIL",
        unsupportedClaimCount: 0,
        canonicalUnsupportedClaimCount: 0,
        newBlockerCount: 0,
        canonicalUnchanged: true,
      }),
    ).toMatchObject({eligible: false, reasons: ["hard-validator-failed"]});
  });

  it("does not reuse a candidate cache when only reasoning changes", async () => {
    const {repoRoot, request} = setup();
    const first = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "test-key",
      chat: async () => hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"])),
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    const changedConfig = benchmarkConfig();
    const changedCandidate = changedConfig.candidates["model-a"];
    if (!changedCandidate) throw new Error("test candidate missing");
    changedConfig.candidates["model-a"] = {
      ...changedCandidate,
      reasoning: {
        profile: "deepseek-v4-flash",
        enable_thinking: true,
        reasoning_effort: "max",
      },
    };
    let calls = 0;
    const second = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: changedConfig,
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "test-key",
      chat: async () => {
        calls += 1;
        return hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"]));
      },
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
    });
    expect(first.result.candidates[0]?.cacheHit).toBe(false);
    expect(second.result.candidates[0]?.cacheHit).toBe(false);
    expect(second.result.candidates[0]?.identity).not.toBe(first.result.candidates[0]?.identity);
    expect(calls).toBe(1);
    expect(second.result.automaticPromotion).toBe(false);
  });

  it("keeps createContentAgentAdapter on the manual default", async () => {
    const {repoRoot, episodeId} = setup();
    const promptRef = buildArtifactRef({
      repoRoot,
      artifactId: `${episodeId}:prompt:script-writer`,
      episodeId,
      path: `content/${episodeId}/prompts/script-writer.md`,
      mediaType: "text/markdown",
      schemaVersion: "prompt-v1",
      producer: "test",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const runner = createContentAgentAdapter({
      repoRoot,
      createdAt: () => "2026-08-19T00:00:00.000Z",
    });
    const result = await runner({
      contractVersion: "agent-execution-v1",
      executionId: "exec-manual",
      episodeId,
      agentName: "script-writer",
      attempt: 1,
      revisionRound: 0,
      promptRef,
      inputArtifacts: [promptRef],
      expectedOutputs: [
        {
          artifactId: `${episodeId}:story:script-draft`,
          path: `content/${episodeId}/story/script-draft.md`,
          schemaVersion: "script-draft-v1",
        },
      ],
      upstreamGateRefs: [],
      revisionBudgetRemaining: 0,
    });
    expect(result.outputArtifacts[0]?.producer).toBe("manual-file:script-writer");
  });

  it("isolates episode outputs and committed model sets", () => {
    const first = setup("episode-004");
    const second = setup("episode-005");
    const left = hashBenchmarkInput({
      episodeId: "episode-004",
      agentName: "script-writer",
      revisionRound: 0,
      policyVersion: "role-model-rollout-v1",
      promptRef: first.request.promptRef,
      inputArtifacts: first.request.inputArtifacts,
      upstreamGateRefs: first.request.upstreamGateRefs,
      expectedOutputs: first.request.expectedOutputs,
    });
    const right = hashBenchmarkInput({
      episodeId: "episode-005",
      agentName: "script-writer",
      revisionRound: 0,
      policyVersion: "role-model-rollout-v1",
      promptRef: second.request.promptRef,
      inputArtifacts: second.request.inputArtifacts,
      upstreamGateRefs: second.request.upstreamGateRefs,
      expectedOutputs: second.request.expectedOutputs,
    });
    expect(left).not.toBe(right);
    expect(
      relocateBenchmarkOutputPath(
        "episode-004",
        "bm-test",
        "model-a",
        "content/episode-004/story/script-draft.md",
      ),
    ).toBe("content/episode-004/rollout/benchmarks/bm-test/model-a/base/story/script-draft.md");
    const committed = loadRoleModelBenchmarkConfig();
    expect(committed.allowedRoles).toEqual([
      "research-analyst",
      "story-director",
      "viral-director",
      "script-writer",
      "oral-rewriter",
      "oral-judge",
      "audience-critic",
      "fact-guardian",
      "visual-director",
      "retention-critic",
      "delivery-critic",
    ]);
    expect(resolveBenchmarkCandidates("default", committed).map((item) => item.id)).toEqual([
      "deepseek-v4-flash",
      "qwen3-7-plus",
      "minimax-m2-7",
    ]);
    for (const candidate of Object.values(committed.candidates)) {
      expect(candidate.timeoutMs).toBe(300_000);
      expect(candidate.maxRetries).toBe(0);
    }
    expect(committed.candidates["deepseek-v4-flash"]?.reasoning).toEqual({
      profile: "deepseek-v4-flash",
      enable_thinking: true,
      reasoning_effort: "max",
    });
    expect(committed.candidates["qwen3-7-plus"]?.reasoning).toEqual({
      profile: "qwen3.7-plus",
      enable_thinking: true,
      thinking_budget: 262144,
    });
    expect(committed.candidates["minimax-m2-7"]?.reasoning).toEqual({
      profile: "minimax-m2.7",
      mode: "native-thinking-only",
    });
    expect(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "model-a",
        promptVersion: "prompt-v1:abc",
      }),
    ).toBe(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "model-a",
        promptVersion: "prompt-v1:abc",
      }),
    );
    expect(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "model-a",
        promptVersion: "prompt-v1:abc",
      }),
    ).toBe(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "model-a",
        promptVersion: "prompt-v1:abc",
        repairContextHash: EMPTY_REPAIR_CONTEXT_HASH,
      }),
    );
    expect(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "model-a",
        promptVersion: "prompt-v1:abc",
        repairContextHash: hashRepairContext({appendix: "repair-a", repairRound: 1}),
      }),
    ).not.toBe(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "model-a",
        promptVersion: "prompt-v1:abc",
      }),
    );
    expect(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "deepseek-v4-flash",
        promptVersion: "prompt-v1:abc",
        reasoning: {profile: "none"},
      }),
    ).not.toBe(
      hashBenchmarkIdentity({
        inputHash: left,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "deepseek-v4-flash",
        promptVersion: "prompt-v1:abc",
        reasoning: {
          profile: "deepseek-v4-flash",
          enable_thinking: true,
          reasoning_effort: "max",
        },
      }),
    );
  });

  it("prints start, complete, and failed progress for each candidate", async () => {
    const {repoRoot, request} = setup();
    const events: BenchmarkProgressEvent[] = [];
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      apiKeyForCandidate: () => "test-key",
      chat: async (call) => {
        if (call.model === "model-a") return {broken: true};
        return hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"]));
      },
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
      onProgress: (event) => events.push(event),
    });
    expect(events.map((event) => `${event.phase}:${event.candidateId}`)).toEqual([
      "start:model-a",
      "failed:model-a",
      "start:model-b",
      "complete:model-b",
    ]);
    expect(events[1]).toMatchObject({phase: "failed", model: "model-a"});
    expect(events[3]).toMatchObject({phase: "complete", model: "model-b", status: "SUCCEEDED"});
    expect(result.automaticPromotion).toBe(false);
  });
});

describe("fake-provider transport contract", () => {
  it("accepts a legal outputs envelope without promoting", async () => {
    const {repoRoot, request} = setup();
    const provider = createFakeHostedChatProvider({
      handler: async () => hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"])),
    });
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "super-secret-test-key",
      provider,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
      onProgress: () => undefined,
    });
    expect(result.candidates[0]?.status).toBe("SUCCEEDED");
    expect(result.candidates[0]?.expectedOutputsComplete).toBe(true);
    expect(result.automaticPromotion).toBe(false);
    expect(result.promotionRequires).toBe("explicit-config-or-human-decision");
  });

  it("identifies a markdown-only response", async () => {
    const {repoRoot, request} = setup();
    const markdown = "# Script Draft\n\n状态：`draft-ready`\n";
    const provider = createFakeHostedChatProvider({
      handler: async () => markdown,
    });
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "super-secret-test-key",
      provider,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
      onProgress: () => undefined,
    });
    const failed = result.candidates[0];
    expect(failed?.status).toBe("FAILED");
    expect(failed?.promotionEligible).toBe(false);
    expect(failed?.failureDetail).toMatch(/markdown-only response/u);
    expect(failed?.failureDetail).toContain("candidate=model-a");
    expect(failed?.failureDetail).toContain("model=model-a");
    expect(failed?.failureDetail).toContain(`sha256=${hashHostedResponseContent(markdown)}`);
    expect(failed?.failureDetail).toMatch(/preview=/u);
    expect(failed?.failureDetail).not.toContain("super-secret-test-key");
    expect(result.automaticPromotion).toBe(false);
    expect(result.eligibleCandidateIds).toEqual([]);
  });

  it("records diagnosable malformed JSON without leaking the API key", async () => {
    const {repoRoot, request} = setup();
    const broken = {broken: true, note: "not an outputs envelope"};
    const provider = createFakeHostedChatProvider({
      handler: async () => broken,
    });
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "super-secret-test-key",
      provider,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
      onProgress: () => undefined,
    });
    const failed = result.candidates[0];
    expect(failed?.status).toBe("FAILED");
    expect(failed?.promotionEligible).toBe(false);
    expect(failed?.failureDetail).toMatch(/malformed JSON/u);
    expect(failed?.failureDetail).toContain("candidate=model-a");
    expect(failed?.failureDetail).toContain("model=model-a");
    expect(failed?.failureDetail).toMatch(/status=n\/a/u);
    expect(failed?.failureDetail).toContain(
      `sha256=${hashHostedResponseContent(JSON.stringify(broken))}`,
    );
    expect(failed?.failureDetail).toContain("not an outputs envelope");
    expect(failed?.failureDetail).not.toContain("super-secret-test-key");
    expect(failed?.failureDetail).not.toMatch(/apiKey/iu);
    expect(result.automaticPromotion).toBe(false);
  });

  it("recovers DeepSeek-style reasoning outputs at round zero without cache leakage", async () => {
    const {repoRoot, episodeId, request} = setup();
    const reasoningSecret = "benchmark-reasoning-secret";
    const rawBody = JSON.stringify({
      choices: [
        {
          message: {
            content: "",
            reasoning_content: JSON.stringify({
              outputs: request.expectedOutputs.map((output) => ({
                ...output,
                content: draftFor(["claim-alpha-001", "claim-alpha-002"]),
              })),
              trace: reasoningSecret,
            }),
          },
        },
      ],
      usage: {prompt_tokens: 8, completion_tokens: 5, total_tokens: 13},
    });
    const provider = createOpenAiCompatibleChatProvider({
      fetchImpl: async () =>
        new Response(rawBody, {status: 200, headers: {"content-type": "application/json"}}),
    });
    const {manifest, result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config: benchmarkConfig(),
      candidateIds: ["model-a"],
      apiKeyForCandidate: () => "test-key",
      provider,
      createdAt: () => "2026-08-19T00:00:00.000Z",
      sleep: async () => undefined,
      onProgress: () => undefined,
    });
    const candidate = result.candidates[0];
    expect(candidate).toMatchObject({
      status: "SUCCEEDED",
      repairRound: 0,
      retryCount: 0,
      cacheHit: false,
    });
    expect(result.automaticPromotion).toBe(false);
    expect(JSON.stringify(result)).not.toContain(reasoningSecret);
    const cachePath = candidateCachePath(
      episodeId,
      manifest.benchmarkId,
      candidate?.identity ?? "",
    );
    expect(fs.existsSync(path.join(repoRoot, cachePath))).toBe(true);
    expect(fs.readFileSync(path.join(repoRoot, cachePath), "utf8")).not.toContain(reasoningSecret);
  });

  it.each([
    ["ordinary CoT", "benchmark-reasoning-secret-cot ordinary chain of thought"],
    ["invalid JSON", '{"outputs":[{"artifactId":"benchmark-reasoning-secret-json"}'],
  ])(
    "fails the benchmark closed without leaking %s reasoning content",
    async (_label, reasoningContent) => {
      const {repoRoot, episodeId, request} = setup();
      const rawBody = JSON.stringify({
        choices: [{message: {content: "", reasoning_content: reasoningContent}}],
      });
      const provider = createOpenAiCompatibleChatProvider({
        fetchImpl: async () =>
          new Response(rawBody, {
            status: 200,
            headers: {"content-type": "application/json"},
          }),
      });
      const events: BenchmarkProgressEvent[] = [];
      const {manifest, result} = await runRoleModelBenchmark({
        repoRoot,
        request,
        config: benchmarkConfig(),
        candidateIds: ["model-a"],
        apiKeyForCandidate: () => "test-key",
        provider,
        createdAt: () => "2026-08-19T00:00:00.000Z",
        sleep: async () => undefined,
        onProgress: (event) => events.push(event),
      });
      const failed = result.candidates[0];
      expect(failed?.status).toBe("FAILED");
      expect(failed?.failureDetail).toContain("content_empty=true");
      expect(failed?.failureDetail).toContain("reasoning_content_present=true");
      expect(failed?.failureDetail).toContain(`sha256=${hashHostedResponseContent(rawBody)}`);
      expect(failed?.failureDetail).not.toContain(reasoningContent);
      expect(failed?.failureDetail).not.toContain("preview=");
      expect(JSON.stringify(result)).not.toContain(reasoningContent);
      expect(JSON.stringify(events)).not.toContain(reasoningContent);
      expect(
        fs.readFileSync(
          path.join(
            repoRoot,
            `content/${episodeId}/rollout/benchmarks/${manifest.benchmarkId}/model-a/candidate-result.json`,
          ),
          "utf8",
        ),
      ).not.toContain(reasoningContent);
      expect(
        fs.existsSync(
          path.join(
            repoRoot,
            candidateCachePath(episodeId, manifest.benchmarkId, failed?.identity ?? ""),
          ),
        ),
      ).toBe(false);
    },
  );
});
