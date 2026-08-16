import {z} from "zod";
import {episodeIdSchema} from "../orchestration/identity";
import {artifactRefSchema, type ArtifactRef} from "../orchestration/schemas/artifact";
import type {MediaAsset} from "./schemas";

/**
 * WP-M5.04 provider-neutral ASR contract.
 *
 * The pipeline never fabricates speech: a transcript exists only when an ASR
 * provider returns it. When no provider is configured the transcript is
 * explicitly `unavailable`; when a provider errors the run fails closed.
 * Transcript text is treated as observed fact — the pipeline validates
 * timestamps and structure, but never rewrites the text.
 */

export const MEDIA_TRANSCRIPT_SCHEMA_VERSION = "media-transcript-v1" as const;

export const transcriptAvailabilitySchema = z.enum(["available", "unavailable"]);
export type TranscriptAvailability = z.infer<typeof transcriptAvailabilitySchema>;

/** One raw ASR output segment, exactly as the provider reported it. */
export const asrSegmentSchema = z
  .object({
    text: z.string().min(1).max(20000),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    speaker: z.string().min(1).max(200).default("unknown"),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

export type AsrSegment = z.infer<typeof asrSegmentSchema>;

export const transcriptSegmentSchema = z
  .object({
    /** Stable ordinal of the segment inside the transcript (0-based). */
    index: z.number().int().nonnegative(),
    text: z.string().min(1).max(20000),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    speaker: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "transcript segment endMs must be greater than startMs",
      });
    }
  });

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const mediaTranscriptSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_TRANSCRIPT_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    /** The original MediaAsset this transcript describes. */
    mediaId: z.string().min(1),
    /** Hash-bound ArtifactRef of the original MediaAsset (lineage root). */
    sourceMediaRef: artifactRefSchema,
    /** Hash-bound ArtifactRef of the bytes actually analyzed (proxy preferred). */
    analysisSourceRef: artifactRefSchema,
    /** Provider id; "none" when no ASR provider was configured. */
    provider: z.string().min(1),
    model: z.string().min(1).nullable(),
    /** Version of the ASR integration wrapper. */
    toolVersion: z.string().min(1),
    /** Version of the underlying ASR provider/tool. */
    asrVersion: z.string().min(1),
    availability: transcriptAvailabilitySchema,
    unavailableReason: z.string().min(1).max(500).optional(),
    durationMs: z.number().int().nonnegative().nullable(),
    segments: z.array(transcriptSegmentSchema).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.availability === "available" && value.segments.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["segments"],
        message: "an available transcript must contain at least one segment",
      });
    }
    if (value.availability === "unavailable" && !value.unavailableReason) {
      context.addIssue({
        code: "custom",
        path: ["unavailableReason"],
        message: "an unavailable transcript must record an unavailableReason",
      });
    }
  });

export type MediaTranscript = z.infer<typeof mediaTranscriptSchema>;

export type TranscriptProviderResult = {
  availability: TranscriptAvailability;
  unavailableReason?: string;
  segments?: AsrSegment[];
};

export type TranscriptContext = {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  mediaSourceId: string;
  /** The hash-valid MediaAsset whose bytes would be analyzed (proxy preferred). */
  asset: MediaAsset;
  durationMs: number | null;
};

/**
 * Provider-neutral ASR interface. Implementations never touch rights or
 * integrity state: the pipeline gate runs before any provider call.
 */
export interface TranscriptProvider {
  readonly id: string;
  readonly model: string | null;
  /** Version of the underlying ASR tool/model (part of the cache identity). */
  readonly asrVersion: string;
  /** Version of this integration wrapper (part of the cache identity). */
  readonly toolVersion: string;
  transcribe(context: TranscriptContext): Promise<TranscriptProviderResult>;
}

/** Explicit unavailable: no ASR provider configured for this run. */
export const createUnavailableTranscriptProvider = (
  input: {
    reason?: string;
  } = {},
): TranscriptProvider => ({
  id: "none",
  model: null,
  asrVersion: "none",
  toolVersion: "media-asr-v1",
  transcribe: async () => ({
    availability: "unavailable",
    unavailableReason: input.reason ?? "no-asr-provider-configured",
  }),
});

export type StubTranscriptSegmentInput = {
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
  confidence?: number | null;
};

/**
 * Deterministic test/demo provider: returns exactly the segments it was given.
 * No network, no model — used by tests and offline runs.
 */
export const createStubTranscriptProvider = (input: {
  segments: StubTranscriptSegmentInput[];
  asrVersion?: string;
  toolVersion?: string;
  id?: string;
  model?: string | null;
}): TranscriptProvider => ({
  id: input.id ?? "stub-asr",
  model: input.model ?? null,
  asrVersion: input.asrVersion ?? "stub-asr-v1",
  toolVersion: input.toolVersion ?? "media-asr-stub-v1",
  transcribe: async () => ({
    availability: "available",
    segments: input.segments.map((segment) => asrSegmentSchema.parse(segment)),
  }),
});

/**
 * Fail-closed transcript validation: timestamps must be legal, ordered, and
 * inside the media duration; text is stored untouched. Any violation throws
 * `MEDIA_TRANSCRIPT_INVALID` instead of silently "fixing" the ASR output.
 */
export const validateTranscriptSegments = (input: {
  segments: AsrSegment[];
  durationMs: number | null;
}): TranscriptSegment[] => {
  let previousEndMs = 0;
  return input.segments.map((segment, index) => {
    const parsed = asrSegmentSchema.parse(segment);
    const problems: string[] = [];
    if (parsed.startMs < previousEndMs) problems.push(`overlap-at-${index}`);
    if (parsed.endMs <= parsed.startMs) problems.push(`window-at-${index}`);
    if (input.durationMs !== null && parsed.endMs > input.durationMs) {
      problems.push(`beyond-duration-at-${index}`);
    }
    if (problems.length > 0) {
      throw new Error(`MEDIA_TRANSCRIPT_INVALID:${problems.join(",")}`);
    }
    previousEndMs = parsed.endMs;
    return transcriptSegmentSchema.parse({
      index,
      text: parsed.text,
      startMs: parsed.startMs,
      endMs: parsed.endMs,
      speaker: parsed.speaker,
      confidence: parsed.confidence ?? null,
    });
  });
};

/** Builds the deterministic transcript artifact body from a provider result. */
export const buildMediaTranscript = (input: {
  episodeId: string;
  mediaId: string;
  sourceMediaRef: ArtifactRef;
  analysisSourceRef: ArtifactRef;
  provider: TranscriptProvider;
  result: TranscriptProviderResult;
  durationMs: number | null;
}): MediaTranscript =>
  mediaTranscriptSchema.parse({
    schemaVersion: MEDIA_TRANSCRIPT_SCHEMA_VERSION,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    sourceMediaRef: input.sourceMediaRef,
    analysisSourceRef: input.analysisSourceRef,
    provider: input.provider.id,
    model: input.provider.model,
    toolVersion: input.provider.toolVersion,
    asrVersion: input.provider.asrVersion,
    availability: input.result.availability,
    ...(input.result.unavailableReason ? {unavailableReason: input.result.unavailableReason} : {}),
    durationMs: input.durationMs,
    segments:
      input.result.availability === "available"
        ? validateTranscriptSegments({
            segments: input.result.segments ?? [],
            durationMs: input.durationMs,
          })
        : [],
  });
