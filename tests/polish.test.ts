import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {
  createPolishedCaptionPlan,
  evaluateHardConstraints,
  fillTemplate,
  polishJudgeSchema,
  selectStyleSamples,
} from "../src/lib/polish";
import {loadPolishV2Config, polishStyleSchema, promptText} from "../src/lib/pipeline-v2-config";
import {scriptSchema} from "../src/schemas/episode";

const script = scriptSchema.parse({
  selectedHook: "hook",
  segments: [
    {
      id: "seg-001",
      section: "hook",
      narration: "Poke 是个 AI 助手。Recipe 是它的分享功能。Cognition 是后来收购它的公司。",
      onScreenText: [],
      claimIds: ["claim-1"],
      scene: "demo",
      visualIntent: "demo",
      targetSeconds: 3,
    },
  ],
});
const style = polishStyleSchema.parse({
  schemaVersion: "editorial-text-rules-v1",
  sentenceLength: {
    unit: "unicode-code-points-excluding-whitespace",
    delimitersPattern: "[。！？!?]",
    targetCharacters: 15,
    maximumCharacters: 20,
    enforcementScopes: ["polish"],
  },
  bannedPatterns: [
    {
      id: "template-closing",
      label: "模板收束",
      pattern: "总而言之",
      flags: "u",
      scopes: ["polish", "story", "content"],
      examples: ["总而言之，完成了"],
    },
  ],
  compatibilityExemptions: [],
  protectedTerms: {Poke: ["AI 助手"], Recipe: ["分享功能"], Cognition: ["公司"]},
  numberReading: {
    normalizeForSpeech: true,
    rejectArabicDigits: true,
    enforcementScopes: ["polish"],
    examples: [],
  },
});

describe("polish constraints", () => {
  it("preserves and explains protected terms", () => {
    expect(evaluateHardConstraints(script, script, style).passed).toBe(true);
  });

  it("reports banned terms, missing names and spoken-number violations", () => {
    const candidate = scriptSchema.parse({
      ...script,
      segments: [
        {
          ...script.segments[0],
          narration: "总而言之，Poke 在 2026 年运行了很长很长很长很长很长的一段时间。",
        },
      ],
    });
    const report = evaluateHardConstraints(script, candidate, style);
    expect(report.bannedTermHits).toEqual(["总而言之"]);
    expect(report.missingProtectedTerms).toEqual(["Recipe", "Cognition"]);
    expect(report.arabicDigitHits).toEqual(["2026"]);
    expect(report.longSentences.length).toBeGreaterThan(0);
  });

  it("detects full-width digits after spoken-number normalization", () => {
    const candidate = scriptSchema.parse({
      ...script,
      segments: [{...script.segments[0], narration: "Poke 是个 AI 助手。编号是２０２６。"}],
    });
    expect(evaluateHardConstraints(script, candidate, style).arabicDigitHits).toEqual(["2026"]);
  });

  it("throws on unknown prompt placeholders instead of deleting them", () => {
    expect(() => fillTemplate("{{KNOWN}} {{TYPO}}", {KNOWN: "ok"})).toThrow(/未知占位符.*TYPO/u);
  });

  it("fails before writing a caption plan that downstream validation would reject", () => {
    const candidate = scriptSchema.parse({
      ...script,
      segments: [
        {
          ...script.segments[0],
          narration: "Supercalifragilisticexpialidocious",
        },
      ],
    });
    expect(() => createPolishedCaptionPlan(candidate, 16)).toThrow(/字幕 token 超过 16 字/u);
  });

  it("randomly loads accepted manuscripts and excludes README", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "polish-samples-"));
    try {
      fs.writeFileSync(path.join(directory, "README.md"), "rules");
      fs.writeFileSync(path.join(directory, "approved.md"), "approved sample");
      expect(selectStyleSamples(directory, 2)).toEqual([
        {file: "approved.md", content: "approved sample"},
      ]);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

  it("requires evidence for every polish-judge-v2 natural-Chinese check", () => {
    const pass = (segmentId: string) => ({
      result: "pass",
      evidence: [{segmentId, observation: "已核对。"}],
    });
    const judge = {
      scores: {translationese: 9, spokenChinese: 9, informationFidelity: 10},
      checks: {
        translatedSyntax: pass("seg-001"),
        sourceAttributionLanguage: pass("seg-001"),
        productStageLanguage: pass("seg-001"),
        turnDirection: pass("seg-001"),
        sentenceCadence: pass("seg-001"),
        spokenBreath: pass("seg-001"),
        informationFidelity: pass("seg-001"),
      },
      issues: [],
      verdict: "pass",
    };

    expect(polishJudgeSchema.parse(judge)).toEqual(judge);
    expect(() =>
      polishJudgeSchema.parse({
        ...judge,
        checks: {...judge.checks, turnDirection: {result: "pass", evidence: []}},
      }),
    ).toThrow();
  });

  it("loads the versioned v4 Oral Rewriter bundle with unchanged v2 judge rules", () => {
    const {config, style: currentStyle} = loadPolishV2Config();
    const judgePrompt = promptText(config.prompts.judgeSystem);

    expect(config.promptVersion).toBe("polish-prompt-bundle-v4");
    expect(config.judgeRubricVersion).toBe("polish-judge-v2");
    expect(config.prompts.judgeSystem).toBe("prompts/v3/judge-system.md");
    expect(config.prompts.polishSystem).toBe("prompts/v4/polish-system.md");
    expect(config.prompts.rewriteUser).toBe("prompts/v4/rewrite-user.md");
    expect(promptText(config.prompts.polishSystem)).toContain("editorial-policy-v1");
    expect(judgePrompt).toContain("`oral-review-v2`");
    expect(currentStyle.schemaVersion).toBe("editorial-text-rules-v1");
    expect(currentStyle.bannedPatterns.map((rule) => rule.id)).toEqual(
      expect.arrayContaining(["research-file-identity", "product-stage-beta-user"]),
    );
  });
});
