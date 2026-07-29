import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {captionPartsFromPlan, fitCaptionPartsToDuration, formatSrtTime} from "../src/lib/captions";
import {captionPlanSchema, scriptSchema} from "../src/schemas/episode";
import {
  episodeRoot,
  outputEpisodeRoot,
  publicEpisodeRoot,
  readJson,
  repoRoot,
  writeJson,
} from "../src/lib/project";

const fps = 30;
const tailSeconds = 0.35;
const script = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
const captionPlan = captionPlanSchema.parse(
  readJson<unknown>(path.join(episodeRoot, "story/caption-plan.json")),
);
const captionPlanBySegment = new Map(
  captionPlan.segments.map((segment) => [segment.segmentId, segment.cues]),
);
if (
  captionPlanBySegment.size !== captionPlan.segments.length ||
  captionPlanBySegment.size !== script.segments.length
) {
  throw new Error("字幕规划必须与脚本段落一一对应，且 segmentId 不得重复");
}
const ttsMetadata = readJson<{provider: string}>(
  path.join(episodeRoot, "production/tts-metadata.json"),
);

const probeDuration = (filePath: string): number => {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    {encoding: "utf8"},
  );
  if (result.status !== 0) throw new Error(`ffprobe 失败：${filePath}\n${result.stderr}`);
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`无效音频时长：${filePath}`);
  return duration;
};

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
  const audioDurationSeconds = probeDuration(absoluteAudio);
  const startSeconds = cursorSeconds;
  const endSeconds = startSeconds + audioDurationSeconds + tailSeconds;
  const startFrame = Math.round(startSeconds * fps);
  const durationFrames = Math.max(1, Math.round((audioDurationSeconds + tailSeconds) * fps));
  const plannedCues = captionPlanBySegment.get(segment.id);
  if (!plannedCues) throw new Error(`字幕规划缺少段落：${segment.id}`);
  const parts = fitCaptionPartsToDuration(
    captionPartsFromPlan(segment.narration, plannedCues),
    audioDurationSeconds,
  );
  const totalWeight = parts.reduce((total, part) => total + part.weight, 0);
  let captionCursor = startSeconds;

  for (const part of parts) {
    const proportionalDuration = (audioDurationSeconds * part.weight) / totalWeight;
    const captionEnd = Math.min(
      startSeconds + audioDurationSeconds,
      captionCursor + proportionalDuration,
    );
    captions.push({
      index: captionIndex,
      sceneId: segment.id,
      startSeconds: captionCursor,
      endSeconds: captionEnd,
      startFrame: Math.round(captionCursor * fps),
      endFrame: Math.max(Math.round(captionCursor * fps) + 1, Math.round(captionEnd * fps)),
      text: part.text,
    });
    captionIndex += 1;
    captionCursor = captionEnd;
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
    audio: `episodes/episode-001/audio/${segment.id}.mp3`,
  };
});

const totalFrames = Math.ceil(cursorSeconds * fps);
const timeline = {
  fps,
  totalFrames,
  totalSeconds: totalFrames / fps,
  ttsProvider: ttsMetadata.provider,
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
writeJson(path.join(repoRoot, "src/poke-timeline.generated.json"), timeline);
writeJson(path.join(repoRoot, "src/poke-captions.generated.json"), captions);
fs.mkdirSync(outputEpisodeRoot, {recursive: true});
fs.writeFileSync(path.join(outputEpisodeRoot, "subtitles_zh.srt"), srt);

console.log(
  `timeline complete: ${scenes.length} scenes, ${captions.length} captions, ${timeline.totalSeconds.toFixed(
    3,
  )}s`,
);
