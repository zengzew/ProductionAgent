import {z} from "zod";
import {ROLE_MODEL_POLICY_VERSION} from "../config/agent-model-policy";
import {agentNameSchema} from "./agent";

export const ROLE_MODEL_AUTO_CONTRACT_VERSION = "role-model-auto-v1" as const;

export const autoRepairFailureClasses = [
  "preflight-missing-input",
  "preflight-missing-key",
  "preflight-role-not-allowed",
  "transport-markdown-only",
  "transport-malformed-json",
  "transport-timeout",
  "transport-auth",
  "adapter-incomplete-outputs",
  "adapter-undeclared-output",
  "harness-input-tampered",
  "harness-canonical-tampered",
  "artifact-contract-missing-segments",
  "artifact-contract-missing-fields",
  "editorial-unsupported-claim",
  "editorial-hard-validator",
  "factual-regression",
  "protected-path-mutation",
  "budget-exhausted",
  "unknown",
] as const;

export const autoRepairFailureClassSchema = z.enum(autoRepairFailureClasses);
export type AutoRepairFailureClass = z.infer<typeof autoRepairFailureClassSchema>;

export const autoRepairTargets = [
  "stop",
  "transport",
  "adapter",
  "cli",
  "harness",
  "artifact-output-contract",
  "candidate-output",
] as const;

export const autoRepairTargetSchema = z.enum(autoRepairTargets);
export type AutoRepairTarget = z.infer<typeof autoRepairTargetSchema>;

export const autoRunStatuses = [
  "review-ready",
  "insufficient-comparable-candidates",
  "stopped",
  "budget-exhausted",
  "preflight-failed",
  "protected-violation",
] as const;

export const autoRunStatusSchema = z.enum(autoRunStatuses);
export type AutoRunStatus = z.infer<typeof autoRunStatusSchema>;

export const autoRepairDiagnosisSchema = z
  .object({
    code: autoRepairFailureClassSchema,
    target: autoRepairTargetSchema,
    candidateId: z.string().min(1).nullable(),
    evidence: z.string().min(1),
    allowPaths: z.array(z.string().min(1)),
    denyPaths: z.array(z.string().min(1)),
    instruction: z.string().min(1),
  })
  .strict();

export type AutoRepairDiagnosis = z.infer<typeof autoRepairDiagnosisSchema>;

export const autoJournalEventSchema = z
  .object({
    schemaVersion: z.literal(ROLE_MODEL_AUTO_CONTRACT_VERSION),
    kind: z.literal("event"),
    runId: z.string().min(1),
    seq: z.number().int().nonnegative(),
    at: z.string().min(1),
    phase: z.enum([
      "preflight",
      "benchmark",
      "diagnose",
      "repair",
      "test",
      "rerun",
      "review",
      "stop",
    ]),
    message: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export type AutoJournalEvent = z.infer<typeof autoJournalEventSchema>;

export const autoRunSummarySchema = z
  .object({
    schemaVersion: z.literal(ROLE_MODEL_AUTO_CONTRACT_VERSION),
    kind: z.literal("summary"),
    runId: z.string().min(1),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    role: agentNameSchema,
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    modelSet: z.string().min(1),
    status: autoRunStatusSchema,
    rounds: z.number().int().nonnegative(),
    repairsApplied: z.number().int().nonnegative(),
    apiCalls: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    inputHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
    benchmarkId: z.string().min(1).nullable(),
    reviewPath: z.string().min(1).nullable(),
    diagnosticReviewPath: z.string().min(1).nullable(),
    automaticPromotion: z.literal(false),
    promotionRequires: z.literal("explicit-config-or-human-decision"),
    diagnoses: z.array(autoRepairDiagnosisSchema),
    protectedUnchanged: z.boolean(),
    canonicalUnchanged: z.boolean(),
    stopReason: z.string().nullable(),
  })
  .strict();

export type AutoRunSummary = z.infer<typeof autoRunSummarySchema>;
