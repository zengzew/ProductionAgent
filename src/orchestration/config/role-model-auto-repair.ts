import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import autoRepairFile from "../../../config/role-model-auto-repair.json";
import {ROLE_MODEL_POLICY_VERSION} from "./agent-model-policy";

export const roleModelAutoRepairConfigSchema = z
  .object({
    schemaVersion: z.literal("role-model-auto-repair-v1"),
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    maxRounds: z.number().int().positive().max(8),
    maxRepairs: z.number().int().nonnegative().max(16),
    maxApiCalls: z.number().int().positive().max(64),
    maxTotalTokens: z.number().int().positive().max(5_000_000),
  })
  .strict();

export type RoleModelAutoRepairConfig = z.infer<typeof roleModelAutoRepairConfigSchema>;

export const roleModelAutoRepairConfig = roleModelAutoRepairConfigSchema.parse(autoRepairFile);

export const parseRoleModelAutoRepairConfig = (value: unknown): RoleModelAutoRepairConfig =>
  roleModelAutoRepairConfigSchema.parse(value);

export const loadRoleModelAutoRepairConfig = (
  input: {repoRoot?: string; file?: unknown} = {},
): RoleModelAutoRepairConfig => {
  if (input.file !== undefined) return parseRoleModelAutoRepairConfig(input.file);
  if (!input.repoRoot) return roleModelAutoRepairConfig;
  const filePath = path.resolve(input.repoRoot, "config/role-model-auto-repair.json");
  const relative = path.relative(path.resolve(input.repoRoot), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("auto-repair config path escapes repository");
  }
  if (!fs.existsSync(filePath)) return roleModelAutoRepairConfig;
  return parseRoleModelAutoRepairConfig(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};
