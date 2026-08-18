import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  artifactDependencySchema,
  artifactRefSchema,
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
} from "../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  buildMediaArtifactRef,
  createDeterministicSemanticAdapter,
  createStubKeyframeExtractor,
  createStubTranscriptProvider,
  getMediaSource,
  indexMediaAsset,
  mediaVisualSlotRepositoryPath,
  mediaAssetSchema,
  mediaRetrievalRequestSchema,
  mediaSourceManifestSchema,
  mediaSourceSchema,
  proposeMediaSource,
  readMediaEvents,
  readMediaRetrievalResult,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaAsset,
  writeMediaSourceManifestCas,
  type MediaAsset,
  type MediaRightsStatus,
  type MediaSourceType,
  type MediaUnderstandingConfig,
  type TranscriptProvider,
} from "../src/media";
import {
  assertMediaClipVerified,
  createDeterministicVerificationProvider,
  createStubShortClipExtractor,
  mediaVerificationRequestSchema,
  verifyMediaClip,
  type MediaVerificationProvider,
  type MediaVerificationProviderOutput,
  type MediaVerificationRequest,
} from "../src/media/verify";
import {
  readVisualSlot,
  selectVisualSlotForSegment,
  type VisualSlotOutcome,
} from "../src/media/select";
import {retrieveMediaCandidates} from "../src/media/retrieve";
import {serializeIndexArtifact} from "../src/media/understanding";
import {FineGrainedCacheStore} from "../src/lib/platform/cache";
import {timelineSchema, type Timeline} from "../src/schemas/episode";
import {
  MEDIA_RENDER_DEPENDENCY_PATHS,
  MEDIA_RENDER_PLAN_SCHEMA_VERSION,
  MEDIA_RENDER_PROXY_SCHEMA_VERSION,
  MEDIA_SHOT_SCHEMA_VERSION,
  assertMediaMixReadyToRender,
  assertMediaRenderPlanRenderable,
  assertMediaShotRenderable,
  buildMediaRenderPlanForTimeline,
  buildMediaRenderShotKey,
  buildMediaShotForSegment,
  createStubRenderProxyExtractor,
  isMediaShotRenderable,
  mediaShotAudioGainsAtFrame,
  mediaShotDuckingGainFactor,
  mediaShotSchema,
  mediaShotTransformAtFrame,
  mediaShotVideoOpacityAtFrame,
  normalizeMediaShotGains,
  readMediaRenderPlan,
  readMediaShot,
  resolveMediaShotLineage,
  type MediaShotTransform,
} from "../src/media/render";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-render-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const FIXED_NOW = "2026-08-17T00:00:00.000Z";

const sha256OfBytes = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const sha256OfFile = (filePath: string): string => sha256OfBytes(fs.readFileSync(filePath));

/* ------------------------------------------------------------------------- *
 * Fixtures (episode-parameterized mirror of tests/media-selection.test.ts)
 * ------------------------------------------------------------------------- */

const baseSource = (
  sourceId: string,
  overrides: Record<string, unknown> = {},
): {
  sourceId: string;
  sourceUrl?: string;
  publisher?: string;
  sourceType: MediaSourceType;
  rightsBasis?: string;
  rightsStatus?: MediaRightsStatus;
  notes?: string;
} => ({
  sourceId,
  sourceUrl: "",
  publisher: "Example Corp",
  sourceType: "local-approved",
  rightsBasis: "Owner-provided fixture",
  ...overrides,
});

const writeFacts = (
  repoRoot: string,
  episodeId: string,
  claims: Array<{id: string; claim: string}>,
  options: {metricName?: boolean} = {},
): void => {
  const directory = path.join(repoRoot, "content", episodeId, "research");
  fs.mkdirSync(directory, {recursive: true});
  const fullClaims = claims.map((entry, index) => ({
    ...entry,
    metricName: options.metricName ? "fixture-metric" : "",
    value: options.metricName ? "42" : "",
    period: "",
    eventDate: "",
    sourceIds: [`src-fixture-${index}`],
    confidence: "high",
    reportingType: "independently-verified",
    allowedInNarration: true,
    notes: "fixture",
  }));
  fs.writeFileSync(path.join(directory, "facts.json"), JSON.stringify(fullClaims, null, 2));
};

const manifestRefFor = (repoRoot: string, episodeId: string): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:media:source-manifest`,
    episodeId,
    path: `content/${episodeId}/media/source-manifest.json`,
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "m5-render-test",
    createdAt: FIXED_NOW,
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
    reviewer: "human-reviewer-1",
    timestamp: FIXED_NOW,
    reason: "reviewed for the media audit trail",
    artifactRefs: [input.ref],
    approvalEpoch: 0,
  });

const approveSourceWithType = (
  repoRoot: string,
  episodeId: string,
  sourceId: string,
  sourceType: MediaSourceType,
): void => {
  const proposal = proposeMediaSource({
    repoRoot,
    episodeId,
    source: baseSource(sourceId, {
      sourceType,
      ...(sourceType === "local-approved"
        ? {}
        : {sourceUrl: `https://www.example.com/${sourceId.replace(/[^a-z0-9-]/gu, "-")}`}),
    }),
  });
  const slug = sourceId.replace(/[^A-Za-z0-9]/gu, "-");
  applyMediaSourceAdmission({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref: manifestRefFor(repoRoot, episodeId),
      decisionId: `admission-${slug}`,
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
      decisionId: `rights-${slug}`,
    }),
    expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
};

const decisionDependencies = (
  repoRoot: string,
  episodeId: string,
  sourceId: string,
): ArtifactDependency[] => {
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const source = getMediaSource(manifest, sourceId);
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

const extensionFor = (mediaType: string): string => {
  if (mediaType.startsWith("video/")) return "mp4";
  if (mediaType.startsWith("audio/")) return "mp3";
  return "png";
};

const fabricateOriginal = (input: {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  sourceId: string;
  bytes: Uint8Array;
  durationMs: number | null;
  mediaType?: string;
}): MediaAsset => {
  const {repoRoot, episodeId} = input;
  const mediaType = input.mediaType ?? "video/mp4";
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const source = getMediaSource(manifest, input.sourceId);
  if (!source) throw new Error("fixture source missing");
  const slug = input.mediaId.slice(`${episodeId}:media:`.length);
  const filename = `${slug}.${extensionFor(mediaType)}`;
  const filePath = path.join(repoRoot, "content", episodeId, "media", "assets", filename);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, input.bytes);
  const ref = buildMediaArtifactRef({
    repoRoot,
    episodeId,
    mediaId: input.mediaId,
    filename,
    mediaType,
    producer: "m5-render-fixture",
    createdAt: FIXED_NOW,
  });
  const asset = mediaAssetSchema.parse({
    mediaId: input.mediaId,
    episodeId,
    mediaSourceId: input.sourceId,
    sourceUrl: source.sourceUrl,
    publisher: source.publisher,
    sourceType: source.sourceType,
    acquisitionMethod: "local-approved",
    originalFilename: filename,
    mediaType,
    sha256: ref.sha256,
    sizeBytes: ref.sizeBytes,
    durationMs: input.durationMs,
    width: mediaType.startsWith("video/") ? 320 : null,
    height: mediaType.startsWith("video/") ? 240 : null,
    fps: mediaType.startsWith("video/") ? 25 : null,
    audioChannels: mediaType.startsWith("audio/") ? 2 : null,
    capturedAt: FIXED_NOW,
    accessedAt: FIXED_NOW,
    publishedAt: null,
    rightsBasis: "Owner-provided fixture",
    rightsStatus: "approved",
    artifactRef: ref,
    kind: "original",
  });
  const registered = registerMediaAsset({repoRoot, manifest, asset});
  writeMediaSourceManifestCas({
    repoRoot,
    manifest: registered,
    expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
  registerCandidateInIndex(
    repoRoot,
    episodeId,
    ref,
    `media-ingest:${input.mediaId}`,
    input.sourceId,
  );
  return asset;
};

const withSourceRights = (
  repoRoot: string,
  episodeId: string,
  sourceId: string,
  rightsStatus: MediaRightsStatus,
): void => {
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const next = mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: FIXED_NOW,
    sources: manifest.sources.map((candidate) =>
      candidate.sourceId === sourceId
        ? mediaSourceSchema.parse({...candidate, rightsStatus})
        : candidate,
    ),
  });
  writeMediaSourceManifestCas({
    repoRoot,
    manifest: next,
    expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
};

const stubKeyframes = createStubKeyframeExtractor();

const stubConfig: MediaUnderstandingConfig = {
  scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
  clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
  keyframe: {quality: 2, mediaType: "image/jpeg"},
};

const runIndex = (
  repoRoot: string,
  episodeId: string,
  input: {mediaId: string; transcriptProvider: TranscriptProvider},
) =>
  indexMediaAsset({
    repoRoot,
    episodeId,
    mediaId: input.mediaId,
    cache: null,
    transcriptProvider: input.transcriptProvider,
    semanticAdapter: createDeterministicSemanticAdapter(),
    keyframeExtractor: stubKeyframes,
    config: stubConfig,
    now: () => FIXED_NOW,
  });

const makeRequest = (
  episodeId: string,
  overrides: Record<string, unknown> = {},
): ReturnType<typeof mediaRetrievalRequestSchema.parse> =>
  mediaRetrievalRequestSchema.parse({
    schemaVersion: "media-retrieval-request-v1",
    episodeId,
    segmentId: "seg-001",
    claimIds: [],
    narration: "测试旁白",
    visualIntent: "测试画面",
    topK: 5,
    ...overrides,
  });

const runRetrieve = (
  repoRoot: string,
  episodeId: string,
  request: ReturnType<typeof mediaRetrievalRequestSchema.parse>,
) =>
  retrieveMediaCandidates({
    repoRoot,
    episodeId,
    request,
    cache: null,
    now: () => FIXED_NOW,
  });

const CLAIMS = [
  {id: "claim-fixture-001", claim: "产品核心功能演示 展示了 主界面 交互"},
  {id: "claim-fixture-003", claim: "公司成立 日期 是 2024"},
] satisfies Array<{id: string; claim: string}>;

const OFFICIAL_SOURCE = "episode-m5:media-source:official";
const DEMO_MEDIA_ID = "episode-m5:media:demo";
const DEMO_SEGMENTS = [
  {text: "产品核心功能演示 主界面 交互 反馈", startMs: 0, endMs: 4000, speaker: "host"},
  {text: "用户反馈 产品 演示 界面", startMs: 4000, endMs: 8000, speaker: "host"},
  {text: "公司成立 日期 2024 庆典", startMs: 8000, endMs: 10000, speaker: "host"},
] as const;

const defaultSetup = async (repoRoot: string, episodeId: string): Promise<void> => {
  writeFacts(repoRoot, episodeId, CLAIMS);
  const sourceId =
    episodeId === "episode-m5" ? OFFICIAL_SOURCE : `${episodeId}:media-source:official`;
  approveSourceWithType(repoRoot, episodeId, sourceId, "official");
  const mediaId = episodeId === "episode-m5" ? DEMO_MEDIA_ID : `${episodeId}:media:demo`;
  fabricateOriginal({
    repoRoot,
    episodeId,
    mediaId,
    sourceId,
    bytes: Buffer.from("fixture demo video bytes v1"),
    durationMs: 10000,
  });
  await runIndex(repoRoot, episodeId, {
    mediaId,
    transcriptProvider: createStubTranscriptProvider({segments: [...DEMO_SEGMENTS]}),
  });
};

type RetrievalFixture = {
  repoRoot: string;
  episodeId: string;
  retrievalRef: ArtifactRef;
  request: ReturnType<typeof mediaRetrievalRequestSchema.parse>;
  result: ReturnType<typeof readMediaRetrievalResult>;
};

const setupRetrieval = async (repoRoot: string, episodeId: string): Promise<RetrievalFixture> => {
  await defaultSetup(repoRoot, episodeId);
  const request = makeRequest(episodeId, {
    claimIds: ["claim-fixture-001", "claim-fixture-003"],
    narration: "公司成立 日期 2024",
    visualIntent: "庆典 画面",
    topK: 5,
  });
  const outcome = await runRetrieve(repoRoot, episodeId, request);
  const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
  return {repoRoot, episodeId, retrievalRef: outcome.artifactRef, request, result};
};

const makeVerifyRequest = (input: {
  episodeId: string;
  clipId: string;
  claimIds: string[];
  narration: string;
  visualIntent: string;
  retrievalResultRef: ArtifactRef;
}): MediaVerificationRequest =>
  mediaVerificationRequestSchema.parse({
    schemaVersion: "media-verification-request-v1",
    episodeId: input.episodeId,
    segmentId: "seg-001",
    clipId: input.clipId,
    claimIds: input.claimIds,
    narration: input.narration,
    visualIntent: input.visualIntent,
    retrievalResultRef: input.retrievalResultRef,
    maxKeyframes: 4,
  });

const runVerify = (
  repoRoot: string,
  episodeId: string,
  request: MediaVerificationRequest,
  provider: MediaVerificationProvider,
) =>
  verifyMediaClip({
    repoRoot,
    episodeId,
    request,
    provider,
    cache: null,
    shortClipExtractor: createStubShortClipExtractor(),
    now: () => FIXED_NOW,
  });

const passOutput: MediaVerificationProviderOutput = {
  verdict: "pass",
  relevance: 0.9,
  claimMatch: 0.9,
  visualQuality: 0.8,
  misleadingRisk: 0.1,
  observedActions: ["演示产品主界面"],
  observedEntities: ["Poke"],
  observedText: ["公司成立 日期 2024"],
  recommendedStartMs: 8000,
  recommendedEndMs: 10000,
  reasons: ["short clip shows the claimed demo"],
};

const windowPassProvider = (
  overrides: Partial<MediaVerificationProviderOutput> = {},
): MediaVerificationProvider =>
  createDeterministicVerificationProvider({
    output: (input) => ({
      ...passOutput,
      recommendedStartMs: input.clip.startMs,
      recommendedEndMs: input.clip.endMs,
      ...overrides,
    }),
  });

const selectFor = (
  repoRoot: string,
  episodeId: string,
  segment: {
    segmentId: string;
    claimIds: string[];
    narration: string;
    visualIntent: string;
    durationTargetMs?: number | null;
  },
): Promise<VisualSlotOutcome> =>
  selectVisualSlotForSegment({
    repoRoot,
    episodeId,
    segment,
    now: () => FIXED_NOW,
  });

/** Full media pipeline up to a selected real-media slot for seg-001. */
const setupSelectedRealMedia = async (
  repoRoot: string,
  episodeId: string,
): Promise<{fixture: RetrievalFixture; slot: VisualSlotOutcome}> => {
  const fixture = await setupRetrieval(repoRoot, episodeId);
  const candidate = fixture.result.candidates[0];
  if (!candidate) throw new Error("fixture candidate missing");
  await runVerify(
    repoRoot,
    episodeId,
    makeVerifyRequest({
      episodeId,
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    }),
    windowPassProvider(),
  );
  const slot = await selectFor(repoRoot, episodeId, {
    segmentId: "seg-001",
    claimIds: fixture.request.claimIds,
    narration: fixture.request.narration,
    visualIntent: fixture.request.visualIntent,
    durationTargetMs: 5000,
  });
  expect(slot.selectedType).toBe("real-media");
  return {fixture, slot};
};

const makeTimeline = (
  episodeId: string,
  scenes: Array<{
    id: string;
    narration?: string;
    claimIds: string[];
    visualIntent?: string;
    startFrame: number;
    durationFrames: number;
    index?: number;
  }>,
): Timeline =>
  timelineSchema.parse({
    episodeId,
    layoutVariant: "poke-standard",
    fps: 30,
    totalFrames: scenes.reduce(
      (total, scene) => Math.max(total, scene.startFrame + scene.durationFrames),
      0,
    ),
    totalSeconds:
      scenes.reduce((total, scene) => Math.max(total, scene.startFrame + scene.durationFrames), 0) /
      30,
    ttsProvider: "fixture",
    captionAlignment: "caption-plan-proportional",
    scenes: scenes.map((scene, index) => ({
      id: scene.id,
      section: index === 0 ? "hook" : "body",
      narration: scene.narration ?? "测试旁白",
      onScreenText: [],
      claimIds: scene.claimIds,
      scene: "fixture",
      visualIntent: scene.visualIntent ?? "测试画面",
      targetSeconds: scene.durationFrames / 30,
      index: scene.index ?? index,
      startFrame: scene.startFrame,
      durationFrames: scene.durationFrames,
      startSeconds: scene.startFrame / 30,
      endSeconds: (scene.startFrame + scene.durationFrames) / 30,
      audioDurationSeconds: Math.max(1, scene.durationFrames / 30 - 0.2),
      audio: `episodes/${episodeId}/audio/${scene.id}.mp3`,
    })),
  });

const writeTimeline = (repoRoot: string, episodeId: string, timeline: Timeline): string => {
  const filePath = path.join(repoRoot, "content", episodeId, "production", "timeline.json");
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, JSON.stringify(timeline, null, 2));
  return sha256OfFile(filePath);
};

const artifactRecords = (repoRoot: string, episodeId: string) =>
  readArtifactIndex(path.join(repoRoot, "content", episodeId, "artifact-index.json")).artifacts;

const registryReaches = (
  repoRoot: string,
  episodeId: string,
  fromArtifactId: string,
  targetArtifactId: string,
): boolean => {
  const records = artifactRecords(repoRoot, episodeId);
  const byId = new Map(records.map((record) => [record.ref.artifactId, record]));
  const queue = [fromArtifactId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (current === targetArtifactId) return true;
    const record = byId.get(current);
    if (record) {
      for (const dependency of record.dependencies) queue.push(dependency.artifactId);
    }
  }
  return false;
};

const FIXED_DEPENDENCY_HASHES: Record<string, string> = Object.fromEntries(
  MEDIA_RENDER_DEPENDENCY_PATHS.map((repositoryPath, index) => [
    repositoryPath,
    `${index.toString(16).padStart(2, "0")}`.repeat(32),
  ]),
);

const buildShot = (input: {
  repoRoot: string;
  episodeId: string;
  timeline: Timeline;
  timelineSha256: string;
  transform?: Partial<MediaShotTransform>;
  audio?: Record<string, unknown>;
  trimStartMs?: number;
  trimEndMs?: number;
  cache?: FineGrainedCacheStore | null;
  overlays?: Record<string, unknown>;
}) =>
  buildMediaShotForSegment({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    segmentId: "seg-001",
    timeline: input.timeline,
    timelineSha256: input.timelineSha256,
    transform: input.transform,
    audio: input.audio as never,
    overlays: input.overlays as never,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
    cache: input.cache ?? null,
    cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
    proxyExtractor: createStubRenderProxyExtractor(),
    now: () => FIXED_NOW,
  });

/* ------------------------------------------------------------------------- *
 * WP-M5.08 tests
 * ------------------------------------------------------------------------- */

/**
 * M5.08 tests build full media pipelines (index/retrieve/verify/select +
 * render proxy materialization); under full parallel test load they need a
 * generous timeout to avoid CPU-starvation flakes.
 */
const itSlow = (name: string, fn: () => void): void => {
  it(name, fn, 60_000);
};

describe("WP-M5.08 real media Remotion editing — shot plan + render gate", () => {
  itSlow(
    "trims a verified clip and produces a renderable, hash-bound shot with proxy + public copy",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);

      const outcome = buildShot({repoRoot, episodeId, timeline, timelineSha256});
      expect(outcome.status).toBe("ready");
      expect(outcome.visualType).toBe("real-media");
      expect(outcome.cacheHit).toBe(false);
      expect(outcome.proxyIdentityKey).toMatch(/^[a-f0-9]{64}$/u);

      // The shot artifact is hash-bound, registered, and self-consistent.
      const shot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(shot.schemaVersion).toBe(MEDIA_SHOT_SCHEMA_VERSION);
      expect(shot.episodeId).toBe(episodeId);
      expect(shot.segmentId).toBe("seg-001");
      expect(shot.visualType).toBe("real-media");
      expect(shot.selectedMediaClipRef?.clipId).toBe(fixture.result.candidates[0]?.clipId);
      // Default trim = the VLM-recommended window.
      expect(shot.trim?.startMs).toBe(
        assertMediaClipVerified({
          repoRoot,
          episodeId,
          segmentId: "seg-001",
          clipId: fixture.result.candidates[0]!.clipId,
          verificationRef: shot.verificationRef!,
        }).recommendedStartMs,
      );
      expect(shot.trim!.endMs).toBeGreaterThan(shot.trim!.startMs);
      expect(shot.lineage).not.toBeNull();
      expect(shot.lineage?.sourceStartMs).toBe(shot.trim?.startMs);
      expect(shot.lineage?.sourceEndMs).toBe(shot.trim?.endMs);
      expect(shot.gate).toEqual({
        slotValid: true,
        clipVerified: true,
        rightsApproved: true,
        hashesValid: true,
        episodeIsolated: true,
        timestampsValid: true,
      });
      // Embedded ref is the content hash of the body without the self-reference.
      const parsed = mediaShotSchema.parse(
        JSON.parse(fs.readFileSync(path.join(repoRoot, shot.artifactRef.path), "utf8")) as unknown,
      );
      const withoutArtifactRef = {...parsed};
      Reflect.deleteProperty(withoutArtifactRef, "artifactRef");
      expect(sha256OfBytes(Buffer.from(serializeIndexArtifact(withoutArtifactRef), "utf8"))).toBe(
        parsed.artifactRef.sha256,
      );
      expect(shot.artifactRef.artifactId).toBe(`${episodeId}:media-shot:seg-001`);
      expect(
        artifactRecords(repoRoot, episodeId).some(
          (record) => record.ref.artifactId === shot.artifactRef.artifactId,
        ),
      ).toBe(true);

      // Render proxy artifact + public staticFile copy bind the same bytes.
      expect(shot.renderProxyRef).not.toBeNull();
      expect(shot.renderProxyRef?.schemaVersion).toBe(MEDIA_RENDER_PROXY_SCHEMA_VERSION);
      expect(shot.staticFilePath).toBe(`episodes/${episodeId}/media/seg-001.mp4`);
      const proxyPath = path.join(repoRoot, shot.renderProxyRef!.path);
      expect(sha256OfFile(proxyPath)).toBe(shot.renderProxyRef!.sha256);
      const publicCopy = path.join(repoRoot, "public", shot.staticFilePath!);
      expect(sha256OfFile(publicCopy)).toBe(shot.renderProxyRef!.sha256);

      // The render gate re-authorizes everything (slot + verification + rights +
      // hashes + timestamps + proxy) without any cache or provider.
      expect(isMediaShotRenderable({repoRoot, episodeId, segmentId: "seg-001"})).toBe(true);
      expect(assertMediaShotRenderable({repoRoot, episodeId, segmentId: "seg-001"})).toEqual(shot);

      // Events recorded.
      const events = readMediaEvents(repoRoot, episodeId);
      expect(events.some((event) => event.eventType === "media.render.started")).toBe(true);
      expect(events.some((event) => event.eventType === "media.render.completed")).toBe(true);
      const rendered = events.find((event) => event.eventType === "media.rendered");
      expect(rendered?.selectedType).toBe("real-media");
      expect(rendered?.shotId).toBe(`${episodeId}:media-shot:seg-001`);
    },
  );

  itSlow("rejects a trim outside the VLM-recommended range fail-closed", async () => {
    const repoRoot = temporaryRepo();
    const episodeId = "episode-m5";
    const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
    const timeline = makeTimeline(episodeId, [
      {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
    ]);
    const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
    const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
    const verification = assertMediaClipVerified({
      repoRoot,
      episodeId,
      segmentId: "seg-001",
      clipId: slot.selectedMediaClipRef!.clipId,
      verificationRef: slot.verificationRef!,
    });
    // Extending before the recommended start is illegal.
    expect(() =>
      buildShot({
        repoRoot,
        episodeId,
        timeline,
        timelineSha256,
        trimStartMs: verification.recommendedStartMs - 500,
        trimEndMs: verification.recommendedEndMs,
      }),
    ).toThrow(/MEDIA_RENDER_TRIM_OUT_OF_BOUNDS/u);
    // A reversed window is illegal too.
    expect(() =>
      buildShot({
        repoRoot,
        episodeId,
        timeline,
        timelineSha256,
        trimStartMs: verification.recommendedEndMs,
        trimEndMs: verification.recommendedStartMs + 100,
      }),
    ).toThrow(/MEDIA_RENDER_TRIM_OUT_OF_BOUNDS/u);
    // A tight trim INSIDE the recommended range is legal.
    const tight = buildShot({
      repoRoot,
      episodeId,
      timeline,
      timelineSha256,
      trimStartMs: verification.recommendedStartMs + 100,
      trimEndMs: verification.recommendedEndMs - 100,
    });
    expect(tight.visualType).toBe("real-media");
    const tightShot = readMediaShot(repoRoot, episodeId, "seg-001");
    expect(tightShot.trim).toEqual({
      startMs: verification.recommendedStartMs + 100,
      endMs: verification.recommendedEndMs - 100,
    });
  });

  itSlow(
    "applies crop/reframe/PiP/zoom-pan deterministically and validates crop bounds",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      const transform: Partial<MediaShotTransform> = {
        reframe: {mode: "blur-fill", crop: {x: 0.1, y: 0.2, width: 0.6, height: 0.6}},
        scale: 1.2,
        position: {x: 0.2, y: -0.1},
        zoomPan: {
          type: "ken-burns",
          start: {zoom: 1, x: 0, y: 0},
          end: {zoom: 1.3, x: 0.1, y: -0.05},
        },
        pip: {
          enabled: true,
          position: "bottom-right",
          size: 0.3,
          borderRadius: 18,
          borderColor: "#ffffff",
          shadow: true,
        },
        freezeFrameMs: 250,
      };
      const outcome = buildShot({repoRoot, episodeId, timeline, timelineSha256, transform});
      expect(outcome.visualType).toBe("real-media");
      const shot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(shot.transform.reframe).toEqual(transform.reframe);
      expect(shot.transform.scale).toBe(1.2);
      expect(shot.transform.pip).toEqual(transform.pip);
      expect(shot.transform.freezeFrameMs).toBe(250);
      // Freeze must lie inside the trim window — the fixture window is >= 2000ms.
      expect(shot.transform.freezeFrameMs).toBeLessThan(shot.trim!.endMs - shot.trim!.startMs);

      // Deterministic transform state: frame 0 vs last frame.
      const first = mediaShotTransformAtFrame({
        frame: 0,
        fps: 30,
        durationFrames: shot.durationFrames,
        canvas: {width: 1080, height: 1920},
        transform: shot.transform,
      });
      const last = mediaShotTransformAtFrame({
        frame: shot.durationFrames - 1,
        fps: 30,
        durationFrames: shot.durationFrames,
        canvas: {width: 1080, height: 1920},
        transform: shot.transform,
      });
      // cropScale = 1/0.6; × scale 1.2 → 2.0; zoom 1 at start, 1.3 at end.
      expect(first.scale).toBeCloseTo(2.0, 6);
      expect(last.scale).toBeCloseTo(2.6, 6);
      // transformOrigin = crop center in percent.
      expect(first.transformOriginX).toBeCloseTo(40, 6);
      expect(first.transformOriginY).toBeCloseTo(50, 6);
      // translate = (position * 0.5 + drift) * canvas.
      expect(first.translateX).toBeCloseTo(108, 6);
      expect(first.translateY).toBeCloseTo(-96, 6);
      expect(last.translateX).toBeCloseTo(216, 6);
      expect(last.translateY).toBeCloseTo(-192, 6);

      // Crop out of the normalized frame is rejected by the schema.
      expect(() =>
        mediaShotSchema.parse({
          ...shot,
          transform: {
            ...shot.transform,
            reframe: {mode: "cover", crop: {x: 0.6, y: 0.6, width: 0.6, height: 0.6}},
          },
        }),
      ).toThrow();
      // Freeze outside the trim window is rejected.
      expect(() =>
        mediaShotSchema.parse({
          ...shot,
          transform: {
            ...shot.transform,
            freezeFrameMs: shot.trim!.endMs - shot.trim!.startMs + 1000,
          },
        }),
      ).toThrow();

      // PiP stays renderable through the gate.
      expect(assertMediaShotRenderable({repoRoot, episodeId, segmentId: "seg-001"})).toBeDefined();
    },
  );

  itSlow("normalizes audio gains to unity, ducks the original rail, and never clips", () => {
    // Clipping prevention: proportional normalization to sum ≤ 1.
    expect(normalizeMediaShotGains({originalAudioGain: 1, narrationGain: 1})).toEqual({
      originalAudioGain: 0.5,
      narrationGain: 0.5,
    });
    const normalized = normalizeMediaShotGains({originalAudioGain: 0.35, narrationGain: 1});
    expect(normalized.originalAudioGain + normalized.narrationGain).toBeCloseTo(1, 9);
    expect(normalized.originalAudioGain).toBeCloseTo(0.259259, 6);
    expect(normalized.narrationGain).toBeCloseTo(0.740741, 6);
    // Already-legal gains are unchanged.
    expect(normalizeMediaShotGains({originalAudioGain: 0.2, narrationGain: 0.5})).toEqual({
      originalAudioGain: 0.2,
      narrationGain: 0.5,
    });

    // 10 dB ducking = linear factor 10^(-0.5).
    expect(mediaShotDuckingGainFactor(10)).toBeCloseTo(0.316228, 6);

    const audio = {
      originalAudioGain: normalized.originalAudioGain,
      narrationGain: normalized.narrationGain,
      ducking: {enabled: true, reductionDb: 10, attackMs: 80, releaseMs: 240},
      fadeInMs: 0,
      fadeOutMs: 0,
    };
    const durationFrames = 150;
    // Attack ramp: at frame 0 the original rail is still at full gain.
    const atStart = mediaShotAudioGainsAtFrame({frame: 0, fps: 30, durationFrames, audio});
    expect(atStart.originalGain).toBeCloseTo(normalized.originalAudioGain, 6);
    // Steady state: ducked by 10 dB.
    const steady = mediaShotAudioGainsAtFrame({frame: 60, fps: 30, durationFrames, audio});
    expect(steady.originalGain).toBeCloseTo(
      normalized.originalAudioGain * mediaShotDuckingGainFactor(10),
      6,
    );
    // Release ramp: towards the end the original rail returns.
    const nearEnd = mediaShotAudioGainsAtFrame({frame: 149, fps: 30, durationFrames, audio});
    expect(nearEnd.originalGain).toBeGreaterThan(steady.originalGain);
    // The two rails never sum above unity.
    for (const frame of [0, 30, 60, 100, 143, 149]) {
      const gains = mediaShotAudioGainsAtFrame({frame, fps: 30, durationFrames, audio});
      expect(gains.originalGain + gains.narrationGain).toBeLessThanOrEqual(1 + 1e-9);
    }
    // Ducking disabled → original rail untouched.
    const noDuck = mediaShotAudioGainsAtFrame({
      frame: 60,
      fps: 30,
      durationFrames,
      audio: {...audio, ducking: {enabled: false, reductionDb: 0, attackMs: 0, releaseMs: 0}},
    });
    expect(noDuck.originalGain).toBeCloseTo(normalized.originalAudioGain, 6);
    // Fades ramp both rails.
    const faded = mediaShotAudioGainsAtFrame({
      frame: 0,
      fps: 30,
      durationFrames,
      audio: {...audio, fadeInMs: 300},
    });
    expect(faded.originalGain).toBe(0);
    expect(faded.narrationGain).toBe(0);
  });

  itSlow(
    "keeps the shot audio contract: normalized gains, no original rail on fallbacks, over-gain rejected",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      // Over-gain override is normalized at plan build (0.9 + 0.9 → scaled).
      const outcome = buildShot({
        repoRoot,
        episodeId,
        timeline,
        timelineSha256,
        audio: {originalAudioGain: 0.9, narrationGain: 0.9},
      });
      expect(outcome.visualType).toBe("real-media");
      const shot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(shot.audio.originalAudioGain + shot.audio.narrationGain).toBeLessThanOrEqual(1 + 1e-9);
      expect(shot.audio.ducking.enabled).toBe(true);

      // The schema rejects a raw over-gain plan.
      expect(() =>
        mediaShotSchema.parse({
          ...shot,
          audio: {...shot.audio, originalAudioGain: 0.9, narrationGain: 0.9},
        }),
      ).toThrow(/must not exceed 1/u);

      // Fallback shot: original rail must be 0, narration rail 1.
      const repoRoot2 = temporaryRepo();
      const episodeId2 = "episode-m5";
      writeFacts(repoRoot2, episodeId2, CLAIMS);
      const timeline2 = makeTimeline(episodeId2, [
        {id: "seg-001", claimIds: ["claim-fixture-001"], startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256_2 = writeTimeline(repoRoot2, episodeId2, timeline2);
      const fallback = buildShot({
        repoRoot: repoRoot2,
        episodeId: episodeId2,
        timeline: timeline2,
        timelineSha256: timelineSha256_2,
      });
      expect(fallback.visualType).toBe("programmatic-visual");
      const fallbackShot = readMediaShot(repoRoot2, episodeId2, "seg-001");
      expect(fallbackShot.audio).toEqual({
        originalAudioGain: 0,
        narrationGain: 1,
        ducking: {enabled: false, reductionDb: 0, attackMs: 0, releaseMs: 0},
        fadeInMs: 0,
        fadeOutMs: 0,
      });
      // Video fade/crossfade math is deterministic.
      expect(
        mediaShotVideoOpacityAtFrame({
          frame: 0,
          fps: 30,
          durationFrames: 150,
          fade: {inMs: 200, outMs: 200},
          crossfadeMs: 0,
          isFirst: false,
        }),
      ).toBe(0);
      expect(
        mediaShotVideoOpacityAtFrame({
          frame: 3,
          fps: 30,
          durationFrames: 150,
          fade: {inMs: 200, outMs: 200},
          crossfadeMs: 0,
          isFirst: false,
        }),
      ).toBeCloseTo(0.5, 6);
      expect(
        mediaShotVideoOpacityAtFrame({
          frame: 149,
          fps: 30,
          durationFrames: 150,
          fade: {inMs: 200, outMs: 200},
          crossfadeMs: 0,
          isFirst: false,
        }),
      ).toBeCloseTo(1 / 6, 6);
      expect(
        mediaShotVideoOpacityAtFrame({
          frame: 150,
          fps: 30,
          durationFrames: 150,
          fade: {inMs: 200, outMs: 200},
          crossfadeMs: 0,
          isFirst: false,
        }),
      ).toBe(0);
    },
  );

  itSlow(
    "renders fallback visuals (programmatic + official screenshot) without real media",
    async () => {
      // 1) No media pipeline at all → programmatic shot, still renderable.
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      writeFacts(repoRoot, episodeId, CLAIMS);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: ["claim-fixture-001"], startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      const outcome = buildShot({repoRoot, episodeId, timeline, timelineSha256});
      expect(outcome.visualType).toBe("programmatic-visual");
      const shot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(shot.selectedMediaClipRef).toBeNull();
      expect(shot.verificationRef).toBeNull();
      expect(shot.lineage).toBeNull();
      expect(shot.trim).toBeNull();
      expect(shot.renderProxyRef).toBeNull();
      expect(shot.fallbackReason).toContain("no visual slot");
      expect(shot.gate.slotValid).toBe(false);
      expect(shot.gate.clipVerified).toBe(false);
      expect(assertMediaShotRenderable({repoRoot, episodeId, segmentId: "seg-001"})).toBeDefined();

      // 2) A fallback slot (rights revoked AFTER verification) still renders a
      //    fallback shot — real-media-first ≠ real-media-at-all-costs.
      const repoRoot2 = temporaryRepo();
      const episodeId2 = "episode-m5";
      const fixture = await setupRetrieval(repoRoot2, episodeId2);
      const candidate = fixture.result.candidates[0];
      if (!candidate) throw new Error("fixture candidate missing");
      await runVerify(
        repoRoot2,
        episodeId2,
        makeVerifyRequest({
          episodeId: episodeId2,
          clipId: candidate.clipId,
          claimIds: fixture.request.claimIds,
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
          retrievalResultRef: fixture.retrievalRef,
        }),
        windowPassProvider(),
      );
      withSourceRights(repoRoot2, episodeId2, OFFICIAL_SOURCE, "rejected");
      const slotOutcome = await selectFor(repoRoot2, episodeId2, {
        segmentId: "seg-001",
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
      });
      expect(slotOutcome.fallbackType).toBe("REAL_MEDIA_RIGHTS_BLOCKED");
      const timeline2 = makeTimeline(episodeId2, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256_2 = writeTimeline(repoRoot2, episodeId2, timeline2);
      const fallbackOutcome = buildShot({
        repoRoot: repoRoot2,
        episodeId: episodeId2,
        timeline: timeline2,
        timelineSha256: timelineSha256_2,
      });
      expect(fallbackOutcome.visualType).not.toBe("real-media");
      const fallbackShot = readMediaShot(repoRoot2, episodeId2, "seg-001");
      expect(fallbackShot.fallbackType).toBe("REAL_MEDIA_RIGHTS_BLOCKED");
      expect(
        assertMediaShotRenderable({
          repoRoot: repoRoot2,
          episodeId: episodeId2,
          segmentId: "seg-001",
        }),
      ).toBeDefined();
    },
  );

  itSlow("blocks tampered, rights-revoked, and cross-episode media fail-closed", async () => {
    // 1) Tampered source media bytes → render gate fails closed.
    const repoRoot = temporaryRepo();
    const episodeId = "episode-m5";
    const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
    const timeline = makeTimeline(episodeId, [
      {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
    ]);
    const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
    buildShot({repoRoot, episodeId, timeline, timelineSha256});
    expect(isMediaShotRenderable({repoRoot, episodeId, segmentId: "seg-001"})).toBe(true);
    fs.appendFileSync(
      path.join(repoRoot, "content", episodeId, "media", "assets", "demo.mp4"),
      "tampered",
    );
    expect(() => assertMediaShotRenderable({repoRoot, episodeId, segmentId: "seg-001"})).toThrow(
      /MEDIA_RENDER_CLIP_GATE_FAILED/u,
    );

    // 2) Rights revoked after the shot was built → render gate fails closed.
    const repoRoot2 = temporaryRepo();
    const episodeId2 = "episode-m5";
    const fixture2 = await setupSelectedRealMedia(repoRoot2, episodeId2);
    const timeline2 = makeTimeline(episodeId2, [
      {
        id: "seg-001",
        claimIds: fixture2.fixture.request.claimIds,
        startFrame: 0,
        durationFrames: 150,
      },
    ]);
    const timelineSha256_2 = writeTimeline(repoRoot2, episodeId2, timeline2);
    buildShot({
      repoRoot: repoRoot2,
      episodeId: episodeId2,
      timeline: timeline2,
      timelineSha256: timelineSha256_2,
    });
    withSourceRights(repoRoot2, episodeId2, OFFICIAL_SOURCE, "rejected");
    expect(() =>
      assertMediaShotRenderable({repoRoot: repoRoot2, episodeId: episodeId2, segmentId: "seg-001"}),
    ).toThrow(/MEDIA_RENDER_CLIP_GATE_FAILED/u);

    // 3) Tampered shot artifact → fail-closed (registered bytes no longer bind).
    const repoRoot3 = temporaryRepo();
    const episodeId3 = "episode-m5";
    const fixture3 = await setupSelectedRealMedia(repoRoot3, episodeId3);
    const timeline3 = makeTimeline(episodeId3, [
      {
        id: "seg-001",
        claimIds: fixture3.fixture.request.claimIds,
        startFrame: 0,
        durationFrames: 150,
      },
    ]);
    const timelineSha256_3 = writeTimeline(repoRoot3, episodeId3, timeline3);
    buildShot({
      repoRoot: repoRoot3,
      episodeId: episodeId3,
      timeline: timeline3,
      timelineSha256: timelineSha256_3,
    });
    fs.appendFileSync(
      path.join(repoRoot3, "content", episodeId3, "media", "shots", "seg-001.json"),
      " ",
    );
    expect(() =>
      assertMediaShotRenderable({repoRoot: repoRoot3, episodeId: episodeId3, segmentId: "seg-001"}),
    ).toThrow(/MEDIA_RENDER_SHOT_TAMPERED/u);

    // 4) Tampered public static copy → fail-closed.
    const repoRoot4 = temporaryRepo();
    const episodeId4 = "episode-m5";
    const fixture4 = await setupSelectedRealMedia(repoRoot4, episodeId4);
    const timeline4 = makeTimeline(episodeId4, [
      {
        id: "seg-001",
        claimIds: fixture4.fixture.request.claimIds,
        startFrame: 0,
        durationFrames: 150,
      },
    ]);
    const timelineSha256_4 = writeTimeline(repoRoot4, episodeId4, timeline4);
    buildShot({
      repoRoot: repoRoot4,
      episodeId: episodeId4,
      timeline: timeline4,
      timelineSha256: timelineSha256_4,
    });
    fs.writeFileSync(
      path.join(repoRoot4, "public", "episodes", episodeId4, "media", "seg-001.mp4"),
      "tampered public copy",
    );
    expect(() =>
      assertMediaShotRenderable({repoRoot: repoRoot4, episodeId: episodeId4, segmentId: "seg-001"}),
    ).toThrow(/MEDIA_RENDER_STATIC_COPY_TAMPERED/u);

    // 4b) Tampered normalized proxy (the CUT SOURCE the render proxy was cut
    //     from) → fail-closed: the cut source must stay registered + byte-
    //     hash-valid + anchored to the original.
    const repoRoot4b = temporaryRepo();
    const episodeId4b = "episode-m5";
    const fixture4b = await setupSelectedRealMedia(repoRoot4b, episodeId4b);
    const timeline4b = makeTimeline(episodeId4b, [
      {
        id: "seg-001",
        claimIds: fixture4b.fixture.request.claimIds,
        startFrame: 0,
        durationFrames: 150,
      },
    ]);
    const timelineSha256_4b = writeTimeline(repoRoot4b, episodeId4b, timeline4b);
    buildShot({
      repoRoot: repoRoot4b,
      episodeId: episodeId4b,
      timeline: timeline4b,
      timelineSha256: timelineSha256_4b,
    });
    const shot4b = readMediaShot(repoRoot4b, episodeId4b, "seg-001");
    const cutSourcePath = path.join(repoRoot4b, shot4b.lineage!.cutSourceRef.path);
    const cutSourceBytes = fs.readFileSync(cutSourcePath);
    fs.writeFileSync(cutSourcePath, Buffer.concat([cutSourceBytes, Buffer.from("tampered")]));
    // This fixture has no normalized proxy, so the cut source IS the original
    // and the tamper is caught by the clip gate; with a proxy the dedicated
    // CUT_SOURCE_TAMPERED check fires (proven by the E2E acceptance run).
    expect(() =>
      assertMediaShotRenderable({
        repoRoot: repoRoot4b,
        episodeId: episodeId4b,
        segmentId: "seg-001",
      }),
    ).toThrow(/MEDIA_RENDER_CUT_SOURCE_TAMPERED|MEDIA_RENDER_CLIP_GATE_FAILED/u);
    fs.writeFileSync(cutSourcePath, cutSourceBytes);
    expect(
      assertMediaShotRenderable({
        repoRoot: repoRoot4b,
        episodeId: episodeId4b,
        segmentId: "seg-001",
      }),
    ).toBeDefined();

    // 5) Cross-episode shot: a fully self-consistent shot artifact registered
    //    under episode-other can never pass the render gate (its slot chain
    //    does not exist in that episode).
    const repoRoot5 = temporaryRepo();
    const episodeId5 = "episode-m5";
    const fixture5 = await setupSelectedRealMedia(repoRoot5, episodeId5);
    const timeline5 = makeTimeline(episodeId5, [
      {
        id: "seg-001",
        claimIds: fixture5.fixture.request.claimIds,
        startFrame: 0,
        durationFrames: 150,
      },
    ]);
    const timelineSha256_5 = writeTimeline(repoRoot5, episodeId5, timeline5);
    buildShot({
      repoRoot: repoRoot5,
      episodeId: episodeId5,
      timeline: timeline5,
      timelineSha256: timelineSha256_5,
    });
    const foreignEpisode = "episode-other";
    const shot = readMediaShot(repoRoot5, episodeId5, "seg-001");
    const foreignRaw = JSON.parse(
      JSON.stringify(shot).replaceAll(episodeId5, foreignEpisode),
    ) as Record<string, unknown>;
    const foreignBody = {...foreignRaw};
    Reflect.deleteProperty(foreignBody, "artifactRef");
    // Embedded ref: content hash of the body WITHOUT the self-reference.
    const foreignEmbedded = artifactRefSchema.parse({
      ...(foreignRaw.artifactRef as Record<string, unknown>),
      episodeId: foreignEpisode,
      artifactId: `${foreignEpisode}:media-shot:seg-001`,
      sha256: sha256OfBytes(Buffer.from(serializeIndexArtifact(foreignBody), "utf8")),
      path: `content/${foreignEpisode}/media/shots/seg-001.json`,
    });
    const foreignShot = mediaShotSchema.parse({...foreignRaw, artifactRef: foreignEmbedded});
    // Registered ref: hash of the FULL file bytes (the artifact-registry
    // convention — the file is written with the canonical serializer).
    const foreignBytes = Buffer.from(serializeIndexArtifact(foreignShot), "utf8");
    const foreignRef = artifactRefSchema.parse({
      ...foreignEmbedded,
      sha256: sha256OfBytes(foreignBytes),
      sizeBytes: foreignBytes.byteLength,
    });
    const foreignPath = path.join(
      repoRoot5,
      "content",
      foreignEpisode,
      "media",
      "shots",
      "seg-001.json",
    );
    fs.mkdirSync(path.dirname(foreignPath), {recursive: true});
    fs.writeFileSync(foreignPath, foreignBytes);
    const foreignIndexPath = path.join(repoRoot5, "content", foreignEpisode, "artifact-index.json");
    let index = emptyArtifactIndex(foreignEpisode);
    index = registerCandidate(index, foreignRef, "media-render:foreign", []);
    writeArtifactIndexCas({
      filePath: foreignIndexPath,
      index,
      expectedVersion: null,
      casRoot: repoRoot5,
    });
    expect(() =>
      assertMediaShotRenderable({
        repoRoot: repoRoot5,
        episodeId: foreignEpisode,
        segmentId: "seg-001",
      }),
    ).toThrow(/MEDIA_RENDER_SLOT_MISSING/u);
  });

  itSlow(
    "is deterministic: identical inputs → identical shot and cache keys; changes → new keys",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
      const clipId = slot.selectedMediaClipRef!.clipId;
      const verification = assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId,
        verificationRef: slot.verificationRef!,
      });

      const first = buildShot({repoRoot, episodeId, timeline, timelineSha256});
      const firstShot = readMediaShot(repoRoot, episodeId, "seg-001");
      const second = buildShot({repoRoot, episodeId, timeline, timelineSha256});
      const secondShot = readMediaShot(repoRoot, episodeId, "seg-001");
      // Identical inputs (fixed clock) → identical artifact bytes.
      expect(second.artifactRef.sha256).toBe(first.artifactRef.sha256);
      expect(secondShot.artifactRef.sha256).toBe(firstShot.artifactRef.sha256);

      // Cache key determinism: same inputs → same key; trim/transform/timeline
      // changes → different keys.
      const manifest = readMediaSourceManifest(repoRoot, episodeId);
      const asset = manifest.assets.find(
        (candidate) => candidate.mediaId === slot.selectedMediaClipRef!.mediaId,
      )!;
      const baseKey = {
        episodeId,
        segmentId: "seg-001",
        clipId,
        sourceSha256: asset.sha256,
        analysisSourceSha256: asset.sha256,
        trimStartMs: verification.recommendedStartMs,
        trimEndMs: verification.recommendedEndMs,
        transform: firstShot.transform,
        timelineSha256,
        fps: 30,
        canvasWidth: 1080,
        canvasHeight: 1920,
        layoutVariant: "poke-standard",
        extractorId: "stub-render-proxy",
        extractorVersion: "stub-render-proxy-v1",
        dependencyHashes: FIXED_DEPENDENCY_HASHES,
      };
      const keyA = buildMediaRenderShotKey(baseKey);
      const keyB = buildMediaRenderShotKey(baseKey);
      expect(keyA).toBe(keyB);
      expect(keyA).toMatch(/^[a-f0-9]{64}$/u);
      const keyTrim = buildMediaRenderShotKey({...baseKey, trimStartMs: baseKey.trimStartMs + 100});
      const keyTransform = buildMediaRenderShotKey({
        ...baseKey,
        transform: {...baseKey.transform, scale: 1.5},
      });
      const keyTimeline = buildMediaRenderShotKey({...baseKey, timelineSha256: "c".repeat(64)});
      expect(keyTrim).not.toBe(keyA);
      expect(keyTransform).not.toBe(keyA);
      expect(keyTimeline).not.toBe(keyA);
    },
  );

  itSlow(
    "reuses the M4 shot-level cache: hit republishes the proxy, changed input misses",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
      const verification = assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: slot.selectedMediaClipRef!.clipId,
        verificationRef: slot.verificationRef!,
      });
      const cacheRoot = path.join(repoRoot, "cache");
      const cache = new FineGrainedCacheStore({
        root: cacheRoot,
        episodeId,
        now: () => FIXED_NOW,
      });

      // First build: cache miss + fresh proxy.
      const first = buildShot({repoRoot, episodeId, timeline, timelineSha256, cache});
      expect(first.cacheHit).toBe(false);
      const firstShot = readMediaShot(repoRoot, episodeId, "seg-001");
      const proxyBytes = fs.readFileSync(path.join(repoRoot, firstShot.renderProxyRef!.path));
      let events = readMediaEvents(repoRoot, episodeId);
      expect(events.some((event) => event.eventType === "media.render.cache.miss")).toBe(true);
      expect(events.some((event) => event.eventType === "media.render.cache.hit")).toBe(false);

      // Wipe the shot, the proxy artifact, and the public copy — the cache must
      // republish everything without re-encoding.
      fs.rmSync(path.join(repoRoot, "content", episodeId, "media", "shots", "seg-001.json"));
      fs.rmSync(path.join(repoRoot, firstShot.renderProxyRef!.path));
      fs.rmSync(path.join(repoRoot, "public", "episodes", episodeId, "media", "seg-001.mp4"));
      const second = buildShot({repoRoot, episodeId, timeline, timelineSha256, cache});
      expect(second.cacheHit).toBe(true);
      const secondShot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(secondShot.renderProxyRef!.sha256).toBe(firstShot.renderProxyRef!.sha256);
      expect(
        fs.readFileSync(path.join(repoRoot, secondShot.renderProxyRef!.path)).equals(proxyBytes),
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(repoRoot, "public", "episodes", episodeId, "media", "seg-001.mp4"),
          )
          .equals(proxyBytes),
      ).toBe(true);
      events = readMediaEvents(repoRoot, episodeId);
      const hits = events.filter((event) => event.eventType === "media.render.cache.hit");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.cacheKey).toBeDefined();
      expect(hits[0]?.cacheKey).toMatch(/^[a-f0-9]{64}$/u);

      // A different trim window is a different cache identity → miss + fresh
      // bytes (window-dependent extractor, so the proxy hash changes too).
      const windowedExtractor = {
        id: "stub-render-proxy",
        version: "stub-render-proxy-v1",
        extract: ({
          outputPath,
          startMs,
          endMs,
        }: {
          outputPath: string;
          startMs: number;
          endMs: number;
        }): void => {
          fs.mkdirSync(path.dirname(outputPath), {recursive: true});
          fs.writeFileSync(outputPath, Buffer.from(`proxy ${startMs}..${endMs}`));
        },
      } as never;
      const third = buildMediaShotForSegment({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        timeline,
        timelineSha256,
        trimStartMs: verification.recommendedStartMs,
        trimEndMs: verification.recommendedEndMs - 200,
        cache,
        cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
        proxyExtractor: windowedExtractor,
        now: () => FIXED_NOW,
      });
      expect(third.cacheHit).toBe(false);
      const thirdShot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(thirdShot.renderProxyRef!.sha256).not.toBe(firstShot.renderProxyRef!.sha256);
      events = readMediaEvents(repoRoot, episodeId);
      expect(
        events.filter((event) => event.eventType === "media.render.cache.miss").length,
      ).toBeGreaterThanOrEqual(2);
    },
  );

  itSlow(
    "keeps full lineage: rendered shot → clip → verification → ClipIndex → MediaAsset → source timestamp",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-m5";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      const outcome = buildShot({repoRoot, episodeId, timeline, timelineSha256});
      const shotId = outcome.artifactRef.artifactId;

      const trace = resolveMediaShotLineage({repoRoot, episodeId, segmentId: "seg-001"});
      expect(trace.shot.shotId).toBe(shotId);
      expect(trace.clip?.clipId).toBe(fixture.result.candidates[0]?.clipId);
      expect(trace.clip?.mediaId).toBe(DEMO_MEDIA_ID);
      expect(trace.verification?.verdict).toBe("pass");
      expect(trace.verification?.cacheKey).toMatch(/^[a-f0-9]{64}$/u);
      expect(trace.clipIndex?.artifactId).toMatch(new RegExp(`^${episodeId}:media-clip-index:`));
      expect(trace.mediaAsset?.mediaId).toBe(DEMO_MEDIA_ID);
      expect(trace.mediaAsset?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(trace.source?.sourceId).toBe(OFFICIAL_SOURCE);
      expect(trace.source?.publisher).toBe("Example Corp");
      // The rendered shot traces back to the ORIGINAL source timestamp window.
      expect(trace.sourceTimestamp).not.toBeNull();
      const shot = readMediaShot(repoRoot, episodeId, "seg-001");
      expect(trace.sourceTimestamp).toEqual({
        startMs: shot.trim!.startMs,
        endMs: shot.trim!.endMs,
      });
      expect(trace.sourceTimestamp!.startMs).toBeGreaterThanOrEqual(0);

      // Registry lineage: shot → verification → clip bytes → media → decisions.
      const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
      expect(registryReaches(repoRoot, episodeId, shotId, slot.verificationRef!.artifactId)).toBe(
        true,
      );
      expect(registryReaches(repoRoot, episodeId, shotId, DEMO_MEDIA_ID)).toBe(true);
      const manifest = readMediaSourceManifest(repoRoot, episodeId);
      const source = getMediaSource(manifest, OFFICIAL_SOURCE)!;
      for (const ref of [source.admissionDecisionRef, source.rightsDecisionRef]) {
        expect(registryReaches(repoRoot, episodeId, shotId, ref!.artifactId)).toBe(true);
      }
      // The chosen clip still passes the M5.06 authorization gate.
      expect(
        assertMediaClipVerified({
          repoRoot,
          episodeId,
          segmentId: "seg-001",
          clipId: trace.clip!.clipId,
          verificationRef: slot.verificationRef!,
        }).verdict,
      ).toBe("pass");
    },
  );
});

describe("WP-M5.08 render plan (timeline-bound projection for the generic composition)", () => {
  itSlow(
    "builds a hash-bound render plan mixing real media and fallback shots, with public copies",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-003";
      const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
      // Scene 1 gets the real media slot; scene 2 has no media pipeline at all.
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
        {id: "seg-002", claimIds: ["claim-fixture-003"], startFrame: 150, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      // The plan builder copies the generated captions to public.
      const captionsPath = path.join(
        repoRoot,
        "content",
        "episode-003",
        "production",
        "captions.generated.json",
      );
      fs.mkdirSync(path.dirname(captionsPath), {recursive: true});
      fs.writeFileSync(captionsPath, JSON.stringify([], null, 2));

      const plan = buildMediaRenderPlanForTimeline({
        repoRoot,
        episodeId,
        timeline,
        timelineSha256,
        proxyExtractor: createStubRenderProxyExtractor(),
        cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
        now: () => FIXED_NOW,
      });
      expect(plan.schemaVersion).toBe(MEDIA_RENDER_PLAN_SCHEMA_VERSION);
      expect(plan.planId).toBe(`${episodeId}:media:render-plan`);
      expect(plan.shots).toHaveLength(2);
      expect(plan.shots[0]?.visualType).toBe("real-media");
      expect(plan.shots[1]?.visualType).toBe("programmatic-visual");
      expect(plan.shots[0]?.startFrame).toBe(0);
      expect(plan.shots[1]?.startFrame).toBe(150);
      expect(plan.totalFrames).toBe(300);
      expect(plan.timelineSha256).toBe(timelineSha256);
      expect(plan.artifactRef.artifactId).toBe(`${episodeId}:media:render-plan`);
      // Registered + bytes hash-bound.
      expect(
        artifactRecords(repoRoot, episodeId).some(
          (record) => record.ref.artifactId === plan.artifactRef.artifactId,
        ),
      ).toBe(true);
      expect(sha256OfFile(path.join(repoRoot, plan.artifactRef.path))).toBe(
        artifactRecords(repoRoot, episodeId).find(
          (record) => record.ref.artifactId === plan.artifactRef.artifactId,
        )!.ref.sha256,
      );
      // Plan → shot → verification → media registry chain.
      expect(
        registryReaches(
          repoRoot,
          episodeId,
          plan.artifactRef.artifactId,
          plan.shots[0]!.artifactRef.artifactId,
        ),
      ).toBe(true);
      expect(
        registryReaches(
          repoRoot,
          episodeId,
          plan.artifactRef.artifactId,
          `${episodeId}:media:demo`,
        ),
      ).toBe(true);

      // Public copies for the composition.
      const publicDir = path.join(repoRoot, "public", "episodes", episodeId, "media");
      expect(fs.existsSync(path.join(publicDir, "render-plan.json"))).toBe(true);
      expect(fs.existsSync(path.join(publicDir, "timeline.json"))).toBe(true);
      expect(fs.existsSync(path.join(publicDir, "captions.json"))).toBe(true);
      expect(sha256OfFile(path.join(publicDir, "render-plan.json"))).toBe(
        sha256OfFile(path.join(repoRoot, plan.artifactRef.path)),
      );
      expect(sha256OfFile(path.join(publicDir, "timeline.json"))).toBe(timelineSha256);

      // The full plan re-authorizes fail-closed right before Remotion.
      const authorized = assertMediaRenderPlanRenderable({repoRoot, episodeId});
      expect(authorized.artifactRef.sha256).toBe(plan.artifactRef.sha256);
      expect(readMediaRenderPlan(repoRoot, episodeId).shots).toHaveLength(2);
    },
  );

  itSlow("is deterministic and fails closed when the timeline or media goes stale", async () => {
    const repoRoot = temporaryRepo();
    const episodeId = "episode-003";
    const {fixture} = await setupSelectedRealMedia(repoRoot, episodeId);
    const timeline = makeTimeline(episodeId, [
      {id: "seg-001", claimIds: fixture.request.claimIds, startFrame: 0, durationFrames: 150},
    ]);
    const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
    const captionsPath = path.join(
      repoRoot,
      "content",
      "episode-003",
      "production",
      "captions.generated.json",
    );
    fs.mkdirSync(path.dirname(captionsPath), {recursive: true});
    fs.writeFileSync(captionsPath, JSON.stringify([], null, 2));

    const planA = buildMediaRenderPlanForTimeline({
      repoRoot,
      episodeId,
      timeline,
      timelineSha256,
      proxyExtractor: createStubRenderProxyExtractor(),
      cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
      now: () => FIXED_NOW,
    });
    const planB = buildMediaRenderPlanForTimeline({
      repoRoot,
      episodeId,
      timeline,
      timelineSha256,
      proxyExtractor: createStubRenderProxyExtractor(),
      cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
      now: () => FIXED_NOW,
    });
    // Identical timeline/render input (fixed clock) → identical plan bytes.
    expect(planB.artifactRef.sha256).toBe(planA.artifactRef.sha256);

    // A stale timeline file fails closed at authorization.
    fs.appendFileSync(
      path.join(repoRoot, "content", episodeId, "production", "timeline.json"),
      " ",
    );
    expect(() => assertMediaRenderPlanRenderable({repoRoot, episodeId})).toThrow(
      /MEDIA_RENDER_TIMELINE_STALE/u,
    );
    // Rebuilding with the stale hash is refused too.
    expect(() =>
      buildMediaRenderPlanForTimeline({
        repoRoot,
        episodeId,
        timeline,
        timelineSha256,
        proxyExtractor: createStubRenderProxyExtractor(),
        cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
        now: () => FIXED_NOW,
      }),
    ).toThrow(/MEDIA_RENDER_TIMELINE_STALE/u);

    // Rights revocation after the plan build blocks the whole plan.
    const repoRoot2 = temporaryRepo();
    const episodeId2 = "episode-003";
    const fixture2 = await setupSelectedRealMedia(repoRoot2, episodeId2);
    const timeline2 = makeTimeline(episodeId2, [
      {
        id: "seg-001",
        claimIds: fixture2.fixture.request.claimIds,
        startFrame: 0,
        durationFrames: 150,
      },
    ]);
    const timelineSha256_2 = writeTimeline(repoRoot2, episodeId2, timeline2);
    const captionsPath2 = path.join(
      repoRoot2,
      "content",
      "episode-003",
      "production",
      "captions.generated.json",
    );
    fs.mkdirSync(path.dirname(captionsPath2), {recursive: true});
    fs.writeFileSync(captionsPath2, JSON.stringify([], null, 2));
    buildMediaRenderPlanForTimeline({
      repoRoot: repoRoot2,
      episodeId: episodeId2,
      timeline: timeline2,
      timelineSha256: timelineSha256_2,
      proxyExtractor: createStubRenderProxyExtractor(),
      cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
      now: () => FIXED_NOW,
    });
    withSourceRights(repoRoot2, episodeId2, `${episodeId2}:media-source:official`, "rejected");
    expect(() =>
      assertMediaRenderPlanRenderable({repoRoot: repoRoot2, episodeId: episodeId2}),
    ).toThrow(/MEDIA_RENDER_CLIP_GATE_FAILED/u);
  });

  itSlow("fails closed when a visual slot file exists but is tampered", async () => {
    const repoRoot = temporaryRepo();
    const episodeId = "episode-m5";
    writeFacts(repoRoot, episodeId, CLAIMS);
    const timeline = makeTimeline(episodeId, [
      {id: "seg-001", claimIds: ["claim-fixture-001"], startFrame: 0, durationFrames: 150},
    ]);
    const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
    const slotPath = path.join(repoRoot, mediaVisualSlotRepositoryPath(episodeId, "seg-001"));
    fs.mkdirSync(path.dirname(slotPath), {recursive: true});
    fs.writeFileSync(slotPath, "{not-a-visual-slot\n");
    expect(() => buildShot({repoRoot, episodeId, timeline, timelineSha256})).toThrow(
      /MEDIA_RENDER_SLOT_TAMPERED/u,
    );
  });

  itSlow(
    "projects an admitted official screenshot and refuses a tampered public plan",
    async () => {
      const repoRoot = temporaryRepo();
      const episodeId = "episode-003";
      const officialSource = `${episodeId}:media-source:official`;
      writeFacts(repoRoot, episodeId, CLAIMS);
      approveSourceWithType(repoRoot, episodeId, officialSource, "official");
      fabricateOriginal({
        repoRoot,
        episodeId,
        mediaId: `${episodeId}:media:home-shot`,
        sourceId: officialSource,
        bytes: Buffer.from("official screenshot fixture png"),
        durationMs: null,
        mediaType: "image/png",
      });
      const selected = await selectFor(repoRoot, episodeId, {
        segmentId: "seg-001",
        claimIds: ["claim-fixture-001"],
        narration: "测试旁白",
        visualIntent: "测试画面",
      });
      expect(selected.selectedType).toBe("official-screenshot");
      const timeline = makeTimeline(episodeId, [
        {id: "seg-001", claimIds: ["claim-fixture-001"], startFrame: 0, durationFrames: 150},
      ]);
      const timelineSha256 = writeTimeline(repoRoot, episodeId, timeline);
      const captionsPath = path.join(
        repoRoot,
        "content",
        "episode-003",
        "production",
        "captions.generated.json",
      );
      fs.mkdirSync(path.dirname(captionsPath), {recursive: true});
      fs.writeFileSync(captionsPath, JSON.stringify([], null, 2));
      const plan = buildMediaRenderPlanForTimeline({
        repoRoot,
        episodeId,
        timeline,
        timelineSha256,
        proxyExtractor: createStubRenderProxyExtractor(),
        cacheDependencyHashes: FIXED_DEPENDENCY_HASHES,
        now: () => FIXED_NOW,
      });
      expect(plan.shots[0]?.visualType).toBe("official-screenshot");
      expect(plan.shots[0]?.fallbackImagePath).toMatch(/episodes\/episode-003\/media\/.+\.png$/u);
      expect(assertMediaMixReadyToRender({repoRoot, episodeId}).artifactRef.sha256).toBe(
        plan.artifactRef.sha256,
      );
      fs.appendFileSync(
        path.join(repoRoot, "public", "episodes", episodeId, "media", "render-plan.json"),
        " ",
      );
      expect(() => assertMediaMixReadyToRender({repoRoot, episodeId})).toThrow(
        /MEDIA_RENDER_PUBLIC_PLAN_TAMPERED/u,
      );
    },
  );
});
