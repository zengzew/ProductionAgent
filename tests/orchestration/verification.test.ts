import {afterEach, describe, expect, it} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  affectedTestsFor,
  buildChangeScope,
  episodeIdsFromPaths,
  inferVerificationLayer,
} from "../../src/orchestration/affected-tests";
import {
  buildVerificationPlan,
  runVerificationWorkflow,
  type VerificationCheckResult,
} from "../../src/orchestration/verification";

const tempRoots: string[] = [];
const repoRoot = path.resolve(import.meta.dirname, "../..");

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
  it("maps a single orchestration file to its contract tests instead of the full suite", () => {
    const plan = buildVerificationPlan({
      changedPaths: ["src/orchestration/agents/benchmark/role-contract.ts"],
    });
    expect(plan.layer).toBe("contract");
    expect(plan.highRisk).toBe(true);
    expect(plan.fullSuiteRequired).toBe(false);
    expect(plan.commands.map((command) => command.name)).toEqual(["typecheck", "related-vitest"]);
    expect(plan.affectedTests).toEqual(
      expect.arrayContaining([
        "tests/orchestration/role-model-contract.test.ts",
        "tests/orchestration/role-model-benchmark.test.ts",
      ]),
    );
    expect(plan.affectedTests).not.toContain("tests/media-e2e.test.ts");
    expect(plan.commands.some((command) => command.name === "full-test")).toBe(false);
  });

  it("does not run orchestration or the full suite for episode content or docs", () => {
    const plan = buildVerificationPlan({
      changedPaths: ["content/episode-007/story/script-draft.md", "docs/README.md"],
    });
    expect(plan.layer).toBe("fast");
    expect(plan.fullSuiteRequired).toBe(false);
    expect(plan.affectedTests).toEqual([]);
    expect(plan.commands).toEqual([]);
    expect(episodeIdsFromPaths(["content/episode-007/story/script-draft.md"])).toEqual([
      "episode-007",
    ]);
    expect(episodeIdsFromPaths(["src/lib/episode/paths.ts"])).toEqual([]);
    const scope = buildChangeScope(["content/episode-007/story/script-draft.md"]);
    expect(scope.needsContractTests).toBe(false);
    expect(scope.needsTypecheck).toBe(false);
    expect(scope.episodeIds).toEqual(["episode-007"]);
  });

  it("maps a single validator change to validator tests, not concurrency/replay", () => {
    const tests = affectedTestsFor(["scripts/validate-research.ts"]);
    expect(tests).toEqual(
      expect.arrayContaining([
        "tests/research-schema.test.ts",
        "tests/validation-entrypoints.test.ts",
      ]),
    );
    expect(tests).not.toContain("tests/orchestration/concurrency.test.ts");
    expect(tests).not.toContain("tests/orchestration/replay.test.ts");
    expect(inferVerificationLayer(["scripts/validate-research.ts"])).toBe("fast");
    expect(affectedTestsFor(["scripts/validate-story-source.ts"])).toEqual([
      "tests/story-source-preflight.test.ts",
      "tests/validation-entrypoints.test.ts",
    ]);
  });

  it("requires the full suite only for tooling roots or --full", () => {
    const lockfile = buildVerificationPlan({changedPaths: ["package.json"]});
    expect(lockfile.layer).toBe("production");
    expect(lockfile.fullSuiteRequired).toBe(true);
    expect(lockfile.commands.map((command) => command.name)).toEqual(["typecheck", "full-test"]);

    const explicit = buildVerificationPlan({
      changedPaths: ["docs/README.md"],
      fullSuite: true,
    });
    expect(explicit.fullSuiteRequired).toBe(true);
  });

  it("CI runs the contract Vitest suite once, and skips it for episode-only diffs", () => {
    const ci = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("pnpm exec tsx scripts/ci-scope.ts");
    expect(ci).toContain("pnpm test:coverage");
    expect(ci).toContain("steps.scope.outputs.needs_contract_tests == 'true'");
    expect(ci).not.toMatch(/run:\s*pnpm test\s*$/mu);
    expect(ci).toContain("pnpm validate:episode -- --profile production");
  });

  it("reruns from the failed gate only after an explicit repair callback", async () => {
    const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-verification-"));
    tempRoots.push(isolatedRoot);
    let calls = 0;
    let repairs = 0;
    const state = await runVerificationWorkflow({
      repoRoot: isolatedRoot,
      changedPaths: ["src/lib/episode/paths.ts"],
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
    expect(calls).toBe(3);
    expect(fs.existsSync(path.join(isolatedRoot, ".orchestration/verification/latest.json"))).toBe(
      true,
    );
  });
});
