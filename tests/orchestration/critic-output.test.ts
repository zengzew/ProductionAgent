import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {
  addCriticEnvelope,
  assertNoEvaluationDrift,
  criticResultSchema,
  recomputeAudienceHook,
  recomputeCriticEvaluation,
  recomputeDeliveryHardRules,
  validateCriticResult,
  type CriticIssue,
  type CriticName,
} from "../../src/orchestration";
import {parseDeliveryGate} from "../../src/lib/delivery";
import {
  parseCriticGate,
  parseFactCheckGate,
  parseOralReviewGate,
  parseRetentionGate,
} from "../../src/lib/story";
import {productionContract} from "../../src/lib/production-contract";
import {artifactFixture} from "../helpers/artifacts";
import {criticIssueFixture, criticScoresFixture, criticVersionFixture} from "../helpers/critics";

const artifact = artifactFixture({logicalName: "final-script"});
const issue = (critic: CriticName, category: CriticIssue["category"]) =>
  criticIssueFixture({critic, category, severity: "blocker", artifact});
const criticNames = [
  "oral-judge",
  "audience-critic",
  "fact-guardian",
  "retention-critic",
  "compliance-critic",
  "delivery-critic",
] as const satisfies readonly CriticName[];

describe("M2.1 critic output and evaluation", () => {
  it.each(criticNames)("recomputes the %s rubric", (critic) => {
    const result = recomputeCriticEvaluation({
      critic,
      rubricVersion: criticVersionFixture(critic),
      dimensions: criticScoresFixture(critic),
      issues: [],
    });
    expect(result.verdict).toBe("PASS");
    expect(result.evaluation.passedThresholds).toBe(true);
  });

  it("enforces Audience hook arithmetic, floors, and Delivery hard boundaries", () => {
    expect(recomputeAudienceHook({zeroBackgroundComprehension: 8, continuationQuestion: 7})).toBe(
      15,
    );
    const lowFloor = recomputeCriticEvaluation({
      critic: "oral-judge",
      rubricVersion: "oral-review-v2",
      dimensions: criticScoresFixture("oral-judge").map((dimension) =>
        dimension.id === "informationFidelity"
          ? {...dimension, score: 3}
          : {...dimension, score: 5},
      ),
      issues: [issue("oral-judge", "oral.information-fidelity")],
    });
    expect(lowFloor).toMatchObject({verdict: "REJECT", evaluation: {normalizedTotal: 86.666667}});
    expect(
      recomputeDeliveryHardRules({
        durationSeconds: productionContract.delivery.hardMaximumSeconds - 0.001,
        microCueRatio: productionContract.captions.microCueRatioLimit,
      }).passed,
    ).toBe(true);
    expect(
      recomputeDeliveryHardRules({
        durationSeconds: productionContract.delivery.minimumSeconds,
        microCueRatio: productionContract.captions.microCueRatioLimit,
      }).passed,
    ).toBe(true);
    expect(
      recomputeDeliveryHardRules({
        durationSeconds: productionContract.delivery.hardMaximumSeconds,
        microCueRatio: productionContract.captions.microCueRatioLimit,
      }).passed,
    ).toBe(true);
    expect(
      recomputeDeliveryHardRules({
        durationSeconds: productionContract.delivery.minimumSeconds - 0.001,
        microCueRatio: productionContract.captions.microCueRatioLimit,
      }).failures,
    ).toEqual(["delivery.duration-render"]);
    expect(
      recomputeDeliveryHardRules({
        durationSeconds: productionContract.delivery.hardMaximumSeconds + 0.001,
        microCueRatio: productionContract.captions.microCueRatioLimit + 0.000001,
      }).failures,
    ).toEqual(["delivery.duration-render", "delivery.caption-timing"]);
  });

  it("enforces the Compliance Critic binary profile", () => {
    const complianceIssue = issue("compliance-critic", "compliance.advertising-language");
    const result = recomputeCriticEvaluation({
      critic: "compliance-critic",
      rubricVersion: "compliance-critic-v1",
      dimensions: criticScoresFixture("compliance-critic").map((dimension) =>
        dimension.id === "advertisingLanguage" ? {...dimension, score: 0} : dimension,
      ),
      issues: [complianceIssue],
    });
    expect(result.verdict).toBe("REJECT");
    expect(result.blockers).toEqual([complianceIssue.id]);
    expect(result.evaluation.normalizedTotal).toBe(65);
  });

  it("rejects model-authored arithmetic and validates issue structure", () => {
    const computed = recomputeCriticEvaluation({
      critic: "audience-critic",
      rubricVersion: "product-story-v4",
      dimensions: criticScoresFixture("audience-critic"),
      issues: [],
    });
    const result = {
      schemaVersion: "critic-output-v1" as const,
      episodeId: "episode-test",
      executionId: "exec-critic-1",
      critic: "audience-critic" as const,
      round: 1,
      rubricVersion: "product-story-v4",
      reviewedArtifacts: [artifact],
      ...computed,
      issues: [],
      primaryRoute: null,
      returnTo: "none",
    };
    expect(validateCriticResult(result)).toEqual(result);
    expect(() =>
      validateCriticResult({...result, evaluation: {...result.evaluation, rawTotal: 1}}),
    ).toThrow(/CRITIC_EVALUATION_MISMATCH/u);
    expect(() => criticResultSchema.parse({...result, reviewedArtifacts: []})).toThrow();

    const drifted = {
      ...result,
      executionId: "exec-critic-2",
      evaluation: {
        ...result.evaluation,
        dimensions: result.evaluation.dimensions.map((dimension, index) =>
          index === 0 ? {...dimension, score: dimension.score - 1} : dimension,
        ),
      },
    };
    expect(() => assertNoEvaluationDrift(result, drifted)).toThrow(/CRITIC_EVALUATION_DRIFT/u);
  });

  it("keeps additive envelopes compatible with the current legacy parser", () => {
    const legacy = {
      rubricVersion: "product-story-v4",
      reviewedFile: "story/final-script.md",
      reviewedSha256: artifact.sha256,
      round: 1,
      scores: {
        hook: 13,
        conflict: 13,
        humanElement: 8,
        productClarity: 13,
        growthLogic: 13,
        technologyExplanation: 13,
        naturalChinese: 13,
      },
      hookBreakdown: {zeroBackgroundComprehension: 7, continuationQuestion: 6},
      total: 86,
      threshold: 85,
      viewerExitRisks: [],
      blockers: [],
      verdict: "PASS",
      rewriteRequired: false,
      returnTo: "none",
    } as const;
    const computed = recomputeCriticEvaluation({
      critic: "audience-critic",
      rubricVersion: legacy.rubricVersion,
      dimensions: criticScoresFixture("audience-critic"),
      issues: [],
    });
    const combined = addCriticEnvelope(legacy, {
      schemaVersion: "critic-output-v1",
      episodeId: "episode-test",
      executionId: "exec-critic-legacy",
      critic: "audience-critic",
      round: 1,
      rubricVersion: legacy.rubricVersion,
      reviewedArtifacts: [artifact],
      ...computed,
      issues: [],
      primaryRoute: null,
      returnTo: "none",
    });
    const parsed = parseCriticGate(`<!-- critic-gate\n${JSON.stringify(combined)}\n-->`);
    expect(parsed).toEqual(legacy);
  });

  it("keeps every historical critic reader compatible with additive structured fields", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const cases = [
      ["oral-review", "story/oral-review.md", parseOralReviewGate],
      ["critic", "story/critic-report.md", parseCriticGate],
      ["fact-check", "story/fact-check-report.md", parseFactCheckGate],
      ["retention", "story/retention-report.md", parseRetentionGate],
      ["delivery", "production/delivery-critic-report.md", parseDeliveryGate],
    ] as const;
    for (const [marker, relativePath, parser] of cases) {
      const markdown = fs.readFileSync(
        path.join(repoRoot, "content/episode-001", relativePath),
        "utf8",
      );
      const expression = new RegExp(`<!-- ${marker}-gate\\n([\\s\\S]*?)\\n-->`, "u");
      const raw = expression.exec(markdown)?.[1];
      expect(raw).toBeTruthy();
      const legacy = JSON.parse(raw!);
      const additive = {
        ...legacy,
        schemaVersion: "critic-output-v1",
        executionId: "legacy-compatibility-test",
        reviewedArtifacts: [artifact],
        evaluation: {dimensions: []},
        issues: [],
        primaryRoute: null,
      };
      expect(
        parser(
          markdown.replace(expression, `<!-- ${marker}-gate\n${JSON.stringify(additive)}\n-->`),
        ),
      ).toEqual(legacy);
    }
  });
});
