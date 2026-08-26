import type {AgentRunner} from "../run-agent";
import {createCodexCapabilityAdapter, type CodexCapabilityAdapterOptions} from "./codex-capability";
import {createHostedAgentAdapter, type HostedAgentAdapterOptions} from "./hosted-agent";
import {createManualFileAdapter, type ManualFileAdapterOptions} from "./manual-file";
import {
  createRoleModelRolloutAdapter,
  type RoleModelRolloutAdapterOptions,
} from "./role-model-rollout";

export type ContentAgentAdapterOptions =
  | ({mode?: "manual-file"} & ManualFileAdapterOptions)
  | ({mode: "codex-capability"} & CodexCapabilityAdapterOptions)
  | ({mode: "hosted-agent"} & HostedAgentAdapterOptions)
  | ({mode: "role-rollout"} & RoleModelRolloutAdapterOptions);

/** Manual file handoffs remain the default when no mode is selected. */
export const createContentAgentAdapter = (options: ContentAgentAdapterOptions): AgentRunner => {
  if (options.mode === "codex-capability") return createCodexCapabilityAdapter(options);
  if (options.mode === "hosted-agent") return createHostedAgentAdapter(options);
  if (options.mode === "role-rollout") return createRoleModelRolloutAdapter(options);
  return createManualFileAdapter(options);
};

export * from "./hosted-agent";
export * from "./codex-capability";
export * from "./manual-file";
export * from "./role-model-rollout";
export * from "./deterministic-tool";
export * from "./visual-director";
export * from "./content-loop";
export * from "../providers/hosted-chat";
