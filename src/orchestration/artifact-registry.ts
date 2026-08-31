import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  artifactIndexSchema,
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactIndex,
  type LegacyArtifactProvenance,
  type ArtifactRef,
} from "./schemas/artifact";
import {withOptimisticFileCasSync} from "./concurrency";
import {stableJson} from "./stable-json";

export const emptyArtifactIndex = (episodeId: string): ArtifactIndex =>
  artifactIndexSchema.parse({
    schemaVersion: "artifact-index-v1",
    episodeId,
    artifacts: [],
    selected: {},
  });

export const ARTIFACT_HASH_BOUNDARIES = [
  "external-input",
  "checkpoint-resume",
  "pre-render",
  "final-approval",
] as const;

export type ArtifactHashBoundary = (typeof ARTIFACT_HASH_BOUNDARIES)[number];
export type ArtifactHashCheckMode = "reuse" | "recompute";

export type ArtifactHashCheckOptions = {
  /** Default `reuse` caches digest+stat for the rest of this process. */
  mode?: ArtifactHashCheckMode;
  /** Trust boundaries always re-read bytes; they imply `recompute`. */
  boundary?: ArtifactHashBoundary;
};

export type ArtifactHashCacheStats = {
  hashes: number;
  reuseHits: number;
  entries: number;
};

type FileHashCacheEntry = {
  digest: string;
  sizeBytes: number;
  mtimeMs: number;
  ino: number;
  dev: number;
};

const fileHashCache = new Map<string, FileHashCacheEntry>();
const hashCacheStats = {hashes: 0, reuseHits: 0};

export const artifactHashCheckMode = (options?: ArtifactHashCheckOptions): ArtifactHashCheckMode =>
  options?.boundary !== undefined || options?.mode === "recompute" ? "recompute" : "reuse";

export const artifactHashCacheStats = (): ArtifactHashCacheStats => ({
  hashes: hashCacheStats.hashes,
  reuseHits: hashCacheStats.reuseHits,
  entries: fileHashCache.size,
});

export const resetArtifactHashCache = (): void => {
  fileHashCache.clear();
  hashCacheStats.hashes = 0;
  hashCacheStats.reuseHits = 0;
};

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

const hashFileAt = (
  absolutePath: string,
  mode: ArtifactHashCheckMode,
): {digest: string; sizeBytes: number} => {
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`artifact path is not a file: ${absolutePath}`);
  }
  if (mode === "reuse") {
    const cached = fileHashCache.get(absolutePath);
    if (
      cached &&
      cached.sizeBytes === stat.size &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.ino === stat.ino &&
      cached.dev === stat.dev
    ) {
      hashCacheStats.reuseHits += 1;
      return {digest: cached.digest, sizeBytes: cached.sizeBytes};
    }
  }
  const bytes = fs.readFileSync(absolutePath);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const after = fs.statSync(absolutePath);
  fileHashCache.set(absolutePath, {
    digest,
    sizeBytes: bytes.byteLength,
    mtimeMs: after.mtimeMs,
    ino: after.ino,
    dev: after.dev,
  });
  hashCacheStats.hashes += 1;
  return {digest, sizeBytes: bytes.byteLength};
};

/**
 * Byte check for an ArtifactRef. Same-process graph nodes reuse a digest cached
 * against size/mtime/inode. External input, checkpoint resume, pre-render and
 * final approval pass `boundary` so the file is hashed again.
 */
export const artifactRefBytesMatch = (
  repoRoot: string,
  ref: ArtifactRef,
  options?: ArtifactHashCheckOptions,
): boolean => {
  try {
    const hashed = hashFileAt(
      resolveRepositoryPath(repoRoot, ref.path),
      artifactHashCheckMode(options),
    );
    return hashed.sizeBytes === ref.sizeBytes && hashed.digest === ref.sha256;
  } catch {
    return false;
  }
};

const artifactVersionKey = (ref: Pick<ArtifactRef, "artifactId" | "sha256">): string =>
  `${ref.artifactId}:${ref.sha256}`;

/**
 * Historical copies live under the episode so an overwritten canonical path never destroys
 * evidence referenced by an earlier execution event.
 */
export const artifactHistoryPathFor = (episodeId: string, ref: ArtifactRef): string => {
  const safeArtifactId = ref.artifactId.replace(/[^a-z0-9-]+/gu, "-");
  const extension = path.extname(ref.path) || ".bin";
  return `content/${episodeId}/.artifact-history/${safeArtifactId}/r${ref.revision}-${ref.sha256}${extension}`;
};

/**
 * Snapshots selected refs before a known producer rewrites their canonical paths. The canonical
 * file is intentionally left in place for the current producer; only the registry's historical
 * ref is moved to the immutable copy. Callers should invoke this before writing the new bytes.
 */
export const snapshotSelectedArtifactHistory = (input: {
  repoRoot: string;
  episodeId: string;
  refs: readonly ArtifactRef[];
}): ArtifactIndex | undefined => {
  const filePath = artifactIndexPath(input.repoRoot, input.episodeId);
  if (!fs.existsSync(filePath)) return undefined;
  const expectedVersion = readArtifactIndexVersion(filePath);
  const index = readArtifactIndex(filePath);
  const requested = new Map(
    input.refs
      .filter((ref) => ref.episodeId === input.episodeId)
      .map((ref) => [`${ref.artifactId}:${ref.revision}:${ref.sha256}:${ref.path}`, ref]),
  );
  const selectedRecords = index.artifacts.filter((record) => {
    if (record.state !== "selected") return false;
    const pointer = index.selected[record.ref.artifactId];
    return Boolean(
      pointer &&
      pointer.revision === record.ref.revision &&
      pointer.sha256 === record.ref.sha256 &&
      pointer.path === record.ref.path &&
      requested.has(
        `${record.ref.artifactId}:${record.ref.revision}:${record.ref.sha256}:${record.ref.path}`,
      ) &&
      !record.ref.path.includes("/.artifact-history/"),
    );
  });
  if (selectedRecords.length === 0) return index;

  const pathByIdentity = new Map<string, string>();
  for (const record of selectedRecords) {
    if (!artifactRefBytesMatch(input.repoRoot, record.ref, {mode: "recompute"})) {
      throw new Error(`ARTIFACT_HISTORY_SOURCE_HASH_MISMATCH:${record.ref.artifactId}`);
    }
    const historyPath = artifactHistoryPathFor(input.episodeId, record.ref);
    const source = resolveRepositoryPath(input.repoRoot, record.ref.path);
    const target = resolveRepositoryPath(input.repoRoot, historyPath);
    if (fs.existsSync(target)) {
      if (
        !artifactRefBytesMatch(
          input.repoRoot,
          {...record.ref, path: historyPath},
          {mode: "recompute"},
        )
      ) {
        throw new Error(`ARTIFACT_HISTORY_SNAPSHOT_COLLISION:${historyPath}`);
      }
    } else {
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.copyFileSync(source, target);
    }
    pathByIdentity.set(artifactVersionKey(record.ref), historyPath);
  }

  const migratedRecords = index.artifacts.map((record) => {
    const migratedPath = pathByIdentity.get(artifactVersionKey(record.ref));
    const ref = migratedPath ? {...record.ref, path: migratedPath} : record.ref;
    return {
      ...record,
      ref,
      dependencies: record.dependencies.map((dependency) => {
        const dependencyPath = pathByIdentity.get(
          artifactVersionKey({artifactId: dependency.artifactId, sha256: dependency.sha256}),
        );
        return dependencyPath ? {...dependency, path: dependencyPath} : dependency;
      }),
    };
  });
  const migratedSelected = Object.fromEntries(
    Object.entries(index.selected).map(([artifactId, pointer]) => {
      const selected = index.artifacts.find(
        (record) =>
          record.ref.artifactId === artifactId &&
          record.ref.revision === pointer.revision &&
          record.ref.sha256 === pointer.sha256 &&
          record.ref.path === pointer.path,
      );
      const migratedPath = selected
        ? pathByIdentity.get(artifactVersionKey(selected.ref))
        : undefined;
      return [artifactId, migratedPath ? {...pointer, path: migratedPath} : pointer];
    }),
  );
  const nextIndex = artifactIndexSchema.parse({
    ...index,
    artifacts: migratedRecords,
    selected: migratedSelected,
  });
  writeArtifactIndexCas({
    filePath,
    index: nextIndex,
    expectedVersion,
    casRoot: input.repoRoot,
  });
  return nextIndex;
};

/** Resolves an old event ref to its immutable registry snapshot when its canonical path changed. */
export const registeredArtifactRefForBytes = (
  repoRoot: string,
  ref: ArtifactRef,
): ArtifactRef | undefined => {
  if (artifactRefBytesMatch(repoRoot, ref)) return ref;
  const filePath = artifactIndexPath(repoRoot, ref.episodeId);
  if (!fs.existsSync(filePath)) return undefined;
  const index = readArtifactIndex(filePath);
  const candidates = index.artifacts
    .filter(
      (record) =>
        record.ref.artifactId === ref.artifactId &&
        record.ref.revision === ref.revision &&
        record.ref.sha256 === ref.sha256,
    )
    .sort((left, right) => Number(right.state === "selected") - Number(left.state === "selected"));
  return candidates.find((record) => artifactRefBytesMatch(repoRoot, record.ref))?.ref;
};

export const assertArtifactRefBytesWithHistory = (repoRoot: string, ref: ArtifactRef): void => {
  if (!registeredArtifactRefForBytes(repoRoot, ref)) {
    throw new Error(`ARTIFACT_HASH_MISMATCH:${ref.artifactId}`);
  }
};

/** Fails closed when a persisted state reference no longer names its recorded bytes. */
export const assertArtifactRefBytes = (
  repoRoot: string,
  ref: ArtifactRef,
  options?: ArtifactHashCheckOptions,
): void => {
  if (!artifactRefBytesMatch(repoRoot, ref, options)) {
    throw new Error(`ARTIFACT_HASH_MISMATCH:${ref.artifactId}`);
  }
};

export const assertArtifactRefsBytes = (
  repoRoot: string,
  refs: readonly ArtifactRef[],
  options?: ArtifactHashCheckOptions,
): void => {
  for (const ref of refs) assertArtifactRefBytes(repoRoot, ref, options);
};

const artifactIndexPath = (repoRoot: string, episodeId: string): string =>
  resolveRepositoryPath(repoRoot, `content/${episodeId}/artifact-index.json`);

const assertIndexFileEpisode = (filePath: string, episodeId: string): void => {
  const normalized = path.resolve(filePath).split(path.sep).join("/");
  const match = /\/content\/(episode-[a-z0-9-]+)\/artifact-index\.json$/u.exec(normalized);
  if (match?.[1] && match[1] !== episodeId) {
    throw new Error(`ARTIFACT_INDEX_EPISODE_MISMATCH:${episodeId}:${match[1]}`);
  }
};

/** Returns false for missing, malformed, stale, superseded, or pointer-mismatched selections. */
export const artifactRefSelectionMatches = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const index = readArtifactIndex(artifactIndexPath(repoRoot, ref.episodeId));
    const pointer = index.selected[ref.artifactId];
    return Boolean(
      pointer &&
      pointer.revision === ref.revision &&
      pointer.sha256 === ref.sha256 &&
      pointer.path === ref.path &&
      index.artifacts.some(
        (record) =>
          record.state === "selected" &&
          record.ref.artifactId === ref.artifactId &&
          record.ref.revision === ref.revision &&
          record.ref.sha256 === ref.sha256 &&
          record.ref.path === ref.path,
      ),
    );
  } catch {
    return false;
  }
};

/** Distinguishes an unregistered fixture ref from a registered ref that became stale. */
export const artifactRefIsIndexed = (repoRoot: string, ref: ArtifactRef): boolean => {
  const indexPath = artifactIndexPath(repoRoot, ref.episodeId);
  if (!fs.existsSync(indexPath)) return false;
  const index = readArtifactIndex(indexPath);
  return index.artifacts.some(
    (record) =>
      record.ref.artifactId === ref.artifactId &&
      record.ref.revision === ref.revision &&
      record.ref.sha256 === ref.sha256,
  );
};

/** Strict replay guard: an explicit ref must still be the selected, non-stale registry version. */
export const assertArtifactRefsSelected = (
  repoRoot: string,
  refs: readonly ArtifactRef[],
): void => {
  for (const ref of refs) {
    if (!fs.existsSync(artifactIndexPath(repoRoot, ref.episodeId))) {
      throw new Error(`ARTIFACT_INDEX_MISSING:${ref.episodeId}`);
    }
    if (!artifactRefSelectionMatches(repoRoot, ref)) {
      throw new Error(`ARTIFACT_STALE_OR_NOT_SELECTED:${ref.artifactId}`);
    }
  }
};

export const buildArtifactRef = (input: {
  repoRoot: string;
  artifactId: string;
  episodeId: string;
  path: string;
  mediaType: string;
  schemaVersion: string;
  producer: string;
  previous?: ArtifactRef;
  forceRevision?: boolean;
  createdAt?: string;
  legacyProvenance?: LegacyArtifactProvenance;
}): ArtifactRef => {
  const hashed = hashFileAt(resolveRepositoryPath(input.repoRoot, input.path), "recompute");
  const previous = input.previous;
  if (previous && previous.artifactId !== input.artifactId) {
    throw new Error("previous reference belongs to another artifact");
  }
  const revision = previous
    ? previous.revision + Number(input.forceRevision === true || previous.sha256 !== hashed.digest)
    : 1;
  const createdAt =
    previous && previous.sha256 === hashed.digest && input.forceRevision !== true
      ? previous.createdAt
      : (input.createdAt ?? new Date().toISOString());

  return artifactRefSchema.parse({
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.path.split(path.sep).join("/"),
    mediaType: input.mediaType,
    schemaVersion: input.schemaVersion,
    revision,
    sha256: hashed.digest,
    sizeBytes: hashed.sizeBytes,
    producer: input.producer,
    createdAt,
    ...(input.legacyProvenance ? {legacyProvenance: input.legacyProvenance} : {}),
  });
};

export const readArtifactIndex = (filePath: string): ArtifactIndex =>
  artifactIndexSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));

export const writeArtifactIndex = (filePath: string, index: ArtifactIndex): void => {
  const validated = artifactIndexSchema.parse(index);
  assertIndexFileEpisode(filePath, validated.episodeId);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
};

export const artifactIndexControlHash = (index: ArtifactIndex): string =>
  crypto
    .createHash("sha256")
    .update(stableJson(artifactIndexSchema.parse(index)), "utf8")
    .digest("hex");

export const readArtifactIndexVersion = (filePath: string): string | null =>
  fs.existsSync(filePath) ? artifactIndexControlHash(readArtifactIndex(filePath)) : null;

const repositoryRootForIndexPath = (filePath: string): string => {
  const absolute = path.resolve(filePath);
  const marker = `${path.sep}content${path.sep}`;
  const markerIndex = absolute.indexOf(marker);
  return markerIndex >= 0 ? absolute.slice(0, markerIndex) : path.dirname(path.dirname(absolute));
};

/** Writes an artifact registry only when the caller still owns the expected index version. */
export const writeArtifactIndexCas = (input: {
  filePath: string;
  index: ArtifactIndex;
  expectedVersion?: string | null;
  casRoot?: string;
}): string => {
  const validated = artifactIndexSchema.parse(input.index);
  assertIndexFileEpisode(input.filePath, validated.episodeId);
  const expected = input.expectedVersion ?? null;
  const root = input.casRoot ?? repositoryRootForIndexPath(input.filePath);
  // The file mutex is intentionally separate from the long-lived episode lock. It protects
  // registry compare-and-swap even when a caller bypasses orchestration admission.
  return withOptimisticFileCasSync({
    root,
    key: `artifact-index:${path.resolve(input.filePath)}`,
    run: () => {
      const current = readArtifactIndexVersion(input.filePath);
      if (current !== expected) {
        throw new Error(
          `ARTIFACT_INDEX_CAS_CONFLICT:expected=${expected ?? "none"}:current=${current ?? "none"}`,
        );
      }
      writeArtifactIndex(input.filePath, validated);
      return artifactIndexControlHash(validated);
    },
  });
};

export const registerCandidate = (
  index: ArtifactIndex,
  ref: ArtifactRef,
  producedByExecutionId: string,
  dependencies: ArtifactDependency[],
): ArtifactIndex => {
  if (index.episodeId !== ref.episodeId) {
    throw new Error("artifact and index episode IDs differ");
  }
  for (const dependency of dependencies) {
    if (!dependency.artifactId.startsWith(`${index.episodeId}:`)) {
      throw new Error("artifact dependency belongs to another episode");
    }
  }
  const duplicate = index.artifacts.find(
    (record) =>
      record.ref.artifactId === ref.artifactId &&
      record.ref.revision === ref.revision &&
      record.ref.sha256 === ref.sha256,
  );
  if (duplicate) {
    return index;
  }
  return artifactIndexSchema.parse({
    ...index,
    artifacts: [...index.artifacts, {ref, state: "candidate", producedByExecutionId, dependencies}],
  });
};

export const selectArtifact = (index: ArtifactIndex, ref: ArtifactRef): ArtifactIndex => {
  const target = index.artifacts.find(
    (record) =>
      record.ref.artifactId === ref.artifactId &&
      record.ref.revision === ref.revision &&
      record.ref.sha256 === ref.sha256,
  );
  if (!target || target.state === "quarantined") {
    throw new Error("only a registered, non-quarantined candidate can be selected");
  }

  const artifacts = index.artifacts.map((record) => {
    if (record === target) {
      return {...record, state: "selected" as const};
    }
    if (record.ref.artifactId === ref.artifactId && record.state === "selected") {
      return {...record, state: "superseded" as const};
    }
    return record;
  });

  return artifactIndexSchema.parse({
    ...index,
    artifacts,
    selected: {
      ...index.selected,
      [ref.artifactId]: {revision: ref.revision, sha256: ref.sha256, path: ref.path},
    },
  });
};

export const markStaleTransitively = (
  index: ArtifactIndex,
  changedArtifactIds: Iterable<string>,
): ArtifactIndex => {
  const stale = new Set(changedArtifactIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of index.artifacts) {
      if (
        !stale.has(record.ref.artifactId) &&
        record.dependencies.some((dependency) => stale.has(dependency.artifactId))
      ) {
        stale.add(record.ref.artifactId);
        changed = true;
      }
    }
  }

  return artifactIndexSchema.parse({
    ...index,
    artifacts: index.artifacts.map((record) =>
      stale.has(record.ref.artifactId) && record.state === "selected"
        ? {...record, state: "stale" as const}
        : record,
    ),
    selected: Object.fromEntries(
      Object.entries(index.selected).filter(([artifactId]) => !stale.has(artifactId)),
    ),
  });
};
