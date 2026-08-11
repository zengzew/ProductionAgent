import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {ArtifactRef} from "../../src/orchestration";
import {selectedArtifactIndexFixture, writeArtifactFixture} from "./artifacts";

export const frozenAtFixture = "2026-08-08T00:00:00.000Z";

export const temporaryFreezeRepoFixture = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-freeze-"));

export const freezeArtifactFixture = (
  repoRoot: string,
  logicalName: string,
  body: string,
): ArtifactRef =>
  writeArtifactFixture({
    repoRoot,
    artifactId: `episode-freeze:story:${logicalName}`,
    episodeId: "episode-freeze",
    relativePath: `content/episode-freeze/story/${logicalName}.md`,
    body,
  });

export const freezeIndexFixture = (refs: readonly ArtifactRef[]) =>
  selectedArtifactIndexFixture(
    "episode-freeze",
    refs.map((ref) => ({ref})),
  );
