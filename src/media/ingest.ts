import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {finished} from "node:stream/promises";
import {z} from "zod";
import {
  FineGrainedCacheStore,
  createCacheEventSink,
  sha256File,
  sha256Json,
  stableCacheJson,
} from "../lib/platform/cache";
import {assertSpawnSucceeded} from "../lib/platform/process";
import {
  emptyArtifactIndex,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  writeArtifactIndexCas,
} from "../orchestration/artifact-registry";
import {readHumanDecision} from "../orchestration/human-decision";
import {episodeIdSchema} from "../orchestration/identity";
import {artifactDependencySchema, type ArtifactDependency} from "../orchestration/schemas/artifact";
import {mediaDiscoveryFileConfig} from "./discovery-config";
import {getMediaSource, isMediaSourceAdmitted, isMediaSourceRightsApproved} from "./discovery";
import {
  createMediaEvent,
  createMediaEventSink,
  type CreateMediaEventInput,
  type MediaEventSink,
  type MediaEventType,
} from "./events";
import {mediaIngestFileConfig, type MediaIngestConfig} from "./ingest-config";
import {
  buildMediaArtifactRef,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaAsset,
  writeMediaSourceManifestCas,
} from "./manifest";
import {
  mediaAssetRepositoryPath,
  mediaCacheEventsRepositoryPath,
  mediaTmpRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";
import {
  containersCompatible,
  normalizedFrameRate,
  probeMediaFile,
  type MediaProbe,
  type MediaProbeCategory,
} from "./probe";
import {
  mediaAssetSchema,
  mediaSourceSchema,
  type MediaAsset,
  type MediaSource,
  type MediaSourceManifest,
} from "./schemas";

/**
 * WP-M5.03 media ingest + normalization.
 *
 * Flow per source: deterministic gate (admission + rights HumanDecisions,
 * episode scope) → acquire bytes through an injectable adapter → hash + probe
 * → atomic publish under `media/assets/` → register MediaAsset + ArtifactRef →
 * deterministic H.264 proxy when the input is video → cache + observability.
 *
 * Fail-closed everywhere: a partial download, a probe failure, a MIME/extension
 * conflict, a tampered original/proxy, or a non-approved gate never reaches the
 * registry. HumanDecisions are read-only here — ingest never grants rights.
 */

export const MEDIA_INGEST_TOOL_VERSION = "media-ingest-v1";
export const MEDIA_NORMALIZE_CACHE_SCHEMA_VERSION = "media-normalize-cache-v1";
export const MEDIA_NORMALIZE_CACHE_IMPLEMENTATION_VERSION = "media-normalize-cache-impl-v1";
export const MEDIA_NORMALIZE_METADATA_SCHEMA_VERSION = "media-normalize-metadata-v1";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const MEDIA_NORMALIZE_DEPENDENCY_PATHS = [
  "config/media-ingest.json",
  "src/media/ingest-config.ts",
  "src/media/ingest.ts",
  "src/media/probe.ts",
] as const;

/* ------------------------------------------------------------------------- *
 * Acquisition adapters
 * ------------------------------------------------------------------------- */

export type AcquiredMediaFile = {
  /** Absolute path of the acquired bytes inside the ingest temp area. */
  filePath: string;
  /** Basename from the source (URL path or local file); provenance only. */
  originalFilename: string;
  /** Content type declared by the source; null when absent or unknown. */
  declaredContentType: string | null;
};

export type MediaAcquisitionContext = {
  repoRoot: string;
  episodeId: string;
  source: MediaSource;
  tempDirectory: string;
  config: MediaIngestConfig;
};

export interface MediaAcquisitionAdapter {
  readonly id: string;
  acquire(context: MediaAcquisitionContext): Promise<AcquiredMediaFile>;
}

const assertSizeWithinLimit = (sizeBytes: number, config: MediaIngestConfig): void => {
  if (sizeBytes > config.maxDownloadBytes) {
    throw new Error(`MEDIA_INGEST_DOWNLOAD_TOO_LARGE:${sizeBytes}:${config.maxDownloadBytes}`);
  }
};

const filenameFromUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "download";
  }
  const raw = path.posix.basename(parsed.pathname);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep the raw basename when the URL is not valid percent-encoding
  }
  const sanitized = Array.from(decoded)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f && character !== "/" && character !== "\\";
    })
    .join("")
    .trim();
  return sanitized.length > 0 ? sanitized.slice(0, 200) : "download";
};

const canonicalizeContentType = (value: string): string =>
  value.split(";")[0]!.trim().toLowerCase();

/**
 * Local `local-approved` source adapter. Copies the operator-provided file into
 * the ingest temp area; the file must exist, be a regular file, and respect the
 * configured size ceiling.
 */
export const createLocalFileAcquisitionAdapter = (input: {
  localFilePath: string;
}): MediaAcquisitionAdapter => {
  const localFilePath = path.resolve(input.localFilePath);
  return {
    id: "local-file",
    acquire: async ({tempDirectory, config}) => {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(localFilePath);
      } catch (error) {
        throw new Error(`MEDIA_INGEST_LOCAL_FILE_MISSING:${localFilePath}`, {cause: error});
      }
      if (!stat.isFile()) {
        throw new Error(`MEDIA_INGEST_LOCAL_FILE_NOT_A_FILE:${localFilePath}`);
      }
      assertSizeWithinLimit(stat.size, config);
      const destination = path.join(tempDirectory, "acquired");
      fs.copyFileSync(localFilePath, destination);
      return {
        filePath: destination,
        originalFilename: path.basename(localFilePath),
        declaredContentType: null,
      };
    },
  };
};

/**
 * HTTPS acquisition adapter. Plain GET only: it never carries credentials,
 * never follows off-allowlist redirects, and never bypasses login, DRM,
 * paywalls, or platform restrictions — a 401/403/404 fails closed. Content
 * type, Content-Length, and the byte ceiling are enforced; a body shorter than
 * the declared Content-Length is a partial download and fails.
 */
export const createHttpsAcquisitionAdapter = (
  input: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): MediaAcquisitionAdapter => {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    id: "https",
    acquire: async ({source, tempDirectory, config}) => {
      let parsed: URL;
      try {
        parsed = new URL(source.sourceUrl);
      } catch {
        throw new Error(`MEDIA_INGEST_URL_INVALID:${source.sourceUrl}`);
      }
      if (parsed.protocol !== "https:") {
        throw new Error(`MEDIA_INGEST_HTTPS_REQUIRED:${source.sourceUrl}`);
      }
      if (!mediaDiscoveryFileConfig.allowedHosts.includes(parsed.hostname)) {
        throw new Error(`MEDIA_INGEST_HOST_NOT_ALLOWED:${parsed.hostname}`);
      }
      let response: Response;
      try {
        response = await fetchImpl(source.sourceUrl, {
          redirect: "follow",
          signal: AbortSignal.timeout(input.timeoutMs ?? config.downloadTimeoutMs),
        });
      } catch (error) {
        throw new Error(`MEDIA_INGEST_DOWNLOAD_FAILED:${source.sourceUrl}`, {cause: error});
      }
      if (!response.ok) {
        // 401/403 (login/paywall/DRM) and any other non-2xx is never bypassed.
        throw new Error(`MEDIA_INGEST_DOWNLOAD_REJECTED:${response.status}`);
      }
      if (response.url) {
        const finalUrl = new URL(response.url);
        if (!mediaDiscoveryFileConfig.allowedHosts.includes(finalUrl.hostname)) {
          throw new Error(`MEDIA_INGEST_HOST_NOT_ALLOWED:${finalUrl.hostname}`);
        }
      }
      const declaredContentType = response.headers.get("content-type")
        ? canonicalizeContentType(response.headers.get("content-type") as string)
        : null;
      if (declaredContentType && !config.allowedContentTypes.includes(declaredContentType)) {
        throw new Error(`MEDIA_INGEST_CONTENT_TYPE_NOT_ALLOWED:${declaredContentType}`);
      }
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
      if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0)) {
        throw new Error(`MEDIA_INGEST_DOWNLOAD_REJECTED:invalid-content-length`);
      }
      if (contentLength !== null) assertSizeWithinLimit(contentLength, config);

      const destination = path.join(tempDirectory, "acquired");
      const output = fs.createWriteStream(destination);
      const reader = response.body?.getReader();
      if (!reader) {
        output.destroy();
        throw new Error("MEDIA_INGEST_DOWNLOAD_EMPTY");
      }
      let received = 0;
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          received += value.byteLength;
          assertSizeWithinLimit(received, config);
          output.write(value);
        }
        output.end();
        await finished(output);
      } catch (error) {
        output.destroy();
        await reader.cancel().catch(() => undefined);
        throw error;
      }
      if (contentLength !== null && received !== contentLength) {
        throw new Error(`MEDIA_INGEST_DOWNLOAD_PARTIAL:${received}:${contentLength}`);
      }
      return {
        filePath: destination,
        originalFilename: filenameFromUrl(response.url || source.sourceUrl),
        declaredContentType,
      };
    },
  };
};

const defaultAdapterFor = (input: {
  source: MediaSource;
  localFilePath?: string;
}): MediaAcquisitionAdapter => {
  if (input.source.sourceType === "local-approved") {
    if (!input.localFilePath) {
      throw new Error(`MEDIA_INGEST_LOCAL_FILE_REQUIRED:${input.source.sourceId}`);
    }
    return createLocalFileAcquisitionAdapter({localFilePath: input.localFilePath});
  }
  return createHttpsAcquisitionAdapter();
};

/* ------------------------------------------------------------------------- *
 * Media type / extension resolution
 * ------------------------------------------------------------------------- */

type ExtensionMediaInfo = {
  mediaType: string;
  container: string;
  category: MediaProbeCategory;
};

const EXTENSION_MEDIA_INFO: Record<string, ExtensionMediaInfo> = {
  mp4: {mediaType: "video/mp4", container: "mp4", category: "video"},
  m4v: {mediaType: "video/mp4", container: "mp4", category: "video"},
  mov: {mediaType: "video/quicktime", container: "mov", category: "video"},
  webm: {mediaType: "video/webm", container: "webm", category: "video"},
  mkv: {mediaType: "video/x-matroska", container: "mkv", category: "video"},
  avi: {mediaType: "video/x-msvideo", container: "avi", category: "video"},
  mpeg: {mediaType: "video/mpeg", container: "mpeg", category: "video"},
  mpg: {mediaType: "video/mpeg", container: "mpeg", category: "video"},
  mp3: {mediaType: "audio/mpeg", container: "mp3", category: "audio"},
  wav: {mediaType: "audio/wav", container: "wav", category: "audio"},
  m4a: {mediaType: "audio/mp4", container: "mp4", category: "audio"},
  aac: {mediaType: "audio/aac", container: "aac", category: "audio"},
  flac: {mediaType: "audio/flac", container: "flac", category: "audio"},
  ogg: {mediaType: "audio/ogg", container: "ogg", category: "audio"},
  jpg: {mediaType: "image/jpeg", container: "jpeg", category: "image"},
  jpeg: {mediaType: "image/jpeg", container: "jpeg", category: "image"},
  png: {mediaType: "image/png", container: "png", category: "image"},
  webp: {mediaType: "image/webp", container: "webp", category: "image"},
  gif: {mediaType: "image/gif", container: "gif", category: "image"},
};

const EXTENSION_FOR_MEDIA_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/mpeg": "mpeg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const extensionForMediaType = (mediaType: string): string => {
  const extension = EXTENSION_FOR_MEDIA_TYPE[mediaType];
  if (!extension) {
    throw new Error(`MEDIA_INGEST_UNSUPPORTED_MEDIA:${mediaType}`);
  }
  return extension;
};

const extensionOf = (filename: string): string | null => {
  const base = path.basename(filename);
  const index = base.lastIndexOf(".");
  if (index <= 0 || index === base.length - 1) return null;
  const extension = base.slice(index + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/u.test(extension) ? extension : null;
};

const mediaTypesEquivalent = (left: string, right: string): boolean => {
  if (left === right) return true;
  // The mp4/mov family shares an ffmpeg demuxer; subtype labels are interchangeable.
  const mp4Family = new Set(["video/mp4", "video/quicktime"]);
  return mp4Family.has(left) && mp4Family.has(right);
};

/**
 * Resolves the stored media type from the real probe, cross-checking the
 * source filename extension and any declared content type. Obvious conflicts
 * (category flip, incompatible container, contradictory MIME) fail closed.
 */
const resolveStoredMediaType = (input: {
  originalFilename: string;
  probe: MediaProbe;
  declaredContentType: string | null;
  config: MediaIngestConfig;
}): string => {
  const extension = extensionOf(input.originalFilename);
  const extensionInfo = extension ? EXTENSION_MEDIA_INFO[extension] : undefined;
  if (extensionInfo && extensionInfo.category !== input.probe.category) {
    throw new Error(
      `MEDIA_INGEST_EXTENSION_PROBE_MISMATCH:${extension}:${input.probe.category ?? "unknown"}`,
    );
  }
  if (!containersCompatible(extensionInfo?.container ?? null, input.probe.canonicalContainer)) {
    throw new Error(
      `MEDIA_INGEST_EXTENSION_PROBE_MISMATCH:${extension}:${input.probe.containerFormat ?? "unknown"}`,
    );
  }
  if (input.declaredContentType) {
    const declared = canonicalizeContentType(input.declaredContentType);
    const expected = extensionInfo?.mediaType ?? input.probe.mediaType;
    if (!expected || !mediaTypesEquivalent(declared, expected)) {
      throw new Error(`MEDIA_INGEST_MIME_PROBE_MISMATCH:${declared}:${expected ?? "unknown"}`);
    }
  }
  const resolved = extensionInfo?.mediaType ?? input.probe.mediaType;
  if (!resolved) {
    throw new Error("MEDIA_INGEST_UNSUPPORTED_MEDIA");
  }
  if (!input.config.allowedContentTypes.includes(resolved)) {
    throw new Error(`MEDIA_INGEST_MEDIA_TYPE_NOT_ALLOWED:${resolved}`);
  }
  return resolved;
};

/* ------------------------------------------------------------------------- *
 * Ingest gate
 * ------------------------------------------------------------------------- */

const assertMediaIdForEpisode = (mediaId: string, episodeId: string): void => {
  if (!mediaId.startsWith(`${episodeId}:media:`)) {
    if (/^episode-[a-z0-9-]+:media:/u.test(mediaId)) {
      throw new Error(`MEDIA_INGEST_MEDIA_ID_EPISODE_MISMATCH:${mediaId}:${episodeId}`);
    }
    throw new Error(`MEDIA_INGEST_MEDIA_ID_INVALID:${mediaId}`);
  }
  // ArtifactRef artifactIds only allow [a-z0-9-] in the final segment.
  const slug = mediaId.slice(`${episodeId}:media:`.length);
  if (!/^[a-z0-9-]+$/u.test(slug)) {
    throw new Error(`MEDIA_INGEST_MEDIA_ID_INVALID:${mediaId}`);
  }
};

/**
 * The ingest gate. Only a source that is formally admitted AND rights-approved
 * through persisted, hash-bound HumanDecisions may be ingested. Everything else
 * fails closed. Ingest itself never grants or changes rights.
 */
const assertSourceIngestible = (input: {
  repoRoot: string;
  manifest: MediaSourceManifest;
  source: MediaSource;
}): void => {
  const parsed = mediaSourceSchema.parse(input.source);
  if (parsed.episodeId !== input.manifest.episodeId) {
    throw new Error(`MEDIA_INGEST_EPISODE_MISMATCH:${parsed.sourceId}`);
  }
  if (!isMediaSourceAdmitted(parsed)) {
    throw new Error(`MEDIA_INGEST_SOURCE_NOT_ADMITTED:${parsed.sourceId}`);
  }
  if (!isMediaSourceRightsApproved(parsed)) {
    throw new Error(`MEDIA_INGEST_RIGHTS_NOT_APPROVED:${parsed.sourceId}`);
  }
  // Lineage integrity: the decisions the source points at must still be the
  // exact persisted bytes (a tampered decision fails closed here).
  if (parsed.admissionDecisionRef) {
    readHumanDecision(input.repoRoot, parsed.admissionDecisionRef, parsed.episodeId);
  }
  if (parsed.rightsDecisionRef) {
    readHumanDecision(input.repoRoot, parsed.rightsDecisionRef, parsed.episodeId);
  }
  if (parsed.sourceType !== "local-approved") {
    if (parsed.sourceUrl === "") {
      throw new Error(`MEDIA_INGEST_URL_REQUIRED:${parsed.sourceId}`);
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(parsed.sourceUrl);
    } catch {
      throw new Error(`MEDIA_INGEST_URL_INVALID:${parsed.sourceUrl}`);
    }
    if (parsedUrl.protocol !== "https:") {
      throw new Error(`MEDIA_INGEST_HTTPS_REQUIRED:${parsed.sourceUrl}`);
    }
    if (!mediaDiscoveryFileConfig.allowedHosts.includes(parsedUrl.hostname)) {
      throw new Error(`MEDIA_INGEST_HOST_NOT_ALLOWED:${parsedUrl.hostname}`);
    }
  }
};

/* ------------------------------------------------------------------------- *
 * Artifact registry + manifest helpers
 * ------------------------------------------------------------------------- */

const decisionDependencies = (source: MediaSource): ArtifactDependency[] => {
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

const registerCandidateInArtifactIndex = (input: {
  repoRoot: string;
  episodeId: string;
  ref: Parameters<typeof registerCandidate>[1];
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

const assertAcquiredFile = (input: {tempDirectory: string; acquired: AcquiredMediaFile}): void => {
  const absolute = path.resolve(input.acquired.filePath);
  const tempRoot = path.resolve(input.tempDirectory);
  const relative = path.relative(tempRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("MEDIA_INGEST_ACQUIRED_PATH_ESCAPES_TEMP");
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolute);
  } catch (error) {
    throw new Error("MEDIA_INGEST_ACQUIRED_NOT_A_FILE", {cause: error});
  }
  if (!stat.isFile()) {
    throw new Error("MEDIA_INGEST_ACQUIRED_NOT_A_FILE");
  }
};

const sweepStaleTmpDirectories = (tmpRoot: string, slug: string): void => {
  const prefix = `${slug}-`;
  let entries: string[];
  try {
    entries = fs.readdirSync(tmpRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(prefix)) {
      fs.rmSync(path.join(tmpRoot, entry), {recursive: true, force: true});
    }
  }
};

/**
 * Publishes verified bytes as an immutable original MediaAsset: atomic rename
 * into `media/assets/`, hash-bound ArtifactRef, manifest registration (CAS),
 * and an artifact-index candidate record.
 */
const publishMediaAsset = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
  source: MediaSource;
  mediaId: string;
  slug: string;
  mediaType: string;
  sha256: string;
  sizeBytes: number;
  probe: MediaProbe;
  acquired: AcquiredMediaFile;
  acquisitionMethod: MediaAsset["acquisitionMethod"];
  toolVersion: string;
  expectedVersion: string | null;
  now: () => string;
}): {asset: MediaAsset; manifest: MediaSourceManifest; version: string} => {
  const filename = `${input.slug}.${extensionForMediaType(input.mediaType)}`;
  const repositoryPath = mediaAssetRepositoryPath(input.episodeId, filename);
  const finalPath = resolveMediaRepositoryPath(input.repoRoot, repositoryPath);
  // Atomic publish: the temp bytes were hash-verified before this rename.
  fs.mkdirSync(path.dirname(finalPath), {recursive: true});
  fs.renameSync(input.acquired.filePath, finalPath);
  const artifactRef = buildMediaArtifactRef({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    filename,
    mediaType: input.mediaType,
    producer: input.toolVersion,
    createdAt: input.now(),
  });
  // Re-verify the actual bytes at their final location.
  if (artifactRef.sha256 !== input.sha256 || artifactRef.sizeBytes !== input.sizeBytes) {
    throw new Error(`MEDIA_INGEST_ASSET_TAMPERED:${input.mediaId}`);
  }
  const asset = mediaAssetSchema.parse({
    mediaId: input.mediaId,
    episodeId: input.episodeId,
    mediaSourceId: input.source.sourceId,
    sourceUrl: input.source.sourceUrl,
    publisher: input.source.publisher,
    sourceType: input.source.sourceType,
    acquisitionMethod: input.acquisitionMethod,
    originalFilename: input.acquired.originalFilename,
    mediaType: input.mediaType,
    sha256: artifactRef.sha256,
    sizeBytes: artifactRef.sizeBytes,
    durationMs: input.probe.durationMs,
    width: input.probe.width,
    height: input.probe.height,
    fps: input.probe.fps,
    audioChannels: input.probe.audioChannels,
    capturedAt: input.now(),
    accessedAt: input.now(),
    publishedAt: null,
    rightsBasis: input.source.rightsBasis,
    rightsStatus: input.source.rightsStatus,
    artifactRef,
    kind: "original",
  });
  const registered = registerMediaAsset({
    repoRoot: input.repoRoot,
    manifest: input.manifest,
    asset,
    updatedAt: input.now(),
  });
  const version = writeMediaSourceManifestCas({
    repoRoot: input.repoRoot,
    manifest: registered,
    expectedVersion: input.expectedVersion,
  });
  registerCandidateInArtifactIndex({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref: artifactRef,
    executionId: `media-ingest:${input.mediaId}`,
    dependencies: decisionDependencies(input.source),
  });
  return {asset, manifest: registered, version};
};

/* ------------------------------------------------------------------------- *
 * Normalization
 * ------------------------------------------------------------------------- */

export type NormalizationContract = {
  codec: string;
  preset: string;
  crf: number;
  pixelFormat: string;
  fps: number;
  audio: {
    codec: string;
    bitrate: string;
    channels: number;
    sampleRate: number;
  } | null;
  container: string;
  faststart: boolean;
};

const normalizationContractSchema = z
  .object({
    codec: z.string().min(1),
    preset: z.string().min(1),
    crf: z.number().int().min(0).max(51),
    pixelFormat: z.string().min(1),
    fps: z.number().positive(),
    audio: z
      .object({
        codec: z.string().min(1),
        bitrate: z.string().min(1),
        channels: z.number().int().positive(),
        sampleRate: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    container: z.string().min(1),
    faststart: z.boolean(),
  })
  .strict();

export type NormalizationContractInput = {
  probe: MediaProbe;
  config: MediaIngestConfig;
};

/** Deterministic proxy contract derived from the probed original + config. */
export const buildNormalizationContract = (
  input: NormalizationContractInput,
): NormalizationContract => ({
  codec: input.config.normalization.video.codec,
  preset: input.config.normalization.video.preset,
  crf: input.config.normalization.video.crf,
  pixelFormat: input.config.normalization.video.pixelFormat,
  fps: normalizedFrameRate(input.probe.fps),
  audio: input.probe.hasAudio
    ? {
        codec: input.config.normalization.video.audioCodec,
        bitrate: input.config.normalization.video.audioBitrate,
        channels: input.config.normalization.video.audioChannels,
        sampleRate: input.config.normalization.video.audioSampleRate,
      }
    : null,
  container: input.config.normalization.video.container,
  faststart: input.config.normalization.video.faststart,
});

const sortedHashes = (hashes: Record<string, string>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const key of Object.keys(hashes).sort()) {
    const value = hashes[key];
    if (!value || !/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`media normalize cache dependency hash invalid: ${key}`);
    }
    output[key] = value;
  }
  return output;
};

export type MediaNormalizeCacheKeyInput = {
  originalSha256: string;
  contract: NormalizationContract;
  toolVersion: string;
  dependencyHashes: Record<string, string>;
};

/**
 * Normalization cache identity: original bytes SHA + the full normalization
 * contract (codec/pixfmt/fps/audio) + tool version + dependency hashes. The
 * cache directory is episode-scoped on top of this key.
 */
export const buildMediaNormalizeCacheKey = (input: MediaNormalizeCacheKeyInput): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.originalSha256)) {
    throw new Error("media normalize cache originalSha256 must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_NORMALIZE_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_NORMALIZE_CACHE_IMPLEMENTATION_VERSION,
    originalSha256: input.originalSha256,
    contract: input.contract,
    toolVersion: input.toolVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

const normalizeMetadataSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_NORMALIZE_METADATA_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    mediaId: z.string().min(1),
    originalMediaId: z.string().min(1),
    originalSha256: sha256Schema,
    contract: normalizationContractSchema,
    toolVersion: z.string().min(1),
    mediaType: z.literal("video/mp4"),
    durationMs: z.number().int().nonnegative().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    fps: z.number().positive().nullable(),
    audioChannels: z.number().int().positive().nullable(),
  })
  .strict();

type NormalizeMetadata = z.infer<typeof normalizeMetadataSchema>;

const buildNormalizeMetadata = (input: {
  episodeId: string;
  mediaId: string;
  originalMediaId: string;
  originalSha256: string;
  contract: NormalizationContract;
  toolVersion: string;
  probe: MediaProbe;
}): NormalizeMetadata =>
  normalizeMetadataSchema.parse({
    schemaVersion: MEDIA_NORMALIZE_METADATA_SCHEMA_VERSION,
    episodeId: input.episodeId,
    mediaId: input.mediaId,
    originalMediaId: input.originalMediaId,
    originalSha256: input.originalSha256,
    contract: input.contract,
    toolVersion: input.toolVersion,
    mediaType: "video/mp4",
    durationMs: input.probe.durationMs,
    width: input.probe.width,
    height: input.probe.height,
    fps: input.probe.fps,
    audioChannels: input.probe.audioChannels,
  });

/**
 * A cache hit must still prove it describes exactly this input + contract.
 * Media ids are intentionally NOT part of the identity check: the cache is
 * content-addressed (original SHA + contract), so one valid payload may be
 * registered under several episode mediaIds.
 */
const parseNormalizeMetadata = (
  value: unknown,
  expected: {
    episodeId: string;
    originalSha256: string;
    contract: NormalizationContract;
    toolVersion: string;
  },
): NormalizeMetadata => {
  const parsed = normalizeMetadataSchema.parse(value);
  if (
    parsed.episodeId !== expected.episodeId ||
    parsed.originalSha256 !== expected.originalSha256 ||
    parsed.toolVersion !== expected.toolVersion ||
    stableCacheJson(parsed.contract) !== stableCacheJson(expected.contract)
  ) {
    throw new Error("media normalize cache metadata mismatch");
  }
  return parsed;
};

const assertValidProxyProbe = (probe: MediaProbe, contract: NormalizationContract): void => {
  const problems: string[] = [];
  if (probe.category !== "video") problems.push(`category=${probe.category ?? "unknown"}`);
  if (probe.canonicalContainer !== contract.container) {
    problems.push(`container=${probe.containerFormat ?? "unknown"}`);
  }
  if (probe.videoCodec !== "h264") problems.push(`codec=${probe.videoCodec ?? "unknown"}`);
  if (probe.pixelFormat !== contract.pixelFormat) {
    problems.push(`pixfmt=${probe.pixelFormat ?? "unknown"}`);
  }
  if (probe.fps !== null && Math.abs(probe.fps - contract.fps) > 0.1) {
    problems.push(`fps=${probe.fps}`);
  }
  if (probe.durationMs === null || probe.durationMs <= 0) problems.push("no-duration");
  if (problems.length > 0) {
    throw new Error(`MEDIA_INGEST_PROXY_PROBE_FAILED:${problems.join(",")}`);
  }
};

const runFfmpegNormalize = (input: {
  inputPath: string;
  outputPath: string;
  contract: NormalizationContract;
  ffmpegPath: string;
}): void => {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input.inputPath,
    "-map",
    "0:v:0",
    "-vf",
    `fps=${input.contract.fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    "-c:v",
    input.contract.codec,
    "-preset",
    input.contract.preset,
    "-crf",
    String(input.contract.crf),
    "-pix_fmt",
    input.contract.pixelFormat,
    "-r",
    String(input.contract.fps),
    "-threads",
    "1",
    ...(input.contract.audio
      ? [
          "-map",
          "0:a:0?",
          "-c:a",
          input.contract.audio.codec,
          "-b:a",
          input.contract.audio.bitrate,
          "-ac",
          String(input.contract.audio.channels),
          "-ar",
          String(input.contract.audio.sampleRate),
        ]
      : ["-an"]),
    ...(input.contract.faststart ? ["-movflags", "+faststart"] : []),
    input.outputPath,
  ];
  const result = spawnSync(input.ffmpegPath, args, {encoding: "utf8"});
  try {
    assertSpawnSucceeded(input.ffmpegPath, args, result);
  } catch (error) {
    throw new Error(
      `MEDIA_INGEST_NORMALIZE_FAILED:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
};

const publishProxyAsset = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
  source: MediaSource;
  original: MediaAsset;
  proxyMediaId: string;
  slug: string;
  filePath: string;
  probe: MediaProbe;
  contract: NormalizationContract;
  toolVersion: string;
  expectedVersion: string | null;
  now: () => string;
}): {asset: MediaAsset; manifest: MediaSourceManifest; version: string} => {
  const filename = `${input.slug}.mp4`;
  const repositoryPath = mediaAssetRepositoryPath(input.episodeId, filename);
  const finalPath = resolveMediaRepositoryPath(input.repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(finalPath), {recursive: true});
  fs.renameSync(input.filePath, finalPath);
  const artifactRef = buildMediaArtifactRef({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    mediaId: input.proxyMediaId,
    filename,
    mediaType: "video/mp4",
    producer: `${input.toolVersion}:normalize`,
    createdAt: input.now(),
  });
  const asset = mediaAssetSchema.parse({
    mediaId: input.proxyMediaId,
    episodeId: input.episodeId,
    mediaSourceId: input.original.mediaSourceId,
    sourceUrl: input.original.sourceUrl,
    publisher: input.original.publisher,
    sourceType: input.original.sourceType,
    acquisitionMethod: input.original.acquisitionMethod,
    originalFilename: filename,
    mediaType: "video/mp4",
    sha256: artifactRef.sha256,
    sizeBytes: artifactRef.sizeBytes,
    durationMs: input.probe.durationMs,
    width: input.probe.width,
    height: input.probe.height,
    fps: input.contract.fps,
    audioChannels: input.probe.audioChannels,
    capturedAt: input.now(),
    accessedAt: input.now(),
    publishedAt: null,
    rightsBasis: input.original.rightsBasis,
    rightsStatus: input.original.rightsStatus,
    artifactRef,
    kind: "proxy",
    derivedFromMediaId: input.original.mediaId,
    derivedFromMediaRef: input.original.artifactRef,
  });
  const registered = registerMediaAsset({
    repoRoot: input.repoRoot,
    manifest: input.manifest,
    asset,
    updatedAt: input.now(),
  });
  const version = writeMediaSourceManifestCas({
    repoRoot: input.repoRoot,
    manifest: registered,
    expectedVersion: input.expectedVersion,
  });
  registerCandidateInArtifactIndex({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref: artifactRef,
    executionId: `media-ingest:${input.proxyMediaId}`,
    dependencies: [
      artifactDependencySchema.parse({
        artifactId: input.original.artifactRef.artifactId,
        path: input.original.artifactRef.path,
        sha256: input.original.artifactRef.sha256,
        relation: "reads",
      }),
      ...decisionDependencies(input.source),
    ],
  });
  return {asset, manifest: registered, version};
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

export type NormalizeMediaAssetInput = {
  repoRoot: string;
  episodeId: string;
  original: MediaAsset;
  config?: MediaIngestConfig;
  cache?: FineGrainedCacheStore | null;
  eventSink?: MediaEventSink;
  cacheDependencyHashes?: Record<string, string>;
  ffmpegPath?: string;
  ffprobePath?: string;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export type NormalizeMediaAssetResult = {
  manifest: MediaSourceManifest;
  proxy: MediaAsset;
  version: string;
  /** True when the proxy bytes came from the fine-grained cache. */
  cacheHit: boolean;
  /** True when a valid proxy was already registered (idempotent replay). */
  reused: boolean;
};

/**
 * Deterministic normalization of an ingested original into a derived proxy
 * artifact. The cache is consulted only after the source gate and the original
 * byte integrity both pass, so a cache hit never bypasses rights/integrity
 * validation. A corrupt cache entry degrades to a miss and rebuild.
 */
export const normalizeMediaAsset = async (
  input: NormalizeMediaAssetInput,
): Promise<NormalizeMediaAssetResult> => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const config = input.config ?? mediaIngestFileConfig;
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});
  const original = mediaAssetSchema.parse(input.original);
  if (original.episodeId !== episodeId) {
    throw new Error(`MEDIA_INGEST_EPISODE_MISMATCH:${original.mediaId}`);
  }
  const slug = original.mediaId.slice(`${episodeId}:media:`.length);
  const proxySlug = `${slug.replace(/[^a-z0-9-]/gu, "-")}-proxy`;
  const proxyMediaId = `${episodeId}:media:${proxySlug}`;
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
        mediaId: proxyMediaId,
        mediaSourceId: original.mediaSourceId,
        kind: "proxy",
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        ...extra,
      }),
    );
  };

  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const source = getMediaSource(manifest, original.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_INGEST_SOURCE_UNKNOWN:${original.mediaSourceId}`);
  }
  // Rights/integrity validation runs before any cache consult.
  assertSourceIngestible({repoRoot, manifest, source});
  assertMediaAssetBytesOrThrow(repoRoot, original);

  const originalPath = resolveMediaRepositoryPath(repoRoot, original.artifactRef.path);
  const originalProbe = probeMediaFile(originalPath, input.ffprobePath);
  if (!config.normalization.enabled || originalProbe.category !== "video") {
    throw new Error(`MEDIA_INGEST_NORMALIZE_NOT_APPLICABLE:${original.mediaId}`);
  }
  const contract = buildNormalizationContract({probe: originalProbe, config});

  const existing = manifest.assets.find((asset) => asset.mediaId === proxyMediaId);
  if (existing) {
    if (existing.derivedFromMediaId !== original.mediaId) {
      throw new Error(`MEDIA_INGEST_PROXY_CONFLICT:${proxyMediaId}`);
    }
    assertMediaAssetBytesOrThrow(repoRoot, existing);
    return {
      manifest,
      proxy: existing,
      version: assertManifestVersion(repoRoot, episodeId),
      cacheHit: false,
      reused: true,
    };
  }

  emit("media.normalize.started", {});
  const cache = input.cache ?? createEnvironmentCache(repoRoot, episodeId);
  const cacheKey = cache
    ? buildMediaNormalizeCacheKey({
        originalSha256: original.sha256,
        contract,
        toolVersion: config.toolVersion,
        dependencyHashes:
          input.cacheDependencyHashes ??
          hashExistingRepositoryFiles(repoRoot, MEDIA_NORMALIZE_DEPENDENCY_PATHS),
      })
    : undefined;
  const expectedVersion = readMediaSourceManifestVersion(repoRoot, episodeId);

  try {
    if (cache && cacheKey) {
      const looked = cache.lookup({
        kind: "media-normalize",
        cacheKey,
        stage: "media-ingest",
        logicalItem: proxyMediaId,
        validateMetadata: (value) =>
          parseNormalizeMetadata(value, {
            episodeId,
            originalSha256: original.sha256,
            contract,
            toolVersion: config.toolVersion,
          }),
      });
      if (looked.hit) {
        emit("media.cache.hit", {
          cacheKey,
          sha256: looked.entry.payload.sha256,
          sizeBytes: looked.entry.payload.sizeBytes,
          mediaType: "video/mp4",
        });
        const tmpRoot = resolveMediaRepositoryPath(repoRoot, mediaTmpRepositoryPath(episodeId));
        fs.mkdirSync(tmpRoot, {recursive: true});
        const tempDirectory = fs.mkdtempSync(path.join(tmpRoot, `${proxySlug}-`));
        try {
          const cachedProxyPath = path.join(tempDirectory, "proxy.mp4");
          fs.writeFileSync(cachedProxyPath, looked.bytes);
          const proxyProbe = probeMediaFile(cachedProxyPath, input.ffprobePath);
          assertValidProxyProbe(proxyProbe, contract);
          const published = publishProxyAsset({
            repoRoot,
            episodeId,
            manifest,
            source,
            original,
            proxyMediaId,
            slug: proxySlug,
            filePath: cachedProxyPath,
            probe: proxyProbe,
            contract,
            toolVersion: config.toolVersion,
            expectedVersion,
            now,
          });
          emit("media.normalize.completed", {
            sha256: published.asset.sha256,
            sizeBytes: published.asset.sizeBytes,
            mediaType: published.asset.mediaType,
            artifactRef: published.asset.artifactRef,
          });
          return {
            manifest: published.manifest,
            proxy: published.asset,
            version: published.version,
            cacheHit: true,
            reused: false,
          };
        } finally {
          fs.rmSync(tempDirectory, {recursive: true, force: true});
        }
      }
      emit("media.cache.miss", {cacheKey, reason: looked.reason});
    }

    const tmpRoot = resolveMediaRepositoryPath(repoRoot, mediaTmpRepositoryPath(episodeId));
    fs.mkdirSync(tmpRoot, {recursive: true});
    const tempDirectory = fs.mkdtempSync(path.join(tmpRoot, `${proxySlug}-`));
    try {
      const outputPath = path.join(tempDirectory, "proxy.mp4");
      runFfmpegNormalize({
        inputPath: originalPath,
        outputPath,
        contract,
        ffmpegPath: input.ffmpegPath ?? "ffmpeg",
      });
      const proxyProbe = probeMediaFile(outputPath, input.ffprobePath);
      assertValidProxyProbe(proxyProbe, contract);
      // Read before publish: the rename below moves the temp file away.
      const proxyBytes = fs.readFileSync(outputPath);
      const published = publishProxyAsset({
        repoRoot,
        episodeId,
        manifest,
        source,
        original,
        proxyMediaId,
        slug: proxySlug,
        filePath: outputPath,
        probe: proxyProbe,
        contract,
        toolVersion: config.toolVersion,
        expectedVersion,
        now,
      });
      if (cache && cacheKey) {
        try {
          cache.put({
            kind: "media-normalize",
            cacheKey,
            stage: "media-ingest",
            logicalItem: proxyMediaId,
            mediaType: "video/mp4",
            bytes: proxyBytes,
            metadata: buildNormalizeMetadata({
              episodeId,
              mediaId: proxyMediaId,
              originalMediaId: original.mediaId,
              originalSha256: original.sha256,
              contract,
              toolVersion: config.toolVersion,
              probe: proxyProbe,
            }),
          });
        } catch (error) {
          console.warn(
            `media normalize cache write skipped for ${proxyMediaId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      emit("media.normalize.completed", {
        sha256: published.asset.sha256,
        sizeBytes: published.asset.sizeBytes,
        mediaType: published.asset.mediaType,
        artifactRef: published.asset.artifactRef,
      });
      return {
        manifest: published.manifest,
        proxy: published.asset,
        version: published.version,
        cacheHit: false,
        reused: false,
      };
    } finally {
      fs.rmSync(tempDirectory, {recursive: true, force: true});
    }
  } catch (error) {
    emit("media.normalize.failed", {reason: errorMessage(error)});
    throw error;
  }
};

/* ------------------------------------------------------------------------- *
 * Ingest entry point
 * ------------------------------------------------------------------------- */

const assertMediaAssetBytesOrThrow = (repoRoot: string, asset: MediaAsset): void => {
  const filePath = resolveMediaRepositoryPath(repoRoot, asset.artifactRef.path);
  let actual: Buffer;
  try {
    actual = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`MEDIA_INGEST_ASSET_TAMPERED:${asset.mediaId}`, {cause: error});
  }
  if (
    actual.byteLength !== asset.artifactRef.sizeBytes ||
    sha256File(filePath) !== asset.artifactRef.sha256
  ) {
    throw new Error(`MEDIA_INGEST_ASSET_TAMPERED:${asset.mediaId}`);
  }
};

const assertManifestVersion = (repoRoot: string, episodeId: string): string => {
  const version = readMediaSourceManifestVersion(repoRoot, episodeId);
  if (!version) {
    throw new Error(`MEDIA_SOURCE_MANIFEST_MISSING:${episodeId}`);
  }
  return version;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
};

export type IngestMediaSourceInput = {
  repoRoot: string;
  episodeId: string;
  sourceId: string;
  /** Episode-scoped `episode-<id>:media:<slug>` identity for the original. */
  mediaId: string;
  /** Injectable acquisition adapter; defaults to local-file/https by source type. */
  adapter?: MediaAcquisitionAdapter;
  /** Local file path required when the source type is `local-approved`. */
  localFilePath?: string;
  expectedManifestVersion?: string | null;
  cache?: FineGrainedCacheStore | null;
  config?: MediaIngestConfig;
  eventSink?: MediaEventSink;
  cacheDependencyHashes?: Record<string, string>;
  ffmpegPath?: string;
  ffprobePath?: string;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export type IngestMediaSourceResult = {
  manifest: MediaSourceManifest;
  original: MediaAsset;
  proxy: MediaAsset | null;
  version: string;
  /** True when a hash-valid original already existed (crash/resume reuse). */
  reused: boolean;
  normalizationCache: "hit" | "miss" | "skipped";
};

/**
 * Ingests one admission-approved + rights-approved source as an immutable
 * original MediaAsset, then normalizes it when it is a video. Idempotent:
 * repeating the same (source, mediaId, bytes) reuses the already published,
 * hash-valid work instead of re-acquiring.
 */
export const ingestMediaSource = async (
  input: IngestMediaSourceInput,
): Promise<IngestMediaSourceResult> => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId, sourceId, mediaId} = input;
  const config = input.config ?? mediaIngestFileConfig;
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});
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
        mediaSourceId: sourceId,
        kind: "original",
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        ...extra,
      }),
    );
  };

  assertMediaIdForEpisode(mediaId, episodeId);
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const source = getMediaSource(manifest, sourceId);
  if (!source) {
    throw new Error(`MEDIA_INGEST_SOURCE_UNKNOWN:${sourceId}`);
  }
  const existing = manifest.assets.find((asset) => asset.mediaId === mediaId);
  if (existing && existing.mediaSourceId !== sourceId) {
    throw new Error(`MEDIA_INGEST_MEDIA_ID_CONFLICT:${mediaId}`);
  }

  emit("media.ingest.started", {});
  try {
    // Deterministic gate: only a formally admitted + rights-approved source
    // with still-valid persisted decisions may be ingested.
    assertSourceIngestible({repoRoot, manifest, source});
    // Crash/resume: a hash-valid original means the acquisition work is done.
    if (existing) {
      assertMediaAssetBytesOrThrow(repoRoot, existing);
      const normalizeInput = {
        repoRoot,
        episodeId,
        original: existing,
        config,
        cache: input.cache,
        eventSink,
        cacheDependencyHashes: input.cacheDependencyHashes,
        ffmpegPath: input.ffmpegPath,
        ffprobePath: input.ffprobePath,
        runId: input.runId,
        traceId: input.traceId,
        now,
      };
      if (config.normalization.enabled && existing.mediaType.startsWith("video/")) {
        const normalized = await normalizeMediaAsset(normalizeInput);
        emit("media.ingest.completed", {
          sha256: existing.sha256,
          sizeBytes: existing.sizeBytes,
          mediaType: existing.mediaType,
          artifactRef: existing.artifactRef,
        });
        return {
          manifest: normalized.manifest,
          original: existing,
          proxy: normalized.proxy,
          version: normalized.version,
          reused: true,
          normalizationCache: normalized.reused ? "skipped" : normalized.cacheHit ? "hit" : "miss",
        };
      }
      emit("media.ingest.completed", {
        sha256: existing.sha256,
        sizeBytes: existing.sizeBytes,
        mediaType: existing.mediaType,
        artifactRef: existing.artifactRef,
      });
      return {
        manifest,
        original: existing,
        proxy: null,
        version: assertManifestVersion(repoRoot, episodeId),
        reused: true,
        normalizationCache: "skipped",
      };
    }

    const slug = mediaId.slice(`${episodeId}:media:`.length);
    const tmpRoot = resolveMediaRepositoryPath(repoRoot, mediaTmpRepositoryPath(episodeId));
    fs.mkdirSync(tmpRoot, {recursive: true});
    sweepStaleTmpDirectories(tmpRoot, slug);
    const tempDirectory = fs.mkdtempSync(path.join(tmpRoot, `${slug}-`));
    let original: MediaAsset;
    try {
      const adapter =
        input.adapter ?? defaultAdapterFor({source, localFilePath: input.localFilePath});
      const acquired = await adapter.acquire({
        repoRoot,
        episodeId,
        source,
        tempDirectory,
        config,
      });
      assertAcquiredFile({tempDirectory, acquired});
      const probe = probeMediaFile(acquired.filePath, input.ffprobePath);
      const mediaType = resolveStoredMediaType({
        originalFilename: acquired.originalFilename,
        probe,
        declaredContentType: acquired.declaredContentType,
        config,
      });
      const sha256 = sha256File(acquired.filePath);
      const sizeBytes = fs.statSync(acquired.filePath).size;
      const published = publishMediaAsset({
        repoRoot,
        episodeId,
        manifest,
        source,
        mediaId,
        slug,
        mediaType,
        sha256,
        sizeBytes,
        probe,
        acquired,
        acquisitionMethod: source.sourceType === "local-approved" ? "local-approved" : "download",
        toolVersion: config.toolVersion,
        expectedVersion:
          input.expectedManifestVersion ?? readMediaSourceManifestVersion(repoRoot, episodeId),
        now,
      });
      original = published.asset;
      if (config.normalization.enabled && original.mediaType.startsWith("video/")) {
        const normalized = await normalizeMediaAsset({
          repoRoot,
          episodeId,
          original,
          config,
          cache: input.cache,
          eventSink,
          cacheDependencyHashes: input.cacheDependencyHashes,
          ffmpegPath: input.ffmpegPath,
          ffprobePath: input.ffprobePath,
          runId: input.runId,
          traceId: input.traceId,
          now,
        });
        emit("media.ingest.completed", {
          sha256: original.sha256,
          sizeBytes: original.sizeBytes,
          mediaType: original.mediaType,
          artifactRef: original.artifactRef,
        });
        return {
          manifest: normalized.manifest,
          original,
          proxy: normalized.proxy,
          version: normalized.version,
          reused: false,
          normalizationCache: normalized.cacheHit ? "hit" : "miss",
        };
      }
    } finally {
      fs.rmSync(tempDirectory, {recursive: true, force: true});
    }
    emit("media.ingest.completed", {
      sha256: original!.sha256,
      sizeBytes: original!.sizeBytes,
      mediaType: original!.mediaType,
      artifactRef: original!.artifactRef,
    });
    return {
      manifest: readMediaSourceManifest(repoRoot, episodeId),
      original,
      proxy: null,
      version: assertManifestVersion(repoRoot, episodeId),
      reused: false,
      normalizationCache: "skipped",
    };
  } catch (error) {
    emit("media.ingest.failed", {kind: "original", reason: errorMessage(error)});
    throw error;
  }
};
