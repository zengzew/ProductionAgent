import {afterEach, describe, expect, it} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildVerificationPlan,
  runVerificationWorkflow,
  type VerificationCheckResult,
} from "../../src/orchestration/verification";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

const resultFor = (
  command: Parameters<NonNullable<Parameters<typeof runVerificationWorkflow>[0]["runCommand"]>>[0],
  status: "passed" | "failed",
): VerificationCheckResult => ({
  ...command,
  status,
  exitCode: status === "passed" ? 0 : 1,
  output: status === "passed" ? "ok" : "failure",
});

describe("repo-wide autonomous verification workflow", () => {
  it("adds the full gate for orchestration and benchmark changes", () => {
    const plan = buildVerificationPlan({
      changedPaths: ["src/orchestration/agents/benchmark/role-contract.ts"],
    });
    expect(plan.highRisk).toBe(true);
    expect(plan.fullSuiteRequired).toBe(true);
    expect(plan.commands.map((command) => command.name)).toEqual([
      "typecheck",
      "related-vitest",
      "orchestration-tests",
      "benchmark-tests",
      "review-promotion-tests",
      "full-test",
    ]);
  });

  it("reruns from the failed gate only after an explicit repair callback", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-verification-"));
    tempRoots.push(repoRoot);
    let calls = 0;
    let repairs = 0;
    const state = await runVerificationWorkflow({
      repoRoot,
      changedPaths: ["agents/story-director.md"],
      runCommand: async (command) => {
        calls += 1;
        return resultFor(command, calls === 1 ? "failed" : "passed");
      },
      maxRepairAttempts: 1,
      repair: async () => {
        repairs += 1;
      },
      now: () => "2026-08-21T00:00:00.000Z",
    });
    expect(state.status).toBe("passed");
    expect(state.failedCheck).toBeNull();
    expect(state.repairAttempt).toBe(1);
    expect(repairs).toBe(1);
    expect(calls).toBe(5);
    expect(fs.existsSync(path.join(repoRoot, ".orchestration/verification/latest.json"))).toBe(
      true,
    );
  });
});
