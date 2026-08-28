import {z} from "zod";
import {artifactLocatorSchema, issueCategorySchema} from "./critic-output";
import {artifactRefSchema} from "./artifact";

export const mediaGraphStageNames = [
  "discovery",
  "retrieve",
  "verify",
  "select",
  "render-plan",
  "pre-render",
  "delivery-critic",
] as const;

export const mediaGraphStageSchema = z.enum(mediaGraphStageNames);
export type MediaGraphStageName = z.infer<typeof mediaGraphStageSchema>;

export const mediaGraphReturnToSchema = z.enum([
  "none",
  "media-discovery",
  "media-retrieve",
  "media-verify",
  "media-select",
  "media-render-plan",
  "timeline",
  "captions",
  "tts",
  "render",
  "content",
]);

export const mediaGraphIssueSummarySchema = z
  .object({
    issueId: z.string().min(1),
    category: issueCategorySchema,
    severity: z.enum(["low", "medium", "high", "blocker"]),
    owner: z.string().min(1),
    locator: artifactLocatorSchema,
    returnTo: mediaGraphReturnToSchema,
    restartAt: z.string().min(1),
    summary: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "media graph issue summary must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

export const mediaGraphStageDecisionSchema = z
  .object({
    code: z.string().min(1),
    summary: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "media graph stage decision summary must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

export const mediaGraphStageFailureSchema = z
  .object({
    code: z.string().min(1),
    retryable: z.boolean(),
    detail: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "media graph stage failure detail must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

/**
 * Reference-only media lifecycle checkpoint. Media bodies, provider prompts,
 * and observations remain in their hash-bound repository artifacts.
 */
export const mediaGraphStageCheckpointSchema = z
  .object({
    stage: mediaGraphStageSchema,
    status: z.enum(["SUCCEEDED", "SKIPPED", "FAILED"]),
    attempt: z.number().int().positive(),
    inputSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    inputArtifacts: z.array(artifactRefSchema),
    outputArtifacts: z.array(artifactRefSchema),
    issues: z.array(mediaGraphIssueSummarySchema).default([]),
    decision: mediaGraphStageDecisionSchema,
    failure: mediaGraphStageFailureSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "FAILED" && !value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "FAILED media stages require failure details",
      });
    }
    if (value.status !== "FAILED" && value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "failure details are only valid for FAILED media stages",
      });
    }
    if (value.status === "FAILED" && value.outputArtifacts.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts"],
        message: "FAILED media stages cannot expose partial output artifacts",
      });
    }
    if (value.status !== "FAILED" && value.outputArtifacts.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts"],
        message: "successful media stages require output artifacts",
      });
    }
  });

export type MediaGraphIssueSummary = z.infer<typeof mediaGraphIssueSummarySchema>;
export type MediaGraphStageCheckpoint = z.infer<typeof mediaGraphStageCheckpointSchema>;
