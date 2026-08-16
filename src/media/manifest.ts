import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertArtifactRefBytes,
  assertArtifactRefsSelected,
  buildArtifactRef,
} from "../orchestration/artifact-registry";
import type {ArtifactRef} from "../orchestration/schemas/artifact";
import {withOptimisticFileCasSync} from "../orchestration/concurrency";
import {stableJson} from "../orchestration/stable-json";
import {
  mediaAssetSchema,
  mediaClipRefSchema,
  mediaSourceManifestSchema,
  mediaSourceSchema,
  mediaVerificationSchema,
  type MediaAsset,
  type MediaClipRef,
  type MediaSource,
  type MediaSourceManifest,
} from "./schemas";
import {
  mediaAssetRepositoryPath,
  mediaSourceManifestRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";

const MANIFEST_SCHEMA_VERSION = "media-source-manifest-v1" as const;

export const emptyMediaSourceManifest = (input: {
  episodeId: string;
  updatedAt?: string;
}): MediaSourceManifest =>
  mediaSourceManifestSchema.parse({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    episodeId: input.episodeId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    sources: [],
    assets: [],
  });

export const mediaSourceManifestControlHash = (manifest: MediaSourceManifest): string =>
  crypto
    .createHash("sha256")
    .update(stableJson(mediaSourceManifestSchema.parse(manifest)))
    .digest("hex");

export const readMediaSourceManifest = (
  repoRoot: string,
  episodeId: string,
): MediaSourceManifest => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaSourceManifestRepositoryPath(episodeId),
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_SOURCE_MANIFEST_MISSING:${episodeId}`);
  }
  const parsed = mediaSourceManifestSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));
  if (parsed.episodeId !== episodeId) {
    throw new Error(`MEDIA_SOURCE_MANIFEST_EPISODE_MISMATCH:${parsed.episodeId}:${episodeId}`);
  }
  return parsed;
};

export const writeMediaSourceManifest = (
  repoRoot: string,
  manifest: MediaSourceManifest,
): string => {
  const parsed = mediaSourceManifestSchema.parse(manifest);
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaSourceManifestRepositoryPath(parsed.episodeId),
  );
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, {force: true});
  }
  return mediaSourceManifestControlHash(parsed);
};

export const readMediaSourceManifestVersion = (
  repoRoot: string,
  episodeId: string,
): string | null => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaSourceManifestRepositoryPath(episodeId),
  );
  return fs.existsSync(filePath)
    ? mediaSourceManifestControlHash(readMediaSourceManifest(repoRoot, episodeId))
    : null;
};

export const writeMediaSourceManifestCas = (input: {
  repoRoot: string;
  manifest: MediaSourceManifest;
  expectedVersion?: string | null;
}): string => {
  const parsed = mediaSourceManifestSchema.parse(input.manifest);
  const expected = input.expectedVersion ?? null;
  return withOptimisticFileCasSync({
    root: input.repoRoot,
    key: `media-source-manifest:${parsed.episodeId}`,
    run: () => {
      const current = readMediaSourceManifestVersion(input.repoRoot, parsed.episodeId);
      if (current !== expected) {
        throw new Error(
          `MEDIA_SOURCE_MANIFEST_CAS_CONFLICT:expected=${expected ?? "none"}:current=${current ?? "none"}`,
        );
      }
      return writeMediaSourceManifest(input.repoRoot, parsed);
    },
  });
};

export const registerMediaSource = (input: {
  manifest: MediaSourceManifest;
  source: MediaSource;
  updatedAt?: string;
}): MediaSourceManifest => {
  const manifest = mediaSourceManifestSchema.parse(input.manifest);
  const source = mediaSourceSchema.parse(input.source);
  if (manifest.episodeId !== source.episodeId) {
    throw new Error("MEDIA_SOURCE_EPISODE_MISMATCH");
  }
  const existing = manifest.sources.find((candidate) => candidate.sourceId === source.sourceId);
  if (existing) {
    if (stableJson(existing) !== stableJson(source)) {
      throw new Error(`MEDIA_SOURCE_ID_CONFLICT:${source.sourceId}`);
    }
    return manifest;
  }
  return mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    sources: [...manifest.sources, source],
  });
};

export const setMediaSourceAdmission = (input: {
  manifest: MediaSourceManifest;
  sourceId: string;
  admissionStatus: MediaSource["admissionStatus"];
  reason: string;
  decidedBy: string;
  decidedAt?: string;
}): MediaSourceManifest => {
  const manifest = mediaSourceManifestSchema.parse(input.manifest);
  const existing = manifest.sources.find((candidate) => candidate.sourceId === input.sourceId);
  if (!existing) {
    throw new Error(`MEDIA_SOURCE_UNKNOWN:${input.sourceId}`);
  }
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  const previous = existing;
  const next: MediaSource = mediaSourceSchema.parse({
    sourceId: previous.sourceId,
    episodeId: previous.episodeId,
    sourceUrl: previous.sourceUrl,
    publisher: previous.publisher,
    sourceType: previous.sourceType,
    admissionStatus: input.admissionStatus,
    admissionReason: input.reason,
    ...(input.admissionStatus === "admitted"
      ? {admittedAt: decidedAt, admittedBy: input.decidedBy}
      : {}),
    ...(input.admissionStatus === "rejected"
      ? {rejectedAt: decidedAt, rejectedBy: input.decidedBy}
      : {}),
    rightsBasis: previous.rightsBasis,
    rightsStatus: previous.rightsStatus,
    ...(previous.accessedAt ? {accessedAt: previous.accessedAt} : {}),
    notes: previous.notes,
  });
  return mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: decidedAt,
    sources: manifest.sources.map((candidate) =>
      candidate.sourceId === input.sourceId ? next : candidate,
    ),
  });
};

export const buildMediaArtifactRef = (input: {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  filename: string;
  mediaType: string;
  producer: string;
  previous?: ArtifactRef;
  createdAt?: string;
}): ArtifactRef => {
  const prefix = `${input.episodeId}:media:`;
  if (!input.mediaId.startsWith(prefix)) {
    throw new Error(`MEDIA_ID_EPISODE_MISMATCH:${input.mediaId}:${input.episodeId}`);
  }
  const slug = input.mediaId.slice(prefix.length);
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(slug)) {
    throw new Error(`MEDIA_ID_INVALID_SLUG:${input.mediaId}`);
  }
  return buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.mediaId,
    episodeId: input.episodeId,
    path: mediaAssetRepositoryPath(input.episodeId, input.filename),
    mediaType: input.mediaType,
    schemaVersion: "media-asset-v1",
    producer: input.producer,
    previous: input.previous,
    createdAt: input.createdAt,
  });
};

export const registerMediaAsset = (input: {
  repoRoot: string;
  manifest: MediaSourceManifest;
  asset: MediaAsset;
  updatedAt?: string;
}): MediaSourceManifest => {
  const manifest = mediaSourceManifestSchema.parse(input.manifest);
  const asset = mediaAssetSchema.parse(input.asset);
  if (manifest.episodeId !== asset.episodeId) {
    throw new Error("MEDIA_ASSET_EPISODE_MISMATCH");
  }
  const source = manifest.sources.find((candidate) => candidate.sourceId === asset.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_SOURCE_UNKNOWN:${asset.mediaSourceId}`);
  }
  if (source.admissionStatus !== "admitted") {
    throw new Error(`MEDIA_SOURCE_NOT_ADMITTED:${source.sourceId}`);
  }
  assertArtifactRefBytes(input.repoRoot, asset.artifactRef);
  const existing = manifest.assets.find((candidate) => candidate.mediaId === asset.mediaId);
  if (existing) {
    if (stableJson(existing) !== stableJson(asset)) {
      throw new Error(`MEDIA_ASSET_ID_CONFLICT:${asset.mediaId}`);
    }
    return manifest;
  }
  return mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    assets: [...manifest.assets, asset],
  });
};

export const findMediaAsset = (
  manifest: MediaSourceManifest,
  mediaId: string,
): MediaAsset | undefined => manifest.assets.find((asset) => asset.mediaId === mediaId);

export const assertMediaAssetBytes = (repoRoot: string, asset: MediaAsset): void => {
  assertArtifactRefBytes(repoRoot, mediaAssetSchema.parse(asset).artifactRef);
};

export const assertMediaAssetRenderable = (
  repoRoot: string,
  manifest: MediaSourceManifest,
  asset: MediaAsset,
  options: {requireSelected?: boolean} = {},
): void => {
  const parsedManifest = mediaSourceManifestSchema.parse(manifest);
  const parsedAsset = mediaAssetSchema.parse(asset);
  if (parsedManifest.episodeId !== parsedAsset.episodeId) {
    throw new Error("MEDIA_ASSET_EPISODE_MISMATCH");
  }
  const recorded = parsedManifest.assets.find(
    (candidate) => candidate.mediaId === parsedAsset.mediaId,
  );
  if (!recorded || stableJson(recorded) !== stableJson(parsedAsset)) {
    throw new Error(`MEDIA_ASSET_NOT_IN_MANIFEST:${parsedAsset.mediaId}`);
  }
  const source = parsedManifest.sources.find(
    (candidate) => candidate.sourceId === parsedAsset.mediaSourceId,
  );
  if (!source) {
    throw new Error(`MEDIA_SOURCE_UNKNOWN:${parsedAsset.mediaSourceId}`);
  }
  if (source.admissionStatus !== "admitted") {
    throw new Error(`MEDIA_SOURCE_NOT_ADMITTED:${source.sourceId}`);
  }
  if (source.rightsStatus !== "approved") {
    throw new Error(`MEDIA_SOURCE_RIGHTS_NOT_APPROVED:${source.sourceId}`);
  }
  if (parsedAsset.rightsStatus !== "approved") {
    throw new Error(`MEDIA_ASSET_RIGHTS_NOT_APPROVED:${parsedAsset.mediaId}`);
  }
  assertArtifactRefBytes(repoRoot, parsedAsset.artifactRef);
  if (options.requireSelected ?? true) {
    assertArtifactRefsSelected(repoRoot, [parsedAsset.artifactRef]);
  }
};

export const isMediaAssetRenderable = (
  repoRoot: string,
  manifest: MediaSourceManifest,
  asset: MediaAsset,
  options: {requireSelected?: boolean} = {},
): boolean => {
  try {
    assertMediaAssetRenderable(repoRoot, manifest, asset, options);
    return true;
  } catch {
    return false;
  }
};

export const assertMediaClipRenderable = (
  repoRoot: string,
  manifest: MediaSourceManifest,
  asset: MediaAsset,
  clip: MediaClipRef,
  options: {requireSelected?: boolean} = {},
): void => {
  const parsedClip = mediaClipRefSchema.parse(clip);
  const parsedAsset = mediaAssetSchema.parse(asset);
  assertMediaAssetRenderable(repoRoot, manifest, parsedAsset, options);
  if (
    parsedClip.mediaId !== parsedAsset.mediaId ||
    parsedClip.episodeId !== parsedAsset.episodeId
  ) {
    throw new Error(`MEDIA_CLIP_ASSET_MISMATCH:${parsedClip.clipId}`);
  }
  if (parsedAsset.durationMs !== null && parsedClip.endMs > parsedAsset.durationMs) {
    throw new Error(`MEDIA_CLIP_WINDOW_EXCEEDS_DURATION:${parsedClip.clipId}`);
  }
  if (!parsedClip.verificationRef) {
    throw new Error(`MEDIA_CLIP_VERIFICATION_REQUIRED:${parsedClip.clipId}`);
  }
  assertArtifactRefBytes(repoRoot, parsedClip.verificationRef);
  const verificationPath = resolveMediaRepositoryPath(repoRoot, parsedClip.verificationRef.path);
  const verification = mediaVerificationSchema.parse(
    JSON.parse(fs.readFileSync(verificationPath, "utf8")),
  );
  if (verification.verdict !== "pass") {
    throw new Error(`MEDIA_CLIP_VERIFICATION_NOT_PASSED:${parsedClip.clipId}`);
  }
  if (
    verification.clipId !== parsedClip.clipId ||
    verification.episodeId !== parsedClip.episodeId
  ) {
    throw new Error(`MEDIA_CLIP_VERIFICATION_MISMATCH:${parsedClip.clipId}`);
  }
};

export const isMediaClipRenderable = (
  repoRoot: string,
  manifest: MediaSourceManifest,
  asset: MediaAsset,
  clip: MediaClipRef,
  options: {requireSelected?: boolean} = {},
): boolean => {
  try {
    assertMediaClipRenderable(repoRoot, manifest, asset, clip, options);
    return true;
  } catch {
    return false;
  }
};
