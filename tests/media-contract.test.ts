import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  registerCandidate,
  selectArtifact,
  writeArtifactIndex,
} from "../src/orchestration";
import {
  assertMediaAssetRenderable,
  assertMediaClipRenderable,
  buildMediaArtifactRef,
  emptyMediaSourceManifest,
  isMediaAssetRenderable,
  isMediaClipRenderable,
  mediaAssetRepositoryPath,
  mediaAssetSchema,
  mediaClipRefSchema,
  mediaSourceManifestSchema,
  mediaSourceSchema,
  mediaUsageDecisionSchema,
  mediaVerificationSchema,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaAsset,
  registerMediaSource,
  setMediaSourceAdmission,
  writeMediaSourceManifest,
  writeMediaSourceManifestCas,
  type MediaAsset,
  type MediaClipRef,
  type MediaSource,
  type MediaSourceManifest,
} from "../src/media";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-media-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

const writeFile = (repoRoot: string, repositoryPath: string, body: string): string => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
};

const makeSource = (overrides: Partial<MediaSource> = {}): MediaSource =>
  mediaSourceSchema.parse({
    sourceId: "episode-m5:media-source:founder",
    episodeId: "episode-m5",
    sourceUrl: "https://example.com/founder-demo.mp4",
    publisher: "Example Corp",
    sourceType: "founder",
    admissionStatus: "pending",
    admissionReason: "",
    rightsBasis: "Owner-provided interview for editorial use",
    rightsStatus: "approved",
    accessedAt: "2026-08-16T00:00:00.000Z",
    notes: "",
    ...overrides,
  });

const makeAsset = (input: {
  repoRoot: string;
  manifest: MediaSourceManifest;
  mediaId?: string;
  filename?: string;
  mediaType?: string;
  rightsStatus?: MediaAsset["rightsStatus"];
  body?: string;
}): MediaAsset => {
  const mediaId = input.mediaId ?? "episode-m5:media:founder-demo";
  const filename = input.filename ?? "founder-demo.mp4";
  const mediaType = input.mediaType ?? "video/mp4";
  const body = input.body ?? "real founder demo bytes\n";
  const repositoryPath = `content/${input.manifest.episodeId}/media/assets/${filename}`;
  writeFile(input.repoRoot, repositoryPath, body);
  const source = input.manifest.sources[0];
  if (!source) throw new Error("fixture source missing");
  const artifactRef = buildMediaArtifactRef({
    repoRoot: input.repoRoot,
    episodeId: input.manifest.episodeId,
    mediaId,
    filename,
    mediaType,
    producer: "m5-media-contract-test",
    createdAt: "2026-08-16T00:00:00.000Z",
  });
  return mediaAssetSchema.parse({
    mediaId,
    episodeId: input.manifest.episodeId,
    mediaSourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    publisher: source.publisher,
    sourceType: source.sourceType,
    acquisitionMethod: "manual-import",
    originalFilename: filename,
    mediaType,
    sha256: artifactRef.sha256,
    sizeBytes: artifactRef.sizeBytes,
    durationMs: 9000,
    width: 1920,
    height: 1080,
    fps: 30,
    audioChannels: 2,
    capturedAt: "2026-08-16T00:00:00.000Z",
    accessedAt: "2026-08-16T00:00:00.000Z",
    publishedAt: "2026-08-01",
    rightsBasis: source.rightsBasis,
    rightsStatus: input.rightsStatus ?? "approved",
    artifactRef,
    kind: "original",
  });
};

const admittedManifestWithAsset = (
  repoRoot: string,
): {
  manifest: MediaSourceManifest;
  asset: MediaAsset;
} => {
  let manifest = emptyMediaSourceManifest({
    episodeId: "episode-m5",
    updatedAt: "2026-08-16T00:00:00.000Z",
  });
  manifest = registerMediaSource({
    manifest,
    source: makeSource(),
    updatedAt: "2026-08-16T00:00:00.000Z",
  });
  manifest = setMediaSourceAdmission({
    manifest,
    sourceId: "episode-m5:media-source:founder",
    admissionStatus: "admitted",
    reason: "owner supplied for episode-m5",
    decidedBy: "m5-media-contract-test",
    decidedAt: "2026-08-16T00:00:01.000Z",
  });
  const asset = makeAsset({repoRoot, manifest});
  manifest = registerMediaAsset({
    repoRoot,
    manifest,
    asset,
    updatedAt: "2026-08-16T00:00:02.000Z",
  });
  return {manifest, asset};
};

const selectMediaArtifact = (repoRoot: string, asset: MediaAsset): void => {
  let index = emptyArtifactIndex(asset.episodeId);
  index = selectArtifact(
    registerCandidate(index, asset.artifactRef, "m5:ingest", []),
    asset.artifactRef,
  );
  writeArtifactIndex(path.join(repoRoot, `content/${asset.episodeId}/artifact-index.json`), index);
};

describe("M5.01 media artifact and provenance contract", () => {
  it("keeps media identity episode-scoped in every schema", () => {
    const invalidSource = {...makeSource(), episodeId: "episode-other"};
    expect(() => mediaSourceSchema.parse(invalidSource)).toThrow();
    expect(() =>
      mediaSourceManifestSchema.parse({
        schemaVersion: "media-source-manifest-v1",
        episodeId: "episode-m5",
        updatedAt: "2026-08-16T00:00:00.000Z",
        sources: [invalidSource],
        assets: [],
      }),
    ).toThrow();
  });

  it("does not treat a URL as a media artifact", () => {
    const repoRoot = temporaryRepo();
    const {manifest} = admittedManifestWithAsset(repoRoot);
    const notIngested = makeAsset({
      repoRoot,
      manifest,
      mediaId: "episode-m5:media:not-ingested",
      filename: "not-ingested.mp4",
    });
    fs.rmSync(path.join(repoRoot, notIngested.artifactRef.path));
    expect(() => registerMediaAsset({repoRoot, manifest, asset: notIngested})).toThrow(
      /ARTIFACT_HASH_MISMATCH/u,
    );
    expect(mediaSourceManifestSchema.parse(manifest).assets).toHaveLength(1);
  });

  it("registers admitted bytes idempotently and persists a hash-bound manifest", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    const registered = registerMediaAsset({
      repoRoot,
      manifest,
      asset,
      updatedAt: "2026-08-16T00:00:03.000Z",
    });
    expect(registered.assets).toHaveLength(1);

    const controlHash = writeMediaSourceManifest(repoRoot, registered);
    expect(controlHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(readMediaSourceManifest(repoRoot, "episode-m5")).toEqual(registered);
    expect(readMediaSourceManifestVersion(repoRoot, "episode-m5")).toBe(controlHash);
  });

  it("fails closed on every non-approved rights state before render", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    selectMediaArtifact(repoRoot, asset);
    expect(assertMediaAssetRenderable(repoRoot, manifest, asset)).toBeUndefined();

    for (const rightsStatus of ["unknown", "review-required", "rejected"] as const) {
      const blockedAsset = mediaAssetSchema.parse({...asset, rightsStatus});
      const blockedManifest = mediaSourceManifestSchema.parse({
        ...manifest,
        updatedAt: "2026-08-16T00:00:04.000Z",
        assets: [blockedAsset],
      });
      expect(isMediaAssetRenderable(repoRoot, blockedManifest, blockedAsset)).toBe(false);
      expect(() => assertMediaAssetRenderable(repoRoot, blockedManifest, blockedAsset)).toThrow(
        /MEDIA_ASSET_RIGHTS_NOT_APPROVED/u,
      );
    }
  });

  it("fails closed when source rights or admission are not approved", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    selectMediaArtifact(repoRoot, asset);

    const pendingSourceManifest = mediaSourceManifestSchema.parse({
      ...manifest,
      sources: [
        mediaSourceSchema.parse({
          ...manifest.sources[0],
          admissionStatus: "pending",
          admittedAt: undefined,
          admittedBy: undefined,
        }),
      ],
    });
    expect(() => assertMediaAssetRenderable(repoRoot, pendingSourceManifest, asset)).toThrow(
      /MEDIA_SOURCE_NOT_ADMITTED/u,
    );

    const rejectedRightsManifest = mediaSourceManifestSchema.parse({
      ...manifest,
      sources: [mediaSourceSchema.parse({...manifest.sources[0], rightsStatus: "rejected"})],
    });
    expect(() => assertMediaAssetRenderable(repoRoot, rejectedRightsManifest, asset)).toThrow(
      /MEDIA_SOURCE_RIGHTS_NOT_APPROVED/u,
    );
  });

  it("detects tampered media bytes and refuses render", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    selectMediaArtifact(repoRoot, asset);
    expect(isMediaAssetRenderable(repoRoot, manifest, asset)).toBe(true);

    writeFile(repoRoot, asset.artifactRef.path, "tampered founder demo bytes\n");
    expect(isMediaAssetRenderable(repoRoot, manifest, asset)).toBe(false);
    expect(() => assertMediaAssetRenderable(repoRoot, manifest, asset)).toThrow(
      /ARTIFACT_HASH_MISMATCH/u,
    );
  });

  it("requires the media ArtifactRef to be selected by default", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    expect(isMediaAssetRenderable(repoRoot, manifest, asset)).toBe(false);
    expect(isMediaAssetRenderable(repoRoot, manifest, asset, {requireSelected: false})).toBe(true);

    selectMediaArtifact(repoRoot, asset);
    expect(isMediaAssetRenderable(repoRoot, manifest, asset)).toBe(true);
  });

  it("rejects cross-episode media registration", () => {
    const repoRoot = temporaryRepo();
    const {manifest} = admittedManifestWithAsset(repoRoot);
    const otherAsset = makeAsset({
      repoRoot,
      manifest,
      mediaId: "episode-m5:media:other",
      filename: "other.mp4",
    });
    const crossed = mediaAssetSchema.parse({
      ...otherAsset,
      episodeId: "episode-other",
      mediaId: "episode-other:media:other",
      mediaSourceId: "episode-other:media-source:founder",
      artifactRef: {
        ...otherAsset.artifactRef,
        episodeId: "episode-other",
        artifactId: "episode-other:media:other",
        path: "content/episode-other/media/assets/other.mp4",
      },
    });
    expect(() => registerMediaAsset({repoRoot, manifest, asset: crossed})).toThrow(
      /MEDIA_ASSET_EPISODE_MISMATCH/u,
    );
  });

  it("writes the source manifest with optimistic CAS", () => {
    const repoRoot = temporaryRepo();
    const {manifest} = admittedManifestWithAsset(repoRoot);
    const first = writeMediaSourceManifest(repoRoot, manifest);
    const next = registerMediaSource({
      manifest,
      source: makeSource({
        sourceId: "episode-m5:media-source:launch",
        sourceUrl: "https://example.com/launch.mp4",
        sourceType: "official",
      }),
      updatedAt: "2026-08-16T00:00:05.000Z",
    });

    expect(() =>
      writeMediaSourceManifestCas({repoRoot, manifest: next, expectedVersion: null}),
    ).toThrow(/MEDIA_SOURCE_MANIFEST_CAS_CONFLICT/u);
    const second = writeMediaSourceManifestCas({
      repoRoot,
      manifest: next,
      expectedVersion: first,
    });
    expect(second).toMatch(/^[a-f0-9]{64}$/u);
    expect(readMediaSourceManifestVersion(repoRoot, "episode-m5")).toBe(second);
  });

  it("validates clip, verification, and use-real decision gates", () => {
    const repoRoot = temporaryRepo();
    const {asset} = admittedManifestWithAsset(repoRoot);
    selectMediaArtifact(repoRoot, asset);
    const clip: MediaClipRef = mediaClipRefSchema.parse({
      clipId: "episode-m5:media-clip:founder-01",
      episodeId: "episode-m5",
      mediaId: asset.mediaId,
      sourceMediaRef: asset.artifactRef,
      startMs: 1000,
      endMs: 9000,
      claimIds: ["claim-m5-001"],
      visualIntent: "founder demonstrates calendar before sending email",
      transcriptRefs: [],
      createdAt: "2026-08-16T00:00:03.000Z",
    });
    expect(() => mediaClipRefSchema.parse({...clip, endMs: 500})).toThrow();

    writeFile(
      repoRoot,
      "content/episode-m5/media/verifications/founder-01.json",
      "verification artifact\n",
    );
    const verificationRef = buildArtifactRef({
      repoRoot,
      artifactId: "episode-m5:media-verification:founder-01",
      episodeId: "episode-m5",
      path: "content/episode-m5/media/verifications/founder-01.json",
      mediaType: "application/json",
      schemaVersion: "media-verification-v1",
      producer: "m5-media-contract-test",
      createdAt: "2026-08-16T00:00:03.000Z",
    });
    expect(() =>
      mediaVerificationSchema.parse({
        verificationId: "episode-m5:media-verification:founder-01",
        episodeId: "episode-m5",
        clipId: clip.clipId,
        clipRef: clip,
        verdict: "pass",
        relevance: 0.2,
        claimMatch: 0.9,
        visualQuality: 0.9,
        misleadingRisk: 0.1,
        observedActions: ["opens calendar"],
        observedEntities: ["Poke"],
        recommendedStartMs: 1000,
        recommendedEndMs: 9000,
        reasons: ["low relevance to claim"],
        provider: "deterministic-stub",
        model: null,
        promptVersion: "media-verification-v1",
        toolVersion: "m5-test-v1",
        artifactRef: verificationRef,
        createdAt: "2026-08-16T00:00:03.000Z",
      }),
    ).toThrow();

    writeFile(repoRoot, "content/episode-m5/media/decisions/seg-01.json", "decision artifact\n");
    const decisionRef = buildArtifactRef({
      repoRoot,
      artifactId: "episode-m5:media-usage-decision:seg-01",
      episodeId: "episode-m5",
      path: "content/episode-m5/media/decisions/seg-01.json",
      mediaType: "application/json",
      schemaVersion: "media-usage-decision-v1",
      producer: "m5-media-contract-test",
      createdAt: "2026-08-16T00:00:04.000Z",
    });
    expect(() =>
      mediaUsageDecisionSchema.parse({
        decisionId: "episode-m5:media-usage-decision:seg-01",
        episodeId: "episode-m5",
        segmentId: "seg-01",
        claimIds: ["claim-m5-001"],
        clipId: clip.clipId,
        clipRef: {...clip, verificationRef},
        decision: "use-real",
        reason: "verified founder demo matches claim",
        gate: {
          sourceAdmitted: true,
          rightsApproved: true,
          hashValid: false,
          verificationPassed: true,
        },
        decidedBy: "visual-director",
        decidedAt: "2026-08-16T00:00:04.000Z",
        artifactRef: decisionRef,
      }),
    ).toThrow(/all deterministic gates to pass/u);
    expect(() =>
      mediaUsageDecisionSchema.parse({
        decisionId: "episode-m5:media-usage-decision:seg-01",
        episodeId: "episode-m5",
        segmentId: "seg-01",
        claimIds: ["claim-m5-001"],
        clipId: clip.clipId,
        clipRef: clip,
        decision: "use-real",
        reason: "verified founder demo matches claim",
        gate: {
          sourceAdmitted: true,
          rightsApproved: true,
          hashValid: true,
          verificationPassed: true,
        },
        decidedBy: "visual-director",
        decidedAt: "2026-08-16T00:00:04.000Z",
        artifactRef: decisionRef,
      }),
    ).toThrow(/verificationRef/u);
    expect(() =>
      mediaUsageDecisionSchema.parse({
        decisionId: "episode-m5:media-usage-decision:seg-01",
        episodeId: "episode-m5",
        segmentId: "seg-01",
        claimIds: ["claim-m5-001"],
        clipId: "episode-m5:media-clip:other",
        clipRef: clip,
        decision: "fallback",
        reason: "ids must still match when a clip is attached",
        fallbackReason: "clip identity mismatch",
        gate: {
          sourceAdmitted: true,
          rightsApproved: true,
          hashValid: true,
          verificationPassed: false,
        },
        decidedBy: "visual-director",
        decidedAt: "2026-08-16T00:00:04.000Z",
        artifactRef: decisionRef,
      }),
    ).toThrow(/clipId must match clipRef.clipId/u);
  });

  it("rejects asset filenames that escape the assets directory", () => {
    expect(() => mediaAssetRepositoryPath("episode-m5", "..")).toThrow(
      /Invalid media asset filename/u,
    );
    expect(() => mediaAssetRepositoryPath("episode-m5", ".hidden.mp4")).toThrow(
      /Invalid media asset filename/u,
    );
  });

  it("requires a passing hash-bound verification before a clip can render", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    selectMediaArtifact(repoRoot, asset);
    const clip: MediaClipRef = mediaClipRefSchema.parse({
      clipId: "episode-m5:media-clip:founder-01",
      episodeId: "episode-m5",
      mediaId: asset.mediaId,
      sourceMediaRef: asset.artifactRef,
      startMs: 1000,
      endMs: 9000,
      claimIds: ["claim-m5-001"],
      visualIntent: "founder demonstrates calendar before sending email",
      transcriptRefs: [],
      createdAt: "2026-08-16T00:00:03.000Z",
    });
    expect(isMediaClipRenderable(repoRoot, manifest, asset, clip)).toBe(false);

    const verificationPath = "content/episode-m5/media/verifications/founder-01.json";
    writeFile(
      repoRoot,
      verificationPath,
      `${JSON.stringify({
        verificationId: "episode-m5:media-verification:founder-01",
        episodeId: "episode-m5",
        clipId: clip.clipId,
        clipRef: clip,
        verdict: "pass",
        relevance: 0.9,
        claimMatch: 0.9,
        visualQuality: 0.9,
        misleadingRisk: 0.1,
        observedActions: ["opens calendar"],
        observedEntities: ["Poke"],
        recommendedStartMs: 1000,
        recommendedEndMs: 9000,
        reasons: ["clip matches the claim"],
        provider: "deterministic-stub",
        model: null,
        promptVersion: "media-verification-v1",
        toolVersion: "m5-test-v1",
        artifactRef: {
          artifactId: "episode-m5:media-verification:founder-01",
          episodeId: "episode-m5",
          path: verificationPath,
          mediaType: "application/json",
          schemaVersion: "media-verification-v1",
          revision: 1,
          sha256: "a".repeat(64),
          sizeBytes: 1,
          producer: "m5-media-contract-test",
          createdAt: "2026-08-16T00:00:03.000Z",
        },
        createdAt: "2026-08-16T00:00:03.000Z",
      })}\n`,
    );
    const verificationRef = buildArtifactRef({
      repoRoot,
      artifactId: "episode-m5:media-verification:founder-01",
      episodeId: "episode-m5",
      path: verificationPath,
      mediaType: "application/json",
      schemaVersion: "media-verification-v1",
      producer: "m5-media-contract-test",
      createdAt: "2026-08-16T00:00:03.000Z",
    });
    const renderableClip = mediaClipRefSchema.parse({...clip, verificationRef});
    expect(assertMediaClipRenderable(repoRoot, manifest, asset, renderableClip)).toBeUndefined();
    expect(
      isMediaClipRenderable(
        repoRoot,
        manifest,
        asset,
        mediaClipRefSchema.parse({...renderableClip, endMs: 20_000}),
      ),
    ).toBe(false);
  });

  it("proves sha256 in the persisted manifest remains a source of truth", () => {
    const repoRoot = temporaryRepo();
    const {manifest, asset} = admittedManifestWithAsset(repoRoot);
    writeMediaSourceManifest(repoRoot, manifest);
    expect(readMediaSourceManifest(repoRoot, "episode-m5").assets[0]?.sha256).toBe(
      sha256("real founder demo bytes\n"),
    );
    expect(readMediaSourceManifest(repoRoot, "episode-m5").assets[0]?.sha256).toBe(
      asset.artifactRef.sha256,
    );
  });
});
