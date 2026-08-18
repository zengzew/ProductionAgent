import fs from "node:fs";
import {describe, expect, it} from "vitest";
import {polishJudgeSchema} from "../src/lib/editorial/polish";
import {findOralReviewDecisionErrors, parseOralReviewGate} from "../src/lib/editorial/story";

const hash = "a".repeat(64);

const wrapGate = (gate: unknown): string =>
  `<!-- oral-review-gate\n${JSON.stringify(gate, null, 2)}\n-->`;

const passingCheck = (locator: string) => ({
  result: "PASS",
  evidence: [{locator, observation: "已按该检查项核对，未发现阻断问题。"}],
});

const requiredChecks = [
  "translatedSyntax",
  "sourceAttributionLanguage",
  "productStageLanguage",
  "turnDirection",
  "sentenceCadence",
  "spokenBreath",
  "informationFidelity",
] as const;

type CheckName = (typeof requiredChecks)[number];
type CalibrationScores = {
  chineseNaturalness: number;
  spokenDelivery: number;
  informationFidelity: number;
};
type PreflightScores = {
  translationese: number;
  spokenChinese: number;
  informationFidelity: number;
};
type CalibrationCase = {
  id: string;
  kind: string;
  draft: string;
  candidate: string;
  decisionRule: string;
  formal: {
    scores: CalibrationScores;
    failChecks: CheckName[];
    blockers: string[];
    verdict: "PASS" | "REJECT";
    returnTo: "none" | "oral-rewriter";
  };
  preflight: {
    scores: PreflightScores;
    failChecks: CheckName[];
    verdict: "pass" | "rewrite";
  };
};
type CalibrationFixture = {
  fixtureVersion: string;
  rubricVersion: string;
  promptVersion: string;
  formalMinimumScore: number;
  polishJudgeRubricVersion: string;
  polishThresholds: PreflightScores;
  cases: CalibrationCase[];
};

const calibrationFixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/oral-judge-calibration.json", import.meta.url), "utf8"),
) as CalibrationFixture;

const v2Gate = {
  rubricVersion: "oral-review-v2",
  promptVersion: "oral-judge-v2",
  reviewedFile: "story/final-script.md",
  reviewedSha256: hash,
  sourceDraftFile: "story/script-draft.md",
  sourceDraftSha256: hash,
  round: 1,
  scores: {
    chineseNaturalness: 5,
    spokenDelivery: 5,
    informationFidelity: 5,
  },
  minimumScore: 4,
  checks: {
    translatedSyntax: passingCheck("seg-001"),
    sourceAttributionLanguage: passingCheck("seg-002"),
    productStageLanguage: passingCheck("seg-003"),
    turnDirection: passingCheck("seg-004"),
    sentenceCadence: passingCheck("seg-005"),
    spokenBreath: passingCheck("seg-006"),
    informationFidelity: passingCheck("seg-007 / claim-example"),
  },
  styleSamples: [],
  blockers: [],
  verdict: "PASS",
  returnTo: "none",
};

describe("oral-review-v2 rubric gate", () => {
  it("requires auditable evidence for every natural-Chinese check", () => {
    const parsed = parseOralReviewGate(wrapGate(v2Gate));

    expect(parsed.rubricVersion).toBe("oral-review-v2");
    if (parsed.rubricVersion !== "oral-review-v2") throw new Error("expected v2 gate");
    expect(Object.values(parsed.checks).every((check) => check.result === "PASS")).toBe(true);
    expect(findOralReviewDecisionErrors(parsed)).toEqual([]);
  });

  it("rejects a v2 check without locator evidence", () => {
    const invalidGate = structuredClone(v2Gate);
    invalidGate.checks.turnDirection.evidence = [];

    expect(() => parseOralReviewGate(wrapGate(invalidGate))).toThrow();
  });

  it("continues to parse immutable v1 reports as legacy artifacts", () => {
    const parsed = parseOralReviewGate(
      wrapGate({
        rubricVersion: "oral-review-v1",
        reviewedFile: "story/final-script.md",
        reviewedSha256: hash,
        sourceDraftFile: "story/script-draft.md",
        sourceDraftSha256: hash,
        round: 1,
        scores: {
          chineseNaturalness: 4,
          spokenDelivery: 4,
          informationFidelity: 4,
        },
        minimumScore: 4,
        styleSamples: [],
        blockers: [],
        verdict: "PASS",
        returnTo: "none",
      }),
    );

    expect(parsed.rubricVersion).toBe("oral-review-v1");
  });

  it("rejects inconsistent v2 decisions and enforces round-three escalation", () => {
    const invalidGate = structuredClone(v2Gate);
    invalidGate.round = 3;
    invalidGate.checks.turnDirection.result = "FAIL";
    invalidGate.scores.spokenDelivery = 3;
    invalidGate.verdict = "REJECT";
    invalidGate.returnTo = "oral-rewriter";

    const parsed = parseOralReviewGate(wrapGate(invalidGate));
    expect(findOralReviewDecisionErrors(parsed)).toEqual([
      "Oral Judge v2 失败检查缺少 blocker：turnDirection",
      "Oral Judge 第三轮 REJECT 必须交给 human-editor",
    ]);
  });

  it("keeps both oral prompts aligned with the current rubric", () => {
    const judgePrompt = fs.readFileSync(
      new URL("../agents/oral-judge.md", import.meta.url),
      "utf8",
    );
    const rewriterPrompt = fs.readFileSync(
      new URL("../agents/oral-rewriter.md", import.meta.url),
      "utf8",
    );
    expect(judgePrompt).toContain('"rubricVersion": "oral-review-v2"');
    expect(judgePrompt).toContain('"promptVersion": "oral-judge-v2"');
    expect(requiredChecks.every((check) => judgePrompt.includes(`"${check}"`))).toBe(true);
    expect(rewriterPrompt).toContain("`oral-review-v2`");
  });

  it("locks calibration versions and existing thresholds", () => {
    const polishConfig = JSON.parse(
      fs.readFileSync(new URL("../config/polish-v2.json", import.meta.url), "utf8"),
    ) as {
      judgeRubricVersion: string;
      thresholds: PreflightScores;
    };

    expect(calibrationFixture.fixtureVersion).toBe("oral-judge-calibration-v1");
    expect(calibrationFixture.rubricVersion).toBe("oral-review-v2");
    expect(calibrationFixture.promptVersion).toBe("oral-judge-v2");
    expect(calibrationFixture.formalMinimumScore).toBe(4);
    expect(calibrationFixture.polishJudgeRubricVersion).toBe("polish-judge-v2");
    expect(polishConfig.judgeRubricVersion).toBe(calibrationFixture.polishJudgeRubricVersion);
    expect(polishConfig.thresholds).toEqual(calibrationFixture.polishThresholds);
  });

  it("covers the three required calibration boundaries", () => {
    expect(calibrationFixture.cases.map(({kind}) => kind)).toEqual([
      "local-awkwardness",
      "translated-subject",
      "information-scope",
    ]);
  });

  it.each(calibrationFixture.cases)(
    "keeps the formal verdict stable for $id",
    (calibrationCase) => {
      const failed = new Set(calibrationCase.formal.failChecks);
      const gate = {
        ...structuredClone(v2Gate),
        scores: calibrationCase.formal.scores,
        checks: Object.fromEntries(
          requiredChecks.map((check) => [
            check,
            {
              result: failed.has(check) ? "FAIL" : "PASS",
              evidence: [
                {
                  locator: `${calibrationCase.id} / 原句：${calibrationCase.candidate}`,
                  observation: calibrationCase.decisionRule,
                },
              ],
            },
          ]),
        ),
        blockers: calibrationCase.formal.blockers,
        verdict: calibrationCase.formal.verdict,
        returnTo: calibrationCase.formal.returnTo,
      };

      const first = parseOralReviewGate(wrapGate(gate));
      const repeated = parseOralReviewGate(wrapGate(gate));

      expect(repeated).toEqual(first);
      expect(first.minimumScore).toBe(4);
      expect(first.verdict).toBe(calibrationCase.formal.verdict);
      expect(findOralReviewDecisionErrors(first)).toEqual([]);
    },
  );

  it.each(calibrationFixture.cases)(
    "keeps the polish preflight verdict stable for $id",
    (calibrationCase) => {
      const failed = new Set(calibrationCase.preflight.failChecks);
      const judge = polishJudgeSchema.parse({
        scores: calibrationCase.preflight.scores,
        checks: Object.fromEntries(
          requiredChecks.map((check) => [
            check,
            {
              result: failed.has(check) ? "fail" : "pass",
              evidence: [
                {segmentId: calibrationCase.id, observation: calibrationCase.decisionRule},
              ],
            },
          ]),
        ),
        issues: [calibrationCase.decisionRule],
        verdict: calibrationCase.preflight.verdict,
      });
      const passes =
        judge.verdict === "pass" &&
        Object.values(judge.checks).every((check) => check.result === "pass") &&
        judge.scores.translationese >= calibrationFixture.polishThresholds.translationese &&
        judge.scores.spokenChinese >= calibrationFixture.polishThresholds.spokenChinese &&
        judge.scores.informationFidelity >= calibrationFixture.polishThresholds.informationFidelity;

      expect(passes).toBe(calibrationCase.preflight.verdict === "pass");
    },
  );

  it("publishes every executable fixture in the formal and preflight instructions", () => {
    const calibrationArtifacts = [
      "../docs/contracts/evaluation-rubric.md",
      "../agents/oral-judge.md",
      "../prompts/v3/judge-system.md",
    ].map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));

    for (const artifact of calibrationArtifacts) {
      expect(artifact).toContain(calibrationFixture.fixtureVersion);
      for (const calibrationCase of calibrationFixture.cases) {
        expect(artifact).toContain(calibrationCase.id);
        expect(artifact.replace(/\s+/gu, "")).toContain(
          calibrationCase.candidate.replace(/\s+/gu, ""),
        );
      }
    }

    const judgeUserPrompt = fs.readFileSync(
      new URL("../prompts/v3/judge-user.md", import.meta.url),
      "utf8",
    );
    expect(judgeUserPrompt).toContain("局部拗口但不需要听众修复主语或事实口径");
    expect(judgeUserPrompt).toContain("时间或指标口径存在两种读法");
  });
});
