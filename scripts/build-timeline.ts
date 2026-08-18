import fs from "node:fs";
import path from "node:path";
import {
  alignCaptionPartsToTimestamps,
  captionPartsFromPlan,
  fitCaptionPartsToDuration,
  formatSrtTime,
} from "../src/lib/delivery/captions";
import {episodeConfigSchema} from "../src/schemas/episode";
import type {TtsMetadata} from "../src/lib/delivery/tts-providers";
import {
  episodeId,
  episodeRoot,
  outputEpisodeRoot,
  publicEpisodeRoot,
  repoRoot,
  writeJson,
} from "../src/lib/episode/paths";
import {
  generatedCaptionsPath,
  getRenderContract,
  publicCaptionsRepositoryPath,
  publicTimelineRepositoryPath,
} from "../src/lib/episode/render-contract";
import {
  assertEpisodeMatchesProductionContract,
  productionContract,
  timelineTailSeconds,
} from "../src/lib/episode/production-contract";
import {probeMediaDuration} from "./lib/process";
import {installCliErrorHandlers, readCaptionPlan, readJsonFile, readScript} from "./lib/validation";

installCliErrorHandlers();

const renderContract = getRenderContract(episodeId);
const fps = productionContract.delivery.fps;
const episodeConfig = episodeConfigSchema.parse(
  readJsonFile<unknown>(path.join(episodeRoot, "episode.config.json")),
);
assertEpisodeMatchesProductionContract(episodeConfig);
const script = readScript(path.join(episodeRoot, "story/script.json"));
const captionPlan = readCaptionPlan(path.join(episodeRoot, "story/caption-plan.json"));
const captionPlanBySegment = new Map(
  captionPlan.segments.map((segment) => [segment.segmentId, segment.cues]),
);
if (
  captionPlanBySegment.size !== captionPlan.segments.length ||
  captionPlanBySegment.size !== script.segments.length
) {
  throw new Error("字幕规划必须与脚本段落一一对应，且 segmentId 不得重复");
}
const ttsMetadata = readJsonFile<TtsMetadata>(
  path.join(episodeRoot, "production/tts-metadata.json"),
);
const ttsFilesBySegment = new Map(ttsMetadata.files.map((file) => [file.segmentId, file]));

let cursorSeconds = 0;
let captionIndex = 1;
const captions: Array<{
  index: number;
  sceneId: string;
  startSeconds: number;
  endSeconds: number;
  startFrame: number;
  endFrame: number;
  text: string;
}> = [];

const scenes = script.segments.map((segment, index) => {
  const absoluteAudio = path.join(publicEpisodeRoot, "audio", `${segment.id}.mp3`);
  if (!fs.existsSync(absoluteAudio)) throw new Error(`缺少 TTS 音频：${absoluteAudio}`);
  const audioDurationSeconds = probeMediaDuration(absoluteAudio);
  const startSeconds = cursorSeconds;
  const tailSeconds = timelineTailSeconds(episodeConfig, segment);
  const endSeconds = startSeconds + audioDurationSeconds + tailSeconds;
  const startFrame = Math.round(startSeconds * fps);
  const durationFrames = Math.max(1, Math.round((audioDurationSeconds + tailSeconds) * fps));
  const plannedCues = captionPlanBySegment.get(segment.id);
  if (!plannedCues) throw new Error(`字幕规划缺少段落：${segment.id}`);
  const parts = fitCaptionPartsToDuration(
    captionPartsFromPlan(
      segment.narration,
      plannedCues,
      productionContract.captions.maximumLineCharacters,
    ),
    audioDurationSeconds,
    productionContract.captions.microCueThresholdSeconds,
    productionContract.captions.maximumLineCharacters,
  );
  const timestampParts = ttsFilesBySegment.get(segment.id)?.timestamps;
  const providerAligned = timestampParts
    ? alignCaptionPartsToTimestamps(parts, timestampParts, audioDurationSeconds)
    : undefined;
  const totalWeight = parts.reduce((total, part) => total + part.weight, 0);
  let proportionalCursor = 0;

  for (const [partIndex, part] of parts.entries()) {
    const aligned = providerAligned?.[partIndex];
    const proportionalDuration = (audioDurationSeconds * part.weight) / totalWeight;
    const relativeStart = aligned?.startSeconds ?? proportionalCursor;
    const relativeEnd = aligned?.endSeconds ?? proportionalCursor + proportionalDuration;
    const captionStart = startSeconds + relativeStart;
    const captionEnd = Math.min(startSeconds + audioDurationSeconds, startSeconds + relativeEnd);
    captions.push({
      index: captionIndex,
      sceneId: segment.id,
      startSeconds: captionStart,
      endSeconds: captionEnd,
      startFrame: Math.round(captionStart * fps),
      endFrame: Math.max(Math.round(captionStart * fps) + 1, Math.round(captionEnd * fps)),
      text: part.text,
    });
    captionIndex += 1;
    proportionalCursor += proportionalDuration;
  }

  cursorSeconds = endSeconds;
  return {
    ...segment,
    index,
    startFrame,
    durationFrames,
    startSeconds,
    endSeconds,
    audioDurationSeconds,
    audio: `episodes/${episodeId}/audio/${segment.id}.mp3`,
  };
});

const totalFrames = Math.ceil(cursorSeconds * fps);
const timeline = {
  episodeId,
  layoutVariant: renderContract.layoutVariant,
  fps,
  totalFrames,
  totalSeconds: totalFrames / fps,
  ttsProvider: ttsMetadata.provider,
  captionAlignment:
    ttsMetadata.alignmentStrategy === "provider-timestamps" &&
    script.segments.every((segment) => ttsFilesBySegment.get(segment.id)?.timestamps?.length)
      ? "provider-timestamps"
      : "caption-plan-proportional",
  scenes,
};

const srt = captions
  .map(
    (caption) =>
      `${caption.index}\n${formatSrtTime(caption.startSeconds)} --> ${formatSrtTime(
        caption.endSeconds,
      )}\n${caption.text}\n`,
  )
  .join("\n");

writeJson(path.join(episodeRoot, "production/timeline.json"), timeline);
writeJson(path.join(repoRoot, generatedCaptionsPath(episodeId)), captions);
writeJson(path.join(repoRoot, publicTimelineRepositoryPath(episodeId)), timeline);
writeJson(path.join(repoRoot, publicCaptionsRepositoryPath(episodeId)), captions);
fs.mkdirSync(outputEpisodeRoot, {recursive: true});
fs.writeFileSync(path.join(outputEpisodeRoot, "subtitles_zh.srt"), srt);

console.log(
  `timeline complete: ${scenes.length} scenes, ${captions.length} captions, ${timeline.totalSeconds.toFixed(
    3,
  )}s`,
);
