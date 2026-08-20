import fs from "node:fs";
import path from "node:path";

export const normalizeRepoPath = (repositoryPath: string): string =>
  path.posix.normalize(repositoryPath.replaceAll("\\", "/"));

export const resolveAutoRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`auto-repair path escapes repository: ${repositoryPath}`);
  }
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`auto-repair path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

export const relativeAutoRepositoryPath = (repoRoot: string, repositoryPath: string): string =>
  normalizeRepoPath(path.relative(repoRoot, resolveAutoRepositoryPath(repoRoot, repositoryPath)));

export const readAutoRepositoryFile = (repoRoot: string, repositoryPath: string): string =>
  fs.readFileSync(resolveAutoRepositoryPath(repoRoot, repositoryPath), "utf8");

export const writeAutoRepositoryFile = (
  repoRoot: string,
  repositoryPath: string,
  content: string,
): void => {
  const absolutePath = resolveAutoRepositoryPath(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, absolutePath);
};

export const autoRunRootPath = (episodeId: string, runId: string): string =>
  `content/${episodeId}/rollout/auto/${runId}`;
