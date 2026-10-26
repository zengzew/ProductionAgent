import fs from "node:fs";
import {selectVisualSlotForSegment} from "../../../src/media/select";
import {
  buildMediaRenderPlanForTimeline,
  assertMediaRenderPlanRenderable,
} from "../../../src/media/render";
import {
  buildMediaRenderManifest,
  assertMediaRenderManifestConsistent,
} from "../../../src/media/projection";
const repoRoot = process.cwd(),
  episodeId = "episode-012",
  root = `content/${episodeId}`;
const script = JSON.parse(fs.readFileSync(`${root}/story/script.json`, "utf8"));
const timeline = JSON.parse(fs.readFileSync(`${root}/production/timeline.json`, "utf8"));
const entries = JSON.parse(fs.readFileSync(`${root}/media/observations.json`, "utf8"));
for (const entry of entries) {
  const seg = script.segments.find((s: any) => s.id === entry.segmentId),
    scene = timeline.scenes.find((s: any) => s.id === seg.id);
  const result = await selectVisualSlotForSegment({
    repoRoot,
    episodeId,
    segment: {
      segmentId: seg.id,
      claimIds: seg.claimIds,
      narration: seg.narration,
      visualIntent: seg.visualIntent,
      durationTargetMs: Math.round((scene.durationFrames / 30) * 1000),
    },
  });
  if (result.selectedType !== "real-media")
    throw new Error(`Expected checked real media ${seg.id}`);
}
const labels: Record<string, string> = {
  "seg-001": "Photoroom官网｜官方宣传演示 · 非本次实测",
  "seg-002": "2024-04-25 本人访谈回忆｜照片：Stripe",
  "seg-003": "创始人历史回忆｜两周首版，不是今日全部功能",
  "seg-004": "当前官网入口/演示｜不同示例 · 非本次生成",
  "seg-005": "Stripe 2023-04-07｜创始人设计取向＋官网示例",
  "seg-006": "增长负责人2023访谈｜配官网演示 · 非TikTok实录",
  "seg-007": "增长负责人2023访谈｜创作者合作与广告素材",
  "seg-008": "Photoroom公司公告 2024-02-27｜B轮融资",
  "seg-009": "官方宣传演示｜商品展示用途 · 编辑归纳",
};
const overlaysBySegment = Object.fromEntries(
  Object.entries(labels).map(([id, sourceLabel]) => [id, {sourceLabel, badge: null}]),
);
const plan = buildMediaRenderPlanForTimeline({
  repoRoot,
  episodeId,
  audio: {originalAudioGain: 0, narrationGain: 1},
  fade: {inMs: 0, outMs: 0},
  crossfadeMs: 0,
  overlaysBySegment,
});
assertMediaRenderPlanRenderable({repoRoot, episodeId});
const projection = buildMediaRenderManifest({repoRoot, episodeId});
assertMediaRenderManifestConsistent({repoRoot, episodeId});
console.log(
  JSON.stringify({
    seconds: plan.totalSeconds,
    shots: plan.shots.map((s) => ({id: s.segmentId, type: s.visualType})),
    projection: projection.artifactRef.sha256,
  }),
);
