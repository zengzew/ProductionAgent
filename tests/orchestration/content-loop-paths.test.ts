import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  contentCriticNames,
  createInitialProductionState,
  emptyArtifactIndex,
  evaluateContentGate,
  registerCandidate,
  runContentLoop,
  selectArtifact,
  type ArtifactIndex,
  type ArtifactRef,
  type ContentCriticName,
  type ContentCriticOutput,
  type CriticIssue,
} from "../../src/orchestration";
import {routedCriticResultFixture} from "../helpers/critics";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const createFixture = (): {repoRoot: string; hook: ArtifactRef; index: ArtifactIndex} => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-content-paths-"));
  temporaryDirectories.push(repoRoot);
  const relativePath = "content/episode-paths/story/hook-plan.md";
  fs.mkdirSync(path.dirname(path.join(repoRoot, relativePath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, relativePath), "hook v1\n");
  const hook = buildArtifactRef({
    repoRoot,
    artifactId: "episode-paths:story:hook-plan",
    episodeId: "episode-paths",
    path: relativePath,
    mediaType: "text/markdown",
    schemaVersion: "fixture-v1",
    producer: "viral-director",
    createdAt: "2026-08-09T00:00:00.000Z",
  });
  const index = selectArtifact(
    registerCandidate(emptyArtifactIndex("episode-paths"), hook, "fixture:hook", []),
    hook,
  );
  return {repoRoot, hook, index};
};

const issueFor = (
  hook: ArtifactRef,
  category: "attention.hook" | "contract.invalid-output",
  id: string,
): CriticIssue => ({
  id,
  category,
  severity: "high",
  status: "open",
  ownerAgent: "story-director",
  routeTarget: "story-director",
  affectedArtifact: {
    artifactId: hook.artifactId,
    path: hook.path,
    sha256: hook.sha256,
    locator: {kind: "whole-artifact", value: "hook-plan"},
  },
  evidence: [
    {
      kind: "artifact-observation",
      observed: "the fixture issue remains open",
      expected: "the issue is closed before content approval",
      claimIds: [],
    },
  ],
  suggestedCorrection: {
    objective: "change the fixture artifact",
    acceptanceChecks: ["the artifact hash changes"],
  },
  constraintsNotToBreak: [
    {
      id: "fixture-constraint",
      description: "keep the fixture episode",
      artifactRefs: [hook],
      claimIds: [],
    },
  ],
});

const criticResult = (
  critic: ContentCriticName,
  hook: ArtifactRef,
  round: number,
  issue?: CriticIssue,
): ContentCriticOutput => {
  const issues = issue ? [issue] : [];
  return routedCriticResultFixture({
    critic,
    episodeId: "episode-paths",
    executionId: `run-content-paths:${critic}:r${round}`,
    round,
    reviewedArtifacts: [hook],
    issues,
  });
};

const criticsFor = (
  hook: ArtifactRef,
  issueFactory?: (critic: ContentCriticName, round: number, current: ArtifactRef) => CriticIssue,
) =>
  Object.fromEntries(
    contentCriticNames.map((critic) => [
      critic,
      async (context: {round: number; artifacts: Readonly<Record<string, ArtifactRef>>}) => {
        const current = Object.values(context.artifacts).find(
          (ref) => ref.artifactId === hook.artifactId,
        );
        if (!current) throw new Error("fixture hook missing");
        const issue = issueFactory?.(critic, context.round, current);
        return criticResult(critic, current, context.round + 1, issue);
      },
    ]),
  ) as Record<
    ContentCriticName,
    (context: {
      round: number;
      artifacts: Readonly<Record<string, ArtifactRef>>;
    }) => Promise<ContentCriticOutput>
  >;

describe("content subgraph path coverage", () => {
  it("rejects incomplete critic maps instead of treating a missing critic as a pass", () => {
    const {hook} = createFixture();
    const audience = criticResult("audience-critic", hook, 1);
    const retention = criticResult("retention-critic", hook, 1);

    expect(() =>
      evaluateContentGate({
        "audience-critic": audience,
        "retention-critic": retention,
      } as never),
    ).toThrow(/CONTENT_CRITIC_RESULT_MISSING:fact-guardian/u);
  });

  it("escalates a rejected contract issue when provenance cannot select an owner", async () => {
    const {hook, index} = createFixture();
    const state = {
      ...createInitialProductionState({
        episodeId: "episode-paths",
        runId: "run-content-escalated",
        artifacts: {hookPlanRef: hook},
      }),
      phase: "visual" as const,
    };
    const result = await runContentLoop({
      state,
      artifactIndex: index,
      nodes: {
        critics: criticsFor(hook, (critic, _round, current) =>
          critic === "audience-critic"
            ? issueFor(current, "contract.invalid-output", "issue-contract-r1-01")
            : issueFor(current, "contract.invalid-output", "issue-unused-r1-01"),
        ),
      },
    });

    expect(result.status).toBe("escalated");
    expect(result.gate.verdict).toBe("REJECT");
    expect(result.route).toMatchObject({
      action: "escalate",
      routeTarget: "human-editor",
      reason: "unknown-provenance",
    });
    expect(result.state.phase).toBe("halted");
  });

  it("runs the bounded loop until the creative budget is exhausted", async () => {
    const {repoRoot, hook, index} = createFixture();
    const state = {
      ...createInitialProductionState({
        episodeId: "episode-paths",
        runId: "run-content-needs-revision",
        artifacts: {hookPlanRef: hook},
      }),
      phase: "visual" as const,
    };
    const result = await runContentLoop({
      state,
      artifactIndex: index,
      nodes: {
        critics: criticsFor(hook, (critic, _round, current) =>
          critic === "audience-critic"
            ? issueFor(current, "attention.hook", "issue-hook-r1-01")
            : undefined!,
        ),
        reviseOwner: async () => {
          fs.writeFileSync(path.join(repoRoot, hook.path), "hook v2\n");
          return {
            ref: buildArtifactRef({
              repoRoot,
              artifactId: hook.artifactId,
              episodeId: hook.episodeId,
              path: hook.path,
              mediaType: hook.mediaType,
              schemaVersion: hook.schemaVersion,
              producer: "viral-director",
              previous: hook,
              createdAt: "2026-08-09T00:00:01.000Z",
            }),
          };
        },
      },
    });

    expect(result.status).toBe("escalated");
    expect(result.gate.verdict).toBe("REJECT");
    expect(result.nextRoute).toMatchObject({reason: "budget-exhausted"});
    expect(result.revisions).toHaveLength(3);
    expect(result.revisionLedger.budgets.creativeRoundsUsed).toBe(3);
    expect(result.revision?.changedArtifactIds).toEqual([hook.artifactId]);
    expect(result.state.phase).toBe("halted");
  });
});
