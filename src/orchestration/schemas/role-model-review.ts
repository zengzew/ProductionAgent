import {z} from "zod";
import {ROLE_MODEL_POLICY_VERSION} from "../config/agent-model-policy";
import {MODEL_BENCHMARK_CONTRACT_VERSION} from "../config/role-model-benchmark";
import {agentNameSchema} from "./agent";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);
const candidateLabelSchema = z.string().regex(/^[A-Z]$/u);

export const roleModelReviewDimensions = [
  "storyProgression",
  "clarity",
  "informationDensity",
  "claimFidelity",
  "spokenVideoSuitability",
  "redundancy",
  "hookPayoffContinuity",
] as const;

export const roleModelReviewScoreSchema = z.number().int().min(1).max(5);

export const roleModelReviewScoresSchema = z
  .object({
    storyProgression: roleModelReviewScoreSchema.nullable(),
    clarity: roleModelReviewScoreSchema.nullable(),
    informationDensity: roleModelReviewScoreSchema.nullable(),
    claimFidelity: roleModelReviewScoreSchema.nullable(),
    spokenVideoSuitability: roleModelReviewScoreSchema.nullable(),
    redundancy: roleModelReviewScoreSchema.nullable(),
    hookPayoffContinuity: roleModelReviewScoreSchema.nullable(),
  })
  .strict();

export const emptyRoleModelReviewScores = (): z.infer<typeof roleModelReviewScoresSchema> => ({
  storyProgression: null,
  clarity: null,
  informationDensity: null,
  claimFidelity: null,
  spokenVideoSuitability: null,
  redundancy: null,
  hookPayoffContinuity: null,
});

export const roleModelBlindCandidateSchema = z
  .object({
    label: candidateLabelSchema,
    output: z.string(),
    schemaValid: z.boolean(),
    validatorResult: z.object({
      status: z.enum(["PASS", "FAIL"]),
      failures: z.array(z.string()),
    }),
    claimCoverage: z.number().min(0).max(1),
    unsupportedClaimCount: z.number().int().nonnegative(),
    unsupportedClaimIds: z.array(z.string()),
    outputLength: z.number().int().nonnegative(),
    scores: roleModelReviewScoresSchema,
    blockers: z.array(z.string()),
    comment: z.string(),
  })
  .strict();

export const roleModelBlindReviewPackageSchema = z
  .object({
    schemaVersion: z.literal("role-model-blind-review-v1"),
    reviewId: z.string().min(1),
    benchmarkId: z.string().min(1),
    episodeId: episodeIdSchema,
    role: agentNameSchema,
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    benchmarkContract: z.literal(MODEL_BENCHMARK_CONTRACT_VERSION),
    benchmarkResultHash: sha256Schema,
    rubric: z.object({
      scale: z.object({min: z.literal(1), max: z.literal(5)}),
      dimensions: z.array(z.enum(roleModelReviewDimensions)).min(1),
    }),
    candidates: z.array(roleModelBlindCandidateSchema).min(1),
    autoFilled: z.literal(false),
    humanScoresRequired: z.literal(true),
  })
  .strict();

export const roleModelBlindRevealSchema = z
  .object({
    schemaVersion: z.literal("role-model-blind-reveal-v1"),
    reviewId: z.string().min(1),
    benchmarkId: z.string().min(1),
    episodeId: episodeIdSchema,
    role: agentNameSchema,
    benchmarkResultHash: sha256Schema,
    mapping: z
      .array(
        z
          .object({
            label: candidateLabelSchema,
            candidateId: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const roleModelPromotionVerdicts = ["promote", "reject-all", "rerun"] as const;
export const roleModelPromotionVerdictSchema = z.enum(roleModelPromotionVerdicts);

export const roleModelPromotionDecisionSchema = z
  .object({
    schemaVersion: z.literal("role-model-promotion-decision-v1"),
    kind: z.literal("human-decision"),
    decisionId: z.string().min(1).max(160),
    benchmarkId: z.string().min(1),
    role: agentNameSchema,
    reviewer: z.string().min(1).max(200),
    decision: roleModelPromotionVerdictSchema,
    selectedCandidate: candidateLabelSchema.nullable(),
    resolvedCandidateId: z.string().min(1).nullable(),
    reason: z.string().min(1),
    benchmarkResultHash: sha256Schema,
    reviewPackageHash: sha256Schema,
    revealHash: sha256Schema,
    createdAt: z.string().datetime({offset: true}),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "promote") {
      if (!value.selectedCandidate || !value.resolvedCandidateId) {
        context.addIssue({
          code: "custom",
          path: ["selectedCandidate"],
          message: "promote decisions require a selected candidate",
        });
      }
    }
    if (value.decision !== "promote" && value.selectedCandidate !== null) {
      context.addIssue({
        code: "custom",
        path: ["selectedCandidate"],
        message: "reject-all and rerun must not select a candidate",
      });
    }
  });

export const roleModelPromotionRecommendationSchema = z
  .object({
    schemaVersion: z.literal("role-model-promotion-recommendation-v1"),
    applied: z.literal(false),
    benchmarkId: z.string().min(1),
    role: agentNameSchema,
    selectedCandidate: candidateLabelSchema,
    resolvedCandidateId: z.string().min(1),
    decisionId: z.string().min(1),
    benchmarkResultHash: sha256Schema,
    requiresExplicitApply: z.literal(true),
  })
  .strict();

export type RoleModelReviewScores = z.infer<typeof roleModelReviewScoresSchema>;
export type RoleModelBlindCandidate = z.infer<typeof roleModelBlindCandidateSchema>;
export type RoleModelBlindReviewPackage = z.infer<typeof roleModelBlindReviewPackageSchema>;
export type RoleModelBlindReveal = z.infer<typeof roleModelBlindRevealSchema>;
export type RoleModelPromotionDecision = z.infer<typeof roleModelPromotionDecisionSchema>;
export type RoleModelPromotionRecommendation = z.infer<
  typeof roleModelPromotionRecommendationSchema
>;
