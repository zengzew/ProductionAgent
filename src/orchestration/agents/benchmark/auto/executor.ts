import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {AutoRepairDiagnosis} from "../../../schemas/role-model-auto";
import {normalizeRepoPath, resolveAutoRepositoryPath} from "./paths";

export type AuthorizedRepairTask = {
  diagnosis: AutoRepairDiagnosis;
  allowPaths: readonly string[];
  denyPaths: readonly string[];
  episodeId: string;
  promptPath: string;
  stagingRoot: string;
  instruction: string;
};

export type StagedRepairPatch = {
  files: ReadonlyArray<{path: string; content: string}>;
  detail: string;
};

/** Staging-only. The host diffs staging and applies an authorized patch. */
export type RepairExecutor = (task: AuthorizedRepairTask) => void | Promise<void>;

export const createRepairStagingRoot = (runId: string): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), `production-agent-repair-${runId}-`));

export const stageAllowedFiles = (
  repoRoot: string,
  stagingRoot: string,
  allowPaths: readonly string[],
): void => {
  for (const relative of allowPaths) {
    const source = resolveAutoRepositoryPath(repoRoot, relative);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const destination = path.join(stagingRoot, relative);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(source, destination);
  }
};

const listStagedFiles = (stagingRoot: string): string[] => {
  const found: string[] = [];
  const walk = (absoluteDir: string): void => {
    if (!fs.existsSync(absoluteDir)) return;
    for (const entry of fs.readdirSync(absoluteDir, {withFileTypes: true})) {
      const absolute = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (entry.isFile()) {
        found.push(normalizeRepoPath(path.relative(stagingRoot, absolute)));
      }
    }
  };
  walk(stagingRoot);
  return found.sort();
};

export const diffStagedRepair = (repoRoot: string, stagingRoot: string): StagedRepairPatch => {
  const files: Array<{path: string; content: string}> = [];
  for (const relative of listStagedFiles(stagingRoot)) {
    const staged = fs.readFileSync(path.join(stagingRoot, relative), "utf8");
    const originalPath = resolveAutoRepositoryPath(repoRoot, relative);
    const original = fs.existsSync(originalPath) ? fs.readFileSync(originalPath, "utf8") : null;
    if (original === staged) continue;
    files.push({path: relative, content: staged});
  }
  return {
    files,
    detail:
      files.length > 0 ? `staged ${files.length} file(s)` : "staging produced no file changes",
  };
};
