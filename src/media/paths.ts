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
