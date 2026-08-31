import {sha256Json} from "../lib/platform/cache";
import {episodeIdSchema} from "../orchestration/identity";
import {artifactRefSchema} from "../orchestration/schemas/artifact";
import type {Scene} from "./scenes";
import {z} from "zod";
import type {TranscriptSegment} from "./transcript";

/**
 * WP-M5.04 formal clip index.
 *
 * A ClipIndexItem is the smallest retrievable unit of a media asset. Clip
 * windows are deterministic (derived from scenes for video, from transcript
 * segment grouping for audio), and clip ids are content-derived — never based
 * on wall-clock time, run ids, or counters.
 */

export const MEDIA_CLIP_INDEX_SCHEMA_VERSION = "media-clip-index-v1" as const;
/** Container duration probes may differ by up to two video frames after proxy normalization. */
export const MEDIA_DURATION_ROUNDING_TOLERANCE_MS = 50;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const mediaStageAvailabilitySchema = z.enum(["available", "unavailable", "not-applicable"]);
export type MediaStageAvailability = z.infer<typeof mediaStageAvailabilitySchema>;

export const clipWindowConfigSchema = z
  .object({
    /** Hard ceiling for audio windows derived from transcript grouping. */
    maxWindowMs: z.number().int().positive(),
    /** Minimum audio window length before a segment may start a new window. */
    minWindowMs: z.number().int().nonnegative(),
  })
  .strict();

export type ClipWindowConfig = z.infer<typeof clipWindowConfigSchema>;

export const DEFAULT_CLIP_WINDOW_CONFIG: ClipWindowConfig = {
  maxWindowMs: 60000,
  minWindowMs: 0,
};

export const clipIndexItemSchema = z
  .object({
    /** Deterministic episode-scoped clip identity (never time-derived). */
    clipId: z.string().min(1),
    episodeId: episodeIdSchema,
    /** Hash-bound ArtifactRef of the original MediaAsset. */
    mediaRef: artifactRefSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    transcriptRefs: z.array(artifactRefSchema).default([]),
    sceneRefs: z.array(artifactRefSchema).default([]),
    keyframeRefs: z.array(artifactRefSchema).default([]),
    textSummary: z.string().max(2000),
    keywords: z.array(z.string().min(1)).default([]),
    entities: z.array(z.string().min(1)).default([]),
    speaker: z.string().min(1).nullable(),
    observedText: z.string().max(100000),
    semanticTags: z.array(z.string().min(1)).default([]),
    /** Optional; M5.04 does not produce real embeddings. */
    embeddingRef: artifactRefSchema.optional(),
    /** SHA-256 of the original media bytes this item describes. */
    sourceSha256: sha256Schema,
    /** Index schema version used to build this item. */
    indexVersion: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "clip window endMs must be greater than startMs",
      });
    }
    if (value.mediaRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["mediaRef", "episodeId"],
        message: "mediaRef belongs to another episode",
      });
    }
    if (value.sourceSha256 !== value.mediaRef.sha256) {
      context.addIssue({
        code: "custom",
        path: ["sourceSha256"],
        message: "sourceSha256 must equal mediaRef.sha256",
      });
    }
    if (!value.clipId.startsWith(`${value.episodeId}:media-clip:`)) {
      context.addIssue({
        code: "custom",
        path: ["clipId"],
        message: "clipId must use the episode media-clip identity scope",
      });
    }
  });

export type ClipIndexItem = z.infer<typeof clipIndexItemSchema>;

export const clipIndexSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_CLIP_INDEX_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    mediaId: z.string().min(1),
    /** Hash-bound ArtifactRef of the original MediaAsset. */
    mediaRef: artifactRefSchema,
    /** Hash-bound ArtifactRef of the bytes actually analyzed (proxy preferred). */
    analysisSourceRef: artifactRefSchema,
    sourceSha256: sha256Schema,
    indexVersion: z.literal(MEDIA_CLIP_INDEX_SCHEMA_VERSION),
    clipWindowConfig: clipWindowConfigSchema,
    transcriptAvailability: mediaStageAvailabilitySchema,
    scenesAvailability: mediaStageAvailabilitySchema,
    keyframesAvailability: mediaStageAvailabilitySchema,
    semanticAvailability: mediaStageAvailabilitySchema,
    asrProvider: z.string().min(1).nullable(),
    asrModel: z.string().min(1).nullable(),
    sceneDetector: z.string().min(1).nullable(),
    sceneDetectorVersion: z.string().min(1).nullable(),
    keyframeTool: z.string().min(1).nullable(),
    keyframeToolVersion: z.string().min(1).nullable(),
    semanticAdapter: z.string().min(1).nullable(),
    semanticAdapterVersion: z.string().min(1).nullable(),
    items: z.array(clipIndexItemSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mediaRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["mediaRef", "episodeId"],
        message: "mediaRef belongs to another episode",
      });
    }
    if (value.sourceSha256 !== value.mediaRef.sha256) {
      context.addIssue({
        code: "custom",
        path: ["sourceSha256"],
        message: "sourceSha256 must equal mediaRef.sha256",
      });
    }
    if (value.analysisSourceRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["analysisSourceRef", "episodeId"],
        message: "analysisSourceRef belongs to another episode",
      });
    }
    const clipIds = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (clipIds.has(item.clipId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "clipId"],
          message: "duplicate clipId",
        });
      }
      clipIds.add(item.clipId);
      if (item.mediaRef.sha256 !== value.sourceSha256) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "mediaRef", "sha256"],
          message: "item mediaRef must match the index source media",
        });
      }
    }
  });

export type ClipIndex = z.infer<typeof clipIndexSchema>;

/** One deterministic clip window (scene-aligned for video, segment-grouped for audio). */
export type ClipWindow = {
  startMs: number;
  endMs: number;
  /** Scene ordinals covered by this window (empty for audio windows). */
  sceneIndices: number[];
  /** Transcript segment ordinals covered by this window. */
  segmentIndices: number[];
};

/** Deterministic clip identity: content + config + schema version only. */
export const buildClipId = (input: {
  episodeId: string;
  mediaId: string;
  startMs: number;
  endMs: number;
  config: ClipWindowConfig;
  indexVersion: string;
}): string => {
  const digest = sha256Json({
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    startMs: input.startMs,
    endMs: input.endMs,
    clipWindowConfig: input.config,
    indexVersion: input.indexVersion,
  });
  return `${input.episodeId}:media-clip:${digest.slice(0, 24)}`;
};

const segmentOverlapsWindow = (
  segment: TranscriptSegment,
  startMs: number,
  endMs: number,
): boolean => segment.startMs < endMs && segment.endMs > startMs;

/**
 * Deterministic clip windows:
 * - video: one window per scene (scene boundaries are already deterministic);
 * - audio: greedy grouping of timestamped transcript segments under
 *   maxWindowMs, cut only at segment boundaries; a trailing window shorter
 *   than minWindowMs is merged into its predecessor when the merge still fits
 *   maxWindowMs.
 */
export const buildClipWindows = (input: {
  kind: "video" | "audio";
  scenes: Scene[] | null;
  transcriptSegments: TranscriptSegment[];
  config: ClipWindowConfig;
}): ClipWindow[] => {
  const config = clipWindowConfigSchema.parse(input.config);
  if (input.kind === "video" && input.scenes) {
    return input.scenes.map((scene) => {
      const segmentIndices = input.transcriptSegments
        .map((segment, index) => ({segment, index}))
        .filter(({segment}) => segmentOverlapsWindow(segment, scene.startMs, scene.endMs))
        .map(({index}) => index);
      return {
        startMs: scene.startMs,
        endMs: scene.endMs,
        sceneIndices: [scene.sceneIndex],
        segmentIndices,
      };
    });
  }
  const windows: ClipWindow[] = [];
  let current: ClipWindow | null = null;
  for (const [index, segment] of input.transcriptSegments.entries()) {
    if (current && segment.endMs - current.startMs <= config.maxWindowMs) {
      current.endMs = segment.endMs;
      current.segmentIndices.push(index);
      continue;
    }
    if (current) windows.push(current);
    current = {
      startMs: segment.startMs,
      endMs: segment.endMs,
      sceneIndices: [],
      segmentIndices: [index],
    };
  }
  if (current) windows.push(current);
  if (windows.length > 1 && config.minWindowMs > 0) {
    const previous = windows.at(-2);
    const trailing = windows.at(-1);
    if (
      previous &&
      trailing &&
      trailing.endMs - trailing.startMs < config.minWindowMs &&
      trailing.endMs - previous.startMs <= config.maxWindowMs
    ) {
      previous.endMs = trailing.endMs;
      previous.segmentIndices.push(...trailing.segmentIndices);
      windows.pop();
    }
  }
  return windows;
};

export const observedTextForWindow = (input: {
  segments: TranscriptSegment[];
  segmentIndices: number[];
}): string =>
  input.segmentIndices
    .map((index) => input.segments[index]?.text ?? "")
    .filter((text) => text.length > 0)
    .join(" ");
