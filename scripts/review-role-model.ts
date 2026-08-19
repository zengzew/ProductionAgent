import path from "node:path";
import {buildBlindReviewPackage} from "../src/orchestration/agents/benchmark/role-model-review";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseArgs = (argv: string[]): {episodeId: string; benchmarkId: string} => {
  let episodeId: string | undefined;
  let benchmarkId: string | undefined;
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
    if (argument === "--benchmark") {
      if (benchmarkId !== undefined) throw new Error("参数 --benchmark 不能重复");
      benchmarkId = readValue("--benchmark");
      continue;
    }
    if (argument?.startsWith("--")) throw new Error(`未知参数：${argument}`);
    throw new Error(`未知位置参数：${argument ?? ""}`);
  }
  if (!episodeId || !benchmarkId) {
    throw new Error("需要 --episode 和 --benchmark");
  }
  return {episodeId, benchmarkId};
};

const args = parseArgs(process.argv);
const {review, reviewPath} = buildBlindReviewPackage({
  repoRoot,
  episodeId: args.episodeId,
  benchmarkId: args.benchmarkId,
});

console.log(
  [
    `blind review package: ${reviewPath}`,
    `reviewId=${review.reviewId}`,
    `candidates=${review.candidates.map((candidate) => candidate.label).join(",")}`,
    "scores are empty; do not auto-fill them",
  ].join("\n"),
);
