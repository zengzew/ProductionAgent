import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  cacheEventSchema,
  createCacheEventSink,
  FineGrainedCacheStore,
  humanDecisionSchema,
  readArtifactIndex,
  readHumanDecision,
  stableJson,
  type ArtifactRef,
  type HumanDecision,
} from "../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  buildMediaNormalizeCacheKey,
  buildNormalizationContract,
  createHttpsAcquisitionAdapter,
  createLocalFileAcquisitionAdapter,
  getMediaSource,
  ingestMediaSource,
  isMediaAssetRenderable,
  mediaAssetSchema,
  mediaIngestFileConfig,
  mediaSourceManifestSchema,
  mediaSourceSchema,
  normalizeMediaAsset,
  parseMediaIngestConfig,
  probeMediaFile,
  proposeMediaSource,
  readMediaEvents,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  setMediaSourceAdmission,
  writeMediaSourceManifestCas,
  type MediaAcquisitionAdapter,
  type MediaIngestConfig,
  type MediaRightsStatus,
  type MediaSource,
  type MediaSourceType,
  type NormalizationContract,
} from "../src/media";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-ingest-"));
  temporaryDirectories.push(directory);
  return directory;
};

const temporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-cache-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const episodeId = "episode-m5";
const sourceId = "episode-m5:media-source:founder";
const mediaId = "episode-m5:media:founder-demo";

const sha256Bytes = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const sha256File = (filePath: string): string => sha256Bytes(fs.readFileSync(filePath));

/* ------------------------------------------------------------------------- *
 * Media tool availability (fixtures are generated with the local ffmpeg).
 * ------------------------------------------------------------------------- */

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], {encoding: "utf8"}).status === 0;
const ffprobeAvailable = spawnSync("ffprobe", ["-version"], {encoding: "utf8"}).status === 0;
const mediaToolsAvailable = ffmpegAvailable && ffprobeAvailable;

const webmEncodable = (() => {
  if (!ffmpegAvailable) return false;
  const result = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], {encoding: "utf8"});
  return result.status === 0 && /libvpx/u.test(result.stdout);
})();

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

const makeVideoWebm = (filePath: string): void =>
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=25:duration=2",
    "-c:v",
    "libvpx",
    "-b:v",
    "500k",
    "-an",
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

const makeImagePng = (filePath: string): void =>
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=1:duration=1",
    "-frames:v",
    "1",
    filePath,
  ]);

const fixturePath = (repoRoot: string, name: string): string => {
  const directory = path.join(repoRoot, "fixtures");
  fs.mkdirSync(directory, {recursive: true});
  return path.join(directory, name);
};

/* ------------------------------------------------------------------------- *
 * Discovery + decision helpers (mirror WP-M5.02 tests)
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
  sourceUrl: "https://example.com/founder-demo.mp4",
  publisher: "Example Corp",
  sourceType: "founder",
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
    producer: "m5-ingest-test",
    createdAt: "2026-08-16T00:00:00.000Z",
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
    timestamp: "2026-08-16T00:01:00.000Z",
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
  // The rights decision must anchor the post-admission manifest bytes.
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

const ingest = (
  repoRoot: string,
  input: {
    sourceId: string;
    mediaId: string;
    adapter?: MediaAcquisitionAdapter;
    localFilePath?: string;
    cache?: FineGrainedCacheStore;
    config?: MediaIngestConfig;
    episode?: string;
  },
): Promise<Awaited<ReturnType<typeof ingestMediaSource>>> =>
  ingestMediaSource({
    repoRoot,
    episodeId: input.episode ?? episodeId,
    sourceId: input.sourceId,
    mediaId: input.mediaId,
    adapter: input.adapter,
    localFilePath: input.localFilePath,
    cache: input.cache,
    config: input.config,
  });

const countingLocalAdapter = (localFilePath: string, calls: string[]): MediaAcquisitionAdapter => {
  const inner = createLocalFileAcquisitionAdapter({localFilePath});
  return {
    id: "local-file-counted",
    acquire: async (context) => {
      calls.push(context.source.sourceId);
      return inner.acquire(context);
    },
  };
};

const httpsStubAdapter = (input: {
  bytes: Buffer;
  contentType?: string | null;
  contentLength?: number;
  status?: number;
  calls?: string[];
}): MediaAcquisitionAdapter =>
  createHttpsAcquisitionAdapter({
    fetchImpl: async (request) => {
      input.calls?.push(String(request));
      const headers = new Headers();
      if (input.contentType) headers.set("content-type", input.contentType);
      headers.set("content-length", String(input.contentLength ?? input.bytes.byteLength));
      return new Response(Uint8Array.from(input.bytes), {
        status: input.status ?? 200,
        headers,
      });
    },
  });

const sourceOf = (repoRoot: string, id: string): MediaSource => {
  const source = getMediaSource(readMediaSourceManifest(repoRoot, episodeId), id);
  if (!source) throw new Error(`fixture source missing: ${id}`);
  return source;
};

const withSourceRights = (
  repoRoot: string,
  sourceIdToChange: string,
  rightsStatus: MediaRightsStatus,
): void => {
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const next = mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: new Date().toISOString(),
    sources: manifest.sources.map((candidate) =>
      candidate.sourceId === sourceIdToChange
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

const indexPath = (repoRoot: string): string =>
  path.join(repoRoot, "content", episodeId, "artifact-index.json");

const assertNoAssetPublished = (repoRoot: string): void => {
  expect(readMediaSourceManifest(repoRoot, episodeId).assets).toHaveLength(0);
  const assetsDirectory = path.join(repoRoot, "content", episodeId, "media", "assets");
  if (fs.existsSync(assetsDirectory)) {
    expect(fs.readdirSync(assetsDirectory)).toHaveLength(0);
  }
};

/* ------------------------------------------------------------------------- *
 * Gate + fail-closed behavior (no media tools required)
 * ------------------------------------------------------------------------- */

describe("WP-M5.03 media ingest gate (fail-closed)", () => {
  it("rejects sources that are not formally admitted", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_SOURCE_NOT_ADMITTED/u);
    assertNoAssetPublished(repoRoot);

    // Admitted through the raw primitive (no decision ref) is not admitted.
    let manifest = readMediaSourceManifest(repoRoot, episodeId);
    manifest = setMediaSourceAdmission({
      manifest,
      sourceId,
      admissionStatus: "admitted",
      reason: "bypassed the formal gate",
      decidedBy: "sneaky-automation",
    });
    writeMediaSourceManifestCas({
      repoRoot,
      manifest,
      expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_SOURCE_NOT_ADMITTED/u);

    // A formal reject decision keeps the source un-ingestible.
    const rejectedSourceId = "episode-m5:media-source:rejected";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: rejectedSourceId}),
    });
    const ref = manifestRefFor(repoRoot, episodeId);
    const rejectDecision = makeDecision({
      gate: "media-admission",
      decision: "reject",
      ref,
      decisionId: "admission-reject-ingest-gate",
      issue: {
        category: "visual.asset-rights",
        severity: "high",
        locator: {kind: "whole-artifact", value: "media-source"},
        affectedArtifactRef: ref,
      },
      reason: "provenance cannot be verified",
    });
    applyMediaSourceAdmission({
      repoRoot,
      episodeId,
      sourceId: rejectedSourceId,
      decision: rejectDecision,
      expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });
    await expect(
      ingest(repoRoot, {sourceId: rejectedSourceId, mediaId, localFilePath: "/tmp/x.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_SOURCE_NOT_ADMITTED/u);
  });

  it("rejects sources whose rights are not approved by a formal decision", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    const ref = manifestRefFor(repoRoot, episodeId);
    const admission = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref,
      decisionId: "admission-gate-rights",
    });
    applyMediaSourceAdmission({
      repoRoot,
      episodeId,
      sourceId,
      decision: admission,
      expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });

    // review-required (the default) fails closed.
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_RIGHTS_NOT_APPROVED/u);

    // A rejected rights decision fails closed.
    const rejectedRights = makeDecision({
      gate: "media-rights",
      decision: "reject",
      ref: manifestRefFor(repoRoot, episodeId),
      decisionId: "rights-reject-ingest-gate",
      issue: {
        category: "visual.asset-rights",
        severity: "high",
        locator: {kind: "whole-artifact", value: "media-source"},
        affectedArtifactRef: ref,
      },
      reason: "license does not cover editorial use",
    });
    applyMediaSourceRights({
      repoRoot,
      episodeId,
      sourceId,
      decision: rejectedRights,
      expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_RIGHTS_NOT_APPROVED/u);
  });

  it("rejects rightsStatus=approved without a persisted rights decision", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    const ref = manifestRefFor(repoRoot, episodeId);
    const admission = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref,
      decisionId: "admission-gate-primitive-rights",
    });
    applyMediaSourceAdmission({
      repoRoot,
      episodeId,
      sourceId,
      decision: admission,
      expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });
    // Flip the primitive without any media-rights decision: still not approved.
    withSourceRights(repoRoot, sourceId, "approved");
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_RIGHTS_NOT_APPROVED/u);
    assertNoAssetPublished(repoRoot);
  });

  it("fails closed when a persisted HumanDecision was tampered", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    const source = sourceOf(repoRoot, sourceId);
    const decisionRef = source.admissionDecisionRef;
    if (!decisionRef) throw new Error("fixture admission decision ref missing");
    fs.writeFileSync(path.join(repoRoot, decisionRef.path), "tampered decision bytes\n");
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/HUMAN_DECISION_ARTIFACT_HASH_MISMATCH/u);
    assertNoAssetPublished(repoRoot);
  });

  it("rejects cross-episode sources, mediaIds, and unknown sources", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());

    // Media id of another episode.
    await expect(ingest(repoRoot, {sourceId, mediaId: "episode-other:media:clip"})).rejects.toThrow(
      /MEDIA_INGEST_MEDIA_ID_EPISODE_MISMATCH/u,
    );

    // Source id of another episode while ingesting into a foreign episode manifest.
    const otherRoot = temporaryRepo();
    const otherManifest = mediaSourceManifestSchema.parse({
      schemaVersion: "media-source-manifest-v1",
      episodeId: "episode-other",
      updatedAt: "2026-08-16T00:00:00.000Z",
      sources: [],
      assets: [],
    });
    writeMediaSourceManifestCas({
      repoRoot: otherRoot,
      manifest: otherManifest,
      expectedVersion: null,
    });
    await expect(
      ingest(otherRoot, {
        sourceId,
        mediaId: "episode-other:media:clip",
        episode: "episode-other",
      }),
    ).rejects.toThrow(/MEDIA_INGEST_SOURCE_UNKNOWN/u);

    // Invalid media id slugs are rejected before any work.
    await expect(
      ingest(repoRoot, {sourceId, mediaId: "episode-m5:media:Bad_Slug"}),
    ).rejects.toThrow(/MEDIA_INGEST_MEDIA_ID_INVALID/u);
    await expect(ingest(repoRoot, {sourceId, mediaId: "not-a-media-id"})).rejects.toThrow(
      /MEDIA_INGEST_MEDIA_ID_INVALID/u,
    );
  });

  it("records a failed ingest event without publishing anything", async () => {
    const repoRoot = temporaryRepo();
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: "/tmp/never-exists.mp4"}),
    ).rejects.toThrow(/MEDIA_INGEST_SOURCE_NOT_ADMITTED/u);
    const events = readMediaEvents(repoRoot, episodeId);
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "media.ingest.failed",
      "media.ingest.started",
    ]);
    expect(events.every((event) => event.episodeId === episodeId)).toBe(true);
    expect(events.every((event) => /^[a-f0-9]{64}$/u.test(event.eventId))).toBe(true);
  });

  it("builds deterministic normalization cache keys from sha + contract + tool version", () => {
    const contract: NormalizationContract = {
      codec: "libx264",
      preset: "veryfast",
      crf: 23,
      pixelFormat: "yuv420p",
      fps: 30,
      audio: null,
      container: "mp4",
      faststart: true,
    };
    const key = buildMediaNormalizeCacheKey({
      originalSha256: "a".repeat(64),
      contract,
      toolVersion: "media-ingest-v1",
      dependencyHashes: {},
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      buildMediaNormalizeCacheKey({
        originalSha256: "a".repeat(64),
        contract,
        toolVersion: "media-ingest-v1",
        dependencyHashes: {},
      }),
    ).toBe(key);
    expect(
      buildMediaNormalizeCacheKey({
        originalSha256: "b".repeat(64),
        contract,
        toolVersion: "media-ingest-v1",
        dependencyHashes: {},
      }),
    ).not.toBe(key);
    expect(
      buildMediaNormalizeCacheKey({
        originalSha256: "a".repeat(64),
        contract: {...contract, fps: 25},
        toolVersion: "media-ingest-v1",
        dependencyHashes: {},
      }),
    ).not.toBe(key);
    expect(
      buildMediaNormalizeCacheKey({
        originalSha256: "a".repeat(64),
        contract,
        toolVersion: "media-ingest-v2",
        dependencyHashes: {},
      }),
    ).not.toBe(key);
    expect(
      buildMediaNormalizeCacheKey({
        originalSha256: "a".repeat(64),
        contract,
        toolVersion: "media-ingest-v1",
        dependencyHashes: {"config/media-ingest.json": "c".repeat(64)},
      }),
    ).not.toBe(key);
  });

  it("keeps ingest free of LLM/VLM/ASR primitives and direct global fetch", () => {
    const sourcePath = new URL("../src/media/ingest.ts", import.meta.url);
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const token of ["openai", "anthropic", "whisper", "vlm", "transcript", "fetch("]) {
      expect(source).not.toContain(token);
    }
  });
});

/* ------------------------------------------------------------------------- *
 * Ingest + normalization (requires local ffmpeg/ffprobe)
 * ------------------------------------------------------------------------- */

describe.skipIf(!mediaToolsAvailable)("WP-M5.03 media ingest + normalization", () => {
  it("ingests an approved local MP4 as a byte-hashed original MediaAsset", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const result = await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture});
    expect(result.reused).toBe(false);

    const original = result.original;
    expect(original.kind).toBe("original");
    expect(original.episodeId).toBe(episodeId);
    expect(original.mediaSourceId).toBe(sourceId);
    expect(original.acquisitionMethod).toBe("local-approved");
    expect(original.originalFilename).toBe("founder-demo.mp4");
    expect(original.mediaType).toBe("video/mp4");
    expect(original.sha256).toBe(sha256File(fixture));
    expect(original.sizeBytes).toBe(fs.statSync(fixture).size);
    expect(original.artifactRef.artifactId).toBe(mediaId);
    expect(original.artifactRef.sha256).toBe(original.sha256);
    expect(original.artifactRef.sizeBytes).toBe(original.sizeBytes);
    expect(original.artifactRef.path).toBe(`content/${episodeId}/media/assets/founder-demo.mp4`);
    // Bytes on disk match the manifest hash exactly (source of truth).
    expect(sha256File(path.join(repoRoot, original.artifactRef.path))).toBe(original.sha256);

    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    expect(manifest.assets.map((asset) => asset.mediaId)).toEqual([
      mediaId,
      "episode-m5:media:founder-demo-proxy",
    ]);
    expect(manifest.assets[0]).toEqual(original);

    // Registered as a formal artifact-index candidate with decision lineage.
    const index = readArtifactIndex(indexPath(repoRoot));
    const record = index.artifacts.find((candidate) => candidate.ref.artifactId === mediaId);
    expect(record?.state).toBe("candidate");
    expect(record?.ref.sha256).toBe(original.sha256);
    expect(record?.dependencies).toHaveLength(2);
    expect(record?.dependencies.map((dependency) => dependency.artifactId).sort()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("episode-m5:production:human-decision-admission-"),
        expect.stringContaining("episode-m5:production:human-decision-rights-"),
      ]),
    );
    expect(index.selected[mediaId]).toBeUndefined();
  });

  it("ingests an approved HTTPS fixture through an injectable adapter (no real network)", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    const bytes = fs.readFileSync(fixture);
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());

    const calls: string[] = [];
    const adapter = httpsStubAdapter({
      bytes,
      contentType: "video/mp4",
      calls,
    });
    const result = await ingest(repoRoot, {sourceId, mediaId, adapter});

    expect(calls).toHaveLength(1);
    expect(result.original.acquisitionMethod).toBe("download");
    expect(result.original.originalFilename).toBe("founder-demo.mp4");
    expect(result.original.mediaType).toBe("video/mp4");
    expect(result.original.sha256).toBe(sha256Bytes(bytes));
    expect(result.original.artifactRef.path).toBe(
      `content/${episodeId}/media/assets/founder-demo.mp4`,
    );
    expect(sha256File(path.join(repoRoot, result.original.artifactRef.path))).toBe(
      result.original.sha256,
    );
  });

  it("extracts ffprobe metadata (duration/codec/width/height/fps/audio)", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const probe = probeMediaFile(fixture);
    expect(probe.category).toBe("video");
    expect(probe.canonicalContainer).toBe("mp4");
    expect(probe.videoCodec).toBe("h264");
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(240);
    expect(probe.fps).toBe(25);
    expect(probe.durationMs).toBeGreaterThan(1800);
    expect(probe.durationMs).toBeLessThan(2200);
    expect(probe.audioChannels).toBe(2);

    const result = await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture});
    const original = result.original;
    expect(original.durationMs).toBeGreaterThan(1800);
    expect(original.durationMs).toBeLessThan(2200);
    expect(original.width).toBe(320);
    expect(original.height).toBe(240);
    expect(original.fps).toBe(25);
    expect(original.audioChannels).toBe(2);
  });

  it("normalizes video into a deterministic H.264 proxy with full lineage", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const result = await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture});
    const original = result.original;
    const proxy = result.proxy;
    if (!proxy) throw new Error("fixture proxy missing");

    // Derived artifact contract.
    expect(proxy.kind).toBe("proxy");
    expect(proxy.episodeId).toBe(episodeId);
    expect(proxy.mediaType).toBe("video/mp4");
    expect(proxy.mediaId).toBe("episode-m5:media:founder-demo-proxy");
    expect(proxy.derivedFromMediaId).toBe(original.mediaId);
    expect(proxy.derivedFromMediaRef?.artifactId).toBe(original.mediaId);
    expect(proxy.derivedFromMediaRef?.sha256).toBe(original.artifactRef.sha256);
    expect(proxy.artifactRef.path).toBe(`content/${episodeId}/media/assets/founder-demo-proxy.mp4`);
    expect(sha256File(path.join(repoRoot, proxy.artifactRef.path))).toBe(proxy.sha256);

    // The proxy really is H.264/yuv420p at the contract fps.
    const proxyProbe = probeMediaFile(path.join(repoRoot, proxy.artifactRef.path));
    expect(proxyProbe.videoCodec).toBe("h264");
    expect(proxyProbe.pixelFormat).toBe("yuv420p");
    expect(proxyProbe.fps).toBe(25);
    expect(proxyProbe.durationMs).toBeGreaterThan(1800);
    expect(proxyProbe.audioChannels).toBe(2);

    // Original bytes are untouched by normalization.
    expect(sha256File(fixture)).toBe(original.sha256);
    expect(sha256File(path.join(repoRoot, original.artifactRef.path))).toBe(original.sha256);

    // Full lineage: proxy -> original -> source manifest entry -> decisions.
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    expect(manifest.assets.map((asset) => asset.mediaId).sort()).toEqual([
      mediaId,
      "episode-m5:media:founder-demo-proxy",
    ]);
    const source = getMediaSource(manifest, sourceId);
    if (!source) throw new Error("fixture source missing");
    expect(source.sourceUrl).toBe("");
    expect(source.sourceType).toBe("local-approved");
    if (!source.admissionDecisionRef || !source.rightsDecisionRef) {
      throw new Error("fixture decision refs missing");
    }
    expect(readHumanDecision(repoRoot, source.admissionDecisionRef, episodeId).decision).toBe(
      "approve",
    );
    expect(readHumanDecision(repoRoot, source.rightsDecisionRef, episodeId).decision).toBe(
      "approve",
    );

    // M5.01 renderability contract holds for both artifacts (selection is M5.07).
    expect(isMediaAssetRenderable(repoRoot, manifest, original, {requireSelected: false})).toBe(
      true,
    );
    expect(isMediaAssetRenderable(repoRoot, manifest, proxy, {requireSelected: false})).toBe(true);

    // The proxy candidate depends on the original + the two decisions.
    const index = readArtifactIndex(indexPath(repoRoot));
    const proxyRecord = index.artifacts.find(
      (candidate) => candidate.ref.artifactId === proxy.mediaId,
    );
    expect(proxyRecord?.state).toBe("candidate");
    expect(proxyRecord?.dependencies.map((dependency) => dependency.artifactId).sort()).toEqual(
      [
        source.admissionDecisionRef.artifactId,
        source.rightsDecisionRef.artifactId,
        original.mediaId,
      ].sort(),
    );
  });

  it("keeps repeated ingest idempotent without re-acquiring bytes", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const calls: string[] = [];
    const adapter = countingLocalAdapter(fixture, calls);
    const first = await ingest(repoRoot, {sourceId, mediaId, adapter});
    expect(calls).toHaveLength(1);
    expect(first.reused).toBe(false);

    const second = await ingest(repoRoot, {sourceId, mediaId, adapter});
    expect(second.reused).toBe(true);
    expect(second.normalizationCache).toBe("skipped");
    expect(calls).toHaveLength(1); // no re-download, no re-acquire
    expect(second.original).toEqual(first.original);
    expect(second.proxy?.mediaId).toBe(first.proxy?.mediaId);

    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    expect(manifest.assets).toHaveLength(2);
    expect(readMediaSourceManifestVersion(repoRoot, episodeId)).toBe(second.version);
  });

  it("reuses the normalization cache on identical inputs and rebuilds corrupt entries", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "clip-a.mp4");
    makeVideoMp4(fixture);
    const cacheRoot = temporaryDirectory();
    const cache = new FineGrainedCacheStore({
      root: cacheRoot,
      episodeId,
      eventSink: createCacheEventSink(
        path.join(repoRoot, "content", episodeId, "media", "observability", "cache-events.jsonl"),
      ),
    });

    const sourceA = "episode-m5:media-source:clip-a";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: sourceA, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: sourceA, sourceType: "local-approved", sourceUrl: ""}),
    );
    const first = await ingest(repoRoot, {
      sourceId: sourceA,
      mediaId: "episode-m5:media:clip-a",
      localFilePath: fixture,
      cache,
    });
    expect(first.normalizationCache).toBe("miss");

    // Identical bytes under a different identity hit the cache.
    const sourceB = "episode-m5:media-source:clip-b";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: sourceB, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: sourceB, sourceType: "local-approved", sourceUrl: ""}),
    );
    const second = await ingest(repoRoot, {
      sourceId: sourceB,
      mediaId: "episode-m5:media:clip-b",
      localFilePath: fixture,
      cache,
    });
    expect(second.normalizationCache).toBe("hit");
    expect(second.proxy?.sha256).toBe(first.proxy?.sha256);
    expect(sha256File(path.join(repoRoot, second.proxy?.artifactRef.path ?? ""))).toBe(
      second.proxy?.sha256,
    );

    // Corrupt the cached payload: the next identical input must miss + rebuild.
    const key = buildMediaNormalizeCacheKey({
      originalSha256: first.original.sha256,
      contract: buildNormalizationContract({
        probe: probeMediaFile(fixture),
        config: mediaIngestFileConfig,
      }),
      toolVersion: mediaIngestFileConfig.toolVersion,
      dependencyHashes: {},
    });
    const cacheEntryDir = path.join(cacheRoot, episodeId, "media-normalize", key);
    expect(fs.existsSync(cacheEntryDir)).toBe(true);
    fs.writeFileSync(path.join(cacheEntryDir, "payload.bin"), "corrupt cache bytes");

    const sourceC = "episode-m5:media-source:clip-c";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: sourceC, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: sourceC, sourceType: "local-approved", sourceUrl: ""}),
    );
    const third = await ingest(repoRoot, {
      sourceId: sourceC,
      mediaId: "episode-m5:media:clip-c",
      localFilePath: fixture,
      cache,
    });
    expect(third.normalizationCache).toBe("miss");
    expect(third.proxy?.sha256).toBe(first.proxy?.sha256);

    // The cache event log shows lookup/miss/hit/invalidation with zero cost on hits.
    const cacheEvents = fs
      .readFileSync(
        path.join(repoRoot, "content", episodeId, "media", "observability", "cache-events.jsonl"),
        "utf8",
      )
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => cacheEventSchema.parse(JSON.parse(line) as unknown));
    expect(cacheEvents.some((event) => event.eventType === "cache.miss")).toBe(true);
    expect(cacheEvents.some((event) => event.eventType === "cache.hit")).toBe(true);
    expect(cacheEvents.some((event) => event.eventType === "cache.invalidation")).toBe(true);
    const hitEvents = cacheEvents.filter((event) => event.eventType === "cache.hit");
    expect(hitEvents.every((event) => event.cost.amount === "0")).toBe(true);
    expect(cacheEvents.every((event) => event.episodeId === episodeId)).toBe(true);
  });

  it("never lets a cache hit bypass original integrity or the rights gate", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const result = await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture, cache});
    const original = result.original;

    // Tampered original bytes: normalization must fail before consulting the cache.
    fs.writeFileSync(path.join(repoRoot, original.artifactRef.path), "tampered original bytes");
    await expect(normalizeMediaAsset({repoRoot, episodeId, original, cache})).rejects.toThrow(
      /MEDIA_INGEST_ASSET_TAMPERED/u,
    );

    // Revoked rights: normalization must fail even though the cache is warm.
    withSourceRights(repoRoot, sourceId, "rejected");
    await expect(
      normalizeMediaAsset({
        repoRoot,
        episodeId,
        original: mediaAssetSchema.parse({...original}),
        cache,
      }),
    ).rejects.toThrow(/MEDIA_INGEST_RIGHTS_NOT_APPROVED/u);
  });

  it("never publishes partial or failed acquisitions", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    const bytes = fs.readFileSync(fixture);
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());

    // Body shorter than the declared Content-Length.
    const partial = httpsStubAdapter({
      bytes: bytes.subarray(0, 100),
      contentType: "video/mp4",
      contentLength: bytes.byteLength,
    });
    await expect(ingest(repoRoot, {sourceId, mediaId, adapter: partial})).rejects.toThrow(
      /MEDIA_INGEST_DOWNLOAD_PARTIAL/u,
    );
    assertNoAssetPublished(repoRoot);

    // Network failure.
    const failing = createHttpsAcquisitionAdapter({
      fetchImpl: async () => {
        throw new Error("fixture network failure");
      },
    });
    await expect(ingest(repoRoot, {sourceId, mediaId, adapter: failing})).rejects.toThrow(
      /MEDIA_INGEST_DOWNLOAD_FAILED/u,
    );
    assertNoAssetPublished(repoRoot);

    // A rejected status (login/paywall/DRM) is never bypassed.
    const rejected = httpsStubAdapter({bytes, contentType: "video/mp4", status: 403});
    await expect(ingest(repoRoot, {sourceId, mediaId, adapter: rejected})).rejects.toThrow(
      /MEDIA_INGEST_DOWNLOAD_REJECTED:403/u,
    );
    assertNoAssetPublished(repoRoot);

    // The failed attempts leave a failed event and zero candidates.
    const events = readMediaEvents(repoRoot, episodeId);
    expect(
      events.filter((event) => event.eventType === "media.ingest.failed").length,
    ).toBeGreaterThanOrEqual(3);
    const index = readArtifactIndex(indexPath(repoRoot));
    expect(index.artifacts.some((candidate) => candidate.ref.artifactId === mediaId)).toBe(false);
  });

  it("rejects oversized local files and unreadable bytes", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const tinyConfig = parseMediaIngestConfig({
      schemaVersion: "media-ingest-config-v1",
      maxDownloadBytes: 100,
      downloadTimeoutMs: 1000,
      allowedContentTypes: mediaIngestFileConfig.allowedContentTypes,
      normalization: mediaIngestFileConfig.normalization,
      toolVersion: "test-tiny-v1",
    });
    await expect(
      ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture, config: tinyConfig}),
    ).rejects.toThrow(/MEDIA_INGEST_DOWNLOAD_TOO_LARGE/u);
    assertNoAssetPublished(repoRoot);

    // Garbage bytes fail the probe.
    const garbage = fixturePath(repoRoot, "garbage.bin");
    fs.writeFileSync(garbage, "this is not media bytes at all");
    const garbageSourceId = "episode-m5:media-source:garbage";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: garbageSourceId, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: garbageSourceId, sourceType: "local-approved", sourceUrl: ""}),
    );
    await expect(
      ingest(repoRoot, {
        sourceId: garbageSourceId,
        mediaId: "episode-m5:media:garbage",
        localFilePath: garbage,
      }),
    ).rejects.toThrow(/MEDIA_INGEST_PROBE_FAILED/u);
    assertNoAssetPublished(repoRoot);
  });

  it("rejects MIME/extension conflicts with the real probe", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "clip.mp4");
    makeVideoMp4(fixture);
    const bytes = fs.readFileSync(fixture);

    // Declared content type outside the allowlist.
    proposeMediaSource({repoRoot, episodeId, source: baseSource()});
    approveSource(repoRoot, baseSource());
    await expect(
      ingest(repoRoot, {
        sourceId,
        mediaId,
        adapter: httpsStubAdapter({bytes, contentType: "text/html"}),
      }),
    ).rejects.toThrow(/MEDIA_INGEST_CONTENT_TYPE_NOT_ALLOWED/u);
    assertNoAssetPublished(repoRoot);

    // Declared content type contradicts the probed bytes.
    await expect(
      ingest(repoRoot, {
        sourceId,
        mediaId,
        adapter: httpsStubAdapter({bytes, contentType: "video/webm"}),
      }),
    ).rejects.toThrow(/MEDIA_INGEST_MIME_PROBE_MISMATCH/u);
    assertNoAssetPublished(repoRoot);

    // Extension category conflict: mp4 bytes under an audio extension.
    const wrongName = fixturePath(repoRoot, "clip.mp3");
    fs.copyFileSync(fixture, wrongName);
    const audioSourceId = "episode-m5:media-source:audio-named";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: audioSourceId, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: audioSourceId, sourceType: "local-approved", sourceUrl: ""}),
    );
    await expect(
      ingest(repoRoot, {
        sourceId: audioSourceId,
        mediaId: "episode-m5:media:audio-named",
        localFilePath: wrongName,
      }),
    ).rejects.toThrow(/MEDIA_INGEST_EXTENSION_PROBE_MISMATCH/u);

    // Extension container conflict: mp4 bytes under a webm extension.
    const webmNamed = fixturePath(repoRoot, "clip.webm");
    fs.copyFileSync(fixture, webmNamed);
    const webmSourceId = "episode-m5:media-source:webm-named";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: webmSourceId, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: webmSourceId, sourceType: "local-approved", sourceUrl: ""}),
    );
    await expect(
      ingest(repoRoot, {
        sourceId: webmSourceId,
        mediaId: "episode-m5:media:webm-named",
        localFilePath: webmNamed,
      }),
    ).rejects.toThrow(/MEDIA_INGEST_EXTENSION_PROBE_MISMATCH/u);
  });

  it.runIf(webmEncodable)("ingests a real WebM video and normalizes it", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "demo.webm");
    makeVideoWebm(fixture);
    const probe = probeMediaFile(fixture);
    expect(probe.mediaType).toBe("video/webm");
    expect(probe.canonicalContainer).toBe("webm");

    const webmSourceId = "episode-m5:media-source:webm-real";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: webmSourceId, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: webmSourceId, sourceType: "local-approved", sourceUrl: ""}),
    );
    const result = await ingest(repoRoot, {
      sourceId: webmSourceId,
      mediaId: "episode-m5:media:webm-real",
      localFilePath: fixture,
    });
    expect(result.original.mediaType).toBe("video/webm");
    expect(result.original.artifactRef.path).toContain("webm-real.webm");
    expect(result.proxy?.mediaType).toBe("video/mp4");
    expect(result.proxy?.derivedFromMediaId).toBe("episode-m5:media:webm-real");
  });

  it("safely ingests audio and image originals without proxies", async () => {
    const repoRoot = temporaryRepo();
    const audio = fixturePath(repoRoot, "voice-note.mp3");
    makeAudioMp3(audio);
    const audioSourceId = "episode-m5:media-source:voice-note";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: audioSourceId, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: audioSourceId, sourceType: "local-approved", sourceUrl: ""}),
    );
    const audioResult = await ingest(repoRoot, {
      sourceId: audioSourceId,
      mediaId: "episode-m5:media:voice-note",
      localFilePath: audio,
    });
    expect(audioResult.original.mediaType).toBe("audio/mpeg");
    expect(audioResult.original.durationMs).toBeGreaterThan(1500);
    expect(audioResult.proxy).toBeNull();
    expect(audioResult.normalizationCache).toBe("skipped");

    const image = fixturePath(repoRoot, "product-shot.png");
    makeImagePng(image);
    const imageSourceId = "episode-m5:media-source:product-shot";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: imageSourceId, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: imageSourceId, sourceType: "local-approved", sourceUrl: ""}),
    );
    const imageResult = await ingest(repoRoot, {
      sourceId: imageSourceId,
      mediaId: "episode-m5:media:product-shot",
      localFilePath: image,
    });
    expect(imageResult.original.mediaType).toBe("image/png");
    expect(imageResult.original.width).toBe(320);
    expect(imageResult.original.height).toBe(240);
    expect(imageResult.original.durationMs).toBeNull();
    expect(imageResult.proxy).toBeNull();
    expect(imageResult.normalizationCache).toBe("skipped");
  });

  it("fails closed on tampered originals and proxies", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));
    const result = await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture});
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const original = result.original;
    const proxy = result.proxy;
    if (!proxy) throw new Error("fixture proxy missing");

    expect(isMediaAssetRenderable(repoRoot, manifest, original, {requireSelected: false})).toBe(
      true,
    );

    // Tamper the original bytes.
    fs.writeFileSync(path.join(repoRoot, original.artifactRef.path), "tampered original");
    expect(isMediaAssetRenderable(repoRoot, manifest, original, {requireSelected: false})).toBe(
      false,
    );
    await expect(ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture})).rejects.toThrow(
      /MEDIA_INGEST_ASSET_TAMPERED/u,
    );

    // Tamper the proxy bytes (restore the original first).
    fs.copyFileSync(fixture, path.join(repoRoot, original.artifactRef.path));
    fs.writeFileSync(path.join(repoRoot, proxy.artifactRef.path), "tampered proxy");
    await expect(ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture})).rejects.toThrow(
      /MEDIA_INGEST_ASSET_TAMPERED/u,
    );
  });

  it("resumes after a crash without repeating hash-valid work", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const calls: string[] = [];
    const adapter = countingLocalAdapter(fixture, calls);
    const first = await ingest(repoRoot, {sourceId, mediaId, adapter});
    expect(calls).toHaveLength(1);
    const proxy = first.proxy;
    if (!proxy) throw new Error("fixture proxy missing");

    // Simulate a crash between original publish and proxy publish: drop the
    // proxy record + file but keep the hash-valid original.
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    fs.rmSync(path.join(repoRoot, proxy.artifactRef.path));
    const withoutProxy = mediaSourceManifestSchema.parse({
      ...manifest,
      updatedAt: new Date().toISOString(),
      assets: manifest.assets.filter((asset) => asset.mediaId !== proxy.mediaId),
    });
    writeMediaSourceManifestCas({
      repoRoot,
      manifest: withoutProxy,
      expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });

    const resumed = await ingest(repoRoot, {sourceId, mediaId, adapter});
    expect(resumed.reused).toBe(true); // original not re-acquired
    expect(calls).toHaveLength(1); // no second download
    expect(resumed.proxy?.mediaId).toBe(proxy.mediaId);
    const after = readMediaSourceManifest(repoRoot, episodeId);
    expect(after.assets.find((asset) => asset.mediaId === proxy.mediaId)).toBeDefined();
    expect(sha256File(path.join(repoRoot, resumed.proxy?.artifactRef.path ?? ""))).toBe(
      resumed.proxy?.sha256,
    );
  });

  it("sweeps stale ingest temp dirs and never publishes them", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    // Leftover temp dir from a crashed run.
    const tmpRoot = path.join(repoRoot, "content", episodeId, "media", ".tmp");
    const staleDir = path.join(tmpRoot, "founder-demo-crash-1");
    fs.mkdirSync(staleDir, {recursive: true});
    fs.writeFileSync(path.join(staleDir, "acquired"), "half-downloaded junk");

    const result = await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture});
    expect(fs.existsSync(staleDir)).toBe(false);
    expect(result.original.sha256).toBe(sha256File(fixture));
    const assets = fs.readdirSync(path.join(repoRoot, "content", episodeId, "media", "assets"));
    expect(assets.sort()).toEqual(["founder-demo-proxy.mp4", "founder-demo.mp4"]);
    expect(
      fs.readFileSync(
        path.join(repoRoot, "content", episodeId, "media", "assets", "founder-demo.mp4"),
        "utf8",
      ),
    ).not.toContain("half-downloaded");
  });

  it("rejects a mediaId already bound to another source", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    const sourceA = "episode-m5:media-source:clip-a";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: sourceA, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: sourceA, sourceType: "local-approved", sourceUrl: ""}),
    );
    await ingest(repoRoot, {
      sourceId: sourceA,
      mediaId: "episode-m5:media:clip-a",
      localFilePath: fixture,
    });

    const sourceB = "episode-m5:media-source:clip-b";
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceId: sourceB, sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(
      repoRoot,
      baseSource({sourceId: sourceB, sourceType: "local-approved", sourceUrl: ""}),
    );
    await expect(
      ingest(repoRoot, {
        sourceId: sourceB,
        mediaId: "episode-m5:media:clip-a",
        localFilePath: fixture,
      }),
    ).rejects.toThrow(/MEDIA_INGEST_MEDIA_ID_CONFLICT/u);
  });

  it("never changes HumanDecisions or the source record during ingest", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));

    const before = readMediaSourceManifest(repoRoot, episodeId);
    const sourceBefore = sourceOf(repoRoot, sourceId);
    if (!sourceBefore.admissionDecisionRef || !sourceBefore.rightsDecisionRef) {
      throw new Error("fixture decision refs missing");
    }
    const admissionShaBefore = sha256File(
      path.join(repoRoot, sourceBefore.admissionDecisionRef.path),
    );
    const rightsShaBefore = sha256File(path.join(repoRoot, sourceBefore.rightsDecisionRef.path));

    await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture});

    const after = readMediaSourceManifest(repoRoot, episodeId);
    const sourceAfter = sourceOf(repoRoot, sourceId);
    expect(stableJson(sourceAfter)).toBe(stableJson(sourceBefore));
    expect(sha256File(path.join(repoRoot, sourceAfter.admissionDecisionRef?.path ?? ""))).toBe(
      admissionShaBefore,
    );
    expect(sha256File(path.join(repoRoot, sourceAfter.rightsDecisionRef?.path ?? ""))).toBe(
      rightsShaBefore,
    );
    // The decisions still read back as the same approved decisions.
    if (!sourceAfter.admissionDecisionRef || !sourceAfter.rightsDecisionRef) {
      throw new Error("fixture decision refs missing after ingest");
    }
    expect(readHumanDecision(repoRoot, sourceAfter.admissionDecisionRef, episodeId)).toEqual(
      readHumanDecision(repoRoot, sourceBefore.admissionDecisionRef, episodeId),
    );
    expect(after.sources).toEqual(before.sources);
  });

  it("records the full media observability event lifecycle", async () => {
    const repoRoot = temporaryRepo();
    const fixture = fixturePath(repoRoot, "founder-demo.mp4");
    makeVideoMp4(fixture);
    proposeMediaSource({
      repoRoot,
      episodeId,
      source: baseSource({sourceType: "local-approved", sourceUrl: ""}),
    });
    approveSource(repoRoot, baseSource({sourceType: "local-approved", sourceUrl: ""}));
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});

    await ingest(repoRoot, {sourceId, mediaId, localFilePath: fixture, cache});

    const events = readMediaEvents(repoRoot, episodeId);
    const types = events.map((event) => event.eventType);
    expect(types).toContain("media.ingest.started");
    expect(types).toContain("media.ingest.completed");
    expect(types).toContain("media.normalize.started");
    expect(types).toContain("media.normalize.completed");
    expect(types).toContain("media.cache.miss");
    // Events only carry refs/hash/status and never body content.
    for (const event of events) {
      expect(event.episodeId).toBe(episodeId);
      expect(event.mediaSourceId).toBe(sourceId);
      expect(/^[a-f0-9]{64}$/u.test(event.eventId)).toBe(true);
      expect(event.reason ?? "").not.toContain("Bearer");
      if (event.artifactRef) {
        expect(event.artifactRef.episodeId).toBe(episodeId);
      }
    }
    const completed = events.find((event) => event.eventType === "media.ingest.completed");
    expect(completed?.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(completed?.artifactRef?.artifactId).toBe(mediaId);
    const normalizeCompleted = events.find(
      (event) => event.eventType === "media.normalize.completed",
    );
    expect(normalizeCompleted?.kind).toBe("proxy");
    expect(normalizeCompleted?.artifactRef?.artifactId).toBe("episode-m5:media:founder-demo-proxy");
  });
});
