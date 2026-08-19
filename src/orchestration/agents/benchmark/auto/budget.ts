import type {RoleModelAutoRepairConfig} from "../../../config/role-model-auto-repair";
import type {HostedChatUsage} from "../../providers/hosted-chat";

export type AutoRepairBudgetState = {
  rounds: number;
  repairs: number;
  apiCalls: number;
  totalTokens: number;
};

export const createAutoRepairBudget = (
  config: RoleModelAutoRepairConfig,
): {
  state: AutoRepairBudgetState;
  assertCanBenchmark: () => void;
  assertCanRepair: () => void;
  assertCanCall: () => void;
  recordRound: () => void;
  recordRepair: () => void;
  recordCall: (usage?: HostedChatUsage) => void;
  exhausted: (kind: "rounds" | "repairs" | "api" | "tokens") => string;
} => {
  const state: AutoRepairBudgetState = {rounds: 0, repairs: 0, apiCalls: 0, totalTokens: 0};
  return {
    state,
    assertCanBenchmark: () => {
      if (state.rounds >= config.maxRounds) {
        throw new Error(`BUDGET_EXHAUSTED:rounds:${config.maxRounds}`);
      }
    },
    assertCanRepair: () => {
      if (state.repairs >= config.maxRepairs) {
        throw new Error(`BUDGET_EXHAUSTED:repairs:${config.maxRepairs}`);
      }
    },
    assertCanCall: () => {
      if (state.apiCalls >= config.maxApiCalls) {
        throw new Error(`BUDGET_EXHAUSTED:apiCalls:${config.maxApiCalls}`);
      }
      if (state.totalTokens >= config.maxTotalTokens) {
        throw new Error(`BUDGET_EXHAUSTED:tokens:${config.maxTotalTokens}`);
      }
    },
    recordRound: () => {
      state.rounds += 1;
    },
    recordRepair: () => {
      state.repairs += 1;
    },
    recordCall: (usage) => {
      state.apiCalls += 1;
      if (typeof usage?.totalTokens === "number") state.totalTokens += usage.totalTokens;
    },
    exhausted: (kind) => `BUDGET_EXHAUSTED:${kind}`,
  };
};
