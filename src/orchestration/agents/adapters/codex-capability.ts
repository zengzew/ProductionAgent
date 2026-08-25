import {codexCapabilityAgentNames} from "../../config/agent-model-policy";
import {codexCapabilityGates} from "../../config/codex-capability-gates";
import type {AgentRunner} from "../run-agent";
import {createManualFileAdapter, type ManualFileAdapterOptions} from "./manual-file";

export type CodexCapabilityAdapterOptions = ManualFileAdapterOptions;

/**
 * Binds files produced by an interactive Codex capability-gated run.
 * Codex performs the web/media/tool work in-session; this adapter performs no
 * model call and only accepts the declared repository outputs.
 */
export const createCodexCapabilityAdapter = (
  options: CodexCapabilityAdapterOptions,
): AgentRunner => {
  const bindFiles = createManualFileAdapter({
    ...options,
    producerFor: (agentName) => `codex:${codexCapabilityGates.executor.model}:${agentName}`,
  });
  return async (request) => {
    if (!(codexCapabilityAgentNames as readonly string[]).includes(request.agentName)) {
      throw new Error(`${request.agentName} is not a Codex capability-gated role`);
    }
    return bindFiles(request);
  };
};
