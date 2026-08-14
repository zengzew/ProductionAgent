import {z} from "zod";
import {agentOwnerSchema, issueCategorySchema} from "./critic-output";
import {artifactIndexSchema, artifactRefSchema} from "./artifact";
import {productionRepairTargetSchema, productionStageSchema} from "./production";

const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);
const nonNegativeInteger = z.number().int().nonnegative();

const boundedString = (name: string, maxBytes = 500) =>
  z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= maxBytes, {
      message: `${name} must not exceed ${maxBytes} UTF-8 bytes`,
    });

export const unfreezeAuthorizationSchema = z
  .object({
    artifactRef: artifactRefSchema,
    owner: agentOwnerSchema,
    locator: z.object({
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
    }),
    reason: boundedString("unfreeze authorization reason"),
  })
  .strict();

export const unfreezeBlockerSchema = z
  .object({
    issueId: z.string().min(1),
    issueRef: artifactRefSchema,
    category: issueCategorySchema,
    severity: z.literal("blocker"),
    status: z.literal("open"),
    ownerAgent: z.literal("production-executor"),
    routeTarget: productionRepairTargetSchema,
    affectedArtifactId: z.string().min(1),
    affectedArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    locator: unfreezeAuthorizationSchema.shape.locator,
    summary: boundedString("unfreeze blocker summary"),
  })
  .strict();

export const unfreezeRequestSchema = z
  .object({
    schemaVersion: z.literal("unfreeze-request-v1"),
    requestId: z.string().regex(/^unfreeze-[a-z0-9-]+$/u),
    episodeId: episodeIdSchema,
    runId: z.string().min(1),
    requestedAt: z.string().datetime({offset: true}),
    requestedBy: z.literal("production-executor"),
    approvalEpoch: nonNegativeInteger,
    contentManifestRef: artifactRefSchema,
    blockerIssues: z.array(unfreezeBlockerSchema).min(1),
    authorizedEdits: z.array(unfreezeAuthorizationSchema).min(1),
    restartAt: productionStageSchema,
    unfreezeUsed: nonNegativeInteger,
    maxUnfreeze: nonNegativeInteger,
    forbiddenAutomaticActions: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contentManifestRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["contentManifestRef", "episodeId"],
        message: "unfreeze manifest belongs to another episode",
      });
    }

    const issueIds = new Set<string>();
    for (const [index, issue] of value.blockerIssues.entries()) {
      if (issue.issueRef.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["blockerIssues", index, "issueRef", "episodeId"],
          message: "unfreeze issue belongs to another episode",
        });
      }
      if (issueIds.has(issue.issueId)) {
        context.addIssue({
          code: "custom",
          path: ["blockerIssues", index, "issueId"],
          message: "unfreeze blocker IDs must be unique",
        });
      }
      issueIds.add(issue.issueId);
    }

    const artifactIds = new Set<string>();
    for (const [index, authorization] of value.authorizedEdits.entries()) {
      const ref = authorization.artifactRef;
      if (ref.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["authorizedEdits", index, "artifactRef", "episodeId"],
          message: "unfreeze artifact belongs to another episode",
        });
      }
      if (authorization.owner === "production-executor") {
        context.addIssue({
          code: "custom",
          path: ["authorizedEdits", index, "owner"],
          message: "production-executor cannot be an unfreeze content editor",
        });
      }
      if (
        !ref.path.startsWith(`content/${value.episodeId}/`) ||
        ref.path.includes("/production/")
      ) {
        context.addIssue({
          code: "custom",
          path: ["authorizedEdits", index, "artifactRef", "path"],
          message: "L4 may authorize only frozen content artifacts",
        });
      }
      if (artifactIds.has(ref.artifactId)) {
        context.addIssue({
          code: "custom",
          path: ["authorizedEdits", index, "artifactRef", "artifactId"],
          message: "unfreeze artifact IDs must be unique",
        });
      }
      artifactIds.add(ref.artifactId);
    }
  });

export const unfreezeDecisionAuthorizationSchema = z
  .object({
    artifactId: z.string().min(1),
    owner: agentOwnerSchema,
  })
  .strict();

export const unfreezeDecisionSchema = z
  .object({
    schemaVersion: z.literal("unfreeze-decision-v1"),
    decisionId: z.string().regex(/^unfreeze-decision-[a-z0-9-]+$/u),
    requestId: z.string().regex(/^unfreeze-[a-z0-9-]+$/u),
    requestRef: artifactRefSchema,
    episodeId: episodeIdSchema,
    requestedApprovalEpoch: nonNegativeInteger,
    decision: z.enum(["approve", "reject"]),
    actorId: z.string().min(1),
    decidedAt: z.string().datetime({offset: true}),
    authorizations: z.array(unfreezeDecisionAuthorizationSchema),
    reason: boundedString("unfreeze decision reason"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requestRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["requestRef", "episodeId"],
        message: "unfreeze decision request belongs to another episode",
      });
    }
    if (value.decision === "approve" && value.authorizations.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["authorizations"],
        message: "approved unfreeze decisions must authorize at least one artifact",
      });
    }
    if (value.decision === "reject" && value.authorizations.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["authorizations"],
        message: "rejected unfreeze decisions cannot authorize artifacts",
      });
    }
    const artifactIds = value.authorizations.map((authorization) => authorization.artifactId);
    if (new Set(artifactIds).size !== artifactIds.length) {
      context.addIssue({
        code: "custom",
        path: ["authorizations"],
        message: "unfreeze decision artifact IDs must be unique",
      });
    }
  });

export const unfreezeResumeSchema = z
  .object({
    requestId: z
      .string()
      .regex(/^unfreeze-[a-z0-9-]+$/u)
      .optional(),
    requestRef: artifactRefSchema.optional(),
    decision: z.enum(["approve", "reject"]),
    actorId: z.string().min(1),
    authorizations: z.array(unfreezeDecisionAuthorizationSchema).default([]),
    reason: boundedString("unfreeze resume reason"),
    decidedAt: z.string().datetime({offset: true}).optional(),
  })
  .strict();

export const unfreezeEditSchema = z
  .object({
    artifactId: z.string().min(1),
    owner: agentOwnerSchema,
    before: artifactRefSchema,
    after: artifactRefSchema,
    changedLocators: z.array(unfreezeAuthorizationSchema.shape.locator).min(1).optional(),
  })
  .strict();

export const unfreezeStateSchema = z
  .object({
    status: z.enum(["idle", "pending", "approved", "rejected", "completed", "escalated"]),
    requestRef: artifactRefSchema.nullable(),
    decisionRef: artifactRefSchema.nullable(),
    humanDecisionRef: artifactRefSchema.nullable().default(null),
    authorizedArtifactIds: z.array(z.string().min(1)),
    authorizedOwners: z.array(agentOwnerSchema),
    changedArtifactIds: z.array(z.string().min(1)),
    staleArtifactIds: z.array(z.string().min(1)),
    validatorRefs: z.array(artifactRefSchema),
    criticRefs: z.array(artifactRefSchema),
    resumeAt: productionStageSchema.nullable(),
    decision: z
      .object({
        code: z.string().min(1),
        summary: boundedString("unfreeze state decision"),
      })
      .strict(),
  })
  .strict();

export const unfreezeContentGateResultSchema = z
  .object({
    gate: z.enum(["pass", "fail"]),
    artifactIndex: artifactIndexSchema,
    selectedArtifactRefs: z.array(artifactRefSchema).min(1),
    validatorRefs: z.array(artifactRefSchema).min(1),
    criticRefs: z.array(artifactRefSchema).min(1),
    issues: z
      .array(
        z
          .object({
            id: z.string().min(1),
            severity: z.enum(["info", "low", "medium", "high", "blocker"]),
            status: z.enum(["open", "assigned", "escalated", "resolved", "waived", "wontfix"]),
          })
          .strict(),
      )
      .default([]),
    rubricVersions: z.array(z.string().min(1)).default([]),
    summary: boundedString("unfreeze content gate summary"),
  })
  .strict();

export type UnfreezeAuthorization = z.infer<typeof unfreezeAuthorizationSchema>;
export type UnfreezeBlocker = z.infer<typeof unfreezeBlockerSchema>;
export type UnfreezeRequest = z.infer<typeof unfreezeRequestSchema>;
export type UnfreezeDecisionAuthorization = z.infer<typeof unfreezeDecisionAuthorizationSchema>;
export type UnfreezeDecision = z.infer<typeof unfreezeDecisionSchema>;
export type UnfreezeResume = z.infer<typeof unfreezeResumeSchema>;
export type UnfreezeEdit = z.infer<typeof unfreezeEditSchema>;
export type UnfreezeState = z.infer<typeof unfreezeStateSchema>;
export type UnfreezeContentGateResult = z.infer<typeof unfreezeContentGateResultSchema>;
