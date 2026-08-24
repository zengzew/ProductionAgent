import {spawnSync} from "node:child_process";
import {
  loadRoleModelAutoRepairConfig,
  type RoleModelAutoRepairConfig,
} from "../../../config/role-model-auto-repair";
import {
  loadRoleModelBenchmarkConfig,
  type RoleModelBenchmarkConfig,
} from "../../../config/role-model-benchmark";
import {ROLE_MODEL_POLICY_VERSION} from "../../../config/agent-model-policy";
import {
  ROLE_MODEL_AUTO_CONTRACT_VERSION,
  autoRunSummarySchema,
  type AutoRepairDiagnosis,
  type AutoRunStatus,
  type AutoRunSummary,
} from "../../../schemas/role-model-auto";
import type {AgentName} from "../../../schemas/agent";
import {stableJson} from "../../../stable-json";
import {
  createOpenAiCompatibleChatProvider,
  type HostedChatCall,
  type HostedChatJsonFn,
  type HostedChatProvider,
  type HostedChatUsage,
} from "../../providers/hosted-chat";
import {
  INSUFFICIENT_COMPARABLE_CANDIDATES,
  buildBlindReviewPackage,
  selectPromotionReviewCohort,
} from "../role-model-review";
import {
  mergeBenchmarkResults,
  runRoleModelBenchmark,
  writeBenchmarkAggregate,
  type RoleModelBenchmarkOptions,
} from "../role-model-benchmark";
import type {BenchmarkResult} from "../../../schemas/role-model-benchmark";
import type {RepairExecutor} from "./executor";
import {buildRoleBenchmarkRequest} from "../role-request";
import {createAutoRepairBudget} from "./budget";
import {createAutoJournal, autoSummaryPath} from "./journal";
import {writeAutoRepositoryFile} from "./paths";
import {runAutoPreflight} from "./preflight";
import {assertProtectedSnapshotUnchanged, snapshotProtectedPaths} from "./protected";
import {applyAuthorizedRepair} from "./repair";
import {candidateOutputRepairAppendix, diagnoseBenchmarkResult, selectRepair} from "./taxonomy";
import {roleContractAllowsCandidateOutputRepair} from "../role-contract";

const defaultNow = (): string => new Date().toISOString();

const sanitizeRunId = (value: string): string =>
  value.replace(/[^a-z0-9-]+/giu, "-").replace(/^-+|-+$/gu, "") || "auto-run";

const defaultRunTests = (repoRoot: string): {ok: boolean; output: string} => {
  const typecheck = spawnSync("pnpm", ["typecheck"], {cwd: repoRoot, encoding: "utf8"});
  if (typecheck.status !== 0) {
    return {
      ok: false,
      output: `${typecheck.stdout ?? ""}${typecheck.stderr ?? ""}`.slice(0, 4000),
    };
  }
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "tests/orchestration/hosted-agent.test.ts",
      "tests/orchestration/script-writer-evaluate.test.ts",
      "tests/orchestration/role-model-benchmark.test.ts",
      "tests/orchestration/role-model-auto.test.ts",
      "tests/orchestration/role-model-review.test.ts",
    ],
    {cwd: repoRoot, encoding: "utf8"},
  );
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(0, 4000),
  };
};

export type AutonomousRoleBenchmarkOptions = {
  repoRoot: string;
  episodeId: string;
  role?: AgentName;
  modelSet?: string;
  runId?: string;
  benchmarkConfig?: RoleModelBenchmarkConfig;
  autoConfig?: RoleModelAutoRepairConfig;
  env?: NodeJS.ProcessEnv;
  provider?: HostedChatProvider;
  chat?: HostedChatJsonFn;
  createdAt?: () => string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  runTests?: (
    repoRoot: string,
  ) => {ok: boolean; output: string} | Promise<{ok: boolean; output: string}>;
  onProgress?: RoleModelBenchmarkOptions["onProgress"];
  repairExecutor?: RepairExecutor;
};

export type AutonomousRoleBenchmarkResult = {
  summary: AutoRunSummary;
  journalPath: string;
  summaryPath: string;
  reviewPath: string | null;
};

const writeSummary = (repoRoot: string, summary: AutoRunSummary): string => {
  const relative = autoSummaryPath(summary.episodeId, summary.runId);
  writeAutoRepositoryFile(repoRoot, relative, `${stableJson(summary)}\n`);
  return relative;
};

export const runAutonomousRoleBenchmark = async (
  options: AutonomousRoleBenchmarkOptions,
): Promise<AutonomousRoleBenchmarkResult> => {
  const role: AgentName = options.role ?? "script-writer";
  const modelSet = options.modelSet ?? "default";
  const createdAt = options.createdAt ?? defaultNow;
  const runId = sanitizeRunId(options.runId ?? `auto-${createdAt()}`);
  const benchmarkConfig =
    options.benchmarkConfig ?? loadRoleModelBenchmarkConfig({repoRoot: options.repoRoot});
  const autoConfig =
    options.autoConfig ?? loadRoleModelAutoRepairConfig({repoRoot: options.repoRoot});
  const journal = createAutoJournal({
    repoRoot: options.repoRoot,
    episodeId: options.episodeId,
    runId,
    now: createdAt,
  });
  const budget = createAutoRepairBudget(autoConfig);
  const inputHashes: string[] = [];
  let lastDiagnoses: AutoRepairDiagnosis[] = [];
  let reviewPath: string | null = null;
  let diagnosticReviewPath: string | null = null;
  let benchmarkId: string | null = null;
  let appendix: string | undefined;
  let repairRound = 0;
  let runCandidateIds: string[] | undefined;
  let previousResult: BenchmarkResult | undefined;
  let protectedUnchanged = true;
  let canonicalUnchanged = true;
  let stopReason: string | null = null;
  let status: AutoRunStatus = "stopped";

  const finish = (next: AutoRunStatus, reason: string | null): AutonomousRoleBenchmarkResult => {
    status = next;
    stopReason = reason;
    const summary = autoRunSummarySchema.parse({
      schemaVersion: ROLE_MODEL_AUTO_CONTRACT_VERSION,
      kind: "summary",
      runId,
      episodeId: options.episodeId,
      role,
      policyVersion: ROLE_MODEL_POLICY_VERSION,
      modelSet,
      status,
      rounds: budget.state.rounds,
      repairsApplied: budget.state.repairs,
      apiCalls: budget.state.apiCalls,
      totalTokens: budget.state.totalTokens,
      inputHashes,
      benchmarkId,
      reviewPath,
      diagnosticReviewPath,
      automaticPromotion: false,
      promotionRequires: "explicit-config-or-human-decision",
      diagnoses: lastDiagnoses,
      protectedUnchanged,
      canonicalUnchanged,
      stopReason,
    });
    const summaryPath = writeSummary(options.repoRoot, summary);
    journal.append("stop", `status=${status}`, {reason, automaticPromotion: false});
    return {summary, journalPath: journal.path, summaryPath, reviewPath};
  };

  const skipApiKeys = Boolean(options.provider || options.chat);
  const preflight = runAutoPreflight({
    repoRoot: options.repoRoot,
    episodeId: options.episodeId,
    role,
    modelSet,
    config: benchmarkConfig,
    env: options.env,
    skipApiKeys,
  });
  journal.append("preflight", preflight.ok ? "ok" : preflight.detail, {
    role,
    modelSet,
    code: preflight.ok ? "ok" : preflight.code,
  });
  if (!preflight.ok) {
    lastDiagnoses = [
      {
        code: preflight.code,
        target: "stop",
        candidateId: null,
        evidence: preflight.detail,
        allowPaths: [],
        denyPaths: [],
        instruction: "Fix preflight before running auto benchmark.",
      },
    ];
    return finish("preflight-failed", preflight.detail);
  }

  const wrapUsage = (usage?: HostedChatUsage): void => budget.recordCall(usage);
  const wrapChat =
    (chat: HostedChatJsonFn): HostedChatJsonFn =>
    async (call) => {
      budget.assertCanCall();
      try {
        const result = await chat(call);
        const usage =
          result && typeof result === "object" && "usage" in result
            ? (result as {usage?: HostedChatUsage}).usage
            : undefined;
        wrapUsage(usage);
        return result;
      } catch (error) {
        wrapUsage();
        throw error;
      }
    };
  const wrapProvider = (provider: HostedChatProvider): HostedChatProvider => ({
    name: provider.name,
    chatJson: async <T>(call: HostedChatCall) => {
      budget.assertCanCall();
      try {
        const result = await provider.chatJson<T>(call);
        wrapUsage(result.usage);
        return result;
      } catch (error) {
        wrapUsage();
        throw error;
      }
    },
  });
  const countingProvider: HostedChatProvider | undefined = options.provider
    ? wrapProvider(options.provider)
    : options.chat
      ? undefined
      : wrapProvider(createOpenAiCompatibleChatProvider({sleep: options.sleep}));
  const countingChat = options.chat && !options.provider ? wrapChat(options.chat) : undefined;

  try {
    while (true) {
      budget.assertCanBenchmark();
      const request = buildRoleBenchmarkRequest({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
        role,
        createdAt: createdAt(),
      });
      const protectedBefore = snapshotProtectedPaths({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
      });

      journal.append("benchmark", `round=${budget.state.rounds}`, {
        appendix: Boolean(appendix),
        repairRound,
        candidateIds: runCandidateIds ?? null,
      });
      const executed = await runRoleModelBenchmark({
        repoRoot: options.repoRoot,
        request,
        modelSet,
        candidateIds: runCandidateIds,
        config: benchmarkConfig,
        env: options.env,
        provider: countingProvider,
        chat: countingChat,
        createdAt,
        now: options.now,
        sleep: options.sleep,
        onProgress: options.onProgress,
        userMessageAppendix: appendix,
        repairRound,
      });
      const {manifest} = executed;
      let {result} = executed;
      if (previousResult && runCandidateIds && previousResult.inputHash === manifest.inputHash) {
        result = mergeBenchmarkResults(previousResult, result, manifest);
        writeBenchmarkAggregate(options.repoRoot, options.episodeId, manifest.benchmarkId, result);
      }
      budget.recordRound();
      benchmarkId = manifest.benchmarkId;
      if (!inputHashes.includes(manifest.inputHash)) inputHashes.push(manifest.inputHash);
      canonicalUnchanged = result.canonicalUnchanged;
      lastDiagnoses = diagnoseBenchmarkResult({
        repoRoot: options.repoRoot,
        result,
        promptPath: request.promptRef.path,
      });
      journal.append("diagnose", `${lastDiagnoses.length} findings`, {
        inputHash: manifest.inputHash,
        codes: lastDiagnoses.map((item) => item.code),
      });

      const protectedAfterBenchmark = snapshotProtectedPaths({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
      });
      assertProtectedSnapshotUnchanged(protectedBefore, protectedAfterBenchmark);

      const writeDiagnosticReview = (): void => {
        try {
          const diagnostic = buildBlindReviewPackage({
            repoRoot: options.repoRoot,
            episodeId: options.episodeId,
            benchmarkId: manifest.benchmarkId,
            purpose: "diagnostic",
          });
          diagnosticReviewPath = diagnostic.reviewPath;
          journal.append("review", "diagnostic review package written", {
            diagnosticReviewPath,
          });
        } catch {
          /* no repaired candidates */
        }
      };

      if (lastDiagnoses.length === 0) {
        const promotionCohort = selectPromotionReviewCohort(result.candidates);
        if (promotionCohort.length >= 2) {
          const review = buildBlindReviewPackage({
            repoRoot: options.repoRoot,
            episodeId: options.episodeId,
            benchmarkId: manifest.benchmarkId,
            purpose: "promotion",
          });
          reviewPath = review.reviewPath;
          writeDiagnosticReview();
          journal.append("review", "promotion blind review package written", {reviewPath});
          return finish("review-ready", null);
        }
        writeDiagnosticReview();
        return finish(INSUFFICIENT_COMPARABLE_CANDIDATES, INSUFFICIENT_COMPARABLE_CANDIDATES);
      }

      const chosen = selectRepair(lastDiagnoses);
      if (!chosen || chosen.target === "stop") {
        try {
          const promotionCohort = selectPromotionReviewCohort(result.candidates);
          if (promotionCohort.length >= 2) {
            const review = buildBlindReviewPackage({
              repoRoot: options.repoRoot,
              episodeId: options.episodeId,
              benchmarkId: manifest.benchmarkId,
              purpose: "promotion",
            });
            reviewPath = review.reviewPath;
          }
        } catch {
          reviewPath = null;
        }
        writeDiagnosticReview();
        return finish("stopped", chosen?.evidence ?? "no authorized repair");
      }

      if (chosen.target === "candidate-output" && !roleContractAllowsCandidateOutputRepair(role)) {
        return finish("stopped", `role contract disallows candidate-output repair: ${role}`);
      }

      budget.assertCanRepair();
      const applied = await applyAuthorizedRepair({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
        runId,
        diagnosis: chosen,
        promptPath: request.promptRef.path,
        config: benchmarkConfig,
        executor: options.repairExecutor,
      });
      if (!applied.applied) {
        return finish("stopped", applied.detail);
      }
      budget.recordRepair();
      journal.append("repair", applied.detail, {
        code: chosen.code,
        target: chosen.target,
        mode: applied.mode,
        files: applied.files,
        sharedInputChanged: applied.sharedInputChanged,
        runtimeOverride: applied.runtimeOverride,
      });

      try {
        const protectedAfterRepair = snapshotProtectedPaths({
          repoRoot: options.repoRoot,
          episodeId: options.episodeId,
        });
        assertProtectedSnapshotUnchanged(protectedBefore, protectedAfterRepair);
      } catch (error) {
        protectedUnchanged = false;
        return finish(
          "protected-violation",
          error instanceof Error ? error.message : String(error),
        );
      }

      if (applied.sharedInputChanged) {
        appendix = undefined;
        repairRound = 0;
        runCandidateIds = undefined;
        previousResult = undefined;
        journal.append("rerun", "shared prompt/input changed; all candidates reset", {
          previousInputHash: manifest.inputHash,
        });
      } else if (applied.mode === "candidate-output") {
        const outputDiagnoses = lastDiagnoses.filter((item) => item.target === "candidate-output");
        appendix = outputDiagnoses
          .map((item) => candidateOutputRepairAppendix(item, role))
          .join("\n\n");
        repairRound += 1;
        runCandidateIds = outputDiagnoses
          .map((item) => item.candidateId)
          .filter((item): item is string => Boolean(item));
        previousResult = result;
        journal.append("rerun", "candidate-output repair uses a new repairContextHash", {
          repairRound,
          candidateIds: runCandidateIds,
        });
      }

      if (applied.mode === "catalog" || applied.mode === "executor") {
        const tests = await (options.runTests ?? defaultRunTests)(options.repoRoot);
        journal.append("test", tests.ok ? "pass" : "fail", {output: tests.output});
        if (!tests.ok) return finish("stopped", "repair tests failed");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("BUDGET_EXHAUSTED:")) {
      if (benchmarkId) {
        try {
          const review = buildBlindReviewPackage({
            repoRoot: options.repoRoot,
            episodeId: options.episodeId,
            benchmarkId,
          });
          reviewPath = review.reviewPath;
        } catch {
          reviewPath = null;
        }
      }
      if (reviewPath) return finish("review-ready", null);
      return finish("budget-exhausted", message);
    }
    if (
      message.startsWith("PROTECTED_PATH_MUTATED:") ||
      message.startsWith("EXECUTOR_TOUCHED_WORKING_TREE")
    ) {
      protectedUnchanged = false;
      return finish("protected-violation", message);
    }
    return finish("stopped", message);
  }
};
