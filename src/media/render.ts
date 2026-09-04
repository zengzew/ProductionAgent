import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {assertSpawnSucceeded} from "../lib/platform/process";
import {
  copyBytesAtomically,
  FineGrainedCacheStore,
  sha256Bytes,
  sha256File,
  sha256Json,
  type CacheKind,
} from "../lib/platform/cache";
import {assertTimelineMatchesEpisode, generatedCaptionsPath} from "../lib/episode/render-contract";
import {assetSchema, timelineSchema, type Asset, type Timeline} from "../schemas/episode";
import {
  artifactRefIsIndexed,
  assertArtifactRefBytes,
  buildArtifactRef,
  emptyArtifactIndex,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  writeArtifactIndexCas,
} from "../orchestration/artifact-registry";
import {episodeIdSchema} from "../orchestration/identity";
import {
  artifactDependencySchema,
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactRef,
} from "../orchestration/schemas/artifact";
import {getMediaSource} from "./discovery";
import {MEDIA_DURATION_ROUNDING_TOLERANCE_MS} from "./clip-index";
import {
  createMediaEvent,
  createMediaEventSink,
  type CreateMediaEventInput,
  type MediaEventSink,
  type MediaEventType,
} from "./events";
import {readMediaSourceManifest} from "./manifest";
import {
  mediaRenderPlanRepositoryPath,
  mediaRenderProxyRepositoryPath,
  mediaRenderPublicDirectoryRepositoryPath,
  mediaRenderPublicPath,
  mediaShotRepositoryPath,
  mediaTmpRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";
import {
  mediaClipRefSchema,
  type MediaAsset,
  type MediaClipRef,
  type MediaSourceManifest,
  type MediaVerification,
} from "./schemas";
import {
  findOfficialScreenshotAsset,
  listOfficialScreenshotAssets,
  readVisualSlot,
  visualSlotFallbackTypeSchema,
  visualSlotSelectedTypeSchema,
  type VisualSlot,
  type VisualSlotFallbackType,
  type VisualSlotSelectedType,
} from "./select";
import {readMediaUnderstandingStatus, serializeIndexArtifact} from "./understanding";
import {assertMediaClipVerified, readMediaVerification} from "./verify";
import {normalizeMediaShotGains} from "./render-math";

export {
  mediaShotAudioFadeGainAtFrame,
  mediaShotAudioGainsAtFrame,
  mediaShotCropOrigin,
  mediaShotDuckingGainAtFrame,
  mediaShotDuckingGainFactor,
  mediaShotTransformAtFrame,
  mediaShotVideoOpacityAtFrame,
  normalizeMediaShotGains,
  type MediaShotTransformState,
} from "./render-math";

/**
 * WP-M5.08 Real Media Remotion Editing.
 *
 * Turns a WP-M5.07 `visual-slot-v1` plus the production timeline into
 * hash-bound render artifacts:
 *
 * - `media-shot-v1` per final-script segment — the shot plan: trim window,
 *   crop/reframe/PiP/zoom-pan/freeze transforms, captions/source-label/badge
 *   overlays, original-audio + narration gains with simple ducking and fades,
 *   render-proxy ref, and the full lineage chain
 *   (shot → selected clip → verification → ClipIndex → original MediaAsset →
 *   source + timestamp);
 * - `media-render-plan-v1` per episode — the timeline-bound projection the
 *   generic Remotion mix composition consumes (`src/media/remotion.tsx`).
 *
 * Real media is never rendered without a fresh authorization
 * (`assertMediaShotRenderable`): the slot must be hash-valid + registered,
 * `assertMediaClipVerified` must PASS (re-reading current admission/rights and
 * every hash), verification/selection/asset/ClipIndex refs must bind their
 * bytes, the episode must match everywhere, and the trim window must be legal
 * (inside the VLM-recommended range and the media duration). Stale, tampered,
 * rights-blocked, or cross-episode media fails closed with `MEDIA_RENDER_*`
 * errors — it never silently falls back.
 *
 * The render proxy (normalized proxy preferred, original otherwise) is cut
 * with the M4 fine-grained cache (`media-render` kind). The cache key binds
 * clip SHA + trim + crop/transform + timeline/render config, so a stale entry
 * can never be reused; identical inputs always yield the identical key.
 * Observability: `media.render.started/completed/failed`, `media.rendered`,
 * `media.render.cache.hit/miss`.
 */

export const MEDIA_SHOT_SCHEMA_VERSION = "media-shot-v1" as const;
export const MEDIA_RENDER_PLAN_SCHEMA_VERSION = "media-render-plan-v1" as const;
export const MEDIA_RENDER_TOOL_VERSION = "media-render-v1" as const;
export const MEDIA_RENDER_PROXY_SCHEMA_VERSION = "media-render-proxy-v1" as const;
export const MEDIA_RENDER_CONFIG_VERSION = "media-render-config-v1" as const;
export const MEDIA_RENDER_CACHE_SCHEMA_VERSION = "media-render-cache-v1" as const;
export const MEDIA_RENDER_CACHE_IMPLEMENTATION_VERSION = "media-render-cache-impl-v1" as const;
export const MEDIA_RENDER_PROXY_CACHE_SCHEMA_VERSION = "media-render-proxy-cache-v1" as const;
export const MEDIA_RENDER_PROXY_CACHE_IMPLEMENTATION_VERSION =
  "media-render-proxy-cache-impl-v1" as const;

/**
 * Code/config files whose hashes bind the render cache identity. A change in
 * any of them produces a different cache key, so stale render entries are
 * never reused.
 */
export const MEDIA_RENDER_DEPENDENCY_PATHS = [
  "src/media/render.ts",
  "src/media/verify.ts",
  "src/media/select.ts",
  "src/media/manifest.ts",
  "src/media/schemas.ts",
  "src/media/events.ts",
  "src/media/paths.ts",
  "src/lib/platform/cache.ts",
  "src/orchestration/schemas/artifact.ts",
] as const;

const isoDateTimeSchema = z.string().datetime({offset: true});
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const segmentIdSchema = z.string().regex(/^seg-[a-z0-9-]+$/u);

const sortedHashes = (hashes: Record<string, string>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const key of Object.keys(hashes).sort()) {
    const value = hashes[key];
    if (!value || !/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`media render cache dependency hash invalid: ${key}`);
    }
    output[key] = value;
  }
  return output;
};

const hashExistingRepositoryFiles = (
  repoRoot: string,
  repositoryPaths: readonly string[],
): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const repositoryPath of repositoryPaths) {
    const absolute = resolveMediaRepositoryPath(repoRoot, repositoryPath);
    if (fs.existsSync(absolute)) {
      output[repositoryPath] = sha256File(absolute);
    }
  }
  return output;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
};

/* ------------------------------------------------------------------------- *
 * Render config
 * ------------------------------------------------------------------------- */

export const mediaRenderConfigSchema = z
  .object({
    version: z.literal(MEDIA_RENDER_CONFIG_VERSION),
    canvas: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
    fps: z.number().int().positive(),
    /** SHA-256 of the exact `content/<ep>/production/timeline.json` bytes. */
    timelineSha256: sha256Schema,
    layoutVariant: z.enum(["poke-standard", "roost-standard", "roost-goal3"]),
    proxyExtractor: z.object({id: z.string().min(1), version: z.string().min(1)}).strict(),
  })
  .strict();

export type MediaRenderConfig = z.infer<typeof mediaRenderConfigSchema>;

/* ------------------------------------------------------------------------- *
 * Transform contract (crop / reframe / PiP / zoom-pan / freeze)
 * ------------------------------------------------------------------------- */

export const mediaShotZoomPanSchema = z
  .object({
    type: z.enum(["none", "ken-burns", "zoom-in", "pan"]),
    start: z
      .object({
        zoom: z.number().min(1).max(4),
        /** Fraction of the canvas (−0.5..0.5). */
        x: z.number().min(-0.5).max(0.5),
        y: z.number().min(-0.5).max(0.5),
      })
      .strict(),
    end: z
      .object({
        zoom: z.number().min(1).max(4),
        x: z.number().min(-0.5).max(0.5),
        y: z.number().min(-0.5).max(0.5),
      })
      .strict(),
  })
  .strict();

export type MediaShotZoomPan = z.infer<typeof mediaShotZoomPanSchema>;

export const mediaShotCropSchema = z
  .object({
    /** Normalized crop rectangle over the SOURCE frame (0..1). */
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.x + value.width > 1 + 1e-9 || value.y + value.height > 1 + 1e-9) {
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "crop rectangle must stay inside the normalized source frame",
      });
    }
  });

export type MediaShotCrop = z.infer<typeof mediaShotCropSchema>;

export const mediaShotPipSchema = z
  .object({
    enabled: z.boolean(),
    position: z.enum(["bottom-right", "bottom-left", "top-right", "top-left"]),
    /** PiP box size as a fraction of the canvas. */
    size: z.number().min(0.1).max(0.9),
    borderRadius: z.number().min(0).max(200).default(18),
    borderColor: z.string().min(1).default("#ffffff"),
    shadow: z.boolean().default(true),
  })
  .strict();

export type MediaShotPip = z.infer<typeof mediaShotPipSchema>;

export const mediaShotTransformSchema = z
  .object({
    /** 9:16 reframe of the source frame. `cover` fills the stage (cropping
     *  the sides), `contain` letterboxes, `blur-fill` letterboxes over a
     *  blurred full-bleed copy. */
    reframe: z
      .object({
        mode: z.enum(["cover", "contain", "blur-fill"]),
        crop: mediaShotCropSchema,
      })
      .strict(),
    /** Extra scale multiplier applied after the crop. */
    scale: z.number().min(0.1).max(4).default(1),
    /** Normalized position offsets of the media in the stage (−1..1, where 1
     *  shifts the media by half the canvas). */
    position: z
      .object({x: z.number().min(-1).max(1), y: z.number().min(-1).max(1)})
      .strict()
      .default({x: 0, y: 0}),
    zoomPan: mediaShotZoomPanSchema,
    /** Picture-in-picture box; null = full-bleed. */
    pip: mediaShotPipSchema.nullable(),
    /** Freeze the (trimmed) video at this source-relative timestamp (ms). */
    freezeFrameMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type MediaShotTransform = z.infer<typeof mediaShotTransformSchema>;

/* ------------------------------------------------------------------------- *
 * Audio contract (original clip audio + narration, simple ducking, fades)
 * ------------------------------------------------------------------------- */

export const mediaShotDuckingSchema = z
  .object({
    enabled: z.boolean(),
    /** dB reduction applied to the original clip audio during narration. */
    reductionDb: z.number().min(0).max(24),
    attackMs: z.number().int().nonnegative(),
    releaseMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.enabled && (value.reductionDb > 0 || value.attackMs > 0 || value.releaseMs > 0)) {
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message: "disabled ducking must carry zero reduction/attack/release",
      });
    }
  });

export type MediaShotDucking = z.infer<typeof mediaShotDuckingSchema>;

export const mediaShotAudioSchema = z
  .object({
    /** Gain of the original clip audio (0 = muted). Must be 0 for fallback visuals. */
    originalAudioGain: z.number().min(0).max(1),
    /** Gain of the narration (TTS) track. */
    narrationGain: z.number().min(0).max(1),
    ducking: mediaShotDuckingSchema,
    fadeInMs: z.number().int().nonnegative(),
    fadeOutMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    // Clipping prevention: the deterministic mix contract keeps the sum of
    // the two gain rails at or below unity after normalization.
    if (value.originalAudioGain + value.narrationGain > 1 + 1e-9) {
      context.addIssue({
        code: "custom",
        path: ["originalAudioGain"],
        message: "originalAudioGain + narrationGain must not exceed 1",
      });
    }
  });

export type MediaShotAudio = z.infer<typeof mediaShotAudioSchema>;

/* ------------------------------------------------------------------------- *
 * Overlays (captions / source label / badge)
 * ------------------------------------------------------------------------- */

export const mediaShotOverlaySchema = z
  .object({
    /** Source label shown on the shot (publisher · evidence kind). */
    sourceLabel: z.string().max(200).nullable(),
    badge: z
      .object({
        text: z.string().min(1).max(60),
        tone: z.enum(["real", "official", "demo"]),
      })
      .strict()
      .nullable(),
    captionsEnabled: z.boolean().default(true),
  })
  .strict();

export type MediaShotOverlays = z.infer<typeof mediaShotOverlaySchema>;

/* ------------------------------------------------------------------------- *
 * Lineage (rendered shot → clip → verification → ClipIndex → MediaAsset)
 * ------------------------------------------------------------------------- */

export const mediaShotLineageSchema = z
  .object({
    clipId: z.string().min(1),
    /** Original MediaAsset id the clip was retrieved from. */
    sourceMediaId: z.string().min(1),
    /** Hash-bound original MediaAsset artifact ref. */
    sourceMediaRef: artifactRefSchema,
    /** SHA-256 of the original media bytes. */
    sourceSha256: sha256Schema,
    /** Verified window in the ORIGINAL media timeline (ms). */
    sourceStartMs: z.number().int().nonnegative(),
    sourceEndMs: z.number().int().positive(),
    /** Hash-bound `media-verification-v1` ref backing the clip. */
    verificationRef: artifactRefSchema,
    /** Hash-bound `media-clip-index-v1` ref containing the clip. */
    clipIndexRef: artifactRefSchema,
    /** Hash-bound short verification clip bytes the VLM saw. */
    clipArtifactRef: artifactRefSchema,
    /** Hash-bound asset actually cut (normalized proxy preferred). */
    cutSourceRef: artifactRefSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceEndMs <= value.sourceStartMs) {
      context.addIssue({
        code: "custom",
        path: ["sourceEndMs"],
        message: "sourceEndMs must be greater than sourceStartMs",
      });
    }
    if (value.sourceMediaRef.artifactId !== value.sourceMediaId) {
      context.addIssue({
        code: "custom",
        path: ["sourceMediaRef"],
        message: "sourceMediaRef must anchor sourceMediaId",
      });
    }
    if (value.sourceMediaRef.sha256 !== value.sourceSha256) {
      context.addIssue({
        code: "custom",
        path: ["sourceSha256"],
        message: "sourceSha256 must equal sourceMediaRef.sha256",
      });
    }
  });

export type MediaShotLineage = z.infer<typeof mediaShotLineageSchema>;

/* ------------------------------------------------------------------------- *
 * Shot gate snapshot + formal shot plan (`media-shot-v1`)
 * ------------------------------------------------------------------------- */

export const mediaShotGateSchema = z
  .object({
    /** Selection slot present, hash-valid, and registered. */
    slotValid: z.boolean(),
    /** `assertMediaClipVerified` PASS at build time. */
    clipVerified: z.boolean(),
    /** Source admission + rights approval re-read at build time. */
    rightsApproved: z.boolean(),
    /** Every referenced artifact bound its bytes. */
    hashesValid: z.boolean(),
    /** Episode identity matched everywhere. */
    episodeIsolated: z.boolean(),
    /** Trim window legal (inside the recommended range + media duration). */
    timestampsValid: z.boolean(),
  })
  .strict();

export type MediaShotGate = z.infer<typeof mediaShotGateSchema>;

export const mediaShotSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_SHOT_SCHEMA_VERSION),
    /** `<episode>:media-shot:<segmentId>`. */
    shotId: z.string().min(1),
    episodeId: episodeIdSchema,
    segmentId: segmentIdSchema,
    sceneIndex: z.number().int().nonnegative(),
    startFrame: z.number().int().nonnegative(),
    durationFrames: z.number().int().positive(),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    /** Timeline-bound visual type of this shot. */
    visualType: visualSlotSelectedTypeSchema,
    /** Chosen verified real clip (only for real-media shots). */
    selectedMediaClipRef: mediaClipRefSchema.nullable(),
    /** Hash-bound `media-verification-v1` ref backing the clip. */
    verificationRef: artifactRefSchema.nullable(),
    fallbackType: visualSlotFallbackTypeSchema.nullable(),
    fallbackReason: z.string().max(2000).nullable(),
    /** Trim window (ms) inside the VLM-recommended range; null for fallbacks. */
    trim: z
      .object({startMs: z.number().int().nonnegative(), endMs: z.number().int().positive()})
      .strict()
      .nullable(),
    transform: mediaShotTransformSchema,
    overlays: mediaShotOverlaySchema,
    audio: mediaShotAudioSchema,
    fade: z
      .object({inMs: z.number().int().nonnegative(), outMs: z.number().int().nonnegative()})
      .strict(),
    /** Simple video crossfade with the previous shot (ms; 0 = none). */
    crossfadeMs: z.number().int().nonnegative(),
    lineage: mediaShotLineageSchema.nullable(),
    /** Hash-bound render proxy bytes the Remotion layer actually plays. */
    renderProxyRef: artifactRefSchema.nullable(),
    /** Public `staticFile` path of the render proxy copy. */
    staticFilePath: z
      .string()
      .regex(/^episodes\/episode-[a-z0-9-]+\/media\/[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9.+-]*$/u)
      .nullable(),
    /** Media type of the render proxy (video/* or audio/*). */
    renderProxyMediaType: z.string().min(1).nullable(),
    /** Public `staticFile` path of an official screenshot (fallback shots
     *  only; projected from an admitted, hash-bound image MediaAsset). */
    fallbackImagePath: z
      .string()
      .regex(/^episodes\/episode-[a-z0-9-]+\/media\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/u)
      .nullable(),
    /** SHA-256 of the exact still-image bytes rendered by Remotion. */
    fallbackImageSha256: sha256Schema.nullable(),
    /** Asset-manifest id or MediaAsset id that authorized the still image. */
    fallbackImageAssetId: z.string().min(1).nullable(),
    /** Optional hash-bound editorial evidence still briefly layered over real B-roll. */
    evidenceImagePath: z
      .string()
      .regex(/^episodes\/episode-[a-z0-9-]+\/media\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/u)
      .nullable()
      .default(null),
    evidenceImageSha256: sha256Schema.nullable().default(null),
    evidenceImageAssetId: z.string().min(1).nullable().default(null),
    /** Deterministic hard-gate snapshot taken at build time. */
    gate: mediaShotGateSchema,
    config: mediaRenderConfigSchema,
    /** Non-empty deterministic audit trail. */
    reasons: z.array(z.string().min(1)).min(1),
    /** Embedded ref (content hash of the body without this field). */
    artifactRef: artifactRefSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const slug = value.shotId.slice(`${value.episodeId}:media-shot:`.length);
    if (value.shotId !== `${value.episodeId}:media-shot:${value.segmentId}`) {
      context.addIssue({
        code: "custom",
        path: ["shotId"],
        message: "shotId must use this episode media-shot identity for the segment",
      });
    } else if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(slug)) {
      context.addIssue({
        code: "custom",
        path: ["shotId"],
        message: "shotId must use a valid media-shot slug",
      });
    }
    if (
      value.artifactRef.episodeId !== value.episodeId ||
      value.artifactRef.artifactId !== value.shotId ||
      !value.artifactRef.path.startsWith(`content/${value.episodeId}/media/shots/`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef"],
        message: "artifactRef must use this episode media-shot identity and shots path",
      });
    }
    if (value.endSeconds <= value.startSeconds) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "endSeconds must be greater than startSeconds",
      });
    }
    if (value.visualType === "real-media") {
      if (!value.selectedMediaClipRef || !value.verificationRef) {
        context.addIssue({
          code: "custom",
          path: ["visualType"],
          message: "real-media shot requires selectedMediaClipRef and verificationRef",
        });
      }
      if (value.fallbackImagePath !== null) {
        context.addIssue({
          code: "custom",
          path: ["fallbackImagePath"],
          message: "real-media shot must not carry a fallback image path",
        });
      }
      if (value.fallbackImageSha256 !== null || value.fallbackImageAssetId !== null) {
        context.addIssue({
          code: "custom",
          path: ["fallbackImageSha256"],
          message: "real-media shot must not carry fallback image identity",
        });
      }
      const evidenceIdentity = [
        value.evidenceImagePath,
        value.evidenceImageSha256,
        value.evidenceImageAssetId,
      ];
      if (
        evidenceIdentity.some((item) => item !== null) &&
        evidenceIdentity.some((item) => item === null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["evidenceImagePath"],
          message: "real-media evidence still requires path, hash, and asset id together",
        });
      }
      if (!value.trim) {
        context.addIssue({
          code: "custom",
          path: ["trim"],
          message: "real-media shot requires a trim window",
        });
      } else {
        if (value.trim.endMs <= value.trim.startMs) {
          context.addIssue({
            code: "custom",
            path: ["trim", "endMs"],
            message: "trim endMs must be greater than trim startMs",
          });
        }
        if (value.selectedMediaClipRef) {
          if (
            value.trim.startMs < value.selectedMediaClipRef.startMs ||
            value.trim.endMs > value.selectedMediaClipRef.endMs
          ) {
            context.addIssue({
              code: "custom",
              path: ["trim"],
              message: "trim must lie inside the candidate clip window",
            });
          }
        }
      }
      if (!value.lineage) {
        context.addIssue({
          code: "custom",
          path: ["lineage"],
          message: "real-media shot requires a lineage chain",
        });
      } else if (value.selectedMediaClipRef) {
        if (
          value.lineage.clipId !== value.selectedMediaClipRef.clipId ||
          value.lineage.sourceMediaId !== value.selectedMediaClipRef.mediaId ||
          value.lineage.sourceMediaRef.sha256 !== value.selectedMediaClipRef.sourceMediaRef.sha256
        ) {
          context.addIssue({
            code: "custom",
            path: ["lineage"],
            message: "lineage must anchor the selected clip and its source media",
          });
        }
        if (
          value.lineage.sourceStartMs !== value.trim?.startMs ||
          value.lineage.sourceEndMs !== value.trim?.endMs
        ) {
          context.addIssue({
            code: "custom",
            path: ["lineage"],
            message: "lineage source timestamps must equal the trim window",
          });
        }
      }
      if (!value.renderProxyRef || !value.staticFilePath || !value.renderProxyMediaType) {
        context.addIssue({
          code: "custom",
          path: ["renderProxyRef"],
          message: "real-media shot requires renderProxyRef, staticFilePath, and media type",
        });
      }
      if (value.fallbackType !== null || value.fallbackReason !== null) {
        context.addIssue({
          code: "custom",
          path: ["fallbackType"],
          message: "real-media shot must not carry a fallback reason",
        });
      }
      const gateAllTrue =
        value.gate.slotValid &&
        value.gate.clipVerified &&
        value.gate.rightsApproved &&
        value.gate.hashesValid &&
        value.gate.episodeIsolated &&
        value.gate.timestampsValid;
      if (!gateAllTrue) {
        context.addIssue({
          code: "custom",
          path: ["gate"],
          message: "real-media shot requires all deterministic gates to pass",
        });
      }
    } else {
      if (
        value.evidenceImagePath !== null ||
        value.evidenceImageSha256 !== null ||
        value.evidenceImageAssetId !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["evidenceImagePath"],
          message: "only real-media shots may carry a layered evidence still",
        });
      }
      if (
        value.selectedMediaClipRef !== null ||
        value.verificationRef !== null ||
        value.lineage !== null ||
        value.trim !== null ||
        value.renderProxyRef !== null ||
        value.staticFilePath !== null ||
        value.renderProxyMediaType !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["selectedMediaClipRef"],
          message: "fallback shot must not carry clip/verification/lineage/proxy data",
        });
      }
      if (!value.fallbackReason) {
        context.addIssue({
          code: "custom",
          path: ["fallbackReason"],
          message: "fallback shot requires a structured fallback reason",
        });
      }
      if (value.visualType === "official-screenshot" && value.fallbackImagePath === null) {
        context.addIssue({
          code: "custom",
          path: ["fallbackImagePath"],
          message: "official-screenshot shot requires a capture asset path",
        });
      }
      if (
        value.visualType === "official-screenshot" &&
        (value.fallbackImageSha256 === null || value.fallbackImageAssetId === null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["fallbackImageSha256"],
          message: "official-screenshot shot requires hash-bound asset identity",
        });
      }
      if (value.visualType !== "official-screenshot" && value.fallbackImagePath !== null) {
        context.addIssue({
          code: "custom",
          path: ["fallbackImagePath"],
          message: "only official-screenshot shots may carry a fallback image path",
        });
      }
      if (
        value.visualType !== "official-screenshot" &&
        (value.fallbackImageSha256 !== null || value.fallbackImageAssetId !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["fallbackImageSha256"],
          message: "only official-screenshot shots may carry fallback image identity",
        });
      }
      if (value.audio.originalAudioGain !== 0) {
        context.addIssue({
          code: "custom",
          path: ["audio", "originalAudioGain"],
          message: "fallback shot has no original audio; originalAudioGain must be 0",
        });
      }
      if (value.gate.clipVerified || value.gate.rightsApproved || value.gate.timestampsValid) {
        context.addIssue({
          code: "custom",
          path: ["gate"],
          message: "fallback shot gate must not claim clip verification or rights",
        });
      }
    }
    if (
      value.transform.freezeFrameMs !== null &&
      value.trim !== null &&
      value.transform.freezeFrameMs >= value.trim.endMs - value.trim.startMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["transform", "freezeFrameMs"],
        message: "freezeFrameMs must lie inside the trim window",
      });
    }
  });

export type MediaShot = z.infer<typeof mediaShotSchema>;

/* ------------------------------------------------------------------------- *
 * Render plan (`media-render-plan-v1`) — the composition projection
 * ------------------------------------------------------------------------- */

export const mediaRenderPlanSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_RENDER_PLAN_SCHEMA_VERSION),
    /** `<episode>:media:render-plan`. */
    planId: z.string().min(1),
    episodeId: episodeIdSchema,
    fps: z.number().int().positive(),
    totalFrames: z.number().int().positive(),
    totalSeconds: z.number().positive(),
    /** SHA-256 of the exact production timeline bytes this plan binds. */
    timelineSha256: sha256Schema,
    layoutVariant: z.enum(["poke-standard", "roost-standard", "roost-goal3"]),
    shots: z.array(mediaShotSchema).min(1),
    config: mediaRenderConfigSchema,
    /** Embedded ref (content hash of the body without this field). */
    artifactRef: artifactRefSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.planId !== `${value.episodeId}:media:render-plan`) {
      context.addIssue({
        code: "custom",
        path: ["planId"],
        message: "planId must use this episode media-render-plan identity",
      });
    }
    if (
      value.artifactRef.episodeId !== value.episodeId ||
      value.artifactRef.artifactId !== value.planId ||
      !value.artifactRef.path.startsWith(`content/${value.episodeId}/media/`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef"],
        message: "artifactRef must use this episode media-render-plan identity",
      });
    }
    if (value.fps !== value.config.fps) {
      context.addIssue({
        code: "custom",
        path: ["fps"],
        message: "plan fps must equal config fps",
      });
    }
    if (value.timelineSha256 !== value.config.timelineSha256) {
      context.addIssue({
        code: "custom",
        path: ["timelineSha256"],
        message: "plan timelineSha256 must equal config timelineSha256",
      });
    }
    for (const [index, shot] of value.shots.entries()) {
      if (shot.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["shots", index, "episodeId"],
          message: "shot belongs to another episode",
        });
      }
      if (shot.config.timelineSha256 !== value.timelineSha256) {
        context.addIssue({
          code: "custom",
          path: ["shots", index, "config", "timelineSha256"],
          message: "shot config must bind the same timeline",
        });
      }
      if (index > 0) {
        const previous = value.shots[index - 1]!;
        if (shot.sceneIndex !== previous.sceneIndex + 1) {
          context.addIssue({
            code: "custom",
            path: ["shots", index, "sceneIndex"],
            message: "shots must follow the timeline scene order",
          });
        }
        if (shot.startFrame !== previous.startFrame + previous.durationFrames) {
          context.addIssue({
            code: "custom",
            path: ["shots", index, "startFrame"],
            message: "shots must be contiguous on the timeline",
          });
        }
      }
      if (
        index === value.shots.length - 1 &&
        shot.startFrame + shot.durationFrames > value.totalFrames
      ) {
        context.addIssue({
          code: "custom",
          path: ["totalFrames"],
          message: "last shot must not exceed totalFrames (timeline tail slack is preserved)",
        });
      }
    }
  });

export type MediaRenderPlan = z.infer<typeof mediaRenderPlanSchema>;

/* ------------------------------------------------------------------------- *
 * Transform/audio math used by the generic renderer (pure, unit-tested)
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- *
 * Cache identity
 * ------------------------------------------------------------------------- */

export type MediaRenderShotKeyInput = {
  episodeId: string;
  segmentId: string;
  clipId: string;
  /** SHA-256 of the original media bytes the clip belongs to. */
  sourceSha256: string;
  /** SHA-256 of the asset actually cut (normalized proxy preferred). */
  analysisSourceSha256: string;
  trimStartMs: number;
  trimEndMs: number;
  /** Full transform spec (crop/scale/position/zoom-pan/PiP/freeze). */
  transform: MediaShotTransform;
  timelineSha256: string;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  layoutVariant: string;
  extractorId: string;
  extractorVersion: string;
  dependencyHashes: Record<string, string>;
};

/**
 * M5.08 shot cache key: clip SHA + trim + crop/transform + timeline/render
 * config. Any of these changing produces a different key, so a stale render
 * entry can never be reused; identical inputs always yield the identical key.
 */
export const buildMediaRenderShotKey = (input: MediaRenderShotKeyInput): string => {
  for (const label of ["sourceSha256", "analysisSourceSha256", "timelineSha256"] as const) {
    if (!/^[a-f0-9]{64}$/u.test(input[label])) {
      throw new Error(`media render cache ${label} must be a SHA-256 digest`);
    }
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_RENDER_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_RENDER_CACHE_IMPLEMENTATION_VERSION,
    episodeId: input.episodeId,
    segmentId: input.segmentId,
    clipId: input.clipId,
    sourceSha256: input.sourceSha256,
    analysisSourceSha256: input.analysisSourceSha256,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
    transform: input.transform,
    timelineSha256: input.timelineSha256,
    fps: input.fps,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    layoutVariant: input.layoutVariant,
    extractorId: input.extractorId,
    extractorVersion: input.extractorVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

export type MediaRenderProxyIdentityInput = {
  episodeId: string;
  segmentId: string;
  clipId: string;
  sourceSha256: string;
  analysisSourceSha256: string;
  trimStartMs: number;
  trimEndMs: number;
  extractorId: string;
  extractorVersion: string;
  dependencyHashes: Record<string, string>;
};

/**
 * Byte-level render proxy identity: source SHA + cut source SHA + exact trim
 * window + extractor identity + dependency hashes. Used for cache metadata
 * and observability; the authoritative cache key is the shot key above.
 */
export const buildMediaRenderProxyIdentityKey = (input: MediaRenderProxyIdentityInput): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.sourceSha256)) {
    throw new Error("media render proxy identity sourceSha256 must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_RENDER_PROXY_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_RENDER_PROXY_CACHE_IMPLEMENTATION_VERSION,
    episodeId: input.episodeId,
    segmentId: input.segmentId,
    clipId: input.clipId,
    sourceSha256: input.sourceSha256,
    analysisSourceSha256: input.analysisSourceSha256,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
    extractorId: input.extractorId,
    extractorVersion: input.extractorVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

/* ------------------------------------------------------------------------- *
 * Render proxy extraction contract
 * ------------------------------------------------------------------------- */

export type MediaRenderProxyExtractionInput = {
  inputPath: string;
  startMs: number;
  endMs: number;
  outputPath: string;
  mediaType: string;
};

export type MediaRenderProxyExtractor = {
  readonly id: string;
  readonly version: string;
  extract(input: MediaRenderProxyExtractionInput): void;
};

const renderProxyExtensionForMediaType = (mediaType: string): string => {
  if (mediaType === "video/mp4") return "mp4";
  if (mediaType === "audio/mpeg") return "mp3";
  if (mediaType === "audio/wav" || mediaType === "audio/x-wav") return "wav";
  if (mediaType.startsWith("video/")) return "mp4";
  if (mediaType.startsWith("audio/")) return "m4a";
  throw new Error(`MEDIA_RENDER_PROXY_MEDIA_TYPE_UNSUPPORTED:${mediaType}`);
};

/**
 * Default extractor: exact-seek + bounded re-encode of the trim window.
 * Any ffmpeg failure fails closed (`MEDIA_RENDER_PROXY_EXTRACTION_FAILED`).
 */
export const createFfmpegRenderProxyExtractor = (
  input: {ffmpegPath?: string} = {},
): MediaRenderProxyExtractor => {
  const ffmpegPath = input.ffmpegPath ?? "ffmpeg";
  return {
    id: "ffmpeg",
    version: "ffmpeg-render-proxy-v1",
    extract: ({inputPath, startMs, endMs, outputPath, mediaType}) => {
      const durationSeconds = ((endMs - startMs) / 1000).toFixed(3);
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(startMs / 1000),
        "-i",
        inputPath,
        "-t",
        durationSeconds,
      ];
      if (mediaType.startsWith("audio/")) {
        args.push("-vn", "-c:a", "aac", "-b:a", "160k");
      } else {
        args.push(
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
        );
      }
      args.push("-movflags", "+faststart", outputPath);
      const result = spawnSync(ffmpegPath, args, {encoding: "utf8"});
      try {
        assertSpawnSucceeded(ffmpegPath, args, result);
      } catch (error) {
        throw new Error(
          `MEDIA_RENDER_PROXY_EXTRACTION_FAILED:${error instanceof Error ? error.message : String(error)}`,
          {cause: error},
        );
      }
      if (!fs.existsSync(outputPath)) {
        throw new Error("MEDIA_RENDER_PROXY_EXTRACTION_FAILED:no-output");
      }
    },
  };
};

/**
 * Deterministic test extractor: writes fixed bytes regardless of the window.
 * Render mechanics (hashing, caching, registration, lineage) are exercised
 * without any media tool.
 */
export const createStubRenderProxyExtractor = (
  input: {bytes?: Uint8Array; version?: string} = {},
): MediaRenderProxyExtractor => ({
  id: "stub-render-proxy",
  version: input.version ?? "stub-render-proxy-v1",
  extract: ({outputPath}) => {
    const bytes =
      input.bytes ?? Buffer.from("M5.08 deterministic stub render proxy bytes\n", "utf8");
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    fs.writeFileSync(outputPath, bytes);
  },
});

/* ------------------------------------------------------------------------- *
 * Registry + persistence helpers
 * ------------------------------------------------------------------------- */

const readDependencies = (refs: readonly ArtifactRef[]): ArtifactDependency[] =>
  refs.map((ref) =>
    artifactDependencySchema.parse({
      artifactId: ref.artifactId,
      path: ref.path,
      sha256: ref.sha256,
      relation: "reads",
    }),
  );

const decisionDependencies = (
  source: MediaSourceManifest["sources"][number],
): ArtifactDependency[] => {
  const dependencies: ArtifactDependency[] = [];
  for (const ref of [source.admissionDecisionRef, source.rightsDecisionRef]) {
    if (ref) {
      dependencies.push(
        artifactDependencySchema.parse({
          artifactId: ref.artifactId,
          path: ref.path,
          sha256: ref.sha256,
          relation: "reads",
        }),
      );
    }
  }
  return dependencies;
};

const dedupeDependencies = (dependencies: readonly ArtifactDependency[]): ArtifactDependency[] => {
  const seen = new Set<string>();
  const output: ArtifactDependency[] = [];
  for (const dependency of dependencies) {
    const key = `${dependency.artifactId}:${dependency.sha256}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(dependency);
  }
  return output;
};

const registerMediaRenderCandidate = (input: {
  repoRoot: string;
  episodeId: string;
  ref: ArtifactRef;
  executionId: string;
  dependencies: readonly ArtifactDependency[];
}): void => {
  const filePath = path.resolve(input.repoRoot, `content/${input.episodeId}/artifact-index.json`);
  const expectedVersion = readArtifactIndexVersion(filePath);
  let index = fs.existsSync(filePath)
    ? readArtifactIndex(filePath)
    : emptyArtifactIndex(input.episodeId);
  index = registerCandidate(index, input.ref, input.executionId, [...input.dependencies]);
  writeArtifactIndexCas({
    filePath,
    index,
    expectedVersion,
    casRoot: input.repoRoot,
  });
};

const publishMediaShotArtifact = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  shotId: string;
  bytes: Uint8Array;
  dependencies: readonly ArtifactDependency[];
  executionId: string;
  producer: string;
  now: () => string;
}): ArtifactRef => {
  const filePath = resolveMediaRepositoryPath(
    input.repoRoot,
    mediaShotRepositoryPath(input.episodeId, input.segmentId),
  );
  copyBytesAtomically(filePath, Buffer.from(input.bytes));
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.shotId,
    episodeId: input.episodeId,
    path: mediaShotRepositoryPath(input.episodeId, input.segmentId),
    mediaType: "application/json",
    schemaVersion: MEDIA_SHOT_SCHEMA_VERSION,
    producer: input.producer,
    createdAt: input.now(),
  });
  registerMediaRenderCandidate({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref,
    executionId: input.executionId,
    dependencies: input.dependencies,
  });
  return ref;
};

/* ------------------------------------------------------------------------- *
 * Render proxy materialization (cache + artifact + public copy)
 * ------------------------------------------------------------------------- */

export type MaterializeRenderProxyResult = {
  ref: ArtifactRef;
  staticFilePath: string;
  mediaType: string;
  cacheHit: boolean;
  proxyIdentityKey: string;
};

/**
 * Cuts the trim window of the analysis source (normalized proxy preferred),
 * publishes it as a hash-bound `media-render-proxy-v1` artifact, and copies
 * the bytes to the public directory Remotion consumes (`staticFile`). The M4
 * fine-grained cache key binds clip SHA + trim + crop/transform + timeline/
 * render config; a hit republishes the cached bytes without re-encoding.
 */
export const materializeRenderProxy = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  clipId: string;
  sourceSha256: string;
  analysisSource: MediaAsset;
  trimStartMs: number;
  trimEndMs: number;
  transform: MediaShotTransform;
  timelineSha256: string;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  layoutVariant: string;
  extractor: MediaRenderProxyExtractor;
  cache: FineGrainedCacheStore | null;
  dependencyHashes: Record<string, string>;
  emit: (
    eventType: MediaEventType,
    extra?: Omit<
      CreateMediaEventInput,
      "eventType" | "occurredAt" | "episodeId" | "mediaId" | "mediaSourceId"
    >,
  ) => void;
  now: () => string;
  executionId: string;
}): MaterializeRenderProxyResult => {
  const {repoRoot, episodeId, segmentId, clipId, analysisSource} = input;
  const extension = renderProxyExtensionForMediaType(analysisSource.mediaType);
  const proxyIdentityKey = buildMediaRenderProxyIdentityKey({
    episodeId,
    segmentId,
    clipId,
    sourceSha256: input.sourceSha256,
    analysisSourceSha256: analysisSource.sha256,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
    extractorId: input.extractor.id,
    extractorVersion: input.extractor.version,
    dependencyHashes: input.dependencyHashes,
  });
  const shotKey = buildMediaRenderShotKey({
    episodeId,
    segmentId,
    clipId,
    sourceSha256: input.sourceSha256,
    analysisSourceSha256: analysisSource.sha256,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
    transform: input.transform,
    timelineSha256: input.timelineSha256,
    fps: input.fps,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    layoutVariant: input.layoutVariant,
    extractorId: input.extractor.id,
    extractorVersion: input.extractor.version,
    dependencyHashes: input.dependencyHashes,
  });
  const artifactId = `${episodeId}:media-render-proxy:${segmentId.replace(/[^a-z0-9-]/gu, "-")}`;
  const staticFilePath = mediaRenderPublicPath(episodeId, segmentId, extension);
  const repositoryPath = mediaRenderProxyRepositoryPath(episodeId, segmentId, extension);
  const cacheMetadata = {
    schemaVersion: "media-render-cache-metadata-v1",
    episodeId,
    segmentId,
    clipId,
    cacheKey: shotKey,
    proxyIdentityKey,
    artifactId,
    mediaType: analysisSource.mediaType,
    staticFilePath,
    sourceSha256: input.sourceSha256,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
    timelineSha256: input.timelineSha256,
  };
  const dependencies = dedupeDependencies([...readDependencies([analysisSource.artifactRef])]);
  const producer = `${MEDIA_RENDER_TOOL_VERSION}:proxy:${input.extractor.id}:${input.extractor.version}`;

  const publishProxyBytes = (bytes: Uint8Array): ArtifactRef => {
    const filePath = resolveMediaRepositoryPath(repoRoot, repositoryPath);
    copyBytesAtomically(filePath, Buffer.from(bytes));
    const ref = buildArtifactRef({
      repoRoot,
      artifactId,
      episodeId,
      path: repositoryPath,
      mediaType: analysisSource.mediaType,
      schemaVersion: MEDIA_RENDER_PROXY_SCHEMA_VERSION,
      producer,
      createdAt: input.now(),
    });
    registerMediaRenderCandidate({
      repoRoot,
      episodeId,
      ref,
      executionId: input.executionId,
      dependencies,
    });
    // Hash-verified copy for Remotion `staticFile`.
    const publicAbsolute = path.resolve(
      repoRoot,
      mediaRenderPublicDirectoryRepositoryPath(episodeId),
    );
    fs.mkdirSync(publicAbsolute, {recursive: true});
    copyBytesAtomically(path.join(publicAbsolute, `${segmentId}.${extension}`), Buffer.from(bytes));
    return ref;
  };

  if (input.cache) {
    const looked = input.cache.lookup({
      kind: "media-render" as CacheKind,
      cacheKey: shotKey,
      stage: "media-render",
      logicalItem: `${episodeId}:${segmentId}:${clipId}`,
      validateMetadata: (value) => {
        const parsed = z
          .object({
            schemaVersion: z.literal("media-render-cache-metadata-v1"),
            episodeId: episodeIdSchema,
            segmentId: z.string().min(1),
            clipId: z.string().min(1),
            cacheKey: sha256Schema,
            proxyIdentityKey: sha256Schema,
            artifactId: z.string().min(1),
            mediaType: z.string().min(1),
            staticFilePath: z.string().min(1),
            sourceSha256: sha256Schema,
            trimStartMs: z.number().int().nonnegative(),
            trimEndMs: z.number().int().positive(),
            timelineSha256: sha256Schema,
          })
          .strict()
          .parse(value);
        if (
          parsed.episodeId !== episodeId ||
          parsed.segmentId !== segmentId ||
          parsed.clipId !== clipId ||
          parsed.cacheKey !== shotKey ||
          parsed.proxyIdentityKey !== proxyIdentityKey ||
          parsed.artifactId !== artifactId ||
          parsed.mediaType !== analysisSource.mediaType ||
          parsed.staticFilePath !== staticFilePath ||
          parsed.sourceSha256 !== input.sourceSha256 ||
          parsed.trimStartMs !== input.trimStartMs ||
          parsed.trimEndMs !== input.trimEndMs ||
          parsed.timelineSha256 !== input.timelineSha256
        ) {
          throw new Error("media render cache metadata mismatch");
        }
        return parsed;
      },
    });
    if (looked.hit) {
      const ref = publishProxyBytes(looked.bytes);
      input.emit("media.render.cache.hit", {
        cacheKey: shotKey,
        sha256: ref.sha256,
        sizeBytes: ref.sizeBytes,
        mediaType: analysisSource.mediaType,
        clipId,
        segmentId,
        shotId: `${episodeId}:media-shot:${segmentId}`,
        renderProxyRef: ref,
        reason: "proxy:cache-hit",
      });
      return {
        ref,
        staticFilePath,
        mediaType: analysisSource.mediaType,
        cacheHit: true,
        proxyIdentityKey,
      };
    }
    input.emit("media.render.cache.miss", {
      cacheKey: shotKey,
      clipId,
      segmentId,
      shotId: `${episodeId}:media-shot:${segmentId}`,
      reason: `proxy:${looked.reason}`,
    });
  }

  const temporaryOutput = resolveMediaRepositoryPath(
    repoRoot,
    `${mediaTmpRepositoryPath(episodeId)}/render-${process.pid}-${crypto.randomBytes(6).toString("hex")}.${extension}`,
  );
  fs.mkdirSync(path.dirname(temporaryOutput), {recursive: true});
  try {
    input.extractor.extract({
      inputPath: resolveMediaRepositoryPath(repoRoot, analysisSource.artifactRef.path),
      startMs: input.trimStartMs,
      endMs: input.trimEndMs,
      outputPath: temporaryOutput,
      mediaType: analysisSource.mediaType,
    });
    const bytes = fs.readFileSync(temporaryOutput);
    const ref = publishProxyBytes(bytes);
    if (input.cache) {
      input.cache.put({
        kind: "media-render" as CacheKind,
        cacheKey: shotKey,
        stage: "media-render",
        logicalItem: `${episodeId}:${segmentId}:${clipId}`,
        mediaType: analysisSource.mediaType,
        bytes,
        metadata: cacheMetadata,
      });
    }
    return {
      ref,
      staticFilePath,
      mediaType: analysisSource.mediaType,
      cacheHit: false,
      proxyIdentityKey,
    };
  } finally {
    if (fs.existsSync(temporaryOutput)) {
      fs.rmSync(temporaryOutput, {force: true});
    }
  }
};

/* ------------------------------------------------------------------------- *
 * Readers (artifact bytes remain the source of truth)
 * ------------------------------------------------------------------------- */

export const readMediaShot = (
  repoRoot: string,
  episodeId: string,
  segmentId: string,
): MediaShot => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaShotRepositoryPath(episodeId, segmentId),
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_RENDER_SHOT_MISSING:${segmentId}`);
  }
  const parsed = mediaShotSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  if (parsed.episodeId !== episodeId || parsed.segmentId !== segmentId) {
    throw new Error(`MEDIA_RENDER_SHOT_ARTIFACT_MISMATCH:${segmentId}`);
  }
  // Embedded ref must be self-consistent (hash of the body without artifactRef).
  const bodyWithoutArtifactRef = {...parsed};
  Reflect.deleteProperty(bodyWithoutArtifactRef, "artifactRef");
  if (
    sha256Bytes(Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8")) !==
    parsed.artifactRef.sha256
  ) {
    throw new Error(`MEDIA_RENDER_SHOT_TAMPERED:${segmentId}`);
  }
  return parsed;
};

export const readMediaRenderPlan = (repoRoot: string, episodeId: string): MediaRenderPlan => {
  const filePath = resolveMediaRepositoryPath(repoRoot, mediaRenderPlanRepositoryPath(episodeId));
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_RENDER_PLAN_MISSING:${episodeId}`);
  }
  const parsed = mediaRenderPlanSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
  );
  if (parsed.episodeId !== episodeId) {
    throw new Error(`MEDIA_RENDER_PLAN_EPISODE_MISMATCH:${parsed.episodeId}:${episodeId}`);
  }
  return parsed;
};

/* ------------------------------------------------------------------------- *
 * Render authorization gate (fail-closed, re-run before every render)
 * ------------------------------------------------------------------------- */

const wrapGateError = (stage: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`MEDIA_RENDER_${stage}:${message}`);
};

/**
 * The artifact registry binds the EXTERNAL ref (hash of the persisted file
 * bytes); the embedded `artifactRef` inside an artifact body is the content
 * hash of the body without the self-reference and therefore differs. This
 * gate therefore checks that the CURRENT file bytes of an artifact are
 * registered under its artifactId at its recorded path — fail-closed on
 * missing, stale, or unregistered bytes.
 */
const assertArtifactRegisteredBytes = (input: {
  repoRoot: string;
  episodeId: string;
  artifactId: string;
  path: string;
  error: "SHOT" | "SLOT" | "PLAN";
}): void => {
  const {repoRoot, episodeId, artifactId, path: repositoryPath, error} = input;
  const filePath = resolveMediaRepositoryPath(repoRoot, repositoryPath);
  let stat: fs.Stats;
  let sha: string;
  try {
    stat = fs.statSync(filePath);
    sha = sha256File(filePath);
  } catch (gateError) {
    throw wrapGateError(`${error}_TAMPERED`, gateError);
  }
  const indexPath = path.resolve(repoRoot, `content/${episodeId}/artifact-index.json`);
  if (!fs.existsSync(indexPath)) {
    throw new Error(`MEDIA_RENDER_${error}_NOT_REGISTERED:${artifactId}`);
  }
  const index = readArtifactIndex(indexPath);
  const registeredRecords = index.artifacts.filter(
    (record) => record.ref.artifactId === artifactId,
  );
  if (registeredRecords.length === 0) {
    throw new Error(`MEDIA_RENDER_${error}_NOT_REGISTERED:${artifactId}`);
  }
  const registered = registeredRecords.some(
    (record) =>
      record.ref.path === repositoryPath &&
      record.ref.sha256 === sha &&
      record.ref.sizeBytes === stat.size,
  );
  if (!registered) {
    // The artifact was registered at some point, but its current bytes bind
    // no registered ref — the file was modified (or superseded) → tampered.
    throw new Error(`MEDIA_RENDER_${error}_TAMPERED:${artifactId}`);
  }
};

/**
 * The M5.08 render gate. Real media may enter the renderer only when ALL of
 * the following hold; any single failure fails closed with `MEDIA_RENDER_*`:
 *
 * - the `media-shot-v1` artifact is registered and its bytes bind its hash;
 * - the M5.07 slot is registered, hash-valid, still `real-media`, and names
 *   the same clip + verification as the shot;
 * - `assertMediaClipVerified` PASS (verdict pass + current admission/rights
 *   re-read + retrieval/index/media bytes hash-valid + episode isolation);
 * - the trim window is legal: inside the VLM-recommended range, inside the
 *   media duration, and end > start;
 * - the lineage chain is consistent: clip → verification → ClipIndex (still
 *   current) → original MediaAsset (bytes unchanged) → source timestamps;
 * - the render proxy artifact is registered + hash-valid, and its public
 *   `staticFile` copy binds the same bytes;
 * - audio gains are normalized (sum ≤ 1) and fallback shots carry no media.
 */
export const assertMediaShotRenderable = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
}): MediaShot => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId, segmentId} = input;
  const shot = readMediaShot(repoRoot, episodeId, segmentId);
  assertArtifactRegisteredBytes({
    repoRoot,
    episodeId,
    artifactId: shot.artifactRef.artifactId,
    path: shot.artifactRef.path,
    error: "SHOT",
  });

  if (shot.visualType === "real-media") {
    if (!shot.selectedMediaClipRef || !shot.verificationRef || !shot.lineage || !shot.trim) {
      throw new Error(`MEDIA_RENDER_SHOT_INCOMPLETE:${segmentId}`);
    }
    // 1. M5.07 slot gate.
    let slot: VisualSlot;
    try {
      slot = readVisualSlot(repoRoot, episodeId, segmentId);
    } catch (error) {
      throw wrapGateError("SLOT_MISSING", error);
    }
    if (slot.selectedType !== "real-media" || !slot.selectedMediaClipRef) {
      throw new Error(`MEDIA_RENDER_SLOT_NOT_REAL_MEDIA:${segmentId}`);
    }
    if (slot.selectedMediaClipRef.clipId !== shot.selectedMediaClipRef.clipId) {
      throw new Error(`MEDIA_RENDER_SLOT_CLIP_MISMATCH:${segmentId}`);
    }
    if (!slot.verificationRef || slot.verificationRef.sha256 !== shot.verificationRef.sha256) {
      throw new Error(`MEDIA_RENDER_SLOT_VERIFICATION_MISMATCH:${segmentId}`);
    }
    assertArtifactRegisteredBytes({
      repoRoot,
      episodeId,
      artifactId: slot.artifactRef.artifactId,
      path: slot.artifactRef.path,
      error: "SLOT",
    });

    // 2. M5.06 authorization gate (re-reads rights/admission + every hash).
    let verification: MediaVerification;
    try {
      verification = assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId,
        clipId: shot.selectedMediaClipRef.clipId,
        verificationRef: shot.verificationRef,
      });
    } catch (error) {
      throw wrapGateError("CLIP_GATE_FAILED", error);
    }

    // 3. Timestamps legal.
    if (
      shot.trim.startMs < verification.recommendedStartMs ||
      shot.trim.endMs > verification.recommendedEndMs ||
      shot.trim.endMs <= shot.trim.startMs
    ) {
      throw new Error(`MEDIA_RENDER_TRIM_OUT_OF_BOUNDS:${segmentId}`);
    }
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const asset = manifest.assets.find(
      (candidate) => candidate.mediaId === shot.selectedMediaClipRef?.mediaId,
    );
    if (!asset) {
      throw new Error(`MEDIA_RENDER_ASSET_UNKNOWN:${shot.selectedMediaClipRef.mediaId}`);
    }
    if (
      asset.durationMs !== null &&
      shot.trim.endMs > asset.durationMs + MEDIA_DURATION_ROUNDING_TOLERANCE_MS
    ) {
      throw new Error(`MEDIA_RENDER_TRIM_OUT_OF_BOUNDS:${segmentId}`);
    }

    // 4. Lineage chain consistency.
    if (
      shot.lineage.sourceMediaId !== asset.mediaId ||
      shot.lineage.sourceMediaRef.sha256 !== asset.artifactRef.sha256 ||
      shot.lineage.sourceSha256 !== asset.sha256
    ) {
      throw new Error(`MEDIA_RENDER_LINEAGE_MISMATCH:${segmentId}`);
    }
    if (
      shot.lineage.verificationRef.sha256 !== shot.verificationRef.sha256 ||
      shot.lineage.clipArtifactRef.sha256 !== verification.clipArtifactRef.sha256
    ) {
      throw new Error(`MEDIA_RENDER_LINEAGE_MISMATCH:${segmentId}`);
    }
    // The CUT SOURCE (normalized proxy preferred) is a key artifact: the
    // render proxy bytes were cut from it, so it must be registered,
    // byte-hash-valid, and (when it is a proxy) still anchored to the
    // original media it was derived from.
    if (
      shot.lineage.cutSourceRef.episodeId !== episodeId ||
      !artifactRefIsIndexed(repoRoot, shot.lineage.cutSourceRef)
    ) {
      throw new Error(`MEDIA_RENDER_CUT_SOURCE_NOT_REGISTERED:${segmentId}`);
    }
    try {
      assertArtifactRefBytes(repoRoot, shot.lineage.cutSourceRef);
    } catch (error) {
      throw wrapGateError("CUT_SOURCE_TAMPERED", error);
    }
    if (shot.lineage.cutSourceRef.artifactId !== shot.lineage.sourceMediaId) {
      const cutAsset = manifest.assets.find(
        (candidate) => candidate.mediaId === shot.lineage!.cutSourceRef.artifactId,
      );
      if (
        !cutAsset ||
        cutAsset.kind !== "proxy" ||
        !cutAsset.derivedFromMediaRef ||
        cutAsset.derivedFromMediaRef.sha256 !== asset.sha256
      ) {
        throw new Error(`MEDIA_RENDER_CUT_SOURCE_STALE:${segmentId}`);
      }
    }
    const status = readMediaUnderstandingStatus(repoRoot, episodeId, asset.mediaId);
    const indexRef = status?.stages["clip-index"]?.ref;
    if (!indexRef || indexRef.sha256 !== shot.lineage.clipIndexRef.sha256) {
      throw new Error(`MEDIA_RENDER_INDEX_STALE:${segmentId}`);
    }
    if (!artifactRefIsIndexed(repoRoot, shot.lineage.clipIndexRef)) {
      throw new Error(`MEDIA_RENDER_INDEX_NOT_REGISTERED:${segmentId}`);
    }

    // 5. Render proxy bytes + public static copy.
    if (!shot.renderProxyRef) {
      throw new Error(`MEDIA_RENDER_PROXY_MISSING:${segmentId}`);
    }
    if (!artifactRefIsIndexed(repoRoot, shot.renderProxyRef)) {
      throw new Error(`MEDIA_RENDER_PROXY_NOT_REGISTERED:${segmentId}`);
    }
    try {
      assertArtifactRefBytes(repoRoot, shot.renderProxyRef);
    } catch (error) {
      throw wrapGateError("PROXY_TAMPERED", error);
    }
    if (!shot.staticFilePath) {
      throw new Error(`MEDIA_RENDER_STATIC_PATH_INVALID:${segmentId}`);
    }
    const publicAbsolute = path.resolve(repoRoot, "public", shot.staticFilePath);
    if (!fs.existsSync(publicAbsolute)) {
      throw new Error(`MEDIA_RENDER_STATIC_COPY_MISSING:${segmentId}`);
    }
    if (sha256File(publicAbsolute) !== shot.renderProxyRef.sha256) {
      throw new Error(`MEDIA_RENDER_STATIC_COPY_TAMPERED:${segmentId}`);
    }
    if (shot.evidenceImagePath || shot.evidenceImageSha256 || shot.evidenceImageAssetId) {
      if (!shot.evidenceImagePath || !shot.evidenceImageSha256 || !shot.evidenceImageAssetId) {
        throw new Error(`MEDIA_RENDER_EVIDENCE_IMAGE_MISSING:${segmentId}`);
      }
      const evidenceAbsolute = path.resolve(repoRoot, "public", shot.evidenceImagePath);
      const editorial = readApprovedEditorialStill(repoRoot, episodeId, segmentId);
      if (
        !editorial ||
        editorial.id !== shot.evidenceImageAssetId ||
        !fs.existsSync(evidenceAbsolute) ||
        sha256File(evidenceAbsolute) !== shot.evidenceImageSha256 ||
        sha256File(path.resolve(repoRoot, editorial.path)) !== shot.evidenceImageSha256
      ) {
        throw new Error(`MEDIA_RENDER_EVIDENCE_IMAGE_TAMPERED:${segmentId}`);
      }
    }
  } else {
    if (
      shot.selectedMediaClipRef !== null ||
      shot.verificationRef !== null ||
      shot.lineage !== null ||
      shot.trim !== null ||
      shot.renderProxyRef !== null ||
      shot.staticFilePath !== null ||
      shot.renderProxyMediaType !== null
    ) {
      throw new Error(`MEDIA_RENDER_FALLBACK_WITH_MEDIA:${segmentId}`);
    }
    if (!shot.fallbackReason) {
      throw new Error(`MEDIA_RENDER_FALLBACK_REASON_MISSING:${segmentId}`);
    }
    if (shot.audio.originalAudioGain !== 0) {
      throw new Error(`MEDIA_RENDER_FALLBACK_AUDIO_INVALID:${segmentId}`);
    }
    if (shot.visualType === "official-screenshot") {
      if (!shot.fallbackImagePath || !shot.fallbackImageSha256 || !shot.fallbackImageAssetId) {
        throw new Error(`MEDIA_RENDER_FALLBACK_IMAGE_MISSING:${segmentId}`);
      }
      const publicAbsolute = path.resolve(repoRoot, "public", shot.fallbackImagePath);
      if (!fs.existsSync(publicAbsolute)) {
        throw new Error(`MEDIA_RENDER_FALLBACK_IMAGE_MISSING:${segmentId}`);
      }
      const publicSha = sha256File(publicAbsolute);
      if (publicSha !== shot.fallbackImageSha256) {
        throw new Error(`MEDIA_RENDER_FALLBACK_IMAGE_TAMPERED:${segmentId}`);
      }
      const editorial = readApprovedEditorialStill(repoRoot, episodeId, segmentId);
      if (editorial?.id === shot.fallbackImageAssetId) {
        const sourceAbsolute = path.resolve(repoRoot, editorial.path);
        if (!fs.existsSync(sourceAbsolute) || sha256File(sourceAbsolute) !== publicSha) {
          throw new Error(`MEDIA_RENDER_FALLBACK_IMAGE_TAMPERED:${segmentId}`);
        }
      } else {
        const asset = listOfficialScreenshotAssets(repoRoot, episodeId).find(
          (candidate) =>
            candidate.mediaId === shot.fallbackImageAssetId && candidate.sha256 === publicSha,
        );
        if (!asset) {
          throw new Error(`MEDIA_RENDER_FALLBACK_IMAGE_UNBOUND:${segmentId}`);
        }
        try {
          assertArtifactRefBytes(repoRoot, asset.artifactRef);
        } catch (error) {
          throw wrapGateError("FALLBACK_IMAGE_TAMPERED", error);
        }
      }
    }
  }
  if (shot.audio.originalAudioGain + shot.audio.narrationGain > 1 + 1e-9) {
    throw new Error(`MEDIA_RENDER_AUDIO_OVER_GAIN:${segmentId}`);
  }
  return shot;
};

export const isMediaShotRenderable = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
}): boolean => {
  try {
    assertMediaShotRenderable(input);
    return true;
  } catch {
    return false;
  }
};

/**
 * Authorizes the full render plan right before Remotion runs: the plan
 * artifact must be registered + hash-valid, it must bind the CURRENT
 * production timeline bytes, and every shot must pass its render gate.
 */
export const assertMediaRenderPlanRenderable = (input: {
  repoRoot: string;
  episodeId: string;
}): MediaRenderPlan => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const plan = readMediaRenderPlan(repoRoot, episodeId);
  assertArtifactRegisteredBytes({
    repoRoot,
    episodeId,
    artifactId: plan.artifactRef.artifactId,
    path: plan.artifactRef.path,
    error: "PLAN",
  });
  const timelinePath = path.resolve(repoRoot, `content/${episodeId}/production/timeline.json`);
  if (!fs.existsSync(timelinePath)) {
    throw new Error(`MEDIA_RENDER_TIMELINE_MISSING:${episodeId}`);
  }
  if (sha256File(timelinePath) !== plan.timelineSha256) {
    throw new Error(`MEDIA_RENDER_TIMELINE_STALE:${episodeId}`);
  }
  for (const shot of plan.shots) {
    assertMediaShotRenderable({repoRoot, episodeId, segmentId: shot.segmentId});
  }
  return plan;
};

/**
 * Last Node gate before Remotion: re-authorize the registered plan and require
 * the public projection bytes to match the registered ArtifactRefs.
 */
export const assertMediaMixReadyToRender = (input: {
  repoRoot: string;
  episodeId: string;
}): MediaRenderPlan => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const plan = assertMediaRenderPlanRenderable({repoRoot, episodeId});
  const publicDir = path.resolve(repoRoot, mediaRenderPublicDirectoryRepositoryPath(episodeId));
  const publicPlanPath = path.join(publicDir, "render-plan.json");
  if (!fs.existsSync(publicPlanPath)) {
    throw new Error(`MEDIA_RENDER_PUBLIC_PLAN_MISSING:${episodeId}`);
  }
  const registeredPlanPath = resolveMediaRepositoryPath(repoRoot, plan.artifactRef.path);
  if (sha256File(publicPlanPath) !== sha256File(registeredPlanPath)) {
    throw new Error(`MEDIA_RENDER_PUBLIC_PLAN_TAMPERED:${episodeId}`);
  }
  const publicTimelinePath = path.join(publicDir, "timeline.json");
  if (!fs.existsSync(publicTimelinePath)) {
    throw new Error(`MEDIA_RENDER_PUBLIC_TIMELINE_MISSING:${episodeId}`);
  }
  if (sha256File(publicTimelinePath) !== plan.timelineSha256) {
    throw new Error(`MEDIA_RENDER_PUBLIC_TIMELINE_TAMPERED:${episodeId}`);
  }
  return plan;
};

/* ------------------------------------------------------------------------- *
 * Shot plan builder
 * ------------------------------------------------------------------------- */

const DEFAULT_TRANSFORM: MediaShotTransform = {
  reframe: {mode: "cover", crop: {x: 0, y: 0, width: 1, height: 1}},
  scale: 1,
  position: {x: 0, y: 0},
  zoomPan: {
    type: "none",
    start: {zoom: 1, x: 0, y: 0},
    end: {zoom: 1, x: 0, y: 0},
  },
  pip: null,
  freezeFrameMs: null,
};

const REAL_MEDIA_DEFAULT_AUDIO: Omit<MediaShotAudio, "originalAudioGain" | "narrationGain"> = {
  ducking: {enabled: true, reductionDb: 10, attackMs: 80, releaseMs: 240},
  fadeInMs: 0,
  fadeOutMs: 0,
};

const FALLBACK_DEFAULT_AUDIO: MediaShotAudio = {
  originalAudioGain: 0,
  narrationGain: 1,
  ducking: {enabled: false, reductionDb: 0, attackMs: 0, releaseMs: 0},
  fadeInMs: 0,
  fadeOutMs: 0,
};

const DEFAULT_FADE = {inMs: 200, outMs: 200};

const readApprovedEditorialStill = (
  repoRoot: string,
  episodeId: string,
  segmentId: string,
): Asset | null => {
  const manifestPath = path.resolve(
    repoRoot,
    `content/${episodeId}/production/asset-manifest.json`,
  );
  if (!fs.existsSync(manifestPath)) return null;
  const assets = z
    .array(assetSchema)
    .parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown);
  return (
    assets.find(
      (asset) =>
        asset.approved &&
        asset.usedInRender &&
        (asset.type === "screenshot" || asset.type === "image") &&
        asset.segmentIds?.includes(segmentId),
    ) ?? null
  );
};

type ProjectedOfficialStill = {
  publicPath: string;
  sha256: string;
  assetId: string;
};

/**
 * Projects the segment-bound approved editorial still, or the legacy admitted
 * MediaAsset fallback, into `public/episodes/<ep>/media/`.
 */
const projectOfficialScreenshotPath = (
  repoRoot: string,
  episodeId: string,
  segmentId: string,
): ProjectedOfficialStill => {
  const editorial = readApprovedEditorialStill(repoRoot, episodeId, segmentId);
  const mediaAsset = editorial ? null : findOfficialScreenshotAsset(repoRoot, episodeId);
  if (!editorial && !mediaAsset) {
    throw new Error(`MEDIA_RENDER_OFFICIAL_SCREENSHOT_MISSING:${episodeId}:${segmentId}`);
  }
  const sourcePath = editorial
    ? path.resolve(repoRoot, editorial.path)
    : resolveMediaRepositoryPath(repoRoot, mediaAsset!.artifactRef.path);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`MEDIA_RENDER_OFFICIAL_SCREENSHOT_MISSING:${episodeId}:${segmentId}`);
  }
  if (mediaAsset) assertArtifactRefBytes(repoRoot, mediaAsset.artifactRef);
  const sourceSha256 = sha256File(sourcePath);
  if (mediaAsset && sourceSha256 !== mediaAsset.sha256) {
    throw new Error(`MEDIA_RENDER_OFFICIAL_SCREENSHOT_TAMPERED:${episodeId}:${segmentId}`);
  }
  const filename = path.posix.basename(sourcePath);
  const publicRelative = `episodes/${episodeId}/media/${filename}`;
  const publicAbsolute = path.resolve(repoRoot, "public", publicRelative);
  copyBytesAtomically(publicAbsolute, fs.readFileSync(sourcePath));
  if (sha256File(publicAbsolute) !== sourceSha256) {
    throw new Error(`MEDIA_RENDER_OFFICIAL_SCREENSHOT_TAMPERED:${episodeId}:${segmentId}`);
  }
  return {
    publicPath: publicRelative,
    sha256: sourceSha256,
    assetId: editorial?.id ?? mediaAsset!.mediaId,
  };
};

const defaultOverlays = (): MediaShotOverlays => ({
  sourceLabel: null,
  badge: null,
  captionsEnabled: true,
});

export type BuildMediaShotInput = {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  timeline: Timeline;
  timelineSha256: string;
  config?: Omit<MediaRenderConfig, "timelineSha256">;
  transform?: Partial<MediaShotTransform>;
  audio?: Partial<Omit<MediaShotAudio, "ducking">> & {ducking?: Partial<MediaShotDucking>};
  overlays?: Partial<MediaShotOverlays>;
  fade?: {inMs?: number; outMs?: number};
  crossfadeMs?: number;
  /** Explicit trim window; defaults to the VLM-recommended range. */
  trimStartMs?: number;
  trimEndMs?: number;
  cache?: FineGrainedCacheStore | null;
  cacheDependencyHashes?: Record<string, string>;
  proxyExtractor?: MediaRenderProxyExtractor;
  eventSink?: MediaEventSink;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export type BuildMediaShotOutcome = {
  /** Hash-bound ArtifactRef of the persisted `media-shot-v1` artifact. */
  artifactRef: ArtifactRef;
  status: "ready";
  episodeId: string;
  segmentId: string;
  visualType: VisualSlotSelectedType;
  cacheHit: boolean;
  proxyIdentityKey: string | null;
};

const deepMergeTransform = (
  base: MediaShotTransform,
  override: Partial<MediaShotTransform> | undefined,
): MediaShotTransform => {
  if (!override) return base;
  return mediaShotTransformSchema.parse({
    ...base,
    ...override,
    reframe: {...base.reframe, ...override.reframe},
    position: {...base.position, ...override.position},
    zoomPan: {
      ...base.zoomPan,
      ...override.zoomPan,
      start: {...base.zoomPan.start, ...override.zoomPan?.start},
      end: {...base.zoomPan.end, ...override.zoomPan?.end},
    },
    pip: override.pip === undefined ? base.pip : override.pip,
    freezeFrameMs:
      override.freezeFrameMs === undefined ? base.freezeFrameMs : override.freezeFrameMs,
  });
};

export const buildMediaShotForSegment = (input: BuildMediaShotInput): BuildMediaShotOutcome => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId, segmentId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});
  const shotId = `${episodeId}:media-shot:${segmentId}`;

  const emit = (
    eventType: MediaEventType,
    extra: Omit<
      CreateMediaEventInput,
      "eventType" | "occurredAt" | "episodeId" | "mediaId" | "mediaSourceId"
    > = {},
  ): void => {
    eventSink(
      createMediaEvent({
        eventType,
        occurredAt: now(),
        episodeId,
        mediaId: `${episodeId}:media:render`,
        mediaSourceId: `${episodeId}:media-source:render`,
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        segmentId,
        shotId,
        ...extra,
      }),
    );
  };

  emit("media.render.started", {});
  try {
    const scene = input.timeline.scenes.find((candidate) => candidate.id === segmentId);
    if (!scene) {
      throw new Error(`MEDIA_RENDER_SCENE_MISSING:${segmentId}`);
    }
    const config = mediaRenderConfigSchema.parse({
      version: MEDIA_RENDER_CONFIG_VERSION,
      canvas: input.config?.canvas ?? {width: 1080, height: 1920},
      fps: input.config?.fps ?? input.timeline.fps,
      timelineSha256: input.timelineSha256,
      layoutVariant: input.config?.layoutVariant ?? input.timeline.layoutVariant,
      proxyExtractor:
        input.config?.proxyExtractor ??
        (input.proxyExtractor
          ? {id: input.proxyExtractor.id, version: input.proxyExtractor.version}
          : {id: "ffmpeg", version: "ffmpeg-render-proxy-v1"}),
    });

    // Slot (M5.07) — missing file may fall back; a present but invalid slot fails closed.
    let slot: VisualSlot | null = null;
    try {
      slot = readVisualSlot(repoRoot, episodeId, segmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("MEDIA_SELECT_SLOT_MISSING:")) {
        slot = null;
      } else {
        throw wrapGateError("SLOT_TAMPERED", error);
      }
    }
    const reasons: string[] = [
      `scene ${scene.id} at frame ${scene.startFrame} (${scene.durationFrames} frames, ${config.fps} fps)`,
    ];

    let visualType: VisualSlotSelectedType;
    let selectedMediaClipRef: MediaClipRef | null = null;
    let verificationRef: ArtifactRef | null = null;
    let trim: {startMs: number; endMs: number} | null = null;
    let lineage: MediaShotLineage | null = null;
    let renderProxyRef: ArtifactRef | null = null;
    let staticFilePath: string | null = null;
    let renderProxyMediaType: string | null = null;
    let cacheHit = false;
    let proxyIdentityKey: string | null = null;
    const gate: MediaShotGate = {
      slotValid: slot !== null,
      clipVerified: false,
      rightsApproved: false,
      hashesValid: true,
      episodeIsolated: true,
      timestampsValid: false,
    };
    let audio: MediaShotAudio = FALLBACK_DEFAULT_AUDIO;

    if (
      slot &&
      slot.selectedType === "real-media" &&
      slot.selectedMediaClipRef &&
      slot.verificationRef
    ) {
      visualType = "real-media";
      // Full M5.06 authorization (re-reads rights/admission + every hash).
      let verification: MediaVerification;
      try {
        verification = assertMediaClipVerified({
          repoRoot,
          episodeId,
          segmentId,
          clipId: slot.selectedMediaClipRef.clipId,
          verificationRef: slot.verificationRef,
        });
      } catch (error) {
        throw wrapGateError("CLIP_GATE_FAILED", error);
      }
      // Default trim = the VLM-recommended window; overrides must stay inside it.
      const trimStartMs = input.trimStartMs ?? verification.recommendedStartMs;
      const trimEndMs = input.trimEndMs ?? verification.recommendedEndMs;
      if (
        trimStartMs < verification.recommendedStartMs ||
        trimEndMs > verification.recommendedEndMs ||
        trimEndMs <= trimStartMs
      ) {
        throw new Error(`MEDIA_RENDER_TRIM_OUT_OF_BOUNDS:${segmentId}`);
      }
      trim = {startMs: trimStartMs, endMs: trimEndMs};
      const transform = deepMergeTransform(DEFAULT_TRANSFORM, input.transform);
      const freeze = transform.freezeFrameMs;
      if (freeze !== null && freeze >= trimEndMs - trimStartMs) {
        throw new Error(`MEDIA_RENDER_FREEZE_OUT_OF_BOUNDS:${segmentId}`);
      }

      // Cut source: normalized proxy preferred, original otherwise.
      const manifest = readMediaSourceManifest(repoRoot, episodeId);
      const asset = manifest.assets.find(
        (candidate) => candidate.mediaId === slot.selectedMediaClipRef!.mediaId,
      );
      if (!asset) {
        throw new Error(`MEDIA_RENDER_ASSET_UNKNOWN:${slot.selectedMediaClipRef.mediaId}`);
      }
      const proxy = manifest.assets.find(
        (candidate) => candidate.kind === "proxy" && candidate.derivedFromMediaId === asset.mediaId,
      );
      let cutSource: MediaAsset = asset;
      if (proxy) {
        if (!proxy.derivedFromMediaRef || proxy.derivedFromMediaRef.sha256 !== asset.sha256) {
          throw new Error(`MEDIA_RENDER_PROXY_STALE:${proxy.mediaId}`);
        }
        try {
          assertArtifactRefBytes(repoRoot, proxy.artifactRef);
        } catch (error) {
          throw wrapGateError("CUT_SOURCE_TAMPERED", error);
        }
        cutSource = proxy;
      }

      const dependencyHashes =
        input.cacheDependencyHashes ??
        hashExistingRepositoryFiles(repoRoot, MEDIA_RENDER_DEPENDENCY_PATHS);
      const extractor = input.proxyExtractor ?? createFfmpegRenderProxyExtractor();
      const executionId = `media-render:${segmentId}`;
      const proxyResult = materializeRenderProxy({
        repoRoot,
        episodeId,
        segmentId,
        clipId: slot.selectedMediaClipRef.clipId,
        sourceSha256: asset.sha256,
        analysisSource: cutSource,
        trimStartMs,
        trimEndMs,
        transform,
        timelineSha256: input.timelineSha256,
        fps: config.fps,
        canvasWidth: config.canvas.width,
        canvasHeight: config.canvas.height,
        layoutVariant: config.layoutVariant,
        extractor,
        cache: input.cache ?? null,
        dependencyHashes,
        emit,
        now,
        executionId,
      });
      renderProxyRef = proxyResult.ref;
      staticFilePath = proxyResult.staticFilePath;
      renderProxyMediaType = proxyResult.mediaType;
      cacheHit = proxyResult.cacheHit;
      proxyIdentityKey = proxyResult.proxyIdentityKey;

      // Lineage: shot → clip → verification → ClipIndex → MediaAsset.
      const status = readMediaUnderstandingStatus(repoRoot, episodeId, asset.mediaId);
      const indexRef = status?.stages["clip-index"]?.ref ?? null;
      if (!indexRef) {
        throw new Error(`MEDIA_RENDER_INDEX_MISSING:${asset.mediaId}`);
      }
      lineage = mediaShotLineageSchema.parse({
        clipId: slot.selectedMediaClipRef.clipId,
        sourceMediaId: asset.mediaId,
        sourceMediaRef: asset.artifactRef,
        sourceSha256: asset.sha256,
        sourceStartMs: trimStartMs,
        sourceEndMs: trimEndMs,
        // The registered EXTERNAL verification ref (the one the M5.06
        // pipeline returned and the slot anchors) — never the embedded
        // self-referential ref of the verification body.
        verificationRef: slot.verificationRef,
        clipIndexRef: indexRef,
        clipArtifactRef: verification.clipArtifactRef,
        cutSourceRef: cutSource.artifactRef,
      });
      selectedMediaClipRef = slot.selectedMediaClipRef;
      verificationRef = slot.verificationRef;
      gate.clipVerified = true;
      gate.rightsApproved = true;
      gate.timestampsValid = true;
      gate.slotValid = true;

      const rawGains = normalizeMediaShotGains({
        originalAudioGain: input.audio?.originalAudioGain ?? 0.35,
        narrationGain: input.audio?.narrationGain ?? 1,
      });
      audio = mediaShotAudioSchema.parse({
        originalAudioGain: rawGains.originalAudioGain,
        narrationGain: rawGains.narrationGain,
        ducking: {
          ...REAL_MEDIA_DEFAULT_AUDIO.ducking,
          ...input.audio?.ducking,
        },
        fadeInMs: input.audio?.fadeInMs ?? REAL_MEDIA_DEFAULT_AUDIO.fadeInMs,
        fadeOutMs: input.audio?.fadeOutMs ?? REAL_MEDIA_DEFAULT_AUDIO.fadeOutMs,
      });
      const source = getMediaSource(manifest, asset.mediaSourceId);
      if (!source) {
        throw new Error(`MEDIA_RENDER_SOURCE_UNKNOWN:${asset.mediaSourceId}`);
      }
      const overlays = mediaShotOverlaySchema.parse({
        ...defaultOverlays(),
        ...input.overlays,
      });
      const editorialStill = readApprovedEditorialStill(repoRoot, episodeId, segmentId);
      const evidenceStill = editorialStill
        ? projectOfficialScreenshotPath(repoRoot, episodeId, segmentId)
        : null;
      const dependencies = dedupeDependencies([
        ...(slot ? readDependencies([slot.artifactRef]) : []),
        ...readDependencies([
          verification.artifactRef,
          verification.clipArtifactRef,
          indexRef,
          asset.artifactRef,
          cutSource.artifactRef,
          renderProxyRef,
        ]),
        ...decisionDependencies(source),
      ]);
      reasons.push(
        `real media ${selectedMediaClipRef.clipId} trimmed ${trimStartMs}..${trimEndMs}ms ` +
          `(recommended ${verification.recommendedStartMs}..${verification.recommendedEndMs}ms)`,
      );
      reasons.push(`render proxy ${renderProxyRef.artifactId} (${renderProxyMediaType})`);
      reasons.push(
        `audio mix original ${audio.originalAudioGain} / narration ${audio.narrationGain} ` +
          `duck ${audio.ducking.enabled ? `${audio.ducking.reductionDb}dB` : "off"}`,
      );

      const bodyWithoutArtifactRef = {
        schemaVersion: MEDIA_SHOT_SCHEMA_VERSION,
        shotId,
        episodeId,
        segmentId,
        sceneIndex: scene.index,
        startFrame: scene.startFrame,
        durationFrames: scene.durationFrames,
        startSeconds: scene.startSeconds,
        endSeconds: scene.endSeconds,
        visualType,
        selectedMediaClipRef,
        verificationRef,
        fallbackType: null,
        fallbackReason: null,
        trim,
        transform,
        overlays,
        audio,
        fade: {
          inMs: input.fade?.inMs ?? DEFAULT_FADE.inMs,
          outMs: input.fade?.outMs ?? DEFAULT_FADE.outMs,
        },
        crossfadeMs: input.crossfadeMs ?? 0,
        lineage,
        renderProxyRef,
        staticFilePath,
        renderProxyMediaType,
        fallbackImagePath: null,
        fallbackImageSha256: null,
        fallbackImageAssetId: null,
        evidenceImagePath: evidenceStill?.publicPath ?? null,
        evidenceImageSha256: evidenceStill?.sha256 ?? null,
        evidenceImageAssetId: evidenceStill?.assetId ?? null,
        gate,
        config,
        reasons,
        createdAt: now(),
      };
      const contentBytes = Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8");
      const embeddedArtifactRef = artifactRefSchema.parse({
        artifactId: shotId,
        episodeId,
        path: mediaShotRepositoryPath(episodeId, segmentId),
        mediaType: "application/json",
        schemaVersion: MEDIA_SHOT_SCHEMA_VERSION,
        revision: 1,
        sha256: sha256Bytes(contentBytes),
        sizeBytes: contentBytes.byteLength,
        producer: MEDIA_RENDER_TOOL_VERSION,
        createdAt: now(),
      });
      const body = mediaShotSchema.parse({
        ...bodyWithoutArtifactRef,
        artifactRef: embeddedArtifactRef,
      });
      const bytes = Buffer.from(serializeIndexArtifact(body), "utf8");
      const ref = publishMediaShotArtifact({
        repoRoot,
        episodeId,
        segmentId,
        shotId,
        bytes,
        dependencies,
        executionId: `media-render:${segmentId}`,
        producer: MEDIA_RENDER_TOOL_VERSION,
        now,
      });
      emit("media.rendered", {
        artifactRef: ref,
        sha256: ref.sha256,
        sizeBytes: ref.sizeBytes,
        mediaType: "application/json",
        selectedType: visualType,
        reason: cacheHit ? "cache-hit" : "produced",
      });
      emit("media.render.completed", {
        artifactRef: ref,
        sha256: ref.sha256,
        sizeBytes: ref.sizeBytes,
        mediaType: "application/json",
        selectedType: visualType,
        reason: `proxy-${cacheHit ? "hit" : "miss"}`,
      });
      return {
        artifactRef: ref,
        status: "ready",
        episodeId,
        segmentId,
        visualType,
        cacheHit,
        proxyIdentityKey,
      };
    }

    // Fallback shot (official screenshot / data card / programmatic).
    const editorialStill = readApprovedEditorialStill(repoRoot, episodeId, segmentId);
    visualType =
      slot?.selectedType ?? (editorialStill ? "official-screenshot" : "programmatic-visual");
    const fallbackType: VisualSlotFallbackType | null = slot?.fallbackType ?? null;
    const fallbackReason =
      slot?.fallbackReason ??
      (editorialStill
        ? `approved editorial still selected for ${segmentId}`
        : "no visual slot artifact (media selection not run)");
    gate.slotValid = slot !== null;
    gate.hashesValid = true;
    audio = mediaShotAudioSchema.parse({
      ...FALLBACK_DEFAULT_AUDIO,
      ...(input.audio ? {narrationGain: input.audio.narrationGain ?? 1} : {}),
    });
    const overlays = mediaShotOverlaySchema.parse({
      ...defaultOverlays(),
      ...(editorialStill
        ? {
            sourceLabel: editorialStill.owner,
            badge: {
              text: editorialStill.type === "screenshot" ? "真实页面截图" : "官方素材",
              tone: "official" as const,
            },
          }
        : {}),
      ...input.overlays,
    });
    const transform = deepMergeTransform(DEFAULT_TRANSFORM, input.transform);
    const officialStill =
      visualType === "official-screenshot"
        ? projectOfficialScreenshotPath(repoRoot, episodeId, segmentId)
        : null;
    const fallbackImagePath = officialStill?.publicPath ?? null;
    const dependencies = dedupeDependencies([
      ...(slot ? readDependencies([slot.artifactRef]) : []),
    ]);
    reasons.push(`fallback ${fallbackType ?? "none"}: ${fallbackReason}`);
    reasons.push(
      `visualType ${visualType} (fixed stage order official screenshot → data card → programmatic)`,
    );

    const bodyWithoutArtifactRef = {
      schemaVersion: MEDIA_SHOT_SCHEMA_VERSION,
      shotId,
      episodeId,
      segmentId,
      sceneIndex: scene.index,
      startFrame: scene.startFrame,
      durationFrames: scene.durationFrames,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      visualType,
      selectedMediaClipRef: null,
      verificationRef: null,
      fallbackType,
      fallbackReason,
      trim: null,
      transform,
      overlays,
      audio,
      fade: {
        inMs: input.fade?.inMs ?? DEFAULT_FADE.inMs,
        outMs: input.fade?.outMs ?? DEFAULT_FADE.outMs,
      },
      crossfadeMs: input.crossfadeMs ?? 0,
      lineage: null,
      renderProxyRef: null,
      staticFilePath: null,
      renderProxyMediaType: null,
      fallbackImagePath,
      fallbackImageSha256: officialStill?.sha256 ?? null,
      fallbackImageAssetId: officialStill?.assetId ?? null,
      evidenceImagePath: null,
      evidenceImageSha256: null,
      evidenceImageAssetId: null,
      gate,
      config,
      reasons,
      createdAt: now(),
    };
    const contentBytes = Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8");
    const embeddedArtifactRef = artifactRefSchema.parse({
      artifactId: shotId,
      episodeId,
      path: mediaShotRepositoryPath(episodeId, segmentId),
      mediaType: "application/json",
      schemaVersion: MEDIA_SHOT_SCHEMA_VERSION,
      revision: 1,
      sha256: sha256Bytes(contentBytes),
      sizeBytes: contentBytes.byteLength,
      producer: MEDIA_RENDER_TOOL_VERSION,
      createdAt: now(),
    });
    const body = mediaShotSchema.parse({
      ...bodyWithoutArtifactRef,
      artifactRef: embeddedArtifactRef,
    });
    const bytes = Buffer.from(serializeIndexArtifact(body), "utf8");
    const ref = publishMediaShotArtifact({
      repoRoot,
      episodeId,
      segmentId,
      shotId,
      bytes,
      dependencies,
      executionId: `media-render:${segmentId}`,
      producer: MEDIA_RENDER_TOOL_VERSION,
      now,
    });
    emit("media.render.completed", {
      artifactRef: ref,
      sha256: ref.sha256,
      sizeBytes: ref.sizeBytes,
      mediaType: "application/json",
      selectedType: visualType,
      ...(fallbackType ? {fallbackType} : {}),
      reason: `fallback:${fallbackType ?? "programmatic"}`,
    });
    return {
      artifactRef: ref,
      status: "ready",
      episodeId,
      segmentId,
      visualType,
      cacheHit: false,
      proxyIdentityKey: null,
    };
  } catch (error) {
    emit("media.render.failed", {reason: errorMessage(error)});
    throw error;
  }
};

/* ------------------------------------------------------------------------- *
 * Render plan builder (timeline-bound projection)
 * ------------------------------------------------------------------------- */

const readEpisodeTimeline = (
  repoRoot: string,
  episodeId: string,
): {timeline: Timeline; sha256: string} => {
  const filePath = path.resolve(repoRoot, `content/${episodeId}/production/timeline.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_RENDER_TIMELINE_MISSING:${episodeId}`);
  }
  const sha256 = sha256File(filePath);
  const timeline = timelineSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  assertTimelineMatchesEpisode(timeline, episodeId);
  return {timeline, sha256};
};

export type BuildMediaRenderPlanInput = {
  repoRoot: string;
  episodeId: string;
  /** Previous selected plan, when rebuilding the same artifact identity. */
  previousArtifactRef?: ArtifactRef;
  timeline?: Timeline;
  timelineSha256?: string;
  config?: Omit<MediaRenderConfig, "timelineSha256">;
  transform?: Partial<MediaShotTransform>;
  audio?: BuildMediaShotInput["audio"];
  overlays?: Partial<MediaShotOverlays>;
  fade?: {inMs?: number; outMs?: number};
  crossfadeMs?: number;
  cache?: FineGrainedCacheStore | null;
  cacheDependencyHashes?: Record<string, string>;
  proxyExtractor?: MediaRenderProxyExtractor;
  eventSink?: MediaEventSink;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export const buildMediaRenderPlanForTimeline = (
  input: BuildMediaRenderPlanInput,
): MediaRenderPlan => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const timelinePath = path.resolve(repoRoot, `content/${episodeId}/production/timeline.json`);
  const {timeline, sha256: timelineSha256} = input.timeline
    ? {timeline: input.timeline, sha256: input.timelineSha256 ?? sha256File(timelinePath)}
    : readEpisodeTimeline(repoRoot, episodeId);
  if (input.timelineSha256 && input.timelineSha256 !== timelineSha256) {
    throw new Error(`MEDIA_RENDER_TIMELINE_STALE:${episodeId}`);
  }
  if (sha256File(timelinePath) !== timelineSha256) {
    throw new Error(`MEDIA_RENDER_TIMELINE_STALE:${episodeId}`);
  }
  assertTimelineMatchesEpisode(timeline, episodeId);

  const shots: MediaShot[] = [];
  const dependencies: ArtifactDependency[] = [];
  for (const scene of timeline.scenes) {
    const outcome = buildMediaShotForSegment({
      repoRoot,
      episodeId,
      segmentId: scene.id,
      timeline,
      timelineSha256,
      config: input.config,
      transform: input.transform,
      audio: input.audio,
      overlays: input.overlays,
      fade: input.fade,
      crossfadeMs: input.crossfadeMs,
      cache: input.cache ?? null,
      cacheDependencyHashes: input.cacheDependencyHashes,
      proxyExtractor: input.proxyExtractor,
      eventSink: input.eventSink,
      runId: input.runId,
      traceId: input.traceId,
      now,
    });
    const shot = readMediaShot(repoRoot, episodeId, scene.id);
    shots.push(shot);
    dependencies.push(...readDependencies([outcome.artifactRef]));
  }

  const config = mediaRenderConfigSchema.parse({
    version: MEDIA_RENDER_CONFIG_VERSION,
    canvas: input.config?.canvas ?? {width: 1080, height: 1920},
    fps: input.config?.fps ?? timeline.fps,
    timelineSha256,
    layoutVariant: input.config?.layoutVariant ?? timeline.layoutVariant,
    proxyExtractor:
      input.config?.proxyExtractor ??
      (input.proxyExtractor
        ? {id: input.proxyExtractor.id, version: input.proxyExtractor.version}
        : {id: "ffmpeg", version: "ffmpeg-render-proxy-v1"}),
  });
  const planId = `${episodeId}:media:render-plan`;
  const bodyWithoutArtifactRef = {
    schemaVersion: MEDIA_RENDER_PLAN_SCHEMA_VERSION,
    planId,
    episodeId,
    fps: timeline.fps,
    totalFrames: timeline.totalFrames,
    totalSeconds: timeline.totalSeconds,
    timelineSha256,
    layoutVariant: timeline.layoutVariant,
    shots,
    config,
    createdAt: now(),
  };
  const contentBytes = Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8");
  const artifactRevision = input.previousArtifactRef ? input.previousArtifactRef.revision + 1 : 1;
  const embeddedArtifactRef = artifactRefSchema.parse({
    artifactId: planId,
    episodeId,
    path: mediaRenderPlanRepositoryPath(episodeId),
    mediaType: "application/json",
    schemaVersion: MEDIA_RENDER_PLAN_SCHEMA_VERSION,
    revision: artifactRevision,
    sha256: sha256Bytes(contentBytes),
    sizeBytes: contentBytes.byteLength,
    producer: MEDIA_RENDER_TOOL_VERSION,
    createdAt: now(),
  });
  const body = mediaRenderPlanSchema.parse({
    ...bodyWithoutArtifactRef,
    artifactRef: embeddedArtifactRef,
  });
  const bytes = Buffer.from(serializeIndexArtifact(body), "utf8");
  const filePath = resolveMediaRepositoryPath(repoRoot, mediaRenderPlanRepositoryPath(episodeId));
  copyBytesAtomically(filePath, Buffer.from(bytes));
  const ref = buildArtifactRef({
    repoRoot,
    artifactId: planId,
    episodeId,
    path: mediaRenderPlanRepositoryPath(episodeId),
    mediaType: "application/json",
    schemaVersion: MEDIA_RENDER_PLAN_SCHEMA_VERSION,
    producer: MEDIA_RENDER_TOOL_VERSION,
    ...(input.previousArtifactRef ? {previous: input.previousArtifactRef} : {}),
    createdAt: now(),
  });
  registerMediaRenderCandidate({
    repoRoot,
    episodeId,
    ref,
    executionId: "media-render-plan",
    dependencies: dedupeDependencies(dependencies),
  });
  // Public copies for the generic composition (`staticFile`): the render
  // plan projection itself, the exact timeline bytes it binds, and the
  // current generated captions.
  const publicAbsolute = path.resolve(
    repoRoot,
    mediaRenderPublicDirectoryRepositoryPath(episodeId),
  );
  fs.mkdirSync(publicAbsolute, {recursive: true});
  copyBytesAtomically(path.join(publicAbsolute, "render-plan.json"), Buffer.from(bytes));
  copyBytesAtomically(path.join(publicAbsolute, "timeline.json"), fs.readFileSync(timelinePath));
  const captionsPath = path.resolve(repoRoot, generatedCaptionsPath(episodeId));
  if (!fs.existsSync(captionsPath)) {
    throw new Error(`MEDIA_RENDER_CAPTIONS_MISSING:${captionsPath}`);
  }
  copyBytesAtomically(path.join(publicAbsolute, "captions.json"), fs.readFileSync(captionsPath));
  return body;
};

/* ------------------------------------------------------------------------- *
 * Lineage resolution (rendered shot → source + timestamp)
 * ------------------------------------------------------------------------- */

export type MediaShotLineageTrace = {
  shot: {shotId: string; segmentId: string; visualType: VisualSlotSelectedType};
  clip: {clipId: string; mediaId: string; startMs: number; endMs: number} | null;
  verification: {verificationId: string; verdict: string; cacheKey: string} | null;
  clipIndex: {artifactId: string; sha256: string} | null;
  mediaAsset: {mediaId: string; sha256: string; mediaType: string} | null;
  source: {sourceId: string; publisher: string; sourceUrl: string} | null;
  /** Window in the ORIGINAL media timeline the rendered shot plays. */
  sourceTimestamp: {startMs: number; endMs: number} | null;
};

/**
 * Walks the hash-bound lineage of a rendered shot: rendered shot → selected
 * clip → verification → ClipIndex → original MediaAsset → source + timestamp.
 * Non-real-media shots resolve to a shot-only trace.
 */
export const resolveMediaShotLineage = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
}): MediaShotLineageTrace => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId, segmentId} = input;
  const shot = readMediaShot(repoRoot, episodeId, segmentId);
  const trace: MediaShotLineageTrace = {
    shot: {shotId: shot.shotId, segmentId: shot.segmentId, visualType: shot.visualType},
    clip: null,
    verification: null,
    clipIndex: null,
    mediaAsset: null,
    source: null,
    sourceTimestamp: null,
  };
  if (shot.visualType !== "real-media" || !shot.lineage || !shot.trim) {
    return trace;
  }
  const verification = readMediaVerification(repoRoot, episodeId, segmentId, shot.lineage.clipId);
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const asset = manifest.assets.find(
    (candidate) => candidate.mediaId === shot.lineage!.sourceMediaId,
  );
  if (!asset) {
    throw new Error(`MEDIA_RENDER_LINEAGE_ASSET_MISSING:${shot.lineage.sourceMediaId}`);
  }
  const source = getMediaSource(manifest, asset.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_RENDER_LINEAGE_SOURCE_MISSING:${asset.mediaSourceId}`);
  }
  return {
    shot: trace.shot,
    clip: {
      clipId: shot.lineage.clipId,
      mediaId: shot.lineage.sourceMediaId,
      startMs: shot.lineage.sourceStartMs,
      endMs: shot.lineage.sourceEndMs,
    },
    verification: {
      verificationId: verification.verificationId,
      verdict: verification.verdict,
      cacheKey: verification.cacheKey,
    },
    clipIndex: {
      artifactId: shot.lineage.clipIndexRef.artifactId,
      sha256: shot.lineage.clipIndexRef.sha256,
    },
    mediaAsset: {mediaId: asset.mediaId, sha256: asset.sha256, mediaType: asset.mediaType},
    source: {
      sourceId: source.sourceId,
      publisher: source.publisher,
      sourceUrl: source.sourceUrl,
    },
    sourceTimestamp: {startMs: shot.lineage.sourceStartMs, endMs: shot.lineage.sourceEndMs},
  };
};
