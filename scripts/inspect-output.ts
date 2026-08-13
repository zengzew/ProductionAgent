import fs from "node:fs";
import path from "node:path";
import {measureCaptionDelivery, parseSrt} from "../src/lib/delivery";
import {parseFiniteNumber} from "../src/lib/process";
import {outputEpisodeRoot, writeJson} from "../src/lib/project";
import {expectedFrameRate, productionContract} from "../src/lib/production-contract";
import {runCommand} from "./lib/process";
import {finishValidation, installCliErrorHandlers, parseJsonText} from "./lib/validation";

installCliErrorHandlers();

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

const probe = (filePath: string): Probe =>
  parseJsonText<Probe>(
    runCommand("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath])
      .stdout,
    `ffprobe 输出 ${filePath}`,
  );

const maxVolume = (filePath: string): number => {
  const args = ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"];
  const result = runCommand("ffmpeg", args, {encoding: "utf8"});
  const match = result.stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/u);
  if (!match?.[1]) throw new Error(`无法读取音频峰值：${filePath}`);
  return parseFiniteNumber(match[1], `${filePath} 音频峰值`);
};

const expected = [
  {
    file: "vertical_9x16.mp4",
    width: productionContract.delivery.vertical.width,
    height: productionContract.delivery.vertical.height,
  },
];
const minimumDuration = productionContract.delivery.minimumSeconds;
const maximumDuration = productionContract.delivery.hardMaximumSeconds;
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
  const duration = parseFiniteNumber(metadata.format.duration, `${item.file} 时长`);
  const peakDb = maxVolume(filePath);
  if (video?.width !== item.width || video?.height !== item.height) {
    errors.push(`${item.file} 分辨率错误：${video?.width}x${video?.height}`);
  }
  if (video?.r_frame_rate !== expectedFrameRate()) {
    errors.push(`${item.file} 帧率错误：${video?.r_frame_rate}`);
  }
  if (!audio) errors.push(`${item.file} 缺少音轨`);
  if (duration < minimumDuration) {
    errors.push(`${item.file} 时长不得低于 ${minimumDuration} 秒：${duration}`);
  }
  if (duration > maximumDuration) {
    errors.push(`${item.file} 时长不得超过 ${maximumDuration} 秒：${duration}`);
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
  const measured = measureCaptionDelivery(
    cues,
    productionContract.captions.microCueThresholdSeconds,
  );
  captionInspection = {
    cues: cues.length,
    microCueThresholdSeconds: productionContract.captions.microCueThresholdSeconds,
    microCueCount: measured.microCueCount,
    microCueRatio: Number(measured.microCueRatio.toFixed(6)),
    microCueRatioLimit: productionContract.captions.microCueRatioLimit,
    minimumCueSeconds: Number(measured.minimumCueSeconds.toFixed(3)),
  };
  if (measured.microCueRatio > productionContract.captions.microCueRatioLimit) {
    errors.push(
      `小于 ${productionContract.captions.microCueThresholdSeconds} 秒字幕占比 ${(measured.microCueRatio * 100).toFixed(1)}%，超过 ${(productionContract.captions.microCueRatioLimit * 100).toFixed(0)}% 上限`,
    );
  }
}

writeJson(path.join(outputEpisodeRoot, "inspection.json"), {
  inspectedAt: new Date().toISOString(),
  inspections,
  captionInspection,
  errors,
});

if (errors.length === 0) console.log(JSON.stringify(inspections, null, 2));
finishValidation(errors, "output inspection passed");
