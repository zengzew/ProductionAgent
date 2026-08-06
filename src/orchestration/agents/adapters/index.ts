import type {AgentRunner} from "../run-agent";
import {createHostedPolishAdapter, type HostedPolishAdapterOptions} from "./hosted-polish";
import {createManualFileAdapter, type ManualFileAdapterOptions} from "./manual-file";

export type ContentAgentAdapterOptions =
  | ({mode?: "manual-file"} & ManualFileAdapterOptions)
  | ({mode: "hosted-polish"} & HostedPolishAdapterOptions);

/** Manual file handoffs remain the default when no mode is selected. */
export const createContentAgentAdapter = (options: ContentAgentAdapterOptions): AgentRunner =>
  options.mode === "hosted-polish"
    ? createHostedPolishAdapter(options)
    : createManualFileAdapter(options);

export * from "./hosted-polish";
export * from "./manual-file";
