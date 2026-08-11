import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  registerCandidate,
  selectArtifact,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRef,
} from "../../src/orchestration";

export const fixtureCreatedAt = "2026-08-08T00:00:00.000Z";

export const artifactFixture = (
  input: {
    artifactId?: string;
    episodeId?: string;
    logicalName?: string;
    sha256?: string;
    revision?: number;
    path?: string;
    producer?: string;
  } = {},
): ArtifactRef => {
  const episodeId = input.episodeId ?? "episode-test";
  const logicalName = input.logicalName ?? "final-script";
  return {
    artifactId: input.artifactId ?? `${episodeId}:story:${logicalName}`,
    episodeId,
    path: input.path ?? `content/${episodeId}/story/${logicalName}.md`,
    mediaType: "text/markdown",
    schemaVersion: "fixture-v1",
    revision: input.revision ?? 1,
    sha256: input.sha256 ?? "a".repeat(64),
    sizeBytes: 10,
    producer: input.producer ?? "fixture",
    createdAt: fixtureCreatedAt,
  };
};

export const writeArtifactFixture = (input: {
  repoRoot: string;
  artifactId: string;
  episodeId: string;
  relativePath: string;
  body: string;
  producer?: string;
  previous?: ArtifactRef;
}): ArtifactRef => {
  const filePath = path.join(input.repoRoot, input.relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, input.body);
  return buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.relativePath,
    mediaType: "text/markdown",
    schemaVersion: "fixture-v1",
    producer: input.producer ?? "fixture",
    previous: input.previous,
    createdAt: fixtureCreatedAt,
  });
};

export const artifactDependencyFixture = (ref: ArtifactRef): ArtifactDependency => ({
  artifactId: ref.artifactId,
  path: ref.path,
  sha256: ref.sha256,
  relation: "reads",
});

export const selectedArtifactIndexFixture = (
  episodeId: string,
  refs: readonly {ref: ArtifactRef; dependencies?: ArtifactDependency[]}[],
): ArtifactIndex => {
  let index = emptyArtifactIndex(episodeId);
  for (const {ref, dependencies = []} of refs) {
    index = registerCandidate(index, ref, `fixture:${ref.artifactId}`, dependencies);
    index = selectArtifact(index, ref);
  }
  return index;
};

export const legacyEpisodeRepoFixture = (
  sourceRoot: string,
): {
  repoRoot: string;
  sourcePaths: string[];
} => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-legacy-"));
  const workflowPath = "content/episode-001/story/workflow.json";
  const workflowBody = fs.readFileSync(path.join(sourceRoot, workflowPath), "utf8");
  const workflow = JSON.parse(workflowBody) as {stages: {artifacts: string[]}[]};
  const sourcePaths = [
    ...new Set([workflowPath, ...workflow.stages.flatMap((stage) => stage.artifacts)]),
  ];
  for (const sourcePath of sourcePaths) {
    const target = path.join(repoRoot, sourcePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(
      target,
      sourcePath === workflowPath ? workflowBody : `legacy fixture bytes: ${sourcePath}\n`,
    );
  }
  return {repoRoot, sourcePaths};
};
