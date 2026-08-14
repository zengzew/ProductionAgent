import {z} from "zod";
import {artifactRefSchema} from "./artifact";
import {artifactLocatorSchema, issueCategorySchema} from "./critic-output";

export const productionStageNames = [
  "materialize:story",
  "validate:content",
  "capture",
  "tts",
  "timeline",
  "render:smoke",
  "render:vertical",
  "inspect:output",
  "validate:delivery",
] as const;

export const productionStageSchema = z.enum(productionStageNames);

export const productionRepairTargets = ["captions", "timeline", "tts", "render"] as const;

export const DEFAULT_PRODUCTION_REPAIR_ROUNDS = 2 as const;

export const productionRepairTargetSchema = z.enum(productionRepairTargets);

const productionIssueSeveritySchema = z.enum(["low", "medium", "high", "blocker"]);

const productionIssueStatusSchema = z.enum(["open", "resolved", "escalated"]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "sha256 must be lowercase hex");

export const productionStageFailureSchema = z
  .object({
    code: z.string().min(1),
    retryable: z.boolean(),
    detail: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "production stage failure detail must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

export const productionStageDecisionSchema = z
  .object({
    code: z.string().min(1),
    summary: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "production stage decision summary must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

const productionIssueBaseSchema = z
  .object({
    issueId: z.string().min(1),
    category: issueCategorySchema,
    severity: productionIssueSeveritySchema,
    status: productionIssueStatusSchema,
    ownerAgent: z.literal("production-executor"),
    routeTarget: productionRepairTargetSchema,
    restartAt: productionStageSchema,
    affectedArtifact: artifactRefSchema,
    locator: artifactLocatorSchema,
    summary: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "production issue summary must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

const validateProductionIssue = <T extends z.infer<typeof productionIssueBaseSchema>>(
  value: T,
  context: z.RefinementCtx,
): void => {
  if (!value.category.startsWith("delivery.")) {
    context.addIssue({
      code: "custom",
      path: ["category"],
      message: "production issues must use a delivery category",
    });
  }
  const expectedRestartAt =
    value.routeTarget === "captions" || value.routeTarget === "timeline"
      ? "timeline"
      : value.routeTarget === "tts"
        ? "tts"
        : "render:smoke";
  if (value.restartAt !== expectedRestartAt) {
    context.addIssue({
      code: "custom",
      path: ["restartAt"],
      message: `production issue restartAt must be ${expectedRestartAt} for ${value.routeTarget}`,
    });
  }
};

export const productionIssueDraftSchema =
  productionIssueBaseSchema.superRefine(validateProductionIssue);

export const productionIssueSchema = productionIssueBaseSchema
  .extend({issueRef: artifactRefSchema})
  .superRefine((value, context) => {
    validateProductionIssue(value, context);
    if (value.issueRef.episodeId !== value.affectedArtifact.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["issueRef", "episodeId"],
        message: "production issue reference belongs to another episode",
      });
    }
  });

export const productionRepairRouteSchema = z
  .object({
    ownerAgent: z.literal("production-executor"),
    routeTarget: productionRepairTargetSchema,
    restartAt: productionStageSchema,
    reasonCode: issueCategorySchema,
    issueIds: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedRestartAt =
      value.routeTarget === "captions" || value.routeTarget === "timeline"
        ? "timeline"
        : value.routeTarget === "tts"
          ? "tts"
          : "render:smoke";
    if (value.restartAt !== expectedRestartAt) {
      context.addIssue({
        code: "custom",
        path: ["restartAt"],
        message: `production repair restartAt must be ${expectedRestartAt} for ${value.routeTarget}`,
      });
    }
    if (!value.reasonCode.startsWith("delivery.")) {
      context.addIssue({
        code: "custom",
        path: ["reasonCode"],
        message: "production repair routes must use a delivery category",
      });
    }
  });

export const productionRepairStateSchema = z
  .object({
    status: z.enum([
      "idle",
      "repairing",
      "unfreeze-review",
      "unfreeze-approved",
      "unfreeze-complete",
      "human-escalation",
      "production-ready",
    ]),
    round: z.number().int().nonnegative(),
    maxRounds: z.number().int().nonnegative(),
    route: productionRepairRouteSchema.nullable(),
    forceRerunStage: productionStageSchema.nullable(),
    issueIds: z.array(z.string().min(1)),
    authorizedArtifactIds: z.array(z.string().min(1)),
    staleArtifactIds: z.array(z.string().min(1)),
    decision: productionStageDecisionSchema,
  })
  .strict();

export const productionStageCheckpointSchema = z
  .object({
    stage: productionStageSchema,
    status: z.enum(["SUCCEEDED", "SKIPPED", "FAILED"]),
    attempt: z.number().int().positive(),
    inputSetHash: sha256Schema,
    outputArtifacts: z.array(artifactRefSchema),
    issues: z.array(productionIssueSchema).default([]),
    decision: productionStageDecisionSchema,
    failure: productionStageFailureSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "FAILED" && !value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "FAILED production stages require failure details",
      });
    }
    if (value.status !== "FAILED" && value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "failure details are only valid for FAILED production stages",
      });
    }
    if (value.status === "FAILED" && value.outputArtifacts.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts"],
        message: "FAILED production stages cannot expose partial output artifacts",
      });
    }
    if (value.status !== "FAILED" && value.outputArtifacts.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts"],
        message: "successful production stages require output artifacts",
      });
    }
    if (value.status !== "FAILED" && value.issues.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "only a failed delivery stage may expose production issues",
      });
    }
    if (
      value.status === "FAILED" &&
      value.stage !== "validate:delivery" &&
      value.issues.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "production issues may only be emitted by delivery evaluation",
      });
    }
  });

export const productionStageRequestSchema = z
  .object({
    contractVersion: z.literal("production-stage-v1"),
    executionId: z.string().min(1),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    stage: productionStageSchema,
    attempt: z.number().int().positive(),
    revisionRound: z.number().int().nonnegative(),
    approvalEpoch: z.number().int().nonnegative().optional(),
    contentManifestRef: artifactRefSchema,
    inputArtifacts: z.array(artifactRefSchema),
    previousArtifacts: z.array(artifactRefSchema),
    authorizedArtifactIds: z.array(z.string().min(1)).optional(),
    forceRerun: z.boolean().optional(),
    cached: productionStageCheckpointSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contentManifestRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["contentManifestRef", "episodeId"],
        message: "content manifest belongs to another episode",
      });
    }
    for (const [index, artifact] of value.inputArtifacts.entries()) {
      if (artifact.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["inputArtifacts", index, "episodeId"],
          message: "input artifact belongs to another episode",
        });
      }
    }
    for (const [index, artifact] of value.previousArtifacts.entries()) {
      if (artifact.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["previousArtifacts", index, "episodeId"],
          message: "previous artifact belongs to another episode",
        });
      }
    }
    if (value.cached && value.cached.stage !== value.stage) {
      context.addIssue({
        code: "custom",
        path: ["cached", "stage"],
        message: "cached stage does not match request stage",
      });
    }
  });

export const productionStageResultSchema = z
  .object({
    contractVersion: z.literal("production-stage-result-v1"),
    executionId: z.string().min(1),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    stage: productionStageSchema,
    status: z.enum(["SUCCEEDED", "SKIPPED", "FAILED"]),
    attempt: z.number().int().positive(),
    inputSetHash: sha256Schema,
    inputArtifacts: z.array(artifactRefSchema),
    outputArtifacts: z.array(artifactRefSchema),
    issues: z.array(productionIssueSchema).default([]),
    decision: productionStageDecisionSchema,
    failure: productionStageFailureSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, artifact] of value.inputArtifacts.entries()) {
      if (artifact.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["inputArtifacts", index, "episodeId"],
          message: "input artifact belongs to another episode",
        });
      }
    }
    for (const [index, artifact] of value.outputArtifacts.entries()) {
      if (artifact.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["outputArtifacts", index, "episodeId"],
          message: "output artifact belongs to another episode",
        });
      }
    }
    if (value.status === "FAILED" && !value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "FAILED production results require failure details",
      });
    }
    if (value.status !== "FAILED" && value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "failure details are only valid for non-failed production results",
      });
    }
    if (value.status === "FAILED" && value.outputArtifacts.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts"],
        message: "FAILED production results cannot expose partial output artifacts",
      });
    }
    if (value.status !== "FAILED" && value.outputArtifacts.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts"],
        message: "successful production results require output artifacts",
      });
    }
    if (value.status !== "FAILED" && value.issues.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "only a failed delivery stage may expose production issues",
      });
    }
    if (
      value.status === "FAILED" &&
      value.stage !== "validate:delivery" &&
      value.issues.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "production issues may only be emitted by delivery evaluation",
      });
    }
    if (value.stage === "validate:delivery" && value.status === "SUCCEEDED") {
      const deliveryReceipt = value.outputArtifacts.some((artifact) =>
        artifact.artifactId.endsWith(":production:receipt-validate-delivery"),
      );
      if (!deliveryReceipt) {
        context.addIssue({
          code: "custom",
          path: ["outputArtifacts"],
          message: "validated delivery must publish a delivery stage receipt",
        });
      }
    }
  });

export const productionStageReceiptSchema = z
  .object({
    schemaVersion: z.literal("production-stage-receipt-v1"),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    stage: productionStageSchema,
    inputSetHash: sha256Schema,
    status: z.literal("passed"),
    command: z.string().min(1),
    outputPaths: z.array(z.string().min(1)),
  })
  .strict();

export type ProductionStageName = z.infer<typeof productionStageSchema>;
export type ProductionStageFailure = z.infer<typeof productionStageFailureSchema>;
export type ProductionStageDecision = z.infer<typeof productionStageDecisionSchema>;
export type ProductionIssueDraft = z.infer<typeof productionIssueDraftSchema>;
export type ProductionIssue = z.infer<typeof productionIssueSchema>;
export type ProductionRepairRoute = z.infer<typeof productionRepairRouteSchema>;
export type ProductionRepairState = z.infer<typeof productionRepairStateSchema>;
export type ProductionStageCheckpoint = z.infer<typeof productionStageCheckpointSchema>;
export type ProductionStageRequest = z.infer<typeof productionStageRequestSchema>;
export type ProductionStageResult = z.infer<typeof productionStageResultSchema>;
export type ProductionStageReceipt = z.infer<typeof productionStageReceiptSchema>;
