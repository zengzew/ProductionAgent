import {z} from "zod";
import {agentNames} from "./agent";
import {artifactRefSchema} from "./artifact";

export const criticNames = [
  "oral-judge",
  "audience-critic",
  "fact-guardian",
  "retention-critic",
  "delivery-critic",
] as const;

export const issueCategories = [
  "contract.invalid-output",
  "contract.stale-input",
  "research.evidence-gap",
  "research.source-conflict",
  "research.claim-ledger-error",
  "story.core-question",
  "story.unsupported-premise",
  "story.structure",
  "story.information-progression",
  "story.ending-payoff",
  "attention.hook",
  "attention.curiosity-gap",
  "attention.reveal-order",
  "attention.emotional-tension",
  "script.information-selection",
  "script.claim-binding",
  "script.fact-accuracy",
  "script.repetition",
  "oral.naturalness",
  "oral.spoken-delivery",
  "oral.information-fidelity",
  "visual.evidence",
  "visual.asset-rights",
  "visual.readability",
  "visual.pacing",
  "visual.safe-area",
  "retention.first-3-seconds",
  "retention.first-30-seconds",
  "retention.mid-video",
  "retention.ending",
  "delivery.caption-split",
  "delivery.caption-timing",
  "delivery.audio",
  "delivery.timeline",
  "delivery.duration-audio",
  "delivery.duration-timeline",
  "delivery.duration-render",
  "delivery.format",
  "delivery.render",
  "delivery.evidence-readability",
  "delivery.asset-manifest",
] as const;

export const agentOwners = [...agentNames, "production-executor"] as const;
export const routeTargets = [
  ...agentOwners,
  "human-editor",
  "captions",
  "timeline",
  "tts",
  "render",
] as const;

export const issueCategorySchema = z.enum(issueCategories);
export const agentOwnerSchema = z.enum(agentOwners);
export const routeTargetSchema = z.enum(routeTargets);

const locatorSchema = z.object({
  kind: z.enum([
    "json-pointer",
    "line-range",
    "segment",
    "claim",
    "time-range",
    "srt-cue",
    "whole-artifact",
  ]),
  value: z.string().min(1),
});

export const criticIssueSchema = z
  .object({
    id: z.string().regex(/^issue-[a-z0-9-]+-r[0-9]+-[0-9]{2}$/u),
    category: issueCategorySchema,
    severity: z.enum(["info", "low", "medium", "high", "blocker"]),
    status: z.enum(["open", "resolved", "waived"]),
    ownerAgent: agentOwnerSchema,
    routeTarget: routeTargetSchema,
    affectedArtifact: z.object({
      artifactId: z.string().min(1),
      path: artifactRefSchema.shape.path,
      sha256: artifactRefSchema.shape.sha256,
      locator: locatorSchema,
    }),
    evidence: z
      .array(
        z.object({
          kind: z.enum([
            "artifact-observation",
            "cross-artifact-diff",
            "claim-check",
            "metric",
            "playback-observation",
          ]),
          artifactRef: artifactRefSchema.optional(),
          locator: z.string().min(1).optional(),
          observed: z.string().min(1),
          expected: z.string().min(1),
          claimIds: z.array(z.string()),
        }),
      )
      .min(1),
    suggestedCorrection: z.object({
      objective: z.string().min(1),
      acceptanceChecks: z.array(z.string().min(1)).min(1),
    }),
    constraintsNotToBreak: z
      .array(
        z.object({
          id: z.string().min(1),
          description: z.string().min(1),
          artifactRefs: z.array(artifactRefSchema),
          claimIds: z.array(z.string()),
        }),
      )
      .min(1),
    sourceIssueId: z.string().min(1).optional(),
  })
  .strict();

export const evaluationDimensionSchema = z.object({
  id: z.string().min(1),
  score: z.number().nonnegative(),
  maxScore: z.number().positive(),
  weight: z.number().positive().max(1),
  evidenceIssueIds: z.array(z.string().min(1)),
});

export const evaluationResultSchema = z.object({
  dimensions: z.array(evaluationDimensionSchema).min(1),
  rawTotal: z.number().nonnegative(),
  normalizedTotal: z.number().min(0).max(100),
  threshold: z.number().min(0).max(100),
  dimensionFloors: z.record(z.string(), z.number().nonnegative()),
  passedThresholds: z.boolean(),
});

export const routeSchema = z
  .object({
    ownerAgent: agentOwnerSchema,
    routeTarget: routeTargetSchema,
    restartAt: z.string().min(1),
    reasonCode: issueCategorySchema,
    issueIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const criticResultSchema = z
  .object({
    schemaVersion: z.literal("critic-output-v1"),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    executionId: z.string().min(1),
    critic: z.enum(criticNames),
    round: z.number().int().positive(),
    rubricVersion: z.string().min(1),
    reviewedArtifacts: z.array(artifactRefSchema).min(1),
    evaluation: evaluationResultSchema,
    issues: z.array(criticIssueSchema),
    blockers: z.array(z.string()).refine((values) => new Set(values).size === values.length, {
      message: "blocker IDs must be unique",
    }),
    verdict: z.enum(["PASS", "REJECT"]),
    primaryRoute: routeSchema.nullable(),
    returnTo: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, context) => {
    const reviewedHashes = new Set(value.reviewedArtifacts.map((artifact) => artifact.sha256));
    const issueIds = new Set(value.issues.map((issue) => issue.id));
    for (const [index, issue] of value.issues.entries()) {
      if (
        issue.category !== "contract.invalid-output" &&
        !reviewedHashes.has(issue.affectedArtifact.sha256)
      ) {
        context.addIssue({
          code: "custom",
          path: ["issues", index, "affectedArtifact", "sha256"],
          message: "ISSUE_ARTIFACT_NOT_REVIEWED",
        });
      }
    }
    for (const blocker of value.blockers) {
      if (!issueIds.has(blocker)) {
        context.addIssue({
          code: "custom",
          path: ["blockers"],
          message: "BLOCKER_ISSUE_NOT_FOUND",
        });
      }
    }
  });

export type CriticName = z.infer<typeof criticResultSchema.shape.critic>;
export type CriticIssue = z.infer<typeof criticIssueSchema>;
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
export type CriticResult = z.infer<typeof criticResultSchema>;
