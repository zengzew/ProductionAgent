import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  artifactDependencySchema,
  artifactRefSchema,
  buildArtifactRef,
  emptyArtifactIndex,
  humanDecisionSchema,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  writeArtifactIndexCas,
  type ArtifactDependency,
  type ArtifactRef,
  type HumanDecision,
} from "../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  buildMediaArtifactRef,
  createDeterministicSemanticAdapter,
  createStubKeyframeExtractor,
  createStubTranscriptProvider,
  getMediaSource,
  indexMediaAsset,
  mediaAssetSchema,
  mediaRetrievalCandidateRepositoryPath,
  mediaRetrievalRequestSchema,
  mediaSourceManifestSchema,
  mediaSourceSchema,
  mediaVerificationRepositoryPath,
  proposeMediaSource,
  readMediaEvents,
  readMediaRetrievalResult,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaAsset,
  writeMediaSourceManifestCas,
  type MediaAsset,
  type MediaRetrievalRequest,
  type MediaRightsStatus,
  type MediaSourceType,
  type MediaUnderstandingConfig,
  type TranscriptProvider,
} from "../src/media";
import {
  assertMediaClipVerified,
  createDeterministicVerificationProvider,
  createStubShortClipExtractor,
  mediaVerificationRequestSchema,
  readMediaVerification,
  rebindMediaVerification,
  verifyMediaClip,
  type MediaVerificationProvider,
  type MediaVerificationProviderOutput,
  type MediaVerificationRequest,
} from "../src/media/verify";
import {
  compareVisualSlotCandidates,
  DEFAULT_VISUAL_SELECTION_CONFIG,
  MEDIA_VISUAL_SELECTION_VERSION,
  MEDIA_VISUAL_SLOT_SCHEMA_VERSION,
  readVisualSlot,
  selectVisualSlotForSegment,
  selectVisualSlotsForScript,
  visualSlotSchema,
  type VisualSlotOutcome,
} from "../src/media/select";
import {retrieveMediaCandidates} from "../src/media/retrieve";
import {serializeIndexArtifact} from "../src/media/understanding";
import {createVisualSlotDirector} from "../src/orchestration/agents/adapters/visual-director";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-select-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const episodeId = "episode-m5";
const FIXED_NOW = "2026-08-16T00:00:00.000Z";

const sha256Bytes = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const sha256File = (filePath: string): string => sha256Bytes(fs.readFileSync(filePath));

/* ------------------------------------------------------------------------- *
 * Fixtures (mirrors tests/media-verify.test.ts)
 * ------------------------------------------------------------------------- */

const baseSource = (
  sourceId: string,
  overrides: Record<string, unknown> = {},
): {
  sourceId: string;
  sourceUrl?: string;
  publisher?: string;
  sourceType: MediaSourceType;
  rightsBasis?: string;
  rightsStatus?: MediaRightsStatus;
  notes?: string;
} => ({
  sourceId,
  sourceUrl: "",
  publisher: "Example Corp",
  sourceType: "local-approved",
  rightsBasis: "Owner-provided fixture",
  ...overrides,
});

const writeFacts = (
  repoRoot: string,
  claims: Array<{id: string; claim: string}>,
  options: {metricName?: boolean} = {},
): void => {
  const directory = path.join(repoRoot, "content", episodeId, "research");
  fs.mkdirSync(directory, {recursive: true});
  const fullClaims = claims.map((entry, index) => ({
    ...entry,
    metricName: options.metricName ? "fixture-metric" : "",
    value: options.metricName ? "42" : "",
    period: "",
    eventDate: "",
    sourceIds: [`src-fixture-${index}`],
    confidence: "high",
    reportingType: "independently-verified",
    allowedInNarration: true,
    notes: "fixture",
  }));
  fs.writeFileSync(path.join(directory, "facts.json"), JSON.stringify(fullClaims, null, 2));
};

const manifestRefFor = (repoRoot: string): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:media:source-manifest`,
    episodeId,
    path: `content/${episodeId}/media/source-manifest.json`,
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "m5-select-test",
    createdAt: FIXED_NOW,
  });

const makeDecision = (input: {
  gate: "media-admission" | "media-rights";
  decision: "approve" | "reject";
  ref: ArtifactRef;
  decisionId: string;
}): HumanDecision =>
  humanDecisionSchema.parse({
    decisionId: input.decisionId,
    gate: input.gate,
    decision: input.decision,
    reviewer: "human-reviewer-1",
    timestamp: FIXED_NOW,
    reason: "reviewed for the media audit trail",
    artifactRefs: [input.ref],
    approvalEpoch: 0,
  });

const approveSourceWithType = (
  repoRoot: string,
  sourceId: string,
  sourceType: MediaSourceType,
): void => {
  const proposal = proposeMediaSource({
    repoRoot,
    episodeId,
    source: baseSource(sourceId, {
      sourceType,
      ...(sourceType === "local-approved"
        ? {}
        : {sourceUrl: `https://www.example.com/${sourceId.replace(/[^a-z0-9-]/gu, "-")}`}),
    }),
  });
  const slug = sourceId.replace(/[^A-Za-z0-9]/gu, "-");
  applyMediaSourceAdmission({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref: manifestRefFor(repoRoot),
      decisionId: `admission-${slug}`,
    }),
    expectedManifestVersion: proposal.version,
  });
  applyMediaSourceRights({
    repoRoot,
    episodeId,
    sourceId: proposal.source.sourceId,
    decision: makeDecision({
      gate: "media-rights",
      decision: "approve",
      ref: manifestRefFor(repoRoot),
      decisionId: `rights-${slug}`,
    }),
    expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
};

const decisionDependencies = (repoRoot: string, sourceId: string): ArtifactDependency[] => {
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const source = getMediaSource(manifest, sourceId);
  if (!source) throw new Error("fixture source missing");
  const dependencies: ArtifactDependency[] = [];
  for (const ref of [source.admissionDecisionRef, source.rightsDecisionRef]) {
    if (ref) {
      dependencies.push(
        artifactDependencySchema.parse({
          artifactId: ref.artifactId,
          path: ref.path,
          sha256: ref.sha256,
          relation: "reads",
        }),
      );
    }
  }
  return dependencies;
};

const registerCandidateInIndex = (
  repoRoot: string,
  ref: ArtifactRef,
  executionId: string,
  sourceId: string,
): void => {
  const filePath = path.join(repoRoot, "content", episodeId, "artifact-index.json");
  const expectedVersion = readArtifactIndexVersion(filePath);
  let index = fs.existsSync(filePath) ? readArtifactIndex(filePath) : emptyArtifactIndex(episodeId);
  index = registerCandidate(index, ref, executionId, decisionDependencies(repoRoot, sourceId));
  writeArtifactIndexCas({filePath, index, expectedVersion, casRoot: repoRoot});
};

const extensionFor = (mediaType: string): string => {
  if (mediaType.startsWith("video/")) return "mp4";
  if (mediaType.startsWith("audio/")) return "mp3";
  return "png";
};

const fabricateOriginal = (input: {
  repoRoot: string;
  mediaId: string;
  sourceId: string;
  bytes: Uint8Array;
  durationMs: number | null;
  mediaType?: string;
}): MediaAsset => {
  const {repoRoot} = input;
  const mediaType = input.mediaType ?? "video/mp4";
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const source = getMediaSource(manifest, input.sourceId);
  if (!source) throw new Error("fixture source missing");
  const slug = input.mediaId.slice(`${episodeId}:media:`.length);
  const filename = `${slug}.${extensionFor(mediaType)}`;
  const filePath = path.join(repoRoot, "content", episodeId, "media", "assets", filename);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, input.bytes);
  const ref = buildMediaArtifactRef({
    repoRoot,
    episodeId,
    mediaId: input.mediaId,
    filename,
    mediaType,
    producer: "m5-select-fixture",
    createdAt: FIXED_NOW,
  });
  const asset = mediaAssetSchema.parse({
    mediaId: input.mediaId,
    episodeId,
    mediaSourceId: input.sourceId,
    sourceUrl: source.sourceUrl,
    publisher: source.publisher,
    sourceType: source.sourceType,
    acquisitionMethod: "local-approved",
    originalFilename: filename,
    mediaType,
    sha256: ref.sha256,
    sizeBytes: ref.sizeBytes,
    durationMs: input.durationMs,
    width: mediaType.startsWith("video/") ? 320 : null,
    height: mediaType.startsWith("video/") ? 240 : null,
    fps: mediaType.startsWith("video/") ? 25 : null,
    audioChannels: mediaType.startsWith("audio/") ? 2 : null,
    capturedAt: FIXED_NOW,
    accessedAt: FIXED_NOW,
    publishedAt: null,
    rightsBasis: "Owner-provided fixture",
    rightsStatus: "approved",
    artifactRef: ref,
    kind: "original",
  });
  const registered = registerMediaAsset({repoRoot, manifest, asset});
  writeMediaSourceManifestCas({
    repoRoot,
    manifest: registered,
    expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
  registerCandidateInIndex(repoRoot, ref, `media-ingest:${input.mediaId}`, input.sourceId);
  return asset;
};

const withSourceRights = (
  repoRoot: string,
  sourceId: string,
  rightsStatus: MediaRightsStatus,
): void => {
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const next = mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: FIXED_NOW,
    sources: manifest.sources.map((candidate) =>
      candidate.sourceId === sourceId
        ? mediaSourceSchema.parse({...candidate, rightsStatus})
        : candidate,
    ),
  });
  writeMediaSourceManifestCas({
    repoRoot,
    manifest: next,
    expectedVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
  });
};

const stubKeyframes = createStubKeyframeExtractor();

const stubConfig: MediaUnderstandingConfig = {
  scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
  clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
  keyframe: {quality: 2, mediaType: "image/jpeg"},
};

const runIndex = (
  repoRoot: string,
  input: {
    mediaId: string;
    transcriptProvider: TranscriptProvider;
  },
) =>
  indexMediaAsset({
    repoRoot,
    episodeId,
    mediaId: input.mediaId,
    cache: null,
    transcriptProvider: input.transcriptProvider,
    semanticAdapter: createDeterministicSemanticAdapter(),
    keyframeExtractor: stubKeyframes,
    config: stubConfig,
    now: () => FIXED_NOW,
  });

const makeRequest = (overrides: Partial<MediaRetrievalRequest> = {}): MediaRetrievalRequest =>
  mediaRetrievalRequestSchema.parse({
    schemaVersion: "media-retrieval-request-v1",
    episodeId,
    segmentId: "seg-001",
    claimIds: [],
    narration: "测试旁白",
    visualIntent: "测试画面",
    topK: 5,
    ...overrides,
  });

const runRetrieve = (
  repoRoot: string,
  request: MediaRetrievalRequest,
): Promise<Awaited<ReturnType<typeof retrieveMediaCandidates>>> =>
  retrieveMediaCandidates({
    repoRoot,
    episodeId,
    request,
    cache: null,
    now: () => FIXED_NOW,
  });

const artifactRecords = (repoRoot: string) =>
  readArtifactIndex(path.join(repoRoot, "content", episodeId, "artifact-index.json")).artifacts;

/** BFS over registry dependencies; true when `target` artifactId is reachable. */
const registryReaches = (
  repoRoot: string,
  fromArtifactId: string,
  targetArtifactId: string,
): boolean => {
  const records = artifactRecords(repoRoot);
  const byId = new Map(records.map((record) => [record.ref.artifactId, record]));
  const queue = [fromArtifactId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (current === targetArtifactId) return true;
    const record = byId.get(current);
    if (record) {
      for (const dependency of record.dependencies) queue.push(dependency.artifactId);
    }
  }
  return false;
};

const CLAIMS = [
  {id: "claim-fixture-001", claim: "产品核心功能演示 展示了 主界面 交互"},
  {id: "claim-fixture-003", claim: "公司成立 日期 是 2024"},
] satisfies Array<{id: string; claim: string}>;

const OFFICIAL_SOURCE = "episode-m5:media-source:official";
const DEMO_MEDIA_ID = "episode-m5:media:demo";
const DEMO_SEGMENTS = [
  {text: "产品核心功能演示 主界面 交互 反馈", startMs: 0, endMs: 4000, speaker: "host"},
  {text: "用户反馈 产品 演示 界面", startMs: 4000, endMs: 8000, speaker: "host"},
  {text: "公司成立 日期 2024 庆典", startMs: 8000, endMs: 10000, speaker: "host"},
] as const;

const defaultSetup = async (repoRoot: string): Promise<void> => {
  writeFacts(repoRoot, CLAIMS);
  approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
  fabricateOriginal({
    repoRoot,
    mediaId: DEMO_MEDIA_ID,
    sourceId: OFFICIAL_SOURCE,
    bytes: Buffer.from("fixture demo video bytes v1"),
    durationMs: 10000,
  });
  await runIndex(repoRoot, {
    mediaId: DEMO_MEDIA_ID,
    transcriptProvider: createStubTranscriptProvider({segments: [...DEMO_SEGMENTS]}),
  });
};

type RetrievalFixture = {
  repoRoot: string;
  retrievalRef: ArtifactRef;
  request: MediaRetrievalRequest;
  result: ReturnType<typeof readMediaRetrievalResult>;
};

const setupRetrieval = async (
  repoRoot: string,
  requestOverrides: Partial<MediaRetrievalRequest> = {},
): Promise<RetrievalFixture> => {
  await defaultSetup(repoRoot);
  const request = makeRequest({
    claimIds: ["claim-fixture-001", "claim-fixture-003"],
    narration: "公司成立 日期 2024",
    visualIntent: "庆典 画面",
    topK: 5,
    ...requestOverrides,
  });
  const outcome = await runRetrieve(repoRoot, request);
  const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
  return {repoRoot, retrievalRef: outcome.artifactRef, request, result};
};

const makeVerifyRequest = (input: {
  clipId: string;
  claimIds: string[];
  narration: string;
  visualIntent: string;
  retrievalResultRef: ArtifactRef;
}): MediaVerificationRequest =>
  mediaVerificationRequestSchema.parse({
    schemaVersion: "media-verification-request-v1",
    episodeId,
    segmentId: "seg-001",
    clipId: input.clipId,
    claimIds: input.claimIds,
    narration: input.narration,
    visualIntent: input.visualIntent,
    retrievalResultRef: input.retrievalResultRef,
    maxKeyframes: 4,
  });

const runVerify = (
  repoRoot: string,
  request: MediaVerificationRequest,
  provider: MediaVerificationProvider,
): Promise<Awaited<ReturnType<typeof verifyMediaClip>>> =>
  verifyMediaClip({
    repoRoot,
    episodeId,
    request,
    provider,
    cache: null,
    shortClipExtractor: createStubShortClipExtractor(),
    now: () => FIXED_NOW,
  });

const passOutput: MediaVerificationProviderOutput = {
  verdict: "pass",
  relevance: 0.9,
  claimMatch: 0.9,
  visualQuality: 0.8,
  misleadingRisk: 0.1,
  observedActions: ["演示产品主界面"],
  observedEntities: ["Poke"],
  observedText: ["公司成立 日期 2024"],
  recommendedStartMs: 8000,
  recommendedEndMs: 10000,
  reasons: ["short clip shows the claimed demo"],
};

/**
 * Pass provider whose recommended range always lies inside the candidate
 * window, so any candidate (not just the top one) can be verified.
 */
const windowPassProvider = (
  overrides: Partial<MediaVerificationProviderOutput> = {},
): MediaVerificationProvider =>
  createDeterministicVerificationProvider({
    output: (input) => ({
      ...passOutput,
      recommendedStartMs: input.clip.startMs,
      recommendedEndMs: input.clip.endMs,
      ...overrides,
    }),
  });

const selectFor = (
  repoRoot: string,
  segment: {
    segmentId: string;
    claimIds: string[];
    narration: string;
    visualIntent: string;
    durationTargetMs?: number | null;
  },
  config = DEFAULT_VISUAL_SELECTION_CONFIG,
): Promise<VisualSlotOutcome> =>
  selectVisualSlotForSegment({
    repoRoot,
    episodeId,
    segment,
    config,
    now: () => FIXED_NOW,
  });

/* ------------------------------------------------------------------------- *
 * WP-M5.07 tests
 * ------------------------------------------------------------------------- */

describe("WP-M5.07 visual slot real-media-first selection", () => {
  it("selects the verified high-fit clip and persists a registered visual-slot-v1 artifact", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");

    const verifyOutcome = await runVerify(
      repoRoot,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      }),
      windowPassProvider(),
    );
    expect(verifyOutcome.verdict).toBe("pass");

    const outcome = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      durationTargetMs: 5000,
    });

    // Real media wins when a verified, high-fit clip exists.
    expect(outcome.status).toBe("ready");
    expect(outcome.selectedType).toBe("real-media");
    expect(outcome.fallbackType).toBeNull();

    // Reference-only outcome: no bodies, only refs.
    expect(JSON.stringify(outcome)).not.toContain("公司成立");
    expect(JSON.stringify(outcome)).not.toContain("reasons");

    // Persistence: artifact bytes are the source of truth + registered.
    const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
    expect(slot.schemaVersion).toBe(MEDIA_VISUAL_SLOT_SCHEMA_VERSION);
    expect(slot.selectionVersion).toBe(MEDIA_VISUAL_SELECTION_VERSION);
    expect(slot.episodeId).toBe(episodeId);
    expect(slot.segmentId).toBe("seg-001");
    expect(slot.claimIds).toEqual(fixture.request.claimIds);
    expect(slot.selectedType).toBe("real-media");
    expect(slot.selectedMediaClipRef?.clipId).toBe(candidate.clipId);
    expect(slot.verificationRef?.artifactId).toBe(verifyOutcome.artifactRef.artifactId);
    // The slot anchors the registered (external) verification ref — the same
    // ref the WP-M5.06 pipeline returned — so the bytes are verifiable.
    expect(slot.verificationRef?.sha256).toBe(verifyOutcome.artifactRef.sha256);
    expect(slot.fallbackType).toBeNull();
    expect(slot.fallbackReason).toBeNull();
    expect(slot.selectionScore).toBeGreaterThan(0);
    expect(slot.reasons.length).toBeGreaterThan(0);
    expect(slot.gate).toEqual({
      sourceAdmitted: true,
      rightsApproved: true,
      hashValid: true,
      verificationPassed: true,
      episodeIsolated: true,
    });
    expect(slot.artifactRef.artifactId).toBe(slot.slotId);
    // The slot artifact is hash-bound and registered.
    const slotPath = path.join(repoRoot, slot.artifactRef.path);
    expect(sha256File(slotPath)).toBe(outcome.artifactRef.sha256);
    expect(outcome.artifactRef.artifactId).toBe(`${episodeId}:media-visual-slot:seg-001`);
    const record = artifactRecords(repoRoot).find(
      (candidateRecord) => candidateRecord.ref.artifactId === outcome.artifactRef.artifactId,
    );
    expect(record?.ref.sha256).toBe(outcome.artifactRef.sha256);

    // Embedded ref is the content hash of the body without the self-reference
    // (serialized with the canonical sorted-key serializer).
    const parsed = visualSlotSchema.parse(JSON.parse(fs.readFileSync(slotPath, "utf8")) as unknown);
    const withoutArtifactRef = {...parsed};
    Reflect.deleteProperty(withoutArtifactRef, "artifactRef");
    expect(sha256Bytes(Buffer.from(serializeIndexArtifact(withoutArtifactRef), "utf8"))).toBe(
      parsed.artifactRef.sha256,
    );

    // The chosen clip still passes the M5.06 authorization gate.
    expect(
      assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: verifyOutcome.artifactRef,
      }).verdict,
    ).toBe("pass");
  });

  it("rebinds an unchanged human review to a refreshed retrieval and keeps the old review immutable", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const original = await runVerify(
      repoRoot,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      }),
      windowPassProvider(),
    );

    const refreshed = await runRetrieve(repoRoot, {...fixture.request, topK: 1});
    expect(refreshed.artifactRef.sha256).not.toBe(fixture.retrievalRef.sha256);

    const rebound = rebindMediaVerification({
      repoRoot,
      episodeId,
      request: makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: refreshed.artifactRef,
      }),
      now: () => FIXED_NOW,
    });

    expect(rebound.rebind).toBe(true);
    expect(rebound.reused).toBe(true);
    expect(rebound.artifactRef.sha256).not.toBe(original.artifactRef.sha256);
    expect(rebound.clipArtifactRef.sha256).toBe(original.clipArtifactRef.sha256);
    const verification = readMediaVerification(repoRoot, episodeId, "seg-001", candidate.clipId);
    expect(verification.provider).toBe("deterministic-stub");
    expect(verification.retrievalResultRef.sha256).toBe(refreshed.artifactRef.sha256);
    expect(
      assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: rebound.artifactRef,
      }).verdict,
    ).toBe("pass");
    expect(
      (
        await selectFor(repoRoot, {
          segmentId: "seg-001",
          claimIds: fixture.request.claimIds,
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
        })
      ).selectedType,
    ).toBe("real-media");

    const repeated = rebindMediaVerification({
      repoRoot,
      episodeId,
      request: makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: refreshed.artifactRef,
      }),
      now: () => "2026-08-16T00:01:00.000Z",
    });
    expect(repeated.artifactRef.revision).toBe(rebound.artifactRef.revision);
    expect(repeated.artifactRef.sha256).toBe(rebound.artifactRef.sha256);
    expect(
      readMediaVerification(repoRoot, episodeId, "seg-001", candidate.clipId).artifactRef.revision,
    ).toBe(repeated.artifactRef.revision);
  });

  it("rejects a retrieval artifact whose request is stale for the current script segment", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    await expect(
      selectFor(repoRoot, {
        segmentId: "seg-001",
        claimIds: fixture.request.claimIds,
        narration: "当前脚本已经改过的旁白",
        visualIntent: fixture.request.visualIntent,
      }),
    ).rejects.toThrow(/MEDIA_SELECT_RETRIEVAL_REQUEST_STALE/u);
  });

  it("does not rebind a human review to a retrieval with a stale request", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const staleRetrieval = await runRetrieve(repoRoot, {
      ...fixture.request,
      narration: "旧的检索请求，不属于当前脚本",
    });

    expect(() =>
      rebindMediaVerification({
        repoRoot,
        episodeId,
        request: makeVerifyRequest({
          clipId: candidate.clipId,
          claimIds: fixture.request.claimIds,
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
          retrievalResultRef: staleRetrieval.artifactRef,
        }),
      }),
    ).toThrow(/MEDIA_VERIFY_RETRIEVAL_REQUEST_STALE/u);
  });

  it("never selects a reject/uncertain clip and falls back when nothing passes", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const base = {
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    };

    // The highest-scoring candidate gets a VLM reject — it must not be picked.
    const rejectOutcome = await runVerify(
      repoRoot,
      makeVerifyRequest({clipId: candidate.clipId, ...base}),
      createDeterministicVerificationProvider({
        output: {...passOutput, verdict: "reject", reasons: ["short clip does not match"]},
      }),
    );
    expect(rejectOutcome.verdict).toBe("reject");

    // No other candidate is verified → structured NOT_VERIFIED fallback.
    const fallbackOutcome = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
    });
    expect(fallbackOutcome.selectedType).not.toBe("real-media");
    expect(fallbackOutcome.fallbackType).toBe("REAL_MEDIA_NOT_VERIFIED");
    const fallbackSlot = readVisualSlot(repoRoot, episodeId, "seg-001");
    expect(fallbackSlot.selectedMediaClipRef).toBeNull();
    expect(fallbackSlot.verificationRef).toBeNull();
    expect(fallbackSlot.selectionScore).toBe(0);
    expect(fallbackSlot.gate.verificationPassed).toBe(false);
    expect(fallbackSlot.gate.hashValid).toBe(true);
    // Fixed fallback stage order without screenshot/data evidence: programmatic.
    expect(fallbackSlot.selectedType).toBe("programmatic-visual");
  });

  it("skips an uncertain top candidate and picks the next pass-verified candidate", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidates = fixture.result.candidates;
    const top = candidates[0];
    const second = candidates[1];
    if (!top || !second) throw new Error("fixture needs two candidates");
    const base = {
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    };

    await runVerify(
      repoRoot,
      makeVerifyRequest({clipId: top.clipId, ...base}),
      createDeterministicVerificationProvider({
        output: {...passOutput, verdict: "uncertain", reasons: ["ambiguous visuals"]},
      }),
    );
    await runVerify(
      repoRoot,
      makeVerifyRequest({clipId: second.clipId, ...base}),
      windowPassProvider(),
    );

    const outcome = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
    });
    expect(outcome.selectedType).toBe("real-media");
    expect(outcome.fallbackType).toBeNull();
    const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
    expect(slot.selectedMediaClipRef?.clipId).toBe(second.clipId);
    expect(slot.reasons.join(" ")).toContain("selected");
  });

  it("falls back with REAL_MEDIA_RIGHTS_BLOCKED when rights are revoked", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");

    await runVerify(
      repoRoot,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      }),
      windowPassProvider(),
    );

    // Rights are revoked AFTER verification: selection must re-check them.
    withSourceRights(repoRoot, OFFICIAL_SOURCE, "rejected");

    const outcome = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
    });
    expect(outcome.selectedType).not.toBe("real-media");
    expect(outcome.fallbackType).toBe("REAL_MEDIA_RIGHTS_BLOCKED");
    const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
    expect(slot.selectedMediaClipRef).toBeNull();
    expect(slot.verificationRef).toBeNull();
    expect(slot.gate.rightsApproved).toBe(false);
    expect(slot.gate.verificationPassed).toBe(true);
    // Verification artifact is untouched: only the slot refused the clip.
    const verification = readMediaVerification(repoRoot, episodeId, "seg-001", candidate.clipId);
    expect(verification.verdict).toBe("pass");
  });

  it("falls back with REAL_MEDIA_LOW_EVIDENCE_FIT for a pass-verified clip without claim evidence", async () => {
    const repoRoot = temporaryRepo();
    // The claim text matches nothing in any clip, but the clip is still
    // retrieved via lexical/metadata overlap above the retrieval floor.
    const claims = [{id: "claim-unrelated", claim: "完全不相关的主题描述词"}];
    writeFacts(repoRoot, claims);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    fabricateOriginal({
      repoRoot,
      mediaId: DEMO_MEDIA_ID,
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    await runIndex(repoRoot, {
      mediaId: DEMO_MEDIA_ID,
      transcriptProvider: createStubTranscriptProvider({segments: [...DEMO_SEGMENTS]}),
    });
    const request = makeRequest({
      claimIds: ["claim-unrelated"],
      narration: "产品 演示",
      visualIntent: "庆典 画面",
      topK: 5,
    });
    const outcome = await runRetrieve(repoRoot, request);
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates.length).toBeGreaterThan(0);
    const candidate = result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    // Retrieval confirms the claim score is zero for this candidate.
    expect(candidate.scoreBreakdown.claim).toBe(0);
    expect(candidate.matchedClaimIds).toEqual([]);

    await runVerify(
      repoRoot,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: ["claim-unrelated"],
        narration: request.narration,
        visualIntent: request.visualIntent,
        retrievalResultRef: outcome.artifactRef,
      }),
      windowPassProvider(),
    );

    const slotOutcome = await selectFor(
      repoRoot,
      {
        segmentId: "seg-001",
        claimIds: ["claim-unrelated"],
        narration: request.narration,
        visualIntent: request.visualIntent,
      },
      {
        ...DEFAULT_VISUAL_SELECTION_CONFIG,
        gates: {...DEFAULT_VISUAL_SELECTION_CONFIG.gates, requireClaimEvidence: true},
      },
    );
    // High retrieval score + pass verification are NOT enough without claim
    // evidence: real-media-first ≠ real-media-at-all-costs.
    expect(slotOutcome.fallbackType).toBe("REAL_MEDIA_LOW_EVIDENCE_FIT");
    expect(slotOutcome.selectedType).not.toBe("real-media");
    const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
    expect(slot.gate.verificationPassed).toBe(true);
    expect(slot.reasons.join(" ")).toContain("REAL_MEDIA_LOW_EVIDENCE_FIT");
  });

  it("falls back on LOW_VISUAL_QUALITY and MISLEADING_RISK", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const base = {
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    };

    // Low visual quality.
    await runVerify(
      repoRoot,
      makeVerifyRequest({clipId: candidate.clipId, ...base}),
      windowPassProvider({visualQuality: 0.3}),
    );
    const qualityOutcome = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
    });
    expect(qualityOutcome.fallbackType).toBe("REAL_MEDIA_LOW_VISUAL_QUALITY");
    expect(readVisualSlot(repoRoot, episodeId, "seg-001").gate.verificationPassed).toBe(true);

    // Misleading risk.
    const repoRoot2 = temporaryRepo();
    const fixture2 = await setupRetrieval(repoRoot2);
    const candidate2 = fixture2.result.candidates[0];
    if (!candidate2) throw new Error("fixture candidate missing");
    await runVerify(
      repoRoot2,
      makeVerifyRequest({
        clipId: candidate2.clipId,
        ...base,
        retrievalResultRef: fixture2.retrievalRef,
      }),
      windowPassProvider({misleadingRisk: 0.9}),
    );
    const riskOutcome = await selectFor(repoRoot2, {
      segmentId: "seg-001",
      claimIds: fixture2.request.claimIds,
      narration: fixture2.request.narration,
      visualIntent: fixture2.request.visualIntent,
    });
    expect(riskOutcome.fallbackType).toBe("REAL_MEDIA_MISLEADING_RISK");
    expect(riskOutcome.selectedType).not.toBe("real-media");
  });

  it("falls back with REAL_MEDIA_NOT_FOUND and picks the fixed fallback stage order", async () => {
    // 1) No retrieval artifact at all → NOT_FOUND + programmatic stage.
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, CLAIMS);
    const notFound = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: ["claim-fixture-001"],
      narration: "测试旁白",
      visualIntent: "测试画面",
    });
    expect(notFound.fallbackType).toBe("REAL_MEDIA_NOT_FOUND");
    expect(notFound.selectedType).toBe("programmatic-visual");
    const notFoundSlot = readVisualSlot(repoRoot, episodeId, "seg-001");
    expect(notFoundSlot.selectedType).toBe("programmatic-visual");
    expect(notFoundSlot.gate).toEqual({
      sourceAdmitted: false,
      rightsApproved: false,
      hashValid: true,
      verificationPassed: false,
      episodeIsolated: true,
    });
    // Events were recorded.
    const events = readMediaEvents(repoRoot, episodeId);
    expect(events.some((event) => event.eventType === "media.selection.completed")).toBe(true);
    const completed = events.find((event) => event.eventType === "media.selection.completed");
    expect(completed?.selectedType).toBe("programmatic-visual");
    expect(completed?.fallbackType).toBe("REAL_MEDIA_NOT_FOUND");

    // 2) Official screenshot beats data/evidence card.
    const repoRoot2 = temporaryRepo();
    writeFacts(repoRoot2, CLAIMS, {metricName: true});
    approveSourceWithType(repoRoot2, OFFICIAL_SOURCE, "official");
    fabricateOriginal({
      repoRoot: repoRoot2,
      mediaId: "episode-m5:media:home-shot",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("official screenshot fixture png"),
      durationMs: null,
      mediaType: "image/png",
    });
    const screenshot = await selectFor(repoRoot2, {
      segmentId: "seg-001",
      claimIds: ["claim-fixture-001"],
      narration: "测试旁白",
      visualIntent: "测试画面",
    });
    expect(screenshot.fallbackType).toBe("REAL_MEDIA_NOT_FOUND");
    expect(screenshot.selectedType).toBe("official-screenshot");

    // 3) Data/evidence card when no screenshot exists.
    const repoRoot3 = temporaryRepo();
    writeFacts(repoRoot3, CLAIMS, {metricName: true});
    const evidenceCard = await selectFor(repoRoot3, {
      segmentId: "seg-001",
      claimIds: ["claim-fixture-001"],
      narration: "测试旁白",
      visualIntent: "测试画面",
    });
    expect(evidenceCard.selectedType).toBe("data-evidence-card");
  });

  it("is deterministic: identical inputs select the identical clip and tie-break by fixed order", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, CLAIMS);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    // Twin media: byte-identical content, different mediaIds → every retrieval
    // and verification score ties; only the fixed tie-breaker can decide.
    const twinA = fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo-a",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("twin fixture video bytes"),
      durationMs: 10000,
    });
    const twinB = fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo-b",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("twin fixture video bytes"),
      durationMs: 10000,
    });
    for (const mediaId of [twinA.mediaId, twinB.mediaId]) {
      await runIndex(repoRoot, {
        mediaId,
        transcriptProvider: createStubTranscriptProvider({segments: [...DEMO_SEGMENTS]}),
      });
    }
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
      topK: 10,
    });
    const outcome = await runRetrieve(repoRoot, request);
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    const aCandidates = result.candidates.filter((candidate) =>
      candidate.mediaId.startsWith("episode-m5:media:demo-a"),
    );
    const bCandidates = result.candidates.filter((candidate) =>
      candidate.mediaId.startsWith("episode-m5:media:demo-b"),
    );
    expect(aCandidates.length).toBeGreaterThan(0);
    expect(aCandidates.length).toBe(bCandidates.length);

    // Verify every candidate with the identical fixed VLM output, so each
    // (window, media) pair ties with its twin on every selection term.
    for (const candidate of result.candidates) {
      await runVerify(
        repoRoot,
        makeVerifyRequest({
          clipId: candidate.clipId,
          claimIds: request.claimIds,
          narration: request.narration,
          visualIntent: request.visualIntent,
          retrievalResultRef: outcome.artifactRef,
        }),
        windowPassProvider(),
      );
    }

    const select = () =>
      selectFor(repoRoot, {
        segmentId: "seg-001",
        claimIds: request.claimIds,
        narration: request.narration,
        visualIntent: request.visualIntent,
      });
    const first = await select();
    const second = await select();
    expect(first.selectedType).toBe("real-media");
    // Identical inputs → identical slot bytes (fixed clock), identical winner.
    expect(second.artifactRef.sha256).toBe(first.artifactRef.sha256);
    const slot = readVisualSlot(repoRoot, episodeId, "seg-001");
    // The winner is the rank-1 twin (fixed tie-breaker: rank asc), i.e. the
    // lexicographically-first media for the best window.
    const bestWindowStart = Math.max(...result.candidates.map((candidate) => candidate.startMs));
    const winners = result.candidates
      .filter((candidate) => candidate.startMs === bestWindowStart)
      .sort((left, right) => left.rank - right.rank);
    expect(winners[0]).toBeDefined();
    expect(winners[0]!.mediaId).toBe("episode-m5:media:demo-a");
    expect(slot.selectedMediaClipRef?.clipId).toBe(winners[0]!.clipId);
  });

  it("tie-breaker is a fixed total order (score → trust → rank → mediaId → startMs → clipId)", () => {
    const candidateFor = (
      candidate: Record<string, unknown> = {},
      extra: Record<string, unknown> = {},
    ) =>
      ({
        candidate: {
          rank: 1,
          mediaId: "episode-m5:media:a",
          startMs: 0,
          clipId: "episode-m5:media-clip:aaaa",
          ...candidate,
        },
        sourceTrust: 1,
        score: 0.5,
        ...extra,
      }) as unknown as Parameters<typeof compareVisualSlotCandidates>[0];

    const base = candidateFor();
    // Higher score wins.
    expect(compareVisualSlotCandidates(candidateFor({}, {score: 0.6}), base)).toBeLessThan(0);
    expect(compareVisualSlotCandidates(base, candidateFor({}, {score: 0.4}))).toBeLessThan(0);
    // Tie on score → higher source trust wins.
    expect(
      compareVisualSlotCandidates(
        candidateFor({}, {sourceTrust: 0.8}),
        candidateFor({}, {sourceTrust: 0.4}),
      ),
    ).toBeLessThan(0);
    // Tie on score + trust → lower retrieval rank wins.
    expect(
      compareVisualSlotCandidates(candidateFor({rank: 1}), candidateFor({rank: 3})),
    ).toBeLessThan(0);
    // Tie on score + trust + rank → lower mediaId wins.
    expect(
      compareVisualSlotCandidates(
        candidateFor({mediaId: "episode-m5:media:a"}),
        candidateFor({mediaId: "episode-m5:media:b"}),
      ),
    ).toBeLessThan(0);
    // Tie on score + trust + rank + mediaId → lower startMs wins.
    expect(
      compareVisualSlotCandidates(candidateFor({startMs: 0}), candidateFor({startMs: 4000})),
    ).toBeLessThan(0);
    // Tie on everything → lower clipId wins; fully equal → 0 (total order).
    expect(
      compareVisualSlotCandidates(
        candidateFor({clipId: "episode-m5:media-clip:aaaa"}),
        candidateFor({clipId: "episode-m5:media-clip:bbbb"}),
      ),
    ).toBeLessThan(0);
    expect(compareVisualSlotCandidates(base, candidateFor())).toBe(0);
  });

  it("blocks cross-episode and tampered inputs fail-closed", async () => {
    // 1) Cross-episode retrieval ref → hard error, never a selection.
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const foreignRef = artifactRefSchema.parse({
      artifactId: "episode-other:media-retrieval:seg-001",
      episodeId: "episode-other",
      path: "content/episode-other/media/candidates/seg-001.json",
      mediaType: "application/json",
      schemaVersion: "media-retrieval-result-v1",
      revision: 1,
      sha256: "a".repeat(64),
      sizeBytes: 1,
      producer: "m5-select-fixture",
      createdAt: FIXED_NOW,
    });
    await expect(
      selectVisualSlotForSegment({
        repoRoot,
        episodeId,
        segment: {
          segmentId: "seg-001",
          claimIds: fixture.request.claimIds,
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
        },
        retrievalResultRef: foreignRef,
        now: () => FIXED_NOW,
      }),
    ).rejects.toThrow(/MEDIA_SELECT_RETRIEVAL_REF_EPISODE_MISMATCH/u);

    // 2) Tampered retrieval artifact bytes (registered ref no longer binds).
    const repoRoot1b = temporaryRepo();
    const fixture1b = await setupRetrieval(repoRoot1b);
    fs.appendFileSync(
      path.join(repoRoot1b, mediaRetrievalCandidateRepositoryPath(episodeId, "seg-001")),
      " ",
    );
    await expect(
      selectFor(repoRoot1b, {
        segmentId: "seg-001",
        claimIds: fixture1b.request.claimIds,
        narration: fixture1b.request.narration,
        visualIntent: fixture1b.request.visualIntent,
      }),
    ).rejects.toThrow(/MEDIA_SELECT_RETRIEVAL_TAMPERED/u);

    // 3) Tampered verification artifact → hard error.
    const repoRoot2 = temporaryRepo();
    const fixture2 = await setupRetrieval(repoRoot2);
    const candidate = fixture2.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    await runVerify(
      repoRoot2,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture2.request.claimIds,
        narration: fixture2.request.narration,
        visualIntent: fixture2.request.visualIntent,
        retrievalResultRef: fixture2.retrievalRef,
      }),
      windowPassProvider(),
    );
    const verificationPath = path.join(
      repoRoot2,
      mediaVerificationRepositoryPath(episodeId, "seg-001", candidate.clipId),
    );
    fs.appendFileSync(verificationPath, " ");
    await expect(
      selectFor(repoRoot2, {
        segmentId: "seg-001",
        claimIds: fixture2.request.claimIds,
        narration: fixture2.request.narration,
        visualIntent: fixture2.request.visualIntent,
      }),
    ).rejects.toThrow(/MEDIA_SELECT_VERIFICATION_TAMPERED/u);

    // 4) Tampered source media bytes → hard error.
    const repoRoot3 = temporaryRepo();
    const fixture3 = await setupRetrieval(repoRoot3);
    const candidate3 = fixture3.result.candidates[0];
    if (!candidate3) throw new Error("fixture candidate missing");
    await runVerify(
      repoRoot3,
      makeVerifyRequest({
        clipId: candidate3.clipId,
        claimIds: fixture3.request.claimIds,
        narration: fixture3.request.narration,
        visualIntent: fixture3.request.visualIntent,
        retrievalResultRef: fixture3.retrievalRef,
      }),
      windowPassProvider(),
    );
    const assetPath = path.join(repoRoot3, "content", episodeId, "media", "assets", "demo.mp4");
    fs.appendFileSync(assetPath, "tampered");
    await expect(
      selectFor(repoRoot3, {
        segmentId: "seg-001",
        claimIds: fixture3.request.claimIds,
        narration: fixture3.request.narration,
        visualIntent: fixture3.request.visualIntent,
      }),
    ).rejects.toThrow(/MEDIA_SELECT_ASSET_TAMPERED/u);
  });

  it("registers full lineage from the slot to retrieval, verification, media, and decisions", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const verifyOutcome = await runVerify(
      repoRoot,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      }),
      windowPassProvider(),
    );
    const outcome = await selectFor(repoRoot, {
      segmentId: "seg-001",
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
    });
    const slotId = outcome.artifactRef.artifactId;

    // Slot → verification → clip bytes → media (+ decisions).
    expect(registryReaches(repoRoot, slotId, verifyOutcome.artifactRef.artifactId)).toBe(true);
    expect(registryReaches(repoRoot, slotId, verifyOutcome.clipArtifactRef.artifactId)).toBe(true);
    expect(registryReaches(repoRoot, slotId, DEMO_MEDIA_ID)).toBe(true);
    // Slot → retrieval result → index → media.
    expect(registryReaches(repoRoot, slotId, fixture.retrievalRef.artifactId)).toBe(true);
    // Slot → admission/rights decisions.
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const source = getMediaSource(manifest, OFFICIAL_SOURCE);
    if (!source) throw new Error("fixture source missing");
    for (const ref of [source.admissionDecisionRef, source.rightsDecisionRef]) {
      expect(ref).toBeDefined();
      expect(registryReaches(repoRoot, slotId, ref!.artifactId)).toBe(true);
    }
    // Every dependency of the slot record is episode-scoped.
    const record = artifactRecords(repoRoot).find(
      (candidateRecord) => candidateRecord.ref.artifactId === slotId,
    );
    if (!record) throw new Error("slot record missing");
    for (const dependency of record.dependencies) {
      expect(dependency.artifactId.startsWith(`${episodeId}:`)).toBe(true);
    }
  });

  it("produces one formal VisualSlot per final-script segment (script-driven + director node)", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidates = fixture.result.candidates;
    const top = candidates[0];
    const second = candidates[1];
    if (!top || !second) throw new Error("fixture needs two candidates");
    const base = {
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    };
    await runVerify(
      repoRoot,
      makeVerifyRequest({clipId: top.clipId, ...base}),
      windowPassProvider(),
    );
    await runVerify(
      repoRoot,
      makeVerifyRequest({clipId: second.clipId, ...base}),
      windowPassProvider(),
    );

    // A final script with two segments (second one has no media pipeline).
    const scriptPath = path.join(repoRoot, "content", episodeId, "story", "script.json");
    fs.mkdirSync(path.dirname(scriptPath), {recursive: true});
    fs.writeFileSync(
      scriptPath,
      JSON.stringify(
        {
          schemaVersion: "script-v1",
          selectedHook: "fixture",
          segments: [
            {
              id: "seg-001",
              section: "hook",
              narration: fixture.request.narration,
              onScreenText: [],
              claimIds: fixture.request.claimIds,
              scene: "fixture",
              visualIntent: fixture.request.visualIntent,
              targetSeconds: 3,
            },
            {
              id: "seg-002",
              section: "body",
              narration: "第二段旁白",
              onScreenText: [],
              claimIds: ["claim-fixture-003"],
              scene: "fixture",
              visualIntent: "第二段画面",
              targetSeconds: 3,
            },
          ],
        },
        null,
        2,
      ),
    );

    const outcomes = await selectVisualSlotsForScript({
      repoRoot,
      episodeId,
      now: () => FIXED_NOW,
    });
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.segmentId).toBe("seg-001");
    expect(outcomes[0]?.selectedType).toBe("real-media");
    expect(outcomes[1]?.segmentId).toBe("seg-002");
    expect(outcomes[1]?.fallbackType).toBe("REAL_MEDIA_NOT_FOUND");
    // One hash-bound, registered slot artifact per segment.
    for (const segmentId of ["seg-001", "seg-002"]) {
      const slot = readVisualSlot(repoRoot, episodeId, segmentId);
      expect(slot.segmentId).toBe(segmentId);
      expect(slot.artifactRef.artifactId).toBe(`${episodeId}:media-visual-slot:${segmentId}`);
      expect(
        artifactRecords(repoRoot).some(
          (record) => record.ref.artifactId === slot.artifactRef.artifactId,
        ),
      ).toBe(true);
    }

    // The Visual Director node only proposes needs: it produces slot refs via
    // the same selection module, never arbitrary clip ids.
    const director = createVisualSlotDirector({repoRoot, now: () => FIXED_NOW});
    const rawRevisions = await director({
      episodeId,
      runId: "run-m5-select",
      round: 0,
      artifacts: {},
      artifactIndex: emptyArtifactIndex(episodeId),
    });
    const revisions = (Array.isArray(rawRevisions) ? rawRevisions : [rawRevisions]).filter(
      (revision) => revision !== undefined,
    );
    expect(revisions).toHaveLength(2);
    for (const revision of revisions) {
      expect(revision.ref.artifactId).toMatch(new RegExp(`^${episodeId}:media-visual-slot:`));
      expect(revision.ref.episodeId).toBe(episodeId);
      expect(revision.ref.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("keeps default config deterministic and complete (weights sum to 1, fixed tie-breaker)", () => {
    const config = DEFAULT_VISUAL_SELECTION_CONFIG;
    const total = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(config.tieBreaker).toBe(
      "score-desc:sourceTrust-desc:rank-asc:mediaId-asc:startMs-asc:clipId-asc",
    );
    expect(config.gates.minVisualQuality).toBeGreaterThan(0);
    expect(config.gates.maxMisleadingRisk).toBeLessThan(1);
  });
});
