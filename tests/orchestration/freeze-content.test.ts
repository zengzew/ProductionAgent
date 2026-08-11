import fs from "node:fs";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  assertReferenceOnlyState,
  assertReferenceOnlyFreezeStateUpdate,
  contentManifestSchema,
  createInitialProductionState,
  evaluateContentFreezePreconditions,
  freezeContent,
  hashContentSelection,
  markStaleTransitively,
  type ArtifactIndex,
} from "../../src/orchestration";
import {
  freezeArtifactFixture,
  freezeIndexFixture,
  frozenAtFixture,
  temporaryFreezeRepoFixture,
} from "../helpers/freeze";

const temporaryDirectories: string[] = [];
const temporaryRepo = (): string => {
  const directory = temporaryFreezeRepoFixture();
  temporaryDirectories.push(directory);
  return directory;
};

const frozenAt = frozenAtFixture;
const writeRef = freezeArtifactFixture;
const selectedIndex = freezeIndexFixture;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("WP-M2-07 content freeze foundation", () => {
  it("freezes only the explicit selected refs and writes a hash-bound manifest", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const visualPlan = writeRef(repoRoot, "visual-plan", "visual v1\n");
    const index = selectedIndex([script, visualPlan]);

    const result = freezeContent({
      repoRoot,
      episodeId: "episode-freeze",
      artifactIndex: index,
      selectedArtifactRefs: [script],
      issues: [],
      frozenAt,
    });

    expect(result.manifest.artifacts).toEqual([script]);
    expect(result.manifest.artifacts).not.toContainEqual(visualPlan);
    expect(result.manifest.selectionHash).toBe(hashContentSelection([script]));
    expect(result.manifestRef.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.stateUpdate).toEqual({
      phase: "frozen",
      contentManifestRef: result.manifestRef,
    });
    expect(JSON.stringify(result.stateUpdate)).not.toContain("script v1");

    const manifestPath = path.join(repoRoot, result.manifestPath);
    const manifest = contentManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    expect(manifest).toEqual(result.manifest);
    expect(result.manifestRef.sizeBytes).toBe(fs.statSync(manifestPath).size);
    expect(
      assertReferenceOnlyState({
        ...createInitialProductionState({episodeId: "episode-freeze", runId: "run-freeze"}),
        ...result.stateUpdate,
      }).contentManifestRef,
    ).toEqual(result.manifestRef);

    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: index,
        issues: [],
        frozenAt,
      }),
    ).toThrow(/FREEZE_NO_SELECTED_ARTIFACTS/u);
  });

  it("keeps the graph update reference-only", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const update = {phase: "frozen" as const, contentManifestRef: script};

    expect(assertReferenceOnlyFreezeStateUpdate(update)).toEqual(update);
    expect(() =>
      assertReferenceOnlyFreezeStateUpdate({
        ...update,
        body: "script v1\n",
      }),
    ).toThrow();
  });

  it("rejects an open blocker or major issue before writing a manifest", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const index = selectedIndex([script]);

    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: index,
        selectedArtifactRefs: [script],
        issues: [{id: "issue-blocker", severity: "blocker", status: "open"}],
        frozenAt,
      }),
    ).toThrow(/FREEZE_OPEN_BLOCKERS:issue-blocker/u);

    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: index,
        selectedArtifactRefs: [script],
        issues: [{id: "issue-major", severity: "high", status: "open"}],
        frozenAt,
      }),
    ).toThrow(/FREEZE_OPEN_MAJOR_ISSUES:issue-major/u);
  });

  it("does not release a freeze when an issue cannot be recognized", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const index = selectedIndex([script]);
    const report = evaluateContentFreezePreconditions({
      repoRoot,
      episodeId: "episode-freeze",
      artifactIndex: index,
      selectedArtifactRefs: [script],
      issues: [{id: "issue-malformed"}],
    });

    expect(report.ready).toBe(false);
    expect(report.unrecognizedIssueIds).toContain("issue-malformed");
    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: index,
        selectedArtifactRefs: [script],
        issues: [{id: "issue-malformed"}],
        frozenAt,
      }),
    ).toThrow(/FREEZE_UNRECOGNIZED_ISSUES:issue-malformed/u);
  });

  it("rejects selected content whose bytes changed after registry selection", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const index = selectedIndex([script]);
    fs.writeFileSync(path.join(repoRoot, script.path), "script mutated\n");

    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: index,
        selectedArtifactRefs: [script],
        issues: [],
        frozenAt,
      }),
    ).toThrow(/FREEZE_ARTIFACT_HASH_MISMATCH:episode-freeze:story:script/u);
  });

  it("rejects a selected ref whose registry record is stale", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const index = selectedIndex([script]);
    const staleIndex: ArtifactIndex = markStaleTransitively(index, [script.artifactId]);

    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: staleIndex,
        selectedArtifactRefs: [script],
        issues: [],
        frozenAt,
      }),
    ).toThrow(/FREEZE_STALE_ARTIFACTS:episode-freeze:story:script/u);
  });

  it("rejects a ref that is not the exact current selected registry ref", () => {
    const repoRoot = temporaryRepo();
    const script = writeRef(repoRoot, "script", "script v1\n");
    const unselected = writeRef(repoRoot, "unselected", "unselected\n");
    const index = selectedIndex([script]);

    expect(() =>
      freezeContent({
        repoRoot,
        episodeId: "episode-freeze",
        artifactIndex: index,
        selectedArtifactRefs: [unselected],
        issues: [],
        frozenAt,
      }),
    ).toThrow(/FREEZE_ARTIFACT_NOT_SELECTED:episode-freeze:story:unselected/u);
  });
});
