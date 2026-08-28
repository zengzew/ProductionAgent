import {withControlledOrchestrationRun, type ConcurrencyConfig} from "./concurrency";
import type {RuntimeIdentity} from "./identity";

export type OrchestratorMode = "manual" | "langgraph";

export const selectOrchestrator = (value = process.env.ORCHESTRATOR): OrchestratorMode =>
  value === "langgraph" ? "langgraph" : "manual";

export const runSelectedOrchestrator = async <T>(input: {
  value?: string;
  manual: () => T | Promise<T>;
  langgraph: () => T | Promise<T>;
  repoRoot?: string;
  identity?: RuntimeIdentity;
  concurrency?: ConcurrencyConfig;
}): Promise<{mode: OrchestratorMode; result: T}> => {
  const mode = selectOrchestrator(input.value);
  const run = () => input[mode]();
  const result =
    input.repoRoot && input.identity
      ? await withControlledOrchestrationRun({
          repoRoot: input.repoRoot,
          identity: input.identity,
          config: input.concurrency,
          run,
        })
      : await run();
  return {
    mode,
    result,
  };
};

export const runControlledOrchestrator = <T>(input: {
  repoRoot: string;
  identity: RuntimeIdentity;
  concurrency?: ConcurrencyConfig;
  manual: () => T | Promise<T>;
  langgraph: () => T | Promise<T>;
  value?: string;
}): Promise<{mode: OrchestratorMode; result: T}> => runSelectedOrchestrator(input);
