import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {measureCaptionDelivery, parseSrt} from "../src/lib/delivery";
import {episodeConfigSchema} from "../src/schemas/episode";
import {episodeRoot, outputEpisodeRoot, readJson, writeJson} from "../src/lib/project";

type Probe = {
  format: {duration: string; format_name: string};
  streams: Array<{
    codec_type: "video" | "audio";
    codec_name: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    sample_rate?: string;
  }>;
};

const run = (command: string, args: string[]): {stdout: string; stderr: string} => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) {
    throw new Error(`${command} 失败：${result.stderr || result.stdout}`);
  }
  return {stdout: result.stdout, stderr: result.stderr};
};

const probe = (filePath: string): Probe =>
  JSON.parse(
    run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath])
      .stdout,
  ) as Probe;

const maxVolume = (filePath: string): number => {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"],
    {encoding: "utf8"},
  );
  const match = result.stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/u);
  if (!match?.[1]) throw new Error(`无法读取音频峰值：${filePath}`);
  return Number.parseFloat(match[1]);
};

const expected = [{file: "vertical_9x16.mp4", width: 1080, height: 1920}];
const episodeConfig = episodeConfigSchema.parse(
  readJson<unknown>(path.join(episodeRoot, "episode.config.json")),
);
const maximumDuration = episodeConfig.hardMaximumSeconds;
const inspections: Array<Record<string, unknown>> = [];
const errors: string[] = [];
let captionInspection: Record<string, unknown> | undefined;

for (const item of expected) {
  const filePath = path.join(outputEpisodeRoot, item.file);
  if (!fs.existsSync(filePath)) {
    errors.push(`缺少输出 ${item.file}`);
    continue;
  }
  const metadata = probe(filePath);
  const video = metadata.streams.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number.parseFloat(metadata.format.duration);
  const peakDb = maxVolume(filePath);
  if (video?.width !== item.width || video?.height !== item.height) {
    errors.push(`${item.file} 分辨率错误：${video?.width}x${video?.height}`);
  }
  if (video?.r_frame_rate !== "30/1") {
    errors.push(`${item.file} 帧率错误：${video?.r_frame_rate}`);
  }
  if (!audio) errors.push(`${item.file} 缺少音轨`);
  if (duration >= maximumDuration) {
    errors.push(`${item.file} 时长必须小于 ${maximumDuration} 秒：${duration}`);
  }
  if (peakDb > -0.1) {
    errors.push(`${item.file} 音频可能削波：${peakDb} dB`);
  }
  inspections.push({
    file: item.file,
    duration,
    width: video?.width,
    height: video?.height,
    frameRate: video?.r_frame_rate,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    audioSampleRate: audio?.sample_rate,
    peakDb,
  });
}

const subtitlesPath = path.join(outputEpisodeRoot, "subtitles_zh.srt");
if (!fs.existsSync(subtitlesPath)) {
  errors.push("缺少输出 subtitles_zh.srt");
} else {
  const cues = parseSrt(fs.readFileSync(subtitlesPath, "utf8"));
  const measured = measureCaptionDelivery(cues);
  captionInspection = {
    cues: cues.length,
    microCueThresholdSeconds: 1,
    microCueCount: measured.microCueCount,
    microCueRatio: Number(measured.microCueRatio.toFixed(6)),
    microCueRatioLimit: 0.1,
    minimumCueSeconds: Number(measured.minimumCueSeconds.toFixed(3)),
  };
  if (measured.microCueRatio > 0.1) {
    errors.push(`小于 1 秒字幕占比 ${(measured.microCueRatio * 100).toFixed(1)}%，超过 10% 上限`);
  }
}

writeJson(path.join(outputEpisodeRoot, "inspection.json"), {
  inspectedAt: new Date().toISOString(),
  inspections,
  captionInspection,
  errors,
});

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify(inspections, null, 2));
console.log("output inspection passed");
