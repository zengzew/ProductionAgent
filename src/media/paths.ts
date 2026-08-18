import path from "node:path";

const episodePattern = /^episode-[a-z0-9-]+$/u;

const assertEpisodeId = (episodeId: string): void => {
  if (!episodePattern.test(episodeId)) {
    throw new Error(`Invalid episode id: ${episodeId}`);
  }
};

export const mediaRootRepositoryPath = (episodeId: string): string => {
  assertEpisodeId(episodeId);
  return `content/${episodeId}/media`;
};

export const mediaSourceManifestRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/source-manifest.json`;

export const mediaAssetsRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/assets`;

export const mediaIndexesRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/indexes`;

export const mediaCandidatesRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/candidates`;

export const mediaVerificationsRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/verifications`;

export const mediaDecisionsRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/decisions`;

export const mediaSelectionsRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/selections`;

export const mediaObservabilityRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/observability`;

export const mediaObservabilityEventRepositoryPath = (episodeId: string): string =>
  `${mediaObservabilityRepositoryPath(episodeId)}/media-events.jsonl`;

export const mediaCacheEventsRepositoryPath = (episodeId: string): string =>
  `${mediaObservabilityRepositoryPath(episodeId)}/cache-events.jsonl`;

export const mediaTmpRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/.tmp`;

const mediaAssetFilenamePattern = /^[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9.+-]*$/u;

export const mediaAssetRepositoryPath = (episodeId: string, filename: string): string => {
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    filename.startsWith(".") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !mediaAssetFilenamePattern.test(filename)
  ) {
    throw new Error(`Invalid media asset filename: ${filename}`);
  }
  return `${mediaAssetsRepositoryPath(episodeId)}/${filename}`;
};

const mediaSlugPattern = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

const assertMediaSlug = (mediaSlug: string): void => {
  if (!mediaSlugPattern.test(mediaSlug)) {
    throw new Error(`Invalid media index slug: ${mediaSlug}`);
  }
};

/** `media/indexes/<slug>/` for one original media asset (slug = mediaId last segment). */
export const mediaIndexDirectoryRepositoryPath = (episodeId: string, mediaSlug: string): string => {
  assertEpisodeId(episodeId);
  assertMediaSlug(mediaSlug);
  return `${mediaIndexesRepositoryPath(episodeId)}/${mediaSlug}`;
};

export const mediaTranscriptRepositoryPath = (episodeId: string, mediaSlug: string): string =>
  `${mediaIndexDirectoryRepositoryPath(episodeId, mediaSlug)}/transcript.json`;

export const mediaScenesRepositoryPath = (episodeId: string, mediaSlug: string): string =>
  `${mediaIndexDirectoryRepositoryPath(episodeId, mediaSlug)}/scenes.json`;

export const mediaKeyframesDirectoryRepositoryPath = (
  episodeId: string,
  mediaSlug: string,
): string => `${mediaIndexDirectoryRepositoryPath(episodeId, mediaSlug)}/keyframes`;

export const mediaKeyframeRepositoryPath = (
  episodeId: string,
  mediaSlug: string,
  filename: string,
): string => {
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    filename.startsWith(".") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !mediaAssetFilenamePattern.test(filename)
  ) {
    throw new Error(`Invalid media keyframe filename: ${filename}`);
  }
  return `${mediaKeyframesDirectoryRepositoryPath(episodeId, mediaSlug)}/${filename}`;
};

export const mediaClipIndexRepositoryPath = (episodeId: string, mediaSlug: string): string =>
  `${mediaIndexDirectoryRepositoryPath(episodeId, mediaSlug)}/clip-index.json`;

/** Internal per-media understanding ledger (ArtifactRef/status only, never bodies). */
export const mediaUnderstandingStatusRepositoryPath = (
  episodeId: string,
  mediaSlug: string,
): string => `${mediaIndexDirectoryRepositoryPath(episodeId, mediaSlug)}/status.json`;

const retrievalSegmentPattern = /^seg-[a-z0-9-]+$/u;

/**
 * `media/candidates/<segmentId>.json` — one hash-bound WP-M5.05 retrieval
 * result artifact per final-script segment.
 */
export const mediaRetrievalCandidateRepositoryPath = (
  episodeId: string,
  segmentId: string,
): string => {
  assertEpisodeId(episodeId);
  if (!retrievalSegmentPattern.test(segmentId)) {
    throw new Error(`Invalid retrieval segment id: ${segmentId}`);
  }
  return `${mediaCandidatesRepositoryPath(episodeId)}/${segmentId}.json`;
};

const verificationClipIdPattern = /^episode-[a-z0-9-]+:media-clip:[a-f0-9]+$/u;

/**
 * Deterministic filename slug for a clip id: `episode-<id>-media-clip-<hex>`.
 * Clip ids contain colons, so the slug is the id with colons replaced.
 */
export const mediaVerificationFilenameSlug = (clipId: string): string => {
  if (!verificationClipIdPattern.test(clipId)) {
    throw new Error(`Invalid verification clip id: ${clipId}`);
  }
  return clipId.replace(/:/gu, "-");
};

const assertVerificationSegmentClip = (
  episodeId: string,
  segmentId: string,
  clipId: string,
): void => {
  assertEpisodeId(episodeId);
  if (!retrievalSegmentPattern.test(segmentId)) {
    throw new Error(`Invalid verification segment id: ${segmentId}`);
  }
  mediaVerificationFilenameSlug(clipId);
};

/**
 * `media/verifications/<segmentId>/<clipId>.json` — one hash-bound WP-M5.06
 * `media-verification-v1` artifact per verified candidate clip.
 */
export const mediaVerificationRepositoryPath = (
  episodeId: string,
  segmentId: string,
  clipId: string,
): string => {
  assertVerificationSegmentClip(episodeId, segmentId, clipId);
  return `${mediaVerificationsRepositoryPath(episodeId)}/${segmentId}/${mediaVerificationFilenameSlug(clipId)}.json`;
};

/**
 * `media/verifications/<segmentId>/<clipId>-clip.<ext>` — the hash-bound short
 * verification clip bytes the VLM actually saw (never the whole long video).
 */
export const mediaVerificationClipRepositoryPath = (
  episodeId: string,
  segmentId: string,
  clipId: string,
  extension: string,
): string => {
  assertVerificationSegmentClip(episodeId, segmentId, clipId);
  if (!/^[a-z0-9][a-z0-9.+-]{0,8}$/u.test(extension)) {
    throw new Error(`Invalid verification clip extension: ${extension}`);
  }
  return `${mediaVerificationsRepositoryPath(episodeId)}/${segmentId}/${mediaVerificationFilenameSlug(clipId)}-clip.${extension}`;
};

const selectionSegmentPattern = /^seg-[a-z0-9-]+$/u;

/**
 * `media/selections/<segmentId>.json` — one hash-bound WP-M5.07
 * `visual-slot-v1` artifact per final-script segment.
 */
export const mediaVisualSlotRepositoryPath = (episodeId: string, segmentId: string): string => {
  assertEpisodeId(episodeId);
  if (!selectionSegmentPattern.test(segmentId)) {
    throw new Error(`Invalid visual slot segment id: ${segmentId}`);
  }
  return `${mediaSelectionsRepositoryPath(episodeId)}/${segmentId}.json`;
};

/* ------------------------------------------------------------------------- *
 * WP-M5.08 render paths
 * ------------------------------------------------------------------------- */

const renderSegmentPattern = /^seg-[a-z0-9-]+$/u;

const assertRenderSegment = (episodeId: string, segmentId: string): void => {
  assertEpisodeId(episodeId);
  if (!renderSegmentPattern.test(segmentId)) {
    throw new Error(`Invalid media render segment id: ${segmentId}`);
  }
};

export const mediaShotsRepositoryPath = (episodeId: string): string =>
  `${mediaRootRepositoryPath(episodeId)}/shots`;

/**
 * `media/shots/<segmentId>.json` — one hash-bound WP-M5.08 `media-shot-v1`
 * shot plan artifact per final-script segment (trim/transform/audio/lineage).
 */
export const mediaShotRepositoryPath = (episodeId: string, segmentId: string): string => {
  assertRenderSegment(episodeId, segmentId);
  return `${mediaShotsRepositoryPath(episodeId)}/${segmentId}.json`;
};

/**
 * `media/render-plan.json` — one hash-bound WP-M5.08 `media-render-plan-v1`
 * projection consumed by the generic Remotion mix composition.
 */
export const mediaRenderPlanRepositoryPath = (episodeId: string): string => {
  assertEpisodeId(episodeId);
  return `${mediaRootRepositoryPath(episodeId)}/render-plan.json`;
};

const renderProxyExtensionPattern = /^[a-z0-9][a-z0-9.+-]{0,8}$/u;

/**
 * `media/render/<segmentId>.<ext>` — the hash-bound WP-M5.08 render proxy
 * bytes (the trimmed, normalized cut the Remotion layer actually plays).
 */
export const mediaRenderProxyRepositoryPath = (
  episodeId: string,
  segmentId: string,
  extension: string,
): string => {
  assertRenderSegment(episodeId, segmentId);
  if (!renderProxyExtensionPattern.test(extension)) {
    throw new Error(`Invalid media render proxy extension: ${extension}`);
  }
  return `${mediaRootRepositoryPath(episodeId)}/render/${segmentId}.${extension}`;
};

/**
 * Public (Remotion `staticFile`) path of one render proxy. Files under
 * `public/episodes/<ep>/media/` are hash-verified copies of the render proxy
 * artifacts; the composition only ever consumes these via `staticFile`.
 */
export const mediaRenderPublicPath = (
  episodeId: string,
  segmentId: string,
  extension: string,
): string => {
  assertRenderSegment(episodeId, segmentId);
  if (!renderProxyExtensionPattern.test(extension)) {
    throw new Error(`Invalid media render public extension: ${extension}`);
  }
  return `episodes/${episodeId}/media/${segmentId}.${extension}`;
};

/** Public (Remotion `staticFile`) path of the render plan projection. */
export const mediaRenderPlanPublicPath = (episodeId: string): string => {
  assertEpisodeId(episodeId);
  return `episodes/${episodeId}/media/render-plan.json`;
};

/**
 * `media/render-manifest.json` — WP-M5.09 render-time projection of admitted
 * sources, ingested assets, verified clips, and usage decisions.
 */
export const mediaRenderManifestRepositoryPath = (episodeId: string): string => {
  assertEpisodeId(episodeId);
  return `${mediaRootRepositoryPath(episodeId)}/render-manifest.json`;
};

/** Repository path of the public render directory for one episode. */
export const mediaRenderPublicDirectoryRepositoryPath = (episodeId: string): string => {
  assertEpisodeId(episodeId);
  return `public/episodes/${episodeId}/media`;
};

export const resolveMediaRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const repoRelative = path.relative(path.resolve(repoRoot), absolutePath);
  if (repoRelative.startsWith("..") || path.isAbsolute(repoRelative)) {
    throw new Error(`Media path escapes repository: ${repositoryPath}`);
  }
  const requestedPosix = repositoryPath.split(path.sep).join("/");
  const resolvedPosix = repoRelative.split(path.sep).join("/");
  const requestedAssets = /^(content\/episode-[a-z0-9-]+\/media\/assets)(?:\/|$)/u.exec(
    requestedPosix,
  );
  if (requestedAssets && !resolvedPosix.startsWith(`${requestedAssets[1]}/`)) {
    throw new Error(`Media path escapes assets directory: ${repositoryPath}`);
  }
  return absolutePath;
};
