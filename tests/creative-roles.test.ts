import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {
  parseFinalScript,
  parseRetentionGate,
  parseViralStrategyGate,
  parseVisualPlanGate,
} from "../src/lib/editorial/story";
import {parseVisualPlanSections} from "../src/lib/editorial/story-quality";
import {repoRoot} from "../src/lib/episode/paths";

const storyRoot = path.join(repoRoot, "content/episode-002/story");
const readStory = (file: string): string => fs.readFileSync(path.join(storyRoot, file), "utf8");
const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

describe("creative role artifact gates", () => {
  it("binds Viral Director strategy to the approved story inputs", () => {
    const gate = parseViralStrategyGate(readStory("viral-strategy.md"));
    const calculatedTotal = Object.values(gate.scores).reduce((sum, score) => sum + score, 0);

    expect(gate.reviewedFiles.storyBibleSha256).toBe(sha256(readStory("story-bible.md")));
    expect(gate.reviewedFiles.storyAngleSha256).toBe(sha256(readStory("story-angle.md")));
    expect(gate.reviewedFiles.threeActStructureSha256).toBe(
      sha256(readStory("three-act-structure.md")),
    );
    expect(gate.reviewedFiles.hookCandidatesSha256).toBe(sha256(readStory("hook-candidates.md")));
    expect(gate.total).toBe(calculatedTotal);
    expect(gate.total).toBeGreaterThanOrEqual(gate.threshold);
    expect(Object.values(gate.scores).every((score) => score >= 3)).toBe(true);
    expect(gate.verdict).toBe("READY");
  });

  it("requires one complete Visual Director section per script segment", () => {
    const finalScript = readStory("final-script.md");
    const segments = parseFinalScript(finalScript);
    const visualMarkdown = readStory("visual-plan.md");
    const gate = parseVisualPlanGate(visualMarkdown);
    const visual = parseVisualPlanSections(visualMarkdown);

    expect(gate.reviewedSha256).toBe(sha256(finalScript));
    expect(gate.plannedSegments).toBe(segments.length);
    expect(visual.missing).toEqual([]);
    expect(visual.sections.map((section) => section.id)).toEqual(
      segments.map((segment) => segment.id),
    );
    expect(gate.unresolvedAssets).toEqual([]);
    expect(gate.verdict).toBe("READY");
  });

  it("binds Retention Critic predictions to the exact script and visual plan", () => {
    const finalScript = readStory("final-script.md");
    const visualPlan = readStory("visual-plan.md");
    const gate = parseRetentionGate(readStory("retention-report.md"));
    const calculatedTotal = Object.values(gate.scores).reduce((sum, score) => sum + score, 0);

    expect(gate.reviewedSha256).toBe(sha256(finalScript));
    expect(gate.visualPlanSha256).toBe(sha256(visualPlan));
    expect(gate.total).toBe(calculatedTotal);
    expect(gate.total).toBeGreaterThanOrEqual(gate.threshold);
    expect(Object.values(gate.scores).every((score) => score >= 15)).toBe(true);
    expect(gate.blockers).toEqual([]);
    expect(gate.verdict).toBe("PASS");
  });
});
