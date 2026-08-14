import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  LEGACY_PACKAGE_SPECS,
  appendExecutionEvent,
  buildArtifactRef,
  emptyArtifactIndex,
  evaluateObservabilityCompleteness,
  importLegacyPackage,
  importLegacyPackages,
  readExecutionEventLog,
  registerCandidate,
  selectArtifact,
  type LegacyPackageId,
} from "../../src/orchestration";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];
const legacyCases = [
  ["LEGACY-001", "episode-001-v1"],
  ["LEGACY-002", "episode-002-v1"],
  ["LEGACY-003", "episode-001-v2-goal3"],
  ["LEGACY-004", "episode-002-v2-goal3"],
] as const;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const hashFile = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const hashPaths = (root: string, paths: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    paths.map((repositoryPath) => [repositoryPath, hashFile(path.join(root, repositoryPath))]),
  );

const packageSpec = (packageId: LegacyPackageId) => {
  const spec = LEGACY_PACKAGE_SPECS.find((candidate) => candidate.packageId === packageId);
  if (!spec) throw new Error(`test package missing: ${packageId}`);
  return spec;
};

const copyPackageFixture = (packageId: LegacyPackageId): string => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-legacy-backfill-"));
  temporaryDirectories.push(fixtureRoot);
  const spec = packageSpec(packageId);
  const sourceRoot = path.join(repoRoot, spec.canonicalSourcePath);
  const targetRoot = path.join(fixtureRoot, spec.canonicalSourcePath);
  fs.mkdirSync(path.dirname(targetRoot), {recursive: true});
  fs.cpSync(sourceRoot, targetRoot, {recursive: true});
  if (spec.packageVersion === "v1") {
    const outputEpisode = spec.episodeId;
    const outputSource = path.join(repoRoot, "output", outputEpisode);
    const outputTarget = path.join(fixtureRoot, "output", outputEpisode);
    fs.mkdirSync(path.dirname(outputTarget), {recursive: true});
    fs.cpSync(outputSource, outputTarget, {recursive: true});
  }
  if (spec.aliases[0]) {
    const aliasTarget = path.join(fixtureRoot, spec.aliases[0]);
    fs.mkdirSync(path.dirname(aliasTarget), {recursive: true});
    fs.symlinkSync(path.relative(path.dirname(aliasTarget), targetRoot), aliasTarget, "dir");
  }
  return fixtureRoot;
};

describe("WP-M4-05 full legacy backfill", () => {
  it.each(legacyCases)(
    "%s imports the complete named package without byte changes",
    (_caseId, packageId) => {
      const imported = importLegacyPackage({
        repoRoot,
        packageId,
        occurredAt: "2026-08-14T00:00:00.000Z",
      });
      const after = hashPaths(repoRoot, imported.sourcePaths);

      expect(after).toEqual(imported.fileHashes);
      expect(imported.sourcePaths).toHaveLength(Object.keys(imported.artifacts).length);
      expect(imported.artifactIndex.artifacts).toHaveLength(imported.sourcePaths.length);
      expect(imported.artifactIndex.artifacts.every((record) => record.state === "selected")).toBe(
        true,
      );
      expect(
        Object.values(imported.artifacts).every((ref) => ref.producer === "legacy-derived"),
      ).toBe(true);
      expect(
        Object.values(imported.artifacts).every(
          (ref) =>
            ref.legacyProvenance?.canonicalSourcePath === imported.provenance.canonicalSourcePath,
        ),
      ).toBe(true);
      expect(
        imported.sourcePaths.every((sourcePath) =>
          packageId.endsWith("v2-goal3")
            ? sourcePath.startsWith(imported.provenance.canonicalSourcePath + "/")
            : !sourcePath.includes("/v2-goal3/"),
        ),
      ).toBe(true);
    },
  );

  it("imports all four packages in explicit deterministic order and reports aliases", () => {
    const imported = importLegacyPackages({
      repoRoot,
      occurredAt: "2026-08-14T00:00:00.000Z",
    });
    expect(imported.packages.map((result) => result.packageId)).toEqual(
      LEGACY_PACKAGE_SPECS.map((spec) => spec.packageId),
    );
    expect(imported.artifactCount).toBe(
      imported.packages.reduce((count, result) => count + result.sourcePaths.length, 0),
    );
    expect(imported.aliasToCanonical).toEqual({
      "content/episode-001-v2-goal3": "content/episode-001/v2-goal3",
      "content/episode-002-v2-goal3": "content/episode-002/v2-goal3",
    });
  });

  it("LEGACY-ALIAS resolves canonical and flat-ID paths to one identity", () => {
    const canonical = importLegacyPackage({
      repoRoot,
      packageId: "episode-001-v2-goal3",
      sourcePath: "content/episode-001/v2-goal3",
      occurredAt: "2026-08-14T00:00:00.000Z",
    });
    const alias = importLegacyPackage({
      repoRoot,
      packageId: "episode-001-v2-goal3",
      sourcePath: "content/episode-001-v2-goal3",
      occurredAt: "2026-08-14T00:00:00.000Z",
    });
    expect(alias.artifactIndex).toEqual(canonical.artifactIndex);
    expect(Object.keys(alias.artifacts)).toEqual(Object.keys(canonical.artifacts));
    expect(Object.values(alias.artifacts).map((ref) => ref.artifactId)).toEqual(
      Object.values(canonical.artifacts).map((ref) => ref.artifactId),
    );
    expect(
      Object.keys(alias.artifacts).every((sourcePath) => sourcePath.includes("/v2-goal3/")),
    ).toBe(true);
    expect(alias.aliasToCanonical["content/episode-001-v2-goal3"]).toBe(
      "content/episode-001/v2-goal3",
    );
  });

  it("is idempotent and canonical refs can be merged into the registry twice", () => {
    const first = importLegacyPackage({
      repoRoot,
      packageId: "episode-002-v2-goal3",
      occurredAt: "2026-08-14T00:00:00.000Z",
    });
    const second = importLegacyPackage({
      repoRoot,
      packageId: "episode-002-v2-goal3",
      occurredAt: "2026-08-14T00:00:00.000Z",
      existingArtifactIndex: first.artifactIndex,
    });
    expect(second.artifactIndex).toEqual(first.artifactIndex);
    expect(second.fileHashes).toEqual(first.fileHashes);
    expect(second.events).toEqual(first.events);
  });

  it("does not overwrite a selected non-legacy artifact at the canonical source path", () => {
    const imported = importLegacyPackage({repoRoot, packageId: "episode-001-v1"});
    const target = Object.values(imported.artifacts)[0];
    if (!target) throw new Error("expected a legacy artifact");
    const currentRef = buildArtifactRef({
      repoRoot,
      artifactId: `${imported.episodeId}:current:collision`,
      episodeId: imported.episodeId,
      path: target.path,
      mediaType: target.mediaType,
      schemaVersion: "current-v1",
      producer: "current-runner",
      createdAt: "2026-08-14T00:00:00.000Z",
    });
    let index = emptyArtifactIndex(imported.episodeId);
    index = registerCandidate(index, currentRef, "current:collision", []);
    index = selectArtifact(index, currentRef);
    expect(() =>
      importLegacyPackage({
        repoRoot,
        packageId: "episode-001-v1",
        existingArtifactIndex: index,
      }),
    ).toThrow(/LEGACY_ARTIFACT_PATH_COLLISION/u);
  });

  it("LEGACY-OBSERVABILITY events are readable and replayable without inventing checkpoint data", () => {
    const imported = importLegacyPackage({
      repoRoot,
      packageId: "episode-001-v1",
      occurredAt: "2026-08-14T00:00:00.000Z",
    });
    const eventLogPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-legacy-events-")),
      "executions.jsonl",
    );
    temporaryDirectories.push(path.dirname(eventLogPath));
    for (const event of imported.events) appendExecutionEvent(eventLogPath, event);
    const replayed = readExecutionEventLog(eventLogPath);
    expect(replayed).toEqual(imported.events);
    expect(imported.events.every((event) => event.schemaVersion === "observability-event-v1")).toBe(
      true,
    );
    expect(imported.events.every((event) => event.checkpoint?.stateSha256 === null)).toBe(true);
    const gate = evaluateObservabilityCompleteness({
      repoRoot,
      episodeId: imported.episodeId,
      runId: `legacy:${imported.packageId}:import`,
      events: replayed,
    });
    expect(gate.status).toBe("observability-degraded");
    expect(gate.reasons).toContain("CHECKPOINT_UNAVAILABLE:legacy-derived");
  });

  it.each([
    ["broken alias", "alias"],
    ["missing workflow artifact", "missing"],
    ["expected hash mismatch", "hash"],
  ] as const)("fails closed for %s", (_label, failure) => {
    const fixtureRoot = copyPackageFixture("episode-001-v2-goal3");
    if (failure === "alias") {
      fs.unlinkSync(path.join(fixtureRoot, "content/episode-001-v2-goal3"));
      fs.symlinkSync(
        "missing-v2-goal3",
        path.join(fixtureRoot, "content/episode-001-v2-goal3"),
        "dir",
      );
      expect(() =>
        importLegacyPackage({
          repoRoot: fixtureRoot,
          packageId: "episode-001-v2-goal3",
          sourcePath: "content/episode-001-v2-goal3",
        }),
      ).toThrow(/LEGACY_BROKEN_SYMLINK/u);
      return;
    }
    const baseline = importLegacyPackage({
      repoRoot: fixtureRoot,
      packageId: "episode-001-v2-goal3",
    });
    if (failure === "missing") {
      fs.rmSync(path.join(fixtureRoot, "content/episode-001/v2-goal3/story/final-script.md"));
      expect(() =>
        importLegacyPackage({repoRoot: fixtureRoot, packageId: "episode-001-v2-goal3"}),
      ).toThrow(/LEGACY_MISSING_FILE/u);
      return;
    }
    expect(() =>
      importLegacyPackage({
        repoRoot: fixtureRoot,
        packageId: "episode-001-v2-goal3",
        expectedHashes: {
          [baseline.sourcePaths[0]!]: "0".repeat(64),
        },
      }),
    ).toThrow(/LEGACY_HASH_MISMATCH/u);
  });
});
