import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  artifactDependencySchema,
  artifactRefIsIndexed,
  buildArtifactRef,
  emptyArtifactIndex,
  FineGrainedCacheStore,
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
  mediaClipIndexRepositoryPath,
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
  type SemanticUnderstandingAdapter,
  type TranscriptProvider,
} from "../src/media";
import {
  assertMediaClipVerified,
  createDeterministicVerificationProvider,
  createStubShortClipExtractor,
  isMediaClipVerified,
  MEDIA_VERIFICATION_PROMPT_VERSION,
  MEDIA_VERIFICATION_SCHEMA_VERSION,
  mediaVerificationRequestSchema,
  MEDIA_VERIFICATION_TOOL_VERSION,
  readMediaVerification,
  verifyMediaClip,
  type MediaVerificationOutcome,
  type MediaVerificationProvider,
  type MediaVerificationProviderInput,
  type MediaVerificationProviderOutput,
  type MediaVerificationRequest,
  type ShortClipExtractor,
} from "../src/media/verify";
import {retrieveMediaCandidates} from "../src/media/retrieve";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-verify-"));
  temporaryDirectories.push(directory);
  return directory;
};

const temporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-verify-cache-"));
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
 * Fixtures (mirrors tests/media-retrieve.test.ts)
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

const writeFacts = (repoRoot: string, claims: Array<{id: string; claim: string}>): void => {
  const directory = path.join(repoRoot, "content", episodeId, "research");
  fs.mkdirSync(directory, {recursive: true});
  const fullClaims = claims.map((entry, index) => ({
    ...entry,
    metricName: "",
    value: "",
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
    producer: "m5-verify-test",
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
    producer: "m5-verify-fixture",
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
    semanticAdapter?: SemanticUnderstandingAdapter;
    config?: MediaUnderstandingConfig;
  },
) =>
  indexMediaAsset({
    repoRoot,
    episodeId,
    mediaId: input.mediaId,
    cache: null,
    transcriptProvider: input.transcriptProvider,
    semanticAdapter: input.semanticAdapter ?? createDeterministicSemanticAdapter(),
    keyframeExtractor: stubKeyframes,
    config: input.config ?? stubConfig,
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
  cache?: FineGrainedCacheStore | null,
) =>
  retrieveMediaCandidates({
    repoRoot,
    episodeId,
    request,
    cache: cache ?? null,
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

/* ------------------------------------------------------------------------- *
 * Standard fixture: claim ledger + indexed demo media + retrieval result
 * ------------------------------------------------------------------------- */

const CLAIMS = [
  {id: "claim-fixture-001", claim: "产品核心功能演示 展示了 主界面 交互"},
  {id: "claim-fixture-003", claim: "公司成立 日期 是 2024"},
] satisfies Array<{id: string; claim: string}>;

const OFFICIAL_SOURCE = "episode-m5:media-source:official";
const DEMO_MEDIA_ID = "episode-m5:media:demo";

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
    transcriptProvider: createStubTranscriptProvider({
      segments: [
        {text: "产品核心功能演示 主界面 交互 反馈", startMs: 0, endMs: 4000, speaker: "host"},
        {text: "用户反馈 产品 演示 界面", startMs: 4000, endMs: 8000, speaker: "host"},
        {text: "公司成立 日期 2024 庆典", startMs: 8000, endMs: 10000, speaker: "host"},
      ],
    }),
  });
};

type RetrievalFixture = {
  repoRoot: string;
  retrievalRef: ArtifactRef;
  request: MediaRetrievalRequest;
  result: ReturnType<typeof readMediaRetrievalResult>;
};

const setupRetrieval = async (repoRoot: string): Promise<RetrievalFixture> => {
  await defaultSetup(repoRoot);
  const request = makeRequest({
    claimIds: ["claim-fixture-001", "claim-fixture-003"],
    narration: "公司成立 日期 2024",
    visualIntent: "庆典 画面",
    topK: 5,
  });
  const outcome = await runRetrieve(repoRoot, request);
  const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
  if (result.candidates.length === 0) throw new Error("fixture candidates missing");
  return {repoRoot, retrievalRef: outcome.artifactRef, request, result};
};

const makeVerifyRequest = (input: {
  clipId: string;
  claimIds: string[];
  narration: string;
  visualIntent: string;
  retrievalResultRef: ArtifactRef;
  maxKeyframes?: number;
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
    maxKeyframes: input.maxKeyframes ?? 4,
  });

const runVerify = (
  repoRoot: string,
  request: MediaVerificationRequest,
  provider: MediaVerificationProvider,
  options: {cache?: FineGrainedCacheStore | null; extractor?: ShortClipExtractor} = {},
): Promise<MediaVerificationOutcome> =>
  verifyMediaClip({
    repoRoot,
    episodeId,
    request,
    provider,
    cache: options.cache ?? null,
    shortClipExtractor: options.extractor ?? createStubShortClipExtractor(),
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

const defaultPassProvider = (): MediaVerificationProvider =>
  createDeterministicVerificationProvider({output: passOutput});

/** Rewrites the retrieval artifact bytes and registers the new ref. */
const rewriteRetrievalArtifact = (
  repoRoot: string,
  ref: ArtifactRef,
  mutate: (
    result: ReturnType<typeof readMediaRetrievalResult>,
  ) => ReturnType<typeof readMediaRetrievalResult>,
): ArtifactRef => {
  const current = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
  const next = mutate(current);
  fs.writeFileSync(
    path.join(repoRoot, mediaRetrievalCandidateRepositoryPath(episodeId, "seg-001")),
    `${JSON.stringify(next, null, 2)}\n`,
  );
  const nextRef = buildArtifactRef({
    repoRoot,
    artifactId: ref.artifactId,
    episodeId,
    path: mediaRetrievalCandidateRepositoryPath(episodeId, "seg-001"),
    mediaType: "application/json",
    schemaVersion: "media-retrieval-result-v1",
    producer: "m5-verify-fixture",
    createdAt: FIXED_NOW,
  });
  registerCandidateInIndex(repoRoot, nextRef, "fixture:rewrite-retrieval", OFFICIAL_SOURCE);
  return nextRef;
};

/* ------------------------------------------------------------------------- *
 * WP-M5.06 tests
 * ------------------------------------------------------------------------- */

describe("WP-M5.06 multimodal clip verification", () => {
  it("verifies a valid candidate with a VLM pass and persists a hash-bound verification", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });

    const outcome = await runVerify(repoRoot, request, defaultPassProvider());
    expect(outcome.status).toBe("ready");
    expect(outcome.verdict).toBe("pass");
    expect(outcome.cacheHit).toBe(false);
    expect(outcome.episodeId).toBe(episodeId);
    expect(outcome.segmentId).toBe("seg-001");
    expect(outcome.clipId).toBe(candidate.clipId);

    // Persistence: artifact bytes are the source of truth.
    const artifactPath = path.join(
      repoRoot,
      mediaVerificationRepositoryPath(episodeId, "seg-001", candidate.clipId),
    );
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(sha256File(artifactPath)).toBe(outcome.artifactRef.sha256);
    expect(artifactRefIsIndexed(repoRoot, outcome.artifactRef)).toBe(true);

    const verification = readMediaVerification(repoRoot, episodeId, "seg-001", candidate.clipId);
    expect(verification.schemaVersion).toBe(MEDIA_VERIFICATION_SCHEMA_VERSION);
    expect(verification.verdict).toBe("pass");
    expect(verification.episodeId).toBe(episodeId);
    expect(verification.segmentId).toBe("seg-001");
    expect(verification.clipId).toBe(candidate.clipId);
    expect(verification.claimIds).toEqual(fixture.request.claimIds);
    expect(verification.clipRef.startMs).toBe(candidate.startMs);
    expect(verification.clipRef.endMs).toBe(candidate.endMs);
    expect(verification.mediaRef.sha256).toBe(candidate.mediaRef.sha256);
    expect(verification.retrievalResultRef.sha256).toBe(fixture.retrievalRef.sha256);
    expect(verification.clipArtifactRef.sha256).toBe(outcome.clipArtifactRef.sha256);
    expect(verification.sourceSha256).toBe(candidate.mediaRef.sha256);
    expect(verification.recommendedStartMs).toBeGreaterThanOrEqual(candidate.startMs);
    expect(verification.recommendedEndMs).toBeLessThanOrEqual(candidate.endMs);
    expect(verification.provider).toBe("deterministic-stub");
    expect(verification.verificationVersion).toBe("deterministic-verify-v1");
    expect(verification.promptVersion).toBe(MEDIA_VERIFICATION_PROMPT_VERSION);
    expect(verification.toolVersion).toBe(MEDIA_VERIFICATION_TOOL_VERSION);

    // The short clip bytes the VLM saw exist and are hash-bound.
    const clipBytes = fs.readFileSync(path.join(repoRoot, outcome.clipArtifactRef.path));
    expect(sha256Bytes(clipBytes)).toBe(outcome.clipArtifactRef.sha256);
    expect(artifactRefIsIndexed(repoRoot, outcome.clipArtifactRef)).toBe(true);

    // Deterministic authorization gate: usable.
    expect(
      isMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: outcome.artifactRef,
      }),
    ).toBe(true);
    expect(
      assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: outcome.artifactRef,
      }).verdict,
    ).toBe("pass");

    // LangGraph-facing outcome is reference-only: no narration/verification bodies.
    expect(JSON.stringify(outcome)).not.toContain("公司成立 日期 2024");
    expect(JSON.stringify(outcome)).not.toContain("observedEntities");
  });

  it("blocks when the VLM rejects or is uncertain, and still persists the audit record", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const base = {
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    };

    const rejectOutcome = await runVerify(
      repoRoot,
      makeVerifyRequest(base),
      createDeterministicVerificationProvider({
        output: {...passOutput, verdict: "reject", reasons: ["short clip does not match"]},
      }),
    );
    expect(rejectOutcome.verdict).toBe("reject");
    const rejectArtifact = readMediaVerification(repoRoot, episodeId, "seg-001", candidate.clipId);
    expect(rejectArtifact.verdict).toBe("reject");
    expect(
      isMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: rejectOutcome.artifactRef,
      }),
    ).toBe(false);
    expect(() =>
      assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: rejectOutcome.artifactRef,
      }),
    ).toThrow(/MEDIA_VERIFY_NOT_PASSED:.*:reject/u);

    const uncertainOutcome = await runVerify(
      repoRoot,
      makeVerifyRequest(base),
      createDeterministicVerificationProvider({
        output: {...passOutput, verdict: "uncertain", reasons: ["ambiguous visuals"]},
      }),
    );
    expect(uncertainOutcome.verdict).toBe("uncertain");
    expect(
      isMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: uncertainOutcome.artifactRef,
      }),
    ).toBe(false);
  });

  it("fails closed on malformed provider output (no usable verification artifact)", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    // Missing fields.
    await expect(
      runVerify(
        repoRoot,
        request,
        createDeterministicVerificationProvider({
          output: {verdict: "pass"} as unknown as MediaVerificationProviderOutput,
        }),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_PROVIDER_OUTPUT_INVALID/u);

    // Invalid enum value.
    await expect(
      runVerify(
        repoRoot,
        request,
        createDeterministicVerificationProvider({
          output: {...passOutput, verdict: "maybe"} as unknown as MediaVerificationProviderOutput,
        }),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_PROVIDER_OUTPUT_INVALID/u);

    // Pass with below-threshold scores.
    await expect(
      runVerify(
        repoRoot,
        request,
        createDeterministicVerificationProvider({
          output: {...passOutput, relevance: 0.2},
        }),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_PROVIDER_OUTPUT_INVALID/u);

    // No verification artifact was registered by any malformed run (the short
    // clip bytes artifact may exist — extraction succeeded before the VLM call).
    const verificationRecords = artifactRecords(repoRoot).filter((record) =>
      record.ref.artifactId.includes("media-verification:"),
    );
    expect(verificationRecords).toHaveLength(0);
    const verificationPath = path.join(
      repoRoot,
      mediaVerificationRepositoryPath(episodeId, "seg-001", candidate.clipId),
    );
    expect(fs.existsSync(verificationPath)).toBe(false);
  });

  it("rejects a candidate that is not in the current retrieval result", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const request = makeVerifyRequest({
      clipId: `episode-m5:media-clip:${"f".repeat(24)}`,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    await expect(runVerify(repoRoot, request, defaultPassProvider())).rejects.toThrow(
      /MEDIA_VERIFY_CANDIDATE_NOT_IN_RESULT/u,
    );
  });

  it("rejects a clip that is not in the current ClipIndex", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");

    // Rewrite the retrieval artifact so its candidate names an unknown clip id.
    const rewrittenRef = rewriteRetrievalArtifact(repoRoot, fixture.retrievalRef, (result) => ({
      ...result,
      candidates: result.candidates.map((value, index) =>
        index === 0 ? {...value, clipId: `episode-m5:media-clip:${"e".repeat(24)}`} : value,
      ),
    }));
    const request = makeVerifyRequest({
      clipId: `episode-m5:media-clip:${"e".repeat(24)}`,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: rewrittenRef,
    });
    await expect(runVerify(repoRoot, request, defaultPassProvider())).rejects.toThrow(
      /MEDIA_VERIFY_CLIP_NOT_IN_INDEX/u,
    );
  });

  it("rejects a recommended range that leaves the candidate range", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    await expect(
      runVerify(
        repoRoot,
        request,
        createDeterministicVerificationProvider({
          output: {...passOutput, recommendedEndMs: candidate.endMs + 500},
        }),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_RECOMMENDED_RANGE_OUT_OF_BOUNDS/u);
    await expect(
      runVerify(
        repoRoot,
        request,
        createDeterministicVerificationProvider({
          output: {...passOutput, recommendedStartMs: candidate.startMs - 500},
        }),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_RECOMMENDED_RANGE_OUT_OF_BOUNDS/u);
  });

  it("fails closed on unknown claim ids and on a missing Claim Ledger", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");

    await expect(
      runVerify(
        repoRoot,
        makeVerifyRequest({
          clipId: candidate.clipId,
          claimIds: ["claim-fixture-999"],
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
          retrievalResultRef: fixture.retrievalRef,
        }),
        defaultPassProvider(),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_CLAIM_UNKNOWN:claim-fixture-999/u);

    fs.rmSync(path.join(repoRoot, "content", episodeId, "research", "facts.json"));
    await expect(
      runVerify(
        repoRoot,
        makeVerifyRequest({
          clipId: candidate.clipId,
          claimIds: fixture.request.claimIds,
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
          retrievalResultRef: fixture.retrievalRef,
        }),
        defaultPassProvider(),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_CLAIM_LEDGER_MISSING/u);
  });

  it("makes old verifications unusable after rights are revoked, even with a warm cache", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});

    const first = await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    expect(first.verdict).toBe("pass");
    const warmed = await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    expect(warmed.cacheHit).toBe(true);

    withSourceRights(repoRoot, OFFICIAL_SOURCE, "rejected");
    // The old verification is no longer usable.
    expect(
      isMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: first.artifactRef,
      }),
    ).toBe(false);
    expect(() =>
      assertMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: first.artifactRef,
      }),
    ).toThrow(/MEDIA_VERIFY_SOURCE_RIGHTS_NOT_APPROVED/u);
    // A new verification run fails closed before any cache consult.
    await expect(runVerify(repoRoot, request, defaultPassProvider(), {cache})).rejects.toThrow(
      /MEDIA_VERIFY_SOURCE_RIGHTS_NOT_APPROVED/u,
    );
  });

  it("blocks tampered source media even with a warm cache", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const first = await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    expect(first.verdict).toBe("pass");

    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const asset = manifest.assets.find((value) => value.mediaId === DEMO_MEDIA_ID);
    if (!asset) throw new Error("fixture asset missing");
    fs.writeFileSync(path.join(repoRoot, asset.artifactRef.path), "tampered original bytes");

    // Old verification unusable; new runs fail closed even with a warm cache.
    expect(
      isMediaClipVerified({
        repoRoot,
        episodeId,
        segmentId: "seg-001",
        clipId: candidate.clipId,
        verificationRef: first.artifactRef,
      }),
    ).toBe(false);
    await expect(runVerify(repoRoot, request, defaultPassProvider(), {cache})).rejects.toThrow(
      /MEDIA_VERIFY_ASSET_TAMPERED/u,
    );
  });

  it("blocks tampered retrieval, index, and verification artifacts", async () => {
    // Tampered retrieval artifact.
    {
      const repoRoot = temporaryRepo();
      const fixture = await setupRetrieval(repoRoot);
      const candidate = fixture.result.candidates[0];
      if (!candidate) throw new Error("fixture candidate missing");
      const request = makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      });
      const first = await runVerify(repoRoot, request, defaultPassProvider());
      fs.writeFileSync(path.join(repoRoot, fixture.retrievalRef.path), "tampered retrieval bytes");
      expect(
        isMediaClipVerified({
          repoRoot,
          episodeId,
          segmentId: "seg-001",
          clipId: candidate.clipId,
          verificationRef: first.artifactRef,
        }),
      ).toBe(false);
      await expect(runVerify(repoRoot, request, defaultPassProvider())).rejects.toThrow(
        /MEDIA_VERIFY_RETRIEVAL_TAMPERED/u,
      );
    }

    // Tampered ClipIndex bytes.
    {
      const repoRoot = temporaryRepo();
      const fixture = await setupRetrieval(repoRoot);
      const candidate = fixture.result.candidates[0];
      if (!candidate) throw new Error("fixture candidate missing");
      const request = makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      });
      const first = await runVerify(repoRoot, request, defaultPassProvider());
      const indexPath = path.join(repoRoot, mediaClipIndexRepositoryPath(episodeId, "demo"));
      fs.writeFileSync(indexPath, "tampered index bytes");
      expect(
        isMediaClipVerified({
          repoRoot,
          episodeId,
          segmentId: "seg-001",
          clipId: candidate.clipId,
          verificationRef: first.artifactRef,
        }),
      ).toBe(false);
      await expect(runVerify(repoRoot, request, defaultPassProvider())).rejects.toThrow(
        /MEDIA_VERIFY_INDEX_TAMPERED/u,
      );
    }

    // Tampered verification artifact bytes.
    {
      const repoRoot = temporaryRepo();
      const fixture = await setupRetrieval(repoRoot);
      const candidate = fixture.result.candidates[0];
      if (!candidate) throw new Error("fixture candidate missing");
      const request = makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      });
      const first = await runVerify(repoRoot, request, defaultPassProvider());
      fs.writeFileSync(
        path.join(
          repoRoot,
          mediaVerificationRepositoryPath(episodeId, "seg-001", candidate.clipId),
        ),
        "tampered verification bytes",
      );
      expect(() =>
        assertMediaClipVerified({
          repoRoot,
          episodeId,
          segmentId: "seg-001",
          clipId: candidate.clipId,
          verificationRef: first.artifactRef,
        }),
      ).toThrow(/MEDIA_VERIFY_VERIFICATION_TAMPERED/u);
    }
  });

  it("blocks cross-episode candidates and cross-episode retrieval artifacts", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");

    // Retrieval ref from another episode.
    const foreignRef: ArtifactRef = {
      artifactId: "episode-other:media-retrieval:seg-001",
      episodeId: "episode-other",
      path: "content/episode-other/media/candidates/seg-001.json",
      mediaType: "application/json",
      schemaVersion: "media-retrieval-result-v1",
      revision: 1,
      sha256: "a".repeat(64),
      sizeBytes: 1,
      producer: "m5-verify-fixture",
      createdAt: FIXED_NOW,
    };
    await expect(
      runVerify(
        repoRoot,
        makeVerifyRequest({
          clipId: candidate.clipId,
          claimIds: fixture.request.claimIds,
          narration: fixture.request.narration,
          visualIntent: fixture.request.visualIntent,
          retrievalResultRef: foreignRef,
        }),
        defaultPassProvider(),
      ),
    ).rejects.toThrow(/MEDIA_VERIFY_RETRIEVAL_REF_EPISODE_MISMATCH/u);

    // A request bound to another episode fails closed.
    const crossEpisodeRequest = mediaVerificationRequestSchema.parse({
      ...makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: fixture.request.narration,
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      }),
      episodeId: "episode-other",
    });
    await expect(runVerify(repoRoot, crossEpisodeRequest, defaultPassProvider())).rejects.toThrow(
      /MEDIA_VERIFY_EPISODE_MISMATCH/u,
    );
  });

  it("returns a cache hit for identical inputs without calling the provider again", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    let calls = 0;
    const provider = createDeterministicVerificationProvider({
      output: (input) => {
        calls += 1;
        return {
          ...passOutput,
          recommendedStartMs: input.clip.startMs,
          recommendedEndMs: input.clip.endMs,
        };
      },
    });

    const first = await runVerify(repoRoot, request, provider, {cache});
    expect(first.cacheHit).toBe(false);
    expect(calls).toBe(1);
    const second = await runVerify(repoRoot, request, provider, {cache});
    expect(second.cacheHit).toBe(true);
    expect(second.clipCacheHit).toBe(true);
    expect(calls).toBe(1);
    expect(second.artifactRef.sha256).toBe(first.artifactRef.sha256);
    expect(second.cacheKey).toBe(first.cacheKey);

    // A different narration changes the key and invalidates the entry.
    const changed = await runVerify(
      repoRoot,
      makeVerifyRequest({
        clipId: candidate.clipId,
        claimIds: fixture.request.claimIds,
        narration: "完全不同的旁白内容",
        visualIntent: fixture.request.visualIntent,
        retrievalResultRef: fixture.retrievalRef,
      }),
      provider,
      {cache},
    );
    expect(changed.cacheHit).toBe(false);
    expect(changed.cacheKey).not.toBe(first.cacheKey);
    expect(calls).toBe(2);
  });

  it("invalidates the cache when the provider model/version changes", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});

    const v1 = createDeterministicVerificationProvider({
      model: "stub-vlm-v1",
      verificationVersion: "deterministic-verify-v1",
      output: passOutput,
    });
    const v2 = createDeterministicVerificationProvider({
      model: "stub-vlm-v2",
      verificationVersion: "deterministic-verify-v2",
      output: passOutput,
    });
    const first = await runVerify(repoRoot, request, v1, {cache});
    expect(first.cacheHit).toBe(false);
    const hit = await runVerify(repoRoot, request, v1, {cache});
    expect(hit.cacheHit).toBe(true);

    const second = await runVerify(repoRoot, request, v2, {cache});
    expect(second.cacheHit).toBe(false);
    expect(second.cacheKey).not.toBe(first.cacheKey);
    expect(second.artifactRef.sha256).not.toBe(first.artifactRef.sha256);
  });

  it("invalidates the cache when the candidate clip bytes change", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const extractorV1 = createStubShortClipExtractor({
      bytes: Buffer.from("clip bytes v1"),
      version: "stub-short-clip-v1",
    });
    const extractorV2 = createStubShortClipExtractor({
      bytes: Buffer.from("clip bytes v2"),
      version: "stub-short-clip-v2",
    });

    const first = await runVerify(repoRoot, request, defaultPassProvider(), {
      cache,
      extractor: extractorV1,
    });
    const warmed = await runVerify(repoRoot, request, defaultPassProvider(), {
      cache,
      extractor: extractorV1,
    });
    expect(warmed.cacheHit).toBe(true);
    expect(warmed.clipCacheHit).toBe(true);

    const second = await runVerify(repoRoot, request, defaultPassProvider(), {
      cache,
      extractor: extractorV2,
    });
    expect(second.clipCacheHit).toBe(false);
    expect(second.cacheHit).toBe(false);
    expect(second.cacheKey).not.toBe(first.cacheKey);
    expect(second.clipArtifactRef.sha256).not.toBe(first.clipArtifactRef.sha256);
  });

  it("rebuilds corrupt cache entries with identical bytes", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cacheRoot = temporaryDirectory();
    const cache = new FineGrainedCacheStore({root: cacheRoot, episodeId});
    const first = await runVerify(repoRoot, request, defaultPassProvider(), {cache});

    // Corrupt the verification cache entry → rebuild with identical bytes.
    const verifyEntryDirectory = path.join(cacheRoot, episodeId, "media-verify", first.cacheKey);
    expect(fs.existsSync(verifyEntryDirectory)).toBe(true);
    fs.writeFileSync(path.join(verifyEntryDirectory, "payload.bin"), "corrupt verification bytes");
    const rebuilt = await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    expect(rebuilt.cacheHit).toBe(false);
    expect(rebuilt.artifactRef.sha256).toBe(first.artifactRef.sha256);

    // Corrupt the clip cache entry → re-extract (deterministic, same bytes).
    const clipEntryDirectory = path.join(
      cacheRoot,
      episodeId,
      "media-verify-clip",
      path.basename(fs.readdirSync(path.join(cacheRoot, episodeId, "media-verify-clip"))[0] ?? ""),
    );
    expect(fs.existsSync(clipEntryDirectory)).toBe(true);
    fs.writeFileSync(path.join(clipEntryDirectory, "payload.bin"), "corrupt clip bytes");
    const clipRebuilt = await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    expect(clipRebuilt.cacheHit).toBe(true); // verification cache still valid
    expect(clipRebuilt.clipCacheHit).toBe(false); // clip re-extracted
    expect(clipRebuilt.clipArtifactRef.sha256).toBe(first.clipArtifactRef.sha256);
  });

  it("never sends the whole long video to the provider", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const asset = manifest.assets.find((value) => value.mediaId === DEMO_MEDIA_ID);
    if (!asset) throw new Error("fixture asset missing");

    const captured: {input: MediaVerificationProviderInput | null} = {input: null};
    const provider = createDeterministicVerificationProvider({
      output: (input) => {
        captured.input = input;
        return passOutput;
      },
    });
    const outcome = await runVerify(repoRoot, request, provider);
    if (!captured.input) throw new Error("provider input not captured");
    const providerInput = captured.input;

    // The only media payload is the short clip — never the original asset.
    const serialized = JSON.stringify(providerInput);
    expect(serialized).not.toContain("/media/assets/");
    expect(serialized).not.toContain(asset.artifactRef.path);
    expect(providerInput.clip.sha256).not.toBe(asset.sha256);
    expect(providerInput.clip.sha256).toBe(outcome.clipArtifactRef.sha256);
    expect(providerInput.clip.sizeBytes).toBe(outcome.clipArtifactRef.sizeBytes);
    expect(providerInput.clip.startMs).toBe(candidate.startMs);
    expect(providerInput.clip.endMs).toBe(candidate.endMs);
    // Keyframes (if any) come from the media index keyframes directory only.
    for (const keyframe of providerInput.keyframes) {
      expect(keyframe.path).toContain("/media/indexes/");
      expect(keyframe.path).toContain("/keyframes/");
      expect(serialized).not.toContain("/media/assets/");
    }
    expect(providerInput.clipMetadata.observedText.length).toBeGreaterThan(0);
  });

  it("runs the deterministic stub provider without any network access", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network must not be used by the deterministic stub path");
    }) as typeof fetch;
    try {
      const outcome = await runVerify(repoRoot, request, defaultPassProvider());
      expect(outcome.verdict).toBe("pass");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("records the full verification observability lifecycle", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    const warmed = await runVerify(repoRoot, request, defaultPassProvider(), {cache});
    expect(warmed.cacheHit).toBe(true);

    const events = readMediaEvents(repoRoot, episodeId);
    const types = events.map((event) => event.eventType);
    expect(types).toContain("media.verification.started");
    expect(types).toContain("media.verification.completed");
    expect(types).toContain("media.verification.cache.hit");
    expect(types).toContain("media.verification.cache.miss");
    const completed = events.filter((event) => event.eventType === "media.verification.completed");
    expect(completed.length).toBe(2);
    for (const event of completed) {
      expect(event.clipId).toBe(candidate.clipId);
      expect(event.segmentId).toBe("seg-001");
      expect(event.verdict).toBe("pass");
      expect(event.artifactRef).toBeDefined();
    }
    // No credentials / no media bodies in events.
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain("fixture demo video bytes");
      expect(JSON.stringify(event)).not.toContain("公司成立 日期 2024");
    }
  });

  it("records a failed verification event when the provider fails", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const failing = createDeterministicVerificationProvider({
      output: () => {
        throw new Error("provider exploded");
      },
    });
    await expect(runVerify(repoRoot, request, failing)).rejects.toThrow(
      /MEDIA_VERIFY_PROVIDER_FAILED/u,
    );
    const events = readMediaEvents(repoRoot, episodeId);
    expect(
      events.some(
        (event) =>
          event.eventType === "media.verification.failed" &&
          event.reason?.includes("MEDIA_VERIFY_PROVIDER_FAILED"),
      ),
    ).toBe(true);
  });

  it("records correct ArtifactRef lineage in the artifact registry", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const outcome = await runVerify(repoRoot, request, defaultPassProvider());
    const verificationId = outcome.artifactRef.artifactId;
    const clipArtifactId = outcome.clipArtifactRef.artifactId;

    // Verification → short clip bytes → original media (and decisions).
    expect(registryReaches(repoRoot, verificationId, clipArtifactId)).toBe(true);
    expect(registryReaches(repoRoot, verificationId, DEMO_MEDIA_ID)).toBe(true);
    // Verification → retrieval result → index → media.
    expect(registryReaches(repoRoot, verificationId, fixture.retrievalRef.artifactId)).toBe(true);
    const retrievalRecord = artifactRecords(repoRoot).find(
      (record) => record.ref.artifactId === fixture.retrievalRef.artifactId,
    );
    if (!retrievalRecord) throw new Error("retrieval record missing");
    for (const dependency of retrievalRecord.dependencies) {
      expect(dependency.artifactId.startsWith(`${episodeId}:`)).toBe(true);
    }
    // Clip artifact → media + decisions, all episode-scoped.
    const clipRecord = artifactRecords(repoRoot).find(
      (record) => record.ref.artifactId === clipArtifactId,
    );
    if (!clipRecord) throw new Error("clip artifact record missing");
    expect(
      clipRecord.dependencies.some((dependency) => dependency.artifactId === DEMO_MEDIA_ID),
    ).toBe(true);
    expect(
      clipRecord.dependencies.some((dependency) =>
        dependency.artifactId.includes("human-decision"),
      ),
    ).toBe(true);
    const verificationRecord = artifactRecords(repoRoot).find(
      (record) => record.ref.artifactId === verificationId,
    );
    if (!verificationRecord) throw new Error("verification record missing");
    for (const dependency of verificationRecord.dependencies) {
      expect(dependency.artifactId.startsWith(`${episodeId}:`)).toBe(true);
    }
    // The verification artifact id uses the episode media-verification scope.
    expect(verificationId.startsWith(`${episodeId}:media-verification:`)).toBe(true);
    expect(clipArtifactId.startsWith(`${episodeId}:media-verification-clip:`)).toBe(true);
  });

  it("produces byte-identical verification artifacts for identical inputs", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
    });
    const first = await runVerify(repoRoot, request, defaultPassProvider());
    const second = await runVerify(repoRoot, request, defaultPassProvider());
    expect(first.artifactRef.sha256).toBe(second.artifactRef.sha256);
    expect(first.cacheKey).toBe(second.cacheKey);
    expect(first.clipArtifactRef.sha256).toBe(second.clipArtifactRef.sha256);
  });

  it("attaches only the candidate window keyframes to the provider input", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: fixture.retrievalRef,
      maxKeyframes: 2,
    });
    const captured: {input: MediaVerificationProviderInput | null} = {input: null};
    await runVerify(
      repoRoot,
      request,
      createDeterministicVerificationProvider({
        output: (input) => {
          captured.input = input;
          return passOutput;
        },
      }),
    );
    if (!captured.input) throw new Error("provider input not captured");
    const providerInput = captured.input;
    expect(providerInput.keyframes.length).toBeLessThanOrEqual(2);
    for (const keyframe of providerInput.keyframes) {
      expect(fs.existsSync(keyframe.path)).toBe(true);
      expect(sha256File(keyframe.path)).toBe(keyframe.sha256);
    }
  });

  it("rejects a candidate whose window does not match the ClipIndex item", async () => {
    const repoRoot = temporaryRepo();
    const fixture = await setupRetrieval(repoRoot);
    const candidate = fixture.result.candidates[0];
    if (!candidate) throw new Error("fixture candidate missing");
    const rewrittenRef = rewriteRetrievalArtifact(repoRoot, fixture.retrievalRef, (result) => ({
      ...result,
      candidates: result.candidates.map((value, index) =>
        index === 0 ? {...value, startMs: value.startMs + 1} : value,
      ),
    }));
    const request = makeVerifyRequest({
      clipId: candidate.clipId,
      claimIds: fixture.request.claimIds,
      narration: fixture.request.narration,
      visualIntent: fixture.request.visualIntent,
      retrievalResultRef: rewrittenRef,
    });
    await expect(runVerify(repoRoot, request, defaultPassProvider())).rejects.toThrow(
      /MEDIA_VERIFY_CLIP_WINDOW_MISMATCH/u,
    );
  });
});
