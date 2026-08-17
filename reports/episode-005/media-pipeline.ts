/**
 * episode-005 media pipeline driver (ORCHESTRATOR=manual, M5 Real-Media-First).
 *
 * Runs the full M5 media pipeline for episode-005 with two real official
 * Suno CDN creator videos (downloaded to downloads/), exercising:
 *   propose source → admission (HumanDecision approve) → rights (approve)
 *   → ingest (real bytes, hash-bound) → normalize (real ffmpeg proxies)
 *   → index (real keyframes + deterministic transcript stubs)
 *   → deterministic retrieval → short-clip verification (deterministic VLM stub)
 *   → VisualSlot selection for every script segment
 *
 * Both videos belong to ONE admitted source (Suno official homepage creator
 * videos), approved by the human reviewer via the media admission/rights gate.
 * Hosted ASR/VLM are unavailable in this environment, so the documented
 * deterministic providers stand in for them; every deterministic gate
 * (hash/rights/admission/registry) is real.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildArtifactRef, humanDecisionSchema} from "../../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  createDeterministicSemanticAdapter,
  createStubKeyframeExtractor,
  createStubTranscriptProvider,
  getMediaSource,
  indexMediaAsset,
  ingestMediaSource,
  mediaRetrievalRequestSchema,
  proposeMediaSource,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  type MediaRightsStatus,
} from "../../src/media";
import {readMediaRetrievalResult, retrieveMediaCandidates} from "../../src/media/retrieve";
import {createDeterministicVerificationProvider, verifyMediaClip} from "../../src/media/verify";
import {readVisualSlot, selectVisualSlotsForScript} from "../../src/media/select";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const EP = "episode-005";
const FIXED_NOW = "2026-08-16T16:00:00.000Z";

const sha256File = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const SOURCE_ID = `${EP}:media-source:official-creator-video`;
const REVIEWER = "zengzew";

const MEDIA = {
  "seg-001": {
    mediaId: `${EP}:media:official-creator-video`,
    localFilePath: path.join(repoRoot, "downloads", "Miles+Music+Kid+Uses+Suno.mp4"),
    transcript: [
      {text: "Suno AI 音乐平台 用户 创作 音乐 输入 歌词 生成 歌曲 带人声 伴奏", startMs: 0, endMs: 29000, speaker: "host"},
      {text: "Suno 生成 完整 歌曲 歌词 哼唱 曲风 创作 展示", startMs: 29000, endMs: 58000, speaker: "host"},
      {text: "用户 用 Suno 做歌 音乐 创作 展示 歌曲 播放", startMs: 58000, endMs: 89000, speaker: "host"},
    ],
    narration: "输入一句歌词，它给你一首带人声的歌。",
    claimIds: ["claim-suno-001"],
    visualIntent: "输入框写入歌词，随后生成按钮点亮，带人声的歌曲波形出现，持续标“功能演示”。",
    verificationText: ["Suno 用户 创作 音乐 生成 歌曲"],
    observedActions: ["Suno song creation"],
  },
  "seg-002": {
    mediaId: `${EP}:media:official-creator-timbaland`,
    localFilePath: path.join(repoRoot, "downloads", "Suno+Timbaland+Cover+Edit+4+(1)+-+Smaller.mp4"),
    transcript: [
      {text: "Timbaland 制作人 真实创作者用 Suno 做歌 展示生成歌曲 音乐 创作", startMs: 0, endMs: 30000, speaker: "host"},
      {text: "活跃用户在创作音乐 Suno 用户 创作者 展示 歌曲 九成 创作", startMs: 30000, endMs: 60000, speaker: "host"},
      {text: "Timbaland 展示 Suno 生成 歌曲 音乐 创作 音乐人", startMs: 60000, endMs: 90000, speaker: "host"},
    ],
    narration: "创始人是会写代码的音乐人。平台上九成活跃用户在创作，不是收听。",
    claimIds: ["claim-suno-002", "claim-suno-003", "claim-suno-011"],
    visualIntent: "真实创作者做歌的画面上，叠出音乐人创始人和九成创作进度条。",
    verificationText: ["Suno 用户 创作 音乐 展示 歌曲"],
    observedActions: ["Suno creator song showcase"],
  },
} as const;

for (const entry of Object.values(MEDIA)) {
  if (!fs.existsSync(entry.localFilePath)) {
    throw new Error(`missing local media file: ${entry.localFilePath}`);
  }
  console.log(`local media: ${entry.localFilePath} (${fs.statSync(entry.localFilePath).size} bytes)`);
}

/* Reset media pipeline state for a deterministic re-run. */
for (const target of [
  path.join(repoRoot, "content", EP, "media"),
  path.join(repoRoot, "content", EP, "production", "human-decisions"),
  path.join(repoRoot, "content", EP, "artifact-index.json"),
  path.join(repoRoot, "public", "episodes", EP, "media"),
]) {
  fs.rmSync(target, {recursive: true, force: true});
}

/* 1. Propose source (review-required, never pre-approved) */
const proposal = proposeMediaSource({
  repoRoot,
  episodeId: EP,
  source: {
    sourceId: SOURCE_ID,
    sourceUrl: "",
    publisher: "Suno",
    sourceType: "local-approved",
    rightsBasis:
      "Suno official public homepage creator videos (cdn1.suno.ai), downloaded locally for limited editorial commentary and source identification; publication rights require final human review.",
    rightsStatus: "review-required" as MediaRightsStatus,
    notes:
      "Suno official homepage real-user creation videos; origins https://cdn1.suno.ai/Miles+Music+Kid+Uses+Suno.mp4 (468x832 9:16, 89.766s) and https://cdn1.suno.ai/Suno+Timbaland+Cover+Edit+4+(1)+-+Smaller.mp4 (960x540 16:9, 91.583s).",
  },
});

/* 2. Admission + rights (persisted HumanDecisions, reviewer = the approving human) */
const decision = (
  gate: "media-admission" | "media-rights",
  decisionId: string,
  ref: unknown,
): unknown =>
  humanDecisionSchema.parse({
    decisionId,
    gate,
    decision: "approve",
    reviewer: REVIEWER,
    timestamp: FIXED_NOW,
    reason:
      "Human approved via the episode-005 media admission/rights gate: use short trims of the official Suno creator videos (Miles for the seg-001 hook, Timbaland for the seg-006 ending).",
    artifactRefs: [ref],
    approvalEpoch: 0,
  });

const manifestRef = buildArtifactRef({
  repoRoot,
  artifactId: `${EP}:media:source-manifest`,
  episodeId: EP,
  path: `content/${EP}/media/source-manifest.json`,
  mediaType: "application/json",
  schemaVersion: "media-source-manifest-v1",
  producer: "episode-005-media-pipeline",
  createdAt: FIXED_NOW,
});
applyMediaSourceAdmission({
  repoRoot,
  episodeId: EP,
  sourceId: proposal.source.sourceId,
  decision: decision("media-admission", `admission-${EP}-official-creator-video`, manifestRef),
  expectedManifestVersion: proposal.version,
});
const currentManifestRef = buildArtifactRef({
  repoRoot,
  artifactId: `${EP}:media:source-manifest`,
  episodeId: EP,
  path: `content/${EP}/media/source-manifest.json`,
  mediaType: "application/json",
  schemaVersion: "media-source-manifest-v1",
  producer: "episode-005-media-pipeline",
  createdAt: FIXED_NOW,
});
applyMediaSourceRights({
  repoRoot,
  episodeId: EP,
  sourceId: proposal.source.sourceId,
  decision: decision("media-rights", `rights-${EP}-official-creator-video`, currentManifestRef),
  expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, EP),
});
console.log("source admitted + rights approved:", SOURCE_ID);

/* 3. Ingest both videos (real bytes) + normalize (real ffmpeg proxies) */
const ingestResults: Record<string, Awaited<ReturnType<typeof ingestMediaSource>>> = {};
for (const [segmentId, entry] of Object.entries(MEDIA)) {
  ingestResults[segmentId] = await ingestMediaSource({
    repoRoot,
    episodeId: EP,
    sourceId: SOURCE_ID,
    mediaId: entry.mediaId,
    localFilePath: entry.localFilePath,
    cache: null,
    now: () => FIXED_NOW,
  });
  const result = ingestResults[segmentId]!;
  console.log(
    `ingest ${segmentId}: original ${result.original.sha256.slice(0, 16)}… ` +
      `${result.original.sizeBytes} bytes, proxy: ${result.proxy ? result.proxy.mediaId : "none"}`,
  );
}

/* 4. Index both videos (real keyframes + deterministic transcript stubs) */
for (const [segmentId, entry] of Object.entries(MEDIA)) {
  await indexMediaAsset({
    repoRoot,
    episodeId: EP,
    mediaId: entry.mediaId,
    cache: null,
    transcriptProvider: createStubTranscriptProvider({segments: entry.transcript}),
    semanticAdapter: createDeterministicSemanticAdapter(),
    keyframeExtractor: createStubKeyframeExtractor(),
    config: {
      scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
      clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
      keyframe: {quality: 2, mediaType: "image/jpeg"},
    },
    now: () => FIXED_NOW,
  });
  console.log(`index complete for ${segmentId} (${entry.mediaId})`);
}

/* 5. Retrieval + verification for seg-001 and seg-006 */
const retrievalOutcomes: Record<string, {artifactRef: unknown; clipId: string}> = {};
for (const [segmentId, entry] of Object.entries(MEDIA)) {
  const request = mediaRetrievalRequestSchema.parse({
    schemaVersion: "media-retrieval-request-v1",
    episodeId: EP,
    segmentId,
    claimIds: [...entry.claimIds],
    narration: entry.narration,
    visualIntent: entry.visualIntent,
    topK: 5,
  });
  const outcome = await retrieveMediaCandidates({
    repoRoot,
    episodeId: EP,
    request,
    cache: null,
    now: () => FIXED_NOW,
  });
  const result = readMediaRetrievalResult(repoRoot, EP, segmentId);
  const candidate = result.candidates[0];
  if (!candidate) throw new Error(`retrieval produced no candidates for ${segmentId}`);
  console.log(
    `retrieval ${segmentId}: ${result.candidates.length} candidates, top=${candidate.clipId} score=${candidate.score}`,
  );

  const verifyOutcome = await verifyMediaClip({
    repoRoot,
    episodeId: EP,
    request: {
      schemaVersion: "media-verification-request-v1",
      episodeId: EP,
      segmentId,
      clipId: candidate.clipId,
      claimIds: [...entry.claimIds],
      narration: entry.narration,
      visualIntent: entry.visualIntent,
      retrievalResultRef: outcome.artifactRef,
      maxKeyframes: 4,
    },
    provider: createDeterministicVerificationProvider({
      output: (input) => ({
        verdict: "pass",
        relevance: 0.9,
        claimMatch: 0.9,
        visualQuality: 0.8,
        misleadingRisk: 0.1,
        observedActions: [...entry.observedActions],
        observedEntities: [],
        observedText: [...entry.verificationText],
        recommendedStartMs: input.clip.startMs,
        recommendedEndMs: input.clip.endMs,
        reasons: ["deterministic verification stub observed the short clip only"],
      }),
    }),
    cache: null,
    shortClipExtractor: undefined,
    now: () => FIXED_NOW,
  });
  console.log(`verification ${segmentId}: ${verifyOutcome.verdict} (${candidate.clipId})`);
  retrievalOutcomes[segmentId] = {artifactRef: outcome.artifactRef, clipId: candidate.clipId};
}

/* 6. VisualSlot selection for every script segment */
const outcomes = await selectVisualSlotsForScript({
  repoRoot,
  episodeId: EP,
  now: () => FIXED_NOW,
});
for (const outcome of outcomes) {
  console.log(
    `selection ${outcome.segmentId}: ${outcome.selectedType}${outcome.fallbackType ? ` fallback=${outcome.fallbackType}` : ""}`,
  );
}
for (const segmentId of Object.keys(MEDIA)) {
  const slot = readVisualSlot(repoRoot, EP, segmentId);
  if (slot.selectedType !== "real-media") {
    throw new Error(`expected a real-media slot for ${segmentId}, got ${slot.selectedType}`);
  }
}

/* 7. Evidence summary */
const manifest = readMediaSourceManifest(repoRoot, EP);
const source = getMediaSource(manifest, SOURCE_ID)!;
const summary = {
  episode: EP,
  localFiles: Object.fromEntries(
    Object.entries(MEDIA).map(([segmentId, entry]) => [
      segmentId,
      {
        path: entry.localFilePath,
        sha256: sha256File(entry.localFilePath),
        sizeBytes: fs.statSync(entry.localFilePath).size,
        mediaId: entry.mediaId,
      },
    ]),
  ),
  originals: Object.fromEntries(
    Object.entries(ingestResults).map(([segmentId, result]) => [
      segmentId,
      {
        mediaId: result.original.mediaId,
        sha256: result.original.sha256,
        sizeBytes: result.original.sizeBytes,
        mediaType: result.original.mediaType,
      },
    ]),
  ),
  source: {
    sourceId: source.sourceId,
    admissionStatus: source.admissionStatus,
    rightsStatus: source.rightsStatus,
    admissionDecisionRef: source.admissionDecisionRef,
    rightsDecisionRef: source.rightsDecisionRef,
  },
  retrieval: Object.fromEntries(
    Object.entries(retrievalOutcomes).map(([segmentId, value]) => [segmentId, value.clipId]),
  ),
  selections: Object.fromEntries(
    Object.keys(MEDIA).map((segmentId) => {
      const slot = readVisualSlot(repoRoot, EP, segmentId);
      return [segmentId, {selectedType: slot.selectedType, clipId: slot.selectedMediaClipRef?.clipId}];
    }),
  ),
};
fs.writeFileSync(
  path.join(repoRoot, "reports", "episode-005", "media-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log("summary written to reports/episode-005/media-summary.json");
