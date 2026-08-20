import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentModelPolicyFile,
  applyAuthorizedRepair,
  assertProtectedSnapshotUnchanged,
  assertRepairAuthorization,
  buildScriptWriterBenchmarkRequest,
  createFakeHostedChatProvider,
  diagnoseBenchmarkResult,
  formatBenchmarkOutcome,
  hashBenchmarkIdentity,
  hashRepairContext,
  isProtectedRepairPath,
  parseRoleModelAutoRepairConfig,
  parseRoleModelBenchmarkConfig,
  planCatalogRepair,
  runAutonomousRoleBenchmark,
  runRoleModelBenchmark,
  SCRIPT_DRAFT_OUTPUT_FORMAT_SECTION,
  SCRIPT_DRAFT_REQUIRED_MARKERS,
  selectDiagnosticReviewCohort,
  selectFairReviewCohort,
  selectPromotionReviewCohort,
  selectRepair,
  snapshotProtectedPaths,
  stableJson,
  type AgentExecutionRequest,
  type AutoRepairDiagnosis,
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

const segmentTitleDraft = `# Script Draft

## Segment 1 — Hook
- **旁白**：任务交出去，它自己打开浏览器。
- **Claim**：\`claim-alpha-001\`
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
    modelSets: {default: ["cand-alpha", "cand-beta"]},
    candidates: {
      "cand-alpha": candidatePolicy("cand-alpha"),
      "cand-beta": candidatePolicy("cand-beta"),
    },
  });

const autoConfig = (overrides: Partial<ReturnType<typeof parseRoleModelAutoRepairConfig>> = {}) =>
  parseRoleModelAutoRepairConfig({
    schemaVersion: "role-model-auto-repair-v1",
    policyVersion: "role-model-rollout-v1",
    maxRounds: 3,
    maxRepairs: 4,
    maxApiCalls: 12,
    maxTotalTokens: 50_000,
    ...overrides,
  });

const setup = (episodeId = "episode-test") => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-auto-"));
  temporaryDirectories.push(repoRoot);
  writeFile(repoRoot, "config/agent-model-policy.json", `${stableJson(agentModelPolicyFile)}\n`);
  writeFile(
    repoRoot,
    "src/orchestration/agents/benchmark/script-writer-evaluate.ts",
    "export const HARD_VALIDATOR = true;\n",
  );
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
  return {repoRoot, episodeId};
};

const hostedOutput = (request: AgentExecutionRequest, content: string) => ({
  value: {
    outputs: request.expectedOutputs.map((output) => ({...output, content})),
  },
  usage: {inputTokens: 8, outputTokens: 5, totalTokens: 13},
});

const requestFor = (repoRoot: string, episodeId: string): AgentExecutionRequest =>
  buildScriptWriterBenchmarkRequest({
    repoRoot,
    episodeId,
    createdAt: "2026-08-20T00:00:00.000Z",
  });

describe("M6 autonomous role benchmark", () => {
  it("reaches review-ready without repairing a legal envelope", async () => {
    const {repoRoot, episodeId} = setup();
    const request = requestFor(repoRoot, episodeId);
    let apiCalls = 0;
    const {summary, reviewPath} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-happy",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async () => {
        apiCalls += 1;
        return hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"]));
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "skipped"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("review-ready");
    expect(summary.automaticPromotion).toBe(false);
    expect(summary.repairsApplied).toBe(0);
    expect(summary.rounds).toBe(1);
    expect(apiCalls).toBe(2);
    expect(summary.canonicalUnchanged).toBe(true);
    expect(reviewPath).toContain("/review/blind-review.json");
    expect(
      fs.readFileSync(path.join(repoRoot, `content/${episodeId}/story/script-draft.md`), "utf8"),
    ).toContain("claim-alpha-002");
  });

  it("repairs a missing ## seg-* contract then reruns every candidate on a new inputHash", async () => {
    const {repoRoot, episodeId} = setup();
    let apiCalls = 0;
    const testRuns: string[] = [];
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-contract",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async (call) => {
        apiCalls += 1;
        const request = requestFor(repoRoot, episodeId);
        const system = call.messages.find((message) => message.role === "system")?.content ?? "";
        const ready = SCRIPT_DRAFT_REQUIRED_MARKERS.every((marker) => system.includes(marker));
        return hostedOutput(
          request,
          ready ? draftFor(["claim-alpha-001", "claim-alpha-002"]) : segmentTitleDraft,
        );
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => {
        testRuns.push("ran");
        return {ok: true, output: "ok"};
      },
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("review-ready");
    expect(summary.repairsApplied).toBe(1);
    expect(summary.rounds).toBe(2);
    expect(summary.inputHashes).toHaveLength(2);
    expect(summary.inputHashes[0]).not.toBe(summary.inputHashes[1]);
    expect(apiCalls).toBe(4);
    expect(testRuns).toEqual(["ran"]);
    expect(summary.automaticPromotion).toBe(false);
    const prompt = fs.readFileSync(
      path.join(repoRoot, `content/${episodeId}/prompts/script-writer.md`),
      "utf8",
    );
    for (const marker of SCRIPT_DRAFT_REQUIRED_MARKERS) {
      expect(prompt).toContain(marker);
    }
    expect(
      fs.readFileSync(
        path.join(repoRoot, "src/orchestration/agents/benchmark/script-writer-evaluate.ts"),
        "utf8",
      ),
    ).toBe("export const HARD_VALIDATOR = true;\n");
  });

  it("repairs markdown-only transport with a candidate-output rerun", async () => {
    const {repoRoot, episodeId} = setup();
    writeFile(
      repoRoot,
      `content/${episodeId}/prompts/script-writer.md`,
      `write the draft\n\n${SCRIPT_DRAFT_REQUIRED_MARKERS.join("\n")}\n`,
    );
    let apiCalls = 0;
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-markdown",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async (call) => {
        apiCalls += 1;
        const user = call.messages.find((message) => message.role === "user")?.content ?? "";
        if (!user.includes("CANDIDATE OUTPUT REPAIR")) {
          return "# Script Draft\n\n状态：`draft-ready`\n";
        }
        return hostedOutput(
          requestFor(repoRoot, episodeId),
          draftFor(["claim-alpha-001", "claim-alpha-002"]),
        );
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("insufficient-comparable-candidates");
    expect(summary.repairsApplied).toBe(1);
    expect(apiCalls).toBe(4);
    expect(summary.automaticPromotion).toBe(false);
    expect(summary.reviewPath).toBeNull();
    expect(summary.diagnosticReviewPath).toContain("/review/diagnostic-review.json");
  });

  it("keeps editorial repairs on candidate output and never auto-promotes", async () => {
    const {repoRoot, episodeId} = setup();
    writeFile(
      repoRoot,
      `content/${episodeId}/prompts/script-writer.md`,
      `write the draft\n\n${SCRIPT_DRAFT_REQUIRED_MARKERS.join("\n")}\n`,
    );
    const evaluatorBefore = fs.readFileSync(
      path.join(repoRoot, "src/orchestration/agents/benchmark/script-writer-evaluate.ts"),
      "utf8",
    );
    const policyBefore = fs.readFileSync(
      path.join(repoRoot, "config/agent-model-policy.json"),
      "utf8",
    );
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-editorial",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig({maxRounds: 2, maxRepairs: 1}),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async (call) => {
        const user = call.messages.find((message) => message.role === "user")?.content ?? "";
        return hostedOutput(
          requestFor(repoRoot, episodeId),
          draftFor(
            user.includes("CANDIDATE OUTPUT REPAIR") ? ["claim-alpha-001"] : ["claim-unknown-999"],
          ),
        );
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => {
        throw new Error("editorial repair must not run harness tests");
      },
      onProgress: () => undefined,
    });
    expect(summary.automaticPromotion).toBe(false);
    expect(summary.promotionRequires).toBe("explicit-config-or-human-decision");
    expect(
      fs.readFileSync(
        path.join(repoRoot, "src/orchestration/agents/benchmark/script-writer-evaluate.ts"),
        "utf8",
      ),
    ).toBe(evaluatorBefore);
    expect(fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8")).toBe(
      policyBefore,
    );
    expect(
      fs.readFileSync(path.join(repoRoot, `content/${episodeId}/story/script-draft.md`), "utf8"),
    ).toContain("claim-alpha-002");
  });

  it("stops on budget exhaustion without promoting", async () => {
    const {repoRoot, episodeId} = setup();
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-budget",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig({maxRounds: 1, maxRepairs: 0, maxApiCalls: 8}),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async () => hostedOutput(requestFor(repoRoot, episodeId), segmentTitleDraft),
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("budget-exhausted");
    expect(summary.automaticPromotion).toBe(false);
    expect(summary.repairsApplied).toBe(0);
  });

  it("rejects protected-path repairs and keeps canonical isolation", () => {
    expect(isProtectedRepairPath("config/agent-model-policy.json", "episode-test")).toBe(true);
    expect(
      isProtectedRepairPath(
        "src/orchestration/agents/benchmark/script-writer-evaluate.ts",
        "episode-test",
      ),
    ).toBe(true);
    expect(isProtectedRepairPath("editorial-calibration/policies/x.json", "episode-test")).toBe(
      true,
    );
    expect(
      isProtectedRepairPath("content/episode-test/story/script-draft.md", "episode-test"),
    ).toBe(true);
    expect(isProtectedRepairPath("agents/script-writer.md", "episode-test")).toBe(false);
    const diagnosis: AutoRepairDiagnosis = {
      code: "editorial-unsupported-claim",
      target: "candidate-output",
      candidateId: "cand-alpha",
      evidence: "unsupported-claim:claim-x",
      allowPaths: [],
      denyPaths: ["src/orchestration/agents/benchmark/script-writer-evaluate.ts"],
      instruction: "candidate only",
    };
    expect(() =>
      assertRepairAuthorization(diagnosis, "episode-test", [
        "src/orchestration/agents/benchmark/script-writer-evaluate.ts",
      ]),
    ).toThrow(/PROTECTED_PATH_MUTATED/u);
  });

  it("requires exact repair-file rules and rejects sibling-prefix bypasses", () => {
    const diagnosis = (allowPaths: string[], denyPaths: string[] = []): AutoRepairDiagnosis => ({
      code: "unknown",
      target: "harness",
      candidateId: null,
      evidence: "path authorization regression",
      allowPaths,
      denyPaths,
      instruction: "test path authorization",
    });

    expect(() =>
      assertRepairAuthorization(diagnosis(["scripts\\hosted-agent.ts"]), "episode-test", [
        "scripts/hosted-agent.ts",
      ]),
    ).not.toThrow();
    expect(() =>
      assertRepairAuthorization(diagnosis(["scripts/hosted-agent.ts"]), "episode-test", [
        "scripts/hosted-agent.ts.evil",
      ]),
    ).toThrow(/REPAIR_PATH_NOT_AUTHORIZED:scripts\/hosted-agent\.ts\.evil/u);
    expect(() =>
      assertRepairAuthorization(diagnosis(["scripts/benchmark-auto.ts"]), "episode-test", [
        "scripts/benchmark-auto.ts.backup",
      ]),
    ).toThrow(/REPAIR_PATH_NOT_AUTHORIZED:scripts\/benchmark-auto\.ts\.backup/u);
    expect(() =>
      assertRepairAuthorization(
        diagnosis(["scripts/"], ["scripts/benchmark-auto.ts"]),
        "episode-test",
        ["scripts/benchmark-auto.ts"],
      ),
    ).toThrow(/PROTECTED_PATH_MUTATED:scripts\/benchmark-auto\.ts/u);
    expect(() =>
      assertRepairAuthorization(diagnosis(["scripts/"], ["scripts/"]), "episode-test", [
        "scripts/benchmark-auto.ts.backup",
      ]),
    ).toThrow(/PROTECTED_PATH_MUTATED:scripts\/benchmark-auto\.ts\.backup/u);
  });

  it("routes missing segments to the prompt when the template is undeclared", () => {
    const {repoRoot, episodeId} = setup();
    const diagnoses = diagnoseBenchmarkResult({
      repoRoot,
      promptPath: `content/${episodeId}/prompts/script-writer.md`,
      result: {
        schemaVersion: "model-benchmark-v1",
        kind: "result",
        benchmarkId: "bm-test",
        inputHash: "a".repeat(64),
        episodeId,
        agentName: "script-writer",
        policyVersion: "role-model-rollout-v1",
        candidateIds: ["cand-alpha"],
        candidates: [
          {
            schemaVersion: "model-benchmark-v1",
            kind: "candidate",
            benchmarkId: "bm-test",
            identity: "b".repeat(64),
            candidateId: "cand-alpha",
            provider: "openai-compatible",
            model: "cand-alpha",
            reasoningProfile: "none",
            cacheHit: false,
            status: "SUCCEEDED",
            outcome: "FAIL",
            repairRound: 0,
            repairContextHash: "c".repeat(64),
            schemaValid: false,
            expectedOutputsComplete: true,
            hardValidators: {status: "FAIL", failures: ["script-draft-missing-segments"]},
            factualContract: {
              status: "PASS",
              claimIds: [],
              unsupportedClaimIds: [],
              unsupportedClaimCount: 0,
              claimCoverage: 0,
            },
            downstreamCritic: {
              status: "not-evaluated",
              score: null,
              verdict: null,
              blockerCount: 0,
              detail: "not run",
            },
            latencyMs: 1,
            attempt: 1,
            retryCount: 0,
            usage: {inputTokens: null, outputTokens: null, totalTokens: null},
            outputArtifacts: [],
            outputHashes: [],
            outputLength: 10,
            failureDetail: null,
            promotionEligible: false,
            ineligibilityReasons: ["hard-validator-failed"],
          },
        ],
        pairwise: [],
        eligibleCandidateIds: [],
        automaticPromotion: false,
        promotionRequires: "explicit-config-or-human-decision",
        canonicalUnchanged: true,
        humanReview: {notes: null, preferredCandidateId: null, decisionId: null},
      },
    });
    expect(selectRepair(diagnoses)?.target).toBe("artifact-output-contract");
    expect(selectRepair(diagnoses)?.allowPaths).toContain(
      `content/${episodeId}/prompts/script-writer.md`,
    );
    expect(selectRepair(diagnoses)?.allowPaths).not.toContain(
      "src/orchestration/agents/benchmark/script-writer-evaluate.ts",
    );
  });

  it("fails preflight when API keys are missing and no fake provider is injected", async () => {
    const {repoRoot, episodeId} = setup();
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-preflight",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {},
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("preflight-failed");
    expect(summary.automaticPromotion).toBe(false);
    expect(summary.diagnoses[0]?.code).toBe("preflight-missing-key");
  });

  it("uses a fake provider for the full loop without touching the network", async () => {
    const {repoRoot, episodeId} = setup();
    writeFile(
      repoRoot,
      `content/${episodeId}/prompts/script-writer.md`,
      `write the draft\n\n${SCRIPT_DRAFT_REQUIRED_MARKERS.join("\n")}\n`,
    );
    const provider = createFakeHostedChatProvider({
      handler: async () =>
        hostedOutput(
          requestFor(repoRoot, episodeId),
          draftFor(["claim-alpha-001", "claim-alpha-002"]),
        ),
    });
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-fake",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      provider,
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("review-ready");
    expect(summary.apiCalls).toBe(2);
    expect(summary.automaticPromotion).toBe(false);
  });

  it("does not let benchmark:role reuse a repaired cache identity", async () => {
    const {repoRoot, episodeId} = setup();
    writeFile(
      repoRoot,
      `content/${episodeId}/prompts/script-writer.md`,
      `write the draft\n\n${SCRIPT_DRAFT_REQUIRED_MARKERS.join("\n")}\n`,
    );
    const config = benchmarkConfig();
    await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-cache",
      benchmarkConfig: config,
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async (call) => {
        const user = call.messages.find((message) => message.role === "user")?.content ?? "";
        if (!user.includes("CANDIDATE OUTPUT REPAIR")) {
          return "# Script Draft\n\n状态：`draft-ready`\n";
        }
        return hostedOutput(
          requestFor(repoRoot, episodeId),
          draftFor(["claim-alpha-001", "claim-alpha-002"]),
        );
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    let roleCalls = 0;
    const request = requestFor(repoRoot, episodeId);
    const {result} = await runRoleModelBenchmark({
      repoRoot,
      request,
      config,
      env: {OPENAI_API_KEY: "test-key"},
      chat: async () => {
        roleCalls += 1;
        return hostedOutput(request, draftFor(["claim-alpha-001", "claim-alpha-002"]));
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      onProgress: () => undefined,
    });
    expect(roleCalls).toBe(2);
    expect(result.candidates.every((candidate) => candidate.cacheHit === false)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.repairRound === 0)).toBe(true);
    expect(result.candidates.map((candidate) => candidate.outcome)).toEqual(["PASS", "PASS"]);
    expect(
      hashBenchmarkIdentity({
        inputHash: result.inputHash,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "cand-alpha",
        promptVersion: `${request.promptRef.schemaVersion}:${request.promptRef.sha256}`,
      }),
    ).not.toBe(
      hashBenchmarkIdentity({
        inputHash: result.inputHash,
        agentName: "script-writer",
        provider: "openai-compatible",
        model: "cand-alpha",
        promptVersion: `${request.promptRef.schemaVersion}:${request.promptRef.sha256}`,
        repairContextHash: hashRepairContext({appendix: "CANDIDATE OUTPUT REPAIR", repairRound: 1}),
      }),
    );
  });

  it("keeps repaired and unrepaired candidates out of the same review cohort", () => {
    const mixed = [
      {
        candidateId: "cand-alpha",
        repairRound: 0,
        repairContextHash: hashRepairContext(),
        outcome: "PASS" as const,
      },
      {
        candidateId: "cand-beta",
        repairRound: 1,
        repairContextHash: hashRepairContext({appendix: "repair", repairRound: 1}),
        outcome: "PASS_AFTER_REPAIR" as const,
      },
    ].map((item) => ({
      schemaVersion: "model-benchmark-v1" as const,
      kind: "candidate" as const,
      benchmarkId: "bm-test",
      identity: "d".repeat(64),
      provider: "openai-compatible",
      model: item.candidateId,
      reasoningProfile: "none" as const,
      cacheHit: false,
      status: "SUCCEEDED" as const,
      schemaValid: true,
      expectedOutputsComplete: true,
      hardValidators: {status: "PASS" as const, failures: []},
      factualContract: {
        status: "PASS" as const,
        claimIds: ["claim-alpha-001"],
        unsupportedClaimIds: [],
        unsupportedClaimCount: 0,
        claimCoverage: 1,
      },
      downstreamCritic: {
        status: "not-evaluated" as const,
        score: null,
        verdict: null,
        blockerCount: 0,
        detail: "not run",
      },
      latencyMs: 1,
      attempt: 1,
      retryCount: 0,
      usage: {inputTokens: null, outputTokens: null, totalTokens: null},
      outputArtifacts: [],
      outputHashes: [],
      outputLength: 1,
      failureDetail: null,
      promotionEligible: item.repairRound === 0,
      ineligibilityReasons: item.repairRound === 0 ? [] : ["repaired-payload"],
      ...item,
    }));
    const cohort = selectPromotionReviewCohort(mixed);
    expect(cohort).toHaveLength(1);
    expect(cohort[0]?.candidateId).toBe("cand-alpha");
    expect(selectDiagnosticReviewCohort(mixed).map((item) => item.candidateId)).toEqual([
      "cand-beta",
    ]);
    expect(selectFairReviewCohort(mixed)).toEqual(cohort);
    expect(formatBenchmarkOutcome(mixed[1]!)).toBe("PASS_AFTER_REPAIR(round=1)");
  });

  it("runs a repair executor only against staging and then applies an authorized patch", async () => {
    const {repoRoot, episodeId} = setup();
    const promptPath = `content/${episodeId}/prompts/script-writer.md`;
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-executor",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      repairExecutor: async (task) => {
        expect(task.stagingRoot).not.toBe(repoRoot);
        expect("repoRoot" in task).toBe(false);
        const staged = path.join(task.stagingRoot, task.promptPath);
        fs.appendFileSync(staged, `\n${SCRIPT_DRAFT_OUTPUT_FORMAT_SECTION}`);
        expect(fs.readFileSync(path.join(repoRoot, task.promptPath), "utf8")).toBe(
          "write the draft\n",
        );
      },
      chat: async (call) => {
        const system = call.messages.find((message) => message.role === "system")?.content ?? "";
        const ready = SCRIPT_DRAFT_REQUIRED_MARKERS.every((marker) => system.includes(marker));
        return hostedOutput(
          requestFor(repoRoot, episodeId),
          ready ? draftFor(["claim-alpha-001", "claim-alpha-002"]) : segmentTitleDraft,
        );
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("review-ready");
    expect(fs.readFileSync(path.join(repoRoot, promptPath), "utf8")).toContain("## seg-");
  });

  it("fails closed when an executor mutates the main working tree", async () => {
    const {repoRoot, episodeId} = setup();
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-executor-touch",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      repairExecutor: async () => {
        fs.writeFileSync(
          path.join(repoRoot, `content/${episodeId}/prompts/script-writer.md`),
          "touched-main\n",
        );
      },
      chat: async () => hostedOutput(requestFor(repoRoot, episodeId), segmentTitleDraft),
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("protected-violation");
    expect(summary.stopReason).toMatch(/EXECUTOR_TOUCHED_WORKING_TREE/u);
  });

  it("fails closed when an executor mutates package.json", async () => {
    const {repoRoot, episodeId} = setup();
    writeFile(repoRoot, "package.json", '{"name":"fixture"}\n');
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-executor-package",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      repairExecutor: async () => {
        fs.writeFileSync(path.join(repoRoot, "package.json"), '{"name":"pwned"}\n');
      },
      chat: async () => hostedOutput(requestFor(repoRoot, episodeId), segmentTitleDraft),
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("protected-violation");
    expect(summary.stopReason).toMatch(/EXECUTOR_TOUCHED_WORKING_TREE:package\.json/u);
  });

  it("writes repair artifacts under a variant path and leaves the base artifact untouched", async () => {
    const {repoRoot, episodeId} = setup();
    writeFile(
      repoRoot,
      `content/${episodeId}/prompts/script-writer.md`,
      `write the draft\n\n${SCRIPT_DRAFT_REQUIRED_MARKERS.join("\n")}\n`,
    );
    const {summary} = await runAutonomousRoleBenchmark({
      repoRoot,
      episodeId,
      runId: "auto-variant-path",
      benchmarkConfig: benchmarkConfig(),
      autoConfig: autoConfig(),
      env: {OPENAI_API_KEY: "test-key"},
      chat: async (call) => {
        const user = call.messages.find((message) => message.role === "user")?.content ?? "";
        if (call.model === "cand-alpha") {
          return hostedOutput(
            requestFor(repoRoot, episodeId),
            draftFor(["claim-alpha-001", "claim-alpha-002"]),
          );
        }
        if (!user.includes("CANDIDATE OUTPUT REPAIR")) {
          return hostedOutput(requestFor(repoRoot, episodeId), segmentTitleDraft);
        }
        return hostedOutput(
          requestFor(repoRoot, episodeId),
          draftFor(["claim-alpha-001", "claim-alpha-002"]),
        );
      },
      createdAt: () => "2026-08-20T00:00:00.000Z",
      sleep: async () => undefined,
      runTests: async () => ({ok: true, output: "ok"}),
      onProgress: () => undefined,
    });
    expect(summary.status).toBe("insufficient-comparable-candidates");
    expect(summary.automaticPromotion).toBe(false);
    const alphaBase = path.join(
      repoRoot,
      `content/${episodeId}/rollout/benchmarks`,
      summary.benchmarkId ?? "",
      "cand-alpha/base/story/script-draft.md",
    );
    expect(fs.existsSync(alphaBase)).toBe(true);
    const betaDir = path.join(
      repoRoot,
      `content/${episodeId}/rollout/benchmarks`,
      summary.benchmarkId ?? "",
      "cand-beta",
    );
    const betaVariants = fs.readdirSync(betaDir);
    expect(betaVariants.some((name) => name.startsWith("repair-"))).toBe(true);
    const betaBase = path.join(betaDir, "base/story/script-draft.md");
    if (fs.existsSync(betaBase)) {
      expect(fs.readFileSync(betaBase, "utf8")).toContain("## Segment 1");
    }
  });

  it("snapshots nested protected directories", () => {
    const {repoRoot, episodeId} = setup();
    writeFile(repoRoot, "editorial-calibration/policies/nested.json", '{"ok":true}\n');
    const before = snapshotProtectedPaths({repoRoot, episodeId});
    expect(before["editorial-calibration/policies/nested.json"]).toBeDefined();
    expect(before[`content/${episodeId}/research/facts.json`]).toBeDefined();
    writeFile(repoRoot, "editorial-calibration/policies/nested.json", '{"ok":false}\n');
    const after = snapshotProtectedPaths({repoRoot, episodeId});
    expect(() => assertProtectedSnapshotUnchanged(before, after)).toThrow(
      /PROTECTED_PATH_MUTATED:editorial-calibration\/policies\/nested.json/u,
    );
  });

  it("writes timeout bounds to disk when the config file exists", async () => {
    const {repoRoot, episodeId} = setup();
    const config = benchmarkConfig();
    writeFile(repoRoot, "config/role-model-benchmark.json", `${stableJson(config)}\n`);
    const diagnosis = diagnoseBenchmarkResult({
      repoRoot,
      promptPath: `content/${episodeId}/prompts/script-writer.md`,
      result: {
        schemaVersion: "model-benchmark-v1",
        kind: "result",
        benchmarkId: "bm-test",
        inputHash: "a".repeat(64),
        episodeId,
        agentName: "script-writer",
        policyVersion: "role-model-rollout-v1",
        candidateIds: ["cand-alpha"],
        candidates: [
          {
            schemaVersion: "model-benchmark-v1",
            kind: "candidate",
            benchmarkId: "bm-test",
            identity: "b".repeat(64),
            candidateId: "cand-alpha",
            provider: "openai-compatible",
            model: "cand-alpha",
            reasoningProfile: "none",
            cacheHit: false,
            status: "FAILED",
            outcome: "FAIL",
            repairRound: 0,
            repairContextHash: "c".repeat(64),
            schemaValid: false,
            expectedOutputsComplete: false,
            hardValidators: {status: "FAIL", failures: []},
            factualContract: {
              status: "PASS",
              claimIds: [],
              unsupportedClaimIds: [],
              unsupportedClaimCount: 0,
              claimCoverage: 0,
            },
            downstreamCritic: {
              status: "not-evaluated",
              score: null,
              verdict: null,
              blockerCount: 0,
              detail: "not run",
            },
            latencyMs: 1,
            attempt: 1,
            retryCount: 0,
            usage: {inputTokens: null, outputTokens: null, totalTokens: null},
            outputArtifacts: [],
            outputHashes: [],
            outputLength: 0,
            failureDetail: "网络请求失败（1 次尝试，30000ms 超时）",
            promotionEligible: false,
            ineligibilityReasons: ["schema-invalid"],
          },
        ],
        pairwise: [],
        eligibleCandidateIds: [],
        automaticPromotion: false,
        promotionRequires: "explicit-config-or-human-decision",
        canonicalUnchanged: true,
        humanReview: {notes: null, preferredCandidateId: null, decisionId: null},
      },
    })[0];
    expect(diagnosis?.code).toBe("transport-timeout");
    const applied = await applyAuthorizedRepair({
      repoRoot,
      episodeId,
      runId: "timeout-write",
      diagnosis: diagnosis!,
      promptPath: `content/${episodeId}/prompts/script-writer.md`,
      config,
    });
    expect(applied.runtimeOverride).toBe(false);
    expect(applied.files).toContain("config/role-model-benchmark.json");
    const written = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "config/role-model-benchmark.json"), "utf8"),
    ) as {candidates: Record<string, {timeoutMs: number; maxRetries: number}>};
    expect(written.candidates["cand-alpha"]?.timeoutMs).toBe(300_000);
    expect(written.candidates["cand-alpha"]?.maxRetries).toBe(0);
    const {repoRoot: memoryRoot} = setup();
    const memoryOnly = planCatalogRepair({
      repoRoot: memoryRoot,
      diagnosis: diagnosis!,
      promptPath: `content/${episodeId}/prompts/script-writer.md`,
      config: benchmarkConfig(),
    });
    expect(memoryOnly.runtimeOverride).toBe(true);
    expect(memoryOnly.files).toEqual([]);
  });
});
