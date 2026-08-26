import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {assertSpawnSucceeded, parseFiniteNumber} from "../lib/platform/process";
import {productionContract, type ProductionContract} from "../lib/episode/production-contract";
import {assetSchema} from "../schemas/episode";
import {
  assertObservabilityComplete,
  type ObservabilityGateInput,
  type ObservabilityGateResult,
} from "../orchestration/observability-gate";
import {readMediaEvents} from "./events";
import {
  assertMediaRenderPlanRenderable,
  resolveMediaShotLineage,
  type MediaRenderPlan,
} from "./render";
import {
  assertMediaRenderManifestConsistent,
  buildMediaRenderManifest,
  projectMediaRenderManifest,
  type MediaRenderManifest,
} from "./projection";

export const MEDIA_DELIVERY_GATE_VERSION = "media-delivery-gate-v1" as const;

const verticalInspectionSchema = z
  .object({
    file: z.string().min(1),
    duration: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameRate: z.string().min(1).optional(),
    videoCodec: z.string().min(1).optional(),
    audioCodec: z.string().min(1).nullable().optional(),
    audioSampleRate: z.string().min(1).optional(),
    peakDb: z.number().optional(),
  })
  .passthrough();

export const outputInspectionSchema = z
  .object({
    inspectedAt: z.string().optional(),
    inspections: z.array(verticalInspectionSchema),
    captionInspection: z.record(z.string(), z.unknown()).optional(),
    errors: z.array(z.string()),
  })
  .passthrough();

export type OutputInspection = z.infer<typeof outputInspectionSchema>;
export type VerticalInspection = z.infer<typeof verticalInspectionSchema>;

export const readOutputInspection = (inspectionPath: string): OutputInspection => {
  if (!fs.existsSync(inspectionPath)) {
    throw new Error(`MEDIA_DELIVERY_INSPECTION_MISSING:${inspectionPath}`);
  }
  return outputInspectionSchema.parse(
    JSON.parse(fs.readFileSync(inspectionPath, "utf8")) as unknown,
  );
};

const probeJson = (
  filePath: string,
): {
  format: {duration?: string};
  streams: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    sample_rate?: string;
  }>;
} => {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
    {encoding: "utf8"},
  );
  assertSpawnSucceeded("ffprobe", ["-of", "json", filePath], result);
  return JSON.parse(result.stdout ?? "{}") as {
    format: {duration?: string};
    streams: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      sample_rate?: string;
    }>;
  };
};

export const probeVerticalMp4 = (filePath: string): VerticalInspection => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_DELIVERY_VIDEO_MISSING:${filePath}`);
  }
  const metadata = probeJson(filePath);
  const video = metadata.streams.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams.find((stream) => stream.codec_type === "audio");
  if (!video) throw new Error(`MEDIA_DELIVERY_VIDEO_STREAM_MISSING:${filePath}`);
  return {
    file: path.basename(filePath),
    duration: parseFiniteNumber(metadata.format.duration ?? "", `${filePath} 时长`),
    width: video.width ?? 0,
    height: video.height ?? 0,
    frameRate: video.r_frame_rate,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name ?? null,
    audioSampleRate: audio?.sample_rate,
  };
};

export const assertVerticalInspectionMeetsDeliveryContract = (
  inspection: VerticalInspection,
  contract: ProductionContract = productionContract,
): void => {
  const {width, height} = contract.delivery.vertical;
  if (inspection.width !== width || inspection.height !== height) {
    throw new Error(
      `MEDIA_DELIVERY_DIMENSIONS:${inspection.width}x${inspection.height} expected ${width}x${height}`,
    );
  }
  if (inspection.duration < contract.delivery.minimumSeconds) {
    throw new Error(
      `MEDIA_DELIVERY_DURATION_SHORT:${inspection.duration} < ${contract.delivery.minimumSeconds}`,
    );
  }
  if (inspection.duration > contract.delivery.hardMaximumSeconds) {
    throw new Error(
      `MEDIA_DELIVERY_DURATION_LONG:${inspection.duration} > ${contract.delivery.hardMaximumSeconds}`,
    );
  }
};

export const assertOutputInspectionMeetsDeliveryContract = (
  inspection: OutputInspection,
  contract: ProductionContract = productionContract,
): VerticalInspection => {
  if (inspection.errors.length > 0) {
    throw new Error(`MEDIA_DELIVERY_INSPECTION_ERRORS:${inspection.errors.join("; ")}`);
  }
  const vertical = inspection.inspections.find((item) => item.file.endsWith("vertical_9x16.mp4"));
  if (!vertical) throw new Error("MEDIA_DELIVERY_VERTICAL_INSPECTION_MISSING");
  assertVerticalInspectionMeetsDeliveryContract(vertical, contract);
  return vertical;
};

const terminalSuffixes = [".completed", ".failed", ".skipped"] as const;

const stagePrefixesUsedByPlan = (plan: MediaRenderPlan): string[] => {
  const prefixes = new Set<string>(["media.selection", "media.render"]);
  if (plan.shots.some((shot) => shot.visualType === "real-media")) {
    prefixes.add("media.ingest");
    prefixes.add("media.index");
    prefixes.add("media.retrieval");
    prefixes.add("media.verification");
  }
  return [...prefixes];
};

export const assertMediaPipelineObservable = (input: {
  repoRoot: string;
  episodeId: string;
}): void => {
  const events = readMediaEvents(input.repoRoot, input.episodeId);
  const plan = assertMediaRenderPlanRenderable({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
  });
  const prefixes = stagePrefixesUsedByPlan(plan);
  for (const prefix of prefixes) {
    const started = events.some((event) => event.eventType === `${prefix}.started`);
    const terminal = events.some((event) =>
      terminalSuffixes.some((suffix) => event.eventType === `${prefix}${suffix}`),
    );
    if (started && !terminal) {
      throw new Error(`MEDIA_DELIVERY_OBSERVABILITY_INCOMPLETE:${prefix}`);
    }
  }
  if (
    plan.shots.some((shot) => shot.visualType === "real-media") &&
    !events.some(
      (event) =>
        event.eventType === "media.render.completed" || event.eventType === "media.rendered",
    )
  ) {
    throw new Error("MEDIA_DELIVERY_OBSERVABILITY_RENDER_MISSING");
  }
};

export type MediaDeliveryGateInput = {
  repoRoot: string;
  episodeId: string;
  videoPath?: string;
  inspectionPath?: string;
  requireObservabilityComplete?: boolean;
  observability?: ObservabilityGateInput;
  persistProjection?: boolean;
  now?: () => string;
};

export type MediaDeliveryGateResult = {
  plan: MediaRenderPlan;
  projection: MediaRenderManifest | ReturnType<typeof projectMediaRenderManifest>;
  inspection: VerticalInspection | null;
  observability: ObservabilityGateResult | null;
};

export const assertDeclaredEditorialStillsRendered = (input: {
  repoRoot: string;
  episodeId: string;
  plan: MediaRenderPlan;
}): void => {
  const manifestPath = path.resolve(
    input.repoRoot,
    `content/${input.episodeId}/production/asset-manifest.json`,
  );
  if (!fs.existsSync(manifestPath)) return;
  const assets = z
    .array(assetSchema)
    .parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown);
  const declared = assets.filter(
    (asset) =>
      asset.approved &&
      asset.usedInRender &&
      (asset.type === "screenshot" || asset.type === "image") &&
      (asset.segmentIds?.length ?? 0) > 0,
  );
  for (const asset of declared) {
    for (const segmentId of asset.segmentIds ?? []) {
      const shot = input.plan.shots.find((candidate) => candidate.segmentId === segmentId);
      if (
        !shot ||
        shot.visualType !== "official-screenshot" ||
        shot.fallbackImageAssetId !== asset.id ||
        !shot.fallbackImageSha256
      ) {
        throw new Error(`MEDIA_DELIVERY_DECLARED_STILL_NOT_RENDERED:${asset.id}:${segmentId}`);
      }
    }
  }
};

export const assertMediaDeliveryGate = (input: MediaDeliveryGateInput): MediaDeliveryGateResult => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const plan = assertMediaRenderPlanRenderable({repoRoot, episodeId});
  assertDeclaredEditorialStillsRendered({repoRoot, episodeId, plan});
  if (input.persistProjection) {
    buildMediaRenderManifest({repoRoot, episodeId, now: input.now});
  }
  const projection = assertMediaRenderManifestConsistent({repoRoot, episodeId});

  for (const shot of plan.shots) {
    if (shot.visualType !== "real-media") continue;
    const lineage = resolveMediaShotLineage({repoRoot, episodeId, segmentId: shot.segmentId});
    if (!lineage.source || !lineage.sourceTimestamp || !lineage.mediaAsset) {
      throw new Error(`MEDIA_DELIVERY_LINEAGE_INCOMPLETE:${shot.segmentId}`);
    }
  }

  let inspection: VerticalInspection | null = null;
  if (input.inspectionPath) {
    inspection = assertOutputInspectionMeetsDeliveryContract(
      readOutputInspection(input.inspectionPath),
    );
  }
  if (input.videoPath) {
    const probed = probeVerticalMp4(input.videoPath);
    assertVerticalInspectionMeetsDeliveryContract(probed);
    inspection = probed;
  }
  if (!inspection) {
    throw new Error(`MEDIA_DELIVERY_INSPECTION_REQUIRED:${episodeId}`);
  }

  if (input.requireObservabilityComplete) {
    assertMediaPipelineObservable({repoRoot, episodeId});
  }

  let observability: ObservabilityGateResult | null = null;
  if (input.observability) {
    observability = assertObservabilityComplete(input.observability);
  }

  return {plan, projection, inspection, observability};
};
