import type {AgentRunner} from "../run-agent";
import {createHostedAgentAdapter, type HostedAgentAdapterOptions} from "./hosted-agent";
import {createHostedPolishAdapter, type HostedPolishAdapterOptions} from "./hosted-polish";
import {createManualFileAdapter, type ManualFileAdapterOptions} from "./manual-file";
import {
  createRoleModelRolloutAdapter,
  type RoleModelRolloutAdapterOptions,
} from "./role-model-rollout";

export type ContentAgentAdapterOptions =
  | ({mode?: "manual-file"} & ManualFileAdapterOptions)
  | ({mode: "hosted-polish"} & HostedPolishAdapterOptions)
  | ({mode: "hosted-agent"} & HostedAgentAdapterOptions)
  | ({mode: "role-rollout"} & RoleModelRolloutAdapterOptions);

/** Manual file handoffs remain the default when no mode is selected. */
export const createContentAgentAdapter = (options: ContentAgentAdapterOptions): AgentRunner => {
  if (options.mode === "hosted-polish") return createHostedPolishAdapter(options);
  if (options.mode === "hosted-agent") return createHostedAgentAdapter(options);
  if (options.mode === "role-rollout") return createRoleModelRolloutAdapter(options);
  return createManualFileAdapter(options);
};

export * from "./hosted-agent";
export * from "./hosted-polish";
export * from "./manual-file";
export * from "./role-model-rollout";
export * from "./deterministic-tool";
export * from "./visual-director";
export * from "../providers/hosted-chat";
