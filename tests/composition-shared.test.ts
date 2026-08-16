import {describe, expect, it} from "vitest";
import {
  EVIDENCE_STAGE_LAYOUT,
  highlightSegments,
  reportingIdentity,
  sourcePublishers,
} from "../src/compositions/shared";

describe("shared composition attribution", () => {
  it("uses inference, company, founder as the reporting identity priority", () => {
    const claims = new Map([
      ["founder", {reportingType: "founder-reported" as const}],
      ["company", {reportingType: "company-reported" as const}],
      ["inference", {reportingType: "inference" as const}],
    ]);
    const labels = {
      inference: "inference",
      company: "company",
      founder: "founder",
      verified: "verified",
    };

    expect(reportingIdentity({claimIds: ["founder", "company"], claimsById: claims, labels})).toBe(
      "company",
    );
    expect(
      reportingIdentity({
        claimIds: ["company", "inference", "founder"],
        claimsById: claims,
        labels,
      }),
    ).toBe("inference");
    expect(reportingIdentity({claimIds: ["founder"], claimsById: claims, labels})).toBe("founder");
    expect(reportingIdentity({claimIds: ["unknown"], claimsById: claims, labels})).toBe("verified");
  });

  it("deduplicates publishers while preserving the configured claim order", () => {
    const claims = new Map([
      ["claim-a", {sourceIds: ["source-a", "source-b"]}],
      ["claim-b", {sourceIds: ["source-b", "source-c"]}],
    ]);
    const sources = new Map([
      ["source-a", {publisher: "A"}],
      ["source-b", {publisher: "B"}],
      ["source-c", {publisher: "C"}],
    ]);

    expect(
      sourcePublishers({
        claimIds: ["claim-a", "claim-b"],
        claimsById: claims,
        sourcesById: sources,
      }),
    ).toBe("A · B · C");
    expect(
      sourcePublishers({
        claimIds: ["claim-a", "claim-b"],
        claimsById: claims,
        sourcesById: sources,
        reverseClaims: true,
      }),
    ).toBe("B · C · A");
  });
});

describe("shared evidence-stage helpers", () => {
  it("keeps a persistent title band above the evidence stage and source bar", () => {
    expect(EVIDENCE_STAGE_LAYOUT.titleTop).toBeLessThan(EVIDENCE_STAGE_LAYOUT.stageTop);
    expect(EVIDENCE_STAGE_LAYOUT.stageBottom).toBeLessThan(EVIDENCE_STAGE_LAYOUT.sourceTop);
    expect(EVIDENCE_STAGE_LAYOUT.sourceTop + EVIDENCE_STAGE_LAYOUT.sourceHeight).toBeLessThan(
      EVIDENCE_STAGE_LAYOUT.height - EVIDENCE_STAGE_LAYOUT.captionBottom,
    );
  });

  it("highlights the longest first-mention fact without splitting a shorter overlap", () => {
    expect(highlightSegments("超过八千万台虚拟电脑", ["八千万", "万"])).toEqual([
      {text: "超过", highlighted: false},
      {text: "八千万", highlighted: true},
      {text: "台虚拟电脑", highlighted: false},
    ]);
    expect(highlightSegments("为什么不聊天，要自己干活？", ["自己干活"])).toEqual([
      {text: "为什么不聊天，要", highlighted: false},
      {text: "自己干活", highlighted: true},
      {text: "？", highlighted: false},
    ]);
    expect(highlightSegments("任务已经发出", [])).toEqual([
      {text: "任务已经发出", highlighted: false},
    ]);
    expect(highlightSegments("", ["八千万"])).toEqual([]);
  });
});
