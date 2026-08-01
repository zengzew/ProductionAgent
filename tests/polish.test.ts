import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {evaluateHardConstraints, selectStyleSamples} from "../src/lib/polish";
import {polishStyleSchema} from "../src/lib/pipeline-v2-config";
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
  maxSentenceChars: 20,
  bannedTerms: ["总而言之"],
  protectedTerms: {Poke: ["AI 助手"], Recipe: ["分享功能"], Cognition: ["公司"]},
  numberReading: {rejectArabicDigits: true, examples: []},
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
});
