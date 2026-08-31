import {spawnSync} from "node:child_process";
import path from "node:path";
import {
  affectedTestsFor,
  inferVerificationLayer,
  isFullSuitePath,
} from "../src/orchestration/affected-tests";
import {changedPathsFromGit} from "../src/orchestration/verification";

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseArgs = (argv: string[]): {full: boolean; list: boolean; changed: string[]} => {
  const changed: string[] = [];
  let full = false;
  let list = false;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--full") {
      full = true;
      continue;
    }
    if (argument === "--list") {
      list = true;
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
  return {full, list, changed};
};

const gitPaths = (): string[] => {
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

const args = parseArgs(process.argv);
const changedPaths = args.changed.length > 0 ? args.changed : gitPaths();
const layer = inferVerificationLayer(changedPaths, {fullSuite: args.full});
const fullSuite = args.full || changedPaths.some((value) => isFullSuitePath(value));
const tests = fullSuite ? [] : affectedTestsFor(changedPaths);

if (fullSuite) {
  console.log("affected tests: full suite (package/tooling or --full)");
  if (args.list) process.exit(0);
  const result = spawnSync("pnpm", ["test"], {cwd: repoRoot, stdio: "inherit", env: process.env});
  process.exit(result.status ?? 1);
}

if (tests.length === 0) {
  console.log(`No affected tests for current changes (layer=${layer}).`);
  process.exit(0);
}

console.log(`affected tests (${layer}):\n${tests.map((test) => `  ${test}`).join("\n")}`);
if (args.list) process.exit(0);

const result = spawnSync("pnpm", ["exec", "vitest", "run", ...tests], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
