import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  contentCriticNames,
  createInitialProductionState,
  emptyArtifactIndex,
  registerCandidate,
  runContentLoop,
  selectArtifact,
  type ArtifactIndex,
  type ArtifactLocator,
  type ArtifactRef,
  type ContentArtifactRevision,
  type ContentCriticName,
  type ContentCriticOutput,
  type ContentNodeContext,
  type CriticIssue,
} from "../../src/orchestration";
import {routedCriticResultFixture} from "../helpers/critics";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

type Fixture = {
  repoRoot: string;
  initial: ArtifactRef;
  index: ArtifactIndex;
};

const fixture = (): Fixture => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-bounded-loop-"));
  temporaryDirectories.push(repoRoot);
  const relativePath = "content/episode-bounded/story/hook-plan.md";
  fs.mkdirSync(path.dirname(path.join(repoRoot, relativePath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, relativePath), "A\n");
  const initial = buildArtifactRef({
    repoRoot,
    artifactId: "episode-bounded:story:hook-plan",
    episodeId: "episode-bounded",
    path: relativePath,
    mediaType: "text/markdown",
    schemaVersion: "fixture-v1",
    producer: "viral-director",
    createdAt: "2026-08-10T00:00:00.000Z",
  });
  const index = selectArtifact(
    registerCandidate(emptyArtifactIndex(initial.episodeId), initial, "fixture:initial", []),
    initial,
  );
  return {repoRoot, initial, index};
};

const revisionFor = (
  current: Fixture,
  body: string,
  changedLocators?: readonly ArtifactLocator[],
): ContentArtifactRevision => {
  fs.writeFileSync(path.join(current.repoRoot, current.initial.path), `${body}\n`);
  return {
    ref: buildArtifactRef({
      repoRoot: current.repoRoot,
      artifactId: current.initial.artifactId,
      episodeId: current.initial.episodeId,
      path: current.initial.path,
      mediaType: current.initial.mediaType,
      schemaVersion: current.initial.schemaVersion,
      producer: "viral-director",
      previous: current.initial,
      createdAt: "2026-08-10T00:00:01.000Z",
    }),
    changedLocators,
  };
};

const issueFor = (
  ref: ArtifactRef,
  input: {
    id: string;
    category: CriticIssue["category"];
    severity?: CriticIssue["severity"];
    ownerAgent?: CriticIssue["ownerAgent"];
    routeTarget?: CriticIssue["routeTarget"];
  },
): CriticIssue => ({
  id: input.id,
  category: input.category,
  severity: input.severity ?? "high",
  status: "open",
  ownerAgent: input.ownerAgent ?? "viral-director",
  routeTarget: input.routeTarget ?? "viral-director",
  affectedArtifact: {
    artifactId: ref.artifactId,
    path: ref.path,
    sha256: ref.sha256,
    locator: {kind: "whole-artifact", value: "hook-plan"},
  },
  evidence: [
    {
      kind: "artifact-observation",
      observed: "the bounded-loop fixture still fails its named check",
      expected: "the named check passes without regression",
      claimIds: [],
    },
  ],
  suggestedCorrection: {objective: "repair the fixture", acceptanceChecks: ["rerun all critics"]},
  constraintsNotToBreak: [
    {
      id: "fixture-boundary",
      description: "preserve the episode identity",
      artifactRefs: [ref],
      claimIds: [],
    },
  ],
});

type CriticRule = (input: {critic: ContentCriticName; call: number; current: ArtifactRef}) => {
  issues?: CriticIssue[];
  scores?: Partial<Record<string, number>>;
};

const criticNodes = (initial: ArtifactRef, rule: CriticRule) => {
  const calls = Object.fromEntries(contentCriticNames.map((name) => [name, 0])) as Record<
    ContentCriticName,
    number
  >;
  const nodes = Object.fromEntries(
    contentCriticNames.map((critic) => [
      critic,
      async (context: ContentNodeContext): Promise<ContentCriticOutput> => {
        calls[critic] += 1;
        const current = Object.values(context.artifacts).find(
          (ref) => ref.artifactId === initial.artifactId,
        );
        if (!current) throw new Error("bounded fixture artifact missing");
        const configured = rule({critic, call: calls[critic], current});
        const issues = configured.issues ?? [];
        return routedCriticResultFixture({
          critic,
          episodeId: initial.episodeId,
          executionId: `bounded:${critic}:r${calls[critic]}`,
          round: calls[critic],
          reviewedArtifacts: [current],
          scores: configured.scores,
          issues,
        });
      },
    ]),
  ) as Record<ContentCriticName, (context: ContentNodeContext) => Promise<ContentCriticOutput>>;
  return {calls, nodes};
};

const stateFor = (initial: ArtifactRef) => ({
  ...createInitialProductionState({
    episodeId: initial.episodeId,
    runId: "run-bounded",
    artifacts: {hookPlanRef: initial},
  }),
  phase: "visual" as const,
});

const audienceIssue = (current: ArtifactRef): CriticIssue =>
  issueFor(current, {id: "issue-hook-r1-01", category: "attention.hook"});

describe("bounded content revision integration", () => {
  it("uses multiple rounds, upgrades strategy, and selects only the Pareto-valid candidate", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, call, current: ref}) =>
      critic === "audience-critic" && call < 3
        ? {issues: [audienceIssue(ref)], scores: {hook: call === 1 ? 13 : 13.25}}
        : critic === "audience-critic"
          ? {scores: {hook: 14}}
          : {},
    );
    let ownerCall = 0;
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => {
          ownerCall += 1;
          return revisionFor(current, ownerCall === 1 ? "B" : "C");
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(result.revisions.map((revision) => revision.strategyLevel)).toEqual([0, 1]);
    expect(result.revisions.map((revision) => revision.disposition)).toEqual([
      "rejected",
      "selected",
    ]);
    expect(result.revisionLedger.budgets.creativeRoundsUsed).toBe(2);
    expect(result.revisionLedger.attempts).toHaveLength(2);
    expect(result.revisionLedger.best[current.initial.artifactId]?.sha256).not.toBe(
      current.initial.sha256,
    );
    expect(Object.values(critics.calls)).toEqual([3, 3, 3, 3]);
  });

  it.each([
    ["cost", {maxCostUsd: 0.5}, {costUsd: 0.5}],
    ["wall-clock", {maxWallclockSeconds: 2}, {wallclockSeconds: 2}],
  ] as const)("checks the %s budget before the next dispatch", async (_name, limits, usage) => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, current: ref}) =>
      critic === "audience-critic" ? {issues: [audienceIssue(ref)]} : {},
    );
    let ownerCalls = 0;
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      budgetLimits: {
        maxOralRounds: 3,
        maxCreativeRounds: 3,
        maxDeliveryRounds: 3,
        ...limits,
      },
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => {
          ownerCalls += 1;
          return {revisions: revisionFor(current, "B"), usage};
        },
      },
    });

    expect(result.status).toBe("escalated");
    expect(result.nextRoute).toMatchObject({reason: "budget-exhausted"});
    expect(ownerCalls).toBe(1);
    expect(result.revisionLedger.budgets.creativeRoundsUsed).toBe(1);
    expect(result.revisionLedger.budgets.costUsdUsed).toBe("costUsd" in usage ? usage.costUsd : 0);
    if ("wallclockSeconds" in usage) {
      expect(result.revisionLedger.budgets.wallclockSecondsUsed).toBe(usage.wallclockSeconds);
    } else {
      expect(result.revisionLedger.budgets.wallclockSecondsUsed).toBeGreaterThanOrEqual(0);
    }
  });

  it("warns on A to B to A, retains best, and stops at the configured round budget", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, current: ref}) =>
      critic === "audience-critic" ? {issues: [audienceIssue(ref)]} : {},
    );
    let ownerCall = 0;
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      budgetLimits: {maxOralRounds: 3, maxCreativeRounds: 2, maxDeliveryRounds: 3},
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => {
          ownerCall += 1;
          return revisionFor(current, ownerCall === 1 ? "B" : "A");
        },
      },
    });

    expect(result.status).toBe("escalated");
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions[1]?.selectionReason).toBe("no-progress");
    expect(result.revisions[1]?.oscillationIds).toContain("oscillation-hash-cycle");
    expect(result.humanEscalation?.reason).toBe("budget-exhausted");
    expect(result.revisionLedger.best[current.initial.artifactId]?.sha256).toBe(
      current.initial.sha256,
    );
  });

  it("escalates A to B to A to B as an oscillation before another dispatch", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, current: ref}) =>
      critic === "audience-critic" ? {issues: [audienceIssue(ref)]} : {},
    );
    let ownerCall = 0;
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => {
          ownerCall += 1;
          return revisionFor(current, ownerCall === 2 ? "A" : "B");
        },
      },
    });

    expect(result.status).toBe("escalated");
    expect(result.revisions).toHaveLength(3);
    expect(result.revisions[2]?.disposition).toBe("human-required");
    expect(result.revisions[2]?.oscillationIds).toContain("oscillation-hash-cycle");
    expect(result.humanEscalation?.reason).toBe("oscillation");
    expect(ownerCall).toBe(3);
  });

  it("rejects a hard regression and retains the prior best", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, call, current: ref}) => {
      if (critic === "audience-critic" && call === 1) return {issues: [audienceIssue(ref)]};
      if (critic === "audience-critic") return {scores: {hook: 14}};
      if (critic === "fact-guardian" && call > 1) {
        return {
          issues: [
            issueFor(ref, {
              id: "issue-fact-r2-01",
              category: "script.fact-accuracy",
              severity: "blocker",
              ownerAgent: "script-writer",
              routeTarget: "script-writer",
            }),
          ],
          scores: {claimCoverage: 0},
        };
      }
      return {};
    });
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      budgetLimits: {maxOralRounds: 3, maxCreativeRounds: 1, maxDeliveryRounds: 3},
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => revisionFor(current, "B"),
      },
    });

    expect(result.revisions[0]?.selectionReason).toBe("regression");
    expect(result.revisions[0]?.regressionIds.join(" ")).toMatch(
      /new-blocker|candidate-gate-reject/u,
    );
    expect(result.revisionLedger.best[current.initial.artifactId]?.sha256).toBe(
      current.initial.sha256,
    );
  });

  it("does not let a higher weighted score override a protected-dimension regression", async () => {
    const current = fixture();
    const totals: number[] = [];
    const critics = criticNodes(current.initial, ({critic, call, current: ref}) => {
      if (critic !== "audience-critic") return {};
      if (call === 1) return {issues: [audienceIssue(ref)], scores: {hook: 13, conflict: 13}};
      return {scores: {hook: 15, conflict: 12.5}};
    });
    const wrappedAudience = critics.nodes["audience-critic"];
    critics.nodes["audience-critic"] = async (context) => {
      const output = await wrappedAudience(context);
      const report = "schemaVersion" in output ? output : output.result;
      totals.push(report.evaluation.normalizedTotal);
      return output;
    };
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      budgetLimits: {maxOralRounds: 3, maxCreativeRounds: 1, maxDeliveryRounds: 3},
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => revisionFor(current, "B"),
      },
    });

    expect(totals[1]).toBeGreaterThan(totals[0]!);
    expect(result.revisions[0]?.selectionReason).toBe("protected-dimension-regression");
    expect(result.revisionLedger.best[current.initial.artifactId]?.sha256).toBe(
      current.initial.sha256,
    );
  });

  it("rejects an above-floor score regression before candidate promotion", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, call, current: ref}) => {
      if (critic !== "audience-critic") return {};
      if (call === 1) return {issues: [audienceIssue(ref)]};
      return {scores: {hook: 15, conflict: 11}};
    });
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      budgetLimits: {maxOralRounds: 3, maxCreativeRounds: 1, maxDeliveryRounds: 3},
      nodes: {
        critics: critics.nodes,
        reviseOwner: () => revisionFor(current, "B"),
      },
    });

    expect(result.revisions[0]?.selectionReason).toBe("regression");
    expect(result.revisions[0]?.regressionIds.join(" ")).toMatch(/dimension-drop/u);
    expect(result.revisionLedger.best[current.initial.artifactId]?.sha256).toBe(
      current.initial.sha256,
    );
  });

  it("routes and reruns the Compliance Critic before selecting a compliant candidate", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, call, current: ref}) => {
      if (critic !== "compliance-critic" || call > 1) return {};
      return {
        issues: [
          issueFor(ref, {
            id: "issue-compliance-r1-01",
            category: "compliance.advertising-language",
            severity: "blocker",
            ownerAgent: "script-writer",
            routeTarget: "script-writer",
          }),
        ],
        scores: {advertisingLanguage: 0},
      };
    });
    const result = await runContentLoop({
      state: stateFor(current.initial),
      artifactIndex: current.index,
      nodes: {
        critics: critics.nodes,
        reviseOwner: (request) => {
          expect(request.ownerAgent).toBe("script-writer");
          return revisionFor(current, "B");
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(result.route).toMatchObject({ownerAgent: "script-writer"});
    expect(critics.calls["compliance-critic"]).toBe(2);
    expect(result.state.gates["compliance-critic"]).toBe("pass");
  });

  it("blocks an automated owner revision that overlaps an existing locked range", async () => {
    const current = fixture();
    const critics = criticNodes(current.initial, ({critic, current: ref}) =>
      critic === "audience-critic" ? {issues: [audienceIssue(ref)]} : {},
    );
    await expect(
      runContentLoop({
        state: stateFor(current.initial),
        artifactIndex: current.index,
        lockedRanges: [
          {
            lockId: "human-lock-1",
            artifactRef: current.initial,
            locator: {kind: "line-range", value: "1-10"},
          },
        ],
        nodes: {
          critics: critics.nodes,
          reviseOwner: () => revisionFor(current, "B", [{kind: "line-range", value: "5-6"}]),
        },
      }),
    ).rejects.toThrow(/LOCKED_RANGE_OVERWRITE:human-lock-1/u);
  });
});
