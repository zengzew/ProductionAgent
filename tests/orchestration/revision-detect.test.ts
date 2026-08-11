import {describe, expect, it} from "vitest";
import {
  assessBestRestoration,
  assessRevision,
  canDispatchRevision,
  checkRevisionBudget,
  createRevisionLedger,
  detectNoProgress,
  detectOscillation,
  detectRegression,
  recordRevisionAttempt,
  strategyForNextDispatch,
} from "../../src/orchestration";
import type {CriticIssue, CriticName, CriticResult} from "../../src/orchestration";
import {
  allPassingCriticResultsFixture,
  criticIssueFixture,
  criticResultFixture,
} from "../helpers/critics";
import {revisionArtifactFixture, revisionAttemptFixture} from "../helpers/revisions";

const ref = revisionArtifactFixture;

const issue = (
  id: string,
  severity: CriticIssue["severity"],
  status: CriticIssue["status"] = "open",
): CriticIssue =>
  criticIssueFixture({
    id,
    category: "script.fact-accuracy",
    severity,
    status,
    artifact: ref("script", "a".repeat(64)),
  });

const result = (
  critic: CriticName,
  overrides: {
    scores?: Partial<Record<string, number>>;
    verdict?: "PASS" | "REJECT";
    issues?: CriticIssue[];
    passedThresholds?: boolean;
    rubricVersion?: string;
    dimensionFloors?: Record<string, number>;
  } = {},
): CriticResult =>
  criticResultFixture({
    critic,
    episodeId: "episode-revision",
    reviewedArtifacts: [ref("script", "a".repeat(64))],
    ...overrides,
  });

const allPassing = (): CriticResult[] => allPassingCriticResultsFixture("episode-revision");
const attempt = revisionAttemptFixture;

describe("WP-M2-05 revision detection", () => {
  it("REVISION-002 rejects a higher-total candidate with a new fact blocker", () => {
    const before = allPassing();
    const factBlocker = issue("issue-fact-blocker", "blocker");
    const candidate = allPassing().map((item) =>
      item.critic === "audience-critic"
        ? result(item.critic, {scores: {hook: 14}, verdict: "PASS"})
        : item.critic === "fact-guardian"
          ? result(item.critic, {
              issues: [factBlocker],
              verdict: "REJECT",
              passedThresholds: false,
            })
          : item,
    );
    const report = detectRegression({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "b".repeat(64), 2)],
      beforeEvaluations: before,
      candidateEvaluations: candidate,
    });
    expect(report.rejected).toBe(true);
    expect(report.hard.some((finding) => finding.code === "new-blocker")).toBe(true);
  });

  it("REVISION-003 records an Audience dimension regression even above threshold", () => {
    const candidate = allPassing().map((item) =>
      item.critic === "audience-critic"
        ? result(item.critic, {scores: {hook: 11}, verdict: "PASS"})
        : item,
    );
    const report = detectRegression({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "b".repeat(64), 2)],
      beforeEvaluations: allPassing(),
      candidateEvaluations: candidate,
    });
    expect(report.score.some((finding) => finding.code === "dimension-drop")).toBe(true);
    expect(report.rejected).toBe(true);
  });

  it("REVISION-004 detects equal artifact hashes despite a changed report", () => {
    const report = detectNoProgress({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "a".repeat(64), 2)],
      targetIssueIds: ["issue-target"],
      beforeIssues: [issue("issue-target", "high")],
      candidateIssues: [issue("issue-target", "high")],
    });
    expect(report.detected).toBe(true);
    expect(report.reasons).toContain("artifact-hashes-unchanged");
    expect(report.reasons).toContain("targeted-issue-unchanged");
  });

  it("REVISION-005 marks different rubric versions incomparable", () => {
    const report = detectRegression({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "b".repeat(64), 2)],
      beforeEvaluations: [result("audience-critic")],
      candidateEvaluations: [result("audience-critic", {rubricVersion: "product-story-v5"})],
    });
    expect(report.comparable).toBe(false);
    expect(report.incomparableCritics).toEqual(["audience-critic"]);
    expect(report.score).toEqual([]);
  });

  it("treats changed dimension floors as an incomparable rubric", () => {
    const before = result("audience-critic");
    const candidate = result("audience-critic", {
      dimensionFloors: {...before.evaluation.dimensionFloors, hook: 10},
    });
    const report = detectRegression({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "b".repeat(64), 2)],
      beforeEvaluations: [before],
      candidateEvaluations: [candidate],
    });

    expect(report.comparable).toBe(false);
    expect(report.incomparableCritics).toEqual(["audience-critic"]);
    expect(report.findings).toEqual([]);
  });

  it("rejects protected-constraint evidence with a same-id but different hash", () => {
    const protectedRef = ref("script", "a".repeat(64));
    const mismatchedEvidence = ref("script", "b".repeat(64));
    const report = detectRegression({
      before: [protectedRef],
      candidate: [ref("script", "c".repeat(64), 2)],
      beforeEvaluations: allPassing(),
      candidateEvaluations: allPassing(),
      protectedConstraints: [
        {
          id: "constraint-story-question",
          artifactRefs: [protectedRef],
          candidateEvidence: [mismatchedEvidence],
        },
      ],
    });

    expect(report.hard.some((finding) => finding.code === "protected-constraint-mismatch")).toBe(
      true,
    );
  });

  it("REVISION-006 warns on A to B to A and retains the best", () => {
    const report = detectOscillation(["A", "B", "A"]);
    expect(report.action).toBe("warn");
    expect(report.retainBest).toBe(true);
    expect(report.reasons).toEqual(["hash-cycle"]);
  });

  it("REVISION-007 escalates on A to B to A to B", () => {
    const report = detectOscillation(["A", "B", "A", "B"]);
    expect(report.action).toBe("escalate");
    expect(report.retainBest).toBe(true);
  });

  it("REVISION-008 escalates when issue and route cycles add a second signature", () => {
    const report = detectOscillation([
      {
        signature: "A",
        issues: [{id: "issue-a", status: "open", locator: "line:1"}],
        route: "writer",
      },
      {
        signature: "B",
        issues: [{id: "issue-a", status: "resolved", locator: "line:1"}],
        route: "oral",
      },
      {
        signature: "C",
        issues: [{id: "issue-a", status: "open", locator: "line:1"}],
        route: "writer",
      },
      {signature: "D", route: "oral"},
      {signature: "E", route: "writer"},
    ]);
    expect(report.reasons).toContain("issue-cycle");
    expect(report.reasons).toContain("route-cycle");
    expect(report.action).toBe("escalate");
  });

  it("REVISION-009 exhausts creative budget after the third valid rejection", () => {
    let ledger = createRevisionLedger({
      episodeId: "episode-revision",
      baselineId: "b".repeat(64),
    });
    for (const index of [1, 2, 3]) {
      ledger = recordRevisionAttempt(ledger, {
        attempt: {...attempt(`r${index}`), revisionId: `r${index}`},
        budgetKind: "creative",
      });
    }
    expect(ledger.budgets.creativeRoundsUsed).toBe(3);
    expect(canDispatchRevision(ledger, "creative")).toBe(false);
    expect(strategyForNextDispatch(ledger.budgets.creativeRoundsUsed)).toBe(4);
    expect(() => recordRevisionAttempt(ledger, {attempt: attempt("r4")})).toThrow(
      /REVISION_BUDGET_EXHAUSTED/u,
    );
  });

  it("REVISION-010 does not charge invalid or quarantined attempts", () => {
    let ledger = createRevisionLedger({
      episodeId: "episode-revision",
      baselineId: "b".repeat(64),
    });
    ledger = recordRevisionAttempt(ledger, {
      attempt: attempt("invalid-1", "quarantined"),
      budgetKind: "creative",
      valid: false,
    });
    expect(ledger.budgets.creativeRoundsUsed).toBe(0);
    expect(checkRevisionBudget(ledger, "creative").remaining).toBe(3);
  });

  it("REVISION-011 reports a stale reviewed best without restoring it", () => {
    const oldBest = ref("script", "a".repeat(64));
    const current = ref("script", "b".repeat(64), 2);
    const currentFacts = ref("facts", "d".repeat(64), 2);
    const bestRestoration = assessBestRestoration({
      best: [oldBest],
      currentArtifacts: [oldBest, currentFacts],
      dependencies: {
        [oldBest.artifactId]: [
          {
            artifactId: currentFacts.artifactId,
            path: currentFacts.path,
            sha256: "c".repeat(64),
            relation: "reads",
          },
        ],
      },
    });
    expect(bestRestoration.restorable).toBe(false);
    expect(bestRestoration.staleArtifactIds).toEqual([oldBest.artifactId]);
    const report = detectRegression({
      before: [oldBest],
      candidate: [current],
      beforeEvaluations: allPassing(),
      candidateEvaluations: allPassing(),
      currentArtifacts: [current],
    });
    expect(report.hard.some((finding) => finding.code === "reviewed-artifact-stale")).toBe(true);
    const ledger = createRevisionLedger({
      episodeId: "episode-revision",
      baselineId: "b".repeat(64),
      best: {[oldBest.artifactId]: oldBest},
    });
    expect(ledger.best[oldBest.artifactId]?.sha256).toBe(oldBest.sha256);
    expect(ledger.selected[oldBest.artifactId]).toBeUndefined();
  });

  it("combines detection, quarantine and human escalation without consuming invalid budget", () => {
    const assessment = assessRevision({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "a".repeat(64), 2)],
      beforeEvaluations: allPassing(),
      candidateEvaluations: allPassing(),
      validAttempt: false,
    });
    expect(assessment.disposition).toBe("quarantined");
    expect(assessment.requiresHuman).toBe(false);

    const oscillating = assessRevision({
      before: [ref("script", "a".repeat(64))],
      candidate: [ref("script", "b".repeat(64), 2)],
      history: ["A", "B", "A", "B"],
      ledger: createRevisionLedger({
        episodeId: "episode-revision",
        baselineId: "b".repeat(64),
      }),
    });
    expect(oscillating.disposition).toBe("human-required");
  });
});
