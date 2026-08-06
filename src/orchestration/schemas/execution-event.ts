import {z} from "zod";
import {agentNameSchema} from "./agent";
import {artifactRefSchema} from "./artifact";

const nullableUsageNumber = z.number().int().nonnegative().nullable();

export const executionEventSchema = z.object({
  schemaVersion: z.literal("agent-execution-event-v1"),
  eventId: z.string().min(1),
  eventType: z.enum([
    "execution.started",
    "model.completed",
    "artifact.validated",
    "evaluation.completed",
    "route.decided",
    "checkpoint.committed",
    "execution.completed",
    "execution.failed",
    "execution.recovered",
  ]),
  occurredAt: z.string().datetime({offset: true}),
  episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
  traceId: z.string().min(1),
  executionId: z.string().min(1),
  parentExecutionId: z.string().min(1).nullable(),
  agentName: z.union([agentNameSchema, z.literal("orchestrator")]),
  executionKind: z.enum(["model", "deterministic-tool", "human-decision"]),
  attempt: z.number().int().positive(),
  revisionRound: z.number().int().nonnegative(),
  approvalEpoch: z.number().int().nonnegative(),
  model: z
    .object({
      provider: z.string().min(1),
      model: z.string().min(1),
      version: z.string().min(1),
      deployment: z.string().nullable(),
      configurationHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .nullable(),
  prompt: z
    .object({
      promptId: z.string().min(1),
      promptVersion: z.string().min(1),
      path: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
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
  status: z.enum(["STARTED", "SUCCEEDED", "REJECTED", "FAILED", "RECOVERED"]),
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
      invalidOutputHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/u)
        .nullable(),
    })
    .nullable(),
  checkpoint: z
    .object({
      checkpointId: z.string().min(1),
      artifactIndexSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      workflowSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      revisionLedgerSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .nullable(),
  environment: z.object({
    repositoryCommit: z.string().nullable(),
    worktreeState: z.enum(["clean", "dirty", "unknown"]),
    inputSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    runtime: z.string().min(1),
    runnerVersion: z.string().min(1),
  }),
});

export type ExecutionEvent = z.infer<typeof executionEventSchema>;
