import {z} from "zod";
import {agentNameSchema} from "./agent";
import {artifactRefSchema} from "./artifact";

const nullableUsageNumber = z.number().int().nonnegative().nullable();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const executionEventTypes = [
  "execution.started",
  "model.completed",
  "artifact.validated",
  "evaluation.completed",
  "route.decided",
  "checkpoint.committed",
  "execution.completed",
  "execution.skipped",
  "execution.failed",
  "execution.recovered",
  "retry.scheduled",
  "repair.started",
  "repair.completed",
  "unfreeze.requested",
  "unfreeze.approved",
  "unfreeze.rejected",
  "human-decision.recorded",
  "approval.blocked",
  "observability.degraded",
] as const;

export const executionEventTypeSchema = z.enum(executionEventTypes);
export const terminalStatusSchema = z.enum(["succeeded", "failed", "skipped"]);

/** A reference-only checkpoint envelope. It never contains state or artifact bodies. */
export const checkpointReferenceSchema = z
  .object({
    checkpointId: z.string().min(1),
    availability: z.literal("unavailable").optional(),
    artifactIndexSha256: sha256Schema.nullable(),
    workflowSha256: sha256Schema.nullable(),
    revisionLedgerSha256: sha256Schema.nullable(),
    stateSha256: sha256Schema.nullable().optional(),
  })
  .strict();

export const executionEventSchema = z.object({
  /** M1–M3 records remain readable; M4-04 records use the strict version below. */
  schemaVersion: z.enum(["agent-execution-event-v1", "observability-event-v1"]),
  eventId: z.string().min(1),
  /** Canonical M4-04 events bind the complete redacted envelope, not only execution identity. */
  eventHash: sha256Schema.optional(),
  eventType: executionEventTypeSchema,
  occurredAt: z.string().datetime({offset: true}),
  episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
  /** Required by observability-event-v1, absent only on compatibility records. */
  runId: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  traceId: z.string().min(1),
  executionId: z.string().min(1),
  parentExecutionId: z.string().min(1).nullable(),
  agentName: z.union([agentNameSchema, z.literal("orchestrator")]),
  executionKind: z.enum(["model", "deterministic-tool", "human-decision"]),
  attempt: z.number().int().positive(),
  nextAttempt: z.number().int().positive().optional(),
  revisionRound: z.number().int().nonnegative(),
  approvalEpoch: z.number().int().nonnegative(),
  decisionId: z.string().min(1).optional(),
  checkpointVersion: z.string().min(1).optional(),
  inputSetHash: sha256Schema.optional(),
  terminalStatus: terminalStatusSchema.nullable().optional(),
  model: z
    .object({
      provider: z.string().min(1),
      model: z.string().min(1),
      version: z.string().min(1),
      deployment: z.string().nullable(),
      configurationHash: sha256Schema,
    })
    .nullable(),
  prompt: z
    .object({
      promptId: z.string().min(1),
      promptVersion: z.string().min(1),
      path: z.string().min(1),
      sha256: sha256Schema,
      policyRefs: z.array(artifactRefSchema),
    })
    .nullable(),
  inputArtifacts: z.array(artifactRefSchema),
  outputArtifacts: z.array(artifactRefSchema),
  usage: z.object({
    availability: z.enum(["reported", "estimated", "unavailable", "not-applicable"]),
    inputTokens: nullableUsageNumber,
    outputTokens: nullableUsageNumber,
    reasoningTokens: nullableUsageNumber,
    cacheReadTokens: nullableUsageNumber,
    cacheWriteTokens: nullableUsageNumber,
    totalTokens: nullableUsageNumber,
    cost: z.object({
      amount: z.string().nullable(),
      currency: z.string().nullable(),
      pricingVersion: z.string().nullable(),
    }),
  }),
  timing: z.object({
    startedAt: z.string().datetime({offset: true}),
    endedAt: z.string().datetime({offset: true}).nullable(),
    durationMs: z.number().nonnegative().nullable(),
    queueMs: z.number().nonnegative().nullable(),
    providerMs: z.number().nonnegative().nullable(),
  }),
  status: z.enum(["STARTED", "SUCCEEDED", "SKIPPED", "REJECTED", "FAILED", "RECOVERED"]),
  decision: z
    .object({
      code: z.string().min(1),
      summary: z.string().refine((value) => Buffer.byteLength(value, "utf8") <= 500),
      rubricVersion: z.string().nullable(),
      score: z.number().nullable(),
      verdict: z.enum(["PASS", "REJECT"]).nullable(),
      issueIds: z.array(z.string()),
      route: z
        .object({ownerAgent: z.string(), routeTarget: z.string(), restartAt: z.string()})
        .nullable(),
      criticResultRef: artifactRefSchema.nullable(),
    })
    .nullable(),
  error: z
    .object({
      code: z.string().min(1),
      class: z.enum([
        "transient-api",
        "rate-limit",
        "authentication",
        "invalid-output",
        "stale-input",
        "tooling",
        "checkpoint",
        "unknown",
      ]),
      retryable: z.boolean(),
      message: z.string(),
      providerRequestId: z.string().nullable(),
      retryAfterMs: z.number().nonnegative().nullable(),
      invalidOutputHash: sha256Schema.nullable(),
    })
    .nullable(),
  checkpoint: checkpointReferenceSchema.nullable(),
  environment: z.object({
    repositoryCommit: z.string().nullable(),
    worktreeState: z.enum(["clean", "dirty", "unknown"]),
    inputSetHash: sha256Schema,
    runtime: z.string().min(1),
    runnerVersion: z.string().min(1),
  }),
});

export type ExecutionEvent = z.infer<typeof executionEventSchema>;

const strictCheckpointReferenceSchema = checkpointReferenceSchema.extend({
  stateSha256: sha256Schema,
});

/** Explicit absence is different from a fabricated checkpoint hash on legacy records. */
export const unavailableCheckpointReferenceSchema = z
  .object({
    checkpointId: z.literal("unavailable"),
    availability: z.literal("unavailable"),
    artifactIndexSha256: z.null(),
    workflowSha256: z.null(),
    revisionLedgerSha256: z.null(),
    stateSha256: z.null(),
  })
  .strict();

/**
 * M4-04's canonical envelope. The compatibility schema above intentionally remains permissive so
 * existing M1/M3 replay/import records do not change shape; approval gates parse through this one.
 */
export const observabilityEventSchema = executionEventSchema
  .extend({
    schemaVersion: z.literal("observability-event-v1"),
    runId: z.string().min(1),
    stage: z.string().min(1),
    checkpointVersion: z.string().min(1),
    inputSetHash: sha256Schema,
    eventHash: sha256Schema,
    terminalStatus: terminalStatusSchema.nullable(),
    checkpoint: z.union([strictCheckpointReferenceSchema, unavailableCheckpointReferenceSchema]),
  })
  .strict()
  .superRefine((event, context) => {
    const terminalType =
      event.eventType === "execution.completed"
        ? "succeeded"
        : event.eventType === "execution.failed"
          ? "failed"
          : event.eventType === "execution.skipped"
            ? "skipped"
            : event.eventType === "execution.recovered"
              ? "succeeded"
              : null;
    if (terminalType && event.terminalStatus !== terminalType) {
      context.addIssue({
        code: "custom",
        path: ["terminalStatus"],
        message: `${event.eventType} must declare terminalStatus=${terminalType}`,
      });
    }
    if (!terminalType && event.terminalStatus !== null) {
      context.addIssue({
        code: "custom",
        path: ["terminalStatus"],
        message: "non-terminal events must set terminalStatus to null",
      });
    }
    if (event.eventType === "human-decision.recorded" && !event.decisionId) {
      context.addIssue({
        code: "custom",
        path: ["decisionId"],
        message: "human-decision.recorded requires decisionId",
      });
    }
    if (event.eventType === "retry.scheduled" && event.nextAttempt === undefined) {
      context.addIssue({
        code: "custom",
        path: ["nextAttempt"],
        message: "retry.scheduled requires nextAttempt",
      });
    }
  });

export type ObservabilityEvent = z.infer<typeof observabilityEventSchema>;
