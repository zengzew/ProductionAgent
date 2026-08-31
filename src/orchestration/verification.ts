import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import crypto from "node:crypto";
import {
  affectedTestsFor,
  inferVerificationLayer,
  isFullSuitePath,
  pathNeedsTypecheck,
  type VerificationLayer,
} from "./affected-tests";

export type {VerificationLayer} from "./affected-tests";
export {
  affectedTestsFor,
  buildChangeScope,
  episodeIdsFromPaths,
  inferVerificationLayer,
  isFullSuitePath,
  pathNeedsTypecheck,
} from "./affected-tests";

export type VerificationCheckName = "typecheck" | "related-vitest" | "full-test";

export type VerificationCommand = {
  name: VerificationCheckName;
  command: "pnpm";
  args: string[];
  required: boolean;
};

export type VerificationPlan = {
  changedPaths: string[];
  layer: VerificationLayer;
  highRisk: boolean;
  fullSuiteRequired: boolean;
  affectedTests: string[];
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

const dedupe = (values: readonly string[]): string[] => [...new Set(values)].sort();

export const buildVerificationPlan = (input: {
  changedPaths: readonly string[];
  fullSuite?: boolean;
}): VerificationPlan => {
  const changedPaths = dedupe(input.changedPaths.map(normalizePath));
  const layer = inferVerificationLayer(changedPaths, {fullSuite: input.fullSuite});
  const fullSuiteRequired = Boolean(
    input.fullSuite || changedPaths.some((value) => isFullSuitePath(value)),
  );
  const highRisk = layer !== "fast";
  const affectedTests = fullSuiteRequired ? [] : affectedTestsFor(changedPaths);
  const needsTypecheck =
    fullSuiteRequired || changedPaths.some((value) => pathNeedsTypecheck(value));
  const commands: VerificationCommand[] = [];
  if (needsTypecheck) {
    commands.push({name: "typecheck", command: "pnpm", args: ["typecheck"], required: true});
  }
  if (fullSuiteRequired) {
    commands.push({name: "full-test", command: "pnpm", args: ["test"], required: true});
  } else if (affectedTests.length > 0) {
    commands.push({
      name: "related-vitest",
      command: "pnpm",
      args: ["exec", "vitest", "run", ...affectedTests],
      required: true,
    });
  }
  return {changedPaths, layer, highRisk, fullSuiteRequired, affectedTests, commands};
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
