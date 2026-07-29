import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {episodeRoot} from "../src/lib/project";
import {parseCriticGate, parseFactCheckGate, parseFinalScript} from "../src/lib/story";

const finalScriptPath = path.join(episodeRoot, "story/final-script.md");
const criticReportPath = path.join(episodeRoot, "story/critic-report.md");
const factCheckReportPath = path.join(episodeRoot, "story/fact-check-report.md");

describe("product-story short-video pipeline", () => {
  it("keeps the structured final script inside the 3-5 minute contract", () => {
    const markdown = fs.readFileSync(finalScriptPath, "utf8");
    const segments = parseFinalScript(markdown);
    const totalSeconds = segments.reduce((total, segment) => total + segment.targetSeconds, 0);
    const hookSeconds = segments
      .filter((segment) => segment.section === "hook")
      .reduce((total, segment) => total + segment.targetSeconds, 0);

    expect(segments).toHaveLength(12);
    expect(totalSeconds).toBeGreaterThanOrEqual(180);
    expect(totalSeconds).toBeLessThanOrEqual(300);
    expect(hookSeconds).toBe(20);
    expect(segments.every((segment) => segment.narrationUnits.length > 0)).toBe(true);
  });

  it("binds the critic decision to the exact final script", () => {
    const finalScript = fs.readFileSync(finalScriptPath, "utf8");
    const critic = parseCriticGate(fs.readFileSync(criticReportPath, "utf8"));
    const hash = crypto.createHash("sha256").update(finalScript).digest("hex");
    const total = Object.values(critic.scores).reduce((sum, score) => sum + score, 0);
    const hookTotal =
      critic.hookBreakdown.zeroBackgroundComprehension + critic.hookBreakdown.continuationQuestion;

    expect(critic.reviewedSha256).toBe(hash);
    expect(critic.total).toBe(total);
    expect(critic.scores.hook).toBe(hookTotal);
    expect(critic.hookBreakdown.zeroBackgroundComprehension).toBeGreaterThanOrEqual(6);
    expect(critic.total).toBeGreaterThanOrEqual(critic.threshold);
    expect(critic.blockers).toEqual([]);
    expect(critic.verdict).toBe("PASS");
    expect(critic.rewriteRequired).toBe(false);
  });

  it("binds the independent fact gate to the exact approved script", () => {
    const finalScript = fs.readFileSync(finalScriptPath, "utf8");
    const segments = parseFinalScript(finalScript);
    const factCheck = parseFactCheckGate(fs.readFileSync(factCheckReportPath, "utf8"));
    const hash = crypto.createHash("sha256").update(finalScript).digest("hex");
    const narrationUnits = segments.reduce(
      (count, segment) => count + segment.narrationUnits.length,
      0,
    );

    expect(factCheck.reviewedSha256).toBe(hash);
    expect(factCheck.checkedSegments).toBe(segments.length);
    expect(factCheck.checkedNarrationUnits).toBe(narrationUnits);
    expect(factCheck.blockers).toEqual([]);
    expect(factCheck.verdict).toBe("PASS");
    expect(factCheck.returnTo).toBe("none");
  });
});
