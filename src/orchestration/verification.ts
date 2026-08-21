import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import crypto from "node:crypto";

export type VerificationCheckName =
  | "typecheck"
  | "related-vitest"
  | "orchestration-tests"
  | "benchmark-tests"
  | "review-promotion-tests"
  | "full-test";

export type VerificationCommand = {
  name: VerificationCheckName;
  command: "pnpm";
  args: string[];
  required: boolean;
};

export type VerificationPlan = {
  changedPaths: string[];
  highRisk: boolean;
  fullSuiteRequired: boolean;
  commands: VerificationCommand[];
};

export type VerificationCheckResult = VerificationCommand & {
  status: "passed" | "failed" | "not-run";
  exitCode: number | null;
  output: string;
};

export type VerificationState = {
  schemaVersion: "repo-autonomous-verification-v1";
  runId: string;
  startedAt: string;
  finishedAt: string;
  repository: string;
  changedPaths: string[];
  plan: VerificationPlan;
  checks: VerificationCheckResult[];
  status: "passed" | "failed";
  failedCheck: VerificationCheckName | null;
  repairAttempt: number;
  nextAction: "none" | "repair-and-rerun";
};

export type VerificationCommandRunner = (
  command: VerificationCommand,
) => VerificationCheckResult | Promise<VerificationCheckResult>;

export type VerificationRepair = (input: {
  failure: VerificationCheckResult;
  state: VerificationState;
}) => void | Promise<void>;

const verificationRoot = ".orchestration/verification";
const maxOutputBytes = 8_000;

const normalizePath = (value: string): string => value.split(path.sep).join("/");

const isPathIn = (value: string, prefix: string): boolean =>
  value === prefix || value.startsWith(`${prefix}/`);

const dedupe = (values: readonly string[]): string[] => [...new Set(values)].sort();

const isHighRiskPath = (value: string): boolean =>
  isPathIn(value, "src/orchestration") ||
  isPathIn(value, "src/lib/editorial") ||
  isPathIn(value, "src/editorial-calibration") ||
  isPathIn(value, "config") ||
  value === "package.json" ||
  value === "pnpm-lock.yaml" ||
  value === "pnpm-workspace.yaml" ||
  value.startsWith("scripts/benchmark-") ||
  value.startsWith("tests/orchestration/");

const relatedTestPaths = (changedPaths: readonly string[]): string[] => {
  const tests = new Set<string>();
  for (const changed of changedPaths) {
    if (changed.startsWith("tests/") && changed.endsWith(".test.ts")) tests.add(changed);
    if (
      changed.includes("role-model") ||
      changed.includes("benchmark") ||
      changed.includes("role-contract") ||
      changed.includes("verification")
    ) {
      for (const test of [
        "tests/orchestration/role-model-contract.test.ts",
        "tests/orchestration/role-model-benchmark.test.ts",
        "tests/orchestration/role-model-auto.test.ts",
        "tests/orchestration/role-model-review.test.ts",
        "tests/orchestration/hosted-agent.test.ts",
      ]) {
        tests.add(test);
      }
    }
    if (changed.startsWith("src/orchestration/")) tests.add("tests/orchestration");
  }
  return dedupe([...tests]);
};

export const buildVerificationPlan = (input: {
  changedPaths: readonly string[];
  fullSuite?: boolean;
}): VerificationPlan => {
  const changedPaths = dedupe(input.changedPaths.map(normalizePath));
  const highRisk = changedPaths.some(isHighRiskPath);
  const fullSuiteRequired = Boolean(input.fullSuite || highRisk);
  const related = relatedTestPaths(changedPaths);
  const commands: VerificationCommand[] = [
    {name: "typecheck", command: "pnpm", args: ["typecheck"], required: true},
  ];
  if (related.length > 0) {
    commands.push({
      name: "related-vitest",
      command: "pnpm",
      args: ["exec", "vitest", "run", ...related],
      required: true,
    });
  }
  commands.push(
    {
      name: "orchestration-tests",
      command: "pnpm",
      args: ["exec", "vitest", "run", "tests/orchestration"],
      required: true,
    },
    {
      name: "benchmark-tests",
      command: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "tests/orchestration/role-model-contract.test.ts",
        "tests/orchestration/role-model-benchmark.test.ts",
        "tests/orchestration/role-model-auto.test.ts",
      ],
      required: true,
    },
    {
      name: "review-promotion-tests",
      command: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "tests/orchestration/role-model-review.test.ts",
        "tests/orchestration/role-model-rollout.test.ts",
      ],
      required: true,
    },
  );
  if (fullSuiteRequired) {
    commands.push({name: "full-test", command: "pnpm", args: ["test"], required: true});
  }
  return {changedPaths, highRisk, fullSuiteRequired, commands};
};

const sanitizeOutput = (value: string): string =>
  value
    .replace(/Bearer\s+[^\s]+/giu, "Bearer [redacted]")
    .replace(/(api[_-]?key|secret|token)\s*[:=]\s*[^\s,]+/giu, "$1=[redacted]")
    .slice(-maxOutputBytes);

export const defaultVerificationCommandRunner = async (
  command: VerificationCommand,
  repoRoot = process.cwd(),
): Promise<VerificationCheckResult> => {
  const result = await new Promise<{exitCode: number | null; output: string}>((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => resolve({exitCode: 1, output: error.message}));
    child.on("close", (exitCode) =>
      resolve({exitCode, output: Buffer.concat(chunks).toString("utf8")}),
    );
  });
  return {
    ...command,
    status: result.exitCode === 0 ? "passed" : "failed",
    exitCode: result.exitCode,
    output: sanitizeOutput(result.output),
  };
};

const statePath = (repoRoot: string): string =>
  path.join(repoRoot, verificationRoot, "latest.json");

const writeState = (repoRoot: string, state: VerificationState): void => {
  const target = statePath(repoRoot);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, target);
};

const runId = (): string =>
  `verify-${new Date()
    .toISOString()
    .replace(/[^0-9]/gu, "")
    .slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;

export const runVerificationWorkflow = async (input: {
  repoRoot: string;
  changedPaths: readonly string[];
  fullSuite?: boolean;
  maxRepairAttempts?: number;
  runCommand?: VerificationCommandRunner;
  repair?: VerificationRepair;
  now?: () => string;
}): Promise<VerificationState> => {
  const plan = buildVerificationPlan({
    changedPaths: input.changedPaths,
    fullSuite: input.fullSuite,
  });
  const now = input.now ?? (() => new Date().toISOString());
  const runner =
    input.runCommand ??
    ((command: VerificationCommand) => defaultVerificationCommandRunner(command, input.repoRoot));
  const maxRepairAttempts = input.maxRepairAttempts ?? 0;
  const checks: VerificationCheckResult[] = [];
  let repairAttempt = 0;
  let failedCheck: VerificationCheckResult | undefined;
  let state: VerificationState = {
    schemaVersion: "repo-autonomous-verification-v1",
    runId: runId(),
    startedAt: now(),
    finishedAt: now(),
    repository: input.repoRoot,
    changedPaths: plan.changedPaths,
    plan,
    checks,
    status: "failed",
    failedCheck: null,
    repairAttempt,
    nextAction: "repair-and-rerun",
  };

  while (true) {
    failedCheck = undefined;
    checks.length = 0;
    for (const command of plan.commands) {
      const result = await runner(command);
      checks.push(result);
      if (result.status === "failed") {
        failedCheck = result;
        break;
      }
    }
    if (!failedCheck || !input.repair || repairAttempt >= maxRepairAttempts) break;
    repairAttempt += 1;
    state = {
      ...state,
      checks: [...checks],
      finishedAt: now(),
      failedCheck: failedCheck.name,
      repairAttempt,
      nextAction: "repair-and-rerun",
    };
    writeState(input.repoRoot, state);
    await input.repair({failure: failedCheck, state});
  }

  state = {
    ...state,
    finishedAt: now(),
    checks: [...checks],
    status: failedCheck ? "failed" : "passed",
    failedCheck: failedCheck?.name ?? null,
    repairAttempt,
    nextAction: failedCheck ? "repair-and-rerun" : "none",
  };
  writeState(input.repoRoot, state);
  return state;
};

export const changedPathsFromGit = (repoRoot: string, output: string): string[] =>
  dedupe(
    output
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizePath),
  );

export const verificationStatePath = (repoRoot: string): string => statePath(repoRoot);
