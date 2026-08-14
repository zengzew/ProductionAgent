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

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

export const artifactRefBytesMatch = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const bytes = fs.readFileSync(resolveRepositoryPath(repoRoot, ref.path));
    return (
      bytes.byteLength === ref.sizeBytes &&
      crypto.createHash("sha256").update(bytes).digest("hex") === ref.sha256
    );
  } catch {
    return false;
  }
};

/** Fails closed when a persisted state reference no longer names its recorded bytes. */
export const assertArtifactRefBytes = (repoRoot: string, ref: ArtifactRef): void => {
  if (!artifactRefBytesMatch(repoRoot, ref)) {
    throw new Error(`ARTIFACT_HASH_MISMATCH:${ref.artifactId}`);
  }
};

export const assertArtifactRefsBytes = (repoRoot: string, refs: readonly ArtifactRef[]): void => {
  for (const ref of refs) assertArtifactRefBytes(repoRoot, ref);
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
  createdAt?: string;
  legacyProvenance?: LegacyArtifactProvenance;
}): ArtifactRef => {
  const bytes = fs.readFileSync(resolveRepositoryPath(input.repoRoot, input.path));
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const previous = input.previous;
  if (previous && previous.artifactId !== input.artifactId) {
    throw new Error("previous reference belongs to another artifact");
  }
  const revision = previous ? previous.revision + Number(previous.sha256 !== sha256) : 1;

  return artifactRefSchema.parse({
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.path.split(path.sep).join("/"),
    mediaType: input.mediaType,
    schemaVersion: input.schemaVersion,
    revision,
    sha256,
    sizeBytes: bytes.byteLength,
    producer: input.producer,
    createdAt: input.createdAt ?? new Date().toISOString(),
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
  crypto.createHash("sha256").update(stableJson(artifactIndexSchema.parse(index)), "utf8").digest("hex");

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
    (record) => record.ref.artifactId === ref.artifactId && record.ref.sha256 === ref.sha256,
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
