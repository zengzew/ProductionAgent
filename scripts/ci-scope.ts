import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {buildChangeScope} from "../src/orchestration/affected-tests";
import {changedPathsFromGit} from "../src/orchestration/verification";

const repoRoot = path.resolve(import.meta.dirname, "..");
const allZeros = /^0+$/u;

const gitDiffNames = (base: string, head: string): string[] => {
  const result = spawnSync("git", ["diff", "--name-only", base, head], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return changedPathsFromGit(repoRoot, result.stdout ?? "");
};

const workingTreePaths = (): string[] => {
  const tracked = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return [
    ...changedPathsFromGit(repoRoot, tracked.stdout ?? ""),
    ...changedPathsFromGit(repoRoot, untracked.stdout ?? ""),
  ];
};

const parseArgs = (argv: string[]): {full: boolean; changed: string[]} => {
  const changed: string[] = [];
  let full = false;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--full") {
      full = true;
      continue;
    }
    if (argument === "--changed") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("参数 --changed 缺少值");
      changed.push(value);
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${argument ?? ""}`);
  }
  return {full, changed};
};

const args = parseArgs(process.argv);
const base = process.env.CI_BASE_SHA;
const head = process.env.CI_HEAD_SHA;
const fromRange = Boolean(base && head && !allZeros.test(base));
const changedPaths =
  args.changed.length > 0
    ? args.changed
    : fromRange
      ? gitDiffNames(base as string, head as string)
      : workingTreePaths();
const emptyInCi = changedPaths.length === 0 && Boolean(process.env.CI);
const scope = buildChangeScope(changedPaths, {fullSuite: args.full || emptyInCi});

const outputs: Record<string, string> = {
  layer: scope.layer,
  full_suite: String(scope.fullSuite),
  needs_typecheck: String(scope.needsTypecheck),
  needs_lint: String(scope.needsLint),
  needs_contract_tests: String(scope.needsContractTests),
  episode_ids: scope.episodeIds.join(" "),
};

console.log(JSON.stringify({...scope, ...outputs}, null, 2));

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(
    githubOutput,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}
