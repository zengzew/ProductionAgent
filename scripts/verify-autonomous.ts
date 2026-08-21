import {spawnSync} from "node:child_process";
import path from "node:path";
import {
  changedPathsFromGit,
  runVerificationWorkflow,
  verificationStatePath,
} from "../src/orchestration/verification";

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseArgs = (argv: string[]): {full: boolean; changed: string[]} => {
  const changed: string[] = [];
  let full = false;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
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
const state = await runVerificationWorkflow({
  repoRoot,
  changedPaths,
  fullSuite: args.full,
});

console.log(
  JSON.stringify({
    status: state.status,
    runId: state.runId,
    highRisk: state.plan.highRisk,
    fullSuiteRequired: state.plan.fullSuiteRequired,
    checks: state.checks.map((check) => ({
      name: check.name,
      status: check.status,
      exitCode: check.exitCode,
    })),
    failedCheck: state.failedCheck,
    statePath: verificationStatePath(repoRoot),
  }),
);

if (state.status === "failed") process.exitCode = 1;
