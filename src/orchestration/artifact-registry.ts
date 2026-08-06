import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  artifactIndexSchema,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRef,
} from "./schemas/artifact";

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
}): ArtifactRef => {
  const bytes = fs.readFileSync(resolveRepositoryPath(input.repoRoot, input.path));
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const previous = input.previous;
  if (previous && previous.artifactId !== input.artifactId) {
    throw new Error("previous reference belongs to another artifact");
  }
  const revision = previous ? previous.revision + Number(previous.sha256 !== sha256) : 1;

  return {
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
  };
};

export const readArtifactIndex = (filePath: string): ArtifactIndex =>
  artifactIndexSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));

export const writeArtifactIndex = (filePath: string, index: ArtifactIndex): void => {
  const validated = artifactIndexSchema.parse(index);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
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
