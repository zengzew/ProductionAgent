import path from "node:path";
import {applyRoleModelPromotion} from "../src/orchestration/agents/benchmark/role-model-promote";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const repoRoot = path.resolve(import.meta.dirname, "..");

const parseArgs = (argv: string[]): {decisionPath: string; apply: boolean} => {
  let decisionPath: string | undefined;
  let apply = false;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--decision") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("参数 --decision 缺少值");
      decisionPath = value;
      index += 1;
      continue;
    }
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument?.startsWith("--")) throw new Error(`未知参数：${argument}`);
    throw new Error(`未知位置参数：${argument ?? ""}`);
  }
  if (!decisionPath) throw new Error("需要 --decision <decision-artifact>");
  return {decisionPath, apply};
};

const args = parseArgs(process.argv);
const result = applyRoleModelPromotion({
  repoRoot,
  decisionPath: args.decisionPath,
  apply: args.apply,
});

console.log(
  [
    `applied=${String(result.applied)}`,
    `reason=${result.reason}`,
    `decision=${result.decision.decision}`,
    `role=${result.decision.role}`,
    `modeAfter=${result.policyAfter.roles[result.decision.role].mode}`,
    `modelAfter=${result.policyAfter.roles[result.decision.role].model}`,
  ].join("\n"),
);
