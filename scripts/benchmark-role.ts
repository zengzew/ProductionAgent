import {installCliErrorHandlers} from "./lib/validation";
import {buildScriptWriterBenchmarkRequest} from "../src/orchestration/agents/benchmark/script-writer-request";
import {runRoleModelBenchmark} from "../src/orchestration/agents/benchmark/role-model-benchmark";
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
if (args.role !== "script-writer") {
  throw new Error(`phase-2 benchmark only supports script-writer, got ${args.role}`);
}
if (!/^episode-[a-z0-9-]+$/u.test(args.episodeId)) {
  throw new Error(`Invalid episode id: ${args.episodeId}`);
}

const request = buildScriptWriterBenchmarkRequest({
  repoRoot,
  episodeId: args.episodeId,
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
