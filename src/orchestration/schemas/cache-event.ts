import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "sha256 must be lowercase hex");

export const cacheEventSchema = z
  .object({
    schemaVersion: z.literal("cache-event-v1"),
    eventId: sha256Schema,
    eventType: z.enum(["cache.lookup", "cache.hit", "cache.miss", "cache.invalidation"]),
    occurredAt: z.string().datetime({offset: true}),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    runId: z.string().min(1).optional(),
    traceId: z.string().min(1),
    executionId: z.string().min(1),
    attempt: z.number().int().positive().optional(),
    revisionRound: z.number().int().nonnegative().optional(),
    approvalEpoch: z.number().int().nonnegative().optional(),
    stage: z.string().min(1),
    logicalItem: z.string().min(1),
    cacheKey: sha256Schema,
    hit: z.boolean().nullable(),
    reason: z.string().min(1).max(500),
    usage: z
      .object({
        availability: z.literal("not-applicable"),
        inputTokens: z.literal(0),
        outputTokens: z.literal(0),
        cacheReadTokens: z.literal(0),
        cacheWriteTokens: z.literal(0),
        totalTokens: z.literal(0),
      })
      .strict(),
    cost: z
      .object({
        amount: z.string().regex(/^\d+(?:\.\d+)?$/u),
        currency: z.literal("USD"),
        pricingVersion: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type CacheEvent = z.infer<typeof cacheEventSchema>;
