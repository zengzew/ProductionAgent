import fs from "node:fs";
import path from "node:path";
import {
  findCaptionSemanticBoundaryIssues,
  type CaptionSemanticIssueKind,
} from "../src/lib/delivery/captions";
import {measureCaptionDelivery, parseDeliveryGate, parseSrt} from "../src/lib/delivery/delivery";
import {episodeId, episodeRoot, outputEpisodeRoot, repoRoot} from "../src/lib/episode/paths";
import {
  assertTimelineMatchesEpisode,
  generatedCaptionsPath,
  getRenderContract,
} from "../src/lib/episode/render-contract";
import {assertMediaDeliveryGate} from "../src/media/delivery-gate";
import {
  assertTimelineMatchesProductionContract,
  productionContract,
} from "../src/lib/episode/production-contract";
import {captionPlanMismatchIds} from "./lib/caption-artifacts";
import {
  fatal,
  finishValidation,
  groupCaptionTextsByScene,
  hashFile,
  installCliErrorHandlers,
  readCaptionPlan,
  readGeneratedCaptions,
  readJsonFile,
  readScript,
  readTimeline,
  ValidationErrors,
} from "./lib/validation";

installCliErrorHandlers();

const reportPath = path.join(episodeRoot, "production/delivery-critic-report.md");
const videoPath = path.join(outputEpisodeRoot, "vertical_9x16.mp4");
const subtitlesPath = path.join(outputEpisodeRoot, "subtitles_zh.srt");
const timelinePath = path.join(episodeRoot, "production/timeline.json");
const inspectionPath = path.join(outputEpisodeRoot, "inspection.json");
const captionsPath = path.join(repoRoot, generatedCaptionsPath(episodeId));
const captionPlanPath = path.join(episodeRoot, "story/caption-plan.json");
const errors = new ValidationErrors();

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

if (errors.length > 0) fatal(errors);
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

const inspection = readJsonFile<{errors: string[]}>(inspectionPath);
if (inspection.errors.length > 0) {
  errors.push(`output inspection 仍有错误：${inspection.errors.join("；")}`);
}
if (getRenderContract(episodeId).renderer === "media-mix") {
  errors.capture(() => {
    assertMediaDeliveryGate({
      repoRoot,
      episodeId,
      inspectionPath,
      requireObservabilityComplete: false,
    });
  });
}

const script = readScript(path.join(episodeRoot, "story/script.json"));
const captionPlan = readCaptionPlan(captionPlanPath);
const timeline = readTimeline(timelinePath);
errors.capture(() => {
  assertTimelineMatchesEpisode(timeline, episodeId);
  assertTimelineMatchesProductionContract(timeline);
});
if (timeline.totalSeconds < productionContract.delivery.minimumSeconds) {
  errors.push(
    `交付视频时长不得低于 ${productionContract.delivery.minimumSeconds} 秒，当前 ${timeline.totalSeconds.toFixed(3)} 秒`,
  );
}
if (timeline.totalSeconds > productionContract.delivery.hardMaximumSeconds) {
  errors.push(
    `交付视频时长不得超过 ${productionContract.delivery.hardMaximumSeconds} 秒，当前 ${timeline.totalSeconds.toFixed(3)} 秒`,
  );
}
const generatedCaptions = readGeneratedCaptions(captionsPath);
const cues = parseSrt(fs.readFileSync(subtitlesPath, "utf8"));
const srtMatchesGeneratedCaptions =
  cues.length === generatedCaptions.length &&
  cues.every(
    (cue, index) => cue.index === index + 1 && cue.text === generatedCaptions[index]?.text,
  );
if (!srtMatchesGeneratedCaptions) {
  errors.push("最终 SRT 与当前 generated captions 不一致");
}
const captionMismatchIds = captionPlanMismatchIds({
  script,
  captionPlan,
  timeline,
  generatedCaptions,
  maximumLineCharacters: productionContract.captions.maximumLineCharacters,
  microCueThresholdSeconds: productionContract.captions.microCueThresholdSeconds,
});
for (const segmentId of captionMismatchIds) {
  errors.push(`${segmentId} 的成片字幕未按当前词边界算法生成`);
}
const captionPlanMismatches = captionMismatchIds.length;
if (gate.metrics.captionWordBreaks !== captionPlanMismatches) {
  errors.push(
    `Delivery Critic captionWordBreaks 应为 ${captionPlanMismatches}，当前 ${gate.metrics.captionWordBreaks}`,
  );
}
if (gate.metrics.englishWordBreaks !== 0) {
  errors.push("Delivery Critic 检出英文单词断裂");
}

const semanticIssueLabels: Record<CaptionSemanticIssueKind, string> = {
  "subject-predicate": "主谓断裂",
  "modifier-object": "修饰语或对象断裂",
  "dangling-transition": "转折词悬空",
  "dangling-condition": "条件词悬空",
  "english-proper-noun": "英文专名断裂",
};
const generatedCaptionsByScene = groupCaptionTextsByScene(generatedCaptions);
let semanticIssueCount = 0;
let captionOffset = 0;
for (const segment of script.segments) {
  const segmentCaptionTexts = generatedCaptionsByScene.get(segment.id) ?? [];
  const segmentCaptionOffset = captionOffset;
  captionOffset += segmentCaptionTexts.length;
  errors.capture(() => {
    const issues = findCaptionSemanticBoundaryIssues(segment.narration, segmentCaptionTexts);
    semanticIssueCount += issues.length;
    for (const issue of issues) {
      const leftCueIndex = segmentCaptionOffset + issue.boundaryAfterCue;
      const rightCueIndex = issue.rightCue ? leftCueIndex + 1 : undefined;
      const leftSrtCue = cues[leftCueIndex - 1];
      const rightSrtCue = rightCueIndex ? cues[rightCueIndex - 1] : undefined;
      const boundary = rightCueIndex
        ? `SRT cue ${leftCueIndex}-${rightCueIndex}`
        : `SRT cue ${leftCueIndex}`;
      const timeRange = leftSrtCue
        ? `（${leftSrtCue.startSeconds.toFixed(3)}-${(rightSrtCue ?? leftSrtCue).endSeconds.toFixed(3)} 秒）`
        : "";
      const displayedBoundary = issue.rightCue
        ? `“${issue.leftCue.replace(/\s+/gu, " ")}” / “${issue.rightCue.replace(/\s+/gu, " ")}”`
        : `“${issue.leftCue.replace(/\s+/gu, " ")}”`;
      errors.push(
        `${segment.id} ${boundary}${timeRange} 存在${semanticIssueLabels[issue.kind]}：${displayedBoundary}`,
      );
    }
  });
}

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
  srtMatchesGeneratedCaptions &&
  semanticIssueCount === 0 &&
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

finishValidation(
  errors,
  `delivery validation passed: cues=${cues.length}, semantic=${semanticIssueCount}, micro=${measured.microCueCount} (${(
    measured.microCueRatio * 100
  ).toFixed(1)}%), minimum=${measured.minimumCueSeconds.toFixed(3)}s, status=delivery-approved`,
);
