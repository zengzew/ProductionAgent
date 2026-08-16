import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {sha256Json, stableCacheJson} from "../lib/fine-grained-cache";
import {episodeIdSchema} from "../orchestration/identity";
import {redactObservabilityText, redactObservabilityValue} from "../orchestration/observability";
import {artifactRefSchema} from "../orchestration/schemas/artifact";
import {mediaObservabilityEventRepositoryPath, resolveMediaRepositoryPath} from "./paths";

/**
 * M5.03 media observability events. The log records only refs, hashes, sizes,
 * and statuses — never credentials, request bodies, or source content. Event
 * ids are hash-bound to the redacted envelope, and the append is idempotent,
 * mirroring the cache/execution event logs.
 */

export const mediaEventTypes = [
  "media.ingest.started",
  "media.ingest.completed",
  "media.ingest.failed",
  "media.normalize.started",
  "media.normalize.completed",
  "media.normalize.failed",
  "media.cache.hit",
  "media.cache.miss",
] as const;

export const mediaEventTypeSchema = z.enum(mediaEventTypes);
export type MediaEventType = z.infer<typeof mediaEventTypeSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const mediaEventSchema = z
  .object({
    schemaVersion: z.literal("media-event-v1"),
    eventId: sha256Schema,
    eventType: mediaEventTypeSchema,
    occurredAt: z.string().datetime({offset: true}),
    episodeId: episodeIdSchema,
    runId: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
    mediaId: z.string().min(1),
    mediaSourceId: z.string().min(1),
    kind: z.enum(["original", "proxy"]).optional(),
    sha256: sha256Schema.optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    mediaType: z.string().min(1).optional(),
    artifactRef: artifactRefSchema.optional(),
    cacheKey: sha256Schema.optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

export type MediaEvent = z.infer<typeof mediaEventSchema>;

export type MediaEventSink = (event: MediaEvent) => void;

export type CreateMediaEventInput = {
  eventType: MediaEventType;
  occurredAt: string;
  episodeId: string;
  runId?: string;
  traceId?: string;
  mediaId: string;
  mediaSourceId: string;
  kind?: "original" | "proxy";
  sha256?: string;
  sizeBytes?: number;
  mediaType?: string;
  artifactRef?: unknown;
  cacheKey?: string;
  reason?: string;
};

/**
 * Builds a hash-bound media event. The envelope is passed through the
 * observability redactor so free-text `reason` values cannot leak credentials
 * and identity fields cannot silently carry secret-shaped content.
 */
export const createMediaEvent = (input: CreateMediaEventInput): MediaEvent => {
  const withoutId = {
    schemaVersion: "media-event-v1" as const,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    episodeId: input.episodeId,
    ...(input.runId ? {runId: input.runId} : {}),
    ...(input.traceId ? {traceId: input.traceId} : {}),
    mediaId: input.mediaId,
    mediaSourceId: input.mediaSourceId,
    ...(input.kind ? {kind: input.kind} : {}),
    ...(input.sha256 ? {sha256: input.sha256} : {}),
    ...(input.sizeBytes !== undefined ? {sizeBytes: input.sizeBytes} : {}),
    ...(input.mediaType ? {mediaType: input.mediaType} : {}),
    ...(input.artifactRef ? {artifactRef: input.artifactRef} : {}),
    ...(input.cacheKey ? {cacheKey: input.cacheKey} : {}),
    ...(input.reason ? {reason: redactObservabilityText(input.reason)} : {}),
  };
  const redacted = redactObservabilityValue(withoutId);
  return mediaEventSchema.parse({
    ...(redacted as Record<string, unknown>),
    eventId: sha256Json(redacted),
  });
};

export const mediaEventId = (event: Omit<MediaEvent, "eventId">): string => sha256Json(event);

/** Idempotent, tamper-checked append to a media events JSONL file. */
export const appendMediaEvent = (filePath: string, rawEvent: MediaEvent): void => {
  const event = mediaEventSchema.parse(rawEvent);
  const withoutId = {...event};
  Reflect.deleteProperty(withoutId, "eventId");
  if (mediaEventId(withoutId) !== event.eventId) {
    throw new Error(`MEDIA_EVENT_TAMPERED:${event.eventId}`);
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean)) {
      const existing = mediaEventSchema.parse(JSON.parse(line) as unknown);
      if (existing.eventId !== event.eventId) continue;
      if (stableCacheJson(existing) === stableCacheJson(event)) return;
      throw new Error(`MEDIA_EVENT_DUPLICATE_CONFLICT:${event.eventId}`);
    }
  }
  fs.appendFileSync(filePath, `${stableCacheJson(event)}\n`, "utf8");
};

/**
 * Default sink for the episode media observability log. Best effort like the
 * cache event sink: telemetry must never make a valid media artifact
 * unavailable.
 */
export const createMediaEventSink = (input: {
  repoRoot: string;
  episodeId: string;
}): MediaEventSink => {
  const filePath = resolveMediaRepositoryPath(
    input.repoRoot,
    mediaObservabilityEventRepositoryPath(input.episodeId),
  );
  return (event) => {
    try {
      appendMediaEvent(filePath, event);
    } catch {
      // best effort
    }
  };
};

/** Reads the episode media event log; returns [] when no events were recorded. */
export const readMediaEvents = (repoRoot: string, episodeId: string): MediaEvent[] => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaObservabilityEventRepositoryPath(episodeId),
  );
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => mediaEventSchema.parse(JSON.parse(line) as unknown));
};
