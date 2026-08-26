import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import contractFile from "../../../../config/role-model-contracts.json";
import {agentNameSchema, agentNames, type AgentName} from "../../schemas/agent";

export const roleBenchmarkCapabilities = [
  "text",
  "search",
  "multimodal",
  "production-media",
] as const;

export const roleBenchmarkCapabilitySchema = z.enum(roleBenchmarkCapabilities);
export type RoleBenchmarkCapability = z.infer<typeof roleBenchmarkCapabilitySchema>;

export const roleBenchmarkReviewDimensions = [
  "storyProgression",
  "clarity",
  "informationDensity",
  "claimFidelity",
  "spokenVideoSuitability",
  "redundancy",
  "hookPayoffContinuity",
] as const;

export const roleBenchmarkReviewDimensionSchema = z.enum(roleBenchmarkReviewDimensions);
export type RoleBenchmarkReviewDimension = z.infer<typeof roleBenchmarkReviewDimensionSchema>;

const pathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !path.isAbsolute(value) && !value.split(/[\\/]/u).includes(".."),
    "role contract paths must stay repository-relative",
  );

const expectedOutputContractSchema = z
  .object({
    path: pathSchema,
    schemaVersion: z.string().min(1),
  })
  .strict();

const repairFairnessSchema = z
  .object({
    candidateOutputRepair: z.boolean(),
    sharedInputRepair: z.boolean(),
    maxPromotionRepairRound: z.number().int().nonnegative(),
    allowPaths: z.array(pathSchema),
    denyPaths: z.array(pathSchema),
  })
  .strict();

export const roleModelContractSchema = z
  .object({
    benchmarkMode: z.enum(["enabled", "capability-gated"]),
    capabilities: z.array(roleBenchmarkCapabilitySchema).min(1),
    promptPath: pathSchema,
    allowedFrozenInputs: z.array(pathSchema),
    upstreamGatePaths: z.array(pathSchema),
    expectedOutputs: z.array(expectedOutputContractSchema).min(1),
    evaluator: z.string().min(1),
    hardValidators: z.array(z.string().min(1)).min(1),
    promotionEligibility: z.array(z.string().min(1)).min(1),
    blindReviewDimensions: z.array(roleBenchmarkReviewDimensionSchema).min(1),
    cacheIdentityVersion: z.string().min(1),
    repairFairness: repairFairnessSchema,
  })
  .strict();

export const roleModelContractFileSchema = z
  .object({
    schemaVersion: z.literal("role-model-contracts-v1"),
    roles: z.record(agentNameSchema, roleModelContractSchema),
  })
  .strict()
  .superRefine((value, context) => {
    for (const role of agentNames) {
      if (!value.roles[role]) {
        context.addIssue({
          code: "custom",
          path: ["roles", role],
          message: `role contract missing: ${role}`,
        });
      }
    }
    for (const [role, contract] of Object.entries(value.roles)) {
      const outputPaths = new Set(contract.expectedOutputs.map((output) => output.path));
      for (const inputPath of contract.allowedFrozenInputs) {
        if (outputPaths.has(inputPath)) {
          context.addIssue({
            code: "custom",
            path: ["roles", role, "allowedFrozenInputs"],
            message: `role input/output overlap is not allowed: ${inputPath}`,
          });
        }
      }
      if (contract.benchmarkMode === "capability-gated" && contract.capabilities.includes("text")) {
        context.addIssue({
          code: "custom",
          path: ["roles", role, "capabilities"],
          message: "capability-gated text roles must declare a non-text capability",
        });
      }
    }
  });

export type RoleModelContract = z.infer<typeof roleModelContractSchema> & {role: AgentName};
export type RoleModelContractFile = z.infer<typeof roleModelContractFileSchema>;
export type RoleExpectedOutputContract = z.infer<typeof expectedOutputContractSchema>;

export const parseRoleModelContractFile = (value: unknown): RoleModelContractFile =>
  roleModelContractFileSchema.parse(value);

export const roleModelContractFile = parseRoleModelContractFile(contractFile);

export const loadRoleModelContractFile = (
  input: {repoRoot?: string; file?: unknown} = {},
): RoleModelContractFile => {
  if (input.file !== undefined) return parseRoleModelContractFile(input.file);
  if (!input.repoRoot) return roleModelContractFile;
  const filePath = path.resolve(input.repoRoot, "config/role-model-contracts.json");
  const relative = path.relative(path.resolve(input.repoRoot), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("role model contract path escapes repository");
  }
  if (!fs.existsSync(filePath)) throw new Error("hosted-agent missing role model contracts");
  return parseRoleModelContractFile(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};

export const getRoleModelContract = (
  role: AgentName,
  file: RoleModelContractFile = roleModelContractFile,
): RoleModelContract => {
  const contract = file.roles[role];
  if (!contract) throw new Error(`hosted-agent missing role benchmark contract: ${role}`);
  return {...contract, role};
};

export const resolveRoleContractPath = (episodeId: string, repositoryPath: string): string => {
  if (!/^episode-[a-z0-9-]+$/u.test(episodeId)) throw new Error(`invalid episode id: ${episodeId}`);
  return repositoryPath.replaceAll("<episodeId>", episodeId);
};

export const roleContractInputPaths = (role: AgentName, episodeId: string): string[] =>
  getRoleModelContract(role).allowedFrozenInputs.map((item) =>
    resolveRoleContractPath(episodeId, item),
  );

export const roleContractGatePaths = (role: AgentName, episodeId: string): string[] =>
  getRoleModelContract(role).upstreamGatePaths.map((item) =>
    resolveRoleContractPath(episodeId, item),
  );

export const roleContractOutputPaths = (
  role: AgentName,
  episodeId: string,
): RoleExpectedOutputContract[] =>
  getRoleModelContract(role).expectedOutputs.map((output) => ({
    ...output,
    path: resolveRoleContractPath(episodeId, output.path),
  }));

/** Stable artifact identity helpers shared by benchmark and production entrypoints. */
export const roleContractLeafId = (repositoryPath: string): string => {
  const base = repositoryPath.split("/").at(-1) ?? "artifact";
  return base.replace(/\.[a-z0-9]+$/iu, "").replace(/[^a-z0-9-]+/gu, "-");
};

export const roleContractArtifactKind = (repositoryPath: string): string => {
  if (repositoryPath.includes("/research/")) return "research";
  if (repositoryPath.includes("/production/")) return "production";
  if (repositoryPath.includes("/media/")) return "media";
  if (repositoryPath.startsWith("output/")) return "delivery";
  if (repositoryPath.startsWith("style/")) return "style";
  if (repositoryPath.startsWith("docs/")) return "contract";
  return "story";
};

export const roleContractOutputArtifactId = (
  episodeId: string,
  role: AgentName,
  repositoryPath: string,
): string =>
  role === "script-writer" && repositoryPath.endsWith("/script-draft.md")
    ? `${episodeId}:story:script-draft`
    : `${episodeId}:${roleContractArtifactKind(repositoryPath)}:${role}-${roleContractLeafId(repositoryPath)}`;

export const roleContractInputArtifactId = (episodeId: string, repositoryPath: string): string =>
  `${episodeId}:${roleContractArtifactKind(repositoryPath)}:${roleContractLeafId(repositoryPath)}`;

export const roleContractGateArtifactId = (episodeId: string, repositoryPath: string): string =>
  `${episodeId}:gate:${roleContractLeafId(repositoryPath)}`;

export const roleContractPromptPath = (
  repoRoot: string,
  role: AgentName,
  episodeId: string,
): string => {
  const episodePrompt = `content/${episodeId}/prompts/${role}.md`;
  if (fs.existsSync(path.join(repoRoot, episodePrompt))) return episodePrompt;
  return getRoleModelContract(role).promptPath;
};

export const roleContractRequiredCapabilities = (role: AgentName): RoleBenchmarkCapability[] => [
  ...getRoleModelContract(role).capabilities,
];

export const roleContractIsExecutable = (role: AgentName): boolean =>
  getRoleModelContract(role).benchmarkMode === "enabled";

export const roleContractAllowsCandidateOutputRepair = (role: AgentName): boolean =>
  getRoleModelContract(role).repairFairness.candidateOutputRepair;

export const missingCandidateCapabilities = (input: {
  role: AgentName;
  candidateCapabilities: ReadonlyMap<string, readonly RoleBenchmarkCapability[]>;
}): string[] => {
  const required = roleContractRequiredCapabilities(input.role);
  const missing: string[] = [];
  for (const [candidateId, capabilities] of input.candidateCapabilities) {
    const absent = required.filter((capability) => !capabilities.includes(capability));
    if (absent.length > 0) missing.push(`${candidateId}:${absent.join(",")}`);
  }
  return missing.sort();
};
