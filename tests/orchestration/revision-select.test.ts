import {describe, expect, it} from "vitest";
import {selectBest, type RevisionIssue} from "../../src/orchestration";
import type {ArtifactRef, CriticResult} from "../../src/orchestration";

const ref = (artifactId: string, sha256: string, revision = 1): ArtifactRef => ({
  artifactId: `episode-revision:story:${artifactId}`,
  episodeId: "episode-revision",
  path: `content/episode-revision/story/${artifactId}.md`,
  mediaType: "text/markdown",
  schemaVersion: "fixture-v1",
  revision,
  sha256,
  sizeBytes: 1,
  producer: "fixture",
  createdAt: "2026-08-08T00:00:00.000Z",
});

const bestRef = ref("script", "a".repeat(64));
const candidateRef = ref("script", "b".repeat(64), 2);

const issue = (status: RevisionIssue["status"]): RevisionIssue => ({
  id: "issue-target",
  category: "attention.hook",
  severity: "high",
  status,
  affectedArtifact: {
    artifactId: bestRef.artifactId,
    path: bestRef.path,
    sha256: bestRef.sha256,
    locator: {kind: "whole-artifact", value: "script"},
  },
});

const baseScores = {
  hook: 13,
  conflict: 13,
  humanElement: 8,
  productClarity: 13,
  growthLogic: 13,
  technologyExplanation: 13,
  naturalChinese: 13,
};

const maxScores = {
  hook: 15,
  conflict: 15,
  humanElement: 10,
  productClarity: 15,
  growthLogic: 15,
  technologyExplanation: 15,
  naturalChinese: 15,
};

const floors = {
  hook: 9,
  conflict: 9,
  humanElement: 6,
  productClarity: 9,
  growthLogic: 9,
  technologyExplanation: 9,
  naturalChinese: 9,
};

const audienceResult = (
  overrides: {
    scores?: Partial<typeof baseScores>;
    verdict?: "PASS" | "REJECT";
    passedThresholds?: boolean;
    rubricVersion?: string;
  } = {},
): CriticResult => {
  const scores = {...baseScores, ...overrides.scores};
  const ids = Object.keys(scores) as Array<keyof typeof scores>;
  const dimensions = ids.map((id) => ({
    id,
    score: scores[id],
    maxScore: maxScores[id],
    weight: id === "humanElement" ? 0.1 : 0.15,
    evidenceIssueIds: [],
  }));
  const normalizedTotal = Number(
    (
      dimensions.reduce(
        (total, dimension) => total + (dimension.score / dimension.maxScore) * dimension.weight,
        0,
      ) * 100
    ).toFixed(6),
  );
  const issues: CriticResult["issues"] = [];
  return {
    schemaVersion: "critic-output-v1",
    episodeId: "episode-revision",
    executionId: "exec-audience-critic",
    critic: "audience-critic",
    round: 1,
    rubricVersion: overrides.rubricVersion ?? "product-story-v4",
    reviewedArtifacts: [bestRef],
    evaluation: {
      dimensions,
      rawTotal: dimensions.reduce((total, dimension) => total + dimension.score, 0),
      normalizedTotal,
      threshold: 85,
      dimensionFloors: floors,
      passedThresholds: overrides.passedThresholds ?? true,
    },
    issues,
    blockers: [],
    verdict: overrides.verdict ?? "PASS",
    primaryRoute: null,
    returnTo: "none",
  };
};

const selectionInput = (
  candidateEvaluation: CriticResult,
  overrides: Partial<Parameters<typeof selectBest>[0]> = {},
) => ({
  before: [bestRef],
  candidate: [candidateRef],
  beforeEvaluations: [audienceResult()],
  candidateEvaluations: [candidateEvaluation],
  beforeIssues: [issue("open")],
  candidateIssues: [issue("resolved")],
  targetIssueIds: ["issue-target"],
  ...overrides,
});

describe("WP-M2-06 best-version selection", () => {
  it("REVISION-001 selects a candidate that closes the target and Pareto-dominates best", () => {
    const result = selectBest(selectionInput(audienceResult({scores: {hook: 14}})));

    expect(result.selected).toBe(true);
    expect(result.decision).toBe("selected");
    expect(result.best).toEqual([candidateRef]);
    expect(result.targetIssueClosed).toBe(true);
    expect(result.noHardRegression).toBe(true);
    expect(result.protectedDimensionsPreserved).toBe(true);
    expect(result.meaningfulImprovement).toBe(true);
    expect(result.paretoDominates).toBe(true);
  });

  it("REVISION-001 does not let weighted total compensate for a protected dimension regression", () => {
    const candidate = audienceResult({scores: {hook: 15, conflict: 12}});
    expect(candidate.evaluation.normalizedTotal).toBeGreaterThan(
      audienceResult().evaluation.normalizedTotal,
    );

    const result = selectBest(
      selectionInput(candidate, {
        protectedDimensions: ["audience-critic:conflict"],
      }),
    );

    expect(result.selected).toBe(false);
    expect(result.best).toEqual([bestRef]);
    expect(result.protectedDimensionsPreserved).toBe(false);
    expect(result.paretoDominates).toBe(false);
    expect(result.reason).toBe("protected-dimension-regression");
  });

  it("REVISION-001 requires more than target gain when another dimension regresses", () => {
    const result = selectBest(
      selectionInput(audienceResult({scores: {hook: 15, conflict: 12}}), {
        targetGain: 1,
      }),
    );

    expect(result.meaningfulImprovement).toBe(true);
    expect(result.paretoDominates).toBe(false);
    expect(result.selected).toBe(false);
  });

  it("REVISION-001 retains best while the targeted issue remains open", () => {
    const result = selectBest(
      selectionInput(audienceResult({scores: {hook: 14}}), {
        candidateIssues: [issue("open")],
      }),
    );

    expect(result.targetIssueClosed).toBe(false);
    expect(result.selected).toBe(false);
    expect(result.best).toEqual([bestRef]);
  });

  it("REVISION-001 rejects a Pareto improvement that crosses a candidate floor", () => {
    const result = selectBest(
      selectionInput(audienceResult({scores: {hook: 14, humanElement: 5}})),
    );

    expect(result.candidateGatePasses).toBe(false);
    expect(result.selected).toBe(false);
    expect(result.best).toEqual([bestRef]);
  });

  it("REVISION-001 rejects a candidate with a hard gate regression", () => {
    const result = selectBest(
      selectionInput(
        audienceResult({
          scores: {hook: 15},
          verdict: "REJECT",
          passedThresholds: false,
        }),
      ),
    );

    expect(result.selected).toBe(false);
    expect(result.candidateGatePasses).toBe(false);
    expect(result.noHardRegression).toBe(false);
    expect(result.best).toEqual([bestRef]);
  });

  it("REVISION-001 rejects a candidate without a meaningful dimension improvement", () => {
    const result = selectBest(selectionInput(audienceResult()));

    expect(result.selected).toBe(false);
    expect(result.meaningfulImprovement).toBe(false);
    expect(result.paretoDominates).toBe(false);
  });

  it("REVISION-005 keeps the current best when rubric versions are incomparable", () => {
    const result = selectBest(
      selectionInput(audienceResult({scores: {hook: 15}, rubricVersion: "product-story-v5"})),
    );

    expect(result.comparable).toBe(false);
    expect(result.incomparableCritics).toEqual(["audience-critic"]);
    expect(result.decision).toBe("incomparable");
    expect(result.selected).toBe(false);
    expect(result.best).toEqual([bestRef]);
  });
});
