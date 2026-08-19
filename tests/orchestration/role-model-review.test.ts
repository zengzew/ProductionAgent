import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  applyRoleModelPromotion,
  assignBlindLabels,
  buildArtifactRef,
  buildBlindReviewPackage,
  loadAgentModelPolicyFile,
  recordRoleModelPromotionDecision,
  resolveRoleModelPolicy,
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
    cacheHit: false,
    status: "SUCCEEDED",
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
    candidateId: "openai-gpt-5-mini",
    provider: "openai-compatible",
    model: "gpt-5-mini",
    eligible: true,
    output: draft("first"),
  });
  const b = candidateResult({
    repoRoot,
    episodeId,
    benchmarkId,
    candidateId: "deepseek-chat",
    provider: "openai-compatible",
    model: "deepseek-chat",
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
    candidateIds: ["deepseek-chat", "openai-gpt-5-mini"],
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
    expect(serialized).not.toMatch(/openai|deepseek|grok|gpt-5-mini|endpoint|provider/iu);
    expect(serialized).not.toContain("openai-gpt-5-mini");
    expect(serialized).not.toContain("deepseek-chat");
    expect(review.autoFilled).toBe(false);
    expect(review.candidates[0]?.scores.clarity).toBeNull();
    expect(review.candidates.map((candidate) => candidate.label).sort()).toEqual(["A", "B"]);
    expect(review.candidates[0]?.output).toContain("opens the browser");
    expect(review.candidates[0]?.claimCoverage).toBe(1);
    expect(reveal.mapping).toHaveLength(2);
    expect(reveal.mapping.map((entry) => entry.candidateId).sort()).toEqual([
      "deepseek-chat",
      "openai-gpt-5-mini",
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
      `${result.benchmarkId}:${first.review.benchmarkResultHash}`,
    );
    expect(again).toEqual(first.reveal.mapping);
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

  it("blocks an ineligible candidate and a tampered benchmark", () => {
    const {repoRoot, episodeId, benchmarkId, result} = setup({eligibleB: false});
    const {reveal} = buildBlindReviewPackage({repoRoot, episodeId, benchmarkId});
    const ineligible = reveal.mapping.find((entry) => entry.candidateId === "deepseek-chat");
    expect(ineligible).toBeDefined();
    const {decisionPath} = recordRoleModelPromotionDecision({
      repoRoot,
      episodeId,
      benchmarkId,
      reviewer: "editor-1",
      decision: "promote",
      selectedCandidate: ineligible?.label,
      reason: "prefer this draft",
      createdAt,
    });
    const before = fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8");
    expect(() => applyRoleModelPromotion({repoRoot, decisionPath, apply: true})).toThrow(
      /ineligible candidate cannot promote/u,
    );
    expect(fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8")).toBe(
      before,
    );

    const eligible = reveal.mapping.find((entry) => entry.candidateId === "openai-gpt-5-mini");
    const recorded = recordRoleModelPromotionDecision({
      repoRoot,
      episodeId,
      benchmarkId,
      reviewer: "editor-1",
      decision: "promote",
      selectedCandidate: eligible?.label,
      reason: "eligible draft",
      createdAt,
    });
    const resultFile = path.join(
      repoRoot,
      `content/${episodeId}/rollout/benchmarks/${benchmarkId}/benchmark-result.json`,
    );
    fs.writeFileSync(resultFile, `${stableJson({...result, inputHash: "c".repeat(64)})}\n`);
    expect(() =>
      applyRoleModelPromotion({repoRoot, decisionPath: recorded.decisionPath, apply: true}),
    ).toThrow(/BENCHMARK_RESULT_TAMPERED/u);
    expect(fs.readFileSync(path.join(repoRoot, "config/agent-model-policy.json"), "utf8")).toBe(
      before,
    );
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
    const selected = reveal.mapping.find((entry) => entry.candidateId === "deepseek-chat");
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
      model: "deepseek-chat",
      endpoint: "https://api.deepseek.com/v1/chat/completions",
    });
    expect(policy.roles["oral-rewriter"].mode).toBe("manual");
    expect(policy.rollout.hostedLlm).toEqual(["oral-rewriter"]);
    expect(policy.defaults.mode).toBe("manual");
  });
});
