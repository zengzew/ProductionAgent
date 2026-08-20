import {z} from "zod";
import {
  ROLE_MODEL_POLICY_VERSION,
  fallbackModeSchema,
  roleModelModeSchema,
} from "../config/agent-model-policy";
import {reasoningProfileSchema} from "../config/reasoning";
import {agentNameSchema} from "./agent";
import {artifactRefSchema} from "./artifact";

const nullableUsageNumber = z.number().int().nonnegative().nullable();

export const roleModelExecutionRecordSchema = z
  .object({
    schemaVersion: z.literal("role-model-execution-v1"),
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    agentName: agentNameSchema,
    mode: roleModelModeSchema,
    fallbackMode: fallbackModeSchema,
    fallbackUsed: z.boolean(),
    provider: z.string().min(1),
    model: z.string().min(1),
    reasoningProfile: reasoningProfileSchema,
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    executionId: z.string().min(1),
    attempt: z.number().int().positive(),
    latencyMs: z.number().nonnegative(),
    status: z.enum(["SUCCEEDED", "FAILED"]),
    promptRef: artifactRefSchema,
    inputArtifacts: z.array(artifactRefSchema),
    outputArtifacts: z.array(artifactRefSchema),
    usage: z.object({
      inputTokens: nullableUsageNumber,
      outputTokens: nullableUsageNumber,
      totalTokens: nullableUsageNumber,
    }),
    retryCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if ("apiKey" in value) {
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "API keys must not be recorded",
      });
    }
  });

export const roleModelShadowComparisonSchema = z
  .object({
    schemaVersion: z.literal("role-model-shadow-comparison-v1"),
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    executionId: z.string().min(1),
    role: agentNameSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    manualOutputRef: artifactRefSchema.nullable(),
    shadowOutputRef: artifactRefSchema.nullable(),
    manualOutputRefs: z.array(artifactRefSchema),
    shadowOutputRefs: z.array(artifactRefSchema),
    schemaValidity: z.enum(["valid", "invalid"]),
    validatorResult: z.object({
      status: z.enum(["passed", "failed", "skipped"]),
      detail: z.string().min(1),
    }),
    criticGateResult: z.object({
      status: z.enum(["not-evaluated", "pass", "reject"]),
      detail: z.string().min(1),
    }),
    diffSummary: z.object({
      canonicalUnchanged: z.literal(true),
      byteEqual: z.boolean(),
      changedArtifactIds: z.array(z.string()),
      shadowIsSourceOfTruth: z.literal(false),
    }),
    shadowIsSourceOfTruth: z.literal(false),
  })
  .strict();

export type RoleModelExecutionRecord = z.infer<typeof roleModelExecutionRecordSchema>;
export type RoleModelShadowComparison = z.infer<typeof roleModelShadowComparisonSchema>;
