import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  assertReferenceOnlyState,
  buildArtifactRef,
  contentCriticNames,
  createInitialProductionState,
  emptyArtifactIndex,
  legacyReturnTo,
  recomputeCriticEvaluation,
  registerCandidate,
  runContentLoop,
  selectArtifact,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRef,
  type ContentCriticName,
  type ContentCriticOutput,
  type ContentNodeContext,
  type CriticIssue,
  type CriticName,
  type ProductionState,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];
const createdAt = "2026-08-08T00:00:00.000Z";

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
}): ArtifactRef => {
  const filePath = path.join(input.repoRoot, input.relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, input.body);
  return buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: "episode-golden",
    path: input.relativePath,
    mediaType: "text/markdown",
    schemaVersion: "test-v1",
    producer: input.producer,
    previous: input.previous,
    createdAt,
  });
};

const dependency = (ref: ArtifactRef): ArtifactDependency => ({
  artifactId: ref.artifactId,
  path: ref.path,
  sha256: ref.sha256,
  relation: "reads",
});

const seedIndex = (
  refs: readonly {ref: ArtifactRef; dependencies: ArtifactDependency[]}[],
): ArtifactIndex => {
  let index = emptyArtifactIndex("episode-golden");
  for (const item of refs) {
    index = registerCandidate(index, item.ref, "seed:" + item.ref.artifactId, item.dependencies);
    index = selectArtifact(index, item.ref);
  }
  return index;
};

const passingDimensions: Record<
  CriticName,
  Array<{id: string; score: number; evidenceIssueIds: string[]}>
> = {
  "oral-judge": [
    {id: "chineseNaturalness", score: 4, evidenceIssueIds: []},
    {id: "spokenDelivery", score: 4, evidenceIssueIds: []},
    {id: "informationFidelity", score: 4, evidenceIssueIds: []},
  ],
  "audience-critic": [
    {id: "hook", score: 13, evidenceIssueIds: []},
    {id: "conflict", score: 13, evidenceIssueIds: []},
    {id: "humanElement", score: 8, evidenceIssueIds: []},
    {id: "productClarity", score: 13, evidenceIssueIds: []},
    {id: "growthLogic", score: 13, evidenceIssueIds: []},
    {id: "technologyExplanation", score: 13, evidenceIssueIds: []},
    {id: "naturalChinese", score: 13, evidenceIssueIds: []},
  ],
  "fact-guardian": [
    {id: "claimCoverage", score: 1, evidenceIssueIds: []},
    {id: "semanticFidelity", score: 1, evidenceIssueIds: []},
    {id: "sourceIdentityAttribution", score: 1, evidenceIssueIds: []},
    {id: "metricAndTimeScope", score: 1, evidenceIssueIds: []},
    {id: "causalityInferenceBoundary", score: 1, evidenceIssueIds: []},
    {id: "visualTruthBoundary", score: 1, evidenceIssueIds: []},
  ],
  "retention-critic": [
    {id: "first3Seconds", score: 20, evidenceIssueIds: []},
    {id: "first30Seconds", score: 20, evidenceIssueIds: []},
    {id: "midVideoEngagement", score: 20, evidenceIssueIds: []},
    {id: "endingSatisfaction", score: 20, evidenceIssueIds: []},
  ],
  "delivery-critic": [
    {id: "artifactIntegrity", score: 1, evidenceIssueIds: []},
    {id: "durationAndVerticalFormat", score: 1, evidenceIssueIds: []},
    {id: "captionIntegrityAndTiming", score: 1, evidenceIssueIds: []},
    {id: "audioIntelligibilityAndSync", score: 1, evidenceIssueIds: []},
    {id: "firstFrameComprehension", score: 1, evidenceIssueIds: []},
    {id: "evidenceRightsReadability", score: 1, evidenceIssueIds: []},
    {id: "renderContinuitySafeArea", score: 1, evidenceIssueIds: []},
  ],
};

const rubricVersions: Record<CriticName, string> = {
  "oral-judge": "oral-review-v2",
  "audience-critic": "product-story-v4",
  "fact-guardian": "fact-guardian-v1",
  "retention-critic": "retention-critic-v2",
  "delivery-critic": "delivery-critic-v1",
};

const hookIssue = (hook: ArtifactRef): CriticIssue => ({
  id: "issue-audience-r1-01",
  category: "attention.hook",
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
      observed: "the current hook does not establish a concrete first action",
      expected: "the first frame should establish the action before the explanation",
      claimIds: [],
    },
  ],
  suggestedCorrection: {
    objective: "rewrite the opening hook",
    acceptanceChecks: ["the first frame is understandable without background"],
  },
  constraintsNotToBreak: [
    {
      id: "story-question",
      description: "keep the approved story question",
      artifactRefs: [hook],
      claimIds: [],
    },
  ],
});

const reportRef = (repoRoot: string, critic: ContentCriticName, round: number): ArtifactRef =>
  writeRef({
    repoRoot,
    artifactId: "episode-golden:reports:" + critic + "-r" + round,
    relativePath: "content/episode-golden/reports/" + critic + "-r" + round + ".md",
    body: "reference-only critic report\n",
    producer: critic,
  });

const makeCriticResult = (input: {
  repoRoot: string;
  critic: ContentCriticName;
  round: number;
  executionId: string;
  reviewedArtifacts: ArtifactRef[];
  issues: CriticIssue[];
}): ContentCriticOutput => {
  const computed = recomputeCriticEvaluation({
    critic: input.critic,
    rubricVersion: rubricVersions[input.critic],
    dimensions: passingDimensions[input.critic],
    issues: input.issues,
  });
  const route =
    computed.verdict === "REJECT"
      ? {
          ownerAgent: "viral-director" as const,
          routeTarget: "viral-director" as const,
          restartAt: "viral-director",
          reasonCode: "attention.hook" as const,
          issueIds: input.issues.map((issue) => issue.id),
        }
      : null;
  return {
    result: {
      schemaVersion: "critic-output-v1",
      episodeId: "episode-golden",
      executionId: input.executionId,
      critic: input.critic,
      round: input.round,
      rubricVersion: rubricVersions[input.critic],
      reviewedArtifacts: input.reviewedArtifacts,
      ...computed,
      issues: input.issues,
      primaryRoute: route,
      returnTo: route === null ? "none" : legacyReturnTo(input.critic, route.routeTarget),
    },
    resultRef: reportRef(input.repoRoot, input.critic, input.round),
  };
};

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
    };
    const reviewedHashes: Record<ContentCriticName, string[][]> = {
      "audience-critic": [],
      "retention-critic": [],
      "fact-guardian": [],
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
              : [findArtifact(context, "story-brief"), findArtifact(context, "script")];
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
        },
        reviseOwner: async (request) => {
          ownerCalls.push({
            ownerAgent: request.ownerAgent,
            issueIds: [...request.route.issueIds],
            authorizedArtifactIds: [...request.authorizedArtifactIds],
          });
          expect(request.ownerAgent).toBe("viral-director");
          expect(request.authorizedArtifactIds).toEqual([hook.artifactId]);
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
          expect(staleIds).toEqual([
            script.artifactId,
            narration.artifactId,
            visualPlan.artifactId,
          ]);
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
    });
    for (const name of contentCriticNames) {
      expect(reviewedHashes[name]).toHaveLength(2);
      expect(reviewedHashes[name]![1]).toContain(result.revision?.afterHashes[hook.artifactId]);
    }
    expect(
      result.trace.filter(
        (step) => step.parallel && contentCriticNames.includes(step.node as ContentCriticName),
      ),
    ).toHaveLength(6);
    expect(assertReferenceOnlyState(result.state)).toEqual(result.state);
    expect(JSON.stringify(result.state)).not.toContain("hook v2");
  });
});
