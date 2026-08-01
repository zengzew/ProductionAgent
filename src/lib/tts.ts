import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {loadTtsConfig, type TtsConfig} from "./pipeline-config";
import {ensureDir, repoRoot, writeJson} from "./project";
import type {Script} from "../schemas/episode";

export type SpeechTimestamp = {
  text: string;
  startMs: number;
  endMs: number;
};

export type TtsGenerationOptions = {
  audioDirectory: string;
  metadataPath?: string;
  publicPathForFile?: (absolutePath: string) => string;
};

export type TtsMetadata = {
  requestedProvider: "Microsoft Edge neural TTS";
  provider: "Microsoft Edge neural TTS";
  providerId: "edge";
  fallbackUsed: false;
  fallbackReason: "";
  preview: false;
  generatedAt: string;
  voice: "zh-CN-YunjianNeural";
  rate: "+25%";
  pitch: "-2Hz";
  normalization: string;
  credentialRequired: false;
  networkRequired: true;
  alignmentStrategy: "provider-timestamps" | "caption-plan-proportional";
  files: Array<{
    segmentId: string;
    file: string;
    timestamps?: SpeechTimestamp[];
  }>;
};

const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, {cwd: repoRoot, encoding: "utf8"});
  if (result.status !== 0) {
    throw new Error(
      `${command} 失败：${result.stderr || result.stdout || `exit ${result.status ?? "unknown"}`}`,
    );
  }
};

const normalize = (
  input: string,
  output: string,
  normalization: TtsConfig["normalization"],
): void => {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-af",
    `loudnorm=I=${normalization.integratedLufs}:TP=${normalization.truePeakDb}:LRA=${normalization.loudnessRange}`,
    "-ar",
    String(normalization.sampleRate),
    "-ac",
    "1",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    normalization.bitrate,
    output,
  ]);
};

export const generateTtsForScript = async (
  script: Script,
  options: TtsGenerationOptions,
): Promise<TtsMetadata> => {
  const config = loadTtsConfig();
  const edgeTtsExecutable = path.join(repoRoot, ".venv/bin/edge-tts");
  if (!fs.existsSync(edgeTtsExecutable)) {
    throw new Error(
      `缺少 ${edgeTtsExecutable}\n请执行 python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`,
    );
  }

  ensureDir(options.audioDirectory);
  const files: TtsMetadata["files"] = [];
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "poke-edge-tts-"));
  try {
    for (const segment of script.segments) {
      const raw = path.join(tempDirectory, `${segment.id}.raw.mp3`);
      const output = path.join(options.audioDirectory, `${segment.id}.mp3`);
      run(edgeTtsExecutable, [
        "--voice",
        config.profile.voice,
        `--rate=${config.profile.rate}`,
        `--pitch=${config.profile.pitch}`,
        "--text",
        segment.narration,
        "--write-media",
        raw,
      ]);
      normalize(raw, output, config.normalization);
      files.push({
        segmentId: segment.id,
        file: options.publicPathForFile?.(output) ?? output,
      });
    }
  } finally {
    fs.rmSync(tempDirectory, {recursive: true, force: true});
  }

  const metadata: TtsMetadata = {
    requestedProvider: config.profile.label,
    provider: config.profile.label,
    providerId: "edge",
    fallbackUsed: false,
    fallbackReason: "",
    preview: false,
    generatedAt: new Date().toISOString(),
    voice: config.profile.voice,
    rate: config.profile.rate,
    pitch: config.profile.pitch,
    normalization: `loudnorm I=${config.normalization.integratedLufs} TP=${config.normalization.truePeakDb} LRA=${config.normalization.loudnessRange}`,
    credentialRequired: false,
    networkRequired: true,
    alignmentStrategy: "caption-plan-proportional",
    files,
  };
  if (options.metadataPath) writeJson(options.metadataPath, metadata);
  return metadata;
};
