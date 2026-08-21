import {installCliErrorHandlers} from "./lib/validation";
import {buildRoleBenchmarkRequest} from "../src/orchestration/agents/benchmark/role-request";
import {runRoleModelBenchmark} from "../src/orchestration/agents/benchmark/role-model-benchmark";
import {agentNameSchema} from "../src/orchestration/schemas/agent";
import path from "node:path";

installCliErrorHandlers();

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseBenchmarkArgs = (argv: string[]): {episodeId: string; role: string; models: string} => {
  let episodeId: string | undefined;
  let role: string | undefined;
  let models: string | undefined;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = (flag: string): string => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`参数 ${flag} 缺少值`);
      index += 1;
      return value;
    };
    if (argument === "--episode") {
      if (episodeId !== undefined) throw new Error("参数 --episode 不能重复");
      episodeId = readValue("--episode");
      continue;
    }
    if (argument === "--role") {
      if (role !== undefined) throw new Error("参数 --role 不能重复");
      role = readValue("--role");
      continue;
    }
    if (argument === "--models") {
      if (models !== undefined) throw new Error("参数 --models 不能重复");
      models = readValue("--models");
      continue;
    }
    if (argument?.startsWith("--")) throw new Error(`未知参数：${argument}`);
    throw new Error(`未知位置参数：${argument ?? ""}`);
  }
  return {
    episodeId: episodeId ?? "episode-001",
    role: role ?? "script-writer",
    models: models ?? "default",
  };
};

const args = parseBenchmarkArgs(process.argv);
if (!/^episode-[a-z0-9-]+$/u.test(args.episodeId)) {
  throw new Error(`Invalid episode id: ${args.episodeId}`);
}

const role = agentNameSchema.parse(args.role);
const request = buildRoleBenchmarkRequest({
  repoRoot,
  episodeId: args.episodeId,
  role,
});
const {manifest, result} = await runRoleModelBenchmark({
  repoRoot,
  request,
  modelSet: args.models,
});

console.log(
  [
    `shadow benchmark complete: ${manifest.benchmarkId}`,
    `episode=${result.episodeId}`,
    `role=${result.agentName}`,
    `candidates=${result.candidateIds.join(",")}`,
    `eligible=${result.eligibleCandidateIds.join(",") || "(none)"}`,
    `automaticPromotion=${String(result.automaticPromotion)}`,
    `canonicalUnchanged=${String(result.canonicalUnchanged)}`,
    `result=content/${result.episodeId}/rollout/benchmarks/${manifest.benchmarkId}/benchmark-result.json`,
  ].join("\n"),
);
