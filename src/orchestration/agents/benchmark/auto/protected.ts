import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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

const walkFiles = (absoluteDir: string, repoRoot: string, into: Record<string, string>): void => {
  if (!fs.existsSync(absoluteDir)) return;
  const entries = fs.readdirSync(absoluteDir, {withFileTypes: true});
  for (const entry of entries) {
    const absolute = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, repoRoot, into);
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = normalizeRepoPath(path.relative(repoRoot, absolute));
    into[relative] = sha256File(absolute);
  }
};

export const snapshotProtectedPaths = (input: {
  repoRoot: string;
  episodeId: string;
  expectedOutputPaths?: readonly string[];
}): Record<string, string> => {
  const snapshot: Record<string, string> = {};
  for (const relative of PROTECTED_PATHS) {
    const absolute = resolveAutoRepositoryPath(input.repoRoot, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    snapshot[relative] = sha256File(absolute);
  }
  const directories = [
    ...PROTECTED_PATH_PREFIXES.map((prefix) => prefix.replace(/\/$/u, "")),
    `content/${input.episodeId}/story`,
    `content/${input.episodeId}/research`,
  ];
  for (const directory of directories) {
    walkFiles(path.join(input.repoRoot, directory), input.repoRoot, snapshot);
  }
  return snapshot;
};

export const assertProtectedSnapshotUnchanged = (
  before: Record<string, string>,
  after: Record<string, string>,
): void => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const relative of keys) {
    if (before[relative] !== after[relative]) {
      throw new Error(`PROTECTED_PATH_MUTATED:${relative}`);
    }
  }
};

const SKIP_WORKING_TREE_DIRS = new Set([".git", "node_modules"]);

export const snapshotWorkingTree = (repoRoot: string): Record<string, string> => {
  const snapshot: Record<string, string> = {};
  const walk = (absoluteDir: string): void => {
    if (!fs.existsSync(absoluteDir)) return;
    for (const entry of fs.readdirSync(absoluteDir, {withFileTypes: true})) {
      if (SKIP_WORKING_TREE_DIRS.has(entry.name)) continue;
      const absolute = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/\.\d+\.tmp$/u.test(entry.name)) continue;
      const relative = normalizeRepoPath(path.relative(repoRoot, absolute));
      snapshot[relative] = sha256File(absolute);
    }
  };
  walk(repoRoot);
  return snapshot;
};

export const assertWorkingTreeUnchanged = (
  before: Record<string, string>,
  after: Record<string, string>,
): void => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const relative of keys) {
    if (before[relative] !== after[relative]) {
      throw new Error(`EXECUTOR_TOUCHED_WORKING_TREE:${relative}`);
    }
  }
};
