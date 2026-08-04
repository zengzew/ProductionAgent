import fs from "node:fs";
import {describe, expect, it} from "vitest";
import {findOralReviewDecisionErrors, parseOralReviewGate} from "../src/lib/story";

const hash = "a".repeat(64);

const wrapGate = (gate: unknown): string =>
  `<!-- oral-review-gate\n${JSON.stringify(gate, null, 2)}\n-->`;

const passingCheck = (locator: string) => ({
  result: "PASS",
  evidence: [{locator, observation: "已按该检查项核对，未发现阻断问题。"}],
});

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
    const checks = [
      "translatedSyntax",
      "sourceAttributionLanguage",
      "productStageLanguage",
      "turnDirection",
      "sentenceCadence",
      "spokenBreath",
      "informationFidelity",
    ];

    expect(judgePrompt).toContain('"rubricVersion": "oral-review-v2"');
    expect(judgePrompt).toContain('"promptVersion": "oral-judge-v2"');
    expect(checks.every((check) => judgePrompt.includes(`"${check}"`))).toBe(true);
    expect(rewriterPrompt).toContain("`oral-review-v2`");
  });
});
