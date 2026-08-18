import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {sha256Json, stableCacheJson} from "../lib/platform/cache";
import {episodeIdSchema} from "../orchestration/identity";
import {redactObservabilityText, redactObservabilityValue} from "../orchestration/observability";
import {artifactRefSchema} from "../orchestration/schemas/artifact";
import {mediaObservabilityEventRepositoryPath, resolveMediaRepositoryPath} from "./paths";

/**
 * M5.03/M5.04 media observability events. The log records only refs, hashes,
 * sizes, stage availability, and statuses — never credentials, request
 * bodies, or source content. Event ids are hash-bound to the redacted
 * envelope, and the append is idempotent, mirroring the cache/execution event
 * logs.
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
  "media.transcript.started",
  "media.transcript.completed",
  "media.transcript.failed",
  "media.scenes.started",
  "media.scenes.completed",
  "media.scenes.failed",
  "media.keyframes.started",
  "media.keyframes.completed",
  "media.keyframes.failed",
  "media.index.started",
  "media.index.completed",
  "media.index.failed",
  "media.understanding.cache.hit",
  "media.understanding.cache.miss",
  "media.retrieval.started",
  "media.retrieval.completed",
  "media.retrieval.failed",
  "media.retrieval.cache.hit",
  "media.retrieval.cache.miss",
  "media.verification.started",
  "media.verification.completed",
  "media.verification.failed",
  "media.verification.cache.hit",
  "media.verification.cache.miss",
  "media.selection.started",
  "media.selection.completed",
  "media.selection.failed",
  "media.render.started",
  "media.render.completed",
  "media.render.failed",
  "media.rendered",
  "media.render.cache.hit",
  "media.render.cache.miss",
] as const;

export const mediaEventTypeSchema = z.enum(mediaEventTypes);
export type MediaEventType = z.infer<typeof mediaEventTypeSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

/** Availability of a media understanding stage recorded on completed/failed events. */
export const mediaEventAvailabilitySchema = z.enum(["available", "unavailable", "not-applicable"]);
export type MediaEventAvailability = z.infer<typeof mediaEventAvailabilitySchema>;

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
    availability: mediaEventAvailabilitySchema.optional(),
    /** WP-M5.05: final-script segment this retrieval query serves. */
    segmentId: z.string().min(1).optional(),
    /** WP-M5.05: Claim Ledger ids that were the primary query keys. */
    claimIds: z.array(z.string().min(1)).optional(),
    /** WP-M5.05: number of ranked candidates returned (may be < topK). */
    candidateCount: z.number().int().nonnegative().optional(),
    /** WP-M5.05: compact rank summary (rank:clipId:score list), never transcript bodies. */
    rankSummary: z.string().max(1000).optional(),
    /** WP-M5.06: candidate clip id under verification. */
    clipId: z.string().min(1).optional(),
    /** WP-M5.06: VLM verdict recorded on verification events. */
    verdict: z.enum(["pass", "reject", "uncertain"]).optional(),
    reason: z.string().max(500).optional(),
    /** WP-M5.07: selected visual type recorded on selection events. */
    selectedType: z
      .enum(["real-media", "official-screenshot", "data-evidence-card", "programmatic-visual"])
      .optional(),
    /** WP-M5.07: structured fallback reason recorded on selection events. */
    fallbackType: z
      .enum([
        "REAL_MEDIA_NOT_FOUND",
        "REAL_MEDIA_NOT_VERIFIED",
        "REAL_MEDIA_RIGHTS_BLOCKED",
        "REAL_MEDIA_LOW_EVIDENCE_FIT",
        "REAL_MEDIA_LOW_VISUAL_QUALITY",
        "REAL_MEDIA_MISLEADING_RISK",
      ])
      .optional(),
    /** WP-M5.08: media shot identity recorded on render events. */
    shotId: z.string().min(1).optional(),
    /** WP-M5.08: render proxy artifact ref recorded on render events. */
    renderProxyRef: artifactRefSchema.optional(),
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
  availability?: MediaEventAvailability;
  segmentId?: string;
  claimIds?: string[];
  candidateCount?: number;
  rankSummary?: string;
  clipId?: string;
  verdict?: "pass" | "reject" | "uncertain";
  reason?: string;
  selectedType?:
    "real-media" | "official-screenshot" | "data-evidence-card" | "programmatic-visual";
  fallbackType?:
    | "REAL_MEDIA_NOT_FOUND"
    | "REAL_MEDIA_NOT_VERIFIED"
    | "REAL_MEDIA_RIGHTS_BLOCKED"
    | "REAL_MEDIA_LOW_EVIDENCE_FIT"
    | "REAL_MEDIA_LOW_VISUAL_QUALITY"
    | "REAL_MEDIA_MISLEADING_RISK";
  shotId?: string;
  renderProxyRef?: unknown;
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
    ...(input.availability ? {availability: input.availability} : {}),
    ...(input.segmentId ? {segmentId: input.segmentId} : {}),
    ...(input.claimIds && input.claimIds.length > 0 ? {claimIds: input.claimIds} : {}),
    ...(input.candidateCount !== undefined ? {candidateCount: input.candidateCount} : {}),
    ...(input.rankSummary ? {rankSummary: redactObservabilityText(input.rankSummary)} : {}),
    ...(input.clipId ? {clipId: input.clipId} : {}),
    ...(input.verdict ? {verdict: input.verdict} : {}),
    ...(input.reason ? {reason: redactObservabilityText(input.reason)} : {}),
    ...(input.selectedType ? {selectedType: input.selectedType} : {}),
    ...(input.fallbackType ? {fallbackType: input.fallbackType} : {}),
    ...(input.shotId ? {shotId: input.shotId} : {}),
    ...(input.renderProxyRef ? {renderProxyRef: input.renderProxyRef} : {}),
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
