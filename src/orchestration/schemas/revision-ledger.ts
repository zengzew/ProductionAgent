import {z} from "zod";
import {agentOwnerSchema, criticNames} from "./critic-output";
import {artifactRefSchema, type ArtifactRef} from "./artifact";

const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "sha256 must be lowercase hex");
const nonNegativeInteger = z.number().int().nonnegative();

export const revisionDispositions = [
  "selected",
  "rejected",
  "quarantined",
  "human-required",
] as const;

export const revisionBudgetKinds = ["oral", "creative", "delivery"] as const;

export const revisionBudgetSchema = z
  .object({
    oralRoundsUsed: nonNegativeInteger,
    creativeRoundsUsed: nonNegativeInteger,
    deliveryRoundsUsed: nonNegativeInteger,
  })
  .strict();

export const revisionBudgetLimitsSchema = z
  .object({
    maxOralRounds: nonNegativeInteger,
    maxCreativeRounds: nonNegativeInteger,
    maxDeliveryRounds: nonNegativeInteger,
    maxCostUsd: z.number().nonnegative().optional(),
    maxWallclockSeconds: nonNegativeInteger.optional(),
  })
  .strict();

export const defaultRevisionBudgetLimits = revisionBudgetLimitsSchema.parse({
  maxOralRounds: 3,
  maxCreativeRounds: 3,
  maxDeliveryRounds: 3,
});

const revisionAttemptSchema = z
  .object({
    revisionId: z.string().min(1),
    executionId: z.string().min(1),
    ownerAgent: agentOwnerSchema,
    issueIds: z.array(z.string().min(1)),
    before: z.array(artifactRefSchema),
    candidate: z.array(artifactRefSchema),
    evaluations: z.array(artifactRefSchema),
    disposition: z.enum(revisionDispositions),
    regressionIds: z.array(z.string().min(1)),
    oscillationIds: z.array(z.string().min(1)),
    createdAt: z.string().datetime({offset: true}),
  })
  .strict();

export {revisionAttemptSchema};

export const revisionLedgerSchema = z
  .object({
    schemaVersion: z.literal("revision-ledger-v1"),
    episodeId: episodeIdSchema,
    approvalEpoch: nonNegativeInteger,
    baselineId: sha256Schema,
    budgets: revisionBudgetSchema,
    selected: z.record(z.string().min(1), artifactRefSchema),
    best: z.record(z.string().min(1), artifactRefSchema),
    attempts: z.array(revisionAttemptSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const refs = [
      ...Object.values(value.selected),
      ...Object.values(value.best),
      ...value.attempts.flatMap((attempt) => [
        ...attempt.before,
        ...attempt.candidate,
        ...attempt.evaluations,
      ]),
    ];
    for (const [index, ref] of refs.entries()) {
      if (ref.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["artifacts", index],
          message: "REVISION_LEDGER_EPISODE_MISMATCH",
        });
      }
    }

    const revisionIds = value.attempts.map((attempt) => attempt.revisionId);
    if (new Set(revisionIds).size !== revisionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["attempts"],
        message: "REVISION_LEDGER_DUPLICATE_REVISION_ID",
      });
    }
  });

export const humanEscalationSchema = z
  .object({
    schemaVersion: z.literal("human-escalation-v1"),
    episodeId: episodeIdSchema,
    reason: z.enum([
      "budget-exhausted",
      "oscillation",
      "unroutable",
      "constraint-conflict",
      "rights-authority-required",
    ]),
    openIssueIds: z.array(z.string().min(1)),
    selectedBestRefs: z.array(artifactRefSchema),
    rejectedCandidateRefs: z.array(artifactRefSchema),
    decisionNeeded: z.string().min(1),
    forbiddenAutomaticActions: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, ref] of [
      ...value.selectedBestRefs,
      ...value.rejectedCandidateRefs,
    ].entries()) {
      if (ref.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["refs", index],
          message: "HUMAN_ESCALATION_EPISODE_MISMATCH",
        });
      }
    }
  });

export type RevisionBudget = z.infer<typeof revisionBudgetSchema>;
export type RevisionBudgetLimits = z.infer<typeof revisionBudgetLimitsSchema>;
export type RevisionBudgetKind = (typeof revisionBudgetKinds)[number];
export type RevisionDisposition = (typeof revisionDispositions)[number];
export type RevisionAttempt = z.infer<typeof revisionAttemptSchema>;
export type RevisionLedger = z.infer<typeof revisionLedgerSchema>;
export type RevisionHumanEscalation = z.infer<typeof humanEscalationSchema>;

export type RevisionEvaluationRef = ArtifactRef;

// Keep the critic list available to callers that build a typed ledger view without
// importing the critic-output schema separately.
export const revisionCriticNames = criticNames;
