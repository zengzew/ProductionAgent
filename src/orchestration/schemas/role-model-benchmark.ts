import {z} from "zod";
import {ROLE_MODEL_POLICY_VERSION} from "../config/agent-model-policy";
import {MODEL_BENCHMARK_CONTRACT_VERSION} from "../config/role-model-benchmark";
import {agentNameSchema, expectedOutputSchema} from "./agent";
import {artifactRefSchema} from "./artifact";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);
const nullableUsageNumber = z.number().int().nonnegative().nullable();

export const benchmarkUsageSchema = z
  .object({
    inputTokens: nullableUsageNumber,
    outputTokens: nullableUsageNumber,
    totalTokens: nullableUsageNumber,
  })
  .strict();

export const benchmarkPassFailSchema = z.enum(["PASS", "FAIL"]);

export const benchmarkCandidateOutcomes = ["PASS", "PASS_AFTER_REPAIR", "FAIL"] as const;
export const benchmarkCandidateOutcomeSchema = z.enum(benchmarkCandidateOutcomes);

export const benchmarkInputManifestSchema = z
  .object({
    schemaVersion: z.literal(MODEL_BENCHMARK_CONTRACT_VERSION),
    kind: z.literal("input"),
    benchmarkId: z.string().min(1),
    inputHash: sha256Schema,
    episodeId: episodeIdSchema,
    agentName: agentNameSchema,
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    revisionRound: z.number().int().nonnegative(),
    promptRef: artifactRefSchema,
    inputArtifacts: z.array(artifactRefSchema),
    upstreamGateRefs: z.array(artifactRefSchema),
    expectedOutputs: z.array(expectedOutputSchema),
    canonicalOutputRefs: z.array(artifactRefSchema),
  })
  .strict();

export const benchmarkHumanReviewSchema = z
  .object({
    notes: z.string().nullable(),
    preferredCandidateId: z.string().min(1).nullable(),
    decisionId: z.string().min(1).nullable(),
  })
  .strict();

export const benchmarkDownstreamCriticSchema = z
  .object({
    status: z.enum(["not-evaluated", "pass", "reject"]),
    score: z.number().nullable(),
    verdict: z.enum(["PASS", "REJECT"]).nullable(),
    blockerCount: z.number().int().nonnegative(),
    detail: z.string().min(1),
  })
  .strict();

export const benchmarkCandidateResultSchema = z
  .object({
    schemaVersion: z.literal(MODEL_BENCHMARK_CONTRACT_VERSION),
    kind: z.literal("candidate"),
    benchmarkId: z.string().min(1),
    identity: sha256Schema,
    candidateId: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    cacheHit: z.boolean(),
    status: z.enum(["SUCCEEDED", "FAILED"]),
    outcome: benchmarkCandidateOutcomeSchema,
    repairRound: z.number().int().nonnegative(),
    repairContextHash: sha256Schema,
    schemaValid: z.boolean(),
    expectedOutputsComplete: z.boolean(),
    hardValidators: z.object({
      status: benchmarkPassFailSchema,
      failures: z.array(z.string()),
    }),
    factualContract: z.object({
      status: benchmarkPassFailSchema,
      claimIds: z.array(z.string()),
      unsupportedClaimIds: z.array(z.string()),
      unsupportedClaimCount: z.number().int().nonnegative(),
      claimCoverage: z.number().min(0).max(1),
    }),
    downstreamCritic: benchmarkDownstreamCriticSchema,
    latencyMs: z.number().nonnegative(),
    attempt: z.number().int().positive(),
    retryCount: z.number().int().nonnegative(),
    usage: benchmarkUsageSchema,
    outputArtifacts: z.array(artifactRefSchema),
    outputHashes: z.array(z.object({artifactId: z.string().min(1), sha256: sha256Schema})),
    outputLength: z.number().int().nonnegative(),
    failureDetail: z.string().nullable(),
    promotionEligible: z.boolean(),
    ineligibilityReasons: z.array(z.string()),
  })
  .strict();

export const benchmarkPairwiseComparisonSchema = z
  .object({
    leftCandidateId: z.string().min(1),
    rightCandidateId: z.string().min(1),
    structuralDiff: z.object({
      byteEqual: z.boolean(),
      outputLengthDelta: z.number().int(),
      changedArtifactIds: z.array(z.string()),
    }),
    validatorFailures: z.object({
      left: z.array(z.string()),
      right: z.array(z.string()),
    }),
    claimCoverage: z.object({
      left: z.number().min(0).max(1),
      right: z.number().min(0).max(1),
    }),
    unsupportedClaimCount: z.object({
      left: z.number().int().nonnegative(),
      right: z.number().int().nonnegative(),
    }),
    outputLength: z.object({
      left: z.number().int().nonnegative(),
      right: z.number().int().nonnegative(),
    }),
    downstreamCritic: z.object({
      left: benchmarkDownstreamCriticSchema,
      right: benchmarkDownstreamCriticSchema,
    }),
    latencyMs: z.object({
      left: z.number().nonnegative(),
      right: z.number().nonnegative(),
    }),
    tokens: z.object({
      left: benchmarkUsageSchema,
      right: benchmarkUsageSchema,
    }),
  })
  .strict();

export const benchmarkResultSchema = z
  .object({
    schemaVersion: z.literal(MODEL_BENCHMARK_CONTRACT_VERSION),
    kind: z.literal("result"),
    benchmarkId: z.string().min(1),
    inputHash: sha256Schema,
    episodeId: episodeIdSchema,
    agentName: agentNameSchema,
    policyVersion: z.literal(ROLE_MODEL_POLICY_VERSION),
    candidateIds: z.array(z.string().min(1)),
    candidates: z.array(benchmarkCandidateResultSchema),
    pairwise: z.array(benchmarkPairwiseComparisonSchema),
    eligibleCandidateIds: z.array(z.string().min(1)),
    automaticPromotion: z.literal(false),
    promotionRequires: z.literal("explicit-config-or-human-decision"),
    canonicalUnchanged: z.literal(true),
    humanReview: benchmarkHumanReviewSchema,
  })
  .strict();

export type BenchmarkInputManifest = z.infer<typeof benchmarkInputManifestSchema>;
export type BenchmarkCandidateResult = z.infer<typeof benchmarkCandidateResultSchema>;
export type BenchmarkPairwiseComparison = z.infer<typeof benchmarkPairwiseComparisonSchema>;
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;
export type BenchmarkHumanReview = z.infer<typeof benchmarkHumanReviewSchema>;
export type BenchmarkDownstreamCritic = z.infer<typeof benchmarkDownstreamCriticSchema>;
