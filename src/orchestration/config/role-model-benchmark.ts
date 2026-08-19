import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import benchmarkFile from "../../../config/role-model-benchmark.json";
import {ROLE_MODEL_POLICY_VERSION, roleModelPolicySchema} from "./agent-model-policy";
import {agentNameSchema, type AgentName} from "../schemas/agent";

export const MODEL_BENCHMARK_CONTRACT_VERSION = "model-benchmark-v1" as const;

export const benchmarkCandidatePolicySchema = roleModelPolicySchema
  .omit({mode: true, fallbackMode: true})
  .strict();

export const roleModelBenchmarkConfigSchema = z
  .object({
    schemaVersion: z.literal("model-benchmark-config-v1"),
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    allowedRoles: z.array(agentNameSchema).min(1),
    defaultModelSet: z.string().min(1),
    modelSets: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
    candidates: z.record(z.string().min(1), benchmarkCandidatePolicySchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.allowedRoles.includes("script-writer")) {
      context.addIssue({
        code: "custom",
        path: ["allowedRoles"],
        message: "phase-2 benchmark must include script-writer",
      });
    }
    if (!value.modelSets[value.defaultModelSet]) {
      context.addIssue({
        code: "custom",
        path: ["defaultModelSet"],
        message: `unknown model set: ${value.defaultModelSet}`,
      });
    }
    for (const [setName, ids] of Object.entries(value.modelSets)) {
      for (const [index, id] of ids.entries()) {
        if (!value.candidates[id]) {
          context.addIssue({
            code: "custom",
            path: ["modelSets", setName, index],
            message: `unknown candidate: ${id}`,
          });
        }
      }
    }
  });

export type BenchmarkCandidatePolicy = z.infer<typeof benchmarkCandidatePolicySchema>;
export type RoleModelBenchmarkConfig = z.infer<typeof roleModelBenchmarkConfigSchema>;

export const roleModelBenchmarkConfig = roleModelBenchmarkConfigSchema.parse(benchmarkFile);

export const parseRoleModelBenchmarkConfig = (value: unknown): RoleModelBenchmarkConfig =>
  roleModelBenchmarkConfigSchema.parse(value);

export const loadRoleModelBenchmarkConfig = (
  input: {repoRoot?: string; file?: unknown} = {},
): RoleModelBenchmarkConfig => {
  if (input.file !== undefined) return parseRoleModelBenchmarkConfig(input.file);
  if (!input.repoRoot) return roleModelBenchmarkConfig;
  const filePath = path.resolve(input.repoRoot, "config/role-model-benchmark.json");
  const relative = path.relative(path.resolve(input.repoRoot), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("benchmark config path escapes repository");
  }
  if (!fs.existsSync(filePath)) throw new Error("hosted-agent missing benchmark config");
  return parseRoleModelBenchmarkConfig(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};

export const assertBenchmarkRoleAllowed = (
  agentName: AgentName,
  config: RoleModelBenchmarkConfig = roleModelBenchmarkConfig,
): void => {
  if (!config.allowedRoles.includes(agentName)) {
    throw new Error(`benchmark is not enabled for ${agentName}`);
  }
};

export const resolveBenchmarkCandidates = (
  modelSet: string,
  config: RoleModelBenchmarkConfig = roleModelBenchmarkConfig,
): Array<{id: string; policy: BenchmarkCandidatePolicy}> => {
  const ids = config.modelSets[modelSet];
  if (!ids || ids.length === 0) {
    throw new Error(`unknown benchmark model set: ${modelSet}`);
  }
  return ids.map((id) => {
    const policy = config.candidates[id];
    if (!policy) throw new Error(`unknown benchmark candidate: ${id}`);
    return {id, policy};
  });
};

export const sanitizeBenchmarkSlug = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!slug) throw new Error(`benchmark slug is empty: ${value}`);
  return slug;
};
