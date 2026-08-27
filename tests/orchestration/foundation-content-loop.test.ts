import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  checkpointConfig,
  contentLoopOwnedAgentNames,
  createDeterministicStubAgent,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
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

describe("foundation graph content loop composition", () => {
  it("runs runContentLoop from createFoundationGraph and promotes a Pareto candidate", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-foundation-loop-"));
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
    const artifactIndex = selectedArtifactIndexFixture("episode-golden", [
      {ref: story, dependencies: []},
      {ref: hook, dependencies: [artifactDependencyFixture(story)]},
      {ref: script, dependencies: [artifactDependencyFixture(hook)]},
      {ref: narration, dependencies: [artifactDependencyFixture(script)]},
      {ref: visualPlan, dependencies: [artifactDependencyFixture(script)]},
    ]);
    const state: ProductionState = {
      ...createInitialProductionState({
        episodeId: "episode-golden",
        runId: "run-foundation-loop",
        artifacts: {
          storyBriefRef: story,
          hookPlanRef: hook,
          scriptRef: script,
          voiceoverRef: narration,
          visualPlanRef: visualPlan,
        },
      }),
    };
    const criticCalls: Record<ContentCriticName, number> = {
      "audience-critic": 0,
      "retention-critic": 0,
      "fact-guardian": 0,
    };
    const ownerCalls: string[] = [];
    const findArtifact = (context: ContentNodeContext, suffix: string): ArtifactRef => {
      const ref = Object.values(context.artifacts).find((candidate) =>
        candidate.artifactId.endsWith(":" + suffix),
      );
      if (!ref) throw new Error("fixture artifact missing: " + suffix);
      return ref;
    };
    const criticRunner =
      (critic: ContentCriticName) =>
      async (context: ContentNodeContext): Promise<ContentCriticOutput> => {
        criticCalls[critic] += 1;
        const currentHook = findArtifact(context, "hook-plan");
        const issues: CriticIssue[] =
          critic === "audience-critic" && criticCalls[critic] === 1 ? [hookIssue(currentHook)] : [];
        return contentCriticOutputFixture({
          repoRoot,
          episodeId: "episode-golden",
          critic,
          round: criticCalls[critic],
          executionId: `run-foundation-loop:${critic}:${criticCalls[critic]}`,
          reviewedArtifacts: [currentHook],
          issues,
          scores: critic === "audience-critic" && criticCalls[critic] > 1 ? {hook: 14} : undefined,
        });
      };

    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      checkpointer: createLocalCheckpoint({repoRoot}),
      contentLoop: {
        artifactIndex,
        nodes: {
          visualDirector: () => [],
          critics: {
            "audience-critic": criticRunner("audience-critic"),
            "retention-critic": criticRunner("retention-critic"),
            "fact-guardian": criticRunner("fact-guardian"),
          },
          reviseOwner: async (request) => {
            ownerCalls.push(request.ownerAgent);
            return {
              ref: writeRef({
                repoRoot,
                artifactId: hook.artifactId,
                relativePath: hook.path,
                body: "hook v2\n",
                producer: "viral-director",
                previous: hook,
              }),
            };
          },
          downstreamRefresh: async (request) =>
            request.staleArtifacts.map((record) => ({
              ref: writeRef({
                repoRoot,
                artifactId: record.ref.artifactId,
                relativePath: record.ref.path,
                body: `${record.ref.artifactId} v2\n`,
                producer: "downstream-refresh",
                previous: record.ref,
              }),
            })),
        },
      },
    });

    const paused = await graph.invoke(state, checkpointConfig(state.episodeId));
    expect(
      (paused as typeof paused & {__interrupt__?: {value: {gate?: string}}[]}).__interrupt__?.[0]
        ?.value.gate,
    ).toBe("content-approval");
    expect(paused.completedAgents).toEqual(
      expect.arrayContaining(["research-analyst", "oral-judge", ...contentLoopOwnedAgentNames]),
    );
    expect(paused.completedAgents).not.toContain("delivery-critic");
    expect(ownerCalls).toEqual(["viral-director"]);
    expect(criticCalls["audience-critic"]).toBe(2);
    expect(paused.decisions["content-loop"]?.code).toBe("CONTENT_LOOP_COMPLETED");
    expect(paused.gates["content-evaluation"]).toBe("pass");
    const selectedHook = paused.artifacts.hookPlanRef;
    expect(selectedHook).toBeDefined();
    expect(selectedHook?.sha256).not.toBe(hook.sha256);
  });

  it("defaults contentLoop visualDirector to createVisualSlotDirector", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-foundation-slot-"));
    temporaryDirectories.push(repoRoot);
    const control = writeRef({
      repoRoot,
      artifactId: "episode-golden:control:contract",
      relativePath: "content/episode-golden/control/contract.md",
      body: "control\n",
      producer: "test",
    });
    const artifactIndex = selectedArtifactIndexFixture("episode-golden", [
      {ref: control, dependencies: []},
    ]);
    fs.mkdirSync(path.join(repoRoot, "content/episode-golden/story"), {recursive: true});
    fs.writeFileSync(
      path.join(repoRoot, "content/episode-golden/story/script.json"),
      JSON.stringify({
        segments: [
          {
            id: "seg-001",
            claimIds: ["claim-m5-001"],
            narration: "测试旁白",
            visualIntent: "测试画面",
            targetSeconds: 5,
          },
        ],
      }),
    );
    const criticRunner =
      (critic: ContentCriticName) =>
      async (context: ContentNodeContext): Promise<ContentCriticOutput> =>
        contentCriticOutputFixture({
          repoRoot,
          episodeId: "episode-golden",
          critic,
          round: 1,
          executionId: `run-slot:${critic}`,
          reviewedArtifacts: Object.values(context.artifacts),
          issues: [],
        });
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      repoRoot,
      checkpointer: createLocalCheckpoint({repoRoot}),
      contentLoop: {
        artifactIndex,
        nodes: {
          critics: {
            "audience-critic": criticRunner("audience-critic"),
            "retention-critic": criticRunner("retention-critic"),
            "fact-guardian": criticRunner("fact-guardian"),
          },
        },
      },
    });
    const paused = await graph.invoke(
      createInitialProductionState({
        episodeId: "episode-golden",
        runId: "run-slot-director",
        artifacts: {contract: control},
      }),
      checkpointConfig("episode-golden"),
    );
    expect(
      (paused as typeof paused & {__interrupt__?: {value: {gate?: string}}[]}).__interrupt__?.[0]
        ?.value.gate,
    ).toBe("content-approval");
    expect(
      fs.existsSync(path.join(repoRoot, "content/episode-golden/media/selections/seg-001.json")),
    ).toBe(true);
  });
});
