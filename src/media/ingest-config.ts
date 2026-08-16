import {z} from "zod";
import mediaIngestFile from "../../config/media-ingest.json";

/**
 * M5.03 ingest limits and the production normalization contract. Parsed at
 * module load exactly like the discovery config: an invalid or missing file
 * throws instead of silently falling back to unbounded behavior.
 */
export const mediaIngestConfigSchema = z
  .object({
    schemaVersion: z.literal("media-ingest-config-v1"),
    /** Hard ceiling on any single acquired file (download or local import). */
    maxDownloadBytes: z.number().int().positive(),
    /** Per-request download timeout in milliseconds. */
    downloadTimeoutMs: z.number().int().positive(),
    /** Exact lowercase content types a download may declare; anything else fails closed. */
    allowedContentTypes: z.array(z.string().min(1)).min(1),
    normalization: z
      .object({
        enabled: z.boolean(),
        video: z
          .object({
            codec: z.string().min(1),
            preset: z.string().min(1),
            crf: z.number().int().min(0).max(51),
            pixelFormat: z.string().min(1),
            audioCodec: z.string().min(1),
            audioBitrate: z.string().min(1),
            audioChannels: z.number().int().positive(),
            audioSampleRate: z.number().int().positive(),
            container: z.string().min(1),
            faststart: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    toolVersion: z.string().min(1),
  })
  .strict();

export type MediaIngestConfig = z.infer<typeof mediaIngestConfigSchema>;
export type MediaNormalizationVideoContract = MediaIngestConfig["normalization"]["video"];

export const parseMediaIngestConfig = (value: unknown): MediaIngestConfig =>
  mediaIngestConfigSchema.parse(value);

/**
 * Parsed at module load. An invalid or missing file throws immediately; there
 * is no silent fallback to unbounded downloads or unconstrained transcodes.
 */
export const mediaIngestFileConfig = parseMediaIngestConfig(mediaIngestFile);
