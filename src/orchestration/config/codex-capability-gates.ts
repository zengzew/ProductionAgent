import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import configFile from "../../../config/codex-capability-gates.json";
import {codexCapabilityAgentNames, type CodexCapabilityAgentName} from "./agent-model-policy";

const repositoryPathSchema = z
  .string()
  .min(1)
  .refine((value) => !path.isAbsolute(value) && !value.split("/").includes(".."), {
    message: "must be a repository-relative path",
  });

const roleGateSchema = z
  .object({
    contract: repositoryPathSchema,
    requiredCapabilities: z.array(z.string().min(1)).min(1),
    completionValidators: z.array(z.string().startsWith("pnpm ")).min(1),
  })
  .strict();

export const codexCapabilityGatesSchema = z
  .object({
    schemaVersion: z.literal("codex-capability-gates-v1"),
    executor: z
      .object({
        kind: z.literal("codex"),
        model: z.literal("gpt-5.6"),
        interaction: z.literal("in-session-file-handoff"),
        apiKeyRequired: z.literal(false),
      })
      .strict(),
    roles: z
      .object({
        "research-analyst": roleGateSchema,
        "visual-director": roleGateSchema,
        "delivery-critic": roleGateSchema,
      })
      .strict(),
    mediaVerification: z
      .object({
        executor: z.literal("codex"),
        model: z.literal("gpt-5.6"),
        handoff: z.literal("bounded-local-files"),
        wholeSourceMediaAllowed: z.literal(false),
        requiresStructuredResult: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type CodexCapabilityGates = z.infer<typeof codexCapabilityGatesSchema>;

export const codexCapabilityGates = codexCapabilityGatesSchema.parse(configFile);

export const assertCodexCapabilityContracts = (
  repoRoot: string,
  config: CodexCapabilityGates = codexCapabilityGates,
): void => {
  for (const agentName of codexCapabilityAgentNames) {
    const contract = path.resolve(repoRoot, config.roles[agentName].contract);
    const relative = path.relative(path.resolve(repoRoot), contract);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(contract)) {
      throw new Error(`Codex capability contract missing: ${agentName}`);
    }
  }
};

export const resolveCodexCapabilityGate = (
  agentName: CodexCapabilityAgentName,
  config: CodexCapabilityGates = codexCapabilityGates,
) => config.roles[agentName];
