import path from "node:path";
import {
  parseOrchestrateArgs,
  runEpisodeOrchestrator,
  type OrchestratorRunResult,
} from "../src/orchestration/production-entrypoint";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const args = parseOrchestrateArgs(process.argv.slice(2), {
  repoRoot: path.resolve(import.meta.dirname, ".."),
});

if ("help" in args) {
  console.log(
    [
      "Usage: pnpm orchestrate --episode <episode-id> [--run <run-id>] [--resume] [--approval-file <path>|--capability-result <path>]",
      "",
      "ORCHESTRATOR=manual (default) preserves the existing stage-specific manual path.",
      "ORCHESTRATOR=langgraph runs the checkpointed production entrypoint and pauses at human or external gates.",
    ].join("\n"),
  );
} else {
  const result: OrchestratorRunResult = await runEpisodeOrchestrator({
    ...args,
    env: process.env,
  });
  console.log(JSON.stringify(result, null, 2));
}
