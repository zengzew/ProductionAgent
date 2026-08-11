import {describe, expect, it} from "vitest";
import {selectBest, type CriticResult} from "../../src/orchestration";
import {criticResultFixture} from "../helpers/critics";
import {revisionArtifactFixture, revisionIssueFixture} from "../helpers/revisions";

const bestRef = revisionArtifactFixture("script", "a".repeat(64));
const candidateRef = revisionArtifactFixture("script", "b".repeat(64), 2);

const issue = (status: "open" | "resolved") => revisionIssueFixture({status});

const audienceResult = (
  overrides: {
    scores?: Partial<Record<string, number>>;
    verdict?: "PASS" | "REJECT";
    passedThresholds?: boolean;
    rubricVersion?: string;
  } = {},
): CriticResult =>
  criticResultFixture({
    critic: "audience-critic",
    episodeId: "episode-revision",
    reviewedArtifacts: [bestRef],
    ...overrides,
  });

const selectionInput = (
  candidateEvaluation: CriticResult,
  overrides: Partial<Parameters<typeof selectBest>[0]> = {},
) => ({
  best: [bestRef],
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
