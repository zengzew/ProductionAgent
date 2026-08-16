/**
 * episode-004 media pipeline driver.
 *
 * Phases (run with `EPISODE_ID=episode-004 npx tsx reports/episode-004/media-pipeline.ts <phase>`):
 *
 *   propose   – register the real-media candidate sources in the source
 *               manifest (admissionStatus=pending, rightsStatus=review-required).
 *               This phase NEVER approves anything: it stops before any
 *               HumanDecision so a human can review source/use/window.
 *   admit     – apply persisted media-admission + media-rights HumanDecisions
 *               for every source (requires `--reviewer <human-id>`; the
 *               decisions record the human reviewer who approved).
 *   pipeline  – ingest (real bytes) → normalize proxy → index (real keyframes,
 *               transcript from the official videos' own caption tracks,
 *               deterministic semantic/scene) → claim-to-clip retrieval →
 *               multimodal verification (human keyframe review provider) →
 *               VisualSlot selection. Prints a lineage summary.
 *
 * The transcript provider is honest about provenance: it converts the caption
 * track of the official video (downloaded via yt-dlp as WebVTT) into ASR
 * segments with their real timestamps; provider id `youtube-captions` and the
 * source video id are recorded in the transcript artifact.
 *
 * The verification provider (`human-keyframe-review`) returns exactly the
 * review JSON authored by the human reviewer after inspecting the candidate
 * window's keyframes (`content/<ep>/media/human-reviews/<segmentId>.json`).
 * No auto-approve: without a review file the verification is skipped and the
 * segment falls back with a recorded reason.
 */
import fs from "node:fs";
import path from "node:path";
import {buildArtifactRef} from "../../src/orchestration/artifact-registry";
import {humanDecisionSchema} from "../../src/orchestration/schemas/human-decision";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  createDeterministicSemanticAdapter,
  createFfmpegKeyframeExtractor,
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
import {readMediaRetrievalResult, retrieveMediaCandidates} from "../../src/media/retrieve";
import {verifyMediaClip} from "../../src/media/verify";
import {readVisualSlot, selectVisualSlotForSegment} from "../../src/media/select";
import type {Script} from "../../src/schemas/episode";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const EP = "episode-004";
const NOW = "2026-08-16T12:00:00.000Z";

const args = process.argv.slice(2);
const phase = args.find((arg) => !arg.startsWith("--")) ?? "propose";
const reviewerArg = args.find((arg) => arg.startsWith("--reviewer="))?.split("=")[1];
const reviewer = reviewerArg ?? "human-approver";

const ep = (...parts: string[]): string => path.join(repoRoot, "content", EP, ...parts);

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

type SourceSpec = {
  slug: string;
  file: string;
  vtt: string | null;
  publisher: string;
  rightsBasis: string;
  notes: string;
};

const SOURCES: SourceSpec[] = [
  {
    slug: "official-demo-intro",
    file: "downloads/ep004-src/fjHtjT7GO1c.mp4",
    vtt: "downloads/ep004-src/fjHtjT7GO1c.en.vtt",
    publisher: "Cognition (official YouTube channel)",
    rightsBasis:
      "官方发布方自有频道内容（Cognition 官方 YouTube）；evaluation run 内部使用，只截取短片段并标注来源，不重新发布整段；发布前仍需人工权利终审。",
    notes:
      "Introducing Devin, the first AI software engineer — https://www.youtube.com/watch?v=fjHtjT7GO1c ，上传 2024-03-12，播放 122 万+ 次。演示 Devin 接受任务后自主规划、打开自带浏览器、写代码并跑测试。en 自动字幕由 yt-dlp 下载（2026-08-16）。拟使用：seg-001 开场（0:05–0:30 区域）、seg-002 身份（0:02–0:12 区域）、seg-006 结尾回收（0:95–1:10 区域）。",
  },
  {
    slug: "official-tutorial-getting-started",
    file: "downloads/ep004-src/KdanG1kICxg.mp4",
    vtt: "downloads/ep004-src/KdanG1kICxg.en.vtt",
    publisher: "Cognition (official YouTube channel)",
    rightsBasis:
      "官方发布方自有频道内容（Cognition 官方 YouTube）；evaluation run 内部使用，只截取短片段并标注来源，不重新发布整段；发布前仍需人工权利终审。",
    notes:
      "Getting Started with Devin in 8 Minutes — https://www.youtube.com/watch?v=KdanG1kICxg ，上传 2026-03-16。官方上手教程：任务输入、计划列表、云端 IDE 与执行过程。en 自动字幕由 yt-dlp 下载（2026-08-16）。拟使用：seg-003 工具链（计划、浏览器、编辑器、终端可见的执行段落）。",
  },
  {
    slug: "official-parallel-devin",
    file: "downloads/ep004-src/ns1ifgYEGl0.mp4",
    vtt: "downloads/ep004-src/ns1ifgYEGl0.en.vtt",
    publisher: "Cognition (official YouTube channel)",
    rightsBasis:
      "官方发布方自有频道内容（Cognition 官方 YouTube）；evaluation run 内部使用，只截取短片段并标注来源，不重新发布整段；发布前仍需人工权利终审。",
    notes:
      "How to Run 10 Devins in Parallel (Agent Fan Out Explained) — https://www.youtube.com/watch?v=ns1ifgYEGl0 ，Cognition 官方频道。演示多个平行 Devin 各自执行任务。en 自动字幕由 yt-dlp 下载（2026-08-16）。拟使用：seg-004 并行执行段落。",
  },
  {
    slug: "official-mercedes-interview",
    file: "downloads/ep004-src/IPI6VvDQqJg.mp4",
    vtt: "downloads/ep004-src/IPI6VvDQqJg.en.vtt",
    publisher: "Cognition (official YouTube channel)",
    rightsBasis:
      "官方发布方自有频道内容（Cognition 官方 YouTube）；evaluation run 内部使用，只截取短片段并标注来源，不重新发布整段；发布前仍需人工权利终审。",
    notes:
      "How Cognition is Partnering with Mercedes Benz to Accelerate Software Engineering — https://www.youtube.com/watch?v=IPI6VvDQqJg ，上传 2026-04-27（与官方案例博客同日）。奔驰研发部门负责人对谈。en 自动字幕由 yt-dlp 下载（2026-08-16）。拟使用：seg-005 客户案例段落。",
  },
  {
    slug: "official-upwork-demo",
    file: "downloads/ep004-src/UTS2Hz96HYQ.mp4",
    vtt: "downloads/ep004-src/UTS2Hz96HYQ.en.vtt",
    publisher: "Cognition (official YouTube channel)",
    rightsBasis:
      "官方发布方自有频道内容（Cognition 官方 YouTube）；evaluation run 内部使用，只截取短片段并标注来源，不重新发布整段；发布前仍需人工权利终审。",
    notes:
      "Devin's Upwork Side Hustle — https://www.youtube.com/watch?v=UTS2Hz96HYQ ，上传 2024-03-15。官方演示：Devin 在 Upwork 上接下真实外包任务，自己打开浏览器、写代码并调试。en 自动字幕由 yt-dlp 下载（2026-08-16）。拟使用：seg-001/seg-006 “自己打开浏览器去办”的备选片段。",
  },
  {
    slug: "official-ide-demo",
    file: "downloads/ep004-src/OH1oEUnhdwI.mp4",
    vtt: "downloads/ep004-src/OH1oEUnhdwI.en.vtt",
    publisher: "Cognition (official YouTube channel)",
    rightsBasis:
      "官方发布方自有频道内容（Cognition 官方 YouTube）；evaluation run 内部使用，只截取短片段并标注来源，不重新发布整段；发布前仍需人工权利终审。",
    notes:
      "Working with Devin in your IDE — https://www.youtube.com/watch?v=OH1oEUnhdwI ，上传 2024-11-19。Devin 团队使用 Devin 开发 VS Code 扩展。en 自动字幕由 yt-dlp 下载（2026-08-16）。拟使用：seg-003 编辑器/IDE 段落的备选素材。",
  },
];

const sourceIdOf = (spec: SourceSpec): string => `${EP}:media-source:${spec.slug}`;
const mediaIdOf = (spec: SourceSpec): string => `${EP}:media:${spec.slug}`;

/* ------------------------------------------------------------------------- *
 * propose
 * ------------------------------------------------------------------------- */

const propose = (): void => {
  const existing = fs.existsSync(ep("media", "source-manifest.json"))
    ? readMediaSourceManifest(repoRoot, EP)
    : null;
  for (const spec of SOURCES) {
    if (existing?.sources.some((source) => source.sourceId === sourceIdOf(spec))) {
      console.log(`already proposed: ${sourceIdOf(spec)}`);
      continue;
    }
    const result = proposeMediaSource({
      repoRoot,
      episodeId: EP,
      source: {
        sourceId: sourceIdOf(spec),
        sourceUrl: "",
        publisher: spec.publisher,
        sourceType: "local-approved",
        rightsBasis: spec.rightsBasis,
        rightsStatus: "review-required" as MediaRightsStatus,
        notes: spec.notes,
      },
    });
    console.log(
      `proposed: ${result.source.sourceId} (${result.source.admissionStatus}/${result.source.rightsStatus})`,
    );
  }
  const manifest = readMediaSourceManifest(repoRoot, EP);
  console.log("\nGATE: 以下 source 等待人工 admission / rights 批准：");
  for (const source of manifest.sources) {
    console.log(`- ${source.sourceId}`);
    console.log(`    publisher: ${source.publisher}`);
    console.log(`    notes: ${source.notes.slice(0, 120)}…`);
  }
};

/* ------------------------------------------------------------------------- *
 * admit
 * ------------------------------------------------------------------------- */

const admit = (): void => {
  if (!reviewerArg) throw new Error("admit 阶段必须提供 --reviewer=<human-id>");
  for (const spec of SOURCES) {
    const manifest = readMediaSourceManifest(repoRoot, EP);
    const source = getMediaSource(manifest, sourceIdOf(spec));
    if (!source) throw new Error(`source 不存在：${sourceIdOf(spec)}`);
    if (!source.admissionDecisionRef) {
      const manifestRef = buildArtifactRef({
        repoRoot,
        artifactId: `${EP}:media:source-manifest`,
        episodeId: EP,
        path: `content/${EP}/media/source-manifest.json`,
        mediaType: "application/json",
        schemaVersion: "media-source-manifest-v1",
        producer: "episode-004-media-pipeline",
        createdAt: NOW,
      });
      applyMediaSourceAdmission({
        repoRoot,
        episodeId: EP,
        sourceId: source.sourceId,
        decision: humanDecisionSchema.parse({
          decisionId: `admission-${EP}-${spec.slug}`,
          gate: "media-admission",
          decision: "approve",
          reviewer,
          timestamp: NOW,
          reason: `episode-004 人工批准素材准入：${spec.notes.slice(0, 120)}`,
          artifactRefs: [manifestRef],
          approvalEpoch: 0,
        }),
        expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, EP),
      });
      console.log(`admission approved: ${source.sourceId}`);
    }
    if (!source.rightsDecisionRef) {
      const currentRef = buildArtifactRef({
        repoRoot,
        artifactId: `${EP}:media:source-manifest`,
        episodeId: EP,
        path: `content/${EP}/media/source-manifest.json`,
        mediaType: "application/json",
        schemaVersion: "media-source-manifest-v1",
        producer: "episode-004-media-pipeline",
        createdAt: NOW,
      });
      applyMediaSourceRights({
        repoRoot,
        episodeId: EP,
        sourceId: source.sourceId,
        decision: humanDecisionSchema.parse({
          decisionId: `rights-${EP}-${spec.slug}`,
          gate: "media-rights",
          decision: "approve",
          reviewer,
          timestamp: NOW,
          reason: `episode-004 人工批准权利使用：${spec.rightsBasis.slice(0, 120)}`,
          artifactRefs: [currentRef],
          approvalEpoch: 0,
        }),
        expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, EP),
      });
      console.log(`rights approved: ${source.sourceId}`);
    }
  }
};

/* ------------------------------------------------------------------------- *
 * VTT transcript provider (real caption track → ASR segments)
 * ------------------------------------------------------------------------- */

const parseVttSegments = (
  vttPath: string,
  durationMs: number,
): Array<{
  text: string;
  startMs: number;
  endMs: number;
}> => {
  const text = fs.readFileSync(vttPath, "utf8");
  const blocks = text.split(/\n\s*\n/u);
  const out: Array<{text: string; startMs: number; endMs: number}> = [];
  for (const block of blocks) {
    const timing = block.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/u,
    );
    if (!timing) continue;
    const startMs =
      (Number(timing[1]) * 3600 + Number(timing[2]) * 60 + Number(timing[3])) * 1000 +
      Number(timing[4]);
    const endMs =
      (Number(timing[5]) * 3600 + Number(timing[6]) * 60 + Number(timing[7])) * 1000 +
      Number(timing[8]);
    const body = block
      .split("\n")
      .slice(2)
      .filter((line) => !line.trim().startsWith("align:"))
      .join(" ")
      .replace(/<[^>]+>/gu, "")
      .replace(/&gt;/gu, ">")
      .replace(/&lt;/gu, "<")
      .replace(/&amp;/gu, "&")
      .replace(/\s+/gu, " ")
      .trim();
    if (!body) continue;
    if (endMs > durationMs + 1000) continue;
    out.push({text: body, startMs, endMs: Math.min(endMs, durationMs)});
  }
  return out;
};

const createVttTranscriptProvider = (vttPath: string, durationMs: number, videoId: string) => ({
  id: "youtube-captions",
  model: null,
  asrVersion: "youtube-caption-track-v1",
  toolVersion: "media-asr-vtt-v1",
  transcribe: async () => ({
    availability: "available" as const,
    segments: parseVttSegments(vttPath, durationMs).map((segment) => ({
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      speaker: videoId,
      confidence: null,
    })),
  }),
});

/* ------------------------------------------------------------------------- *
 * pipeline
 * ------------------------------------------------------------------------- */

const pipeline = async (): Promise<void> => {
  const script = readJson<Script>(ep("story", "script.json"));
  const claims = readJson<Array<{id: string; claim: string}>>(ep("research", "facts.json"));
  const claimTextById = new Map(claims.map((claim) => [claim.id, claim.claim]));

  /* 1. ingest */
  for (const spec of SOURCES) {
    const localFile = path.join(repoRoot, spec.file);
    if (!fs.existsSync(localFile)) throw new Error(`缺少本地素材：${localFile}`);
    const result = await ingestMediaSource({
      repoRoot,
      episodeId: EP,
      sourceId: sourceIdOf(spec),
      mediaId: mediaIdOf(spec),
      localFilePath: localFile,
      cache: null,
      now: () => NOW,
    });
    console.log(
      `ingest ${spec.slug}: original ${result.original.sha256.slice(0, 16)}… ${result.original.sizeBytes}B` +
        (result.proxy ? `, proxy ${result.proxy.sha256.slice(0, 16)}…` : ", no proxy"),
    );
  }

  /* 2. index (real keyframes + real caption-track transcript) */
  const indexConfig = {
    scene: {targetSceneMs: 4000, minSceneMs: 800, maxSceneMs: 6000},
    clipWindow: {maxWindowMs: 60000, minWindowMs: 0},
    keyframe: {quality: 2, mediaType: "image/jpeg" as const},
  };
  const sourceManifest = readMediaSourceManifest(repoRoot, EP);
  for (const spec of SOURCES) {
    const asset = sourceManifest.assets.find((candidate) => candidate.mediaId === mediaIdOf(spec));
    if (!asset) throw new Error(`asset 不存在：${mediaIdOf(spec)}`);
    const proxy = sourceManifest.assets.find(
      (candidate) => candidate.kind === "proxy" && candidate.derivedFromMediaId === asset.mediaId,
    );
    const videoId = spec.file
      .split("/")
      .at(-1)!
      .replace(/\.mp4$/u, "");
    // Honest clamp: when the normalized proxy duration exceeds the original
    // asset duration (frame-rate rounding on 29.97fps sources), scene/clip
    // windows are clamped to the ORIGINAL duration so retrieval gates stay in
    // bounds. Detector identity records this episode-scoped adapter.
    const sceneDetector =
      proxy && asset.durationMs !== null && (proxy.durationMs ?? 0) > asset.durationMs
        ? {
            id: "episode-004-original-bounds",
            version: "scene-detector-v1-original-clamp",
            detect: () => {
              const bounds = asset.durationMs!;
              const boundaries: number[] = [];
              for (
                let b = indexConfig.scene.targetSceneMs;
                b < bounds;
                b += indexConfig.scene.targetSceneMs
              ) {
                boundaries.push(b);
              }
              boundaries.push(bounds);
              const scenes: Array<{startMs: number; endMs: number}> = [];
              let startMs = 0;
              for (const endMs of boundaries) {
                if (endMs - startMs < indexConfig.scene.minSceneMs && scenes.length > 0) {
                  const previous = scenes.at(-1);
                  if (previous) previous.endMs = endMs;
                  startMs = endMs;
                  continue;
                }
                scenes.push({startMs, endMs});
                startMs = endMs;
              }
              return scenes.map((scene, sceneIndex) => ({
                sceneIndex,
                startMs: scene.startMs,
                endMs: scene.endMs,
              }));
            },
          }
        : undefined;
    await indexMediaAsset({
      repoRoot,
      episodeId: EP,
      mediaId: asset.mediaId,
      cache: null,
      transcriptProvider: spec.vtt
        ? createVttTranscriptProvider(path.join(repoRoot, spec.vtt), asset.durationMs ?? 0, videoId)
        : undefined,
      semanticAdapter: createDeterministicSemanticAdapter(),
      keyframeExtractor: createFfmpegKeyframeExtractor({config: indexConfig.keyframe}),
      sceneDetector,
      config: indexConfig,
      now: () => NOW,
    });
    console.log(
      `index ${spec.slug}: clip index ready` +
        (sceneDetector ? " (clamped to original bounds)" : ""),
    );
  }

  /* 3. retrieval per segment */
  const retrievalRefs: Record<string, unknown> = {};
  for (const segment of script.segments) {
    const request = mediaRetrievalRequestSchema.parse({
      schemaVersion: "media-retrieval-request-v1",
      episodeId: EP,
      segmentId: segment.id,
      claimIds: segment.claimIds,
      narration: segment.narration,
      visualIntent: segment.visualIntent,
      topK: 25,
    });
    const outcome = await retrieveMediaCandidates({
      repoRoot,
      episodeId: EP,
      request,
      cache: null,
      now: () => NOW,
    });
    retrievalRefs[segment.id] = outcome.artifactRef;
    const result = readMediaRetrievalResult(repoRoot, EP, segment.id);
    const top = result.candidates
      .slice(0, 3)
      .map(
        (candidate) =>
          `${candidate.clipId}@${candidate.startMs}-${candidate.endMs}ms score=${candidate.score}`,
      );
    console.log(
      `retrieval ${segment.id}: ${result.candidates.length} candidates; top: ${top.join(" | ")}`,
    );
  }

  /* 4. verification: human keyframe review files */
  const reviewDir = ep("media", "human-reviews");
  fs.mkdirSync(reviewDir, {recursive: true});
  const keyframeStaging = ep("media", "review-keyframes");
  fs.mkdirSync(keyframeStaging, {recursive: true});
  const TOP_N = 3;
  for (const segment of script.segments) {
    const result = readMediaRetrievalResult(repoRoot, EP, segment.id);
    const candidates = result.candidates.slice(0, TOP_N);
    if (candidates.length === 0) {
      console.log(`verify ${segment.id}: 无候选，跳过（将回退）`);
      continue;
    }
    const reviewPath = path.join(reviewDir, `${segment.id}.json`);
    if (!fs.existsSync(reviewPath)) {
      // materialize candidate windows' keyframes for human review (top-N)
      const staged: unknown[] = [];
      for (const candidate of candidates) {
        const index = readJson<{
          items: Array<{
            clipId: string;
            startMs: number;
            endMs: number;
            observedText: string;
            textSummary: string;
            keyframeRefs: Array<{path: string}>;
          }>;
        }>(ep("media", "indexes", candidate.mediaId.split(":").at(-1), "clip-index.json"));
        const item = index.items.find((entry) => entry.clipId === candidate.clipId);
        const keyframes = item?.keyframeRefs ?? [];
        staged.push({
          candidate: {
            clipId: candidate.clipId,
            mediaId: candidate.mediaId,
            startMs: candidate.startMs,
            endMs: candidate.endMs,
            score: candidate.score,
            matchedClaimIds: candidate.matchedClaimIds,
            reasons: candidate.reasons,
            observedText: (item?.observedText ?? "").slice(0, 400),
            textSummary: (item?.textSummary ?? "").slice(0, 200),
          },
          keyframes: keyframes.map((ref) => ({
            path: path.join(repoRoot, ref.path),
            relative: ref.path,
          })),
        });
      }
      const stagingPath = path.join(keyframeStaging, `${segment.id}-review.json`);
      fs.writeFileSync(
        stagingPath,
        JSON.stringify(
          {
            segmentId: segment.id,
            claimIds: segment.claimIds,
            claims: segment.claimIds.map((id) => ({id, claim: claimTextById.get(id) ?? ""})),
            narration: segment.narration,
            visualIntent: segment.visualIntent,
            candidates: staged,
          },
          null,
          2,
        ),
      );
      console.log(`verify ${segment.id}: 等待人工 keyframe 审阅 → ${stagingPath}`);
      continue;
    }
    const review = readJson<{
      verdict: "pass" | "reject" | "uncertain";
      clipId: string;
      relevance: number;
      claimMatch: number;
      visualQuality: number;
      misleadingRisk: number;
      observedActions: string[];
      observedEntities: string[];
      observedText: string[];
      recommendedStartMs: number;
      recommendedEndMs: number;
      reasons: string[];
    }>(reviewPath);
    const verifiedCandidate = result.candidates.find((entry) => entry.clipId === review.clipId);
    if (!verifiedCandidate) {
      throw new Error(`review 引用了不存在的候选 clip：${review.clipId}（${segment.id}）`);
    }
    const request = mediaRetrievalRequestSchema.parse({
      schemaVersion: "media-retrieval-request-v1",
      episodeId: EP,
      segmentId: segment.id,
      claimIds: segment.claimIds,
      narration: segment.narration,
      visualIntent: segment.visualIntent,
      topK: 25,
    });
    const retrievalOutcome = await retrieveMediaCandidates({
      repoRoot,
      episodeId: EP,
      request,
      cache: null,
      now: () => NOW,
    });
    await verifyMediaClip({
      repoRoot,
      episodeId: EP,
      request: {
        schemaVersion: "media-verification-request-v1",
        episodeId: EP,
        segmentId: segment.id,
        clipId: verifiedCandidate.clipId,
        claimIds: segment.claimIds,
        narration: segment.narration,
        visualIntent: segment.visualIntent,
        retrievalResultRef: retrievalOutcome.artifactRef,
        maxKeyframes: 4,
      },
      provider: {
        id: "human-keyframe-review",
        model: null,
        verificationVersion: "human-keyframe-review-v1",
        verify: async () => {
          const {
            clipId: _clipId,
            reviewer: _reviewer,
            reviewMethod: _method,
            reviewedAt: _at,
            ...output
          } = review;
          void _clipId;
          void _reviewer;
          void _method;
          void _at;
          return output;
        },
      },
      cache: null,
      now: () => NOW,
    });
    console.log(`verify ${segment.id}: ${review.verdict} (${verifiedCandidate.clipId})`);
  }

  /* 5. VisualSlot selection */
  for (const segment of script.segments) {
    await selectVisualSlotForSegment({
      repoRoot,
      episodeId: EP,
      segment: {
        segmentId: segment.id,
        claimIds: segment.claimIds,
        narration: segment.narration,
        visualIntent: segment.visualIntent,
        durationTargetMs: Math.round(segment.targetSeconds * 1000),
      },
      now: () => NOW,
    });
    const slot = readVisualSlot(repoRoot, EP, segment.id);
    console.log(
      `selection ${segment.id}: ${slot.selectedType}` +
        (slot.fallbackType
          ? ` fallback=${slot.fallbackType} (${slot.fallbackReason?.slice(0, 80)})`
          : "") +
        (slot.selectedMediaClipRef ? ` clip=${slot.selectedMediaClipRef.clipId}` : ""),
    );
  }

  /* 6. summary */
  const manifest = readMediaSourceManifest(repoRoot, EP);
  const events = readMediaEvents(repoRoot, EP);
  console.log("\n=== media pipeline summary ===");
  console.log(
    `sources: ${manifest.sources.length} (${manifest.sources.filter((s) => s.admissionStatus === "admitted").length} admitted, ${manifest.sources.filter((s) => s.rightsStatus === "approved").length} rights-approved)`,
  );
  console.log(`assets: ${manifest.assets.length}`);
  console.log(
    `events: ingest/normalize ${events.filter((e) => e.eventType.startsWith("media.ingest") || e.eventType.startsWith("media.normalize")).length}, index ${events.filter((e) => e.eventType.startsWith("media.index")).length}, retrieval ${events.filter((e) => e.eventType.startsWith("media.retrieval")).length}, verification ${events.filter((e) => e.eventType.startsWith("media.verification")).length}, selection ${events.filter((e) => e.eventType.startsWith("media.selection")).length}`,
  );
};

/* ------------------------------------------------------------------------- */

const resetStages = (): void => {
  // Resets regenerable media pipeline stage outputs only. Keeps: source
  // manifest, HumanDecisions, ingested assets, indexes, and human-authored
  // review files. Drops retrieval/verification/selection/shot/render-plan
  // artifacts and their artifact-index records so a re-run registers exactly
  // one consistent artifact per stage.
  const dropPrefixes = [
    `${EP}:media-retrieval:`,
    `${EP}:media-verification:`,
    `${EP}:media-visual-slot:`,
    `${EP}:media-shot:`,
    `${EP}:media:render-plan`,
  ];
  const indexPath = ep("artifact-index.json");
  if (fs.existsSync(indexPath)) {
    const index = readJson<{episodeId: string; artifacts: Array<{ref: {artifactId: string}}>}>(
      indexPath,
    );
    const kept = index.artifacts.filter(
      (record) => !dropPrefixes.some((prefix) => record.ref.artifactId.startsWith(prefix)),
    );
    fs.writeFileSync(indexPath, JSON.stringify({...index, artifacts: kept}, null, 2) + "\n");
  }
  for (const dir of [
    "candidates",
    "verifications",
    "selections",
    "shots",
    "render",
    "observability",
    "review-keyframes",
  ]) {
    fs.rmSync(ep("media", dir), {recursive: true, force: true});
  }
  console.log("media stage outputs reset (assets/indexes/decisions kept)");
};

const main = async (): Promise<void> => {
  if (phase === "propose") propose();
  else if (phase === "admit") admit();
  else if (phase === "reset-stages") resetStages();
  else if (phase === "pipeline") await pipeline();
  else throw new Error(`未知阶段：${phase}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
