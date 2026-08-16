import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  artifactDependencySchema,
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
  proposeMediaSource,
  readMediaClipIndex,
  readMediaEvents,
  readMediaRetrievalResult,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  readMediaUnderstandingStatus,
  registerMediaAsset,
  semanticMetadataSchema,
  writeMediaSourceManifestCas,
  type MediaAsset,
  type MediaRetrievalRequest,
  type MediaRightsStatus,
  type MediaSource,
  type MediaSourceType,
  type MediaUnderstandingConfig,
  type SemanticUnderstandingAdapter,
  type TranscriptProvider,
} from "../src/media";
import {
  buildMediaRetrievalCacheKey,
  claimLedgerEntrySchema,
  compareScoredCandidates,
  DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG,
  MEDIA_RETRIEVAL_SCHEMA_VERSION,
  normalizeRetrievalRequest,
  queryTerms,
  retrieveMediaCandidates,
  termOverlap,
  type ClaimLedgerEntry,
} from "../src/media/retrieve";
import {mediaUnderstandingStatusSchema} from "../src/media/understanding";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-retrieve-"));
  temporaryDirectories.push(directory);
  return directory;
};

const temporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-retrieve-cache-"));
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
 * Fixtures: Claim Ledger, sources, assets, understanding, retrieval
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

const factsPath = (repoRoot: string): string =>
  path.join(repoRoot, "content", episodeId, "research", "facts.json");

const manifestRefFor = (repoRoot: string): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:media:source-manifest`,
    episodeId,
    path: `content/${episodeId}/media/source-manifest.json`,
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "m5-retrieve-test",
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

/** Proposes + approves a source whose sourceType differs from the default. */
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
    producer: "m5-retrieve-fixture",
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

/** Semantic adapter that attaches deterministic tags per observed text. */
const taggedSemanticAdapter = (
  tagMap: Record<string, string[]>,
  version = "tagged-semantic-v1",
): SemanticUnderstandingAdapter => ({
  id: "tagged-semantic",
  version,
  describe: ({observedText}) =>
    semanticMetadataSchema.parse({
      textSummary: observedText,
      keywords: [],
      entities: [],
      speaker: null,
      semanticTags: tagMap[observedText] ?? [],
    }),
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
 * Standard fixture: claim ledger + two indexed media
 * ------------------------------------------------------------------------- */

const CLAIMS = [
  {id: "claim-fixture-001", claim: "产品核心功能演示 展示了 主界面 交互"},
  {id: "claim-fixture-002", claim: "创始人访谈 反馈 用户 不想学习新界面"},
  {id: "claim-fixture-003", claim: "公司成立 日期 是 2024"},
] satisfies ClaimLedgerEntry[];

const OFFICIAL_SOURCE = "episode-m5:media-source:official";
const SOCIAL_SOURCE = "episode-m5:media-source:social";

/** A 10s official video with three distinct windows (0-4s / 4-8s / 8-10s). */
const buildOfficialDemo = (repoRoot: string): MediaAsset => {
  approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
  const mediaId = "episode-m5:media:demo";
  const asset = fabricateOriginal({
    repoRoot,
    mediaId,
    sourceId: OFFICIAL_SOURCE,
    bytes: Buffer.from("fixture demo video bytes v1"),
    durationMs: 10000,
  });
  return asset;
};

const demoTranscript = (texts: [string, string, string]): TranscriptProvider =>
  createStubTranscriptProvider({
    segments: [
      {text: texts[0]!, startMs: 0, endMs: 4000, speaker: "host"},
      {text: texts[1]!, startMs: 4000, endMs: 8000, speaker: "host"},
      {text: texts[2]!, startMs: 8000, endMs: 10000, speaker: "host"},
    ],
  });

const defaultSetup = async (repoRoot: string): Promise<void> => {
  writeFacts(repoRoot, CLAIMS);
  buildOfficialDemo(repoRoot);
  await runIndex(repoRoot, {
    mediaId: "episode-m5:media:demo",
    transcriptProvider: demoTranscript([
      "产品核心功能演示 主界面 交互 反馈",
      "用户反馈 产品 演示 界面",
      "公司成立 日期 2024 庆典",
    ]),
  });
};

/* ------------------------------------------------------------------------- *
 * WP-M5.05 tests
 * ------------------------------------------------------------------------- */

describe("WP-M5.05 claim-to-clip retrieval", () => {
  it("returns the correct Top-K for narration + claimIds and persists a hash-bound artifact", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
      topK: 5,
    });

    const outcome = await runRetrieve(repoRoot, request);
    expect(outcome.status).toBe("ready");
    expect(outcome.evidenceMode).toBe("claim-bound");
    expect(outcome.candidateCount).toBe(2);

    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.schemaVersion).toBe(MEDIA_RETRIEVAL_SCHEMA_VERSION);
    expect(result.evidenceMode).toBe("claim-bound");
    expect(result.segmentId).toBe("seg-001");
    expect(result.request).toEqual(normalizeRetrievalRequest(request));
    expect(result.claimLedger.path).toBe(`content/${episodeId}/research/facts.json`);
    expect(result.claimLedger.sha256).toBe(sha256File(factsPath(repoRoot)));
    expect(result.clipIndexRefs).toHaveLength(1);

    // Rank 1: the window that matches claim-fixture-003 (claim 1.0 fit).
    const first = result.candidates[0];
    if (!first) throw new Error("fixture candidate missing");
    expect(first.rank).toBe(1);
    expect(first.matchedClaimIds).toContain("claim-fixture-003");
    expect(first.score).toBeGreaterThan(result.candidates[1]?.score ?? 0);
    expect(first.scoreBreakdown.claim).toBeGreaterThan(0.6);
    expect(first.scoreBreakdown.lexical).toBe(1);
    expect(first.scoreBreakdown.sourcePreference).toBe(1);

    // Rank 2: claim-fixture-001 evidence (0.75 fit) beats the claim-less window.
    const second = result.candidates[1];
    if (!second) throw new Error("fixture candidate missing");
    expect(second.matchedClaimIds).toEqual(["claim-fixture-001"]);
    expect(second.scoreBreakdown.claim).toBeCloseTo(0.6, 3);

    // The claim-less middle window was dropped (below min relevance).
    const clipIds = result.candidates.map((candidate) => candidate.clipId);
    const index = readMediaClipIndex(repoRoot, episodeId, "episode-m5:media:demo");
    expect(clipIds).not.toContain(index.items[1]?.clipId);

    // Persistence: artifact file bytes are the source of truth.
    const artifactPath = path.join(
      repoRoot,
      mediaRetrievalCandidateRepositoryPath(episodeId, "seg-001"),
    );
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(sha256File(artifactPath)).toBe(outcome.artifactRef.sha256);
    expect(outcome.artifactRef.schemaVersion).toBe(MEDIA_RETRIEVAL_SCHEMA_VERSION);
    expect(outcome.artifactRef.path).toBe(
      mediaRetrievalCandidateRepositoryPath(episodeId, "seg-001"),
    );

    // LangGraph-facing outcome is reference-only: no transcript bodies.
    expect(JSON.stringify(outcome)).not.toContain("产品核心功能演示");
  });

  it("ranks a claim-matched clip above a lexical-only clip", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[0]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 8000,
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:demo",
      transcriptProvider: createStubTranscriptProvider({
        segments: [
          {text: "产品核心功能演示 主界面 交互", startMs: 0, endMs: 4000, speaker: "host"},
          {text: "界面 体验 流畅 顺滑 跟手", startMs: 4000, endMs: 8000, speaker: "host"},
        ],
      }),
    });

    const request = makeRequest({
      claimIds: ["claim-fixture-001"],
      narration: "界面 流畅 体验 顺滑",
      visualIntent: "产品 演示",
      topK: 5,
    });
    const outcome = await runRetrieve(repoRoot, request);
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates).toHaveLength(2);

    const [claimMatched, lexicalOnly] = result.candidates;
    if (!claimMatched || !lexicalOnly) throw new Error("fixture candidates missing");
    expect(claimMatched.rank).toBe(1);
    expect(claimMatched.matchedClaimIds).toEqual(["claim-fixture-001"]);
    expect(claimMatched.score).toBeGreaterThan(lexicalOnly.score);
    expect(lexicalOnly.rank).toBe(2);
    expect(lexicalOnly.matchedClaimIds).toEqual([]);
    expect(lexicalOnly.reasons.join(" ")).toContain("claimless penalty");
    expect(outcome.candidateCount).toBe(2);
  });

  it("downweights unrelated clips and never pads Top-K with irrelevant material", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[0]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, SOCIAL_SOURCE, "social");
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 8000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:unrelated",
      sourceId: SOCIAL_SOURCE,
      bytes: Buffer.from("fixture unrelated video bytes v1"),
      durationMs: 10000,
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:demo",
      transcriptProvider: createStubTranscriptProvider({
        segments: [
          {text: "产品核心功能演示 主界面 交互", startMs: 0, endMs: 4000, speaker: "host"},
          {text: "界面 体验 流畅 顺滑 跟手", startMs: 4000, endMs: 8000, speaker: "host"},
        ],
      }),
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:unrelated",
      transcriptProvider: createStubTranscriptProvider({
        segments: [{text: "天气 交通 美食 城市", startMs: 0, endMs: 10000, speaker: "host"}],
      }),
    });

    const outcome = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-001"],
        narration: "界面 流畅 体验 顺滑",
        visualIntent: "产品 演示",
        topK: 5,
      }),
    );
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(outcome.candidateCount).toBeLessThan(5);
    expect(result.candidates.some((candidate) => candidate.mediaId.includes("unrelated"))).toBe(
      false,
    );
    for (const candidate of result.candidates) {
      expect(candidate.score).toBeGreaterThanOrEqual(
        DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG.minRelevanceScore,
      );
    }
  });

  it("lets visualIntent change the ranking", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[0]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, "episode-m5:media-source:second", "official");
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:alpha",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture alpha bytes v1"),
      durationMs: 4000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:beta",
      sourceId: "episode-m5:media-source:second",
      bytes: Buffer.from("fixture beta bytes v1"),
      durationMs: 4000,
    });
    const text = "产品核心功能演示 主界面 交互";
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:alpha",
      transcriptProvider: createStubTranscriptProvider({
        segments: [{text, startMs: 0, endMs: 4000, speaker: "host"}],
      }),
      semanticAdapter: taggedSemanticAdapter({[text]: ["界面特写"]}),
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:beta",
      transcriptProvider: createStubTranscriptProvider({
        segments: [{text, startMs: 0, endMs: 4000, speaker: "host"}],
      }),
      semanticAdapter: taggedSemanticAdapter({[text]: ["远景"]}),
    });

    const closeUp = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-001"],
        narration: "产品 演示",
        visualIntent: "界面特写 近景",
      }),
    );
    const closeUpResult = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(closeUpResult.candidates[0]?.mediaId).toBe("episode-m5:media:alpha");
    expect(closeUpResult.candidates[0]?.scoreBreakdown.visualIntent).toBe(0.5);
    expect(closeUpResult.candidates[1]?.scoreBreakdown.visualIntent).toBe(0);

    const wideShot = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-001"],
        narration: "产品 演示",
        visualIntent: "远景 空镜",
      }),
    );
    const wideShotResult = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(wideShotResult.candidates[0]?.mediaId).toBe("episode-m5:media:beta");
    expect(closeUp.candidateCount).toBe(2);
    expect(wideShot.candidateCount).toBe(2);
  });

  it("applies source preference (official before social) on identical content", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, SOCIAL_SOURCE, "social");
    const text = "公司成立 日期 2024 庆典";
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:official-clip",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture official bytes v1"),
      durationMs: 4000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:social-clip",
      sourceId: SOCIAL_SOURCE,
      bytes: Buffer.from("fixture social bytes v1"),
      durationMs: 4000,
    });
    for (const mediaId of ["episode-m5:media:official-clip", "episode-m5:media:social-clip"]) {
      await runIndex(repoRoot, {
        mediaId,
        transcriptProvider: createStubTranscriptProvider({
          segments: [{text, startMs: 0, endMs: 4000, speaker: "host"}],
        }),
      });
    }

    const outcome = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立 日期",
        visualIntent: "庆典",
        topK: 5,
      }),
    );
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.mediaId).toBe("episode-m5:media:official-clip");
    expect(result.candidates[1]?.mediaId).toBe("episode-m5:media:social-clip");
    expect(result.candidates[0]?.scoreBreakdown.sourcePreference).toBe(1);
    expect(result.candidates[1]?.scoreBreakdown.sourcePreference).toBe(0.2);
    expect(result.candidates[0]?.reasons.join(" ")).toContain("official (5/5)");
    expect(result.candidates[1]?.reasons.join(" ")).toContain("social (1/5)");
    expect(outcome.candidateCount).toBe(2);
  });

  it("enforces the duration constraint and duration suitability", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    const mediaId = "episode-m5:media:voice-note";
    fabricateOriginal({
      repoRoot,
      mediaId,
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture audio bytes v1"),
      durationMs: 9000,
      mediaType: "audio/mpeg",
    });
    const text = "公司成立 日期 2024 庆典";
    await runIndex(repoRoot, {
      mediaId,
      transcriptProvider: createStubTranscriptProvider({
        segments: [
          {text, startMs: 0, endMs: 2000, speaker: "host"},
          {text, startMs: 3000, endMs: 9000, speaker: "host"},
        ],
      }),
      config: {
        scene: stubConfig.scene,
        clipWindow: {maxWindowMs: 3000, minWindowMs: 0},
        keyframe: stubConfig.keyframe,
      },
    });
    const index = readMediaClipIndex(repoRoot, episodeId, mediaId);
    expect(index.items).toHaveLength(2);
    const shortClipId = index.items[0]?.clipId;
    const longClipId = index.items[1]?.clipId;
    if (!shortClipId || !longClipId) throw new Error("fixture clips missing");

    // Hard bound: only the 2000ms window survives.
    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立 日期",
        visualIntent: "庆典",
        maxDurationMs: 5000,
      }),
    );
    const boundedResult = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(boundedResult.candidates.map((candidate) => candidate.clipId)).toEqual([shortClipId]);

    // Soft target: 2000ms ranks first.
    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立 日期",
        visualIntent: "庆典",
        durationTargetMs: 2000,
      }),
    );
    const targetShort = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(targetShort.candidates.map((candidate) => candidate.clipId)).toEqual([
      shortClipId,
      longClipId,
    ]);
    expect(targetShort.candidates[0]?.scoreBreakdown.duration).toBe(1);
    expect(targetShort.candidates[1]?.scoreBreakdown.duration).toBe(0);

    // Soft target: 6000ms flips the order.
    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立 日期",
        visualIntent: "庆典",
        durationTargetMs: 6000,
      }),
    );
    const targetLong = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(targetLong.candidates.map((candidate) => candidate.clipId)).toEqual([
      longClipId,
      shortClipId,
    ]);
  });

  it("breaks deterministic ties by mediaId then startMs then clipId", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, "episode-m5:media-source:second", "official");
    const text = "公司成立 日期 2024 庆典";
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:bravo",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture bravo bytes v1"),
      durationMs: 10000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:alpha",
      sourceId: "episode-m5:media-source:second",
      bytes: Buffer.from("fixture alpha bytes v1"),
      durationMs: 10000,
    });
    for (const mediaId of ["episode-m5:media:alpha", "episode-m5:media:bravo"]) {
      await runIndex(repoRoot, {
        mediaId,
        transcriptProvider: createStubTranscriptProvider({
          segments: [
            {text, startMs: 0, endMs: 4000, speaker: "host"},
            {text, startMs: 4000, endMs: 8000, speaker: "host"},
            {text, startMs: 8000, endMs: 10000, speaker: "host"},
          ],
        }),
      });
    }

    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立",
        visualIntent: "庆典",
        topK: 6,
      }),
    );
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates).toHaveLength(6);
    // All six clips tie on score; the comparator must order alpha before bravo,
    // and within one media by startMs ascending.
    const scores = new Set(result.candidates.map((candidate) => candidate.score));
    expect(scores.size).toBe(1);
    expect(result.candidates.map((candidate) => candidate.mediaId)).toEqual([
      "episode-m5:media:alpha",
      "episode-m5:media:alpha",
      "episode-m5:media:alpha",
      "episode-m5:media:bravo",
      "episode-m5:media:bravo",
      "episode-m5:media:bravo",
    ]);
    expect(result.candidates.map((candidate) => candidate.startMs)).toEqual([
      0, 4000, 8000, 0, 4000, 8000,
    ]);
    expect(result.candidates.map((candidate) => candidate.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("produces identical rankings and byte-identical artifacts for identical inputs", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
    });

    const first = await runRetrieve(repoRoot, request);
    const second = await runRetrieve(repoRoot, request);

    expect(first.artifactRef.sha256).toBe(second.artifactRef.sha256);
    expect(first.cacheKey).toBe(second.cacheKey);
    const firstResult = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    const secondResult = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(firstResult.candidates.map((candidate) => candidate.clipId)).toEqual(
      secondResult.candidates.map((candidate) => candidate.clipId),
    );
    expect(firstResult.candidates.map((candidate) => candidate.score)).toEqual(
      secondResult.candidates.map((candidate) => candidate.score),
    );
  });

  it("limits results to topK", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    const text = "公司成立 日期 2024 庆典";
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:demo",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 10000,
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:demo",
      transcriptProvider: createStubTranscriptProvider({
        segments: [
          {text, startMs: 0, endMs: 4000, speaker: "host"},
          {text, startMs: 4000, endMs: 8000, speaker: "host"},
          {text, startMs: 8000, endMs: 10000, speaker: "host"},
        ],
      }),
    });

    const outcome = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立",
        visualIntent: "庆典",
        topK: 2,
      }),
    );
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(outcome.candidateCount).toBe(2);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.rank)).toEqual([1, 2]);
  });

  it("allows fewer than topK when the corpus has fewer relevant clips", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const outcome = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立 日期 2024",
        visualIntent: "庆典 画面",
        topK: 50,
      }),
    );
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(outcome.candidateCount).toBeLessThan(50);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThan(50);
  });

  it("marks claim-less queries as weaker evidence mode", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, SOCIAL_SOURCE, "social");
    const text = "公司成立 日期 2024 庆典";
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:official-clip",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture official bytes v1"),
      durationMs: 4000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:social-clip",
      sourceId: SOCIAL_SOURCE,
      bytes: Buffer.from("fixture social bytes v1"),
      durationMs: 4000,
    });
    for (const mediaId of ["episode-m5:media:official-clip", "episode-m5:media:social-clip"]) {
      await runIndex(repoRoot, {
        mediaId,
        transcriptProvider: createStubTranscriptProvider({
          segments: [{text, startMs: 0, endMs: 4000, speaker: "host"}],
        }),
      });
    }

    const outcome = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: [],
        narration: "公司成立 日期",
        visualIntent: "庆典",
      }),
    );
    expect(outcome.evidenceMode).toBe("weaker-textual");
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.evidenceMode).toBe("weaker-textual");
    expect(result.request.claimIds).toEqual([]);
    // Without claim binding, ranking is driven by narration + visualIntent.
    expect(result.candidates[0]?.mediaId).toBe("episode-m5:media:official-clip");
    expect(result.candidates[0]?.scoreBreakdown.claim).toBe(0);
    expect(result.candidates[0]?.scoreBreakdown.lexical).toBe(1);
    expect(result.candidates[0]?.scoreBreakdown.visualIntent).toBe(1);
    expect(outcome.candidateCount).toBe(2);
  });

  it("fails closed on unknown claim ids and on a missing/invalid Claim Ledger", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);

    await expect(
      runRetrieve(
        repoRoot,
        makeRequest({
          claimIds: ["claim-fixture-999"],
          narration: "公司成立",
          visualIntent: "庆典",
        }),
      ),
    ).rejects.toThrow(/MEDIA_RETRIEVE_CLAIM_UNKNOWN:claim-fixture-999/u);

    // Corrupt the ledger JSON: fail closed, no partial query.
    fs.writeFileSync(factsPath(repoRoot), "{not json");
    await expect(
      runRetrieve(
        repoRoot,
        makeRequest({
          claimIds: ["claim-fixture-003"],
          narration: "公司成立",
          visualIntent: "庆典",
        }),
      ),
    ).rejects.toThrow(/MEDIA_RETRIEVE_CLAIM_LEDGER_INVALID/u);

    // Remove the ledger entirely.
    fs.rmSync(factsPath(repoRoot));
    await expect(
      runRetrieve(
        repoRoot,
        makeRequest({
          claimIds: [],
          narration: "公司成立",
          visualIntent: "庆典",
        }),
      ),
    ).rejects.toThrow(/MEDIA_RETRIEVE_CLAIM_LEDGER_MISSING/u);
  });

  it("never returns clips after source rights are revoked, even with a warm cache", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, SOCIAL_SOURCE, "social");
    const text = "公司成立 日期 2024 庆典";
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:official-clip",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture official bytes v1"),
      durationMs: 4000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:social-clip",
      sourceId: SOCIAL_SOURCE,
      bytes: Buffer.from("fixture social bytes v1"),
      durationMs: 4000,
    });
    for (const mediaId of ["episode-m5:media:official-clip", "episode-m5:media:social-clip"]) {
      await runIndex(repoRoot, {
        mediaId,
        transcriptProvider: createStubTranscriptProvider({
          segments: [{text, startMs: 0, endMs: 4000, speaker: "host"}],
        }),
      });
    }
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const request = makeRequest({
      claimIds: ["claim-fixture-003"],
      narration: "公司成立 日期",
      visualIntent: "庆典",
    });

    const first = await runRetrieve(repoRoot, request, cache);
    expect(first.candidateCount).toBe(2);
    const warmed = await runRetrieve(repoRoot, request, cache);
    expect(warmed.cacheHit).toBe(true);

    // Revoke rights on the social source: its clip must disappear even though
    // the cache is warm, and the eligibility change must invalidate the key.
    withSourceRights(repoRoot, SOCIAL_SOURCE, "rejected");
    const afterRevoke = await runRetrieve(repoRoot, request, cache);
    expect(afterRevoke.cacheHit).toBe(false);
    expect(afterRevoke.cacheKey).not.toBe(first.cacheKey);
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.mediaId).toBe("episode-m5:media:official-clip");
    expect(result.candidates.some((candidate) => candidate.mediaId.includes("social"))).toBe(false);

    // Warm cache again; the gate still re-runs and the result stays clean.
    const reWarmed = await runRetrieve(repoRoot, request, cache);
    expect(reWarmed.cacheHit).toBe(true);
    expect(reWarmed.candidateCount).toBe(1);
  });

  it("fails closed on tampered media, tampered indexes, and tampered decisions", async () => {
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
    });
    const warmCacheAndWarm = async (repoRoot: string): Promise<{cache: FineGrainedCacheStore}> => {
      const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
      const first = await runRetrieve(repoRoot, request, cache);
      expect(first.cacheHit).toBe(false);
      const hit = await runRetrieve(repoRoot, request, cache);
      expect(hit.cacheHit).toBe(true);
      return {cache};
    };

    // Tampered original bytes fail closed even with a warm cache.
    {
      const repoRoot = temporaryRepo();
      await defaultSetup(repoRoot);
      const {cache} = await warmCacheAndWarm(repoRoot);
      const manifest = readMediaSourceManifest(repoRoot, episodeId);
      const asset = manifest.assets[0];
      if (!asset) throw new Error("fixture asset missing");
      fs.writeFileSync(path.join(repoRoot, asset.artifactRef.path), "tampered original bytes");
      await expect(runRetrieve(repoRoot, request, cache)).rejects.toThrow(
        /MEDIA_RETRIEVE_ASSET_TAMPERED/u,
      );
    }

    // Tampered clip-index bytes fail closed even with a warm cache.
    {
      const repoRoot = temporaryRepo();
      await defaultSetup(repoRoot);
      const {cache} = await warmCacheAndWarm(repoRoot);
      const indexPath = path.join(repoRoot, mediaClipIndexRepositoryPath(episodeId, "demo"));
      fs.writeFileSync(indexPath, "tampered index bytes");
      await expect(runRetrieve(repoRoot, request, cache)).rejects.toThrow(
        /MEDIA_RETRIEVE_INDEX_TAMPERED/u,
      );
    }

    // Tampered HumanDecision bytes fail closed (rights/admission re-checked).
    {
      const repoRoot = temporaryRepo();
      await defaultSetup(repoRoot);
      const {cache} = await warmCacheAndWarm(repoRoot);
      const decisionDirectory = path.join(
        repoRoot,
        "content",
        episodeId,
        "production",
        "human-decisions",
      );
      const decisionFiles = fs.existsSync(decisionDirectory)
        ? fs.readdirSync(decisionDirectory)
        : [];
      expect(decisionFiles.length).toBeGreaterThan(0);
      fs.writeFileSync(path.join(decisionDirectory, decisionFiles[0]!), "tampered decision bytes");
      await expect(runRetrieve(repoRoot, request, cache)).rejects.toThrow(
        /HUMAN_DECISION_ARTIFACT_HASH_MISMATCH/u,
      );
    }
  });

  it("never returns cross-episode clips and fails closed on cross-episode indexes", async () => {
    // Part 1: media that exists only under another episode is never part of
    // this corpus — every returned candidate is current-episode scoped.
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-001", "claim-fixture-003"],
        narration: "公司成立 日期 2024",
        visualIntent: "庆典 画面",
      }),
    );

    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates.some((candidate) => candidate.episodeId !== episodeId)).toBe(false);
    expect(result.candidates.some((candidate) => candidate.clipId.includes("episode-other"))).toBe(
      false,
    );

    // Part 2: an index whose bytes are valid but claim another episode fails closed.
    const evilRoot = temporaryRepo();
    writeFacts(evilRoot, [CLAIMS[2]!]);
    approveSourceWithType(evilRoot, OFFICIAL_SOURCE, "official");
    const evilMediaId = "episode-m5:media:evil";
    fabricateOriginal({
      repoRoot: evilRoot,
      mediaId: evilMediaId,
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture evil bytes v1"),
      durationMs: 10000,
    });
    const fakeSha = "a".repeat(64);
    const fakeRef = (episode: string, mediaId: string): ArtifactRef =>
      ({
        artifactId: `${episode}:media:${mediaId}`,
        episodeId: episode,
        path: `content/${episode}/media/assets/x.mp4`,
        mediaType: "video/mp4",
        schemaVersion: "media-asset-v1",
        revision: 1,
        sha256: fakeSha,
        sizeBytes: 1,
        producer: "fixture",
        createdAt: FIXED_NOW,
      }) as ArtifactRef;
    const crossEpisodeIndex = {
      schemaVersion: "media-clip-index-v1",
      episodeId: "episode-other",
      mediaId: evilMediaId,
      mediaRef: fakeRef("episode-other", "evil"),
      analysisSourceRef: fakeRef("episode-other", "evil"),
      sourceSha256: fakeSha,
      indexVersion: "media-clip-index-v1",
      clipWindowConfig: {maxWindowMs: 60000, minWindowMs: 0},
      transcriptAvailability: "unavailable",
      scenesAvailability: "not-applicable",
      keyframesAvailability: "not-applicable",
      semanticAvailability: "available",
      asrProvider: "none",
      asrModel: null,
      sceneDetector: null,
      sceneDetectorVersion: null,
      keyframeTool: null,
      keyframeToolVersion: null,
      semanticAdapter: "fixture",
      semanticAdapterVersion: "fixture-v1",
      items: [],
    };
    const evilIndexPath = path.join(evilRoot, mediaClipIndexRepositoryPath(episodeId, "evil"));
    fs.mkdirSync(path.dirname(evilIndexPath), {recursive: true});
    fs.writeFileSync(evilIndexPath, JSON.stringify(crossEpisodeIndex, null, 2));
    const evilIndexRef = buildArtifactRef({
      repoRoot: evilRoot,
      artifactId: `${episodeId}:media-clip-index:evil`,
      episodeId,
      path: mediaClipIndexRepositoryPath(episodeId, "evil"),
      mediaType: "application/json",
      schemaVersion: "media-clip-index-v1",
      producer: "m5-retrieve-fixture",
      createdAt: FIXED_NOW,
    });
    registerCandidateInIndex(evilRoot, evilIndexRef, "fixture:evil-index", OFFICIAL_SOURCE);
    const evilAsset = readMediaSourceManifest(evilRoot, episodeId).assets.find(
      (candidate) => candidate.mediaId === evilMediaId,
    );
    if (!evilAsset) throw new Error("fixture evil asset missing");
    const evilStatus = mediaUnderstandingStatusSchema.parse({
      schemaVersion: "media-understanding-status-v1",
      episodeId,
      mediaId: evilMediaId,
      mediaSha256: evilAsset.sha256,
      indexVersion: "media-clip-index-v1",
      analysisSourceRef: evilAsset.artifactRef,
      usedProxy: false,
      stages: {
        transcript: null,
        scenes: null,
        keyframes: null,
        "clip-index": {
          availability: "available",
          cacheKey: fakeSha,
          artifactId: evilIndexRef.artifactId,
          ref: evilIndexRef,
        },
      },
      updatedAt: FIXED_NOW,
    });
    fs.writeFileSync(
      path.join(evilRoot, "content", episodeId, "media", "indexes", "evil", "status.json"),
      JSON.stringify(evilStatus, null, 2),
    );

    await expect(
      runRetrieve(
        evilRoot,
        makeRequest({
          claimIds: ["claim-fixture-003"],
          narration: "公司成立",
          visualIntent: "庆典",
        }),
      ),
    ).rejects.toThrow(/MEDIA_RETRIEVE_INDEX_MISMATCH/u);
  });

  it("invalidates the cache when a ClipIndex changes", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[0]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    const mediaId = "episode-m5:media:demo";
    fabricateOriginal({
      repoRoot,
      mediaId,
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture demo video bytes v1"),
      durationMs: 8000,
    });
    const text = "产品核心功能演示 主界面 交互";
    const transcript = createStubTranscriptProvider({
      segments: [{text, startMs: 0, endMs: 8000, speaker: "host"}],
    });
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const request = makeRequest({
      claimIds: ["claim-fixture-001"],
      narration: "产品 演示",
      visualIntent: "主界面",
    });

    await runIndex(repoRoot, {
      mediaId,
      transcriptProvider: transcript,
      semanticAdapter: taggedSemanticAdapter({[text]: ["界面特写"]}, "tagged-semantic-v1"),
    });
    const first = await runRetrieve(repoRoot, request, cache);
    const firstIndexRef = readMediaUnderstandingStatus(repoRoot, episodeId, mediaId)?.stages[
      "clip-index"
    ]?.ref;
    const hit = await runRetrieve(repoRoot, request, cache);
    expect(hit.cacheHit).toBe(true);

    // Re-index with a different semantic adapter → different index bytes.
    await runIndex(repoRoot, {
      mediaId,
      transcriptProvider: transcript,
      semanticAdapter: taggedSemanticAdapter({[text]: ["产品特写"]}, "tagged-semantic-v2"),
    });
    const secondIndexRef = readMediaUnderstandingStatus(repoRoot, episodeId, mediaId)?.stages[
      "clip-index"
    ]?.ref;
    expect(secondIndexRef?.sha256).not.toBe(firstIndexRef?.sha256);

    const second = await runRetrieve(repoRoot, request, cache);
    expect(second.cacheHit).toBe(false);
    expect(second.cacheKey).not.toBe(first.cacheKey);
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates[0]?.reasons.join(" ")).toContain("visual intent");
  });

  it("invalidates the cache when the Claim Ledger changes", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
    });

    const first = await runRetrieve(repoRoot, request, cache);
    const hit = await runRetrieve(repoRoot, request, cache);
    expect(hit.cacheHit).toBe(true);

    // Append a new claim → ledger hash changes → key changes → rebuild.
    const ledger = JSON.parse(fs.readFileSync(factsPath(repoRoot), "utf8")) as Array<
      Record<string, unknown>
    >;
    ledger.push({
      id: "claim-fixture-004",
      claim: "新增 事实 记录",
      metricName: "",
      value: "",
      period: "",
      eventDate: "",
      sourceIds: ["src-new"],
      confidence: "high",
      reportingType: "independently-verified",
      allowedInNarration: true,
      notes: "fixture",
    });
    fs.writeFileSync(factsPath(repoRoot), JSON.stringify(ledger, null, 2));

    const second = await runRetrieve(repoRoot, request, cache);
    expect(second.cacheHit).toBe(false);
    expect(second.cacheKey).not.toBe(first.cacheKey);
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.claimLedger.sha256).toBe(sha256File(factsPath(repoRoot)));
  });

  it("rebuilds corrupt retrieval cache entries with identical bytes", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const cacheRoot = temporaryDirectory();
    const cache = new FineGrainedCacheStore({root: cacheRoot, episodeId});
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
    });

    const first = await runRetrieve(repoRoot, request, cache);
    const entryDirectory = path.join(cacheRoot, episodeId, "media-retrieve", first.cacheKey);
    expect(fs.existsSync(entryDirectory)).toBe(true);
    fs.writeFileSync(path.join(entryDirectory, "payload.bin"), "corrupt retrieval bytes");

    const second = await runRetrieve(repoRoot, request, cache);
    expect(second.cacheHit).toBe(false);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second.artifactRef.sha256).toBe(first.artifactRef.sha256);
  });

  it("registers the retrieval artifact with full lineage and reference-only outcomes", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const outcome = await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-001", "claim-fixture-003"],
        narration: "公司成立 日期 2024",
        visualIntent: "庆典 画面",
      }),
    );

    const records = artifactRecords(repoRoot);
    const retrievalRecord = records.find(
      (record) => record.ref.artifactId === `${episodeId}:media-retrieval:seg-001`,
    );
    if (!retrievalRecord) throw new Error("fixture retrieval record missing");
    expect(retrievalRecord.ref.sha256).toBe(outcome.artifactRef.sha256);
    // Lineage: retrieval result → clip index → original media + decisions.
    expect(registryReaches(repoRoot, retrievalRecord.ref.artifactId, "episode-m5:media:demo")).toBe(
      true,
    );
    expect(
      registryReaches(
        repoRoot,
        retrievalRecord.ref.artifactId,
        `${episodeId}:media-clip-index:demo`,
      ),
    ).toBe(true);
    const dependencyIds = retrievalRecord.dependencies.map((dependency) => dependency.artifactId);
    expect(dependencyIds.some((id) => id.includes(":media-clip-index:"))).toBe(true);
    for (const dependency of retrievalRecord.dependencies) {
      expect(dependency.artifactId.startsWith(`${episodeId}:`)).toBe(true);
    }
    // Artifact bytes are the source of truth.
    expect(sha256File(path.join(repoRoot, outcome.artifactRef.path))).toBe(
      outcome.artifactRef.sha256,
    );
    // LangGraph state holds refs/status only — never the result body.
    expect(JSON.stringify(outcome)).not.toContain("公司成立");
    expect(JSON.stringify(outcome)).not.toContain("observedText");
    // The reader round-trips the persisted artifact.
    const result = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(result.candidates.length).toBe(outcome.candidateCount);
    expect(result.rankingConfig.version).toBe(DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG.version);
    expect(result.gate).toEqual({
      sourceAdmitted: true,
      rightsApproved: true,
      hashValid: true,
      episodeIsolated: true,
      claimLedgerValid: true,
    });
  });

  it("records the full retrieval observability lifecycle", async () => {
    const repoRoot = temporaryRepo();
    await defaultSetup(repoRoot);
    const cache = new FineGrainedCacheStore({root: temporaryDirectory(), episodeId});
    const request = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期 2024",
      visualIntent: "庆典 画面",
    });

    await runRetrieve(repoRoot, request, cache);
    await runRetrieve(repoRoot, request, cache);

    const events = readMediaEvents(repoRoot, episodeId);
    const types = events.map((event) => event.eventType);
    for (const expected of [
      "media.retrieval.started",
      "media.retrieval.completed",
      "media.retrieval.cache.miss",
      "media.retrieval.cache.hit",
    ]) {
      expect(types).toContain(expected);
    }
    const completed = events.filter((event) => event.eventType === "media.retrieval.completed");
    expect(completed).toHaveLength(2);
    for (const event of completed) {
      expect(event.segmentId).toBe("seg-001");
      expect(event.claimIds).toEqual(["claim-fixture-001", "claim-fixture-003"]);
      expect(event.candidateCount).toBe(2);
      expect(event.rankSummary).toMatch(/^1:episode-m5:media-clip:/u);
      expect(event.artifactRef?.episodeId).toBe(episodeId);
      expect(["produced", "cache-hit"]).toContain(event.reason);
      expect(/^[a-f0-9]{64}$/u.test(event.eventId ?? "")).toBe(true);
    }
    expect(
      events.some(
        (event) => event.eventType === "media.retrieval.completed" && event.reason === "produced",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.eventType === "media.retrieval.completed" && event.reason === "cache-hit",
      ),
    ).toBe(true);
    // The event log never carries transcript bodies.
    const logText = fs.readFileSync(
      path.join(repoRoot, "content", episodeId, "media", "observability", "media-events.jsonl"),
      "utf8",
    );
    expect(logText).not.toContain("产品核心功能演示");
  });

  it("filters by preferredMediaTypes", async () => {
    const repoRoot = temporaryRepo();
    writeFacts(repoRoot, [CLAIMS[2]!]);
    approveSourceWithType(repoRoot, OFFICIAL_SOURCE, "official");
    approveSourceWithType(repoRoot, SOCIAL_SOURCE, "social");
    const text = "公司成立 日期 2024 庆典";
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:video-clip",
      sourceId: OFFICIAL_SOURCE,
      bytes: Buffer.from("fixture video bytes v1"),
      durationMs: 4000,
    });
    fabricateOriginal({
      repoRoot,
      mediaId: "episode-m5:media:audio-clip",
      sourceId: SOCIAL_SOURCE,
      bytes: Buffer.from("fixture audio bytes v1"),
      durationMs: 10000,
      mediaType: "audio/mpeg",
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:video-clip",
      transcriptProvider: createStubTranscriptProvider({
        segments: [{text, startMs: 0, endMs: 4000, speaker: "host"}],
      }),
    });
    await runIndex(repoRoot, {
      mediaId: "episode-m5:media:audio-clip",
      transcriptProvider: createStubTranscriptProvider({
        segments: [{text, startMs: 0, endMs: 10000, speaker: "host"}],
      }),
    });

    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立",
        visualIntent: "庆典",
        preferredMediaTypes: ["audio"],
      }),
    );
    const audioOnly = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(audioOnly.candidates).toHaveLength(1);
    expect(audioOnly.candidates[0]?.mediaId).toBe("episode-m5:media:audio-clip");

    await runRetrieve(
      repoRoot,
      makeRequest({
        claimIds: ["claim-fixture-003"],
        narration: "公司成立",
        visualIntent: "庆典",
        preferredMediaTypes: ["video", "audio"],
      }),
    );
    const both = readMediaRetrievalResult(repoRoot, episodeId, "seg-001");
    expect(both.candidates).toHaveLength(2);
  });

  it("exposes deterministic scoring primitives and cache identities", () => {
    expect(queryTerms("产品 演示 A1 产品")).toEqual(["产品", "演示", "a1"]);
    expect(termOverlap(["主界面", "近景"], "产品核心功能演示 主界面 交互")).toBe(0.5);
    expect(termOverlap([], "任意文本")).toBe(0);

    const claims = CLAIMS.map((entry) => claimLedgerEntrySchema.parse(entry));
    expect(claims.map((entry) => entry.id)).toEqual([
      "claim-fixture-001",
      "claim-fixture-002",
      "claim-fixture-003",
    ]);

    // The cache key binds the normalized request: claim order and text
    // whitespace must not change the identity.
    const base = makeRequest({
      claimIds: ["claim-fixture-003", "claim-fixture-001"],
      narration: "公司成立   日期",
      visualIntent: "庆典",
    });
    const normalized = normalizeRetrievalRequest(base);
    expect(normalized.claimIds).toEqual(["claim-fixture-001", "claim-fixture-003"]);
    expect(normalized.narration).toBe("公司成立 日期");
    const other = makeRequest({
      claimIds: ["claim-fixture-001", "claim-fixture-003"],
      narration: "公司成立 日期",
      visualIntent: "庆典",
    });
    expect(normalizeRetrievalRequest(other)).toEqual(normalized);

    // Deterministic comparator: score desc → source preference desc → mediaId
    // asc → startMs asc → clipId asc.
    const mk = (overrides: {
      score: number;
      sourceType: MediaSourceType;
      mediaId: string;
      startMs: number;
      clipId: string;
    }): Parameters<typeof compareScoredCandidates>[0] => ({
      item: {
        clipId: overrides.clipId,
        episodeId,
        mediaRef: {} as ArtifactRef,
        startMs: overrides.startMs,
        endMs: overrides.startMs + 1000,
        transcriptRefs: [],
        sceneRefs: [],
        keyframeRefs: [],
        textSummary: "",
        keywords: [],
        entities: [],
        speaker: null,
        observedText: "",
        semanticTags: [],
        sourceSha256: "b".repeat(64),
        indexVersion: "media-clip-index-v1",
      },
      asset: {mediaId: overrides.mediaId} as MediaAsset,
      source: {sourceType: overrides.sourceType} as MediaSource,
      indexRef: {} as ArtifactRef,
      score: overrides.score,
      breakdown: {
        claim: 0,
        lexical: 0,
        metadata: 0,
        visualIntent: 0,
        sourcePreference: 0,
        duration: 0,
      },
      matchedClaimIds: [],
      reasons: [],
    });
    expect(
      compareScoredCandidates(
        mk({score: 0.9, sourceType: "official", mediaId: "m:a", startMs: 0, clipId: "c1"}),
        mk({score: 0.8, sourceType: "official", mediaId: "m:a", startMs: 0, clipId: "c2"}),
      ),
    ).toBeLessThan(0);
    expect(
      compareScoredCandidates(
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 0, clipId: "c1"}),
        mk({score: 0.9, sourceType: "social", mediaId: "m:a", startMs: 0, clipId: "c2"}),
      ),
    ).toBeLessThan(0);
    expect(
      compareScoredCandidates(
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 5000, clipId: "c1"}),
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 0, clipId: "c2"}),
      ),
    ).toBeGreaterThan(0);
    expect(
      compareScoredCandidates(
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 0, clipId: "z"}),
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 0, clipId: "a"}),
      ),
    ).toBeGreaterThan(0);
    expect(
      compareScoredCandidates(
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 0, clipId: "c"}),
        mk({score: 0.9, sourceType: "official", mediaId: "m:b", startMs: 0, clipId: "c"}),
      ),
    ).toBe(0);

    // Cache identity is a stable SHA-256 digest over all bound inputs.
    const key = buildMediaRetrievalCacheKey({
      episodeId,
      request: normalized,
      claimLedger: {
        path: "content/episode-m5/research/facts.json",
        sha256: "c".repeat(64),
        sizeBytes: 10,
      },
      clipIndexHashes: {"episode-m5:media:demo": "d".repeat(64)},
      mediaEligibilityHash: "e".repeat(64),
      rankingConfig: DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG,
      dependencyHashes: {},
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      buildMediaRetrievalCacheKey({
        episodeId,
        request: normalized,
        claimLedger: {
          path: "content/episode-m5/research/facts.json",
          sha256: "c".repeat(64),
          sizeBytes: 10,
        },
        clipIndexHashes: {"episode-m5:media:demo": "d".repeat(64)},
        mediaEligibilityHash: "e".repeat(64),
        rankingConfig: DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG,
        dependencyHashes: {},
      }),
    ).toBe(key);
  });
});
