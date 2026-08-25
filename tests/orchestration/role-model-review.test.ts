import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  applyRoleModelPromotion,
  assignBlindLabels,
  benchmarkResultPath,
  buildArtifactRef,
  buildBlindReviewPackage,
  EMPTY_REPAIR_CONTEXT_HASH,
  hashRepositoryFile,
  loadAgentModelPolicyFile,
  promotionDecisionPath,
  recordRoleModelPromotionDecision,
  resolveRoleModelPolicy,
  reviewPackagePath,
  reviewRevealPath,
  stableJson,
  type BenchmarkCandidateResult,
  type BenchmarkResult,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const createdAt = "2026-08-19T00:00:00.000Z";
const realRepo = path.resolve(import.meta.dirname, "../..");

const draft = (label: string): string => `# Script Draft

## seg-001

- Section: \`hook\`
- Target seconds: \`4\`
- Claim IDs: \`claim-alpha-001\`

### Narration

${label} opens the browser after the task is handed off.
`;

const candidateResult = (input: {
  repoRoot: string;
  episodeId: string;
  benchmarkId: string;
  candidateId: string;
  provider: string;
  model: string;
  eligible: boolean;
  output: string;
}): BenchmarkCandidateResult => {
  const outputPath = `content/${input.episodeId}/rollout/benchmarks/${input.benchmarkId}/${input.candidateId}/story/script-draft.md`;
  const absolute = path.join(input.repoRoot, outputPath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, input.output);
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: `${input.episodeId}:story:script-draft`,
    episodeId: input.episodeId,
    path: outputPath,
    mediaType: "text/markdown",
    schemaVersion: "script-draft-v1",
    producer: `hosted-benchmark:${input.candidateId}`,
    createdAt,
  });
  return {
    schemaVersion: "model-benchmark-v1",
    kind: "candidate",
    benchmarkId: input.benchmarkId,
    identity: "a".repeat(64),
    candidateId: input.candidateId,
    provider: input.provider,
    model: input.model,
    reasoningProfile: "none",
    cacheHit: false,
    status: "SUCCEEDED",
    outcome: input.eligible ? "PASS" : "FAIL",
    repairRound: 0,
    repairContextHash: EMPTY_REPAIR_CONTEXT_HASH,
    schemaValid: true,
    expectedOutputsComplete: true,
    hardValidators: {
      status: input.eligible ? "PASS" : "FAIL",
      failures: input.eligible ? [] : ["unsupported-claim:claim-unknown"],
    },
    factualContract: {
      status: input.eligible ? "PASS" : "FAIL",
      claimIds: ["claim-alpha-001"],
      unsupportedClaimIds: input.eligible ? [] : ["claim-unknown"],
      unsupportedClaimCount: input.eligible ? 0 : 1,
      claimCoverage: 1,
    },
    downstreamCritic: {
      status: "not-evaluated",
      score: null,
      verdict: null,
      blockerCount: 0,
      detail: "not run",
    },
    latencyMs: 12,
    attempt: 1,
    retryCount: 0,
    usage: {inputTokens: 4, outputTokens: 6, totalTokens: 10},
    outputArtifacts: [ref],
    outputHashes: [{artifactId: ref.artifactId, sha256: ref.sha256}],
    outputLength: Buffer.byteLength(input.output, "utf8"),
    failureDetail: null,
    promotionEligible: input.eligible,
    ineligibilityReasons: input.eligible ? [] : ["hard-validator-failed"],
  };
};

const setup = (input?: {eligibleB?: boolean}) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-review-"));
  temporaryDirectories.push(repoRoot);
  fs.cpSync(
    path.join(realRepo, "config/agent-model-policy.json"),
    path.join(repoRoot, "config/agent-model-policy.json"),
  );
  fs.cpSync(
    path.join(realRepo, "config/role-model-benchmark.json"),
    path.join(repoRoot, "config/role-model-benchmark.json"),
  );
  const episodeId = "episode-test";
  const benchmarkId = "bm-review-fixture";
  const a = candidateResult({
    repoRoot,
    episodeId,
    benchmarkId,
    candidateId: "deepseek-v4-flash",
    provider: "openai-compatible",
    model: "deepseek-v4-flash",
    eligible: true,
    output: draft("first"),
  });
  const b = candidateResult({
    repoRoot,
    episodeId,
    benchmarkId,
    candidateId: "qwen3-7-plus",
    provider: "openai-compatible",
    model: "qwen3.7-plus",
    eligible: input?.eligibleB ?? true,
    output: draft("second"),
  });
  const result: BenchmarkResult = {
    schemaVersion: "model-benchmark-v1",
    kind: "result",
    benchmarkId,
    inputHash: "b".repeat(64),
    episodeId,
    agentName: "script-writer",
    policyVersion: "role-model-rollout-v1",
    candidateIds: ["deepseek-v4-flash", "qwen3-7-plus"],
    candidates: [a, b],
    pairwise: [],
    eligibleCandidateIds: [a, b]
      .filter((item) => item.promotionEligible)
      .map((item) => item.candidateId),
    automaticPromotion: false,
    promotionRequires: "explicit-config-or-human-decision",
    canonicalUnchanged: true,
    humanReview: {notes: null, preferredCandidateId: null, decisionId: null},
  };
  const resultPath = path.join(
    repoRoot,
    `content/${episodeId}/rollout/benchmarks/${benchmarkId}/benchmark-result.json`,
  );
  fs.mkdirSync(path.dirname(resultPath), {recursive: true});
  fs.writeFileSync(resultPath, `${stableJson(result)}\n`);
  return {repoRoot, episodeId, benchmarkId, result};
};

describe("script-writer blind review", () => {
  it("hides provider, model, endpoint, and model-bearing candidate ids", () => {
    const {repoRoot, episodeId, benchmarkId} = setup();
    const {review, reveal} = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const serialized = JSON.stringify(review);
    expect(serialized).not.toMatch(/openai|deepseek|qwen|minimax|grok|gpt-5|endpoint|provider/iu);
    expect(serialized).not.toContain("deepseek-v4-flash");
    expect(serialized).not.toContain("qwen3-7-plus");
    expect(review.autoFilled).toBe(false);
    expect(review.purpose).toBe("promotion");
    expect(review.candidates[0]?.scores.clarity).toBeNull();
    expect(review.candidates.map((candidate) => candidate.label).sort()).toEqual(["A", "B"]);
    expect(review.candidates[0]?.output).toContain("opens the browser");
    expect(review.candidates[0]?.claimCoverage).toBe(1);
    expect(reveal.mapping).toHaveLength(2);
    expect(reveal.mapping.map((entry) => entry.candidateId).sort()).toEqual([
      "deepseek-v4-flash",
      "qwen3-7-plus",
    ]);
  });

  it("keeps candidate mapping stable inside one review", () => {
    const {repoRoot, episodeId, benchmarkId, result} = setup();
    const first = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const second = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    expect(first.review.candidates.map((candidate) => candidate.label)).toEqual(
      second.review.candidates.map((candidate) => candidate.label),
    );
    expect(first.reveal.mapping).toEqual(second.reveal.mapping);
    expect(first.review.reviewId).toBe(second.review.reviewId);
    const again = assignBlindLabels(
      result.candidateIds,
      `${result.benchmarkId}:${first.review.benchmarkResultHash}:promotion:${EMPTY_REPAIR_CONTEXT_HASH}`,
    );
    expect(again).toEqual(first.reveal.mapping);
  });
});

describe("promotion review purpose gates", () => {
  it("fails closed when an inspection review is used for promote", () => {
    const {repoRoot, episodeId, benchmarkId} = setup();
    const {review, reveal, reviewPath, revealPath} = buildBlindReviewPackage({
      repoRoot,
      episodeId,
      benchmarkId,
      purpose: "inspection",
    });
    expect(review.purpose).toBe("inspection");
    expect(() =>
      recordRoleModelPromotionDecision({
        repoRoot,
        episodeId,
        benchmarkId,
        reviewer: "editor-1",
        decision: "promote",
        selectedCandidate: review.candidates[0]?.label,
        reason: "inspection must not promote",
        createdAt,
      }),
    ).toThrow(/PROMOTION_REVIEW_REQUIRED/u);

    const decisionPath = path.join(repoRoot, promotionDecisionPath(episodeId, benchmarkId));
    fs.mkdirSync(path.dirname(decisionPath), {recursive: true});
    fs.writeFileSync(
      decisionPath,
      `${stableJson({
        schemaVersion: "role-model-promotion-decision-v1",
        kind: "human-decision",
        decisionId: "decision-inspection-promote",
        benchmarkId,
        role: "script-writer",
        reviewer: "editor-1",
        decision: "promote",
        selectedCandidate: reveal.mapping[0]?.label,
        resolvedCandidateId: reveal.mapping[0]?.candidateId,
        reason: "forged inspection promotion",
        benchmarkResultHash: hashRepositoryFile(
          repoRoot,
          benchmarkResultPath(episodeId, benchmarkId),
        ),
        reviewPackageHash: hashRepositoryFile(repoRoot, reviewPath),
        revealHash: hashRepositoryFile(repoRoot, revealPath),
        createdAt,
      })}\n`,
    );
    expect(() => applyRoleModelPromotion({repoRoot, decisionPath, apply: true})).toThrow(
      /PROMOTION_REVIEW_REQUIRED/u,
    );
  });

  it("fails closed when a diagnostic review is used for promote", () => {
    const {repoRoot, episodeId, benchmarkId, result} = setup();
    const repairedResult: BenchmarkResult = {
      ...result,
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        outcome: "PASS_AFTER_REPAIR",
        repairRound: 1,
        promotionEligible: false,
        ineligibilityReasons: ["repaired-candidate"],
      })),
      eligibleCandidateIds: [],
    };
    const resultFile = path.join(repoRoot, benchmarkResultPath(episodeId, benchmarkId));
    fs.writeFileSync(resultFile, `${stableJson(repairedResult)}\n`);
    const {review, reviewPath, revealPath} = buildBlindReviewPackage({
      repoRoot,
      episodeId,
      benchmarkId,
      purpose: "diagnostic",
    });
    fs.copyFileSync(
      path.join(repoRoot, reviewPath),
      path.join(repoRoot, reviewPackagePath(episodeId, benchmarkId)),
    );
    fs.copyFileSync(
      path.join(repoRoot, revealPath),
      path.join(repoRoot, reviewRevealPath(episodeId, benchmarkId)),
    );
    expect(review.purpose).toBe("diagnostic");
    expect(() =>
      recordRoleModelPromotionDecision({
        repoRoot,
        episodeId,
        benchmarkId,
        reviewer: "editor-1",
        decision: "promote",
        selectedCandidate: review.candidates[0]?.label,
        reason: "diagnostic must not promote",
        createdAt,
      }),
    ).toThrow(/PROMOTION_REVIEW_REQUIRED/u);
  });

  it("does not let one clean candidate enter the manual promotion flow", () => {
    const {repoRoot, episodeId, benchmarkId} = setup({eligibleB: false});
    expect(() => buildBlindReviewPackage({repoRoot, episodeId, benchmarkId})).toThrow(
      /insufficient-comparable-candidates/u,
    );
    const {review} = buildBlindReviewPackage({
      repoRoot,
      episodeId,
      benchmarkId,
      purpose: "inspection",
    });
    expect(() =>
      recordRoleModelPromotionDecision({
        repoRoot,
        episodeId,
        benchmarkId,
        reviewer: "editor-1",
        decision: "promote",
        selectedCandidate: review.candidates[0]?.label,
        reason: "single clean candidate",
        createdAt,
      }),
    ).toThrow(/PROMOTION_REVIEW_REQUIRED/u);
  });
});

describe("promotion HumanDecision", () => {
  it("records a recommendation without changing RoleModelPolicy", () => {
    const {repoRoot, episodeId, benchmarkId} = setup();
    const {review} = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const before = loadAgentModelPolicyFile({repoRoot});
    const {decision, recommendation} = recordRoleModelPromotionDecision({
      repoRoot,
      episodeId,
      benchmarkId,
      reviewer: "editor-1",
      decision: "promote",
      selectedCandidate: review.candidates[0]?.label,
      reason: "clearer hook and tighter claim use",
      createdAt,
    });
    expect(decision.kind).toBe("human-decision");
    expect(decision.decision).toBe("promote");
    expect(decision.selectedCandidate).toBe(review.candidates[0]?.label);
    expect(recommendation?.applied).toBe(false);
    expect(recommendation?.requiresExplicitApply).toBe(true);
    expect(loadAgentModelPolicyFile({repoRoot})).toEqual(before);
    expect(resolveRoleModelPolicy("script-writer", before).mode).toBe("manual");
  });

  it("does not apply promotion without --apply or a HumanDecision", () => {
    const {repoRoot, episodeId, benchmarkId} = setup();
    const {review, reviewPath} = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const {decisionPath} = recordRoleModelPromotionDecision({
      repoRoot,
      episodeId,
      benchmarkId,
      reviewer: "editor-1",
      decision: "promote",
      selectedCandidate: review.candidates[0]?.label,
      reason: "better continuity",
      createdAt,
    });
    const before = fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8");
    const dryRun = applyRoleModelPromotion({repoRoot, decisionPath, apply: false});
    expect(dryRun.applied).toBe(false);
    expect(dryRun.reason).toMatch(/--apply/u);
    expect(fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8")).toBe(
      before,
    );
    expect(() =>
      applyRoleModelPromotion({repoRoot, decisionPath: reviewPath, apply: true}),
    ).toThrow();
  });

  it("blocks a non-promotion review and a tampered benchmark", () => {
    const {repoRoot, episodeId, benchmarkId} = setup({eligibleB: false});
    const {review, reveal} = buildBlindReviewPackage({
      repoRoot,
      episodeId,
      benchmarkId,
      purpose: "inspection",
    });
    const ineligible = reveal.mapping.find((entry) => entry.candidateId === "qwen3-7-plus");
    expect(ineligible).toBeDefined();
    expect(review.purpose).toBe("inspection");
    expect(() =>
      recordRoleModelPromotionDecision({
        repoRoot,
        episodeId,
        benchmarkId,
        reviewer: "editor-1",
        decision: "promote",
        selectedCandidate: ineligible?.label,
        reason: "prefer this draft",
        createdAt,
      }),
    ).toThrow(/PROMOTION_REVIEW_REQUIRED/u);
    const before = fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8");
    expect(fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8")).toBe(
      before,
    );

    const eligibleSetup = setup();
    const eligibleReview = buildBlindReviewPackage({
      repoRoot: eligibleSetup.repoRoot,
      episodeId: eligibleSetup.episodeId,
      benchmarkId: eligibleSetup.benchmarkId,
    });
    const eligible = eligibleReview.reveal.mapping.find(
      (entry) => entry.candidateId === "deepseek-v4-flash",
    );
    const recorded = recordRoleModelPromotionDecision({
      repoRoot: eligibleSetup.repoRoot,
      episodeId: eligibleSetup.episodeId,
      benchmarkId: eligibleSetup.benchmarkId,
      reviewer: "editor-1",
      decision: "promote",
      selectedCandidate: eligible?.label,
      reason: "eligible draft",
      createdAt,
    });
    const eligiblePolicyBefore = fs.readFileSync(
      path.join(eligibleSetup.repoRoot, "config/agent-model-policy.json"),
      "utf8",
    );
    const resultFile = path.join(
      eligibleSetup.repoRoot,
      `content/${eligibleSetup.episodeId}/rollout/benchmarks/${eligibleSetup.benchmarkId}/benchmark-result.json`,
    );
    fs.writeFileSync(
      resultFile,
      `${stableJson({...eligibleSetup.result, inputHash: "c".repeat(64)})}\n`,
    );
    expect(() =>
      applyRoleModelPromotion({
        repoRoot: eligibleSetup.repoRoot,
        decisionPath: recorded.decisionPath,
        apply: true,
      }),
    ).toThrow(/BENCHMARK_RESULT_TAMPERED/u);
    expect(
      fs.readFileSync(path.join(eligibleSetup.repoRoot, "config/agent-model-policy.json"), "utf8"),
    ).toBe(eligiblePolicyBefore);
  });

  it("leaves policy unchanged for reject-all and rerun", () => {
    const {repoRoot, episodeId, benchmarkId} = setup();
    buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const before = fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8");
    for (const verdict of ["reject-all", "rerun"] as const) {
      const {decisionPath} = recordRoleModelPromotionDecision({
        repoRoot,
        episodeId,
        benchmarkId,
        reviewer: "editor-1",
        decision: verdict,
        reason: `${verdict} this set`,
        createdAt,
      });
      const applied = applyRoleModelPromotion({repoRoot, decisionPath, apply: true});
      expect(applied.applied).toBe(false);
      expect(applied.reason).toContain("changes nothing");
      expect(fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8")).toBe(
        before,
      );
    }
  });

  it("updates role model fields only with an explicit promote apply", () => {
    const {repoRoot, episodeId, benchmarkId} = setup();
    const {reveal} = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const selected = reveal.mapping.find((entry) => entry.candidateId === "deepseek-v4-flash");
    const {decisionPath} = recordRoleModelPromotionDecision({
      repoRoot,
      episodeId,
      benchmarkId,
      reviewer: "editor-1",
      decision: "promote",
      selectedCandidate: selected?.label,
      reason: "higher fidelity after blind review",
      createdAt,
    });
    const applied = applyRoleModelPromotion({repoRoot, decisionPath, apply: true});
    expect(applied.applied).toBe(true);
    const policy = loadAgentModelPolicyFile({repoRoot});
    expect(policy.roles["script-writer"]).toMatchObject({
      mode: "manual",
      model: "deepseek-v4-flash-0731",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      timeoutMs: 300_000,
      maxRetries: 0,
      reasoning: {
        profile: "deepseek-v4-flash",
        enable_thinking: true,
        reasoning_effort: "max",
      },
    });
    expect(policy.roles["oral-rewriter"].mode).toBe("manual");
    expect(policy.rollout.hostedLlm).toEqual(["oral-rewriter"]);
    expect(policy.defaults.mode).toBe("manual");
  });
});
