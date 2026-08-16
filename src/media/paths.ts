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
