import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  copyBytesAtomically,
  createCacheEventSink,
  FineGrainedCacheStore,
  sha256File,
  sha256Json,
  type CacheKind,
} from "../lib/fine-grained-cache";
import {
  artifactRefIsIndexed,
  buildArtifactRef,
  emptyArtifactIndex,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  writeArtifactIndexCas,
} from "../orchestration/artifact-registry";
import {readHumanDecision} from "../orchestration/human-decision";
import {episodeIdSchema} from "../orchestration/identity";
import {
  artifactDependencySchema,
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactRef,
} from "../orchestration/schemas/artifact";
import {
  buildClipId,
  buildClipWindows,
  clipIndexItemSchema,
  clipIndexSchema,
  clipWindowConfigSchema,
  DEFAULT_CLIP_WINDOW_CONFIG,
  MEDIA_CLIP_INDEX_SCHEMA_VERSION,
  mediaStageAvailabilitySchema,
  observedTextForWindow,
  type ClipIndex,
  type ClipIndexItem,
  type ClipWindow,
  type ClipWindowConfig,
  type MediaStageAvailability,
} from "./clip-index";
import {getMediaSource, isMediaSourceAdmitted, isMediaSourceRightsApproved} from "./discovery";
import {
  createMediaEvent,
  createMediaEventSink,
  type CreateMediaEventInput,
  type MediaEventSink,
  type MediaEventType,
} from "./events";
import {
  createFfmpegKeyframeExtractor,
  keyframeExtractionConfigSchema,
  keyframeFilename,
  representativeKeyframeTimestamp,
  type KeyframeDescriptor,
  type KeyframeExtractor,
  type KeyframeExtractionConfig,
} from "./keyframes";
import {readMediaSourceManifest} from "./manifest";
import {
  mediaCacheEventsRepositoryPath,
  mediaClipIndexRepositoryPath,
  mediaKeyframeRepositoryPath,
  mediaKeyframesDirectoryRepositoryPath,
  mediaScenesRepositoryPath,
  mediaTranscriptRepositoryPath,
  mediaUnderstandingStatusRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";
import {
  buildMediaScenes,
  createDeterministicSceneDetector,
  mediaScenesSchema,
  sceneDetectionConfigSchema,
  type MediaScenes,
  type Scene,
  type SceneDetectionConfig,
  type SceneDetector,
} from "./scenes";
import {mediaAssetSchema, type MediaAsset, type MediaSourceManifest} from "./schemas";
import {
  createDeterministicSemanticAdapter,
  semanticMetadataParse,
  type SemanticMetadata,
  type SemanticUnderstandingAdapter,
} from "./semantic";
import {
  buildMediaTranscript,
  createUnavailableTranscriptProvider,
  mediaTranscriptSchema,
  type MediaTranscript,
  type TranscriptProvider,
} from "./transcript";

/**
 * WP-M5.04 media understanding pipeline.
 *
 * For one hash-valid, rights-approved, episode-scoped original MediaAsset the
 * pipeline produces deterministic, cacheable derived artifacts under
 * `content/<ep>/media/indexes/<slug>/`: transcript.json, scenes.json,
 * keyframes/, clip-index.json — each a hash-bound ArtifactRef registered in
 * the episode artifact registry with full lineage back to the original.
 *
 * Fail-closed: tampered/stale/cross-episode media, revoked rights, malformed
 * provider output, or a failed stage never produces a usable index. Cache hits
 * never bypass the gate, and LangGraph/state layers only ever hold refs and
 * status — never transcript or index bodies.
 */

export const MEDIA_UNDERSTANDING_TOOL_VERSION = "media-understanding-v1";

export const MEDIA_TRANSCRIPT_CACHE_SCHEMA_VERSION = "media-transcript-cache-v1" as const;
export const MEDIA_TRANSCRIPT_CACHE_IMPLEMENTATION_VERSION =
  "media-transcript-cache-impl-v1" as const;
export const MEDIA_SCENES_CACHE_SCHEMA_VERSION = "media-scenes-cache-v1" as const;
export const MEDIA_SCENES_CACHE_IMPLEMENTATION_VERSION = "media-scenes-cache-impl-v1" as const;
export const MEDIA_KEYFRAMES_CACHE_SCHEMA_VERSION = "media-keyframes-cache-v1" as const;
export const MEDIA_KEYFRAMES_CACHE_IMPLEMENTATION_VERSION =
  "media-keyframes-cache-impl-v1" as const;
export const MEDIA_CLIP_INDEX_CACHE_SCHEMA_VERSION = "media-clip-index-cache-v1" as const;
export const MEDIA_CLIP_INDEX_CACHE_IMPLEMENTATION_VERSION =
  "media-clip-index-cache-impl-v1" as const;
export const MEDIA_UNDERSTANDING_STATUS_SCHEMA_VERSION = "media-understanding-status-v1" as const;

export const MEDIA_UNDERSTANDING_DEPENDENCY_PATHS = [
  "config/media-ingest.json",
  "src/media/understanding.ts",
  "src/media/transcript.ts",
  "src/media/scenes.ts",
  "src/media/keyframes.ts",
  "src/media/semantic.ts",
  "src/media/clip-index.ts",
  "src/media/events.ts",
  "src/media/paths.ts",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTimeSchema = z.string().datetime({offset: true});

const sortObjectKeys = (_key: string, value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
};

/** Deterministic pretty JSON used for every index artifact body. */
export const serializeIndexArtifact = (value: unknown): string =>
  `${JSON.stringify(value, sortObjectKeys, 2)}\n`;

const sortedHashes = (hashes: Record<string, string>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const key of Object.keys(hashes).sort()) {
    const value = hashes[key];
    if (!value || !/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`media understanding cache dependency hash invalid: ${key}`);
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

/* ------------------------------------------------------------------------- *
 * Config
 * ------------------------------------------------------------------------- */

export type MediaUnderstandingConfig = {
  scene: SceneDetectionConfig;
  clipWindow: ClipWindowConfig;
  keyframe: KeyframeExtractionConfig;
};

export const mediaUnderstandingDefaults: MediaUnderstandingConfig = {
  scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
  clipWindow: DEFAULT_CLIP_WINDOW_CONFIG,
  keyframe: {quality: 2, mediaType: "image/jpeg"},
};

export const parseMediaUnderstandingConfig = (value: unknown): MediaUnderstandingConfig => {
  const raw = z
    .object({
      scene: sceneDetectionConfigSchema,
      clipWindow: clipWindowConfigSchema,
      keyframe: keyframeExtractionConfigSchema,
    })
    .strict()
    .parse(value);
  return {
    scene: raw.scene,
    clipWindow: raw.clipWindow,
    keyframe: raw.keyframe,
  };
};

/* ------------------------------------------------------------------------- *
 * Cache identities
 * ------------------------------------------------------------------------- */

export type MediaTranscriptCacheKeyInput = {
  mediaSha256: string;
  analysisSourceSha256: string;
  providerId: string;
  asrModel: string | null;
  asrVersion: string;
  asrToolVersion: string;
  dependencyHashes: Record<string, string>;
};

/** Transcript identity: media SHA + ASR provider/model/version + dependency hashes. */
export const buildMediaTranscriptCacheKey = (input: MediaTranscriptCacheKeyInput): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.mediaSha256)) {
    throw new Error("media transcript cache mediaSha256 must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_TRANSCRIPT_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_TRANSCRIPT_CACHE_IMPLEMENTATION_VERSION,
    mediaSha256: input.mediaSha256,
    analysisSourceSha256: input.analysisSourceSha256,
    providerId: input.providerId,
    asrModel: input.asrModel,
    asrVersion: input.asrVersion,
    asrToolVersion: input.asrToolVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

export type MediaScenesCacheKeyInput = {
  mediaSha256: string;
  analysisSourceSha256: string;
  detectorId: string;
  detectorVersion: string;
  sceneConfig: SceneDetectionConfig;
  dependencyHashes: Record<string, string>;
};

/** Scene identity: media SHA + detector version + scene config + dependency hashes. */
export const buildMediaScenesCacheKey = (input: MediaScenesCacheKeyInput): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.mediaSha256)) {
    throw new Error("media scenes cache mediaSha256 must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_SCENES_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_SCENES_CACHE_IMPLEMENTATION_VERSION,
    mediaSha256: input.mediaSha256,
    analysisSourceSha256: input.analysisSourceSha256,
    detectorId: input.detectorId,
    detectorVersion: input.detectorVersion,
    sceneConfig: input.sceneConfig,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

export type MediaKeyframesStageCacheKeyInput = {
  mediaSha256: string;
  analysisSourceSha256: string;
  extractorId: string;
  extractorVersion: string;
  keyframeConfig: KeyframeExtractionConfig;
  scenesCacheKey: string;
  dependencyHashes: Record<string, string>;
};

/**
 * Stage identity for keyframe extraction. Per-keyframe entries additionally
 * bind scene index + timestamp; a scene change therefore invalidates only the
 * keyframes of that scene.
 */
export const buildMediaKeyframesStageCacheKey = (
  input: MediaKeyframesStageCacheKeyInput,
): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.mediaSha256) || !/^[a-f0-9]{64}$/u.test(input.scenesCacheKey)) {
    throw new Error("media keyframes cache inputs must be SHA-256 digests");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_KEYFRAMES_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_KEYFRAMES_CACHE_IMPLEMENTATION_VERSION,
    mediaSha256: input.mediaSha256,
    analysisSourceSha256: input.analysisSourceSha256,
    extractorId: input.extractorId,
    extractorVersion: input.extractorVersion,
    keyframeConfig: input.keyframeConfig,
    scenesCacheKey: input.scenesCacheKey,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

export const buildMediaKeyframeCacheKey = (input: {
  stageCacheKey: string;
  sceneIndex: number;
  timestampMs: number;
}): string =>
  sha256Json({
    cacheSchemaVersion: MEDIA_KEYFRAMES_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_KEYFRAMES_CACHE_IMPLEMENTATION_VERSION,
    stageCacheKey: input.stageCacheKey,
    sceneIndex: input.sceneIndex,
    timestampMs: input.timestampMs,
  });

export type MediaClipIndexCacheKeyInput = {
  mediaSha256: string;
  transcriptCacheKey: string;
  scenesCacheKey: string | null;
  keyframesStageCacheKey: string | null;
  semanticAdapterId: string;
  semanticAdapterVersion: string;
  clipWindowConfig: ClipWindowConfig;
  indexSchemaVersion: string;
  dependencyHashes: Record<string, string>;
};

/**
 * Index identity: media SHA + every stage identity it consumes + semantic
 * adapter + clip window config + the index schema version.
 */
export const buildMediaClipIndexCacheKey = (input: MediaClipIndexCacheKeyInput): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.mediaSha256)) {
    throw new Error("media clip index cache mediaSha256 must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_CLIP_INDEX_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_CLIP_INDEX_CACHE_IMPLEMENTATION_VERSION,
    mediaSha256: input.mediaSha256,
    transcriptCacheKey: input.transcriptCacheKey,
    scenesCacheKey: input.scenesCacheKey,
    keyframesStageCacheKey: input.keyframesStageCacheKey,
    semanticAdapterId: input.semanticAdapterId,
    semanticAdapterVersion: input.semanticAdapterVersion,
    clipWindowConfig: input.clipWindowConfig,
    indexSchemaVersion: input.indexSchemaVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

/* ------------------------------------------------------------------------- *
 * Status ledger (ArtifactRef/status only — never bodies)
 * ------------------------------------------------------------------------- */

const stageStatusSchema = z
  .object({
    availability: mediaStageAvailabilitySchema,
    cacheKey: sha256Schema.nullable(),
    artifactId: z.string().min(1).nullable(),
    ref: artifactRefSchema.nullable(),
    reason: z.string().max(500).optional(),
  })
  .strict();

const keyframeStatusEntrySchema = z
  .object({
    keyframeIndex: z.number().int().nonnegative(),
    cacheKey: sha256Schema,
    artifactId: z.string().min(1),
    filename: z.string().min(1),
    ref: artifactRefSchema,
  })
  .strict();

const keyframesStatusSchema = z
  .object({
    availability: mediaStageAvailabilitySchema,
    cacheKey: sha256Schema.nullable(),
    extractorId: z.string().min(1).nullable(),
    extractorVersion: z.string().min(1).nullable(),
    entries: z.array(keyframeStatusEntrySchema).default([]),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const mediaUnderstandingStatusSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_UNDERSTANDING_STATUS_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    mediaId: z.string().min(1),
    mediaSha256: sha256Schema,
    indexVersion: z.literal(MEDIA_CLIP_INDEX_SCHEMA_VERSION),
    analysisSourceRef: artifactRefSchema,
    usedProxy: z.boolean(),
    stages: z
      .object({
        transcript: stageStatusSchema.nullable(),
        scenes: stageStatusSchema.nullable(),
        keyframes: keyframesStatusSchema.nullable(),
        "clip-index": stageStatusSchema.nullable(),
      })
      .strict(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export type MediaUnderstandingStatus = z.infer<typeof mediaUnderstandingStatusSchema>;

type StatusStages = MediaUnderstandingStatus["stages"];

const slugOf = (mediaId: string, episodeId: string): string => {
  const prefix = `${episodeId}:media:`;
  if (!mediaId.startsWith(prefix)) {
    throw new Error(`MEDIA_INDEX_MEDIA_ID_EPISODE_MISMATCH:${mediaId}:${episodeId}`);
  }
  const slug = mediaId.slice(prefix.length);
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(slug)) {
    throw new Error(`MEDIA_INDEX_MEDIA_ID_INVALID:${mediaId}`);
  }
  return slug;
};

const artifactSlugOf = (mediaId: string, episodeId: string): string =>
  slugOf(mediaId, episodeId).replace(/[^a-z0-9-]/gu, "-");

const statusFilePath = (repoRoot: string, episodeId: string, mediaId: string): string =>
  resolveMediaRepositoryPath(
    repoRoot,
    mediaUnderstandingStatusRepositoryPath(episodeId, slugOf(mediaId, episodeId)),
  );

const readStatus = (
  repoRoot: string,
  episodeId: string,
  mediaId: string,
): MediaUnderstandingStatus | null => {
  const filePath = statusFilePath(repoRoot, episodeId, mediaId);
  if (!fs.existsSync(filePath)) return null;
  const parsed = mediaUnderstandingStatusSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
  );
  if (parsed.episodeId !== episodeId || parsed.mediaId !== mediaId) {
    throw new Error(`MEDIA_INDEX_STATUS_MISMATCH:${mediaId}`);
  }
  return parsed;
};

const writeStatus = (input: {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  mediaSha256: string;
  analysisSourceRef: ArtifactRef;
  usedProxy: boolean;
  stages: StatusStages;
  now: () => string;
}): void => {
  const parsed = mediaUnderstandingStatusSchema.parse({
    schemaVersion: MEDIA_UNDERSTANDING_STATUS_SCHEMA_VERSION,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    mediaSha256: input.mediaSha256,
    indexVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
    analysisSourceRef: input.analysisSourceRef,
    usedProxy: input.usedProxy,
    stages: input.stages,
    updatedAt: input.now(),
  });
  copyBytesAtomically(
    statusFilePath(input.repoRoot, input.episodeId, input.mediaId),
    Buffer.from(serializeIndexArtifact(parsed), "utf8"),
  );
};

/** Public reader; returns null when no understanding run happened for this media. */
export const readMediaUnderstandingStatus = (
  repoRoot: string,
  episodeId: string,
  mediaId: string,
): MediaUnderstandingStatus | null => readStatus(repoRoot, episodeId, mediaId);

/* ------------------------------------------------------------------------- *
 * Gate + helpers
 * ------------------------------------------------------------------------- */

const assertMediaAssetBytesOrThrow = (repoRoot: string, asset: MediaAsset): void => {
  const filePath = resolveMediaRepositoryPath(repoRoot, asset.artifactRef.path);
  let actual: Buffer;
  try {
    actual = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`MEDIA_INDEX_ASSET_TAMPERED:${asset.mediaId}`, {cause: error});
  }
  if (
    actual.byteLength !== asset.artifactRef.sizeBytes ||
    sha256File(filePath) !== asset.artifactRef.sha256
  ) {
    throw new Error(`MEDIA_INDEX_ASSET_TAMPERED:${asset.mediaId}`);
  }
};

/**
 * The M5.04 input gate. Only a current-episode original MediaAsset that is
 * still formally admitted AND rights-approved (hash-bound decisions intact),
 * byte-hash-valid, and registered in the artifact registry may be indexed.
 * Everything else fails closed — before any cache consult or reuse.
 */
const assertMediaIndexable = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
  asset: MediaAsset;
}): void => {
  const parsed = mediaAssetSchema.parse(input.asset);
  if (parsed.episodeId !== input.episodeId) {
    throw new Error(`MEDIA_INDEX_EPISODE_MISMATCH:${parsed.mediaId}`);
  }
  const recorded = input.manifest.assets.find((candidate) => candidate.mediaId === parsed.mediaId);
  if (!recorded || JSON.stringify(recorded) !== JSON.stringify(parsed)) {
    throw new Error(`MEDIA_INDEX_ASSET_STALE:${parsed.mediaId}`);
  }
  const source = getMediaSource(input.manifest, parsed.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_INDEX_SOURCE_UNKNOWN:${parsed.mediaSourceId}`);
  }
  if (!isMediaSourceAdmitted(source)) {
    throw new Error(`MEDIA_INDEX_SOURCE_NOT_ADMITTED:${parsed.mediaSourceId}`);
  }
  if (!isMediaSourceRightsApproved(source)) {
    throw new Error(`MEDIA_INDEX_RIGHTS_NOT_APPROVED:${parsed.mediaSourceId}`);
  }
  if (source.admissionDecisionRef) {
    readHumanDecision(input.repoRoot, source.admissionDecisionRef, input.episodeId);
  }
  if (source.rightsDecisionRef) {
    readHumanDecision(input.repoRoot, source.rightsDecisionRef, input.episodeId);
  }
  if (parsed.rightsStatus !== "approved") {
    throw new Error(`MEDIA_INDEX_ASSET_RIGHTS_NOT_APPROVED:${parsed.mediaId}`);
  }
  if (!artifactRefIsIndexed(input.repoRoot, parsed.artifactRef)) {
    throw new Error(`MEDIA_INDEX_ASSET_NOT_REGISTERED:${parsed.mediaId}`);
  }
  assertMediaAssetBytesOrThrow(input.repoRoot, parsed);
};

const registerIndexCandidate = (input: {
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

const readDependencies = (refs: readonly ArtifactRef[]): ArtifactDependency[] =>
  refs.map((ref) =>
    artifactDependencySchema.parse({
      artifactId: ref.artifactId,
      path: ref.path,
      sha256: ref.sha256,
      relation: "reads",
    }),
  );

const artifactFileValid = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const filePath = resolveMediaRepositoryPath(repoRoot, ref.path);
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    return (
      stat.size === ref.sizeBytes &&
      sha256File(filePath) === ref.sha256 &&
      artifactRefIsIndexed(repoRoot, ref)
    );
  } catch {
    return false;
  }
};

const publishIndexArtifact = (input: {
  repoRoot: string;
  episodeId: string;
  repositoryPath: string;
  artifactId: string;
  schemaVersion: string;
  mediaType: string;
  producer: string;
  bytes: Uint8Array;
  dependencies: readonly ArtifactDependency[];
  executionId: string;
  now: () => string;
}): ArtifactRef => {
  const filePath = resolveMediaRepositoryPath(input.repoRoot, input.repositoryPath);
  copyBytesAtomically(filePath, Buffer.from(input.bytes));
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.repositoryPath,
    mediaType: input.mediaType,
    schemaVersion: input.schemaVersion,
    producer: input.producer,
    createdAt: input.now(),
  });
  registerIndexCandidate({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref,
    executionId: input.executionId,
    dependencies: input.dependencies,
  });
  return ref;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
};

/** Cache miss reasons that mean the stored entry itself is corrupt. */
const CACHE_CORRUPTION_REASONS = new Set([
  "payload-hash-mismatch",
  "metadata-schema-mismatch",
  "entry-json-invalid",
  "schema-version-or-key-mismatch",
  "payload-missing",
]);

const createEnvironmentCache = (
  repoRoot: string,
  episodeId: string,
): FineGrainedCacheStore | undefined => {
  const root = process.env.PRODUCTION_CACHE_DIR;
  if (!root) return undefined;
  const eventSink = createCacheEventSink(
    resolveMediaRepositoryPath(repoRoot, mediaCacheEventsRepositoryPath(episodeId)),
  );
  return new FineGrainedCacheStore({root, episodeId, eventSink});
};

/* ------------------------------------------------------------------------- *
 * Stage runner (single-artifact stages)
 * ------------------------------------------------------------------------- */

export type StageEmit = (
  eventType: MediaEventType,
  extra?: Omit<
    CreateMediaEventInput,
    "eventType" | "occurredAt" | "episodeId" | "mediaId" | "mediaSourceId"
  >,
) => void;

export type MediaUnderstandingStageOutcome = {
  stage: "transcript" | "scenes" | "keyframes" | "clip-index";
  availability: MediaStageAvailability;
  cacheHit: boolean;
  reused: boolean;
  cacheKey: string | null;
  ref: ArtifactRef | null;
  refs: ArtifactRef[];
};

type SingleArtifactStageInput = {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  mediaSha256: string;
  mediaSourceId: string;
  analysisSourceRef: ArtifactRef;
  usedProxy: boolean;
  /** Event type prefix: "transcript" | "scenes" | "index". */
  eventBase: "transcript" | "scenes" | "index";
  statusKey: "transcript" | "scenes" | "clip-index";
  cacheKey: string;
  cacheKind: CacheKind;
  cacheMetadata: unknown;
  validateCacheMetadata: (value: unknown) => unknown;
  repositoryPath: string;
  artifactId: string;
  schemaVersion: string;
  mediaType: string;
  producer: string;
  dependencies: readonly ArtifactDependency[];
  availability: MediaStageAvailability;
  /** Optional: derive the recorded availability from the artifact bytes (e.g. transcript body). */
  availabilityOf?: (bytes: Buffer) => MediaStageAvailability;
  stageReason?: string;
  produce: () => Buffer | Promise<Buffer>;
  cache: FineGrainedCacheStore | null;
  emit: StageEmit;
  now: () => string;
};

const availabilityOfBytes = (
  input: SingleArtifactStageInput,
  bytes: Buffer,
): MediaStageAvailability =>
  input.availabilityOf ? input.availabilityOf(bytes) : input.availability;

const runSingleArtifactStage = async (
  input: SingleArtifactStageInput,
): Promise<{ref: ArtifactRef; cacheHit: boolean; reused: boolean}> => {
  const emit = input.emit;
  emit(`media.${input.eventBase}.started`, {});
  try {
    const status = readStatus(input.repoRoot, input.episodeId, input.mediaId);
    const existingEntry = status?.stages[input.statusKey];
    const currentEntryValid =
      existingEntry?.cacheKey === input.cacheKey &&
      existingEntry.ref !== null &&
      artifactFileValid(input.repoRoot, existingEntry.ref);

    if (input.cache) {
      const looked = input.cache.lookup({
        kind: input.cacheKind,
        cacheKey: input.cacheKey,
        stage: `media-${input.eventBase}`,
        logicalItem: `${input.mediaId}:${input.statusKey}`,
        validateMetadata: input.validateCacheMetadata,
      });
      if (looked.hit) {
        const hitAvailability = availabilityOfBytes(input, looked.bytes);
        emit("media.understanding.cache.hit", {
          cacheKey: input.cacheKey,
          sha256: looked.entry.payload.sha256,
          sizeBytes: looked.entry.payload.sizeBytes,
          mediaType: input.mediaType,
          availability: hitAvailability,
          reason: `media-${input.eventBase}`,
        });
        const ref = publishIndexArtifact({
          repoRoot: input.repoRoot,
          episodeId: input.episodeId,
          repositoryPath: input.repositoryPath,
          artifactId: input.artifactId,
          schemaVersion: input.schemaVersion,
          mediaType: input.mediaType,
          producer: input.producer,
          bytes: looked.bytes,
          dependencies: input.dependencies,
          executionId: `media-understanding:${input.mediaId}:${input.statusKey}`,
          now: input.now,
        });
        writeStatus({
          repoRoot: input.repoRoot,
          episodeId: input.episodeId,
          mediaId: input.mediaId,
          mediaSha256: input.mediaSha256,
          analysisSourceRef: input.analysisSourceRef,
          usedProxy: input.usedProxy,
          stages: {
            ...(status?.stages ?? {
              transcript: null,
              scenes: null,
              keyframes: null,
              "clip-index": null,
            }),
            [input.statusKey]: {
              availability: hitAvailability,
              cacheKey: input.cacheKey,
              artifactId: ref.artifactId,
              ref,
              ...(input.stageReason ? {reason: input.stageReason} : {}),
            },
          },
          now: input.now,
        });
        emit(`media.${input.eventBase}.completed`, {
          artifactRef: ref,
          sha256: ref.sha256,
          sizeBytes: ref.sizeBytes,
          mediaType: input.mediaType,
          availability: hitAvailability,
          reason: "cache-hit",
        });
        return {ref, cacheHit: true, reused: false};
      }
      emit("media.understanding.cache.miss", {
        cacheKey: input.cacheKey,
        reason: `media-${input.eventBase}:${looked.reason}`,
      });
      if (!CACHE_CORRUPTION_REASONS.has(looked.reason) && currentEntryValid && existingEntry?.ref) {
        const reuseAvailability = input.availabilityOf
          ? input.availabilityOf(
              fs.readFileSync(resolveMediaRepositoryPath(input.repoRoot, existingEntry.ref.path)),
            )
          : input.availability;
        emit(`media.${input.eventBase}.completed`, {
          artifactRef: existingEntry.ref,
          sha256: existingEntry.ref.sha256,
          sizeBytes: existingEntry.ref.sizeBytes,
          mediaType: input.mediaType,
          availability: reuseAvailability,
          reason: "reused",
        });
        return {ref: existingEntry.ref, cacheHit: false, reused: true};
      }
    } else if (currentEntryValid && existingEntry?.ref) {
      const reuseAvailability = input.availabilityOf
        ? input.availabilityOf(
            fs.readFileSync(resolveMediaRepositoryPath(input.repoRoot, existingEntry.ref.path)),
          )
        : input.availability;
      emit(`media.${input.eventBase}.completed`, {
        artifactRef: existingEntry.ref,
        sha256: existingEntry.ref.sha256,
        sizeBytes: existingEntry.ref.sizeBytes,
        mediaType: input.mediaType,
        availability: reuseAvailability,
        reason: "reused",
      });
      return {ref: existingEntry.ref, cacheHit: false, reused: true};
    }

    const bytes = Buffer.from(await input.produce());
    const producedAvailability = availabilityOfBytes(input, bytes);
    const ref = publishIndexArtifact({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      repositoryPath: input.repositoryPath,
      artifactId: input.artifactId,
      schemaVersion: input.schemaVersion,
      mediaType: input.mediaType,
      producer: input.producer,
      bytes,
      dependencies: input.dependencies,
      executionId: `media-understanding:${input.mediaId}:${input.statusKey}`,
      now: input.now,
    });
    if (input.cache) {
      input.cache.put({
        kind: input.cacheKind,
        cacheKey: input.cacheKey,
        stage: `media-${input.eventBase}`,
        logicalItem: `${input.mediaId}:${input.statusKey}`,
        mediaType: input.mediaType,
        bytes,
        metadata: input.cacheMetadata,
      });
    }
    writeStatus({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      mediaId: input.mediaId,
      mediaSha256: input.mediaSha256,
      analysisSourceRef: input.analysisSourceRef,
      usedProxy: input.usedProxy,
      stages: {
        ...(status?.stages ?? {
          transcript: null,
          scenes: null,
          keyframes: null,
          "clip-index": null,
        }),
        [input.statusKey]: {
          availability: producedAvailability,
          cacheKey: input.cacheKey,
          artifactId: ref.artifactId,
          ref,
          ...(input.stageReason ? {reason: input.stageReason} : {}),
        },
      },
      now: input.now,
    });
    emit(`media.${input.eventBase}.completed`, {
      artifactRef: ref,
      sha256: ref.sha256,
      sizeBytes: ref.sizeBytes,
      mediaType: input.mediaType,
      availability: producedAvailability,
      reason: "produced",
    });
    return {ref, cacheHit: false, reused: false};
  } catch (error) {
    emit(`media.${input.eventBase}.failed`, {reason: errorMessage(error)});
    throw error;
  }
};

const EMPTY_STAGES: StatusStages = {
  transcript: null,
  scenes: null,
  keyframes: null,
  "clip-index": null,
};

/* ------------------------------------------------------------------------- *
 * Main pipeline
 * ------------------------------------------------------------------------- */

export type IndexMediaAssetInput = {
  repoRoot: string;
  episodeId: string;
  /** Episode-scoped `episode-<id>:media:<slug>` original MediaAsset identity. */
  mediaId: string;
  config?: MediaUnderstandingConfig;
  cache?: FineGrainedCacheStore | null;
  transcriptProvider?: TranscriptProvider;
  semanticAdapter?: SemanticUnderstandingAdapter;
  keyframeExtractor?: KeyframeExtractor;
  sceneDetector?: SceneDetector;
  eventSink?: MediaEventSink;
  cacheDependencyHashes?: Record<string, string>;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export type IndexMediaAssetResult = {
  manifest: MediaSourceManifest;
  usedProxy: boolean;
  analysisSourceRef: ArtifactRef;
  sourceSha256: string;
  transcript: MediaUnderstandingStageOutcome;
  scenes: MediaUnderstandingStageOutcome | null;
  keyframes: MediaUnderstandingStageOutcome | null;
  clipIndex: MediaUnderstandingStageOutcome;
};

export const indexMediaAsset = async (
  input: IndexMediaAssetInput,
): Promise<IndexMediaAssetResult> => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId, mediaId} = input;
  const config = parseMediaUnderstandingConfig(input.config ?? mediaUnderstandingDefaults);
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});

  // Gate first: no events, no cache, no reuse before the media is proven
  // current, rights-approved, and byte-hash-valid.
  const mediaPrefix = `${episodeId}:media:`;
  if (!mediaId.startsWith(mediaPrefix)) {
    if (/^episode-[a-z0-9-]+:media:/u.test(mediaId)) {
      throw new Error(`MEDIA_INDEX_MEDIA_ID_EPISODE_MISMATCH:${mediaId}:${episodeId}`);
    }
    throw new Error(`MEDIA_INDEX_MEDIA_ID_INVALID:${mediaId}`);
  }
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const asset = manifest.assets.find((candidate) => candidate.mediaId === mediaId);
  if (!asset) {
    throw new Error(`MEDIA_INDEX_ASSET_UNKNOWN:${mediaId}`);
  }
  assertMediaIndexable({repoRoot, episodeId, manifest, asset});
  if (asset.mediaType.startsWith("image/")) {
    throw new Error(`MEDIA_INDEX_NOT_APPLICABLE:${mediaId}:image`);
  }
  const kind: "video" | "audio" = asset.mediaType.startsWith("video/") ? "video" : "audio";
  const mediaSlug = slugOf(mediaId, episodeId);
  const source = getMediaSource(manifest, asset.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_INDEX_SOURCE_UNKNOWN:${asset.mediaSourceId}`);
  }

  // Analysis source: prefer the normalized proxy; all lineage still anchors to
  // the original. A tampered or stale proxy fails closed (no silent fallback).
  const proxy = manifest.assets.find(
    (candidate) => candidate.kind === "proxy" && candidate.derivedFromMediaId === mediaId,
  );
  let analysisSource: MediaAsset;
  let usedProxy: boolean;
  if (proxy) {
    assertMediaAssetBytesOrThrow(repoRoot, proxy);
    if (!proxy.derivedFromMediaRef || proxy.derivedFromMediaRef.sha256 !== asset.sha256) {
      throw new Error(`MEDIA_INDEX_PROXY_STALE:${proxy.mediaId}`);
    }
    analysisSource = proxy;
    usedProxy = true;
  } else {
    analysisSource = asset;
    usedProxy = false;
  }

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
        mediaId,
        mediaSourceId: asset.mediaSourceId,
        kind: "original",
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        ...extra,
      }),
    );
  };

  const transcriptProvider = input.transcriptProvider ?? createUnavailableTranscriptProvider();
  const semanticAdapter = input.semanticAdapter ?? createDeterministicSemanticAdapter();
  const keyframeExtractor =
    input.keyframeExtractor ?? createFfmpegKeyframeExtractor({config: config.keyframe});
  const sceneDetector = input.sceneDetector ?? createDeterministicSceneDetector();

  const dependencyHashes =
    input.cacheDependencyHashes ??
    hashExistingRepositoryFiles(repoRoot, MEDIA_UNDERSTANDING_DEPENDENCY_PATHS);
  const cache: FineGrainedCacheStore | null =
    input.cache ?? createEnvironmentCache(repoRoot, episodeId) ?? null;
  const mediaSha256 = asset.sha256;
  const analysisSourceSha256 = analysisSource.sha256;
  const durationMs = analysisSource.durationMs ?? asset.durationMs;
  const artifactSlug = artifactSlugOf(mediaId, episodeId);
  const dependencies = [
    ...readDependencies([asset.artifactRef, analysisSource.artifactRef]),
    ...decisionDependencies(source),
  ];

  /* -------- transcript -------- */
  const transcriptCacheKey = buildMediaTranscriptCacheKey({
    mediaSha256,
    analysisSourceSha256,
    providerId: transcriptProvider.id,
    asrModel: transcriptProvider.model,
    asrVersion: transcriptProvider.asrVersion,
    asrToolVersion: transcriptProvider.toolVersion,
    dependencyHashes,
  });
  const transcriptMetadata = {
    schemaVersion: "media-transcript-cache-metadata-v1",
    episodeId,
    mediaId,
    mediaSha256,
    analysisSourceSha256,
    cacheKey: transcriptCacheKey,
    artifactId: `${episodeId}:media-transcript:${artifactSlug}`,
    providerId: transcriptProvider.id,
    availability: "available" as const,
  };
  const transcriptResult = await runSingleArtifactStage({
    repoRoot,
    episodeId,
    mediaId,
    mediaSha256,
    mediaSourceId: asset.mediaSourceId,
    eventBase: "transcript",
    statusKey: "transcript",
    cacheKey: transcriptCacheKey,
    cacheKind: "media-transcript",
    cacheMetadata: transcriptMetadata,
    validateCacheMetadata: (value) => {
      const parsed = z
        .object({
          schemaVersion: z.literal("media-transcript-cache-metadata-v1"),
          episodeId: episodeIdSchema,
          mediaId: z.string().min(1),
          mediaSha256: sha256Schema,
          analysisSourceSha256: sha256Schema,
          cacheKey: sha256Schema,
          artifactId: z.string().min(1),
          providerId: z.string().min(1),
          availability: z.enum(["available", "unavailable"]),
        })
        .strict()
        .parse(value);
      if (
        parsed.episodeId !== episodeId ||
        parsed.mediaId !== mediaId ||
        parsed.mediaSha256 !== mediaSha256 ||
        parsed.analysisSourceSha256 !== analysisSourceSha256 ||
        parsed.cacheKey !== transcriptCacheKey ||
        parsed.artifactId !== transcriptMetadata.artifactId
      ) {
        throw new Error("media transcript cache metadata mismatch");
      }
      return parsed;
    },
    repositoryPath: mediaTranscriptRepositoryPath(episodeId, mediaSlug),
    artifactId: transcriptMetadata.artifactId,
    schemaVersion: "media-transcript-v1",
    mediaType: "application/json",
    producer: `${MEDIA_UNDERSTANDING_TOOL_VERSION}:transcript:${transcriptProvider.toolVersion}`,
    dependencies,
    availability: "available",
    availabilityOf: (bytes) => {
      const parsed = mediaTranscriptSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      return parsed.availability;
    },
    produce: async () => {
      const result = await transcriptProvider.transcribe({
        repoRoot,
        episodeId,
        mediaId,
        mediaSourceId: asset.mediaSourceId,
        asset: analysisSource,
        durationMs,
      });
      const transcript = buildMediaTranscript({
        episodeId,
        mediaId,
        sourceMediaRef: asset.artifactRef,
        analysisSourceRef: analysisSource.artifactRef,
        provider: transcriptProvider,
        result,
        durationMs,
      });
      return Buffer.from(serializeIndexArtifact(transcript), "utf8");
    },
    cache,
    emit,
    now,
    analysisSourceRef: analysisSource.artifactRef,
    usedProxy,
  });
  const transcriptBody: MediaTranscript =
    transcriptResult.ref !== null
      ? readMediaTranscript(repoRoot, episodeId, mediaId)
      : mediaTranscriptSchema.parse({
          schemaVersion: "media-transcript-v1",
          episodeId,
          mediaId,
          sourceMediaRef: asset.artifactRef,
          analysisSourceRef: analysisSource.artifactRef,
          provider: transcriptProvider.id,
          model: transcriptProvider.model,
          toolVersion: transcriptProvider.toolVersion,
          asrVersion: transcriptProvider.asrVersion,
          availability: "unavailable",
          unavailableReason: "no-asr-provider-configured",
          durationMs,
          segments: [],
        });
  const transcriptOutcome: MediaUnderstandingStageOutcome = {
    stage: "transcript",
    availability: transcriptBody.availability,
    cacheHit: transcriptResult.cacheHit,
    reused: transcriptResult.reused,
    cacheKey: transcriptCacheKey,
    ref: transcriptResult.ref,
    refs: [transcriptResult.ref],
  };

  /* -------- scenes (video only) -------- */
  const scenesCacheKey = buildMediaScenesCacheKey({
    mediaSha256,
    analysisSourceSha256,
    detectorId: sceneDetector.id,
    detectorVersion: sceneDetector.version,
    sceneConfig: config.scene,
    dependencyHashes,
  });
  let scenesOutcome: MediaUnderstandingStageOutcome | null = null;
  let scenesBody: MediaScenes | null = null;
  if (kind === "video") {
    const scenesMetadata = {
      schemaVersion: "media-scenes-cache-metadata-v1",
      episodeId,
      mediaId,
      mediaSha256,
      analysisSourceSha256,
      cacheKey: scenesCacheKey,
      artifactId: `${episodeId}:media-scenes:${artifactSlug}`,
      detectorId: sceneDetector.id,
      detectorVersion: sceneDetector.version,
      availability: "available" as const,
    };
    const scenesResult = await runSingleArtifactStage({
      repoRoot,
      episodeId,
      mediaId,
      mediaSha256,
      mediaSourceId: asset.mediaSourceId,
      eventBase: "scenes",
      statusKey: "scenes",
      cacheKey: scenesCacheKey,
      cacheKind: "media-scenes",
      cacheMetadata: scenesMetadata,
      validateCacheMetadata: (value) => {
        const parsed = z
          .object({
            schemaVersion: z.literal("media-scenes-cache-metadata-v1"),
            episodeId: episodeIdSchema,
            mediaId: z.string().min(1),
            mediaSha256: sha256Schema,
            analysisSourceSha256: sha256Schema,
            cacheKey: sha256Schema,
            artifactId: z.string().min(1),
            detectorId: z.string().min(1),
            detectorVersion: z.string().min(1),
            availability: z.literal("available"),
          })
          .strict()
          .parse(value);
        if (
          parsed.episodeId !== episodeId ||
          parsed.mediaId !== mediaId ||
          parsed.mediaSha256 !== mediaSha256 ||
          parsed.analysisSourceSha256 !== analysisSourceSha256 ||
          parsed.cacheKey !== scenesCacheKey ||
          parsed.artifactId !== scenesMetadata.artifactId
        ) {
          throw new Error("media scenes cache metadata mismatch");
        }
        return parsed;
      },
      repositoryPath: mediaScenesRepositoryPath(episodeId, mediaSlug),
      artifactId: scenesMetadata.artifactId,
      schemaVersion: "media-scenes-v1",
      mediaType: "application/json",
      producer: `${MEDIA_UNDERSTANDING_TOOL_VERSION}:scenes:${sceneDetector.version}`,
      dependencies,
      availability: "available",
      produce: () => {
        const scenes = buildMediaScenes({
          episodeId,
          mediaId,
          sourceMediaRef: asset.artifactRef,
          analysisSourceRef: analysisSource.artifactRef,
          detector: sceneDetector,
          sourceSha256: mediaSha256,
          durationMs,
          config: config.scene,
        });
        return Buffer.from(serializeIndexArtifact(scenes), "utf8");
      },
      cache,
      emit,
      now,
      analysisSourceRef: analysisSource.artifactRef,
      usedProxy,
    });
    scenesOutcome = {
      stage: "scenes",
      availability: "available",
      cacheHit: scenesResult.cacheHit,
      reused: scenesResult.reused,
      cacheKey: scenesCacheKey,
      ref: scenesResult.ref,
      refs: [scenesResult.ref],
    };
    scenesBody = readMediaScenes(repoRoot, episodeId, mediaId);
  } else {
    // Audio: no scene boundaries — recorded explicitly as not-applicable.
    writeStatus({
      repoRoot,
      episodeId,
      mediaId,
      mediaSha256,
      analysisSourceRef: analysisSource.artifactRef,
      usedProxy,
      stages: {
        ...(readStatus(repoRoot, episodeId, mediaId)?.stages ?? EMPTY_STAGES),
        scenes: {availability: "not-applicable", cacheKey: null, artifactId: null, ref: null},
      },
      now,
    });
  }

  /* -------- keyframes (video only) -------- */
  const keyframesStageCacheKey = buildMediaKeyframesStageCacheKey({
    mediaSha256,
    analysisSourceSha256,
    extractorId: keyframeExtractor.id,
    extractorVersion: keyframeExtractor.version,
    keyframeConfig: config.keyframe,
    scenesCacheKey,
    dependencyHashes,
  });
  let keyframesOutcome: MediaUnderstandingStageOutcome | null = null;
  let keyframeArtifacts: {descriptor: KeyframeDescriptor; ref: ArtifactRef}[] = [];
  if (kind === "video" && scenesBody) {
    const keyframesResult = await runKeyframesStage({
      repoRoot,
      episodeId,
      mediaId,
      mediaSlug,
      mediaSha256,
      mediaSourceId: asset.mediaSourceId,
      now,
      emit,
      cache,
      analysisSource,
      scenes: scenesBody.scenes,
      scenesRef: scenesOutcome?.ref ?? null,
      stageCacheKey: keyframesStageCacheKey,
      keyframeExtractor,
      config: config.keyframe,
      dependencies,
      analysisSourceRef: analysisSource.artifactRef,
      usedProxy,
      durationMs,
      status: readStatus(repoRoot, episodeId, mediaId),
    });
    keyframesOutcome = {
      stage: "keyframes",
      availability: "available",
      cacheHit: keyframesResult.cacheHit,
      reused: keyframesResult.reused,
      cacheKey: keyframesStageCacheKey,
      ref: keyframesResult.refs[0] ?? null,
      refs: keyframesResult.refs,
    };
    keyframeArtifacts = keyframesResult.artifacts;
    writeStatus({
      repoRoot,
      episodeId,
      mediaId,
      mediaSha256,
      analysisSourceRef: analysisSource.artifactRef,
      usedProxy,
      stages: {
        ...(readStatus(repoRoot, episodeId, mediaId)?.stages ?? EMPTY_STAGES),
        keyframes: {
          availability: "available",
          cacheKey: keyframesStageCacheKey,
          extractorId: keyframeExtractor.id,
          extractorVersion: keyframeExtractor.version,
          entries: keyframesResult.artifacts.map(({descriptor, ref}) => ({
            keyframeIndex: descriptor.keyframeIndex,
            cacheKey: buildMediaKeyframeCacheKey({
              stageCacheKey: keyframesStageCacheKey,
              sceneIndex: descriptor.sceneIndex,
              timestampMs: descriptor.timestampMs,
            }),
            artifactId: ref.artifactId,
            filename: descriptor.filename,
            ref,
          })),
        },
      },
      now,
    });
  } else {
    // Audio: no keyframes — recorded explicitly as not-applicable.
    writeStatus({
      repoRoot,
      episodeId,
      mediaId,
      mediaSha256,
      analysisSourceRef: analysisSource.artifactRef,
      usedProxy,
      stages: {
        ...(readStatus(repoRoot, episodeId, mediaId)?.stages ?? EMPTY_STAGES),
        keyframes: {
          availability: "not-applicable",
          cacheKey: null,
          extractorId: null,
          extractorVersion: null,
          entries: [],
        },
      },
      now,
    });
  }

  /* -------- clip index -------- */
  const clipIndexCacheKey = buildMediaClipIndexCacheKey({
    mediaSha256,
    transcriptCacheKey,
    scenesCacheKey: kind === "video" ? scenesCacheKey : null,
    keyframesStageCacheKey: kind === "video" ? keyframesStageCacheKey : null,
    semanticAdapterId: semanticAdapter.id,
    semanticAdapterVersion: semanticAdapter.version,
    clipWindowConfig: config.clipWindow,
    indexSchemaVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
    dependencyHashes,
  });
  const clipIndexMetadata = {
    schemaVersion: "media-clip-index-cache-metadata-v1",
    episodeId,
    mediaId,
    mediaSha256,
    cacheKey: clipIndexCacheKey,
    artifactId: `${episodeId}:media-clip-index:${artifactSlug}`,
    semanticAdapterId: semanticAdapter.id,
    semanticAdapterVersion: semanticAdapter.version,
    availability: "available" as const,
  };
  const clipIndexResult = await runSingleArtifactStage({
    repoRoot,
    episodeId,
    mediaId,
    mediaSha256,
    mediaSourceId: asset.mediaSourceId,
    eventBase: "index",
    statusKey: "clip-index",
    cacheKey: clipIndexCacheKey,
    cacheKind: "media-clip-index",
    cacheMetadata: clipIndexMetadata,
    validateCacheMetadata: (value) => {
      const parsed = z
        .object({
          schemaVersion: z.literal("media-clip-index-cache-metadata-v1"),
          episodeId: episodeIdSchema,
          mediaId: z.string().min(1),
          mediaSha256: sha256Schema,
          cacheKey: sha256Schema,
          artifactId: z.string().min(1),
          semanticAdapterId: z.string().min(1),
          semanticAdapterVersion: z.string().min(1),
          availability: z.literal("available"),
        })
        .strict()
        .parse(value);
      if (
        parsed.episodeId !== episodeId ||
        parsed.mediaId !== mediaId ||
        parsed.mediaSha256 !== mediaSha256 ||
        parsed.cacheKey !== clipIndexCacheKey ||
        parsed.artifactId !== clipIndexMetadata.artifactId
      ) {
        throw new Error("media clip index cache metadata mismatch");
      }
      return parsed;
    },
    repositoryPath: mediaClipIndexRepositoryPath(episodeId, mediaSlug),
    artifactId: clipIndexMetadata.artifactId,
    schemaVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
    mediaType: "application/json",
    producer: `${MEDIA_UNDERSTANDING_TOOL_VERSION}:index:${semanticAdapter.version}`,
    dependencies: [
      ...(transcriptOutcome.ref ? readDependencies([transcriptOutcome.ref]) : []),
      ...(scenesOutcome?.ref ? readDependencies([scenesOutcome.ref]) : []),
      ...readDependencies(keyframeArtifacts.map(({ref}) => ref)),
      ...dependencies,
    ],
    availability: "available",
    produce: async () => {
      const windows = buildClipWindows({
        kind,
        scenes: scenesBody?.scenes ?? null,
        transcriptSegments: transcriptBody.segments,
        config: config.clipWindow,
      });
      const index = await buildClipIndexBody({
        episodeId,
        mediaId,
        mediaRef: asset.artifactRef,
        analysisSourceRef: analysisSource.artifactRef,
        sourceSha256: mediaSha256,
        kind,
        transcript: {
          availability: transcriptBody.availability,
          ref: transcriptOutcome.ref,
          segments: transcriptBody.segments,
        },
        scenes: scenesBody
          ? {availability: "available", ref: scenesOutcome?.ref ?? null, scenes: scenesBody.scenes}
          : null,
        keyframes: keyframeArtifacts.length > 0 ? {refs: keyframeArtifacts} : null,
        transcriptProvider,
        sceneDetector,
        keyframeExtractor,
        semanticAdapter,
        clipWindowConfig: config.clipWindow,
        windows,
      });
      return Buffer.from(serializeIndexArtifact(index), "utf8");
    },
    cache,
    emit,
    now,
    analysisSourceRef: analysisSource.artifactRef,
    usedProxy,
  });
  const clipIndexOutcome: MediaUnderstandingStageOutcome = {
    stage: "clip-index",
    availability: "available",
    cacheHit: clipIndexResult.cacheHit,
    reused: clipIndexResult.reused,
    cacheKey: clipIndexCacheKey,
    ref: clipIndexResult.ref,
    refs: [clipIndexResult.ref],
  };

  return {
    manifest: readMediaSourceManifest(repoRoot, episodeId),
    usedProxy,
    analysisSourceRef: analysisSource.artifactRef,
    sourceSha256: mediaSha256,
    transcript: transcriptOutcome,
    scenes: scenesOutcome,
    keyframes: keyframesOutcome,
    clipIndex: clipIndexOutcome,
  };
};

/* ------------------------------------------------------------------------- *
 * Keyframes stage
 * ------------------------------------------------------------------------- */

const runKeyframesStage = async (input: {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  mediaSlug: string;
  mediaSha256: string;
  mediaSourceId: string;
  now: () => string;
  emit: (
    eventType: MediaEventType,
    extra?: Omit<
      CreateMediaEventInput,
      "eventType" | "occurredAt" | "episodeId" | "mediaId" | "mediaSourceId"
    >,
  ) => void;
  cache: FineGrainedCacheStore | null;
  analysisSource: MediaAsset;
  scenes: Scene[];
  scenesRef: ArtifactRef | null;
  stageCacheKey: string;
  keyframeExtractor: KeyframeExtractor;
  config: KeyframeExtractionConfig;
  dependencies: readonly ArtifactDependency[];
  analysisSourceRef: ArtifactRef;
  usedProxy: boolean;
  durationMs: number | null;
  status: MediaUnderstandingStatus | null;
}): Promise<{
  refs: ArtifactRef[];
  artifacts: {descriptor: KeyframeDescriptor; ref: ArtifactRef}[];
  cacheHit: boolean;
  reused: boolean;
}> => {
  const emit = input.emit;
  emit("media.keyframes.started", {});
  try {
    const analysisSourcePath = resolveMediaRepositoryPath(
      input.repoRoot,
      input.analysisSource.artifactRef.path,
    );
    const keyframeMediaType = input.config.mediaType;
    const artifacts: {descriptor: KeyframeDescriptor; ref: ArtifactRef}[] = [];
    let cacheHits = 0;
    let reusedCount = 0;

    const statusEntries = input.status?.stages.keyframes?.entries ?? [];
    const statusReusable =
      input.status?.stages.keyframes?.cacheKey === input.stageCacheKey &&
      statusEntries.length === input.scenes.length;

    for (const [keyframeIndex, scene] of input.scenes.entries()) {
      const timestampMs = representativeKeyframeTimestamp({
        sceneStartMs: scene.startMs,
        sceneEndMs: scene.endMs,
        durationMs: input.durationMs,
      });
      const filename = keyframeFilename(scene.sceneIndex, timestampMs);
      const repositoryPath = mediaKeyframeRepositoryPath(
        input.episodeId,
        input.mediaSlug,
        filename,
      );
      const artifactId = `${input.episodeId}:media-keyframe:${artifactSlugOf(input.mediaId, input.episodeId)}-${scene.sceneIndex}-${timestampMs}`;
      const cacheKey = buildMediaKeyframeCacheKey({
        stageCacheKey: input.stageCacheKey,
        sceneIndex: scene.sceneIndex,
        timestampMs,
      });
      const dependencies = [
        ...(input.scenesRef ? readDependencies([input.scenesRef]) : []),
        ...input.dependencies,
      ];

      let bytes: Buffer | null = null;
      if (input.cache) {
        const looked = input.cache.lookup({
          kind: "media-keyframes",
          cacheKey,
          stage: "media-keyframes",
          logicalItem: `${input.mediaId}:keyframe:${keyframeIndex}`,
          validateMetadata: (value) => {
            const parsed = z
              .object({
                schemaVersion: z.literal("media-keyframe-cache-metadata-v1"),
                episodeId: episodeIdSchema,
                mediaId: z.string().min(1),
                mediaSha256: sha256Schema,
                cacheKey: sha256Schema,
                sceneIndex: z.number().int().nonnegative(),
                timestampMs: z.number().int().nonnegative(),
                artifactId: z.string().min(1),
              })
              .strict()
              .parse(value);
            if (
              parsed.episodeId !== input.episodeId ||
              parsed.mediaId !== input.mediaId ||
              parsed.mediaSha256 !== input.mediaSha256 ||
              parsed.cacheKey !== cacheKey ||
              parsed.sceneIndex !== scene.sceneIndex ||
              parsed.timestampMs !== timestampMs ||
              parsed.artifactId !== artifactId
            ) {
              throw new Error("media keyframe cache metadata mismatch");
            }
            return parsed;
          },
        });
        if (looked.hit) {
          bytes = looked.bytes;
          cacheHits += 1;
          emit("media.understanding.cache.hit", {
            cacheKey,
            sha256: looked.entry.payload.sha256,
            sizeBytes: looked.entry.payload.sizeBytes,
            mediaType: keyframeMediaType,
            availability: "available",
            reason: `media-keyframes:${keyframeIndex}`,
          });
        } else {
          emit("media.understanding.cache.miss", {
            cacheKey,
            reason: `media-keyframes:${keyframeIndex}:${looked.reason}`,
          });
        }
      }
      if (bytes === null && statusReusable) {
        const entry = statusEntries[keyframeIndex];
        if (
          entry &&
          entry.keyframeIndex === keyframeIndex &&
          entry.cacheKey === cacheKey &&
          artifactFileValid(input.repoRoot, entry.ref)
        ) {
          artifacts.push({
            descriptor: {keyframeIndex, sceneIndex: scene.sceneIndex, timestampMs, filename},
            ref: entry.ref,
          });
          reusedCount += 1;
          continue;
        }
      }
      if (bytes === null) {
        const outputPath = resolveMediaRepositoryPath(input.repoRoot, repositoryPath);
        fs.mkdirSync(path.dirname(outputPath), {recursive: true});
        input.keyframeExtractor.extract({
          inputPath: analysisSourcePath,
          timestampMs,
          outputPath,
        });
        bytes = fs.readFileSync(outputPath);
      }
      const ref = publishIndexArtifact({
        repoRoot: input.repoRoot,
        episodeId: input.episodeId,
        repositoryPath,
        artifactId,
        schemaVersion: "media-keyframe-v1",
        mediaType: keyframeMediaType,
        producer: `${MEDIA_UNDERSTANDING_TOOL_VERSION}:keyframes:${input.keyframeExtractor.version}`,
        bytes,
        dependencies,
        executionId: `media-understanding:${input.mediaId}:keyframes`,
        now: input.now,
      });
      artifacts.push({
        descriptor: {keyframeIndex, sceneIndex: scene.sceneIndex, timestampMs, filename},
        ref,
      });
      if (input.cache && bytes !== null) {
        input.cache.put({
          kind: "media-keyframes",
          cacheKey,
          stage: "media-keyframes",
          logicalItem: `${input.mediaId}:keyframe:${keyframeIndex}`,
          mediaType: keyframeMediaType,
          bytes,
          metadata: {
            schemaVersion: "media-keyframe-cache-metadata-v1",
            episodeId: input.episodeId,
            mediaId: input.mediaId,
            mediaSha256: input.mediaSha256,
            cacheKey,
            sceneIndex: scene.sceneIndex,
            timestampMs,
            artifactId,
          },
        });
      }
    }

    const first = artifacts[0];
    const count = artifacts.length;
    emit("media.keyframes.completed", {
      ...(first ? {artifactRef: first.ref} : {}),
      ...(first ? {sha256: first.ref.sha256} : {}),
      ...(first ? {sizeBytes: first.ref.sizeBytes} : {}),
      mediaType: keyframeMediaType,
      availability: "available",
      reason: `produced:${count}-keyframes`,
    });
    return {
      refs: artifacts.map(({ref}) => ref),
      artifacts,
      cacheHit: cacheHits === input.scenes.length && input.scenes.length > 0,
      reused: reusedCount === input.scenes.length && input.scenes.length > 0,
    };
  } catch (error) {
    emit("media.keyframes.failed", {reason: errorMessage(error)});
    throw error;
  }
};

/* ------------------------------------------------------------------------- *
 * Clip index body
 * ------------------------------------------------------------------------- */

const buildClipIndexBody = async (input: {
  episodeId: string;
  mediaId: string;
  mediaRef: ArtifactRef;
  analysisSourceRef: ArtifactRef;
  sourceSha256: string;
  kind: "video" | "audio";
  transcript: {
    availability: "available" | "unavailable";
    ref: ArtifactRef | null;
    segments: MediaTranscript["segments"];
  };
  scenes: {availability: "available"; ref: ArtifactRef | null; scenes: Scene[]} | null;
  keyframes: {refs: {descriptor: KeyframeDescriptor; ref: ArtifactRef}[]} | null;
  transcriptProvider: TranscriptProvider;
  sceneDetector: SceneDetector;
  keyframeExtractor: KeyframeExtractor;
  semanticAdapter: SemanticUnderstandingAdapter;
  clipWindowConfig: ClipWindowConfig;
  windows: ClipWindow[];
}): Promise<ClipIndex> => {
  const items: ClipIndexItem[] = [];
  for (const [windowIndex, window] of input.windows.entries()) {
    const observedText = observedTextForWindow({
      segments: input.transcript.segments,
      segmentIndices: window.segmentIndices,
    });
    let semantic: SemanticMetadata;
    try {
      semantic = semanticMetadataParse(
        await input.semanticAdapter.describe({
          episodeId: input.episodeId,
          mediaId: input.mediaId,
          mediaRef: input.mediaRef,
          startMs: window.startMs,
          endMs: window.endMs,
          observedText,
        }),
      );
    } catch (error) {
      throw new Error(`MEDIA_INDEX_SEMANTIC_METADATA_INVALID:${windowIndex}`, {cause: error});
    }
    const windowSegments = input.transcript.segments.filter((segment) =>
      window.segmentIndices.includes(segment.index),
    );
    const speakers = [...new Set(windowSegments.map((segment) => segment.speaker))];
    const speaker = semantic.speaker ?? (speakers.length === 1 ? (speakers[0] ?? null) : null);
    const keyframesInWindow =
      input.keyframes?.refs.filter(
        ({descriptor}) =>
          descriptor.timestampMs >= window.startMs && descriptor.timestampMs < window.endMs,
      ) ?? [];
    items.push(
      clipIndexItemSchema.parse({
        clipId: buildClipId({
          episodeId: input.episodeId,
          mediaId: input.mediaId,
          startMs: window.startMs,
          endMs: window.endMs,
          config: input.clipWindowConfig,
          indexVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
        }),
        episodeId: input.episodeId,
        mediaRef: input.mediaRef,
        startMs: window.startMs,
        endMs: window.endMs,
        transcriptRefs:
          input.transcript.availability === "available" && input.transcript.ref
            ? [input.transcript.ref]
            : [],
        sceneRefs: window.sceneIndices.length > 0 && input.scenes?.ref ? [input.scenes.ref] : [],
        keyframeRefs: keyframesInWindow.map(({ref}) => ref),
        textSummary: semantic.textSummary,
        keywords: semantic.keywords,
        entities: semantic.entities,
        speaker,
        observedText,
        semanticTags: semantic.semanticTags,
        sourceSha256: input.sourceSha256,
        indexVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
      }),
    );
  }
  return clipIndexSchema.parse({
    schemaVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    mediaRef: input.mediaRef,
    analysisSourceRef: input.analysisSourceRef,
    sourceSha256: input.sourceSha256,
    indexVersion: MEDIA_CLIP_INDEX_SCHEMA_VERSION,
    clipWindowConfig: input.clipWindowConfig,
    transcriptAvailability: input.transcript.availability,
    scenesAvailability: input.scenes ? "available" : "not-applicable",
    keyframesAvailability: input.keyframes ? "available" : "not-applicable",
    semanticAvailability: "available",
    asrProvider: input.transcriptProvider.id,
    asrModel: input.transcriptProvider.model,
    sceneDetector: input.scenes ? input.sceneDetector.id : null,
    sceneDetectorVersion: input.scenes ? input.sceneDetector.version : null,
    keyframeTool: input.keyframes ? input.keyframeExtractor.id : null,
    keyframeToolVersion: input.keyframes ? input.keyframeExtractor.version : null,
    semanticAdapter: input.semanticAdapter.id,
    semanticAdapterVersion: input.semanticAdapter.version,
    items,
  });
};

/* ------------------------------------------------------------------------- *
 * Readers
 * ------------------------------------------------------------------------- */

const readIndexJson = <T>(input: {
  repoRoot: string;
  episodeId: string;
  mediaId: string;
  repositoryPath: string;
  schema: z.ZodType<T>;
  missingCode: string;
}): T => {
  const filePath = resolveMediaRepositoryPath(input.repoRoot, input.repositoryPath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${input.missingCode}:${input.mediaId}`);
  }
  const parsed = input.schema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  const record = parsed as unknown as {episodeId?: unknown; mediaId?: unknown};
  if (record.episodeId !== input.episodeId || record.mediaId !== input.mediaId) {
    throw new Error(`MEDIA_INDEX_ARTIFACT_MISMATCH:${input.mediaId}`);
  }
  return parsed;
};

export const readMediaTranscript = (
  repoRoot: string,
  episodeId: string,
  mediaId: string,
): MediaTranscript =>
  readIndexJson({
    repoRoot,
    episodeId,
    mediaId,
    repositoryPath: mediaTranscriptRepositoryPath(episodeId, slugOf(mediaId, episodeId)),
    schema: mediaTranscriptSchema,
    missingCode: "MEDIA_TRANSCRIPT_MISSING",
  });

export const readMediaScenes = (
  repoRoot: string,
  episodeId: string,
  mediaId: string,
): MediaScenes =>
  readIndexJson({
    repoRoot,
    episodeId,
    mediaId,
    repositoryPath: mediaScenesRepositoryPath(episodeId, slugOf(mediaId, episodeId)),
    schema: mediaScenesSchema,
    missingCode: "MEDIA_SCENES_MISSING",
  });

export const readMediaClipIndex = (
  repoRoot: string,
  episodeId: string,
  mediaId: string,
): ClipIndex =>
  readIndexJson({
    repoRoot,
    episodeId,
    mediaId,
    repositoryPath: mediaClipIndexRepositoryPath(episodeId, slugOf(mediaId, episodeId)),
    schema: clipIndexSchema,
    missingCode: "MEDIA_CLIP_INDEX_MISSING",
  });

/** Lists persisted keyframe files (basenames) for one media index. */
export const listMediaKeyframes = (
  repoRoot: string,
  episodeId: string,
  mediaId: string,
): string[] => {
  const directory = resolveMediaRepositoryPath(
    repoRoot,
    mediaKeyframesDirectoryRepositoryPath(episodeId, slugOf(mediaId, episodeId)),
  );
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((filename) => /^keyframe-.*\.jpg$/u.test(filename))
    .sort();
};
