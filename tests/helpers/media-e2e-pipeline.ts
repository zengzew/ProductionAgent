import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  artifactDependencySchema,
  buildArtifactRef,
  emptyArtifactIndex,
  humanDecisionSchema,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  writeArtifactIndexCas,
  type ArtifactDependency,
  type ArtifactRef,
  type HumanDecision,
} from "../../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  buildMediaArtifactRef,
  createDeterministicSemanticAdapter,
  createStubKeyframeExtractor,
  createStubTranscriptProvider,
  getMediaSource,
  indexMediaAsset,
  mediaAssetSchema,
  mediaRetrievalRequestSchema,
  proposeMediaSource,
  readMediaRetrievalResult,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaAsset,
  writeMediaSourceManifestCas,
  type MediaAsset,
  type MediaRightsStatus,
  type MediaSourceType,
  type MediaUnderstandingConfig,
} from "../../src/media";
import {
  createDeterministicVerificationProvider,
  createStubShortClipExtractor,
  mediaVerificationRequestSchema,
  verifyMediaClip,
  type MediaVerificationProvider,
  type MediaVerificationProviderOutput,
  type MediaVerificationRequest,
} from "../../src/media/verify";
import {
  readVisualSlot,
  selectVisualSlotForSegment,
  type VisualSlotOutcome,
} from "../../src/media/select";
import {retrieveMediaCandidates} from "../../src/media/retrieve";
import {timelineSchema, type Timeline} from "../../src/schemas/episode";
import {
  MEDIA_RENDER_DEPENDENCY_PATHS,
  buildMediaRenderPlanForTimeline,
  createStubRenderProxyExtractor,
} from "../../src/media/render";

export const E2E_FIXED_NOW = "2026-08-18T00:00:00.000Z";
export const E2E_EPISODE_ID = "episode-m5e2e";

export const sha256OfBytes = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

export const sha256OfFile = (filePath: string): string => sha256OfBytes(fs.readFileSync(filePath));

export const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const manifestRefFor = (repoRoot: string, episodeId: string): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:media:source-manifest`,
    episodeId,
    path: `content/${episodeId}/media/source-manifest.json`,
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "m5-e2e-fixture",
    createdAt: E2E_FIXED_NOW,
  });

const makeDecision = (input: {
  gate: "media-admission" | "media-rights";
  decision: "approve" | "reject";
  ref: ArtifactRef;
  decisionId: string;
}): HumanDecision =>
  humanDecisionSchema.parse({
    decisionId: input.decisionId,
    gate: input.gate,
    decision: input.decision,
    reviewer: "m5-e2e-reviewer",
    timestamp: E2E_FIXED_NOW,
    reason: "M5.09 e2e fixture decision",
    artifactRefs: [input.ref],
    approvalEpoch: 0,
  });

const approveSource = (
  repoRoot: string,
  episodeId: string,
  sourceId: string,
  sourceType: MediaSourceType,
): void => {
  const proposal = proposeMediaSource({
    repoRoot,
    episodeId,
    source: {
      sourceId,
      sourceUrl: "",
      publisher: "M5 E2E Fixture",
      sourceType,
      rightsBasis: "Locally generated acceptance fixture",
      rightsStatus: "review-required" as MediaRightsStatus,
      notes: "M5.09 e2e",
    },
  });
  applyMediaSourceAdmission({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref: manifestRefFor(repoRoot, episodeId),
      decisionId: `admission-${sourceId.replace(/[^a-z0-9-]/gu, "-")}`,
    }),
    expectedManifestVersion: proposal.version,
  });
  applyMediaSourceRights({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: makeDecision({
      gate: "media-rights",
      decision: "approve",
      ref: manifestRefFor(repoRoot, episodeId),
      decisionId: `rights-${sourceId.replace(/[^a-z0-9-]/gu, "-")}`,
    }),
    expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
};

const decisionDependencies = (
  repoRoot: string,
  episodeId: string,
  sourceId: string,
): ArtifactDependency[] => {
  const source = getMediaSource(readMediaSourceManifest(repoRoot, episodeId), sourceId);
  if (!source) throw new Error("fixture source missing");
  const dependencies: ArtifactDependency[] = [];
  for (const ref of [source.admissionDecisionRef, source.rightsDecisionRef]) {
    if (ref) {
      dependencies.push(
        artifactDependencySchema.parse({
          artifactId: ref.artifactId,
          path: ref.path,
          sha256: ref.sha256,
          relation: "reads",
        }),
      );
    }
  }
  return dependencies;
};

const registerCandidateInIndex = (
  repoRoot: string,
  episodeId: string,
  ref: ArtifactRef,
  executionId: string,
  sourceId: string,
): void => {
  const filePath = path.join(repoRoot, "content", episodeId, "artifact-index.json");
  const expectedVersion = readArtifactIndexVersion(filePath);
  let index = fs.existsSync(filePath) ? readArtifactIndex(filePath) : emptyArtifactIndex(episodeId);
  index = registerCandidate(
    index,
    ref,
    executionId,
    decisionDependencies(repoRoot, episodeId, sourceId),
  );
  writeArtifactIndexCas({filePath, index, expectedVersion, casRoot: repoRoot});
};

const fabricateOriginal = (input: {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  sourceId: string;
  bytes: Uint8Array;
  durationMs: number;
}): MediaAsset => {
  const filename = `${input.mediaId.slice(`${input.episodeId}:media:`.length)}.mp4`;
  const filePath = path.join(
    input.repoRoot,
    "content",
    input.episodeId,
    "media",
    "assets",
    filename,
  );
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, input.bytes);
  const source = getMediaSource(
    readMediaSourceManifest(input.repoRoot, input.episodeId),
    input.sourceId,
  );
  if (!source) throw new Error("fixture source missing");
  const ref = buildMediaArtifactRef({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    filename,
    mediaType: "video/mp4",
    producer: "m5-e2e-fixture",
    createdAt: E2E_FIXED_NOW,
  });
  const asset = mediaAssetSchema.parse({
    mediaId: input.mediaId,
    episodeId: input.episodeId,
    mediaSourceId: input.sourceId,
    sourceUrl: source.sourceUrl,
    publisher: source.publisher,
    sourceType: source.sourceType,
    acquisitionMethod: "local-approved",
    originalFilename: filename,
    mediaType: "video/mp4",
    sha256: ref.sha256,
    sizeBytes: ref.sizeBytes,
    durationMs: input.durationMs,
    width: 1280,
    height: 720,
    fps: 30,
    audioChannels: null,
    capturedAt: E2E_FIXED_NOW,
    accessedAt: E2E_FIXED_NOW,
    publishedAt: null,
    rightsBasis: "Owner-provided fixture",
    rightsStatus: "approved",
    artifactRef: ref,
    kind: "original",
  });
  const registered = registerMediaAsset({
    repoRoot: input.repoRoot,
    manifest: readMediaSourceManifest(input.repoRoot, input.episodeId),
    asset,
  });
  writeMediaSourceManifestCas({
    repoRoot: input.repoRoot,
    manifest: registered,
    expectedVersion: readMediaSourceManifestVersion(input.repoRoot, input.episodeId),
  });
  registerCandidateInIndex(
    input.repoRoot,
    input.episodeId,
    ref,
    `media-ingest:${input.mediaId}`,
    input.sourceId,
  );
  return asset;
};

const stubConfig: MediaUnderstandingConfig = {
  scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
  clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
  keyframe: {quality: 2, mediaType: "image/jpeg"},
};

const DEMO_SEGMENTS = [
  {text: "产品核心功能演示 主界面 交互 反馈", startMs: 0, endMs: 4000, speaker: "host"},
  {text: "用户反馈 产品 演示 界面", startMs: 4000, endMs: 8000, speaker: "host"},
  {text: "公司成立 日期 2024 庆典", startMs: 8000, endMs: 10000, speaker: "host"},
] as const;

const writeFacts = (repoRoot: string, episodeId: string): void => {
  const directory = path.join(repoRoot, "content", episodeId, "research");
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(
    path.join(directory, "facts.json"),
    `${JSON.stringify(
      [
        {
          id: "claim-fixture-001",
          claim: "产品核心功能演示 展示了 主界面 交互",
          metricName: "",
          value: "",
          period: "",
          eventDate: "",
          sourceIds: ["src-fixture-0"],
          confidence: "high",
          reportingType: "independently-verified",
          allowedInNarration: true,
          notes: "e2e",
        },
        {
          id: "claim-fixture-003",
          claim: "公司成立 日期 是 2024",
          metricName: "",
          value: "",
          period: "",
          eventDate: "",
          sourceIds: ["src-fixture-1"],
          confidence: "high",
          reportingType: "company-reported",
          allowedInNarration: true,
          notes: "e2e",
        },
      ],
      null,
      2,
    )}\n`,
  );
};

export const writeCaptions = (repoRoot: string, episodeId: string): void => {
  writeJson(path.join(repoRoot, "content", episodeId, "production", "captions.generated.json"), []);
};

export const makeDeliveryTimeline = (episodeId: string): Timeline =>
  timelineSchema.parse({
    episodeId,
    layoutVariant: "poke-standard",
    fps: 30,
    totalFrames: 1230,
    totalSeconds: 41,
    ttsProvider: "fixture",
    captionAlignment: "caption-plan-proportional",
    scenes: [
      {
        id: "seg-001",
        section: "hook",
        narration: "产品核心功能演示 展示了 主界面 交互",
        onScreenText: [],
        claimIds: ["claim-fixture-001"],
        scene: "e2e-demo",
        visualIntent: "主界面操作流程演示",
        targetSeconds: 20.5,
        index: 0,
        startFrame: 0,
        durationFrames: 615,
        startSeconds: 0,
        endSeconds: 20.5,
        audioDurationSeconds: 20,
        audio: `episodes/${episodeId}/audio/seg-001.mp3`,
      },
      {
        id: "seg-002",
        section: "body",
        narration: "公司成立 日期 是 2024",
        onScreenText: [],
        claimIds: ["claim-fixture-003"],
        scene: "e2e-founding",
        visualIntent: "成立日期证据",
        targetSeconds: 20.5,
        index: 1,
        startFrame: 615,
        durationFrames: 615,
        startSeconds: 20.5,
        endSeconds: 41,
        audioDurationSeconds: 20,
        audio: `episodes/${episodeId}/audio/seg-002.mp3`,
      },
    ],
  });

export const writeTimeline = (repoRoot: string, episodeId: string, timeline: Timeline): string => {
  const filePath = path.join(repoRoot, "content", episodeId, "production", "timeline.json");
  writeJson(filePath, timeline);
  return sha256OfFile(filePath);
};

const passProvider = (): MediaVerificationProvider =>
  createDeterministicVerificationProvider({
    output: (input): MediaVerificationProviderOutput => ({
      verdict: "pass",
      relevance: 0.9,
      claimMatch: 0.9,
      visualQuality: 0.8,
      misleadingRisk: 0.1,
      observedActions: ["fixture UI operation"],
      observedEntities: [],
      observedText: ["产品核心功能演示 主界面"],
      recommendedStartMs: input.clip.startMs,
      recommendedEndMs: input.clip.endMs,
      reasons: ["deterministic e2e VLM stub observed the short clip only"],
    }),
  });

export const e2eDependencyHashes = (): Record<string, string> =>
  Object.fromEntries(
    MEDIA_RENDER_DEPENDENCY_PATHS.map((repositoryPath, index) => [
      repositoryPath,
      `${index.toString(16).padStart(2, "0")}`.repeat(32),
    ]),
  );

export type ReadyMediaEpisode = {
  repoRoot: string;
  episodeId: string;
  sourceId: string;
  mediaId: string;
  originalPath: string;
  clipId: string;
  verificationPath: string;
  selectionPath: string;
  slot: VisualSlotOutcome;
};

export const setupReadyMediaEpisode = async (
  repoRoot: string,
  episodeId = E2E_EPISODE_ID,
): Promise<ReadyMediaEpisode> => {
  writeFacts(repoRoot, episodeId);
  const sourceId = `${episodeId}:media-source:official`;
  const mediaId = `${episodeId}:media:demo`;
  approveSource(repoRoot, episodeId, sourceId, "local-approved");
  const original = fabricateOriginal({
    repoRoot,
    episodeId,
    mediaId,
    sourceId,
    bytes: Buffer.from("m5.09 e2e original media bytes v1"),
    durationMs: 10000,
  });
  await indexMediaAsset({
    repoRoot,
    episodeId,
    mediaId,
    cache: null,
    transcriptProvider: createStubTranscriptProvider({segments: [...DEMO_SEGMENTS]}),
    semanticAdapter: createDeterministicSemanticAdapter(),
    keyframeExtractor: createStubKeyframeExtractor(),
    config: stubConfig,
    now: () => E2E_FIXED_NOW,
  });
  const request = mediaRetrievalRequestSchema.parse({
    schemaVersion: "media-retrieval-request-v1",
    episodeId,
    segmentId: "seg-001",
    claimIds: ["claim-fixture-001"],
    narration: "产品核心功能演示 展示了 主界面 交互",
    visualIntent: "主界面操作流程演示",
    topK: 5,
  });
  const retrieval = await retrieveMediaCandidates({
    repoRoot,
    episodeId,
    request,
    cache: null,
    now: () => E2E_FIXED_NOW,
  });
  const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
  const candidate = result.candidates[0];
  if (!candidate) throw new Error("e2e retrieval produced no candidates");
  const verifyRequest: MediaVerificationRequest = mediaVerificationRequestSchema.parse({
    schemaVersion: "media-verification-request-v1",
    episodeId,
    segmentId: "seg-001",
    clipId: candidate.clipId,
    claimIds: ["claim-fixture-001"],
    narration: request.narration,
    visualIntent: request.visualIntent,
    retrievalResultRef: retrieval.artifactRef,
    maxKeyframes: 4,
  });
  await verifyMediaClip({
    repoRoot,
    episodeId,
    request: verifyRequest,
    provider: passProvider(),
    cache: null,
    shortClipExtractor: createStubShortClipExtractor(),
    now: () => E2E_FIXED_NOW,
  });
  const slot = await selectVisualSlotForSegment({
    repoRoot,
    episodeId,
    segment: {
      segmentId: "seg-001",
      claimIds: ["claim-fixture-001"],
      narration: request.narration,
      visualIntent: request.visualIntent,
      durationTargetMs: 7000,
    },
    now: () => E2E_FIXED_NOW,
  });
  if (slot.selectedType !== "real-media") {
    throw new Error(`e2e expected real-media, got ${slot.selectedType}`);
  }
  const persisted = readVisualSlot(repoRoot, episodeId, "seg-001");
  if (!persisted.verificationRef) throw new Error("e2e slot missing verificationRef");
  writeCaptions(repoRoot, episodeId);
  const timeline = makeDeliveryTimeline(episodeId);
  const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
  buildMediaRenderPlanForTimeline({
    repoRoot,
    episodeId,
    timeline,
    timelineSha256,
    proxyExtractor: createStubRenderProxyExtractor(),
    cacheDependencyHashes: e2eDependencyHashes(),
    now: () => E2E_FIXED_NOW,
  });
  return {
    repoRoot,
    episodeId,
    sourceId,
    mediaId,
    originalPath: path.join(repoRoot, original.artifactRef.path),
    clipId: candidate.clipId,
    verificationPath: path.join(repoRoot, persisted.verificationRef.path),
    selectionPath: path.join(repoRoot, "content", episodeId, "media", "selections", "seg-001.json"),
    slot,
  };
};

export const writeVerticalMp4 = (filePath: string, durationSeconds: number): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=1080x1920:rate=30:duration=${durationSeconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:sample_rate=48000:duration=${durationSeconds}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      filePath,
    ],
    {encoding: "utf8"},
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg vertical fixture failed: ${result.stderr}`);
  }
};

export const writeInspection = (
  filePath: string,
  inspection: {
    duration: number;
    width?: number;
    height?: number;
    errors?: string[];
  },
): void => {
  writeJson(filePath, {
    inspectedAt: E2E_FIXED_NOW,
    inspections: [
      {
        file: "vertical_9x16.mp4",
        duration: inspection.duration,
        width: inspection.width ?? 1080,
        height: inspection.height ?? 1920,
        frameRate: "30/1",
        videoCodec: "h264",
        audioCodec: "aac",
        audioSampleRate: "48000",
        peakDb: -4.1,
      },
    ],
    captionInspection: {
      cues: 2,
      microCueThresholdSeconds: 1,
      microCueCount: 0,
      microCueRatio: 0,
      microCueRatioLimit: 0.1,
      minimumCueSeconds: 1.2,
    },
    errors: inspection.errors ?? [],
  });
};
