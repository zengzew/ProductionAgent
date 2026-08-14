import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {cacheEventSchema, type CacheEvent} from "../orchestration/schemas/cache-event";
import {episodeIdSchema} from "../orchestration/identity";
import {z} from "zod";

export const FINE_CACHE_ENTRY_SCHEMA_VERSION = "fine-cache-entry-v1" as const;
export const TTS_SEGMENT_CACHE_SCHEMA_VERSION = "tts-segment-cache-v1" as const;
export const SHOT_ASSET_CACHE_SCHEMA_VERSION = "shot-asset-cache-v1" as const;
export const TTS_CACHE_IMPLEMENTATION_VERSION = "tts-cache-implementation-v1" as const;
export const SHOT_CACHE_IMPLEMENTATION_VERSION = "shot-cache-implementation-v1" as const;

const sha256Schema = (value: string): boolean => /^[a-f0-9]{64}$/u.test(value);

const sortObjectKeys = (_key: string, value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
};

export const stableCacheJson = (value: unknown): string => {
  const serialized = JSON.stringify(value, sortObjectKeys);
  if (serialized === undefined) throw new TypeError("cache identity must be JSON serializable");
  return serialized;
};

export const sha256Bytes = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

export const sha256Json = (value: unknown): string =>
  sha256Bytes(Buffer.from(stableCacheJson(value), "utf8"));

const assertRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, repositoryPath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`cache dependency path escapes repository: ${repositoryPath}`);
  }
  return absolute;
};

export const sha256File = (filePath: string): string => sha256Bytes(fs.readFileSync(filePath));

export const hashRepositoryFiles = (
  repoRoot: string,
  repositoryPaths: readonly string[],
): Record<string, string> =>
  Object.fromEntries(
    [...new Set(repositoryPaths)].sort().map((repositoryPath) => {
      const absolute = assertRepositoryPath(repoRoot, repositoryPath);
      return [repositoryPath, sha256File(absolute)];
    }),
  );

export const normalizeNarration = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/gu, " ").trim();

const sortedHashes = (hashes: Record<string, string>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const key of Object.keys(hashes).sort()) {
    const value = hashes[key];
    if (!value || !sha256Schema(value)) {
      throw new Error(`cache dependency hash is invalid: ${key}`);
    }
    output[key] = value;
  }
  return output;
};

export type SegmentTtsCacheKeyInput = {
  normalizedNarration: string;
  provider: string;
  model: string;
  voice: string;
  speed: number;
  pitch: string | number;
  requestedProvider: string;
  ttsConfigVersion: string;
  configurationHash: string;
  dependencyHashes: Record<string, string>;
};

/** The key contains public generation parameters and hashes only; no credential or secret value. */
export const buildSegmentTtsCacheKey = (input: SegmentTtsCacheKeyInput): string => {
  if (!sha256Schema(input.configurationHash)) {
    throw new Error("TTS cache configurationHash must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: TTS_SEGMENT_CACHE_SCHEMA_VERSION,
    implementationVersion: TTS_CACHE_IMPLEMENTATION_VERSION,
    normalizedNarration: normalizeNarration(input.normalizedNarration),
    provider: input.provider,
    model: input.model,
    voice: input.voice,
    speed: input.speed,
    pitch: input.pitch,
    requestedProvider: input.requestedProvider,
    ttsConfigVersion: input.ttsConfigVersion,
    configurationHash: input.configurationHash,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

export type ShotAssetCacheKeyInput = {
  requestSpec: Record<string, unknown>;
  source: Record<string, unknown>;
  provenance: Record<string, unknown>;
  dependencyHashes: Record<string, string>;
  toolVersion: string;
};

/** Filename and episode-selected pointers are deliberately absent from this identity. */
export const buildShotAssetCacheKey = (input: ShotAssetCacheKeyInput): string =>
  sha256Json({
    cacheSchemaVersion: SHOT_ASSET_CACHE_SCHEMA_VERSION,
    implementationVersion: SHOT_CACHE_IMPLEMENTATION_VERSION,
    requestSpec: input.requestSpec,
    source: input.source,
    provenance: input.provenance,
    dependencyHashes: sortedHashes(input.dependencyHashes),
    toolVersion: input.toolVersion,
  });

const cacheKindSchema = z.enum(["tts-segment", "shot-asset"]);
export type CacheKind = z.infer<typeof cacheKindSchema>;

export const fineGrainedCacheEntrySchema = z
  .object({
    schemaVersion: z.literal(FINE_CACHE_ENTRY_SCHEMA_VERSION),
    kind: cacheKindSchema,
    cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
    logicalItem: z.string().min(1),
    mediaType: z.string().min(1),
    payload: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        sizeBytes: z.number().int().nonnegative(),
      })
      .strict(),
    metadata: z.unknown(),
    createdAt: z.string().datetime({offset: true}),
  })
  .strict();

export type CacheEntry = z.infer<typeof fineGrainedCacheEntrySchema>;

export type CacheLookupMiss = {
  hit: false;
  reason: string;
};

export type CacheLookupHit<T = unknown> = {
  hit: true;
  entry: CacheEntry;
  bytes: Buffer;
  metadata: T;
};

export type CacheLookup<T = unknown> = CacheLookupHit<T> | CacheLookupMiss;

export type CacheEventSink = (event: CacheEvent) => void;

export type FineGrainedCacheStoreOptions = {
  root: string;
  episodeId: string;
  eventSink?: CacheEventSink;
  now?: () => string;
  traceId?: string;
  executionId?: string;
  runId?: string;
  attempt?: number;
  revisionRound?: number;
  approvalEpoch?: number;
};

const cacheEventReason = (value: string): string => {
  const withoutSecrets = value
    .replace(/\b(?:sk|pk|api|access|refresh)[-_](?:key[-_])?[A-Za-z0-9_-]{12,}\b/giu, "[REDACTED]")
    .replace(/Bearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(
      /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token|password)\s*[:=]\s*[^\s,;]+/giu,
      "[REDACTED]",
    )
    .replace(
      /(?:x-amz-credential|x-amz-signature|sig(?:nature)?)\s*=\s*[^\s&;,]+/giu,
      "[REDACTED]",
    );
  return withoutSecrets.length <= 500 ? withoutSecrets : `${withoutSecrets.slice(0, 497)}...`;
};

const cacheEventId = (event: Omit<CacheEvent, "eventId">): string => sha256Json(event);

export const appendCacheEvent = (filePath: string, rawEvent: CacheEvent): void => {
  const event = cacheEventSchema.parse(rawEvent);
  const withoutId = {...event};
  Reflect.deleteProperty(withoutId, "eventId");
  if (cacheEventId(withoutId) !== event.eventId) {
    throw new Error(`CACHE_EVENT_TAMPERED:${event.eventId}`);
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  if (fs.existsSync(filePath)) {
    const existingLines = fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.length > 0);
    for (const line of existingLines) {
      const existing = cacheEventSchema.parse(JSON.parse(line) as unknown);
      if (existing.eventId !== event.eventId) continue;
      if (stableCacheJson(existing) === stableCacheJson(event)) return;
      throw new Error(`CACHE_EVENT_DUPLICATE_CONFLICT:${event.eventId}`);
    }
  }
  fs.appendFileSync(filePath, `${stableCacheJson(event)}\n`, {encoding: "utf8", flag: "a"});
};

export const createCacheEventSink =
  (filePath: string): CacheEventSink =>
  (event) => {
    try {
      appendCacheEvent(filePath, event);
    } catch {
      // Cache telemetry is best effort in this work package. It must not make a valid
      // production artifact unavailable; M4-04 owns the completeness gate.
    }
  };

const cacheKindDirectory = (root: string, episodeId: string, kind: CacheKind): string =>
  path.join(root, episodeId, kind);

export const cacheEntryPath = (
  root: string,
  episodeId: string,
  kind: CacheKind,
  key: string,
): string => {
  episodeIdSchema.parse(episodeId);
  if (!sha256Schema(key)) throw new Error("cache key must be a SHA-256 digest");
  return path.join(cacheKindDirectory(root, episodeId, kind), key);
};

const assertMetadataEpisode = (value: unknown, episodeId: string, location = "metadata"): void => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertMetadataEpisode(entry, episodeId, `${location}[${index}]`));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.episodeId === "string" && record.episodeId !== episodeId) {
    throw new Error(`CACHE_EPISODE_MISMATCH:${location}:${record.episodeId}:${episodeId}`);
  }
  for (const [key, entry] of Object.entries(record)) {
    assertMetadataEpisode(entry, episodeId, `${location}.${key}`);
  }
};

const entryFilePath = (directory: string): string => path.join(directory, "entry.json");
const payloadFilePath = (directory: string): string => path.join(directory, "payload.bin");

const isRegularFile = (filePath: string): boolean => {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
};

const writeAndSync = (filePath: string, bytes: Uint8Array): void => {
  const descriptor = fs.openSync(filePath, "w");
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

const replaceDirectoryAtomically = (temporary: string, target: string): void => {
  const backup = `${target}.backup-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const hadTarget = fs.existsSync(target);
  try {
    if (hadTarget) fs.renameSync(target, backup);
    fs.renameSync(temporary, target);
    if (hadTarget) fs.rmSync(backup, {recursive: true, force: true});
  } catch (error) {
    if (fs.existsSync(target)) fs.rmSync(target, {recursive: true, force: true});
    if (hadTarget && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {recursive: true, force: true});
    if (fs.existsSync(backup)) fs.rmSync(backup, {recursive: true, force: true});
  }
};

export class FineGrainedCacheStore {
  private readonly root: string;
  private readonly episodeId: string;
  private readonly eventSink?: CacheEventSink;
  private readonly now: () => string;
  private readonly traceId: string;
  private readonly executionId: string;
  private readonly runId: string | undefined;
  private readonly attempt: number | undefined;
  private readonly revisionRound: number | undefined;
  private readonly approvalEpoch: number | undefined;

  constructor(options: FineGrainedCacheStoreOptions) {
    this.root = path.resolve(options.root);
    this.episodeId = episodeIdSchema.parse(options.episodeId);
    this.eventSink = options.eventSink;
    this.now = options.now ?? (() => new Date().toISOString());
    this.traceId = options.traceId ?? `cache:${options.episodeId}`;
    this.executionId = options.executionId ?? this.traceId;
    this.runId = options.runId;
    this.attempt = options.attempt;
    this.revisionRound = options.revisionRound;
    this.approvalEpoch = options.approvalEpoch;
  }

  private emit(input: {
    eventType: CacheEvent["eventType"];
    stage: string;
    logicalItem: string;
    cacheKey: string;
    hit: boolean | null;
    reason: string;
  }): void {
    if (!this.eventSink) return;
    const eventWithoutId = {
      schemaVersion: "cache-event-v1" as const,
      eventType: input.eventType,
      occurredAt: this.now(),
      episodeId: this.episodeId,
      ...(this.runId ? {runId: this.runId} : {}),
      traceId: this.traceId,
      executionId: this.executionId,
      ...(this.attempt !== undefined ? {attempt: this.attempt} : {}),
      ...(this.revisionRound !== undefined ? {revisionRound: this.revisionRound} : {}),
      ...(this.approvalEpoch !== undefined ? {approvalEpoch: this.approvalEpoch} : {}),
      stage: input.stage,
      logicalItem: input.logicalItem,
      cacheKey: input.cacheKey,
      hit: input.hit,
      reason: cacheEventReason(input.reason),
      usage: {
        availability: "not-applicable" as const,
        inputTokens: 0 as const,
        outputTokens: 0 as const,
        cacheReadTokens: 0 as const,
        cacheWriteTokens: 0 as const,
        totalTokens: 0 as const,
      },
      cost: {amount: "0", currency: "USD" as const, pricingVersion: "cache-v1"},
    };
    this.eventSink(
      cacheEventSchema.parse({...eventWithoutId, eventId: cacheEventId(eventWithoutId)}),
    );
  }

  lookup<T = unknown>(input: {
    kind: CacheKind;
    cacheKey: string;
    stage: string;
    logicalItem: string;
    validateMetadata?: (metadata: unknown) => T;
  }): CacheLookup<T> {
    if (!sha256Schema(input.cacheKey)) throw new Error("cache key must be a SHA-256 digest");
    this.emit({
      eventType: "cache.lookup",
      stage: input.stage,
      logicalItem: input.logicalItem,
      cacheKey: input.cacheKey,
      hit: null,
      reason: "lookup",
    });
    const directory = cacheEntryPath(this.root, this.episodeId, input.kind, input.cacheKey);
    const miss = (reason: string, invalid = false): CacheLookupMiss => {
      if (invalid) {
        this.emit({
          eventType: "cache.invalidation",
          stage: input.stage,
          logicalItem: input.logicalItem,
          cacheKey: input.cacheKey,
          hit: false,
          reason,
        });
      }
      this.emit({
        eventType: "cache.miss",
        stage: input.stage,
        logicalItem: input.logicalItem,
        cacheKey: input.cacheKey,
        hit: false,
        reason,
      });
      return {hit: false, reason};
    };

    if (!isRegularFile(entryFilePath(directory)) || !isRegularFile(payloadFilePath(directory))) {
      return miss("entry-missing");
    }
    let entry: CacheEntry;
    try {
      entry = fineGrainedCacheEntrySchema.parse(
        JSON.parse(fs.readFileSync(entryFilePath(directory), "utf8")) as unknown,
      );
      if (
        entry.schemaVersion !== FINE_CACHE_ENTRY_SCHEMA_VERSION ||
        entry.kind !== input.kind ||
        entry.cacheKey !== input.cacheKey
      ) {
        return miss("schema-version-or-key-mismatch", true);
      }
      if (!entry.createdAt || !entry.mediaType || !entry.logicalItem) {
        return miss("entry-metadata-invalid", true);
      }
    } catch {
      return miss("entry-json-invalid", true);
    }
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(payloadFilePath(directory));
    } catch {
      return miss("payload-missing", true);
    }
    if (
      bytes.byteLength !== entry.payload.sizeBytes ||
      sha256Bytes(bytes) !== entry.payload.sha256
    ) {
      return miss("payload-hash-mismatch", true);
    }
    let metadata: T;
    try {
      assertMetadataEpisode(entry.metadata, this.episodeId);
      metadata = input.validateMetadata
        ? input.validateMetadata(entry.metadata)
        : (entry.metadata as T);
    } catch {
      return miss("metadata-schema-mismatch", true);
    }
    this.emit({
      eventType: "cache.hit",
      stage: input.stage,
      logicalItem: input.logicalItem,
      cacheKey: input.cacheKey,
      hit: true,
      reason: "hash-valid-cache",
    });
    return {hit: true, entry, bytes, metadata};
  }

  put(input: {
    kind: CacheKind;
    cacheKey: string;
    stage: string;
    logicalItem: string;
    mediaType: string;
    bytes: Uint8Array;
    metadata: unknown;
    createdAt?: string;
  }): CacheEntry {
    if (!sha256Schema(input.cacheKey)) throw new Error("cache key must be a SHA-256 digest");
    assertMetadataEpisode(input.metadata, this.episodeId);
    const bytes = Buffer.from(input.bytes);
    const entry = fineGrainedCacheEntrySchema.parse({
      schemaVersion: FINE_CACHE_ENTRY_SCHEMA_VERSION,
      kind: input.kind,
      cacheKey: input.cacheKey,
      logicalItem: input.logicalItem,
      mediaType: input.mediaType,
      payload: {sha256: sha256Bytes(bytes), sizeBytes: bytes.byteLength},
      metadata: input.metadata,
      createdAt: input.createdAt ?? this.now(),
    });
    const target = cacheEntryPath(this.root, this.episodeId, input.kind, input.cacheKey);
    const parent = path.dirname(target);
    const temporary = path.join(
      parent,
      `.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`,
    );
    try {
      fs.mkdirSync(parent, {recursive: true});
      fs.mkdirSync(temporary);
      writeAndSync(payloadFilePath(temporary), bytes);
      writeAndSync(entryFilePath(temporary), Buffer.from(`${stableCacheJson(entry)}\n`, "utf8"));
      replaceDirectoryAtomically(temporary, target);
      return entry;
    } catch (error) {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, {recursive: true, force: true});
      throw error;
    }
  }
}

export const createFineGrainedCacheFromEnvironment = (input: {
  episodeId: string;
  stage: string;
}): FineGrainedCacheStore | undefined => {
  const root = process.env.PRODUCTION_CACHE_DIR;
  if (!root) return undefined;
  const eventPath = process.env.PRODUCTION_CACHE_EVENT_PATH;
  const eventSink = eventPath ? createCacheEventSink(eventPath) : undefined;
  return new FineGrainedCacheStore({
    root,
    episodeId: input.episodeId,
    eventSink,
    traceId: process.env.PRODUCTION_CACHE_TRACE_ID ?? `cache:${input.episodeId}`,
    executionId:
      process.env.PRODUCTION_CACHE_EXECUTION_ID ?? `cache:${input.episodeId}:${input.stage}`,
  });
};

export const copyBytesAtomically = (outputPath: string, bytes: Uint8Array): void => {
  const temporary = `${outputPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    writeAndSync(temporary, bytes);
    fs.renameSync(temporary, outputPath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {force: true});
  }
};
