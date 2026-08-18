import {describe, expect, it} from "vitest";
import {comparisonGateSchema, parseComparisonGate} from "../src/lib/delivery/comparison";

const comparisonFixture = (verdict: "IMPROVED" | "MIXED" | "NOT_IMPROVED") => ({
  rubricVersion: "director-comparison-v1" as const,
  method: "editorial-retention-proxy" as const,
  baselineVideo: "output/episode-001/baseline.mp4",
  baselineVideoSha256: "a".repeat(64),
  directorVideo: "output/episode-001/director.mp4",
  directorVideoSha256: "b".repeat(64),
  baselineTimeline: "content/episode-001/production/baseline-timeline.json",
  baselineTimelineSha256: "c".repeat(64),
  directorTimeline: "content/episode-001/production/timeline.json",
  directorTimelineSha256: "d".repeat(64),
  dimensions: {
    hookStrength: {baseline: 7, directorCut: 8, evidence: "fixture"},
    storyCoherence: {baseline: 7, directorCut: 8, evidence: "fixture"},
    viewerCuriosity: {baseline: 7, directorCut: 8, evidence: "fixture"},
    productUnderstanding: {baseline: 7, directorCut: 8, evidence: "fixture"},
    visualStorytelling: {baseline: 7, directorCut: 8, evidence: "fixture"},
    retentionPotential: {baseline: 7, directorCut: 8, evidence: "fixture"},
  },
  baselineTotal: 42,
  directorCutTotal: 48,
  verdict,
  limitations: ["Editorial proxy scores do not replace published retention data."],
});

describe("comparison gate", () => {
  it.each(["IMPROVED", "MIXED", "NOT_IMPROVED"] as const)(
    "represents an honest %s verdict",
    (verdict) => {
      expect(comparisonGateSchema.parse(comparisonFixture(verdict)).verdict).toBe(verdict);
    },
  );

  it("keeps existing IMPROVED markdown metadata valid", () => {
    const gate = comparisonFixture("IMPROVED");
    const markdown = `# Comparison\n\n<!-- comparison-gate\n${JSON.stringify(gate)}\n-->`;

    expect(parseComparisonGate(markdown)).toEqual(gate);
  });

  it("rejects an unknown verdict", () => {
    expect(() =>
      comparisonGateSchema.parse({...comparisonFixture("MIXED"), verdict: "BETTER"}),
    ).toThrow();
  });
});
