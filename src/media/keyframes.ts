import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {assertSpawnSucceeded} from "../lib/process";

/**
 * WP-M5.04 keyframe extraction. Each scene yields at least one representative
 * keyframe; the default extractor pulls a real frame from the analysis source
 * with ffmpeg at a deterministic timestamp (scene midpoint). Keyframes are
 * derived artifacts — the original video is never modified, and repeated runs
 * with the same input + tool produce identical bytes.
 */

export const keyframeExtractionConfigSchema = z
  .object({
    /** ffmpeg `-q:v` quality (2 = near lossless; lower is better). */
    quality: z.number().int().min(1).max(31),
    mediaType: z.literal("image/jpeg"),
  })
  .strict();

export type KeyframeExtractionConfig = z.infer<typeof keyframeExtractionConfigSchema>;

export const DEFAULT_KEYFRAME_EXTRACTION_CONFIG: KeyframeExtractionConfig = {
  quality: 2,
  mediaType: "image/jpeg",
};

export type KeyframeExtractionInput = {
  inputPath: string;
  timestampMs: number;
  outputPath: string;
};

/** Deterministic tool contract: writes the keyframe bytes to outputPath. */
export type KeyframeExtractor = {
  readonly id: string;
  readonly version: string;
  extract(input: KeyframeExtractionInput): void;
};

/**
 * Default extractor: `ffmpeg -ss <t> -i <input> -frames:v 1 -q:v <q> <out.jpg>`.
 * Any ffmpeg failure fails closed (`MEDIA_INDEX_KEYFRAME_EXTRACTION_FAILED`).
 */
export const createFfmpegKeyframeExtractor = (
  input: {
    ffmpegPath?: string;
    config?: KeyframeExtractionConfig;
  } = {},
): KeyframeExtractor => {
  const ffmpegPath = input.ffmpegPath ?? "ffmpeg";
  const config = keyframeExtractionConfigSchema.parse(
    input.config ?? DEFAULT_KEYFRAME_EXTRACTION_CONFIG,
  );
  return {
    id: "ffmpeg",
    version: "ffmpeg-keyframe-v1",
    extract: ({inputPath, timestampMs, outputPath}) => {
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(timestampMs / 1000),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        String(config.quality),
        outputPath,
      ];
      const result = spawnSync(ffmpegPath, args, {encoding: "utf8"});
      try {
        assertSpawnSucceeded(ffmpegPath, args, result);
      } catch (error) {
        throw new Error(
          `MEDIA_INDEX_KEYFRAME_EXTRACTION_FAILED:${error instanceof Error ? error.message : String(error)}`,
          {cause: error},
        );
      }
      if (!fs.existsSync(outputPath)) {
        throw new Error("MEDIA_INDEX_KEYFRAME_EXTRACTION_FAILED:no-output");
      }
    },
  };
};

export type StubKeyframeBytesInput = {
  bytes?: Uint8Array;
};

/**
 * Deterministic test extractor: writes fixed bytes regardless of timestamp.
 * Pipeline mechanics (hashing, caching, lineage, registration) are exercised
 * without any media tool.
 */
export const createStubKeyframeExtractor = (
  input: StubKeyframeBytesInput = {},
): KeyframeExtractor => ({
  id: "stub-keyframes",
  version: "stub-keyframes-v1",
  extract: ({outputPath}) => {
    const bytes = input.bytes ?? Buffer.from("M5.04 deterministic stub keyframe bytes\n", "utf8");
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    fs.writeFileSync(outputPath, bytes);
  },
});

/** One deterministic keyframe descriptor inside the media index. */
export const keyframeDescriptorSchema = z
  .object({
    keyframeIndex: z.number().int().nonnegative(),
    sceneIndex: z.number().int().nonnegative(),
    timestampMs: z.number().int().nonnegative(),
    filename: z.string().min(1),
  })
  .strict();

export type KeyframeDescriptor = z.infer<typeof keyframeDescriptorSchema>;

/** Deterministic keyframe filename: `keyframe-<sceneIndex>-<timestampMs>.jpg`. */
export const keyframeFilename = (sceneIndex: number, timestampMs: number): string =>
  `keyframe-${sceneIndex}-${timestampMs}.jpg`;

/**
 * Representative keyframe timestamp for a scene: the midpoint, snapped to
 * whole milliseconds and clamped strictly inside the media duration.
 */
export const representativeKeyframeTimestamp = (input: {
  sceneStartMs: number;
  sceneEndMs: number;
  durationMs: number | null;
}): number => {
  const midpoint = Math.floor((input.sceneStartMs + input.sceneEndMs) / 2);
  if (input.durationMs !== null && midpoint >= input.durationMs) {
    return Math.max(input.sceneStartMs, input.durationMs - 1);
  }
  return midpoint;
};
