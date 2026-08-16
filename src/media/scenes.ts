import {z} from "zod";
import {episodeIdSchema} from "../orchestration/identity";
import {artifactRefSchema, type ArtifactRef} from "../orchestration/schemas/artifact";

/**
 * WP-M5.04 deterministic scene detection.
 *
 * M5.04 deliberately uses a deterministic, content-independent detector: the
 * same bytes + detector version always produce the same boundaries, with no
 * model, network, or wall-clock input. A scene failure (missing duration,
 * invalid config) throws instead of faking a result.
 */

export const MEDIA_SCENES_SCHEMA_VERSION = "media-scenes-v1" as const;

export const sceneDetectionConfigSchema = z
  .object({
    /** Preferred scene length in milliseconds (the detector snaps to it). */
    targetSceneMs: z.number().int().positive(),
    /** Scenes shorter than this are merged into their predecessor. */
    minSceneMs: z.number().int().positive(),
    /** Hard ceiling on any single scene length. */
    maxSceneMs: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.minSceneMs > value.targetSceneMs || value.targetSceneMs > value.maxSceneMs) {
      context.addIssue({
        code: "custom",
        path: ["targetSceneMs"],
        message: "scene config must satisfy minSceneMs <= targetSceneMs <= maxSceneMs",
      });
    }
  });

export type SceneDetectionConfig = z.infer<typeof sceneDetectionConfigSchema>;

export const DEFAULT_SCENE_DETECTION_CONFIG: SceneDetectionConfig = {
  targetSceneMs: 4000,
  minSceneMs: 800,
  maxSceneMs: 6000,
};

export const sceneSchema = z
  .object({
    sceneIndex: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "scene endMs must be greater than startMs",
      });
    }
  });

export type Scene = z.infer<typeof sceneSchema>;

export const mediaScenesSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_SCENES_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    mediaId: z.string().min(1),
    /** Hash-bound ArtifactRef of the original MediaAsset (lineage root). */
    sourceMediaRef: artifactRefSchema,
    /** Hash-bound ArtifactRef of the bytes actually analyzed (proxy preferred). */
    analysisSourceRef: artifactRefSchema,
    /** Detector identity (part of the cache identity). */
    detector: z.string().min(1),
    /** Detector/tool version (part of the cache identity). */
    detectorVersion: z.string().min(1),
    /** Media SHA-256 the boundaries are bound to. */
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    durationMs: z.number().int().nonnegative().nullable(),
    config: sceneDetectionConfigSchema,
    scenes: z.array(sceneSchema).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    let previousEndMs = 0;
    for (const [index, scene] of value.scenes.entries()) {
      if (scene.sceneIndex !== index) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "sceneIndex"],
          message: "scene indices must be sequential from zero",
        });
      }
      if (scene.startMs < previousEndMs) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "startMs"],
          message: "scenes must not overlap",
        });
      }
      previousEndMs = scene.endMs;
    }
    if (value.scenes.length > 0) {
      const first = value.scenes[0];
      const last = value.scenes.at(-1);
      if (first && first.startMs !== 0) {
        context.addIssue({
          code: "custom",
          path: ["scenes", 0, "startMs"],
          message: "the first scene must start at zero",
        });
      }
      if (last && value.durationMs !== null && last.endMs > value.durationMs) {
        context.addIssue({
          code: "custom",
          path: ["scenes", value.scenes.length - 1, "endMs"],
          message: "scenes must stay inside the media duration",
        });
      }
    }
  });

export type MediaScenes = z.infer<typeof mediaScenesSchema>;

export type SceneDetectionInput = {
  durationMs: number | null;
  config: SceneDetectionConfig;
};

/**
 * Deterministic boundary detector: snap boundaries to multiples of
 * targetSceneMs, merge any trailing scene shorter than minSceneMs into its
 * predecessor, and never emit a scene longer than maxSceneMs. Missing or
 * invalid duration fails closed.
 */
export const detectScenes = (input: SceneDetectionInput): Scene[] => {
  const config = sceneDetectionConfigSchema.parse(input.config);
  if (input.durationMs === null || input.durationMs <= 0) {
    throw new Error(`MEDIA_SCENES_NO_DURATION:${input.durationMs ?? "unknown"}`);
  }
  if (input.durationMs < config.minSceneMs) {
    throw new Error(`MEDIA_SCENES_TOO_SHORT:${input.durationMs}`);
  }
  const boundaries: number[] = [];
  for (
    let boundary = config.targetSceneMs;
    boundary < input.durationMs;
    boundary += config.targetSceneMs
  ) {
    boundaries.push(boundary);
  }
  boundaries.push(input.durationMs);

  const scenes: {startMs: number; endMs: number}[] = [];
  let startMs = 0;
  for (const endMs of boundaries) {
    if (endMs - startMs < config.minSceneMs && scenes.length > 0) {
      const previous = scenes.at(-1);
      if (previous) previous.endMs = endMs;
      startMs = endMs;
      continue;
    }
    scenes.push({startMs, endMs});
    startMs = endMs;
  }
  if (scenes.length === 0) {
    throw new Error("MEDIA_SCENES_EMPTY");
  }
  return scenes.map((scene, sceneIndex) =>
    sceneSchema.parse({
      sceneIndex,
      startMs: scene.startMs,
      endMs: scene.endMs,
    }),
  );
};

export type SceneDetector = {
  readonly id: string;
  readonly version: string;
  detect(input: SceneDetectionInput): Scene[];
};

/** The M5.04 default detector: fully deterministic, no external tool. */
export const createDeterministicSceneDetector = (): SceneDetector => ({
  id: "deterministic-boundaries",
  version: "scene-detector-v1",
  detect: (input) => detectScenes(input),
});

/** Builds the deterministic scenes artifact body. */
export const buildMediaScenes = (input: {
  episodeId: string;
  mediaId: string;
  sourceMediaRef: ArtifactRef;
  analysisSourceRef: ArtifactRef;
  detector: SceneDetector;
  sourceSha256: string;
  durationMs: number | null;
  config: SceneDetectionConfig;
}): MediaScenes =>
  mediaScenesSchema.parse({
    schemaVersion: MEDIA_SCENES_SCHEMA_VERSION,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    sourceMediaRef: input.sourceMediaRef,
    analysisSourceRef: input.analysisSourceRef,
    detector: input.detector.id,
    detectorVersion: input.detector.version,
    sourceSha256: input.sourceSha256,
    durationMs: input.durationMs,
    config: input.config,
    scenes: input.detector.detect({durationMs: input.durationMs, config: input.config}),
  });
