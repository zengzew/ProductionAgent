import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {sha256Bytes, sha256File} from "../lib/platform/cache";
import {assetSchema, type Asset} from "../schemas/episode";
import {
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
import {getMediaSource, isMediaSourceAdmitted, isMediaSourceRightsApproved} from "./discovery";
import {readMediaSourceManifest} from "./manifest";
import {
  mediaRenderManifestRepositoryPath,
  mediaRenderPlanRepositoryPath,
  mediaSourceManifestRepositoryPath,
  mediaVisualSlotRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";
import {readMediaRenderPlan, resolveMediaShotLineage} from "./render";
import {readVisualSlot} from "./select";
import {serializeIndexArtifact} from "./understanding";
import {mediaClipRefSchema} from "./schemas";

export const MEDIA_RENDER_MANIFEST_SCHEMA_VERSION = "media-render-manifest-v1" as const;
export const MEDIA_RENDER_MANIFEST_TOOL_VERSION = "media-render-manifest-v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTimeSchema = z.string().datetime({offset: true});

export const mediaRenderManifestSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    publisher: z.string().min(1),
    sourceType: z.string().min(1),
    admissionStatus: z.string().min(1),
    rightsStatus: z.string().min(1),
    admitted: z.boolean(),
    rightsApproved: z.boolean(),
  })
  .strict();

export const mediaRenderManifestAssetSchema = z
  .object({
    mediaId: z.string().min(1),
    sourceId: z.string().min(1),
    kind: z.enum(["original", "proxy"]),
    sha256: sha256Schema,
    mediaType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();

export const mediaRenderManifestClipSchema = z
  .object({
    clipId: z.string().min(1),
    mediaId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    verificationSha256: sha256Schema.nullable(),
  })
  .strict();

export const mediaRenderManifestUsageSchema = z
  .object({
    segmentId: z.string().min(1),
    selectedType: z.enum([
      "real-media",
      "official-screenshot",
      "data-evidence-card",
      "programmatic-visual",
    ]),
    clipRef: mediaClipRefSchema.nullable(),
    verificationSha256: sha256Schema.nullable(),
    fallbackType: z.string().nullable(),
    fallbackReason: z.string().nullable(),
    officialAssetId: z.string().nullable(),
  })
  .strict();

export const mediaRenderManifestSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_RENDER_MANIFEST_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    sourceManifestSha256: sha256Schema.nullable(),
    assetManifestSha256: sha256Schema.nullable(),
    timelineSha256: sha256Schema,
    renderPlanSha256: sha256Schema,
    sources: z.array(mediaRenderManifestSourceSchema),
    assets: z.array(mediaRenderManifestAssetSchema),
    clips: z.array(mediaRenderManifestClipSchema),
    usage: z.array(mediaRenderManifestUsageSchema),
    officialAssets: z.array(assetSchema),
    createdAt: isoDateTimeSchema,
    artifactRef: artifactRefSchema,
  })
  .strict();

export type MediaRenderManifest = z.infer<typeof mediaRenderManifestSchema>;

const sha256OfFile = (filePath: string): string => sha256File(filePath);

const assetManifestRepositoryPath = (episodeId: string): string =>
  `content/${episodeId}/production/asset-manifest.json`;

const readOfficialAssets = (
  repoRoot: string,
  episodeId: string,
): {assets: Asset[]; sha256: string | null} => {
  const filePath = path.resolve(repoRoot, assetManifestRepositoryPath(episodeId));
  if (!fs.existsSync(filePath)) return {assets: [], sha256: null};
  const parsed = z
    .array(assetSchema)
    .parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  return {assets: parsed, sha256: sha256OfFile(filePath)};
};

const registerProjectionCandidate = (input: {
  repoRoot: string;
  episodeId: string;
  ref: ArtifactRef;
  dependencies: readonly ArtifactDependency[];
}): void => {
  const filePath = path.resolve(input.repoRoot, `content/${input.episodeId}/artifact-index.json`);
  const expectedVersion = readArtifactIndexVersion(filePath);
  let index = fs.existsSync(filePath)
    ? readArtifactIndex(filePath)
    : emptyArtifactIndex(input.episodeId);
  index = registerCandidate(index, input.ref, "media-render-manifest", [...input.dependencies]);
  writeArtifactIndexCas({
    filePath,
    index,
    expectedVersion,
    casRoot: input.repoRoot,
  });
};

export type ProjectMediaRenderManifestInput = {
  repoRoot: string;
  episodeId: string;
  now?: () => string;
};

type ProjectedBody = Omit<MediaRenderManifest, "artifactRef">;

const projectBody = (input: ProjectMediaRenderManifestInput): ProjectedBody => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const plan = readMediaRenderPlan(repoRoot, episodeId);
  const sourceManifestPath = resolveMediaRepositoryPath(
    repoRoot,
    mediaSourceManifestRepositoryPath(episodeId),
  );
  const sourceManifest = fs.existsSync(sourceManifestPath)
    ? readMediaSourceManifest(repoRoot, episodeId)
    : null;
  const official = readOfficialAssets(repoRoot, episodeId);
  const officialByPath = new Map(official.assets.map((asset) => [asset.path, asset]));

  const sources = (sourceManifest?.sources ?? []).map((source) => ({
    sourceId: source.sourceId,
    publisher: source.publisher,
    sourceType: source.sourceType,
    admissionStatus: source.admissionStatus,
    rightsStatus: source.rightsStatus,
    admitted: isMediaSourceAdmitted(source),
    rightsApproved: isMediaSourceRightsApproved(source),
  }));

  const assets = (sourceManifest?.assets ?? []).map((asset) => ({
    mediaId: asset.mediaId,
    sourceId: asset.mediaSourceId,
    kind: asset.kind,
    sha256: asset.sha256,
    mediaType: asset.mediaType,
    sizeBytes: asset.sizeBytes,
  }));

  const clips: Array<z.infer<typeof mediaRenderManifestClipSchema>> = [];
  const usage: Array<z.infer<typeof mediaRenderManifestUsageSchema>> = [];
  const seenClips = new Set<string>();

  for (const shot of plan.shots) {
    const slotPath = resolveMediaRepositoryPath(
      repoRoot,
      mediaVisualSlotRepositoryPath(episodeId, shot.segmentId),
    );
    const slot = fs.existsSync(slotPath)
      ? readVisualSlot(repoRoot, episodeId, shot.segmentId)
      : null;
    const clipRef = shot.selectedMediaClipRef ?? slot?.selectedMediaClipRef ?? null;
    const verificationSha256 =
      shot.verificationRef?.sha256 ?? slot?.verificationRef?.sha256 ?? null;
    if (clipRef && !seenClips.has(clipRef.clipId)) {
      seenClips.add(clipRef.clipId);
      clips.push({
        clipId: clipRef.clipId,
        mediaId: clipRef.mediaId,
        startMs: clipRef.startMs,
        endMs: clipRef.endMs,
        verificationSha256,
      });
    }
    const fallbackImage = shot.fallbackImagePath;
    const officialAsset = shot.fallbackImageAssetId
      ? (official.assets.find((asset) => asset.id === shot.fallbackImageAssetId) ?? null)
      : fallbackImage
        ? (officialByPath.get(fallbackImage) ?? null)
        : null;
    usage.push({
      segmentId: shot.segmentId,
      selectedType: shot.visualType,
      clipRef,
      verificationSha256,
      fallbackType: shot.fallbackType ?? slot?.fallbackType ?? null,
      fallbackReason: shot.fallbackReason ?? slot?.fallbackReason ?? null,
      officialAssetId: officialAsset?.id ?? null,
    });
  }

  return {
    schemaVersion: MEDIA_RENDER_MANIFEST_SCHEMA_VERSION,
    episodeId,
    sourceManifestSha256: sourceManifest ? sha256OfFile(sourceManifestPath) : null,
    assetManifestSha256: official.sha256,
    timelineSha256: plan.timelineSha256,
    renderPlanSha256: plan.artifactRef.sha256,
    sources,
    assets,
    clips,
    usage,
    officialAssets: official.assets.filter((asset) => asset.usedInRender || asset.approved),
    createdAt: now(),
  };
};

export const projectMediaRenderManifest = (input: ProjectMediaRenderManifestInput): ProjectedBody =>
  projectBody(input);

export const buildMediaRenderManifest = (
  input: ProjectMediaRenderManifestInput,
): MediaRenderManifest => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const bodyWithoutArtifactRef = projectBody({...input, now});
  const contentBytes = Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8");
  const embedded = artifactRefSchema.parse({
    artifactId: `${episodeId}:media:render-manifest`,
    episodeId,
    path: mediaRenderManifestRepositoryPath(episodeId),
    mediaType: "application/json",
    schemaVersion: MEDIA_RENDER_MANIFEST_SCHEMA_VERSION,
    revision: 1,
    sha256: sha256Bytes(contentBytes),
    sizeBytes: contentBytes.byteLength,
    producer: MEDIA_RENDER_MANIFEST_TOOL_VERSION,
    createdAt: now(),
  });
  const body = mediaRenderManifestSchema.parse({
    ...bodyWithoutArtifactRef,
    artifactRef: embedded,
  });
  const bytes = Buffer.from(serializeIndexArtifact(body), "utf8");
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaRenderManifestRepositoryPath(episodeId),
  );
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, bytes);
  fs.renameSync(temporaryPath, filePath);
  const ref = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:media:render-manifest`,
    episodeId,
    path: mediaRenderManifestRepositoryPath(episodeId),
    mediaType: "application/json",
    schemaVersion: MEDIA_RENDER_MANIFEST_SCHEMA_VERSION,
    producer: MEDIA_RENDER_MANIFEST_TOOL_VERSION,
    createdAt: now(),
  });
  const dependencies: ArtifactDependency[] = [
    artifactDependencySchema.parse({
      artifactId: `${episodeId}:media:render-plan`,
      path: mediaRenderPlanRepositoryPath(episodeId),
      sha256: body.renderPlanSha256,
      relation: "reads",
    }),
  ];
  if (body.sourceManifestSha256) {
    dependencies.push(
      artifactDependencySchema.parse({
        artifactId: `${episodeId}:media:source-manifest`,
        path: mediaSourceManifestRepositoryPath(episodeId),
        sha256: body.sourceManifestSha256,
        relation: "reads",
      }),
    );
  }
  registerProjectionCandidate({repoRoot, episodeId, ref, dependencies});
  return body;
};

export const readMediaRenderManifest = (
  repoRoot: string,
  episodeId: string,
): MediaRenderManifest => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaRenderManifestRepositoryPath(episodeId),
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_PROJECTION_MISSING:${episodeId}`);
  }
  const parsed = mediaRenderManifestSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
  );
  if (parsed.episodeId !== episodeId) {
    throw new Error(`MEDIA_PROJECTION_EPISODE_MISMATCH:${parsed.episodeId}:${episodeId}`);
  }
  return parsed;
};

export const hasMediaRenderPlan = (repoRoot: string, episodeId: string): boolean =>
  fs.existsSync(path.resolve(repoRoot, mediaRenderPlanRepositoryPath(episodeId)));

export const assertMediaRenderManifestConsistent = (input: {
  repoRoot: string;
  episodeId: string;
}): MediaRenderManifest | ProjectedBody => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const expected = projectBody({repoRoot, episodeId});
  const plan = readMediaRenderPlan(repoRoot, episodeId);
  if (expected.renderPlanSha256 !== plan.artifactRef.sha256) {
    throw new Error(`MEDIA_PROJECTION_PLAN_MISMATCH:${episodeId}`);
  }
  if (expected.timelineSha256 !== plan.timelineSha256) {
    throw new Error(`MEDIA_PROJECTION_TIMELINE_MISMATCH:${episodeId}`);
  }

  const sourceManifestPath = path.resolve(repoRoot, mediaSourceManifestRepositoryPath(episodeId));
  const sourceManifest = fs.existsSync(sourceManifestPath)
    ? readMediaSourceManifest(repoRoot, episodeId)
    : null;

  for (const shot of plan.shots) {
    const usage = expected.usage.find((entry) => entry.segmentId === shot.segmentId);
    if (!usage) throw new Error(`MEDIA_PROJECTION_USAGE_MISSING:${shot.segmentId}`);
    if (usage.selectedType !== shot.visualType) {
      throw new Error(`MEDIA_PROJECTION_USAGE_TYPE_MISMATCH:${shot.segmentId}`);
    }
    if (shot.visualType === "real-media") {
      const clipId = shot.selectedMediaClipRef?.clipId;
      if (!clipId) throw new Error(`MEDIA_PROJECTION_CLIP_MISSING:${shot.segmentId}`);
      if (!expected.clips.some((clip) => clip.clipId === clipId)) {
        throw new Error(`MEDIA_PROJECTION_UNDECLARED_CLIP:${clipId}`);
      }
      const lineage = resolveMediaShotLineage({repoRoot, episodeId, segmentId: shot.segmentId});
      if (!lineage.source || !lineage.mediaAsset) {
        throw new Error(`MEDIA_PROJECTION_LINEAGE_INCOMPLETE:${shot.segmentId}`);
      }
      if (!sourceManifest) {
        throw new Error(`MEDIA_PROJECTION_SOURCE_MANIFEST_MISSING:${episodeId}`);
      }
      const source = getMediaSource(sourceManifest, lineage.source.sourceId);
      if (!source || !isMediaSourceAdmitted(source) || !isMediaSourceRightsApproved(source)) {
        throw new Error(`MEDIA_PROJECTION_SOURCE_NOT_AUTHORIZED:${lineage.source.sourceId}`);
      }
      const asset = sourceManifest.assets.find(
        (candidate) => candidate.mediaId === lineage.mediaAsset?.mediaId,
      );
      if (!asset) throw new Error(`MEDIA_PROJECTION_ASSET_MISSING:${lineage.mediaAsset.mediaId}`);
      const assetPath = path.resolve(repoRoot, asset.artifactRef.path);
      if (!fs.existsSync(assetPath) || sha256OfFile(assetPath) !== asset.sha256) {
        throw new Error(`MEDIA_PROJECTION_ASSET_TAMPERED:${asset.mediaId}`);
      }
    }
  }

  const storedPath = path.resolve(repoRoot, mediaRenderManifestRepositoryPath(episodeId));
  if (!fs.existsSync(storedPath)) return expected;
  const stored = readMediaRenderManifest(repoRoot, episodeId);
  const expectedUsage = JSON.stringify(expected.usage);
  const storedUsage = JSON.stringify(stored.usage);
  if (stored.renderPlanSha256 !== expected.renderPlanSha256 || storedUsage !== expectedUsage) {
    throw new Error(`MEDIA_PROJECTION_STALE:${episodeId}`);
  }
  return stored;
};

export const mediaRenderManifestControlHash = (manifest: MediaRenderManifest): string =>
  crypto
    .createHash("sha256")
    .update(serializeIndexArtifact(mediaRenderManifestSchema.parse(manifest)))
    .digest("hex");
