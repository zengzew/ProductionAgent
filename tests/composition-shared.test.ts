import {describe, expect, it} from "vitest";
import {reportingIdentity, sourcePublishers} from "../src/compositions/shared";

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
