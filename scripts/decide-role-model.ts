import path from "node:path";
import {recordRoleModelPromotionDecision} from "../src/orchestration/agents/benchmark/role-model-review";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseArgs = (
  argv: string[],
): {
  episodeId: string;
  benchmarkId: string;
  decision: "promote" | "reject-all" | "rerun";
  candidate: string | undefined;
  reviewer: string;
  reason: string;
} => {
  let episodeId: string | undefined;
  let benchmarkId: string | undefined;
  let decision: "promote" | "reject-all" | "rerun" | undefined;
  let candidate: string | undefined;
  let reviewer: string | undefined;
  let reason: string | undefined;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = (flag: string): string => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`参数 ${flag} 缺少值`);
      index += 1;
      return value;
    };
    if (argument === "--episode") {
      episodeId = readValue("--episode");
      continue;
    }
    if (argument === "--benchmark") {
      benchmarkId = readValue("--benchmark");
      continue;
    }
    if (argument === "--decision") {
      const value = readValue("--decision");
      if (value !== "promote" && value !== "reject-all" && value !== "rerun") {
        throw new Error("decision 必须是 promote | reject-all | rerun");
      }
      decision = value;
      continue;
    }
    if (argument === "--candidate") {
      candidate = readValue("--candidate");
      continue;
    }
    if (argument === "--reviewer") {
      reviewer = readValue("--reviewer");
      continue;
    }
    if (argument === "--reason") {
      reason = readValue("--reason");
      continue;
    }
    if (argument?.startsWith("--")) throw new Error(`未知参数：${argument}`);
    throw new Error(`未知位置参数：${argument ?? ""}`);
  }
  if (!episodeId || !benchmarkId || !decision || !reviewer || !reason) {
    throw new Error("需要 --episode --benchmark --decision --reviewer --reason");
  }
  return {episodeId, benchmarkId, decision, candidate, reviewer, reason};
};

const args = parseArgs(process.argv);
const {decision, decisionPath, recommendation} = recordRoleModelPromotionDecision({
  repoRoot,
  episodeId: args.episodeId,
  benchmarkId: args.benchmarkId,
  reviewer: args.reviewer,
  decision: args.decision,
  selectedCandidate: args.candidate,
  reason: args.reason,
});

console.log(
  [
    `human decision recorded: ${decisionPath}`,
    `verdict=${decision.decision}`,
    `selected=${decision.selectedCandidate ?? "(none)"}`,
    recommendation
      ? "recommendation written; policy not changed (run pnpm promote:role-model --apply)"
      : "no policy recommendation",
  ].join("\n"),
);
