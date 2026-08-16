import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  artifactDependencySchema,
  buildArtifactRef,
  emptyArtifactIndex,
  FineGrainedCacheStore,
  humanDecisionSchema,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  stableJson,
  writeArtifactIndexCas,
  type ArtifactDependency,
  type ArtifactRef,
  type HumanDecision,
} from "../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  buildMediaArtifactRef,
  createDeterministicSceneDetector,
  createDeterministicSemanticAdapter,
  createFfmpegKeyframeExtractor,
  createStubKeyframeExtractor,
  createStubTranscriptProvider,
  getMediaSource,
  indexMediaAsset,
  ingestMediaSource,
  mediaAssetSchema,
  mediaSourceManifestSchema,
  mediaSourceSchema,
  proposeMediaSource,
  readMediaClipIndex,
  readMediaEvents,
  readMediaScenes,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  readMediaTranscript,
  readMediaUnderstandingStatus,
  registerMediaAsset,
  writeMediaSourceManifestCas,
  type KeyframeExtractor,
  type MediaAsset,
  type MediaRightsStatus,
  type MediaSourceType,
  type MediaUnderstandingConfig,
  type SceneDetector,
  type SemanticMetadata,
  type SemanticUnderstandingAdapter,
  type TranscriptProvider,
} from "../src/media";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-index-"));
  temporaryDirectories.push(directory);
  return directory;
};

const temporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-index-cache-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const episodeId = "episode-m5";
const sourceId = "episode-m5:media-source:fixture";
const FIXED_NOW = "2026-08-16T00:00:00.000Z";

const sha256Bytes = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const sha256File = (filePath: string): string => sha256Bytes(fs.readFileSync(filePath));

/* ------------------------------------------------------------------------- *
 * Discovery + decision helpers (mirror WP-M5.02/M5.03 tests)
 * ------------------------------------------------------------------------- */

const baseSource = (
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
  rightsBasis: "Owner-provided interview for editorial use",
  ...overrides,
});

const manifestRefFor = (repoRoot: string, episode: string): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `${episode}:media:source-manifest`,
    episodeId: episode,
    path: `content/${episode}/media/source-manifest.json`,
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "m5-index-test",
    createdAt: FIXED_NOW,
  });

const makeDecision = (input: {
  gate: "media-admission" | "media-rights";
  decision: "approve" | "reject";
  ref: ArtifactRef;
  decisionId: string;
  issue?: Record<string, unknown>;
  reason?: string;
}): HumanDecision =>
  humanDecisionSchema.parse({
    decisionId: input.decisionId,
    gate: input.gate,
    decision: input.decision,
    reviewer: "human-reviewer-1",
    timestamp: FIXED_NOW,
    reason: input.reason ?? "reviewed for the media audit trail",
    artifactRefs: [input.ref],
    approvalEpoch: 0,
    ...(input.issue ? {issue: input.issue} : {}),
  });

/** Proposes a source and applies approve decisions for admission + rights. */
const approveSource = (
  repoRoot: string,
  source: ReturnType<typeof baseSource> & {sourceId: string},
): void => {
  const proposal = proposeMediaSource({repoRoot, episodeId, source});
  const slug = proposal.source.sourceId.replace(/[^A-Za-z0-9]/gu, "-");
  const admission = makeDecision({
    gate: "media-admission",
    decision: "approve",
    ref: manifestRefFor(repoRoot, episodeId),
    decisionId: `admission-${slug}`,
  });
  applyMediaSourceAdmission({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: admission,
    expectedManifestVersion: proposal.version,
  });
  const rights = makeDecision({
    gate: "media-rights",
    decision: "approve",
    ref: manifestRefFor(repoRoot, episodeId),
    decisionId: `rights-${slug}`,
  });
  applyMediaSourceRights({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: rights,
    expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
};

const decisionDependencies = (repoRoot: string): ArtifactDependency[] => {
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
  ref: ArtifactRef,
  executionId: string,
): void => {
  const filePath = path.join(repoRoot, "content", episodeId, "artifact-index.json");
  const expectedVersion = readArtifactIndexVersion(filePath);
  let index = fs.existsSync(filePath) ? readArtifactIndex(filePath) : emptyArtifactIndex(episodeId);
  index = registerCandidate(index, ref, executionId, decisionDependencies(repoRoot));
  writeArtifactIndexCas({filePath, index, expectedVersion, casRoot: repoRoot});
};

const extensionFor = (mediaType: string): string => {
  if (mediaType.startsWith("video/")) return "mp4";
  if (mediaType.startsWith("audio/")) return "mp3";
  return "png";
};

const fabricateOriginal = (input: {
  repoRoot: string;
  mediaId: string;
  bytes: Uint8Array;
  durationMs: number | null;
  mediaType?: string;
}): MediaAsset => {
  const {repoRoot} = input;
  const mediaType = input.mediaType ?? "video/mp4";
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
    producer: "m5-index-fixture",
    createdAt: FIXED_NOW,
  });
  const asset = mediaAssetSchema.parse({
    mediaId: input.mediaId,
    episodeId,
    mediaSourceId: sourceId,
    sourceUrl: "",
    publisher: "Example Corp",
    sourceType: "local-approved",
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
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const registered = registerMediaAsset({repoRoot, manifest, asset});
  writeMediaSourceManifestCas({
    repoRoot,
    manifest: registered,
    expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
  registerCandidateInIndex(repoRoot, ref, `media-ingest:${input.mediaId}`);
  return asset;
};

const fabricateProxy = (input: {
  repoRoot: string;
  original: MediaAsset;
  bytes: Uint8Array;
}): MediaAsset => {
  const {repoRoot} = input;
  const slug = input.original.mediaId.slice(`${episodeId}:media:`.length);
  const proxyMediaId = `${episodeId}:media:${slug}-proxy`;
  const filename = `${slug}-proxy.mp4`;
  const filePath = path.join(repoRoot, "content", episodeId, "media", "assets", filename);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, input.bytes);
  const ref = buildMediaArtifactRef({
    repoRoot,
    episodeId,
    mediaId: proxyMediaId,
    filename,
    mediaType: "video/mp4",
    producer: "m5-index-fixture:normalize",
    createdAt: FIXED_NOW,
  });
  const proxy = mediaAssetSchema.parse({
    mediaId: proxyMediaId,
    episodeId,
    mediaSourceId: sourceId,
    sourceUrl: "",
    publisher: "Example Corp",
    sourceType: "local-approved",
    acquisitionMethod: "local-approved",
    originalFilename: filename,
    mediaType: "video/mp4",
    sha256: ref.sha256,
    sizeBytes: ref.sizeBytes,
    durationMs: input.original.durationMs,
    width: 320,
    height: 240,
    fps: 25,
    audioChannels: 2,
    capturedAt: FIXED_NOW,
    accessedAt: FIXED_NOW,
    publishedAt: null,
    rightsBasis: "Owner-provided fixture",
    rightsStatus: "approved",
    artifactRef: ref,
    kind: "proxy",
    derivedFromMediaId: input.original.mediaId,
    derivedFromMediaRef: input.original.artifactRef,
  });
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const registered = registerMediaAsset({repoRoot, manifest, asset: proxy});
  writeMediaSourceManifestCas({
    repoRoot,
    manifest: registered,
    expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
  registerCandidateInIndex(repoRoot, ref, `media-ingest:${proxyMediaId}`);
  return proxy;
};

const withSourceRights = (repoRoot: string, rightsStatus: MediaRightsStatus): void => {
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

/* ------------------------------------------------------------------------- *
 * Stub providers / extractors
 * ------------------------------------------------------------------------- */

const demoSegments = [
  {text: "开场介绍", startMs: 0, endMs: 2000, speaker: "host", confidence: 0.9},
  {text: "产品核心功能演示", startMs: 3000, endMs: 5500, speaker: "host", confidence: 0.8},
  {text: "用户反馈与总结", startMs: 6000, endMs: 9500, speaker: "guest", confidence: 0.7},
];

const demoTranscriptProvider = createStubTranscriptProvider({segments: demoSegments});

const stubKeyframes = createStubKeyframeExtractor();

const stubSemantic = createDeterministicSemanticAdapter();

const stubSceneDetector = createDeterministicSceneDetector();

const stubConfig: MediaUnderstandingConfig = {
  scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
  clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
  keyframe: {quality: 2, mediaType: "image/jpeg"},
};

const countingTranscriptProvider = (
  inner: TranscriptProvider,
  calls: number[],
): TranscriptProvider => ({
  id: inner.id,
  model: inner.model,
  asrVersion: inner.asrVersion,
  toolVersion: inner.toolVersion,
  transcribe: async (context) => {
    calls.push(1);
    return inner.transcribe(context);
  },
});

const countingSceneDetector = (inner: SceneDetector, calls: number[]): SceneDetector => ({
  id: inner.id,
  version: inner.version,
  detect: (input) => {
    calls.push(1);
    return inner.detect(input);
  },
});

const countingKeyframeExtractor = (
  inner: KeyframeExtractor,
  calls: number[],
): KeyframeExtractor => ({
  id: inner.id,
  version: inner.version,
  extract: (input) => {
    calls.push(1);
    inner.extract(input);
  },
});

const countingSemanticAdapter = (
  inner: SemanticUnderstandingAdapter,
  calls: number[],
): SemanticUnderstandingAdapter => ({
  id: inner.id,
  version: inner.version,
  describe: async (input) => {
    calls.push(1);
    return inner.describe(input);
  },
});

const runIndex = (
  repoRoot: string,
  input: {
    mediaId: string;
    cache?: FineGrainedCacheStore | null;
    transcriptProvider?: TranscriptProvider;
    semanticAdapter?: SemanticUnderstandingAdapter;
    keyframeExtractor?: KeyframeExtractor;
    sceneDetector?: SceneDetector;
    config?: MediaUnderstandingConfig;
  },
) =>
  indexMediaAsset({
    repoRoot,
    episodeId,
    mediaId: input.mediaId,
    cache: input.cache ?? null,
    transcriptProvider: input.transcriptProvider,
    semanticAdapter: input.semanticAdapter,
    keyframeExtractor: input.keyframeExtractor ?? stubKeyframes,
    sceneDetector: input.sceneDetector ?? stubSceneDetector,
    config: input.config ?? stubConfig,
    now: () => FIXED_NOW,
  });

const indexesDirectory = (repoRoot: string, mediaId: string): string =>
  path.join(
    repoRoot,
    "content",
    episodeId,
    "media",
    "indexes",
    mediaId.slice(`${episodeId}:media:`.length),
  );

const indexPath = (repoRoot: string): string =>
  path.join(repoRoot, "content", episodeId, "artifact-index.json");

const artifactRecords = (repoRoot: string) => readArtifactIndex(indexPath(repoRoot)).artifacts;

/** BFS over registry dependencies; true when `target` artifactId is reachable. */
const registryReaches = (
  repoRoot: string,
  fromArtifactId: string,
  targetArtifactId: string,
): boolean => {
  const records = artifactRecords(repoRoot);
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

const fixturePath = (repoRoot: string, name: string): string => {
  const directory = path.join(repoRoot, "fixtures");
  fs.mkdirSync(directory, {recursive: true});
  return path.join(directory, name);
};

/* ------------------------------------------------------------------------- *
 * Pipeline mechanics with deterministic stubs (no media tools required)
 * ------------------------------------------------------------------------- */

describe("WP-M5.04 media understanding pipeline (deterministic stubs)", () => {
  it("builds transcript, scenes, keyframes, and clip index for a video", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const bytes = Buffer.from("fixture demo video bytes v1");
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({repoRoot, mediaId, bytes, durationMs: 10000});

    const result = await runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider});
    expect(result.transcript.ref).not.toBeNull();
    expect(result.scenes?.ref).not.toBeNull();
    expect(result.keyframes?.refs).toHaveLength(3);
    expect(result.clipIndex.ref).not.toBeNull();
    expect(result.usedProxy).toBe(false);
    expect(result.sourceSha256).toBe(sha256Bytes(bytes));

    // Transcript contract.
    const transcript = readMediaTranscript(repoRoot, episodeId, mediaId);
    expect(transcript.availability).toBe("available");
    expect(transcript.provider).toBe("stub-asr");
    expect(transcript.sourceMediaRef.artifactId).toBe(mediaId);
    expect(transcript.analysisSourceRef.artifactId).toBe(mediaId);
    expect(transcript.segments).toHaveLength(3);
    for (const segment of transcript.segments) {
      expect(segment.endMs).toBeGreaterThan(segment.startMs);
      expect(segment.startMs).toBeGreaterThanOrEqual(0);
      expect(segment.endMs).toBeLessThanOrEqual(10000);
      expect(segment.text.length).toBeGreaterThan(0);
      expect(segment.speaker).toBeTruthy();
    }
    expect(transcript.segments[0]?.index).toBe(0);
    expect(transcript.segments[2]?.index).toBe(2);

    // Scene contract: deterministic boundaries bound to media SHA + detector version.
    const scenes = readMediaScenes(repoRoot, episodeId, mediaId);
    expect(scenes.scenes).toHaveLength(3);
    expect(scenes.scenes[0]?.startMs).toBe(0);
    expect(scenes.scenes[2]?.endMs).toBe(10000);
    expect(scenes.sourceSha256).toBe(sha256Bytes(bytes));
    expect(scenes.detector).toBe("deterministic-boundaries");
    expect(scenes.detectorVersion).toBe("scene-detector-v1");

    // Keyframe contract: one per scene, timestamp inside its scene.
    const keyframes = result.keyframes;
    if (!keyframes) throw new Error("fixture keyframes missing");
    expect(keyframes.refs).toHaveLength(3);
    const keyframeFiles = fs
      .readdirSync(path.join(indexesDirectory(repoRoot, mediaId), "keyframes"))
      .sort();
    expect(keyframeFiles).toEqual([
      "keyframe-0-2000.jpg",
      "keyframe-1-6000.jpg",
      "keyframe-2-9000.jpg",
    ]);
    for (const ref of keyframes.refs) {
      expect(ref.mediaType).toBe("image/jpeg");
      expect(sha256File(path.join(repoRoot, ref.path))).toBe(ref.sha256);
    }

    // Clip index contract.
    const clipIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(clipIndex.items).toHaveLength(3);
    expect(clipIndex.sourceSha256).toBe(sha256Bytes(bytes));
    expect(clipIndex.transcriptAvailability).toBe("available");
    expect(clipIndex.scenesAvailability).toBe("available");
    expect(clipIndex.keyframesAvailability).toBe("available");
    const first = clipIndex.items[0];
    if (!first) throw new Error("fixture clip item missing");
    expect(first.episodeId).toBe(episodeId);
    expect(first.mediaRef.artifactId).toBe(mediaId);
    expect(first.startMs).toBe(0);
    expect(first.endMs).toBe(4000);
    expect(first.transcriptRefs).toEqual([result.transcript.ref]);
    expect(first.sceneRefs).toEqual([result.scenes?.ref]);
    expect(first.keyframeRefs).toHaveLength(1);
    expect(first.observedText).toContain("开场介绍");
    expect(first.sourceSha256).toBe(sha256Bytes(bytes));
    expect(first.indexVersion).toBe("media-clip-index-v1");
    expect(first.clipId).toMatch(/^episode-m5:media-clip:[a-f0-9]{24}$/u);
    const third = clipIndex.items[2];
    expect(third?.speaker).toBe("guest");

    // Status ledger holds refs/status only — never transcript bodies.
    const status = readMediaUnderstandingStatus(repoRoot, episodeId, mediaId);
    expect(status?.stages.transcript?.ref?.artifactId).toBe(result.transcript.ref?.artifactId);
    expect(status?.stages.keyframes?.entries).toHaveLength(3);
    const statusText = stableJson(status);
    expect(statusText).not.toContain("开场介绍");
  });

  it("produces deterministic clip ids and idempotent artifacts on repeat runs", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });

    const first = await runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider});
    const second = await runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider});

    // Byte-identical artifacts and identical refs.
    expect(second.transcript.ref?.sha256).toBe(first.transcript.ref?.sha256);
    expect(second.clipIndex.ref?.sha256).toBe(first.clipIndex.ref?.sha256);
    const firstIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    const secondIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(secondIndex.items.map((item) => item.clipId)).toEqual(
      firstIndex.items.map((item) => item.clipId),
    );
    expect(secondIndex.items[0]?.clipId).toBe(firstIndex.items[0]?.clipId);

    // Registry has exactly one record per derived artifact (no duplicates).
    const records = artifactRecords(repoRoot);
    const transcriptRecords = records.filter((record) =>
      record.ref.artifactId.endsWith(":media-transcript:demo"),
    );
    expect(transcriptRecords).toHaveLength(1);
    const indexRecords = records.filter((record) =>
      record.ref.artifactId.endsWith(":media-clip-index:demo"),
    );
    expect(indexRecords).toHaveLength(1);

    // Files are byte-identical across runs.
    expect(sha256File(path.join(repoRoot, first.transcript.ref?.path ?? ""))).toBe(
      first.transcript.ref?.sha256,
    );
    expect(sha256File(path.join(repoRoot, second.clipIndex.ref?.path ?? ""))).toBe(
      second.clipIndex.ref?.sha256,
    );
  });

  it("hits the cache on repeat runs without re-running ASR", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const calls: number[] = [];
    const provider = countingTranscriptProvider(demoTranscriptProvider, calls);

    await runIndex(repoRoot, {mediaId, cache, transcriptProvider: provider});
    expect(calls).toHaveLength(1);

    const second = await runIndex(repoRoot, {mediaId, cache, transcriptProvider: provider});
    expect(calls).toHaveLength(1); // no second ASR call
    expect(second.transcript.cacheHit).toBe(true);
    expect(second.scenes?.cacheHit).toBe(true);
    expect(second.keyframes?.cacheHit).toBe(true);
    expect(second.clipIndex.cacheHit).toBe(true);
  });

  it("rebuilds corrupt transcript and clip-index cache entries", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const cacheRoot = temporaryDirectory();
    const cache = new FineGrainedCacheStore({root: cacheRoot, episodeId});
    const calls: number[] = [];
    const provider = countingTranscriptProvider(demoTranscriptProvider, calls);

    const first = await runIndex(repoRoot, {mediaId, cache, transcriptProvider: provider});
    expect(calls).toHaveLength(1);

    // Corrupt the transcript payload: next run must miss + rebuild.
    const transcriptEntry = path.join(
      cacheRoot,
      episodeId,
      "media-transcript",
      first.transcript.cacheKey ?? "",
    );
    expect(fs.existsSync(transcriptEntry)).toBe(true);
    fs.writeFileSync(path.join(transcriptEntry, "payload.bin"), "corrupt transcript bytes");
    const second = await runIndex(repoRoot, {mediaId, cache, transcriptProvider: provider});
    expect(calls).toHaveLength(2); // ASR re-ran
    expect(second.transcript.cacheHit).toBe(false);
    expect(second.transcript.ref?.sha256).toBe(first.transcript.ref?.sha256); // deterministic rebuild

    // Corrupt the clip-index payload: only the index stage rebuilds.
    const indexEntry = path.join(
      cacheRoot,
      episodeId,
      "media-clip-index",
      first.clipIndex.cacheKey ?? "",
    );
    expect(fs.existsSync(indexEntry)).toBe(true);
    fs.writeFileSync(path.join(indexEntry, "payload.bin"), "corrupt index bytes");
    const third = await runIndex(repoRoot, {mediaId, cache, transcriptProvider: provider});
    expect(calls).toHaveLength(2); // ASR not re-run again
    expect(third.transcript.cacheHit).toBe(true);
    expect(third.clipIndex.cacheHit).toBe(false);
    expect(third.clipIndex.ref?.sha256).toBe(first.clipIndex.ref?.sha256);
  });

  it("resumes after a crash without repeating hash-valid stages (no cache)", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const calls: number[] = [];
    const provider = countingTranscriptProvider(demoTranscriptProvider, calls);

    await runIndex(repoRoot, {mediaId, transcriptProvider: provider});
    const second = await runIndex(repoRoot, {mediaId, transcriptProvider: provider});

    expect(calls).toHaveLength(1); // ASR never re-ran
    expect(second.transcript.reused).toBe(true);
    expect(second.scenes?.reused).toBe(true);
    expect(second.keyframes?.reused).toBe(true);
    expect(second.clipIndex.reused).toBe(true);
    expect(second.clipIndex.ref?.sha256).toBeDefined();
    const records = artifactRecords(repoRoot);
    expect(
      records.filter((record) => record.ref.artifactId.endsWith(":media-transcript:demo")),
    ).toHaveLength(1);
  });

  it("only invalidates the corresponding downstream when the ASR version changes", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const asrCalls: number[] = [];
    const sceneCalls: number[] = [];
    const keyframeCalls: number[] = [];
    const semanticCalls: number[] = [];
    const providerV1 = countingTranscriptProvider(
      createStubTranscriptProvider({segments: demoSegments, asrVersion: "stub-asr-v1"}),
      asrCalls,
    );
    const providerV2 = countingTranscriptProvider(
      createStubTranscriptProvider({segments: demoSegments, asrVersion: "stub-asr-v2"}),
      asrCalls,
    );

    const first = await runIndex(repoRoot, {
      mediaId,
      cache,
      transcriptProvider: providerV1,
      sceneDetector: countingSceneDetector(stubSceneDetector, sceneCalls),
      keyframeExtractor: countingKeyframeExtractor(stubKeyframes, keyframeCalls),
      semanticAdapter: countingSemanticAdapter(stubSemantic, semanticCalls),
    });
    expect(asrCalls).toHaveLength(1);
    expect(sceneCalls).toHaveLength(1);
    expect(keyframeCalls).toHaveLength(3);
    expect(semanticCalls).toHaveLength(3);

    const second = await runIndex(repoRoot, {
      mediaId,
      cache,
      transcriptProvider: providerV2,
      sceneDetector: countingSceneDetector(stubSceneDetector, sceneCalls),
      keyframeExtractor: countingKeyframeExtractor(stubKeyframes, keyframeCalls),
      semanticAdapter: countingSemanticAdapter(stubSemantic, semanticCalls),
    });

    expect(asrCalls).toHaveLength(2); // transcript rebuilt
    expect(second.transcript.cacheHit).toBe(false);
    expect(second.transcript.cacheKey).not.toBe(first.transcript.cacheKey);
    expect(sceneCalls).toHaveLength(1); // scenes untouched
    expect(second.scenes?.cacheHit).toBe(true);
    expect(second.scenes?.cacheKey).toBe(first.scenes?.cacheKey);
    expect(keyframeCalls).toHaveLength(3); // keyframes untouched
    expect(second.keyframes?.cacheHit).toBe(true);
    expect(second.clipIndex.cacheHit).toBe(false); // index consumes the transcript
    expect(second.clipIndex.cacheKey).not.toBe(first.clipIndex.cacheKey);
    expect(semanticCalls).toHaveLength(6); // only the index rebuild re-describes windows
  });

  it("invalidates the index when the media SHA changes", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const bytesA = Buffer.from("fixture demo video bytes A");
    const bytesB = Buffer.from("fixture demo video bytes B");
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo-a",
      bytes: bytesA,
      durationMs: 10000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo-b",
      bytes: bytesB,
      durationMs: 10000,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});

    const resultA = await runIndex(repoRoot, {
      mediaId: "episode-m5:media:demo-a",
      cache,
      transcriptProvider: demoTranscriptProvider,
    });
    const resultB = await runIndex(repoRoot, {
      mediaId: "episode-m5:media:demo-b",
      cache,
      transcriptProvider: demoTranscriptProvider,
    });

    expect(resultA.sourceSha256).toBe(sha256Bytes(bytesA));
    expect(resultB.sourceSha256).toBe(sha256Bytes(bytesB));
    expect(resultB.transcript.cacheKey).not.toBe(resultA.transcript.cacheKey);
    expect(resultB.clipIndex.cacheKey).not.toBe(resultA.clipIndex.cacheKey);
    expect(resultB.clipIndex.ref?.sha256).not.toBe(resultA.clipIndex.ref?.sha256);
    const indexA = readMediaClipIndex(repoRoot, episodeId, "episode-m5:media:demo-a");
    const indexB = readMediaClipIndex(repoRoot, episodeId, "episode-m5:media:demo-b");
    expect(indexA.items[0]?.clipId).not.toBe(indexB.items[0]?.clipId);
    expect(indexB.items[0]?.sourceSha256).toBe(sha256Bytes(bytesB));
  });

  it("records unavailable ASR explicitly without fabricating a transcript", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });

    // No transcript provider configured: default is explicitly unavailable.
    const result = await runIndex(repoRoot, {mediaId});
    expect(result.transcript.availability).toBe("unavailable");
    const transcript = readMediaTranscript(repoRoot, episodeId, mediaId);
    expect(transcript.availability).toBe("unavailable");
    expect(transcript.unavailableReason).toBe("no-asr-provider-configured");
    expect(transcript.segments).toHaveLength(0);
    const clipIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(clipIndex.transcriptAvailability).toBe("unavailable");
    expect(clipIndex.items).toHaveLength(3); // scene windows still exist
    for (const item of clipIndex.items) {
      expect(item.transcriptRefs).toHaveLength(0);
      expect(item.observedText).toBe("");
      expect(item.textSummary).toBe("");
    }
    const events = readMediaEvents(repoRoot, episodeId);
    const transcriptCompleted = events.find(
      (event) => event.eventType === "media.transcript.completed",
    );
    expect(transcriptCompleted?.availability).toBe("unavailable");
  });

  it("fails closed on illegal transcript timestamps", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });

    // Overlapping segments must never be silently "fixed".
    const overlapping = createStubTranscriptProvider({
      segments: [
        {text: "第一段", startMs: 1000, endMs: 3000},
        {text: "重叠段", startMs: 2500, endMs: 4000},
      ],
    });
    await expect(runIndex(repoRoot, {mediaId, transcriptProvider: overlapping})).rejects.toThrow(
      /MEDIA_TRANSCRIPT_INVALID/u,
    );
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "transcript.json"))).toBe(
      false,
    );
    const events = readMediaEvents(repoRoot, episodeId);
    expect(events.some((event) => event.eventType === "media.transcript.failed")).toBe(true);

    // Segments beyond the media duration are illegal too.
    const beyond = createStubTranscriptProvider({
      segments: [{text: "超时长", startMs: 9000, endMs: 12000}],
    });
    await expect(runIndex(repoRoot, {mediaId, transcriptProvider: beyond})).rejects.toThrow(
      /MEDIA_TRANSCRIPT_INVALID/u,
    );
  });

  it("fails closed on malformed semantic model metadata", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const brokenAdapter: SemanticUnderstandingAdapter = {
      id: "broken-semantic",
      version: "broken-v1",
      describe: async () => ({textSummary: 123}) as unknown as SemanticMetadata,
    };

    await expect(
      runIndex(repoRoot, {
        mediaId,
        transcriptProvider: demoTranscriptProvider,
        semanticAdapter: brokenAdapter,
      }),
    ).rejects.toThrow(/MEDIA_INDEX_SEMANTIC_METADATA_INVALID/u);
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "clip-index.json"))).toBe(
      false,
    );
    // Earlier stages published their own valid artifacts before the index failed.
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "transcript.json"))).toBe(
      true,
    );
    const events = readMediaEvents(repoRoot, episodeId);
    expect(events.some((event) => event.eventType === "media.index.failed")).toBe(true);
  });

  it("rejects tampered originals and proxies", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    const original = fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    fabricateProxy({repoRoot, original, bytes: Buffer.from("fixture proxy bytes v1")});

    const eventsBefore = readMediaEvents(repoRoot, episodeId).length;

    // Tampered original bytes.
    fs.writeFileSync(path.join(repoRoot, original.artifactRef.path), "tampered original bytes");
    await expect(
      runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider}),
    ).rejects.toThrow(/MEDIA_INDEX_ASSET_TAMPERED/u);
    // The gate fails before any stage event is recorded.
    expect(readMediaEvents(repoRoot, episodeId)).toHaveLength(eventsBefore);

    // Restore the original, tamper the proxy: analysis source fails closed.
    fs.writeFileSync(
      path.join(repoRoot, original.artifactRef.path),
      Buffer.from("fixture demo video bytes v1"),
    );
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const proxy = manifest.assets.find((asset) => asset.kind === "proxy");
    if (!proxy) throw new Error("fixture proxy missing");
    fs.writeFileSync(path.join(repoRoot, proxy.artifactRef.path), "tampered proxy bytes");
    await expect(
      runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider}),
    ).rejects.toThrow(/MEDIA_INDEX_ASSET_TAMPERED/u);
  });

  it("prefers the normalized proxy for analysis while keeping original lineage", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    const original = fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const proxy = fabricateProxy({
      repoRoot,
      original,
      bytes: Buffer.from("fixture proxy bytes v1"),
    });

    const result = await runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider});
    expect(result.usedProxy).toBe(true);
    expect(result.analysisSourceRef.artifactId).toBe(proxy.mediaId);
    const transcript = readMediaTranscript(repoRoot, episodeId, mediaId);
    expect(transcript.sourceMediaRef.artifactId).toBe(mediaId); // lineage root is the original
    expect(transcript.analysisSourceRef.artifactId).toBe(proxy.mediaId);
    const clipIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(clipIndex.analysisSourceRef.artifactId).toBe(proxy.mediaId);
    expect(clipIndex.mediaRef.artifactId).toBe(mediaId);
  });

  it("rejects media after rights are revoked, even with a warm cache and old index", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    await runIndex(repoRoot, {mediaId, cache, transcriptProvider: demoTranscriptProvider});
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "clip-index.json"))).toBe(
      true,
    );

    withSourceRights(repoRoot, "rejected");
    await expect(
      runIndex(repoRoot, {mediaId, cache, transcriptProvider: demoTranscriptProvider}),
    ).rejects.toThrow(/MEDIA_INDEX_RIGHTS_NOT_APPROVED/u);
    // The stale index stays on disk but the pipeline refuses to reuse it.
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "clip-index.json"))).toBe(
      true,
    );
  });

  it("rejects cross-episode media identities", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo",
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });

    await expect(
      runIndex(repoRoot, {
        mediaId: "episode-other:media:demo",
        transcriptProvider: demoTranscriptProvider,
      }),
    ).rejects.toThrow(/MEDIA_INDEX_MEDIA_ID_EPISODE_MISMATCH/u);
  });

  it("never fakes scene detection success", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:no-duration";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture video without duration"),
      durationMs: null,
    });

    await expect(
      runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider}),
    ).rejects.toThrow(/MEDIA_SCENES_NO_DURATION/u);
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "scenes.json"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(indexesDirectory(repoRoot, mediaId), "clip-index.json"))).toBe(
      false,
    );
    const events = readMediaEvents(repoRoot, episodeId);
    expect(events.some((event) => event.eventType === "media.scenes.failed")).toBe(true);
    expect(events.some((event) => event.eventType === "media.index.started")).toBe(false);
  });

  it("keeps images out of deep understanding", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:product-shot";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture png bytes"),
      durationMs: null,
      mediaType: "image/png",
    });

    await expect(
      runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider}),
    ).rejects.toThrow(/MEDIA_INDEX_NOT_APPLICABLE/u);
    expect(fs.existsSync(indexesDirectory(repoRoot, mediaId))).toBe(false);
  });

  it("builds timestamped transcript and deterministic clip windows for audio", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:voice-note";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture audio bytes"),
      durationMs: 30000,
      mediaType: "audio/mpeg",
    });
    const provider = createStubTranscriptProvider({
      segments: [
        {text: "第一段语音", startMs: 0, endMs: 10000, speaker: "host"},
        {text: "第二段语音", startMs: 12000, endMs: 25000, speaker: "host"},
        {text: "第三段语音", startMs: 26000, endMs: 30000, speaker: "guest"},
      ],
    });

    const result = await runIndex(repoRoot, {
      mediaId,
      transcriptProvider: provider,
      config: {
        scene: stubConfig.scene,
        clipWindow: {maxWindowMs: 15000, minWindowMs: 0},
        keyframe: stubConfig.keyframe,
      },
    });
    expect(result.scenes).toBeNull();
    expect(result.keyframes).toBeNull();
    expect(result.usedProxy).toBe(false);

    const transcript = readMediaTranscript(repoRoot, episodeId, mediaId);
    expect(transcript.segments).toHaveLength(3);
    expect(transcript.segments[2]?.endMs).toBeLessThanOrEqual(30000);

    const clipIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(clipIndex.items).toHaveLength(3);
    expect(clipIndex.scenesAvailability).toBe("not-applicable");
    expect(clipIndex.keyframesAvailability).toBe("not-applicable");
    expect(clipIndex.items[0]?.startMs).toBe(0);
    expect(clipIndex.items[0]?.endMs).toBe(10000);
    expect(clipIndex.items[1]?.startMs).toBe(12000);
    expect(clipIndex.items[1]?.endMs).toBe(25000);
    for (const item of clipIndex.items) {
      expect(item.transcriptRefs).toHaveLength(1);
      expect(item.sceneRefs).toHaveLength(0);
      expect(item.keyframeRefs).toHaveLength(0);
      expect(item.observedText.length).toBeGreaterThan(0);
    }
    expect(clipIndex.items[2]?.speaker).toBe("guest");
    const status = readMediaUnderstandingStatus(repoRoot, episodeId, mediaId);
    expect(status?.stages.scenes?.availability).toBe("not-applicable");
    expect(status?.stages.keyframes?.availability).toBe("not-applicable");
  });

  it("records the full media understanding observability lifecycle", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});

    await runIndex(repoRoot, {mediaId, cache, transcriptProvider: demoTranscriptProvider});
    await runIndex(repoRoot, {mediaId, cache, transcriptProvider: demoTranscriptProvider});

    const events = readMediaEvents(repoRoot, episodeId);
    const types = events.map((event) => event.eventType);
    for (const expected of [
      "media.transcript.started",
      "media.transcript.completed",
      "media.scenes.started",
      "media.scenes.completed",
      "media.keyframes.started",
      "media.keyframes.completed",
      "media.index.started",
      "media.index.completed",
      "media.understanding.cache.miss",
      "media.understanding.cache.hit",
    ]) {
      expect(types).toContain(expected);
    }
    for (const event of events) {
      expect(event.episodeId).toBe(episodeId);
      expect(event.mediaId).toBe(mediaId);
      expect(event.mediaSourceId).toBe(sourceId);
      expect(/^[a-f0-9]{64}$/u.test(event.eventId)).toBe(true);
      if (event.artifactRef) {
        expect(event.artifactRef.episodeId).toBe(episodeId);
      }
      expect(event.reason ?? "").not.toContain("Bearer");
    }
    // Events carry refs/hash/status only — never transcript bodies.
    const logText = fs.readFileSync(
      path.join(repoRoot, "content", episodeId, "media", "observability", "media-events.jsonl"),
      "utf8",
    );
    expect(logText).not.toContain("开场介绍");
    const completed = events.find((event) => event.eventType === "media.index.completed");
    expect(completed?.artifactRef?.artifactId).toBe("episode-m5:media-clip-index:demo");
    expect(completed?.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps every index artifact traceable back to the original MediaAsset", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });

    await runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider});

    const records = artifactRecords(repoRoot);
    const derivedIds = records
      .filter(
        (record) =>
          record.ref.artifactId.includes(":media-transcript:") ||
          record.ref.artifactId.includes(":media-scenes:") ||
          record.ref.artifactId.includes(":media-keyframe:") ||
          record.ref.artifactId.includes(":media-clip-index:"),
      )
      .map((record) => record.ref.artifactId);
    expect(derivedIds.length).toBeGreaterThanOrEqual(6); // 1 transcript + 1 scenes + 3 keyframes + 1 index
    for (const artifactId of derivedIds) {
      // Every derived artifact is a registered candidate that traces to the original.
      expect(registryReaches(repoRoot, artifactId, mediaId)).toBe(true);
    }
    // The clip index depends directly on the transcript/scenes/keyframes artifacts.
    const clipIndexRecord = records.find((record) =>
      record.ref.artifactId.endsWith(":media-clip-index:demo"),
    );
    if (!clipIndexRecord) throw new Error("fixture clip-index record missing");
    const dependencyIds = clipIndexRecord.dependencies.map((dependency) => dependency.artifactId);
    expect(dependencyIds).toContain(mediaId);
    expect(dependencyIds.some((id) => id.includes(":media-transcript:"))).toBe(true);
    expect(dependencyIds.some((id) => id.includes(":media-scenes:"))).toBe(true);
    expect(dependencyIds.some((id) => id.includes(":media-keyframe:"))).toBe(true);
    // No cross-episode dependencies (schema-enforced, asserted here as well).
    for (const record of records) {
      for (const dependency of record.dependencies) {
        expect(dependency.artifactId.startsWith(`${episodeId}:`)).toBe(true);
      }
    }
  });

  it("keeps keyframe lineage correct through the registry", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });

    const result = await runIndex(repoRoot, {mediaId, transcriptProvider: demoTranscriptProvider});
    const records = artifactRecords(repoRoot);
    const keyframeRecord = records.find(
      (record) => record.ref.artifactId === result.keyframes?.refs[0]?.artifactId,
    );
    if (!keyframeRecord) throw new Error("fixture keyframe record missing");
    const dependencyIds = keyframeRecord.dependencies.map((dependency) => dependency.artifactId);
    expect(dependencyIds).toContain(mediaId);
    expect(dependencyIds).toContain(result.scenes?.ref?.artifactId);
    // Keyframe bytes on disk are the hash-bound source of truth.
    const keyframeRef = result.keyframes?.refs[0];
    if (!keyframeRef) throw new Error("fixture keyframe ref missing");
    expect(sha256File(path.join(repoRoot, keyframeRef.path))).toBe(keyframeRef.sha256);
    expect(keyframeRef.schemaVersion).toBe("media-keyframe-v1");
    // Timestamp encoded in the filename lies inside its scene window.
    const match = /^keyframe-(\d+)-(\d+)\.jpg$/u.exec(path.basename(keyframeRef.path));
    expect(match).not.toBeNull();
    const scenes = readMediaScenes(repoRoot, episodeId, mediaId);
    const scene = scenes.scenes[Number(match?.[1])];
    const timestampMs = Number(match?.[2]);
    expect(scene).toBeDefined();
    if (scene) {
      expect(timestampMs).toBeGreaterThanOrEqual(scene.startMs);
      expect(timestampMs).toBeLessThan(scene.endMs);
    }
  });
});

/* ------------------------------------------------------------------------- *
 * Real media end-to-end (requires local ffmpeg/ffprobe)
 * ------------------------------------------------------------------------- */

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], {encoding: "utf8"}).status === 0;
const ffprobeAvailable = spawnSync("ffprobe", ["-version"], {encoding: "utf8"}).status === 0;
const mediaToolsAvailable = ffmpegAvailable && ffprobeAvailable;

const runFfmpeg = (args: string[]): void => {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`ffmpeg fixture failed: ${String(result.stderr).slice(0, 500)}`);
  }
};

const makeVideoMp4 = (filePath: string): void =>
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=25:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-shortest",
    filePath,
  ]);

const makeAudioMp3 = (filePath: string): void =>
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "2",
    "-c:a",
    "libmp3lame",
    filePath,
  ]);

describe.skipIf(!mediaToolsAvailable)("WP-M5.04 real media understanding", () => {
  it("builds the full index for an ingested video using the proxy and real keyframes", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:founder-demo";
    const ingested = await ingestMediaSource({
      repoRoot,
      episodeId,
      sourceId,
      mediaId,
      localFilePath: fixture,
    });
    const proxy = ingested.proxy;
    if (!proxy) throw new Error("fixture proxy missing");

    const provider = createStubTranscriptProvider({
      segments: [{text: "大家好，这是产品演示", startMs: 100, endMs: 1900, speaker: "host"}],
    });
    const result = await runIndex(repoRoot, {
      mediaId,
      transcriptProvider: provider,
      keyframeExtractor: createFfmpegKeyframeExtractor(),
    });
    expect(result.usedProxy).toBe(true);
    expect(result.analysisSourceRef.artifactId).toBe(proxy.mediaId);
    expect(result.keyframes?.refs).toHaveLength(1);

    const transcript = readMediaTranscript(repoRoot, episodeId, mediaId);
    expect(transcript.sourceMediaRef.artifactId).toBe(mediaId);
    expect(transcript.segments[0]?.text).toBe("大家好，这是产品演示");

    const scenes = readMediaScenes(repoRoot, episodeId, mediaId);
    expect(scenes.scenes[0]?.startMs).toBe(0);
    expect(scenes.scenes[0]?.endMs).toBeGreaterThan(1500);

    // Real ffmpeg keyframe: JPEG magic bytes + hash-bound artifact.
    const keyframeRef = result.keyframes?.refs[0];
    if (!keyframeRef) throw new Error("fixture keyframe ref missing");
    const keyframeBytes = fs.readFileSync(path.join(repoRoot, keyframeRef.path));
    expect(keyframeBytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(sha256Bytes(keyframeBytes)).toBe(keyframeRef.sha256);

    const clipIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(clipIndex.items).toHaveLength(1);
    expect(clipIndex.items[0]?.keyframeRefs[0]?.artifactId).toBe(keyframeRef.artifactId);
    expect(clipIndex.items[0]?.observedText).toBe("大家好，这是产品演示");
    expect(clipIndex.items[0]?.sourceSha256).toBe(ingested.original.sha256);
  });

  it("builds a timestamped transcript and clip index for ingested audio", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "voice-note.mp3");
    makeAudioMp3(fixture);
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const mediaId = "episode-m5:media:voice-note";
    const ingested = await ingestMediaSource({
      repoRoot,
      episodeId,
      sourceId,
      mediaId,
      localFilePath: fixture,
    });
    expect(ingested.proxy).toBeNull();

    const provider = createStubTranscriptProvider({
      segments: [
        {text: "第一句", startMs: 0, endMs: 800, speaker: "host"},
        {text: "第二句", startMs: 1000, endMs: 1900, speaker: "host"},
      ],
    });
    const result = await runIndex(repoRoot, {
      mediaId,
      transcriptProvider: provider,
      config: {
        scene: stubConfig.scene,
        clipWindow: {maxWindowMs: 1000, minWindowMs: 0},
        keyframe: stubConfig.keyframe,
      },
    });
    expect(result.scenes).toBeNull();
    expect(result.keyframes).toBeNull();

    const transcript = readMediaTranscript(repoRoot, episodeId, mediaId);
    expect(transcript.availability).toBe("available");
    expect(transcript.segments[1]?.startMs).toBe(1000);
    expect(transcript.segments[1]?.endMs).toBe(1900);
    expect(transcript.segments[1]?.endMs).toBeLessThanOrEqual(
      ingested.original.durationMs ?? Number.POSITIVE_INFINITY,
    );

    const clipIndex = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(clipIndex.items).toHaveLength(2);
    expect(clipIndex.items[0]?.startMs).toBe(0);
    expect(clipIndex.items[0]?.endMs).toBe(800);
    expect(clipIndex.items[1]?.startMs).toBe(1000);
    expect(clipIndex.items[1]?.endMs).toBe(1900);
    expect(clipIndex.items[0]?.observedText).toBe("第一句");
    expect(clipIndex.sourceSha256).toBe(ingested.original.sha256);
  });
});
