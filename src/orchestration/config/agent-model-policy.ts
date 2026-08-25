import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import policyFile from "../../../config/agent-model-policy.json";
import {reasoningConfigSchema} from "./reasoning";
import {agentNameSchema, agentNames, type AgentName} from "../schemas/agent";

export const ROLE_MODEL_POLICY_VERSION = "role-model-rollout-v1" as const;
export const roleModelModes = ["manual", "shadow", "hosted-llm"] as const;
export const roleModelModeSchema = z.enum(roleModelModes);
export const fallbackModes = ["none", "manual"] as const;
export const fallbackModeSchema = z.enum(fallbackModes);

/** Text roles that may use the hosted chat backend (shadow or hosted-llm). */
export const hostedLlmEligibleAgentNames = [
  "story-director",
  "viral-director",
  "script-writer",
  "oral-rewriter",
  "oral-judge",
  "audience-critic",
  "fact-guardian",
  "retention-critic",
] as const;

export type HostedLlmEligibleAgentName = (typeof hostedLlmEligibleAgentNames)[number];

export const hostedLlmIneligibleAgentNames = agentNames.filter(
  (name): name is Exclude<AgentName, HostedLlmEligibleAgentName> =>
    !(hostedLlmEligibleAgentNames as readonly string[]).includes(name),
);

/** Phase-1 roles that may become canonical hosted-llm. */
export const hostedLlmRolloutAgentNames = ["oral-rewriter"] as const;

/** Phase-1 roles that may run hosted models as non-canonical shadow candidates. */
export const shadowRolloutAgentNames = [
  "story-director",
  "viral-director",
  "script-writer",
  "oral-judge",
  "audience-critic",
  "fact-guardian",
  "retention-critic",
] as const;

export const codexCapabilityAgentNames = [
  "research-analyst",
  "visual-director",
  "delivery-critic",
] as const;

export type HostedLlmRolloutAgentName = (typeof hostedLlmRolloutAgentNames)[number];
export type ShadowRolloutAgentName = (typeof shadowRolloutAgentNames)[number];
export type CodexCapabilityAgentName = (typeof codexCapabilityAgentNames)[number];

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an HTTPS URL");

const httpsOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && value === parsed.origin;
    } catch {
      return false;
    }
  }, "must be an HTTPS origin");

export const roleModelPolicySchema = z
  .object({
    mode: roleModelModeSchema,
    fallbackMode: fallbackModeSchema.default("none"),
    provider: z.string().min(1),
    endpoint: httpsUrlSchema,
    model: z.string().min(1),
    reasoning: reasoningConfigSchema.default({profile: "none"}),
    temperature: z.number().min(0).max(2),
    apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
    allowedOrigins: z.array(httpsOriginSchema).min(1),
    timeoutMs: z.number().int().positive().max(300_000),
    maxRetries: z.number().int().min(0).max(5),
  })
  .strict();

export const roleModelPolicyPatchSchema = roleModelPolicySchema.partial().strict();

const rolePolicyMapSchema = z
  .object({
    "story-director": roleModelPolicySchema,
    "viral-director": roleModelPolicySchema,
    "script-writer": roleModelPolicySchema,
    "oral-rewriter": roleModelPolicySchema,
    "oral-judge": roleModelPolicySchema,
    "audience-critic": roleModelPolicySchema,
    "fact-guardian": roleModelPolicySchema,
    "retention-critic": roleModelPolicySchema,
  })
  .strict();

const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);

const episodeRoleOverrideSchema = z
  .object({
    "story-director": roleModelPolicyPatchSchema.optional(),
    "viral-director": roleModelPolicyPatchSchema.optional(),
    "script-writer": roleModelPolicyPatchSchema.optional(),
    "oral-rewriter": roleModelPolicyPatchSchema.optional(),
    "oral-judge": roleModelPolicyPatchSchema.optional(),
    "audience-critic": roleModelPolicyPatchSchema.optional(),
    "fact-guardian": roleModelPolicyPatchSchema.optional(),
    "retention-critic": roleModelPolicyPatchSchema.optional(),
  })
  .strict();

const rolloutAllowlistSchema = z
  .object({
    hostedLlm: z.array(agentNameSchema),
    shadow: z.array(agentNameSchema),
    codexCapability: z.array(agentNameSchema),
  })
  .strict();

export const agentModelPolicyFileSchema = z
  .object({
    schemaVersion: z.literal("agent-model-policy-v2"),
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    defaults: roleModelPolicySchema,
    rollout: rolloutAllowlistSchema,
    roles: rolePolicyMapSchema,
    episodeOverrides: z.record(episodeIdSchema, episodeRoleOverrideSchema).default({}),
  })
  .strict()
  .superRefine((value, context) => {
    for (const name of value.rollout.hostedLlm) {
      if (!(hostedLlmRolloutAgentNames as readonly string[]).includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["rollout", "hostedLlm"],
          message: `${name} is not in the phase-1 hosted-llm rollout`,
        });
      }
    }
    for (const name of value.rollout.shadow) {
      if (!(shadowRolloutAgentNames as readonly string[]).includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["rollout", "shadow"],
          message: `${name} is not in the phase-1 shadow rollout`,
        });
      }
    }
    for (const name of value.rollout.codexCapability) {
      if (value.rollout.hostedLlm.includes(name) || value.rollout.shadow.includes(name)) {
        context.addIssue({
          code: "custom",
          path: ["rollout", "codexCapability"],
          message: `${name} cannot be both Codex-capability and hosted rollout`,
        });
      }
    }
    if (
      [...value.rollout.codexCapability].sort().join(",") !==
      [...codexCapabilityAgentNames].sort().join(",")
    ) {
      context.addIssue({
        code: "custom",
        path: ["rollout", "codexCapability"],
        message: "codexCapability must contain exactly the capability-gated roles",
      });
    }
  });

export type RoleModelMode = z.infer<typeof roleModelModeSchema>;
export type FallbackMode = z.infer<typeof fallbackModeSchema>;
export type RoleModelPolicy = z.infer<typeof roleModelPolicySchema>;
export type RoleModelPolicyInput = z.input<typeof roleModelPolicySchema>;
export type RoleModelPolicyPatch = z.infer<typeof roleModelPolicyPatchSchema>;
export type AgentModelPolicyFile = z.infer<typeof agentModelPolicyFileSchema>;
export type RolloutAllowlist = z.infer<typeof rolloutAllowlistSchema>;

export type ResolvedRoleModelPolicy = RoleModelPolicy & {
  policyVersion: typeof ROLE_MODEL_POLICY_VERSION;
  agentName: AgentName;
  episodeId: string;
  appliedLayers: {
    defaults: true;
    role: true;
    episode: boolean;
    run: boolean;
  };
};

export const isAgentName = (value: string): value is AgentName =>
  agentNameSchema.safeParse(value).success;

export const isHostedLlmEligibleAgent = (value: string): value is HostedLlmEligibleAgentName =>
  (hostedLlmEligibleAgentNames as readonly string[]).includes(value);

export const definedPolicyPatch = (
  value: RoleModelPolicyPatch | undefined,
): RoleModelPolicyPatch => {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as RoleModelPolicyPatch;
};

export const mergeRoleModelPolicyLayers = (
  defaults: RoleModelPolicy,
  role: RoleModelPolicy,
  episode: RoleModelPolicyPatch = {},
  run: RoleModelPolicyPatch = {},
): RoleModelPolicy =>
  roleModelPolicySchema.parse({
    ...defaults,
    ...role,
    ...definedPolicyPatch(episode),
    ...definedPolicyPatch(run),
  });

export const assertModeAllowedForRole = (
  agentName: AgentName,
  mode: RoleModelMode,
  rollout: RolloutAllowlist,
): void => {
  if (mode === "manual") return;
  if ((codexCapabilityAgentNames as readonly string[]).includes(agentName)) {
    throw new Error(`${agentName} is Codex capability-gated and has no hosted model policy`);
  }
  if (mode === "hosted-llm" && !rollout.hostedLlm.includes(agentName)) {
    throw new Error(`hosted-llm is not enabled for ${agentName}`);
  }
  if (mode === "shadow" && !rollout.shadow.includes(agentName)) {
    throw new Error(`shadow is not enabled for ${agentName}`);
  }
};

const missingRoleFromUnknown = (value: unknown): AgentName | undefined => {
  if (!value || typeof value !== "object" || !("roles" in value))
    return hostedLlmEligibleAgentNames[0];
  const roles = (value as {roles?: unknown}).roles;
  if (!roles || typeof roles !== "object") return hostedLlmEligibleAgentNames[0];
  return hostedLlmEligibleAgentNames.find((name) => !(name in roles));
};

export const parseAgentModelPolicyFile = (value: unknown): AgentModelPolicyFile => {
  const missing = missingRoleFromUnknown(value);
  if (missing) {
    throw new Error(`hosted-agent missing policy: ${missing}`);
  }
  return agentModelPolicyFileSchema.parse(value);
};

export const agentModelPolicyFile = parseAgentModelPolicyFile(policyFile);

export const resolveRoleModelPolicy = (
  agentName: AgentName,
  config: AgentModelPolicyFile = agentModelPolicyFile,
): RoleModelPolicy => {
  if (!isHostedLlmEligibleAgent(agentName)) {
    throw new Error(`${agentName} is Codex capability-gated and has no hosted model policy`);
  }
  const policy = config.roles[agentName];
  if (!policy) {
    throw new Error(`hosted-agent missing policy: ${agentName}`);
  }
  return roleModelPolicySchema.parse(policy);
};

/**
 * Fixed precedence: global default → role policy → episode override → run override.
 * Episode overrides are keyed only by the requested episodeId.
 */
export const resolveEffectiveRoleModelPolicy = (input: {
  agentName: AgentName;
  episodeId: string;
  runOverride?: RoleModelPolicyPatch;
  config?: AgentModelPolicyFile;
}): ResolvedRoleModelPolicy => {
  const config = input.config ?? agentModelPolicyFile;
  if (!isHostedLlmEligibleAgent(input.agentName)) {
    throw new Error(`${input.agentName} is Codex capability-gated and has no hosted model policy`);
  }
  const role = config.roles[input.agentName];
  if (!role) {
    throw new Error(`hosted-agent missing policy: ${input.agentName}`);
  }
  const episodeOverrides = config.episodeOverrides[input.episodeId];
  const episode = definedPolicyPatch(episodeOverrides?.[input.agentName]);
  const run = definedPolicyPatch(input.runOverride);
  const policy = mergeRoleModelPolicyLayers(config.defaults, role, episode, run);
  assertModeAllowedForRole(input.agentName, policy.mode, config.rollout);
  return {
    ...policy,
    policyVersion: config.policyVersion,
    agentName: input.agentName,
    episodeId: input.episodeId,
    appliedLayers: {
      defaults: true,
      role: true,
      episode: Object.keys(episode).length > 0,
      run: Object.keys(run).length > 0,
    },
  };
};

export const loadAgentModelPolicyFile = (
  input: {repoRoot?: string; file?: unknown} = {},
): AgentModelPolicyFile => {
  if (input.file !== undefined) return parseAgentModelPolicyFile(input.file);
  if (!input.repoRoot) return agentModelPolicyFile;
  const filePath = path.resolve(input.repoRoot, "config/agent-model-policy.json");
  const relative = path.relative(path.resolve(input.repoRoot), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("hosted-agent policy path escapes repository");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error("hosted-agent missing policy file");
  }
  return parseAgentModelPolicyFile(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};

export const writeAgentModelPolicyFile = (repoRoot: string, config: AgentModelPolicyFile): void => {
  const parsed = parseAgentModelPolicyFile(config);
  const filePath = path.resolve(repoRoot, "config/agent-model-policy.json");
  const relative = path.relative(path.resolve(repoRoot), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("hosted-agent policy path escapes repository");
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};

export const readOptionalAgentModelPolicyFile = (
  repoRoot: string,
): AgentModelPolicyFile | undefined => {
  const filePath = path.resolve(repoRoot, "config/agent-model-policy.json");
  const relative = path.relative(path.resolve(repoRoot), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("hosted-agent policy path escapes repository");
  }
  if (!fs.existsSync(filePath)) return undefined;
  return parseAgentModelPolicyFile(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};
