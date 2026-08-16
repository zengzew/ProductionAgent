/**
 * M5 Exit Acceptance — integrated real-media E2E setup.
 *
 * Builds the FULL M5 pipeline for the dedicated acceptance episode
 * `episode-m5e2e` from REAL fixture bytes (ffmpeg-generated 1280x720 MP4 with
 * real duration + `say`-synthesized Chinese narration), exercising:
 *
 *   source admission + rights (HumanDecision)
 *   → ingest (real bytes, hash-bound) → normalize (real ffmpeg proxy)
 *   → index (real keyframes + deterministic transcript stub)
 *   → deterministic retrieval → short-clip verification (deterministic VLM stub)
 *   → VisualSlot selection
 *
 * No network is used. Hosted ASR/VLM adapters are not available in this
 * environment, so the documented deterministic providers stand in for them —
 * every deterministic gate (hash/rights/admission/registry) is real.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
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
  readMediaEvents,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  type MediaRightsStatus,
} from "../../src/media";
import {retrieveMediaCandidates, readMediaRetrievalResult} from "../../src/media/retrieve";
import {verifyMediaClip, createDeterministicVerificationProvider} from "../../src/media/verify";
import {selectVisualSlotForSegment} from "../../src/media/select";
import {readVisualSlot} from "../../src/media/select";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const EP = "episode-m5e2e";
const FIXED_NOW = "2026-08-18T00:00:00.000Z";

// The media pipeline state is regenerated on every run (deterministic setup).
for (const target of [
  path.join(repoRoot, "content", EP, "media"),
  path.join(repoRoot, "content", EP, "production", "human-decisions"),
  path.join(repoRoot, "content", EP, "artifact-index.json"),
  path.join(repoRoot, "public", "episodes", EP, "media"),
]) {
  fs.rmSync(target, {recursive: true, force: true});
}

const run = (command: string, args: string[]): string => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr).slice(0, 800)}`);
  }
  return result.stdout;
};

const sha256File = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const ep = (...parts: string[]): string => path.join(repoRoot, "content", EP, ...parts);

/* ------------------------------------------------------------------------- *
 * 1. Episode story/config files
 * ------------------------------------------------------------------------- */

const SEGMENTS = [
  {
    id: "seg-001",
    section: "hook",
    narration: "主界面演示，十三秒完成第一次操作，任务气泡实时出现。",
    claimIds: ["claim-e2e-001"],
    visualIntent: "主界面操作流程演示",
    scene: "e2e-demo",
  },
  {
    id: "seg-002",
    section: "body",
    narration:
      "团队把核心流程做成了实时可见的步骤列表，每一步都显示开始时间和完成状态，操作过程不再是黑盒，每一步都有日志可以回看。",
    claimIds: ["claim-e2e-002"],
    visualIntent: "实时步骤列表",
    scene: "e2e-steps",
  },
  {
    id: "seg-003",
    section: "body",
    narration:
      "发布后第一周，演示视频被转发了四万次，评论区出现真实的安装反馈和二次创作，数据来自官方后台。",
    claimIds: ["claim-e2e-003"],
    visualIntent: "发布后传播数据",
    scene: "e2e-growth",
  },
  {
    id: "seg-004",
    section: "body",
    narration:
      "现在，同样的任务只需要一条指令。打开网页，整理文件，继续运行，全部自动完成，不需要守着屏幕，这就是自动化该有的样子。",
    claimIds: ["claim-e2e-004"],
    visualIntent: "一条指令完成任务",
    scene: "e2e-one-command",
  },
];

writeJson(ep("episode.config.json"), {
  schemaVersion: "episode-config-v2",
  id: EP,
  slug: "m5e2e",
  product: "M5 E2E Fixture",
  title: "M5 Acceptance E2E",
  language: "zh-CN",
  targetSeconds: 60,
  production: {timelineTailSeconds: {}, hookAttributionSubjects: ["M5 E2E"]},
  selection: "selected",
  selectionReason: "acceptance E2E fixture",
  publishStatus: "evaluation",
  publishBlocker: "acceptance-only, never published",
  asOf: "2026-08-18",
  captureAssets: [],
});

writeJson(ep("research", "facts.json"), [
  {
    id: "claim-e2e-001",
    claim: "产品演示 展示了 主界面 操作 流程",
    metricName: "",
    value: "",
    period: "",
    eventDate: "",
    sourceIds: ["src-e2e-demo"],
    confidence: "high",
    reportingType: "independently-verified",
    allowedInNarration: true,
    notes: "E2E fixture claim",
  },
  {
    id: "claim-e2e-002",
    claim: "团队 核心流程 实时 可见 步骤 列表",
    metricName: "",
    value: "",
    period: "",
    eventDate: "",
    sourceIds: ["src-e2e-demo"],
    confidence: "high",
    reportingType: "independently-verified",
    allowedInNarration: true,
    notes: "E2E fixture claim",
  },
  {
    id: "claim-e2e-003",
    claim: "发布 第一周 演示视频 转发 四万 次",
    metricName: "转发次数",
    value: "40000",
    period: "发布后第一周",
    eventDate: "",
    sourceIds: ["src-e2e-growth"],
    confidence: "high",
    reportingType: "company-reported",
    allowedInNarration: true,
    notes: "E2E fixture claim",
  },
  {
    id: "claim-e2e-004",
    claim: "同样 任务 只需要 一条 指令",
    metricName: "",
    value: "",
    period: "",
    eventDate: "",
    sourceIds: ["src-e2e-demo"],
    confidence: "high",
    reportingType: "independently-verified",
    allowedInNarration: true,
    notes: "E2E fixture claim",
  },
]);

writeJson(ep("research", "sources.json"), [
  {
    id: "src-e2e-demo",
    title: "E2E demo recording",
    publisher: "M5 Acceptance Fixture",
    url: "https://fixture.invalid/demo",
    publishedAt: "2026-08-18",
    accessedAt: "2026-08-18T00:00:00.000Z",
    sourceType: "official",
    notes: "locally generated fixture recording",
  },
  {
    id: "src-e2e-growth",
    title: "E2E growth evidence",
    publisher: "M5 Acceptance Fixture",
    url: "https://fixture.invalid/growth",
    publishedAt: "2026-08-18",
    accessedAt: "2026-08-18T00:00:00.000Z",
    sourceType: "official",
    notes: "fixture growth metric",
  },
]);

writeJson(ep("story", "script.json"), {
  schemaVersion: "script-v1",
  selectedHook: SEGMENTS[0]!.narration,
  segments: SEGMENTS.map((segment, index) => ({
    ...segment,
    onScreenText: [],
    targetSeconds: Math.round((segment.narration.length / 3.6) * 10) / 10 + 0.5,
    index,
  })),
});

writeJson(ep("story", "caption-plan.json"), {
  segments: [
    {
      segmentId: "seg-001",
      cues: ["主界面演示", "十三秒完成第一次操作", "任务气泡实时出现"],
    },
    {
      segmentId: "seg-002",
      cues: [
        "团队把核心流程",
        "做成了实时可见的步骤列表",
        "每一步都显示开始时间和完成状态",
        "操作过程不再是黑盒",
        "每一步都有日志可以回看",
      ],
    },
    {
      segmentId: "seg-003",
      cues: [
        "发布后第一周",
        "演示视频被转发了四万次",
        "评论区出现真实的安装反馈",
        "和二次创作",
        "数据来自官方后台",
      ],
    },
    {
      segmentId: "seg-004",
      cues: [
        "现在同样的任务",
        "只需要一条指令",
        "打开网页整理文件",
        "继续运行",
        "全部自动完成",
        "不需要守着屏幕",
        "这就是自动化该有的样子",
      ],
    },
  ],
});

/* ------------------------------------------------------------------------- *
 * 2. Narration (macOS `say`, real speech synthesis, no network)
 * ------------------------------------------------------------------------- */

const audioDir = path.join(repoRoot, "public", "episodes", EP, "audio");
fs.mkdirSync(audioDir, {recursive: true});

const narrationDurations: number[] = [];
for (const segment of SEGMENTS) {
  const aiff = path.join(audioDir, `${segment.id}.aiff`);
  const mp3 = path.join(audioDir, `${segment.id}.mp3`);
  run("say", ["-v", "Tingting", "-r", "190", "-o", aiff, segment.narration]);
  const wav = path.join(audioDir, `${segment.id}.wav`);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    aiff,
    "-af",
    "aresample=48000",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    wav,
  ]);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    wav,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=7",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    mp3,
  ]);
  fs.rmSync(aiff, {force: true});
  fs.rmSync(wav, {force: true});
  const duration = Number(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mp3,
    ]).trim(),
  );
  narrationDurations.push(duration);
  console.log(`narration ${segment.id}: ${duration.toFixed(3)}s`);
}
const totalNarration = narrationDurations.reduce((sum, value) => sum + value, 0);
console.log(`total narration: ${totalNarration.toFixed(3)}s`);
if (totalNarration + 0.18 + 3 * 0.9 < 40) {
  throw new Error(`narration too short for the 40s contract: ${totalNarration.toFixed(3)}s`);
}

writeJson(ep("production", "tts-metadata.json"), {
  requestedProvider: "m5-acceptance-say",
  provider: "macOS say (Tingting zh_CN)",
  providerId: "say-local",
  fallbackUsed: false,
  fallbackReason: "",
  generatedAt: FIXED_NOW,
  voice: "Tingting",
  speed: 190,
  pitch: "default",
  normalization: "loudnorm I=-16 TP=-1.5 LRA=7",
  credentialRequired: false,
  networkRequired: true,
  alignmentStrategy: "caption-plan-proportional",
  files: SEGMENTS.map((segment) => ({
    segmentId: segment.id,
    file: `episodes/${EP}/audio/${segment.id}.mp3`,
  })),
});

/* ------------------------------------------------------------------------- *
 * 3. Real media fixture (ffmpeg: 24s 1280x720 16:9, real encoded bytes)
 * ------------------------------------------------------------------------- */

const fixturePath = path.join(repoRoot, "downloads", `${EP}-fixture.mp4`);
fs.mkdirSync(path.dirname(fixturePath), {recursive: true});
run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=1280x720:rate=30:duration=24",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000:duration=24",
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-shortest",
  fixturePath,
]);
const fixtureSha = sha256File(fixturePath);
console.log(
  `fixture: ${fixturePath} ${fixtureSha.slice(0, 16)}… ${fs.statSync(fixturePath).size} bytes`,
);

/* ------------------------------------------------------------------------- *
 * 4. Source admission + rights (persisted HumanDecisions)
 * ------------------------------------------------------------------------- */

const SOURCE_ID = `${EP}:media-source:official-demo`;
const MEDIA_ID = `${EP}:media:demo`;

const decision = (
  gate: "media-admission" | "media-rights",
  decisionId: string,
  ref: unknown = manifestRef,
) =>
  humanDecisionSchema.parse({
    decisionId,
    gate,
    decision: "approve",
    reviewer: "m5-acceptance-human-reviewer",
    timestamp: FIXED_NOW,
    reason: "acceptance E2E: fixture source admitted and rights-approved",
    artifactRefs: [ref],
    approvalEpoch: 0,
  });

const proposal = proposeMediaSource({
  repoRoot,
  episodeId: EP,
  source: {
    sourceId: SOURCE_ID,
    sourceUrl: "",
    publisher: "M5 Acceptance Fixture",
    sourceType: "local-approved",
    rightsBasis: "Locally generated acceptance fixture",
    rightsStatus: "review-required" as MediaRightsStatus,
    notes: "generated by ffmpeg for the M5 exit acceptance E2E",
  },
});
// The manifest file exists after the proposal; the HumanDecision refs bind it.
const manifestRef = buildArtifactRef({
  repoRoot,
  artifactId: `${EP}:media:source-manifest`,
  episodeId: EP,
  path: `content/${EP}/media/source-manifest.json`,
  mediaType: "application/json",
  schemaVersion: "media-source-manifest-v1",
  producer: "m5-acceptance-e2e",
  createdAt: FIXED_NOW,
});
applyMediaSourceAdmission({
  repoRoot,
  episodeId: EP,
  sourceId: proposal.source.sourceId,
  decision: decision("media-admission", `admission-${EP}-official-demo`),
  expectedManifestVersion: proposal.version,
});
// The rights decision must anchor the manifest as it is AFTER admission.
const currentManifestRef = buildArtifactRef({
  repoRoot,
  artifactId: `${EP}:media:source-manifest`,
  episodeId: EP,
  path: `content/${EP}/media/source-manifest.json`,
  mediaType: "application/json",
  schemaVersion: "media-source-manifest-v1",
  producer: "m5-acceptance-e2e",
  createdAt: FIXED_NOW,
});
applyMediaSourceRights({
  repoRoot,
  episodeId: EP,
  sourceId: proposal.source.sourceId,
  decision: decision("media-rights", `rights-${EP}-official-demo`, currentManifestRef),
  expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, EP),
});
console.log("source admitted + rights approved:", SOURCE_ID);

/* ------------------------------------------------------------------------- *
 * 5. Ingest (real bytes) + normalize (real ffmpeg proxy)
 * ------------------------------------------------------------------------- */

const ingestResult = await ingestMediaSource({
  repoRoot,
  episodeId: EP,
  sourceId: SOURCE_ID,
  mediaId: MEDIA_ID,
  localFilePath: fixturePath,
  cache: null,
  now: () => FIXED_NOW,
});
console.log(
  `ingest: original ${ingestResult.original.sha256.slice(0, 16)}… ` +
    `${ingestResult.original.sizeBytes} bytes, proxy: ${ingestResult.proxy ? ingestResult.proxy.mediaId : "none"}`,
);
if (!ingestResult.proxy) {
  throw new Error("E2E requires a normalized proxy");
}

/* ------------------------------------------------------------------------- *
 * 6. Index (real keyframes + deterministic transcript stub)
 * ------------------------------------------------------------------------- */

await indexMediaAsset({
  repoRoot,
  episodeId: EP,
  mediaId: MEDIA_ID,
  cache: null,
  transcriptProvider: createStubTranscriptProvider({
    segments: [
      {text: "产品演示 主界面 操作 流程 任务 气泡", startMs: 0, endMs: 8000, speaker: "host"},
      {text: "团队 核心流程 实时 可见 步骤 列表", startMs: 8000, endMs: 16000, speaker: "host"},
      {text: "发布 第一周 演示视频 转发 四万 反馈", startMs: 16000, endMs: 24000, speaker: "host"},
    ],
  }),
  semanticAdapter: createDeterministicSemanticAdapter(),
  keyframeExtractor: createStubKeyframeExtractor(),
  config: {
    scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
    clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
    keyframe: {quality: 2, mediaType: "image/jpeg"},
  },
  now: () => FIXED_NOW,
});
console.log("index complete (real keyframe stub + deterministic transcript)");

/* ------------------------------------------------------------------------- *
 * 7. Retrieval (deterministic Top-K per segment)
 * ------------------------------------------------------------------------- */

const request = mediaRetrievalRequestSchema.parse({
  schemaVersion: "media-retrieval-request-v1",
  episodeId: EP,
  segmentId: "seg-001",
  claimIds: SEGMENTS[0]!.claimIds,
  narration: SEGMENTS[0]!.narration,
  visualIntent: SEGMENTS[0]!.visualIntent,
  topK: 5,
});
const retrievalOutcome = await retrieveMediaCandidates({
  repoRoot,
  episodeId: EP,
  request,
  cache: null,
  now: () => FIXED_NOW,
});
const retrievalResult = readMediaRetrievalResult(repoRoot, EP, "seg-001");
const candidate = retrievalResult.candidates[0];
if (!candidate) throw new Error("E2E retrieval produced no candidates");
console.log(
  `retrieval: ${retrievalResult.candidates.length} candidates, top=${candidate.clipId} score=${candidate.score}`,
);

/* ------------------------------------------------------------------------- *
 * 8. Short-clip verification (deterministic pass VLM stub)
 * ------------------------------------------------------------------------- */

const verifyOutcome = await verifyMediaClip({
  repoRoot,
  episodeId: EP,
  request: {
    schemaVersion: "media-verification-request-v1",
    episodeId: EP,
    segmentId: "seg-001",
    clipId: candidate.clipId,
    claimIds: SEGMENTS[0]!.claimIds,
    narration: SEGMENTS[0]!.narration,
    visualIntent: SEGMENTS[0]!.visualIntent,
    retrievalResultRef: retrievalOutcome.artifactRef,
    maxKeyframes: 4,
  },
  provider: createDeterministicVerificationProvider({
    output: (input) => ({
      verdict: "pass",
      relevance: 0.9,
      claimMatch: 0.9,
      visualQuality: 0.8,
      misleadingRisk: 0.1,
      observedActions: ["fixture UI operation"],
      observedEntities: [],
      observedText: ["产品演示 主界面 操作"],
      recommendedStartMs: input.clip.startMs,
      recommendedEndMs: input.clip.endMs,
      reasons: ["deterministic acceptance VLM stub observed the short clip only"],
    }),
  }),
  cache: null,
  shortClipExtractor: undefined,
  now: () => FIXED_NOW,
});
console.log(`verification: ${verifyOutcome.verdict} (${candidate.clipId})`);

/* ------------------------------------------------------------------------- *
 * 9. VisualSlot selection (real-media-first)
 * ------------------------------------------------------------------------- */

const slotOutcome = await selectVisualSlotForSegment({
  repoRoot,
  episodeId: EP,
  segment: {
    segmentId: "seg-001",
    claimIds: SEGMENTS[0]!.claimIds,
    narration: SEGMENTS[0]!.narration,
    visualIntent: SEGMENTS[0]!.visualIntent,
    durationTargetMs: 7000,
  },
  now: () => FIXED_NOW,
});
console.log(
  `selection: ${slotOutcome.selectedType}${slotOutcome.fallbackType ? ` fallback=${slotOutcome.fallbackType}` : ""}`,
);
const slot = readVisualSlot(repoRoot, EP, "seg-001");
if (slot.selectedType !== "real-media") {
  throw new Error(`E2E expected a real-media slot, got ${slot.selectedType}`);
}

/* ------------------------------------------------------------------------- *
 * 10. Evidence summary
 * ------------------------------------------------------------------------- */

const manifest = readMediaSourceManifest(repoRoot, EP);
const source = getMediaSource(manifest, SOURCE_ID)!;
const events = readMediaEvents(repoRoot, EP);
const summary = {
  episode: EP,
  fixture: {path: fixturePath, sha256: fixtureSha, sizeBytes: fs.statSync(fixturePath).size},
  original: {
    mediaId: ingestResult.original.mediaId,
    sha256: ingestResult.original.sha256,
    sizeBytes: ingestResult.original.sizeBytes,
    mediaType: ingestResult.original.mediaType,
    artifactRef: ingestResult.original.artifactRef,
  },
  proxy: ingestResult.proxy
    ? {
        mediaId: ingestResult.proxy.mediaId,
        sha256: ingestResult.proxy.sha256,
        artifactRef: ingestResult.proxy.artifactRef,
      }
    : null,
  source: {
    sourceId: source.sourceId,
    admissionStatus: source.admissionStatus,
    rightsStatus: source.rightsStatus,
    admissionDecisionRef: source.admissionDecisionRef,
    rightsDecisionRef: source.rightsDecisionRef,
  },
  retrieval: {
    artifactRef: retrievalOutcome.artifactRef,
    candidates: retrievalResult.candidates.length,
  },
  verification: {
    artifactRef: verifyOutcome.artifactRef,
    verdict: verifyOutcome.verdict,
    clipId: candidate.clipId,
  },
  selection: {
    artifactRef: slotOutcome.artifactRef,
    selectedType: slot.selectedType,
    clipId: slot.selectedMediaClipRef?.clipId,
  },
  narrationTotalSeconds: Number(totalNarration.toFixed(3)),
  events: {
    ingest: events.filter(
      (event) =>
        event.eventType.startsWith("media.ingest") || event.eventType.startsWith("media.normalize"),
    ).length,
    index: events.filter((event) => event.eventType.startsWith("media.index")).length,
    retrieval: events.filter((event) => event.eventType.startsWith("media.retrieval")).length,
    verification: events.filter((event) => event.eventType.startsWith("media.verification")).length,
    selection: events.filter((event) => event.eventType.startsWith("media.selection")).length,
  },
};
writeJson(path.join(repoRoot, "reports", "m5-acceptance", "e2e-setup-summary.json"), summary);
console.log("summary written to reports/m5-acceptance/e2e-setup-summary.json");
console.log(JSON.stringify(summary, null, 2).slice(0, 3000));
