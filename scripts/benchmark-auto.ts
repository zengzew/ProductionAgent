import path from "node:path";
import type {AgentName} from "../src/orchestration/schemas/agent";
import {runAutonomousRoleBenchmark} from "../src/orchestration/agents/benchmark/auto/loop";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseAutoArgs = (argv: string[]): {episodeId: string; role: string; models: string} => {
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

const args = parseAutoArgs(process.argv);
if (!/^episode-[a-z0-9-]+$/u.test(args.episodeId)) {
  throw new Error(`Invalid episode id: ${args.episodeId}`);
}

const {summary, journalPath, summaryPath, reviewPath} = await runAutonomousRoleBenchmark({
  repoRoot,
  episodeId: args.episodeId,
  role: args.role as AgentName,
  modelSet: args.models,
});

console.log(
  [
    `auto benchmark ${summary.status}: ${summary.runId}`,
    `episode=${summary.episodeId}`,
    `role=${summary.role}`,
    `rounds=${String(summary.rounds)}`,
    `repairs=${String(summary.repairsApplied)}`,
    `apiCalls=${String(summary.apiCalls)}`,
    `eligible=${summary.diagnoses.length === 0 ? "see review" : "(see diagnoses)"}`,
    `automaticPromotion=${String(summary.automaticPromotion)}`,
    `canonicalUnchanged=${String(summary.canonicalUnchanged)}`,
    `journal=${journalPath}`,
    `summary=${summaryPath}`,
    `review=${reviewPath ?? "(none)"}`,
  ].join("\n"),
);
