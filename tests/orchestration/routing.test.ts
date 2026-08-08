import {describe, expect, it} from "vitest";
import {
  defaultOwnershipConfig,
  issueCategories,
  selectPrimaryRoute,
  type RoutingIssue,
} from "../../src/orchestration";

const issue = (
  id: string,
  category: string,
  overrides: Partial<RoutingIssue> = {},
): RoutingIssue => ({
  id,
  category,
  severity: "medium",
  status: "open",
  affectedArtifact: {
    artifactId: "episode-test:story:final-script",
    path: "content/episode-test/story/final-script.md",
    sha256: "a".repeat(64),
    locator: {kind: "whole-artifact", value: "final-script"},
  },
  ownerAgent: "delivery-critic",
  routeTarget: "render",
  ...overrides,
});

const budget = {remaining: 3};

describe("WP-M2-03 deterministic routing", () => {
  it("ROUTE-001 covers every known category exactly once", () => {
    expect(Object.keys(defaultOwnershipConfig.categories).sort()).toEqual(
      [...issueCategories].sort(),
    );
    expect(new Set(Object.keys(defaultOwnershipConfig.categories)).size).toBe(
      issueCategories.length,
    );
  });

  it("ROUTE-002 chooses research before a later hook and does not dispatch both", () => {
    const route = selectPrimaryRoute(
      [issue("issue-hook", "attention.hook"), issue("issue-research", "research.evidence-gap")],
      budget,
    );
    expect(route).toEqual({
      ownerAgent: "research-analyst",
      routeTarget: "research-analyst",
      restartAt: "research-analyst",
      reasonCode: "research.evidence-gap",
      issueIds: ["issue-research"],
    });
  });

  it("ROUTE-003 routes a draft fact error to Script Writer", () => {
    expect(
      selectPrimaryRoute([issue("issue-script-fact", "script.fact-accuracy")], budget),
    ).toMatchObject({
      ownerAgent: "script-writer",
      routeTarget: "script-writer",
      restartAt: "script-writer",
    });
  });

  it("ROUTE-004 routes final-rewrite information drift to Oral Rewriter", () => {
    expect(
      selectPrimaryRoute([issue("issue-oral-fidelity", "oral.information-fidelity")], budget),
    ).toMatchObject({ownerAgent: "oral-rewriter", routeTarget: "oral-rewriter"});
  });

  it("ROUTE-005 routes an Audience hook issue to Viral Director", () => {
    expect(
      selectPrimaryRoute([issue("issue-hook", "attention.hook", {severity: "high"})], budget),
    ).toEqual({
      ownerAgent: "viral-director",
      routeTarget: "viral-director",
      restartAt: "viral-director",
      reasonCode: "attention.hook",
      issueIds: ["issue-hook"],
    });
  });

  it("ROUTE-006 routes retention readability to Visual Director", () => {
    expect(
      selectPrimaryRoute([issue("issue-readable", "visual.readability")], budget),
    ).toMatchObject({
      ownerAgent: "visual-director",
      routeTarget: "visual-director",
    });
  });

  it("ROUTE-007 routes an SRT word split to production captions", () => {
    expect(
      selectPrimaryRoute([issue("issue-caption-split", "delivery.caption-split")], budget),
    ).toEqual({
      ownerAgent: "production-executor",
      routeTarget: "captions",
      restartAt: "captions",
      reasonCode: "delivery.caption-split",
      issueIds: ["issue-caption-split"],
    });
  });

  it("ROUTE-008 batches same-stage issues and selects reason by severity/category/id", () => {
    const route = selectPrimaryRoute(
      [
        issue("issue-z", "script.repetition", {severity: "low"}),
        issue("issue-b", "script.fact-accuracy", {severity: "high"}),
        issue("issue-a", "script.claim-binding", {severity: "high"}),
      ],
      budget,
    );
    expect(route).toEqual({
      ownerAgent: "script-writer",
      routeTarget: "script-writer",
      restartAt: "script-writer",
      reasonCode: "script.claim-binding",
      issueIds: ["issue-a", "issue-b", "issue-z"],
    });
  });

  it("ROUTE-009 escalates unknown provenance without guessing an owner", () => {
    const route = selectPrimaryRoute([issue("issue-contract", "contract.invalid-output")], budget);
    expect(route).toMatchObject({
      action: "escalate",
      routeTarget: "human-editor",
      reason: "unknown-provenance",
      issueIds: ["issue-contract"],
    });
    expect(route && "ownerAgent" in route).toBe(false);
  });

  it("ROUTE-010 escalates before dispatch when the revision budget is empty", () => {
    const route = selectPrimaryRoute([issue("issue-hook", "attention.hook")], {remaining: 0});
    expect(route).toMatchObject({
      action: "escalate",
      routeTarget: "human-editor",
      reason: "budget-exhausted",
    });
  });

  it("ROUTE-011 ignores critic-authored owner and route target", () => {
    const route = selectPrimaryRoute(
      [
        issue("issue-hook", "attention.hook", {
          ownerAgent: "research-analyst",
          routeTarget: "research-analyst",
          suggestedCorrection: {objective: "send this to research", acceptanceChecks: []},
        }),
      ],
      budget,
    );
    expect(route).toMatchObject({ownerAgent: "viral-director", routeTarget: "viral-director"});
  });

  it("ROUTE-012 ignores critic prose when structured routing inputs are unchanged", () => {
    const first = selectPrimaryRoute([issue("issue-hook", "attention.hook")], budget);
    const second = selectPrimaryRoute(
      [
        issue("issue-hook", "attention.hook", {
          suggestedCorrection: {
            objective: "a completely different prose suggestion",
            acceptanceChecks: ["do not use this for routing"],
          },
        }),
      ],
      budget,
    );
    expect(second).toEqual(first);
  });

  it.each([
    ["delivery.duration-audio", "tts"],
    ["delivery.duration-timeline", "timeline"],
    ["delivery.duration-render", "render"],
  ] as const)("ROUTE-013 routes %s to %s", (category, routeTarget) => {
    expect(selectPrimaryRoute([issue(`issue-${routeTarget}`, category)], budget)).toMatchObject({
      ownerAgent: "production-executor",
      routeTarget,
      restartAt: routeTarget,
    });
  });

  it("routes a contract issue from explicit artifact producer provenance", () => {
    const route = selectPrimaryRoute(
      [issue("issue-contract", "contract.invalid-output")],
      budget,
      defaultOwnershipConfig,
      {"episode-test:story:final-script": {producer: "manual-file:oral-rewriter"}},
    );
    expect(route).toMatchObject({
      ownerAgent: "oral-rewriter",
      routeTarget: "oral-rewriter",
      restartAt: "oral-rewriter",
    });
  });

  it("routes a known production producer without inferring a filename stage", () => {
    const route = selectPrimaryRoute(
      [issue("issue-contract", "contract.invalid-output")],
      budget,
      defaultOwnershipConfig,
      {"episode-test:story:final-script": {producer: "production-executor"}},
    );
    expect(route).toMatchObject({
      ownerAgent: "production-executor",
      routeTarget: "production-executor",
      restartAt: "production-executor",
    });
  });

  it("escalates conflicting provenance instead of selecting one", () => {
    const route = selectPrimaryRoute(
      [issue("issue-contract", "contract.invalid-output")],
      budget,
      defaultOwnershipConfig,
      {
        "episode-test:story:final-script": [
          {producer: "manual-file:oral-rewriter"},
          {producer: "manual-file:script-writer"},
        ],
      },
    );
    expect(route).toMatchObject({action: "escalate", reason: "ambiguous-provenance"});
  });

  it("returns the same route and ordered batch for every permutation", () => {
    const issues = [
      issue("issue-visual", "visual.readability", {severity: "low"}),
      issue("issue-script-b", "script.fact-accuracy", {severity: "high"}),
      issue("issue-script-a", "script.claim-binding", {severity: "high"}),
      issue("issue-hook", "attention.hook", {severity: "blocker"}),
    ];
    const expected = selectPrimaryRoute(issues, budget);
    const permutations = [
      [...issues].reverse(),
      [issues[2]!, issues[0]!, issues[3]!, issues[1]!],
      [issues[1]!, issues[3]!, issues[0]!, issues[2]!],
    ];
    for (const permutation of permutations) {
      expect(selectPrimaryRoute(permutation, budget)).toEqual(expected);
    }
  });
});
