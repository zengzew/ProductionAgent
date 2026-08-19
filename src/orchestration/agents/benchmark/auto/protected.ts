import crypto from "node:crypto";
import fs from "node:fs";
import {normalizeRepoPath, resolveAutoRepositoryPath} from "./paths";

const sha256File = (absolutePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");

export const PROTECTED_PATH_PREFIXES = [
  "editorial-calibration/",
  "prompts/v4/",
  "src/lib/editorial/",
  "src/editorial-calibration/",
] as const;

export const PROTECTED_PATHS = [
  "config/agent-model-policy.json",
  "src/orchestration/agents/benchmark/script-writer-evaluate.ts",
] as const;

export const isProtectedRepairPath = (repositoryPath: string, episodeId: string): boolean => {
  const relative = normalizeRepoPath(repositoryPath);
  if ((PROTECTED_PATHS as readonly string[]).includes(relative)) return true;
  if (PROTECTED_PATH_PREFIXES.some((prefix) => relative.startsWith(prefix))) return true;
  if (relative.startsWith(`content/${episodeId}/story/`)) return true;
  if (relative.startsWith(`content/${episodeId}/research/`)) return true;
  return false;
};

export const canonicalEpisodePaths = (
  episodeId: string,
  expectedOutputPaths: readonly string[],
): string[] => {
  const paths = new Set<string>([`content/${episodeId}/story/script-draft.md`]);
  for (const outputPath of expectedOutputPaths) {
    paths.add(normalizeRepoPath(outputPath));
  }
  return [...paths].sort();
};

export const snapshotProtectedPaths = (input: {
  repoRoot: string;
  episodeId: string;
  expectedOutputPaths: readonly string[];
}): Record<string, string> => {
  const snapshot: Record<string, string> = {};
  const relatives = [
    ...PROTECTED_PATHS,
    ...canonicalEpisodePaths(input.episodeId, input.expectedOutputPaths),
  ];
  for (const relative of relatives) {
    const absolute = resolveAutoRepositoryPath(input.repoRoot, relative);
    if (!fs.existsSync(absolute)) continue;
    snapshot[relative] = sha256File(absolute);
  }
  return snapshot;
};

export const assertProtectedSnapshotUnchanged = (
  before: Record<string, string>,
  after: Record<string, string>,
): void => {
  for (const [relative, hash] of Object.entries(before)) {
    if (after[relative] !== hash) {
      throw new Error(`PROTECTED_PATH_MUTATED:${relative}`);
    }
  }
};
