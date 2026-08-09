import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {measureCaptionDelivery, parseDeliveryGate, parseSrt} from "../src/lib/delivery";
import {
  captionPartsFromPlan,
  captionTextsEquivalent,
  fitCaptionPartsToDuration,
} from "../src/lib/captions";
import {episodeId, episodeRoot, outputEpisodeRoot, readJson, repoRoot} from "../src/lib/project";
import {captionPlanSchema, scriptSchema, timelineSchema} from "../src/schemas/episode";
import {assertTimelineMatchesEpisode, generatedCaptionsPath} from "../src/lib/render-contract";
import {
  assertTimelineMatchesProductionContract,
  productionContract,
} from "../src/lib/production-contract";

const reportPath = path.join(episodeRoot, "production/delivery-critic-report.md");
const videoPath = path.join(outputEpisodeRoot, "vertical_9x16.mp4");
const subtitlesPath = path.join(outputEpisodeRoot, "subtitles_zh.srt");
const timelinePath = path.join(episodeRoot, "production/timeline.json");
const inspectionPath = path.join(outputEpisodeRoot, "inspection.json");
const captionsPath = path.join(repoRoot, generatedCaptionsPath(episodeId));
const captionPlanPath = path.join(episodeRoot, "story/caption-plan.json");
const errors: string[] = [];

for (const requiredPath of [
  reportPath,
  videoPath,
  subtitlesPath,
  timelinePath,
  inspectionPath,
  captionsPath,
  captionPlanPath,
]) {
  if (!fs.existsSync(requiredPath)) errors.push(`Delivery Critic 缺少输入：${requiredPath}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const hashFile = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const relativePath = (filePath: string): string => path.relative(repoRoot, filePath);
const gate = parseDeliveryGate(fs.readFileSync(reportPath, "utf8"));

const expectedFiles = [
  [gate.reviewedVideo, videoPath],
  [gate.reviewedSubtitles, subtitlesPath],
  [gate.reviewedTimeline, timelinePath],
] as const;
for (const [declared, actualPath] of expectedFiles) {
  if (declared !== relativePath(actualPath)) {
    errors.push(`Delivery Critic 审核路径不匹配：${declared}`);
  }
}

const expectedHashes = [
  ["视频", gate.reviewedVideoSha256, hashFile(videoPath)],
  ["字幕", gate.reviewedSubtitlesSha256, hashFile(subtitlesPath)],
  ["时间轴", gate.reviewedTimelineSha256, hashFile(timelinePath)],
] as const;
for (const [label, declared, actual] of expectedHashes) {
  if (declared !== actual) errors.push(`Delivery Critic ${label} SHA-256 与当前产物不一致`);
}

const inspection = readJson<{errors: string[]}>(inspectionPath);
if (inspection.errors.length > 0) {
  errors.push(`output inspection 仍有错误：${inspection.errors.join("；")}`);
}

const script = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
const captionPlan = captionPlanSchema.parse(readJson<unknown>(captionPlanPath));
const captionPlanBySegment = new Map(
  captionPlan.segments.map((segment) => [segment.segmentId, segment.cues]),
);
const timeline = timelineSchema.parse(readJson<unknown>(timelinePath));
try {
  assertTimelineMatchesEpisode(timeline, episodeId);
  assertTimelineMatchesProductionContract(timeline);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}
if (timeline.totalSeconds >= productionContract.delivery.hardMaximumSeconds) {
  errors.push(
    `交付视频时长必须小于 ${productionContract.delivery.hardMaximumSeconds} 秒，当前 ${timeline.totalSeconds.toFixed(3)} 秒`,
  );
}
const generatedCaptions = readJson<Array<{sceneId: string; text: string}>>(captionsPath);
const actualByScene = new Map<string, string[]>();
for (const caption of generatedCaptions) {
  actualByScene.set(caption.sceneId, [...(actualByScene.get(caption.sceneId) ?? []), caption.text]);
}

let captionPlanMismatches = 0;
for (const segment of script.segments) {
  const timelineScene = timeline.scenes.find((scene) => scene.id === segment.id);
  const plannedCues = captionPlanBySegment.get(segment.id) ?? [];
  const expected = fitCaptionPartsToDuration(
    captionPartsFromPlan(
      segment.narration,
      plannedCues,
      productionContract.captions.maximumLineCharacters,
    ),
    timelineScene?.audioDurationSeconds ?? 0,
    productionContract.captions.microCueThresholdSeconds,
    productionContract.captions.maximumLineCharacters,
  ).map((part) => part.text);
  const actual = actualByScene.get(segment.id) ?? [];
  if (!captionTextsEquivalent(actual, expected)) {
    captionPlanMismatches += 1;
    errors.push(`${segment.id} 的成片字幕未按当前词边界算法生成`);
  }
}
if (gate.metrics.captionWordBreaks !== captionPlanMismatches) {
  errors.push(
    `Delivery Critic captionWordBreaks 应为 ${captionPlanMismatches}，当前 ${gate.metrics.captionWordBreaks}`,
  );
}
if (gate.metrics.englishWordBreaks !== 0) {
  errors.push("Delivery Critic 检出英文单词断裂");
}

const cues = parseSrt(fs.readFileSync(subtitlesPath, "utf8"));
if (
  gate.metrics.microCueThresholdSeconds !== productionContract.captions.microCueThresholdSeconds
) {
  errors.push("Delivery Critic microCueThresholdSeconds 与生产契约不一致");
}
if (gate.metrics.microCueRatioLimit !== productionContract.captions.microCueRatioLimit) {
  errors.push("Delivery Critic microCueRatioLimit 与生产契约不一致");
}
const measured = measureCaptionDelivery(cues, productionContract.captions.microCueThresholdSeconds);
const roundedRatio = Number(measured.microCueRatio.toFixed(6));
const roundedMinimum = Number(measured.minimumCueSeconds.toFixed(3));
if (gate.metrics.microCueCount !== measured.microCueCount) {
  errors.push(
    `Delivery Critic microCueCount 应为 ${measured.microCueCount}，当前 ${gate.metrics.microCueCount}`,
  );
}
if (Math.abs(gate.metrics.microCueRatio - roundedRatio) > 0.000001) {
  errors.push(
    `Delivery Critic microCueRatio 应为 ${roundedRatio}，当前 ${gate.metrics.microCueRatio}`,
  );
}
if (Math.abs(gate.metrics.minimumCueSeconds - roundedMinimum) > 0.001) {
  errors.push(
    `Delivery Critic minimumCueSeconds 应为 ${roundedMinimum}，当前 ${gate.metrics.minimumCueSeconds}`,
  );
}
if (measured.microCueRatio > productionContract.captions.microCueRatioLimit) {
  errors.push(
    `小于 ${productionContract.captions.microCueThresholdSeconds} 秒字幕占比 ${(measured.microCueRatio * 100).toFixed(1)}%，超过 ${(productionContract.captions.microCueRatioLimit * 100).toFixed(0)}% 上限`,
  );
}

const shouldPass =
  gate.blockers.length === 0 &&
  gate.returnTo === "none" &&
  gate.metrics.captionWordBreaks === 0 &&
  gate.metrics.englishWordBreaks === 0 &&
  gate.metrics.microCueRatio <= productionContract.captions.microCueRatioLimit &&
  gate.metrics.firstFrameZeroContextReadable &&
  !gate.metrics.speechClippingOrSwallowing;
if ((gate.verdict === "PASS") !== shouldPass) {
  errors.push("Delivery Critic verdict 与 blocker、人工审查或量化指标不一致");
}
if (gate.verdict !== "PASS") {
  errors.push(`Delivery Critic 未通过，当前状态不能标记 delivery-approved：${episodeId}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `delivery validation passed: cues=${cues.length}, micro=${measured.microCueCount} (${(
    measured.microCueRatio * 100
  ).toFixed(1)}%), minimum=${measured.minimumCueSeconds.toFixed(3)}s, status=delivery-approved`,
);
