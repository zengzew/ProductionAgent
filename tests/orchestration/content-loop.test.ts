import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  assertReferenceOnlyState,
  contentCriticNames,
  createInitialProductionState,
  runContentLoop,
  type ArtifactRef,
  type ContentCriticName,
  type ContentCriticOutput,
  type ContentNodeContext,
  type CriticIssue,
  type ProductionState,
} from "../../src/orchestration";
import {
  artifactDependencyFixture,
  selectedArtifactIndexFixture,
  writeArtifactFixture,
} from "../helpers/artifacts";
import {contentCriticOutputFixture, criticIssueFixture} from "../helpers/critics";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const writeRef = (input: {
  repoRoot: string;
  artifactId: string;
  relativePath: string;
  body: string;
  producer: string;
  previous?: ArtifactRef;
}): ArtifactRef => writeArtifactFixture({...input, episodeId: "episode-golden"});

const dependency = artifactDependencyFixture;
const seedIndex = (refs: Parameters<typeof selectedArtifactIndexFixture>[1]) =>
  selectedArtifactIndexFixture("episode-golden", refs);

const hookIssue = (hook: ArtifactRef) =>
  criticIssueFixture({
    critic: "audience-critic",
    id: "issue-audience-r1-01",
    category: "attention.hook",
    severity: "high",
    artifact: hook,
    ownerAgent: "story-director",
    routeTarget: "story-director",
  });

const makeCriticResult = (input: {
  repoRoot: string;
  critic: ContentCriticName;
  round: number;
  executionId: string;
  reviewedArtifacts: ArtifactRef[];
  issues: CriticIssue[];
}): ContentCriticOutput =>
  contentCriticOutputFixture({
    ...input,
    episodeId: "episode-golden",
    scores: input.critic === "audience-critic" && input.round > 1 ? {hook: 14} : undefined,
  });

const findArtifact = (context: ContentNodeContext, suffix: string): ArtifactRef => {
  const ref = Object.values(context.artifacts).find((candidate) =>
    candidate.artifactId.endsWith(":" + suffix),
  );
  if (!ref) throw new Error("fixture artifact missing: " + suffix);
  return ref;
};

describe("GOLDEN-002 content revision loop", () => {
  it("routes an attention.hook issue to Viral Director, refreshes descendants, reruns all critics, and closes", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-content-loop-"));
    temporaryDirectories.push(repoRoot);

    const story = writeRef({
      repoRoot,
      artifactId: "episode-golden:story:story-brief",
      relativePath: "content/episode-golden/story/story-brief.md",
      body: "story v1\n",
      producer: "story-director",
    });
    const hook = writeRef({
      repoRoot,
      artifactId: "episode-golden:story:hook-plan",
      relativePath: "content/episode-golden/story/hook-plan.md",
      body: "hook v1\n",
      producer: "viral-director",
    });
    const script = writeRef({
      repoRoot,
      artifactId: "episode-golden:story:script",
      relativePath: "content/episode-golden/story/script.md",
      body: "script v1\n",
      producer: "script-writer",
    });
    const narration = writeRef({
      repoRoot,
      artifactId: "episode-golden:story:narration",
      relativePath: "content/episode-golden/story/narration.md",
      body: "narration v1\n",
      producer: "oral-rewriter",
    });
    const visualPlan = writeRef({
      repoRoot,
      artifactId: "episode-golden:story:visual-plan",
      relativePath: "content/episode-golden/story/visual-plan.md",
      body: "visual v1\n",
      producer: "visual-director",
    });
    const artifactIndex = seedIndex([
      {ref: story, dependencies: []},
      {ref: hook, dependencies: [dependency(story)]},
      {ref: script, dependencies: [dependency(hook)]},
      {ref: narration, dependencies: [dependency(script)]},
      {ref: visualPlan, dependencies: [dependency(script)]},
    ]);
    const state: ProductionState = {
      ...createInitialProductionState({
        episodeId: "episode-golden",
        runId: "run-golden-002",
        artifacts: {
          storyBriefRef: story,
          hookPlanRef: hook,
          scriptRef: script,
          voiceoverRef: narration,
          visualPlanRef: visualPlan,
        },
      }),
      phase: "visual",
    };

    const criticCalls: Record<ContentCriticName, number> = {
      "audience-critic": 0,
      "retention-critic": 0,
      "fact-guardian": 0,
      "compliance-critic": 0,
    };
    const reviewedHashes: Record<ContentCriticName, string[][]> = {
      "audience-critic": [],
      "retention-critic": [],
      "fact-guardian": [],
      "compliance-critic": [],
    };
    const visualCalls: number[] = [];
    const ownerCalls: Array<{
      ownerAgent: string;
      issueIds: string[];
      authorizedArtifactIds: string[];
    }> = [];
    const refreshCalls: string[][] = [];

    const criticRunner =
      (critic: ContentCriticName) =>
      async (context: ContentNodeContext): Promise<ContentCriticOutput> => {
        criticCalls[critic] += 1;
        reviewedHashes[critic].push(Object.values(context.artifacts).map((ref) => ref.sha256));
        const currentHook = findArtifact(context, "hook-plan");
        const reviewed =
          critic === "audience-critic"
            ? [currentHook, findArtifact(context, "script"), findArtifact(context, "narration")]
            : critic === "retention-critic"
              ? [currentHook, findArtifact(context, "script"), findArtifact(context, "visual-plan")]
              : critic === "fact-guardian"
                ? [findArtifact(context, "story-brief"), findArtifact(context, "script")]
                : [findArtifact(context, "narration"), findArtifact(context, "visual-plan")];
        const issues =
          critic === "audience-critic" && criticCalls[critic] === 1 ? [hookIssue(currentHook)] : [];
        return makeCriticResult({
          repoRoot,
          critic,
          round: criticCalls[critic],
          executionId: "run-golden-002:" + critic + ":" + criticCalls[critic],
          reviewedArtifacts: reviewed,
          issues,
        });
      };

    const result = await runContentLoop({
      state,
      artifactIndex,
      nodes: {
        visualDirector: () => {
          visualCalls.push(1);
          return [];
        },
        critics: {
          "audience-critic": criticRunner("audience-critic"),
          "retention-critic": criticRunner("retention-critic"),
          "fact-guardian": criticRunner("fact-guardian"),
          "compliance-critic": criticRunner("compliance-critic"),
        },
        reviseOwner: async (request) => {
          ownerCalls.push({
            ownerAgent: request.ownerAgent,
            issueIds: [...request.route.issueIds],
            authorizedArtifactIds: [...request.authorizedArtifactIds],
          });
          const revisedHook = writeRef({
            repoRoot,
            artifactId: hook.artifactId,
            relativePath: hook.path,
            body: "hook v2\n",
            producer: "viral-director",
            previous: hook,
          });
          return {ref: revisedHook};
        },
        downstreamRefresh: async (request) => {
          const staleIds = request.staleArtifacts.map((record) => record.ref.artifactId);
          refreshCalls.push(staleIds);
          const staleScript = request.staleArtifacts.find(
            (record) => record.ref.artifactId === script.artifactId,
          )!.ref;
          const staleNarration = request.staleArtifacts.find(
            (record) => record.ref.artifactId === narration.artifactId,
          )!.ref;
          const staleVisual = request.staleArtifacts.find(
            (record) => record.ref.artifactId === visualPlan.artifactId,
          )!.ref;
          const revisedHook = findArtifact(request.context, "hook-plan");
          const nextScript = writeRef({
            repoRoot,
            artifactId: script.artifactId,
            relativePath: script.path,
            body: "script v2\n",
            producer: "script-writer",
            previous: staleScript,
          });
          const nextNarration = writeRef({
            repoRoot,
            artifactId: narration.artifactId,
            relativePath: narration.path,
            body: "narration v2\n",
            producer: "oral-rewriter",
            previous: staleNarration,
          });
          const nextVisual = writeRef({
            repoRoot,
            artifactId: visualPlan.artifactId,
            relativePath: visualPlan.path,
            body: "visual v2\n",
            producer: "visual-director",
            previous: staleVisual,
          });
          return [
            {ref: nextScript, dependencies: [dependency(revisedHook)]},
            {ref: nextNarration, dependencies: [dependency(nextScript)]},
            {ref: nextVisual, dependencies: [dependency(nextScript)]},
          ];
        },
      },
    });

    expect(visualCalls).toHaveLength(1);
    expect(ownerCalls).toEqual([
      {
        ownerAgent: "viral-director",
        issueIds: ["issue-audience-r1-01"],
        authorizedArtifactIds: [hook.artifactId],
      },
    ]);
    expect(refreshCalls).toEqual([
      [script.artifactId, narration.artifactId, visualPlan.artifactId],
    ]);
    expect(result.status).toBe("completed");
    expect(result.route).toMatchObject({
      ownerAgent: "viral-director",
      routeTarget: "viral-director",
      restartAt: "viral-director",
    });
    expect(result.nextRoute).toBeNull();
    expect(result.closedIssueIds).toEqual(["issue-audience-r1-01"]);
    expect(result.newIssues).toEqual([]);
    expect(result.revision).toMatchObject({
      round: 1,
      ownerAgent: "viral-director",
      changedArtifactIds: [hook.artifactId],
      staleArtifactIds: [script.artifactId, narration.artifactId, visualPlan.artifactId],
      refreshedArtifactIds: [script.artifactId, narration.artifactId, visualPlan.artifactId],
    });
    expect(result.revision?.beforeHashes[hook.artifactId]).toBe(hook.sha256);
    expect(result.revision?.afterHashes[hook.artifactId]).not.toBe(hook.sha256);
    expect(result.state.round).toBe(1);
    expect(result.state.artifacts.hookPlanRef?.sha256).toBe(
      result.revision?.afterHashes[hook.artifactId],
    );
    expect(result.artifactIndex.selected[script.artifactId]?.sha256).not.toBe(script.sha256);
    expect(result.artifactIndex.selected[narration.artifactId]?.sha256).not.toBe(narration.sha256);
    expect(result.artifactIndex.selected[visualPlan.artifactId]?.sha256).not.toBe(
      visualPlan.sha256,
    );
    expect(
      result.artifactIndex.artifacts.filter((record) => record.state === "stale"),
    ).toHaveLength(4);
    expect(criticCalls).toEqual({
      "audience-critic": 2,
      "retention-critic": 2,
      "fact-guardian": 2,
      "compliance-critic": 2,
    });
    for (const name of contentCriticNames) {
      expect(reviewedHashes[name]).toHaveLength(2);
      expect(reviewedHashes[name]![1]).toContain(result.revision?.afterHashes[hook.artifactId]);
    }
    expect(
      result.trace.filter(
        (step) => step.parallel && contentCriticNames.includes(step.node as ContentCriticName),
      ),
    ).toHaveLength(8);
    expect(assertReferenceOnlyState(result.state)).toEqual(result.state);
    expect(JSON.stringify(result.state)).not.toContain("hook v2");
  });
});
