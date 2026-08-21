import {
  assertBenchmarkRoleAllowed,
  candidateCapabilities,
  loadRoleModelBenchmarkConfig,
  resolveBenchmarkCandidates,
  type RoleModelBenchmarkConfig,
} from "../../../config/role-model-benchmark";
import type {AgentName} from "../../../schemas/agent";
import {buildRoleBenchmarkRequest} from "../role-request";
import {getRoleModelContract, roleContractIsExecutable} from "../role-contract";

export type AutoPreflightResult =
  | {ok: true}
  | {
      ok: false;
      code:
        | "preflight-missing-input"
        | "preflight-missing-key"
        | "preflight-role-not-allowed"
        | "preflight-capability-not-supported";
      detail: string;
    };

export const runAutoPreflight = (input: {
  repoRoot: string;
  episodeId: string;
  role: AgentName;
  modelSet: string;
  config: RoleModelBenchmarkConfig;
  env?: NodeJS.ProcessEnv;
  skipApiKeys?: boolean;
}): AutoPreflightResult => {
  try {
    assertBenchmarkRoleAllowed(input.role, input.config);
  } catch (error) {
    return {
      ok: false,
      code: "preflight-role-not-allowed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const contract = getRoleModelContract(input.role);
  if (!roleContractIsExecutable(input.role)) {
    return {
      ok: false,
      code: "preflight-capability-not-supported",
      detail: `${input.role} requires capability: ${contract.capabilities.join(",")}`,
    };
  }

  try {
    buildRoleBenchmarkRequest({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      role: input.role,
    });
  } catch (error) {
    return {
      ok: false,
      code: "preflight-missing-input",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (!input.skipApiKeys) {
    const candidates = resolveBenchmarkCandidates(input.modelSet, input.config);
    const missingCapabilities = candidates
      .map(({id, policy}) => ({id, capabilities: candidateCapabilities(policy)}))
      .filter(
        ({capabilities}) =>
          !contract.capabilities.every((required) => capabilities.includes(required)),
      )
      .map(({id}) => id);
    if (missingCapabilities.length > 0) {
      return {
        ok: false,
        code: "preflight-capability-not-supported",
        detail: `${input.role} requires capability: ${contract.capabilities.join(",")}; candidates without it: ${missingCapabilities.join(",")}`,
      };
    }
    const env = input.env ?? process.env;
    for (const candidate of candidates) {
      if (!env[candidate.policy.apiKeyEnv]) {
        return {
          ok: false,
          code: "preflight-missing-key",
          detail: `hosted-agent missing API key: ${candidate.policy.apiKeyEnv}`,
        };
      }
    }
  }

  loadRoleModelBenchmarkConfig({file: input.config});
  return {ok: true};
};
