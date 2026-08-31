import {afterEach, describe, expect, it} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  artifactHashCacheStats,
  artifactRefBytesMatch,
  assertArtifactRefBytes,
  resetArtifactHashCache,
} from "../../src/orchestration/artifact-registry";
import {writeArtifactFixture} from "../helpers/artifacts";

const tempRoots: string[] = [];

afterEach(() => {
  resetArtifactHashCache();
  for (const root of tempRoots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

describe("artifact hash trust boundaries", () => {
  it("reuses a same-process digest and recomputes only at explicit boundaries", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-hash-cache-"));
    tempRoots.push(repoRoot);
    resetArtifactHashCache();
    const ref = writeArtifactFixture({
      repoRoot,
      artifactId: "episode-test:story:final-script",
      episodeId: "episode-test",
      relativePath: "content/episode-test/story/final-script.md",
      body: "same-process bytes\n",
    });
    const afterWrite = artifactHashCacheStats();
    expect(afterWrite.hashes).toBe(1);

    expect(artifactRefBytesMatch(repoRoot, ref)).toBe(true);
    expect(artifactHashCacheStats().reuseHits).toBeGreaterThan(0);
    expect(artifactHashCacheStats().hashes).toBe(1);

    assertArtifactRefBytes(repoRoot, ref, {boundary: "pre-render"});
    expect(artifactHashCacheStats().hashes).toBe(2);

    assertArtifactRefBytes(repoRoot, ref, {boundary: "final-approval"});
    expect(artifactHashCacheStats().hashes).toBe(3);
  });

  it("does not reuse a digest after the file bytes change", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-hash-cache-"));
    tempRoots.push(repoRoot);
    const ref = writeArtifactFixture({
      repoRoot,
      artifactId: "episode-test:story:final-script",
      episodeId: "episode-test",
      relativePath: "content/episode-test/story/final-script.md",
      body: "original\n",
    });
    expect(artifactRefBytesMatch(repoRoot, ref)).toBe(true);
    fs.writeFileSync(path.join(repoRoot, ref.path), "tampered\n");
    expect(artifactRefBytesMatch(repoRoot, ref)).toBe(false);
    expect(() => assertArtifactRefBytes(repoRoot, ref, {boundary: "checkpoint-resume"})).toThrow(
      /ARTIFACT_HASH_MISMATCH/u,
    );
  });
});
