import fs from "node:fs";
import {
  assertBenchmarkRoleAllowed,
  loadRoleModelBenchmarkConfig,
  resolveBenchmarkCandidates,
  type RoleModelBenchmarkConfig,
} from "../../../config/role-model-benchmark";
import type {AgentName} from "../../../schemas/agent";
import {scriptWriterInputPaths, resolveScriptWriterPromptPath} from "../script-writer-request";
import {resolveAutoRepositoryPath} from "./paths";

export type AutoPreflightResult =
  | {ok: true}
  | {
      ok: false;
      code: "preflight-missing-input" | "preflight-missing-key" | "preflight-role-not-allowed";
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
  if (input.role !== "script-writer") {
    return {
      ok: false,
      code: "preflight-role-not-allowed",
      detail: `auto benchmark only supports script-writer, got ${input.role}`,
    };
  }

  let promptPath: string;
  try {
    promptPath = resolveScriptWriterPromptPath(input.repoRoot, input.episodeId);
  } catch (error) {
    return {
      ok: false,
      code: "preflight-missing-input",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const required = [promptPath, ...scriptWriterInputPaths(input.episodeId)];
  for (const relative of required) {
    if (!fs.existsSync(resolveAutoRepositoryPath(input.repoRoot, relative))) {
      return {ok: false, code: "preflight-missing-input", detail: `missing ${relative}`};
    }
  }

  if (!input.skipApiKeys) {
    const candidates = resolveBenchmarkCandidates(input.modelSet, input.config);
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
