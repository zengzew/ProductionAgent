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
import {buildBlindReviewPackage} from "../role-model-review";
import {
  forgetCachedBenchmarkCandidate,
  hashBenchmarkIdentity,
  runRoleModelBenchmark,
  type RoleModelBenchmarkOptions,
} from "../role-model-benchmark";
import {buildScriptWriterBenchmarkRequest} from "../script-writer-request";
import {createAutoRepairBudget} from "./budget";
import {createAutoJournal, autoSummaryPath} from "./journal";
import {writeAutoRepositoryFile} from "./paths";
import {runAutoPreflight} from "./preflight";
import {assertProtectedSnapshotUnchanged, snapshotProtectedPaths} from "./protected";
import {applyAuthorizedRepair} from "./repair";
import {candidateOutputRepairAppendix, diagnoseBenchmarkResult, selectRepair} from "./taxonomy";

const defaultNow = (): string => new Date().toISOString();

const sanitizeRunId = (value: string): string =>
  value.replace(/[^a-z0-9-]+/giu, "-").replace(/^-+|-+$/gu, "") || "auto-run";

const defaultRunTests = (repoRoot: string): {ok: boolean; output: string} => {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "tests/orchestration/hosted-agent.test.ts",
      "tests/orchestration/script-writer-evaluate.test.ts",
      "tests/orchestration/role-model-benchmark.test.ts",
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
  let benchmarkId: string | null = null;
  let appendix: string | undefined;
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
      const request = buildScriptWriterBenchmarkRequest({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
        createdAt: createdAt(),
      });
      const protectedBefore = snapshotProtectedPaths({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
        expectedOutputPaths: request.expectedOutputs.map((item) => item.path),
      });

      journal.append("benchmark", `round=${budget.state.rounds}`, {
        appendix: Boolean(appendix),
      });
      const {manifest, result} = await runRoleModelBenchmark({
        repoRoot: options.repoRoot,
        request,
        modelSet,
        config: benchmarkConfig,
        env: options.env,
        provider: countingProvider,
        chat: countingChat,
        createdAt,
        now: options.now,
        sleep: options.sleep,
        onProgress: options.onProgress,
        userMessageAppendix: appendix,
      });
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
        expectedOutputPaths: request.expectedOutputs.map((item) => item.path),
      });
      assertProtectedSnapshotUnchanged(protectedBefore, protectedAfterBenchmark);

      if (lastDiagnoses.length === 0) {
        const review = buildBlindReviewPackage({
          repoRoot: options.repoRoot,
          episodeId: options.episodeId,
          benchmarkId: manifest.benchmarkId,
        });
        reviewPath = review.reviewPath;
        journal.append("review", "blind review package written", {reviewPath});
        return finish("review-ready", null);
      }

      const chosen = selectRepair(lastDiagnoses);
      if (!chosen || chosen.target === "stop") {
        try {
          const review = buildBlindReviewPackage({
            repoRoot: options.repoRoot,
            episodeId: options.episodeId,
            benchmarkId: manifest.benchmarkId,
          });
          reviewPath = review.reviewPath;
        } catch {
          reviewPath = null;
        }
        return finish("stopped", chosen?.evidence ?? "no authorized repair");
      }

      budget.assertCanRepair();
      const applied = applyAuthorizedRepair({
        repoRoot: options.repoRoot,
        episodeId: options.episodeId,
        diagnosis: chosen,
        promptPath: request.promptRef.path,
        config: benchmarkConfig,
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
      });

      try {
        const protectedAfterRepair = snapshotProtectedPaths({
          repoRoot: options.repoRoot,
          episodeId: options.episodeId,
          expectedOutputPaths: request.expectedOutputs.map((item) => item.path),
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
        journal.append("rerun", "shared prompt/input changed; all candidates reset", {
          previousInputHash: manifest.inputHash,
        });
      } else if (applied.mode === "candidate-output") {
        const outputDiagnoses = lastDiagnoses.filter((item) => item.target === "candidate-output");
        appendix = outputDiagnoses.map((item) => candidateOutputRepairAppendix(item)).join("\n\n");
        for (const item of outputDiagnoses) {
          const policy = item.candidateId
            ? benchmarkConfig.candidates[item.candidateId]
            : undefined;
          if (!policy) continue;
          forgetCachedBenchmarkCandidate(
            options.repoRoot,
            options.episodeId,
            manifest.benchmarkId,
            hashBenchmarkIdentity({
              inputHash: manifest.inputHash,
              agentName: request.agentName,
              provider: policy.provider,
              model: policy.model,
              promptVersion: `${request.promptRef.schemaVersion}:${request.promptRef.sha256}`,
            }),
          );
        }
      }

      if (applied.mode === "catalog") {
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
      return finish("budget-exhausted", message);
    }
    if (message.startsWith("PROTECTED_PATH_MUTATED:")) {
      protectedUnchanged = false;
      return finish("protected-violation", message);
    }
    return finish("stopped", message);
  }
};
