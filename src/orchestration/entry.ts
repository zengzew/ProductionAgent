export type OrchestratorMode = "manual" | "langgraph";

export const selectOrchestrator = (value = process.env.ORCHESTRATOR): OrchestratorMode =>
  value === "langgraph" ? "langgraph" : "manual";

export const runSelectedOrchestrator = async <T>(input: {
  value?: string;
  manual: () => T | Promise<T>;
  langgraph: () => T | Promise<T>;
}): Promise<{mode: OrchestratorMode; result: T}> => {
  const mode = selectOrchestrator(input.value);
  return {
    mode,
    result: await input[mode](),
  };
};
