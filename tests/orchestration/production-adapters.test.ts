import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  createDeterministicToolAdapter,
  createInitialProductionState,
  createLocalCheckpoint,
  createProductionSubgraph,
  emptyArtifactIndex,
  freezeContent,
  readArtifactIndex,
  productionStageCheckpoint,
  productionStageInputArtifacts,
  productionStageOrder,
  productionStageRequestForState,
  createProductionStageNode,
  runProductionPipeline,
  selectArtifact,
  registerCandidate,
  type DeterministicToolRunInput,
  type ProductionStageName,
} from "../../src/orchestration";
import type {ProductionWorkspaceFactory} from "../../src/orchestration/agents/adapters/deterministic-tool";
import type {ProductionState} from "../../src/orchestration/state";

const temporaryDirectories: string[] = [];

const write = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const fixtureScript = {
  selectedHook: "一个具体动作",
  segments: [
    {
      id: "seg-001",
      section: "hook",
      narration: "用户先收到一条消息。",
      onScreenText: ["消息"],
      claimIds: ["claim-001"],
      scene: "fixture scene",
      visualIntent: "fixture visual",
      targetSeconds: 20,
    },
  ],
};

const createFixture = (): {
  repoRoot: string;
  state: ProductionState;
  manifestRef: ReturnType<typeof buildArtifactRef>;
  finalScriptRef: ReturnType<typeof buildArtifactRef>;
} => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-production-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-001";
  const finalScriptPath = `content/${episodeId}/story/final-script.md`;
  write(repoRoot, finalScriptPath, "frozen final script\n");
  write(
    repoRoot,
    `content/${episodeId}/episode.config.json`,
    JSON.stringify({
      schemaVersion: "episode-config-v2",
      id: episodeId,
      slug: "fixture",
      product: "Fixture",
      title: "Fixture",
      language: "zh-CN",
      targetSeconds: 60,
      production: {timelineTailSeconds: {}, hookAttributionSubjects: ["Fixture"]},
      selection: "selected",
      selectionReason: "fixture",
      publishStatus: "production",
      publishBlocker: "fixture",
      asOf: "2026-08-13",
      captureAssets: [{file: "fixture.png", url: "https://example.com/fixture"}],
    }),
  );
  const finalScriptRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:story:final-script`,
    episodeId,
    path: finalScriptPath,
    mediaType: "text/markdown",
    schemaVersion: "final-script-v1",
    producer: "fixture",
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  let index = emptyArtifactIndex(episodeId);
  index = selectArtifact(
    registerCandidate(index, finalScriptRef, "fixture:freeze", []),
    finalScriptRef,
  );
  const frozen = freezeContent({
    repoRoot,
    episodeId,
    artifactIndex: index,
    selectedArtifactRefs: [finalScriptRef],
    issues: [],
    frozenAt: "2026-08-13T00:00:00.000Z",
    frozenBy: "fixture",
  });
  const state = createInitialProductionState({
    episodeId,
    runId: "run-production-fixture",
    artifacts: {finalScript: finalScriptRef},
  });
  return {
    repoRoot,
    state: {...state, ...frozen.stateUpdate, phase: "frozen"},
    manifestRef: frozen.manifestRef,
    finalScriptRef,
  };
};

const copyWorkspace: ProductionWorkspaceFactory = ({repoRoot, stage}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `production-agent-stage-${stage}-`));
  fs.cpSync(repoRoot, root, {recursive: true});
  return {
    root,
    dispose: () => fs.rmSync(root, {recursive: true, force: true}),
  };
};

const writeStageOutputs = (input: DeterministicToolRunInput): void => {
  const writeStage = (repositoryPath: string, body: string): void =>
    write(input.cwd, repositoryPath, body);
  const episodeId = input.episodeId;
  if (input.stage === "materialize:story") {
    writeStage(`content/${episodeId}/story/script.json`, JSON.stringify(fixtureScript));
    writeStage(
      `content/${episodeId}/story/narration.txt`,
      `${fixtureScript.segments[0]?.narration ?? ""}\n`,
    );
  } else if (input.stage === "capture") {
    writeStage(`public/episodes/${episodeId}/captured/fixture.png`, "fixture png bytes\n");
  } else if (input.stage === "tts") {
    writeStage(`public/episodes/${episodeId}/audio/seg-001.mp3`, "fixture audio bytes\n");
    writeStage(`content/${episodeId}/production/tts-metadata.json`, "{}\n");
  } else if (input.stage === "timeline") {
    writeStage(`content/${episodeId}/production/timeline.json`, "{}\n");
    writeStage("src/poke-timeline.generated.json", "{}\n");
    writeStage("src/poke-captions.generated.json", "[]\n");
    writeStage(
      `output/${episodeId}/subtitles_zh.srt`,
      "1\n00:00:00,000 --> 00:00:01,000\nfixture\n\n",
    );
  } else if (input.stage === "render:smoke") {
    writeStage(`output/${episodeId}/smoke_9x16.mp4`, "fixture smoke video\n");
  } else if (input.stage === "render:vertical") {
    writeStage(`output/${episodeId}/vertical_9x16.mp4`, "fixture vertical video\n");
  } else if (input.stage === "inspect:output") {
    writeStage(`output/${episodeId}/inspection.json`, '{"errors":[]}\n');
  }
};

const requestFor = (
  fixture: ReturnType<typeof createFixture>,
  overrides: Partial<{
    attempt: number;
    executionId: string;
    previousArtifacts: ReturnType<typeof buildArtifactRef>[];
    cached: ReturnType<typeof productionStageCheckpoint>;
  }> = {},
) => ({
  contractVersion: "production-stage-v1" as const,
  executionId: overrides.executionId ?? "run-production-fixture:production:materialize:story:1",
  episodeId: "episode-001",
  stage: "materialize:story" as const,
  attempt: overrides.attempt ?? 1,
  revisionRound: 0,
  contentManifestRef: fixture.manifestRef,
  inputArtifacts: [fixture.manifestRef],
  previousArtifacts: overrides.previousArtifacts ?? [fixture.finalScriptRef],
  ...(overrides.cached ? {cached: overrides.cached} : {}),
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("WP-M3-01 deterministic production adapters", () => {
  it("publishes complete output sets as hash-bound refs and skips valid checkpoints", async () => {
    const fixture = createFixture();
    let calls = 0;
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        calls += 1;
        writeStageOutputs(input);
        return {stdout: "ok", stderr: ""};
      },
    });

    const first = await adapter(requestFor(fixture));
    expect(first.status).toBe("SUCCEEDED");
    expect(first.outputArtifacts).toHaveLength(3);
    for (const artifact of first.outputArtifacts) {
      const bytes = fs.readFileSync(path.join(fixture.repoRoot, artifact.path));
      expect(bytes.byteLength).toBe(artifact.sizeBytes);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    const registry = readArtifactIndex(
      path.join(fixture.repoRoot, "content/episode-001/artifact-index.json"),
    );
    expect(first.outputArtifacts.every((artifact) => registry.selected[artifact.artifactId])).toBe(
      true,
    );

    const skipped = await adapter(
      requestFor(fixture, {
        attempt: 2,
        executionId: "run-production-fixture:production:materialize:story:2",
        previousArtifacts: [fixture.finalScriptRef, ...first.outputArtifacts],
        cached: productionStageCheckpoint(first),
      }),
    );
    expect(skipped.status).toBe("SKIPPED");
    expect(calls).toBe(1);

    fs.writeFileSync(
      path.join(fixture.repoRoot, "content/episode-001/story/script.json"),
      "tampered\n",
    );
    const repaired = await adapter(
      requestFor(fixture, {
        attempt: 3,
        executionId: "run-production-fixture:production:materialize:story:3",
        previousArtifacts: [fixture.finalScriptRef, ...first.outputArtifacts],
        cached: productionStageCheckpoint(first),
      }),
    );
    expect(repaired.status).toBe("SUCCEEDED");
    expect(calls).toBe(2);
  });

  it("retains the previous selected-valid bytes when a stage produces a new revision", async () => {
    const fixture = createFixture();
    let version = "first";
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        if (input.stage === "materialize:story") {
          write(input.cwd, "content/episode-001/story/script.json", JSON.stringify({version}));
          write(input.cwd, "content/episode-001/story/narration.txt", `${version}\n`);
        } else {
          writeStageOutputs(input);
        }
        return {stdout: "ok", stderr: ""};
      },
    });

    const first = await adapter(requestFor(fixture));
    expect(first.status).toBe("SUCCEEDED");
    const firstScript = first.outputArtifacts.find((artifact) =>
      artifact.artifactId.endsWith(":script"),
    );
    expect(firstScript).toBeDefined();

    version = "second";
    const second = await adapter(
      requestFor(fixture, {
        attempt: 2,
        executionId: "run-production-fixture:production:materialize:story:2",
        previousArtifacts: [fixture.finalScriptRef, ...first.outputArtifacts],
      }),
    );
    expect(second.status).toBe("SUCCEEDED");
    expect(
      second.outputArtifacts.find((artifact) => artifact.artifactId.endsWith(":script"))?.revision,
    ).toBe(2);

    const registry = readArtifactIndex(
      path.join(fixture.repoRoot, "content/episode-001/artifact-index.json"),
    );
    const historical = registry.artifacts.find(
      (record) =>
        record.ref.artifactId === firstScript?.artifactId &&
        record.ref.sha256 === firstScript?.sha256,
    );
    expect(historical?.state).toBe("stale");
    expect(historical?.ref.path).toContain(".artifact-history");
    expect(fs.readFileSync(path.join(fixture.repoRoot, historical?.ref.path ?? ""), "utf8")).toBe(
      '{"version":"first"}',
    );
  });

  it("fails closed without replacing canonical files when a tool publishes a partial output", async () => {
    const fixture = createFixture();
    const scriptPath = path.join(fixture.repoRoot, "content/episode-001/story/script.json");
    write(fixture.repoRoot, "content/episode-001/story/script.json", "selected-valid-bytes\n");
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      runTool: async (input) => {
        write(input.cwd, "content/episode-001/story/script.json", "candidate-bytes\n");
        throw new Error("simulated tool failure");
      },
    });

    const result = await adapter(requestFor(fixture));
    expect(result).toMatchObject({
      status: "FAILED",
      stage: "materialize:story",
      failure: {code: "PRODUCTION_TOOL_FAILED"},
    });
    expect(fs.readFileSync(scriptPath, "utf8")).toBe("selected-valid-bytes\n");
    expect(
      fs.existsSync(path.join(fixture.repoRoot, "content/episode-001/artifact-index.json")),
    ).toBe(false);
  });

  it("rejects a changed frozen input before invoking the existing script", async () => {
    const fixture = createFixture();
    let calls = 0;
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      runTool: () => {
        calls += 1;
        return {stdout: "", stderr: ""};
      },
    });
    write(fixture.repoRoot, "content/episode-001/story/final-script.md", "changed after freeze\n");

    const result = await adapter(requestFor(fixture));
    expect(result.status).toBe("FAILED");
    expect(result.failure?.detail).toMatch(/hash mismatch/u);
    expect(calls).toBe(0);
  });

  it("runs all nine stages in order and keeps the pipeline state reference-only", async () => {
    const fixture = createFixture();
    const calls: ProductionStageName[] = [];
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        calls.push(input.stage);
        writeStageOutputs(input);
        return {stdout: "ok", stderr: ""};
      },
    });

    const result = await runProductionPipeline({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      adapter,
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(calls).toEqual(productionStageOrder);
    expect(Object.keys(result.state.productionStages)).toEqual([...productionStageOrder]);
    expect(result.state.phase).toBe("delivery_eval");
    expect(JSON.stringify(result.state)).not.toContain("用户先收到一条消息");
    expect(JSON.stringify(result.state)).not.toContain("fixture audio bytes");
    expect(JSON.stringify(result.state)).not.toContain("fixture vertical video");

    const resumed = await runProductionPipeline({
      repoRoot: fixture.repoRoot,
      state: result.state,
      adapter,
    });
    expect(resumed.status).toBe("SUCCEEDED");
    expect(calls).toEqual(productionStageOrder);
    expect(resumed.results.every((stage) => stage.status === "SKIPPED")).toBe(true);
  });

  it("connects the M3.1 adapter to the LangGraph production subgraph", async () => {
    const fixture = createFixture();
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        writeStageOutputs(input);
        return {stdout: "ok", stderr: ""};
      },
    });
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "adapter-subgraph.sqlite",
      }),
      adapter,
    });

    const result = await graph.invoke(fixture.state, {
      configurable: {thread_id: "adapter-subgraph"},
    });
    expect(result.phase).toBe("production_ready");
    expect(result.productionRepair.status).toBe("production-ready");
    expect(
      Object.values(result.productionStages).every((stage) => stage.status === "SUCCEEDED"),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture audio bytes");
  });

  it("publishes a structured Delivery REJECT issue without storing report body in state", async () => {
    const fixture = createFixture();
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        writeStageOutputs(input);
        if (input.stage === "validate:delivery") {
          write(
            input.cwd,
            "content/episode-001/production/delivery-critic-report.md",
            `fixture report body must stay out of state\n<!-- delivery-gate\n${JSON.stringify({
              rubricVersion: "delivery-critic-v1",
              reviewedVideo: "output/episode-001/vertical_9x16.mp4",
              reviewedVideoSha256: "0".repeat(64),
              reviewedSubtitles: "output/episode-001/subtitles_zh.srt",
              reviewedSubtitlesSha256: "0".repeat(64),
              reviewedTimeline: "content/episode-001/production/timeline.json",
              reviewedTimelineSha256: "0".repeat(64),
              metrics: {
                captionWordBreaks: 1,
                englishWordBreaks: 0,
                microCueThresholdSeconds: 1,
                microCueCount: 0,
                microCueRatio: 0,
                microCueRatioLimit: 0.1,
                minimumCueSeconds: 1,
                firstFrameZeroContextReadable: true,
                speechClippingOrSwallowing: false,
              },
              blockers: ["caption split requires repair"],
              verdict: "REJECT",
              returnTo: "captions",
            })}\n-->\n`,
          );
          throw new Error("fixture delivery reject");
        }
        return {stdout: "ok", stderr: ""};
      },
    });

    const result = await runProductionPipeline({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      adapter,
    });
    const delivery = result.results.at(-1);
    const issue = delivery?.issues[0];
    expect(result.status).toBe("FAILED");
    expect(delivery).toMatchObject({
      stage: "validate:delivery",
      status: "FAILED",
      failure: {code: "DELIVERY_REJECTED"},
    });
    expect(issue).toMatchObject({
      category: "delivery.caption-split",
      ownerAgent: "production-executor",
      routeTarget: "captions",
      restartAt: "timeline",
      status: "open",
    });
    expect(issue?.issueRef.path).toMatch(
      /^content\/episode-001\/production\/issues\/issue-delivery-r\d+-01\.json$/u,
    );
    expect(result.state.phase).toBe("halted");
    expect(result.state.productionIssues[issue?.issueId ?? ""]?.issueRef).toEqual(issue?.issueRef);
    expect(JSON.stringify(result.state)).not.toContain(
      "fixture report body must stay out of state",
    );
    const issueBody = fs.readFileSync(
      path.join(fixture.repoRoot, issue?.issueRef.path ?? ""),
      "utf8",
    );
    expect(issueBody).toContain('"schemaVersion":"production-issue-v1"');
    expect(issueBody).toContain("caption split requires repair");
    expect(issueBody).not.toContain("fixture report body must stay out of state");
  });

  it("marks the selected downstream closure stale when a repaired timeline changes", async () => {
    const fixture = createFixture();
    let timelineRevision = 0;
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        writeStageOutputs(input);
        if (input.stage === "timeline" && timelineRevision > 0) {
          write(
            input.cwd,
            "content/episode-001/production/timeline.json",
            `{"repair":${timelineRevision}}\n`,
          );
        }
        return {stdout: "ok", stderr: ""};
      },
    });

    const first = await runProductionPipeline({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      adapter,
    });
    expect(first.status).toBe("SUCCEEDED");
    timelineRevision = 1;
    const timelineCheckpoint = first.state.productionStages.timeline;
    expect(timelineCheckpoint).toBeDefined();
    const timelineRequest = productionStageRequestForState({
      state: first.state,
      stage: "timeline",
      upstreamArtifacts: productionStageInputArtifacts(first.state, "timeline").filter(
        (artifact) => artifact.artifactId !== fixture.manifestRef.artifactId,
      ),
      authorizedArtifactIds: timelineCheckpoint?.outputArtifacts.map(
        (artifact) => artifact.artifactId,
      ),
      forceRerun: true,
    });
    const repaired = await adapter(timelineRequest);
    expect(repaired.status).toBe("SUCCEEDED");
    expect(
      repaired.outputArtifacts.find((artifact) => artifact.artifactId.endsWith(":timeline")),
    ).toMatchObject({revision: 2});

    const registry = readArtifactIndex(
      path.join(fixture.repoRoot, "content/episode-001/artifact-index.json"),
    );
    const downstreamStages = productionStageOrder.slice(5);
    for (const stage of downstreamStages) {
      for (const artifact of first.state.productionStages[stage]?.outputArtifacts ?? []) {
        const historical = registry.artifacts.find(
          (record) =>
            record.ref.artifactId === artifact.artifactId &&
            record.ref.revision === artifact.revision &&
            record.ref.sha256 === artifact.sha256,
        );
        expect(historical?.state, `${stage}:${artifact.artifactId}`).toBe("stale");
        expect(registry.selected[artifact.artifactId]).toBeUndefined();
      }
    }
  });

  it("exposes a partial state update suitable for a LangGraph node", async () => {
    const fixture = createFixture();
    const adapter = createDeterministicToolAdapter({
      repoRoot: fixture.repoRoot,
      createWorkspace: copyWorkspace,
      createdAt: () => "2026-08-13T00:00:00.000Z",
      runTool: async (input) => {
        writeStageOutputs(input);
        return {stdout: "ok", stderr: ""};
      },
    });

    const update = await createProductionStageNode({
      stage: "materialize:story",
      adapter,
    })(fixture.state);
    expect(Object.keys(update).sort()).toEqual(
      ["artifacts", "attempts", "phase", "productionStages"].sort(),
    );
    expect(update.productionStages?.["materialize:story"]?.outputArtifacts).toHaveLength(3);
    expect(JSON.stringify(update)).not.toContain("用户先收到一条消息");
  });
});
