import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentNames,
  buildArtifactRef,
  closeCheckpointBackend,
  contentCriticNames,
  createLocalCheckpoint,
  createManualFileAdapter,
  deliveryCriticResultPath,
  deliveryCriticResultSchema,
  getRoleModelContract,
  loadAgentModelPolicyFile,
  loadRoleModelContractFile,
  productionIssueSchema,
  productionStageInputSetHash,
  productionStageResultSchema,
  readDeliveryCriticReviewPackage,
  snapshotSelectedArtifactHistory,
  runLangGraphEpisode,
  type ArtifactRef,
  type ContentCriticName,
  type ContentLoopNodes,
  type ProductionStageAdapter,
} from "../../src/orchestration";
import {parseDeliveryGate} from "../../src/lib/delivery/delivery";
import {generatedCaptionsPath} from "../../src/lib/episode/render-contract";
import {scriptSchema, timelineSchema, type Script, type Timeline} from "../../src/schemas/episode";
import {
  createDeterministicVerificationProvider,
  createStubShortClipExtractor,
  type MediaVerificationProviderOutput,
} from "../../src/media/verify";
import {createStubRenderProxyExtractor} from "../../src/media/render";
import {criticResultFixture} from "../helpers/critics";
import {
  setupReadyMediaEpisode,
  writeInspection,
  writeJson,
  writeVerticalMp4,
} from "../helpers/media-e2e-pipeline";
import {
  loadRoleModelContractFile as loadContractFile,
  roleContractOutputArtifactId,
  resolveRoleContractPath,
  roleContractPromptPath,
} from "../../src/orchestration/agents/benchmark/role-contract";

const temporaryDirectories: string[] = [];
const CANARY_NOW = "2026-08-27T00:00:00.000Z";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const writeText = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const seedContractFiles = (repoRoot: string, episodeId: string): void => {
  const contracts = loadContractFile();
  writeText(repoRoot, `content/${episodeId}/episode.config.json`, "{}\n");
  for (const role of agentNames) {
    const contract = getRoleModelContract(role, contracts);
    writeText(repoRoot, roleContractPromptPath(repoRoot, role, episodeId), `prompt:${role}\n`);
    const paths = [
      ...contract.allowedFrozenInputs,
      ...contract.upstreamGatePaths,
      ...contract.expectedOutputs.map((output) => output.path),
    ];
    for (const contractPath of paths) {
      const resolved = resolveRoleContractPath(episodeId, contractPath);
      const absolute = path.join(repoRoot, resolved);
      if (!fs.existsSync(absolute)) writeText(repoRoot, resolved, `fixture:${resolved}\n`);
    }
  }
};

const canaryScript = (): Script =>
  scriptSchema.parse({
    selectedHook: "产品演示打开主界面",
    segments: [
      {
        id: "seg-001",
        section: "hook",
        narration: "产品演示打开主界面",
        onScreenText: [],
        claimIds: ["claim-fixture-001"],
        scene: "e2e-demo",
        visualIntent: "主界面操作流程演示",
        targetSeconds: 2.5,
      },
      {
        id: "seg-002",
        section: "body",
        narration: "产品演示展示用户反馈",
        onScreenText: [],
        claimIds: ["claim-fixture-001"],
        scene: "e2e-feedback",
        visualIntent: "用户反馈与产品界面演示",
        targetSeconds: 38,
      },
    ],
  });

const canaryTimeline = (episodeId: string, repaired: boolean): Timeline =>
  timelineSchema.parse({
    episodeId,
    layoutVariant: "poke-standard",
    fps: 30,
    totalFrames: 1215,
    totalSeconds: 40.5,
    ttsProvider: "fixture",
    captionAlignment: "caption-plan-proportional",
    scenes: [
      {
        id: "seg-001",
        section: "hook",
        narration: "产品演示打开主界面",
        onScreenText: [],
        claimIds: ["claim-fixture-001"],
        scene: "e2e-demo",
        visualIntent: "主界面操作流程演示",
        targetSeconds: 2.5,
        index: 0,
        startFrame: 0,
        durationFrames: 75,
        startSeconds: 0,
        endSeconds: 2.5,
        audioDurationSeconds: 2.5,
        audio: `episodes/${episodeId}/audio/seg-001.mp3`,
      },
      {
        id: "seg-002",
        section: "body",
        narration: "产品演示展示用户反馈",
        onScreenText: repaired ? ["修复后"] : [],
        claimIds: ["claim-fixture-001"],
        scene: "e2e-feedback",
        visualIntent: "用户反馈与产品界面演示",
        targetSeconds: 38,
        index: 1,
        startFrame: 75,
        durationFrames: 1140,
        startSeconds: 2.5,
        endSeconds: 40.5,
        audioDurationSeconds: 38,
        audio: `episodes/${episodeId}/audio/seg-002.mp3`,
      },
    ],
  });

const captionPlanFor = (script: Script) => ({
  segments: script.segments.map((segment) => ({
    segmentId: segment.id,
    cues: [segment.narration],
  })),
});

const writeSrt = (repoRoot: string, episodeId: string): void => {
  writeText(
    repoRoot,
    `output/${episodeId}/subtitles_zh.srt`,
    [
      "1",
      "00:00:00,000 --> 00:00:02,500",
      "产品演示打开主界面",
      "",
      "2",
      "00:00:02,500 --> 00:00:40,500",
      "产品演示展示用户反馈",
      "",
    ].join("\n"),
  );
};

const createPassingContentNodes = (repoRoot: string, episodeId: string): ContentLoopNodes => {
  const critics = Object.fromEntries(
    contentCriticNames.map((critic) => [
      critic,
      (context: Parameters<ContentLoopNodes["critics"][ContentCriticName]>[0]) => {
        const finalScript = Object.values(context.artifacts).find((ref) =>
          ref.path.endsWith("/story/final-script.md"),
        );
        if (!finalScript) throw new Error("GRAPH_CANARY_FINAL_SCRIPT_MISSING");
        const result = criticResultFixture({
          episodeId,
          critic,
          reviewedArtifacts: [finalScript],
        });
        const repositoryPath =
          critic === "audience-critic"
            ? `content/${episodeId}/story/critic-report.md`
            : critic === "fact-guardian"
              ? `content/${episodeId}/story/fact-check-report.md`
              : `content/${episodeId}/story/retention-report.md`;
        writeText(repoRoot, repositoryPath, `${JSON.stringify(result, null, 2)}\n`);
        const resultRef = buildArtifactRef({
          repoRoot,
          artifactId: roleContractOutputArtifactId(episodeId, critic, repositoryPath),
          episodeId,
          path: repositoryPath,
          mediaType: "text/markdown",
          schemaVersion: "critic-output-v1",
          producer: `graph-canary:${critic}`,
          createdAt: CANARY_NOW,
        });
        return {result, resultRef};
      },
    ]),
  ) as ContentLoopNodes["critics"];
  return {
    visualDirector: () => {
      const repositoryPath = `content/${episodeId}/story/visual-plan.md`;
      writeText(repoRoot, repositoryPath, "graph closure visual plan\n");
      return [
        {
          ref: buildArtifactRef({
            repoRoot,
            artifactId: roleContractOutputArtifactId(episodeId, "visual-director", repositoryPath),
            episodeId,
            path: repositoryPath,
            mediaType: "text/markdown",
            schemaVersion: "visual-plan-v3",
            producer: "graph-canary:visual-director",
            createdAt: CANARY_NOW,
          }),
        },
      ];
    },
    critics,
  };
};

const verificationOutput = (input: {
  clip: {startMs: number; endMs: number};
}): MediaVerificationProviderOutput => ({
  verdict: "pass",
  relevance: 0.95,
  claimMatch: 0.95,
  visualQuality: 0.9,
  misleadingRisk: 0.05,
  observedActions: ["fixture UI operation"],
  observedEntities: [],
  observedText: ["产品核心功能演示 主界面"],
  recommendedStartMs: input.clip.startMs,
  recommendedEndMs: input.clip.endMs,
  reasons: ["bounded deterministic canary inspection passed"],
});

const refForOutput = (input: {
  repoRoot: string;
  episodeId: string;
  request: Parameters<ProductionStageAdapter>[0];
  artifactId: string;
  repositoryPath: string;
  mediaType: string;
  schemaVersion: string;
}): ArtifactRef =>
  buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.repositoryPath,
    mediaType: input.mediaType,
    schemaVersion: input.schemaVersion,
    producer: `graph-canary:${input.request.stage}`,
    previous: input.request.previousArtifacts.find((ref) => ref.artifactId === input.artifactId),
    createdAt: CANARY_NOW,
  });

const createCanaryProductionAdapter = (
  repoRoot: string,
  episodeId: string,
  calls: string[],
): ProductionStageAdapter =>
  async (request) => {
    calls.push(`${request.stage}:${request.attempt}:${request.forceRerun ? "force" : "normal"}`);
    const repaired = request.attempt > 1 || request.forceRerun === true;
    const writeArtifact = (repositoryPath: string, value: unknown): ArtifactRef => {
      writeJson(path.join(repoRoot, repositoryPath), value);
      return refForOutput({
        repoRoot,
        episodeId,
        request,
        artifactId: `${episodeId}:production:canary-${request.stage.replaceAll(":", "-")}-${path.basename(repositoryPath, path.extname(repositoryPath))}`,
        repositoryPath,
        mediaType: "application/json",
        schemaVersion: "canary-output-v1",
      });
    };

    if (
      request.cached &&
      !request.forceRerun &&
      request.cached.inputSetHash === productionStageInputSetHash(request.stage, request.inputArtifacts)
    ) {
      return productionStageResultSchema.parse({
        contractVersion: "production-stage-result-v1",
        executionId: request.executionId,
        episodeId,
        stage: request.stage,
        status: "SKIPPED",
        attempt: request.attempt,
        inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
        inputArtifacts: request.inputArtifacts,
        outputArtifacts: request.cached.outputArtifacts,
        issues: [],
        decision: {code: "GRAPH_CANARY_CACHED", summary: `${request.stage} reused its checkpoint`},
      });
    }

    let outputArtifacts: ArtifactRef[];
    if (request.stage === "materialize:story") {
      const scriptPath = `content/${episodeId}/story/script.json`;
      writeJson(path.join(repoRoot, scriptPath), canaryScript());
      outputArtifacts = [
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:story:script`,
          repositoryPath: scriptPath,
          mediaType: "application/json",
          schemaVersion: "script-v1",
        }),
        writeArtifact(`content/${episodeId}/story/narration.txt`, "产品演示打开主界面\n产品演示展示用户反馈\n"),
      ];
    } else if (request.stage === "tts") {
      const ttsPath = `content/${episodeId}/production/tts-metadata.json`;
      const captionsPath = `content/${episodeId}/production/captions.generated.json`;
      writeJson(path.join(repoRoot, ttsPath), {
        provider: "fixture",
        durationSeconds: 40.5,
        repaired,
      });
      writeJson(path.join(repoRoot, captionsPath), [
        {sceneId: "seg-001", text: "产品演示打开主界面"},
        {sceneId: "seg-002", text: "产品演示展示用户反馈"},
      ]);
      outputArtifacts = [
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:production:tts-metadata`,
          repositoryPath: ttsPath,
          mediaType: "application/json",
          schemaVersion: "tts-metadata-v1",
        }),
      ];
    } else if (request.stage === "timeline") {
      const timelinePath = `content/${episodeId}/production/timeline.json`;
      snapshotSelectedArtifactHistory({
        repoRoot,
        episodeId,
        refs: request.previousArtifacts.filter((ref) =>
          ref.artifactId === `${episodeId}:production:timeline`,
        ),
      });
      writeJson(path.join(repoRoot, timelinePath), canaryTimeline(episodeId, repaired));
      writeSrt(repoRoot, episodeId);
      outputArtifacts = [
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:production:timeline`,
          repositoryPath: timelinePath,
          mediaType: "application/json",
          schemaVersion: "timeline-v1",
        }),
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:delivery:subtitles`,
          repositoryPath: `output/${episodeId}/subtitles_zh.srt`,
          mediaType: "application/x-subrip",
          schemaVersion: "subtitles-srt-v1",
        }),
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:production:generated-captions`,
          repositoryPath: generatedCaptionsPath(episodeId),
          mediaType: "application/json",
          schemaVersion: "generated-captions-v1",
        }),
      ];
    } else if (request.stage === "render:vertical") {
      const videoPath = `output/${episodeId}/vertical_9x16.mp4`;
      if (!fs.existsSync(path.join(repoRoot, videoPath))) writeVerticalMp4(path.join(repoRoot, videoPath), 40.5);
      outputArtifacts = [
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:delivery:vertical-video`,
          repositoryPath: videoPath,
          mediaType: "video/mp4",
          schemaVersion: "video-vertical-v1",
        }),
      ];
    } else if (request.stage === "inspect:output") {
      const inspectionPath = `output/${episodeId}/inspection.json`;
      writeInspection(path.join(repoRoot, inspectionPath), {duration: 40.5});
      outputArtifacts = [
        refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:delivery:inspection`,
          repositoryPath: inspectionPath,
          mediaType: "application/json",
          schemaVersion: "inspection-v1",
        }),
      ];
    } else if (request.stage === "validate:delivery") {
      const reportPath = path.join(
        repoRoot,
        `content/${episodeId}/production/delivery-critic-report.md`,
      );
      const gate = parseDeliveryGate(fs.readFileSync(reportPath, "utf8"));
      if (gate.verdict === "REJECT") {
        const affectedArtifact = request.inputArtifacts.find(
          (ref) => ref.path === `output/${episodeId}/subtitles_zh.srt`,
        );
        if (!affectedArtifact) throw new Error("GRAPH_CANARY_SUBTITLES_REF_MISSING");
        const issuePath = `content/${episodeId}/production/issues/graph-canary-delivery.json`;
        writeJson(path.join(repoRoot, issuePath), {
          issueId: "issue-delivery-r1-01",
          category: "delivery.caption-timing",
          affectedArtifactId: affectedArtifact.artifactId,
          affectedArtifactSha256: affectedArtifact.sha256,
        });
        const issueRef = refForOutput({
          repoRoot,
          episodeId,
          request,
          artifactId: `${episodeId}:production:issue-graph-canary-delivery`,
          repositoryPath: issuePath,
          mediaType: "application/json",
          schemaVersion: "production-issue-v1",
        });
        const issue = productionIssueSchema.parse({
          issueId: "issue-delivery-r1-01",
          category: "delivery.caption-timing",
          severity: "blocker",
          status: "open",
          ownerAgent: "production-executor",
          routeTarget: "captions",
          restartAt: "timeline",
          affectedArtifact,
          locator: {kind: "srt-cue", value: "1"},
          summary: "controlled canary fault rejected one delivery caption cue",
          issueRef,
        });
        return productionStageResultSchema.parse({
          contractVersion: "production-stage-result-v1",
          executionId: request.executionId,
          episodeId,
          stage: request.stage,
          status: "FAILED",
          attempt: request.attempt,
          inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
          inputArtifacts: request.inputArtifacts,
          outputArtifacts: [],
          issues: [issue],
          decision: {code: "GRAPH_CANARY_DELIVERY_REJECTED", summary: gate.blockers.join("; ")},
          failure: {
            code: "DELIVERY_CRITIC_REJECTED",
            retryable: false,
            detail: "controlled Delivery Critic caption-cue rejection",
          },
        });
      }
      const receiptPath = `content/${episodeId}/production/adapter-receipts/validate-delivery.json`;
      outputArtifacts = [
        (() => {
          writeJson(path.join(repoRoot, receiptPath), {
            stage: request.stage,
            verdict: gate.verdict,
            repaired,
          });
          return refForOutput({
            repoRoot,
            episodeId,
            request,
            artifactId: `${episodeId}:production:receipt-validate-delivery`,
            repositoryPath: receiptPath,
            mediaType: "application/json",
            schemaVersion: "production-stage-receipt-v1",
          });
        })(),
      ];
    } else {
      if (request.stage === "render:smoke") {
        snapshotSelectedArtifactHistory({
          repoRoot,
          episodeId,
          refs: request.previousArtifacts.filter(
            (ref) =>
              ref.path ===
              `content/${episodeId}/production/adapter-receipts/render-smoke.json`,
          ),
        });
      }
      const repositoryPath = `content/${episodeId}/production/adapter-receipts/${request.stage.replaceAll(":", "-")}.json`;
      outputArtifacts = [writeArtifact(repositoryPath, {stage: request.stage, repaired})];
    }

    return productionStageResultSchema.parse({
      contractVersion: "production-stage-result-v1",
      executionId: request.executionId,
      episodeId,
      stage: request.stage,
      status: "SUCCEEDED",
      attempt: request.attempt,
      inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
      inputArtifacts: request.inputArtifacts,
      outputArtifacts,
      issues: [],
      decision: {code: "GRAPH_CANARY_STAGE_PASS", summary: `${request.stage} passed`},
    });
  };

const approvalFor = (input: {
  gate: "content-approval" | "final-approval";
  runId: string;
  approvalEpoch: number;
  artifactRefs: readonly ArtifactRef[];
  decisionId: string;
}) => ({
  schemaVersion: "human-decision-v1" as const,
  decisionId: input.decisionId,
  runId: input.runId,
  gate: input.gate,
  decision: "approve" as const,
  reviewer: "graph-closure-canary-human",
  timestamp: CANARY_NOW,
  reason: `explicit ${input.gate} approval for graph closure canary`,
  artifactRefs: [...input.artifactRefs],
  approvalEpoch: input.approvalEpoch,
  authorizations: [],
  edits: [],
});

const writeDeliveryResult = (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  packageRef: ArtifactRef;
  repositoryPath?: string;
  verdict?: "PASS" | "REJECT";
}): void => {
  const packageBody = readDeliveryCriticReviewPackage(input.repoRoot, input.episodeId, input.runId);
  const verdict = input.verdict ?? "PASS";
  const gate = {
    rubricVersion: "delivery-critic-v1" as const,
    reviewedVideo: packageBody.reviewedVideo.path,
    reviewedVideoSha256: packageBody.reviewedVideo.sha256,
    reviewedSubtitles: packageBody.reviewedSubtitles.path,
    reviewedSubtitlesSha256: packageBody.reviewedSubtitles.sha256,
    reviewedTimeline: packageBody.reviewedTimeline.path,
    reviewedTimelineSha256: packageBody.reviewedTimeline.sha256,
    metrics: {
      captionWordBreaks: 0,
      englishWordBreaks: 0,
      microCueThresholdSeconds: 1 as const,
      microCueCount: 0,
      microCueRatio: 0,
      microCueRatioLimit: 0.1 as const,
      minimumCueSeconds: 2.5,
      firstFrameZeroContextReadable: true,
      speechClippingOrSwallowing: false,
    },
    blockers: verdict === "PASS" ? [] : ["explicit canary rejection"],
    verdict,
    returnTo: verdict === "PASS" ? ("none" as const) : ("captions" as const),
  };
  writeJson(
    path.join(
      input.repoRoot,
      input.repositoryPath ?? deliveryCriticResultPath(input.episodeId, input.runId),
    ),
    deliveryCriticResultSchema.parse({
      schemaVersion: "delivery-critic-result-v1",
      episodeId: input.episodeId,
      runId: input.runId,
      threadId: input.episodeId,
      packageRef: input.packageRef,
      inputSetHash: packageBody.inputSetHash,
      reviewedVideo: packageBody.reviewedVideo,
      reviewedSubtitles: packageBody.reviewedSubtitles,
      reviewedTimeline: packageBody.reviewedTimeline,
      reviewedKeyframes: packageBody.reviewedKeyframes,
      reviewedClips: packageBody.reviewedClips,
      verdict,
      issues: [],
      deliveryGate: gate,
      completedAt: CANARY_NOW,
    }),
  );
};

type CanaryOutcome = {
  repoRoot: string;
  firstContentPause: Awaited<ReturnType<typeof runLangGraphEpisode>>;
  deliveryPause: Awaited<ReturnType<typeof runLangGraphEpisode>>;
  finalPause: Awaited<ReturnType<typeof runLangGraphEpisode>>;
  completed: Awaited<ReturnType<typeof runLangGraphEpisode>>;
  productionCalls: string[];
  mediaAttempts: Record<string, number>;
};

const runCanary = async (input: {episodeId: "episode-007" | "episode-008"; fault: boolean}): Promise<CanaryOutcome> => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `production-agent-${input.episodeId}-`));
  temporaryDirectories.push(repoRoot);
  await setupReadyMediaEpisode(repoRoot, input.episodeId);
  seedContractFiles(repoRoot, input.episodeId);
  const script = canaryScript();
  writeJson(path.join(repoRoot, `content/${input.episodeId}/story/caption-plan.json`), captionPlanFor(script));
  writeJson(path.join(repoRoot, `content/${input.episodeId}/production/asset-manifest.json`), []);
  const checkpointer = createLocalCheckpoint({
    repoRoot,
    databasePath: `.orchestration/${input.episodeId}.sqlite`,
  });
  const productionCalls: string[] = [];
  const manualAgent = createManualFileAdapter({
    repoRoot,
    createdAt: () => CANARY_NOW,
  });
  const common = {
    repoRoot,
    episodeId: input.episodeId,
    checkpointer,
    contracts: loadRoleModelContractFile(),
    policies: loadAgentModelPolicyFile(),
    runAgent: manualAgent,
    contentLoopNodes: createPassingContentNodes(repoRoot, input.episodeId),
    productionAdapter: createCanaryProductionAdapter(repoRoot, input.episodeId, productionCalls),
    media: {
      verificationProvider: createDeterministicVerificationProvider({output: verificationOutput}),
      shortClipExtractor: createStubShortClipExtractor(),
      proxyExtractor: createStubRenderProxyExtractor(),
      cache: null,
    },
    env: {
      ...process.env,
      ORCHESTRATOR: "langgraph",
      ...(input.fault ? {GRAPH_CANARY_FAULT: "delivery-caption-cue"} : {}),
    },
    createdAt: () => CANARY_NOW,
    now: () => CANARY_NOW,
  };

  try {
    const firstContentPause = await runLangGraphEpisode(common);
    expect(firstContentPause.status).toBe("paused");
    expect(firstContentPause.handoff?.gate).toBe("content-approval");
    const contentRunId = firstContentPause.runId!;
    const mediaPause = await runLangGraphEpisode({
      ...common,
      runId: contentRunId,
      resume: true,
      resumeValue: approvalFor({
        gate: "content-approval",
        runId: contentRunId,
        approvalEpoch: firstContentPause.handoff!.approvalEpoch,
        artifactRefs: firstContentPause.handoff!.artifactRefs,
        decisionId: `${input.episodeId}-content-approval`,
      }),
    });
    expect(mediaPause.status).toBe("paused");
    expect(mediaPause.runId).toBe(contentRunId);
    expect(mediaPause.handoff?.gate).toBe("external-capability");
    expect(mediaPause.handoff?.payload.capability).toBe("media-delivery-critic");
    const packageRef = mediaPause.handoff?.artifactRefs.find(
      (ref) => ref.artifactId === `${input.episodeId}:delivery:critic-review-package`,
    );
    if (!packageRef) throw new Error("GRAPH_CANARY_PACKAGE_REF_MISSING");
    const firstResultPath = mediaPause.handoff?.payload.expectedOutputPath;
    if (typeof firstResultPath !== "string") throw new Error("GRAPH_CANARY_RESULT_PATH_MISSING");
    writeDeliveryResult({
      repoRoot,
      episodeId: input.episodeId,
      runId: contentRunId,
      packageRef,
      repositoryPath: firstResultPath,
    });

    const afterDelivery = await runLangGraphEpisode({
      ...common,
      runId: contentRunId,
      resume: true,
    });
    if (input.fault) {
      expect(afterDelivery.status).toBe("paused");
      expect(afterDelivery.handoff?.gate).toBe("external-capability");
      expect(afterDelivery.handoff?.payload.capability).toBe("media-delivery-critic");
      expect(afterDelivery.state?.productionRepair.round).toBe(1);
      expect(afterDelivery.state?.productionRepair.route?.restartAt).toBe("timeline");
      expect(afterDelivery.state?.mediaStages["delivery-critic"]?.decision.code).toBe(
        "GRAPH_CANARY_FAULT_INJECTED",
      );
      const repairedPackageRef = afterDelivery.handoff?.artifactRefs.find(
        (ref) => ref.artifactId === `${input.episodeId}:delivery:critic-review-package`,
      );
      if (!repairedPackageRef) throw new Error("GRAPH_CANARY_REPAIRED_PACKAGE_REF_MISSING");
      const repairedResultPath = afterDelivery.handoff?.payload.expectedOutputPath;
      if (typeof repairedResultPath !== "string") throw new Error("GRAPH_CANARY_REPAIRED_RESULT_PATH_MISSING");
      writeDeliveryResult({
        repoRoot,
        episodeId: input.episodeId,
        runId: contentRunId,
        packageRef: repairedPackageRef,
        repositoryPath: repairedResultPath,
      });
    }

    const finalPause = input.fault
      ? await runLangGraphEpisode({...common, runId: contentRunId, resume: true})
      : afterDelivery;
    expect(finalPause.status).toBe("paused");
    expect(finalPause.handoff?.gate).toBe("final-approval");
    expect(finalPause.runId).toBe(contentRunId);
    const completed = await runLangGraphEpisode({
      ...common,
      runId: contentRunId,
      resume: true,
      resumeValue: approvalFor({
        gate: "final-approval",
        runId: contentRunId,
        approvalEpoch: finalPause.handoff!.approvalEpoch,
        artifactRefs: finalPause.handoff!.artifactRefs,
        decisionId: `${input.episodeId}-final-approval`,
      }),
    });
    expect(completed.status).toBe("completed");
    expect(completed.state?.phase).toBe("published");
    expect(completed.state?.gates["content-approval"]).toBe("pass");
    expect(completed.state?.gates["final-approval"]).toBe("pass");
    const mediaAttempts = Object.fromEntries(
      Object.entries(completed.state?.mediaStages ?? {}).map(([stage, checkpoint]) => [
        stage,
        checkpoint.attempt,
      ]),
    );
    return {
      repoRoot,
      firstContentPause,
      deliveryPause: mediaPause,
      finalPause,
      completed,
      productionCalls,
      mediaAttempts,
    };
  } finally {
    await closeCheckpointBackend(checkpointer);
  }
};

describe("Graph Production Closure canaries", () => {
  it("runs fresh episode-007 through content approval, media review, and final approval on one run", async () => {
    const outcome = await runCanary({episodeId: "episode-007", fault: false});
    const state = outcome.completed.state!;
    expect(outcome.firstContentPause.runId).toBe(outcome.completed.runId);
    expect(outcome.deliveryPause.handoff?.payload.capability).toBe("media-delivery-critic");
    expect(state.mediaStages["discovery"]?.status).toBe("SUCCEEDED");
    expect(state.mediaStages["retrieve"]?.status).toBe("SUCCEEDED");
    expect(state.mediaStages["verify"]?.status).toBe("SUCCEEDED");
    expect(state.mediaStages["select"]?.status).toBe("SUCCEEDED");
    expect(state.mediaStages["render-plan"]?.status).toBe("SUCCEEDED");
    expect(state.mediaStages["pre-render"]?.decision.code).toBe("PRE_RENDER_GATE_PASSED");
    expect(state.mediaStages["delivery-critic"]?.decision.code).toBe("DELIVERY_CRITIC_PASS");
    expect(outcome.mediaAttempts).toMatchObject({
      discovery: 1,
      retrieve: 1,
      verify: 1,
      select: 1,
      "render-plan": 1,
      "pre-render": 1,
      "delivery-critic": 1,
    });
    expect(outcome.productionCalls.map((call) => call.split(":")[0])).toEqual([
      "materialize",
      "validate",
      "capture",
      "tts",
      "timeline",
      "render",
      "render",
      "inspect",
      "validate",
    ]);
    const gate = JSON.parse(
      fs.readFileSync(
        path.join(
          outcome.repoRoot,
          state.artifacts[`${state.episodeId}:production:pre-render-gate`]!.path,
        ),
        "utf8",
      ),
    ) as {verdict: string; checks: Record<string, boolean>};
    expect(gate.verdict).toBe("PASS");
    expect(Object.values(gate.checks).every(Boolean)).toBe(true);
    const serializedState = JSON.stringify(state);
    expect(serializedState).not.toMatch(/"body":\s*["{[]/u);
    expect(serializedState).not.toMatch(/"transcript":\s*["{[]/u);
    expect(serializedState).not.toMatch(/"cues":\s*["{[]/u);
  });

  it("runs fresh episode-008 through the forced caption rejection, scoped repair, re-review, and final approval", async () => {
    const outcome = await runCanary({episodeId: "episode-008", fault: true});
    const state = outcome.completed.state!;
    expect(state.productionRepair.round).toBe(1);
    expect(state.productionRepair.status).toBe("production-ready");
    expect(state.mediaStages["delivery-critic"]?.decision.code).toBe("DELIVERY_CRITIC_PASS");
    expect(outcome.mediaAttempts).toMatchObject({
      discovery: 1,
      retrieve: 1,
      verify: 1,
      select: 1,
      "render-plan": 2,
      "pre-render": 2,
      "delivery-critic": 2,
    });
    const productionStageCalls = outcome.productionCalls.map((call) => call.split(":")[0]);
    expect(productionStageCalls).toEqual([
      "materialize",
      "validate",
      "capture",
      "tts",
      "timeline",
      "render",
      "render",
      "inspect",
      "validate",
      "timeline",
      "render",
      "render",
      "inspect",
      "validate",
    ]);
    expect(outcome.finalPause.handoff?.gate).toBe("final-approval");
    expect(state.events.length).toBeGreaterThan(0);
    const serializedState = JSON.stringify(state);
    expect(serializedState).not.toMatch(/"body":\s*["{[]/u);
    expect(serializedState).not.toMatch(/"transcript":\s*["{[]/u);
    expect(serializedState).not.toMatch(/"cues":\s*["{[]/u);

    const historyRoot = path.join(outcome.repoRoot, `content/${state.episodeId}/.artifact-history`);
    expect(fs.existsSync(historyRoot)).toBe(true);
    expect(fs.readdirSync(historyRoot, {recursive: true}).length).toBeGreaterThan(0);
  });
});
