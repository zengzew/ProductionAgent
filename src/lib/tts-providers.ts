import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {loadTtsV2Config, type TtsV2Config} from "./pipeline-v2-config";
import {fetchWithRetry, type RetryableFetchOptions} from "./network";
import {ensureDir, repoRoot, writeJson} from "./project";
import type {Script} from "../schemas/episode";

export type SpeechTimestamp = {text: string; startMs: number; endMs: number};
type ProviderId = "minimax" | "edge";
type ProviderResult = {timestamps?: SpeechTimestamp[]};

export interface ChineseTtsProvider {
  id: ProviderId;
  label: string;
  voice: string;
  speed: number;
  pitch: string | number;
  credentialRequired: boolean;
  splitBySentence: boolean;
  synthesize(text: string, outputPath: string): Promise<ProviderResult>;
}

export type TtsGenerationOptions = {
  requestedProvider?: ProviderId;
  allowFallback?: boolean;
  audioDirectory: string;
  metadataPath?: string;
  publicPathForFile?: (absolutePath: string) => string;
  network?: RetryableFetchOptions;
};

export type TtsMetadata = {
  requestedProvider: string;
  provider: string;
  providerId: ProviderId;
  fallbackUsed: boolean;
  fallbackReason: string;
  generatedAt: string;
  voice: string;
  speed: number;
  pitch: string | number;
  normalization: string;
  credentialRequired: boolean;
  networkRequired: true;
  alignmentStrategy: "provider-timestamps" | "caption-plan-proportional";
  files: Array<{
    segmentId: string;
    file: string;
    timestamps?: SpeechTimestamp[];
    timestampSource?: string;
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

const durationMs = (file: string): number => {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    {encoding: "utf8"},
  );
  const seconds = Number.parseFloat(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe 无法读取音频：${file}`);
  }
  return Math.round(seconds * 1000);
};

export const splitSpeechSentences = (text: string): string[] =>
  (text.match(/[^。！？!?]+[。！？!?]?/gu) ?? []).map((part) => part.trim()).filter(Boolean);

const numberValue = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export const parseProviderTimestamps = (value: unknown): SpeechTimestamp[] => {
  const output: SpeechTimestamp[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const text = record.text ?? record.content ?? record.word ?? record.subtitle;
    const startMs = numberValue(record, [
      "start_ms",
      "startMs",
      "start_time",
      "startTime",
      "time_begin",
      "begin_time",
    ]);
    const endMs = numberValue(record, [
      "end_ms",
      "endMs",
      "end_time",
      "endTime",
      "time_end",
      "finish_time",
    ]);
    if (
      typeof text === "string" &&
      startMs !== undefined &&
      endMs !== undefined &&
      endMs > startMs
    ) {
      output.push({text, startMs, endMs});
    } else {
      Object.values(record).forEach(visit);
    }
  };
  visit(value);
  return output.sort((left, right) => left.startMs - right.startMs);
};

const edgeProvider = (config: TtsV2Config): ChineseTtsProvider => ({
  id: "edge",
  label: config.providers.edge.label,
  voice: config.providers.edge.voice,
  speed: config.providers.edge.speed,
  pitch: config.providers.edge.pitch,
  credentialRequired: false,
  splitBySentence: false,
  async synthesize(text, output) {
    const executable = path.join(repoRoot, ".venv/bin/edge-tts");
    if (!fs.existsSync(executable)) throw new Error(`缺少 ${executable}`);
    const rate = Math.round((config.providers.edge.speed - 1) * 100);
    run(executable, [
      "--voice",
      config.providers.edge.voice,
      `--rate=${rate >= 0 ? "+" : ""}${rate}%`,
      `--pitch=${config.providers.edge.pitch}`,
      "--text",
      text,
      "--write-media",
      output,
    ]);
    return {};
  },
});

export const createMinimaxProvider = (
  config: TtsV2Config,
  network?: RetryableFetchOptions,
): ChineseTtsProvider => {
  const settings = config.providers.minimax;
  return {
    id: "minimax",
    label: settings.label,
    voice: settings.voice,
    speed: settings.speed,
    pitch: settings.pitch,
    credentialRequired: true,
    splitBySentence: true,
    async synthesize(text, output) {
      const key = process.env[settings.apiKeyEnv];
      if (!key) throw new Error(`缺少环境变量 ${settings.apiKeyEnv}`);
      const response = await fetchWithRetry(
        settings.endpoint,
        {
          method: "POST",
          headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
          body: JSON.stringify({
            model: settings.model,
            text,
            stream: false,
            voice_setting: {
              voice_id: settings.voice,
              speed: settings.speed,
              vol: settings.volume,
              pitch: settings.pitch,
            },
            audio_setting: {sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1},
            language_boost: settings.languageBoost,
            subtitle_enable: settings.requestTimestamps,
            subtitle_type: "word",
            output_format: "hex",
          }),
        },
        network,
      );
      const body = (await response.json()) as {
        data?: {audio?: string; subtitle_file?: string};
        base_resp?: {status_code?: number; status_msg?: string};
      };
      if (!response.ok || body.base_resp?.status_code !== 0 || !body.data?.audio) {
        throw new Error(
          `MiniMax TTS 失败：${body.base_resp?.status_msg ?? `HTTP ${response.status}`}`,
        );
      }
      fs.writeFileSync(output, Buffer.from(body.data.audio, "hex"));
      if (!body.data.subtitle_file) return {};
      const subtitle = await fetchWithRetry(body.data.subtitle_file, {}, network);
      if (!subtitle.ok) return {};
      const timestamps = parseProviderTimestamps(await subtitle.json());
      return timestamps.length ? {timestamps} : {};
    },
  };
};

const providerFor = (
  id: ProviderId,
  config: TtsV2Config,
  network?: RetryableFetchOptions,
): ChineseTtsProvider =>
  id === "minimax" ? createMinimaxProvider(config, network) : edgeProvider(config);

export type TtsProviderSelection = {
  providerId: ProviderId;
  fallbackUsed: boolean;
  fallbackReason: string;
};

export const selectTtsProvider = (input: {
  requestedProvider: ProviderId;
  hasCredential: boolean;
  allowFallback: boolean;
  fallbackOnMissingCredential: boolean;
}): TtsProviderSelection => {
  if (
    input.requestedProvider === "minimax" &&
    !input.hasCredential &&
    input.allowFallback &&
    input.fallbackOnMissingCredential
  ) {
    return {
      providerId: "edge",
      fallbackUsed: true,
      fallbackReason: "missing MiniMax credential",
    };
  }
  return {providerId: input.requestedProvider, fallbackUsed: false, fallbackReason: ""};
};

export const runTtsWithFallback = async <T>(input: {
  requestedProvider: ProviderId;
  provider: ChineseTtsProvider;
  fallbackProvider: ChineseTtsProvider;
  allowFallback: boolean;
  fallbackOnError: boolean;
  run: (provider: ChineseTtsProvider) => Promise<T>;
}): Promise<{
  value: T;
  provider: ChineseTtsProvider;
  fallbackUsed: boolean;
  fallbackReason: string;
}> => {
  try {
    return {
      value: await input.run(input.provider),
      provider: input.provider,
      fallbackUsed: false,
      fallbackReason: "",
    };
  } catch (error) {
    if (
      input.provider.id === "edge" ||
      input.requestedProvider === "edge" ||
      !input.allowFallback ||
      !input.fallbackOnError
    ) {
      throw error;
    }
    const fallbackReason = error instanceof Error ? error.message : String(error);
    return {
      value: await input.run(input.fallbackProvider),
      provider: input.fallbackProvider,
      fallbackUsed: true,
      fallbackReason,
    };
  }
};

const concatenate = (parts: string[], output: string, directory: string): void => {
  if (parts.length === 1) return fs.copyFileSync(parts[0]!, output);
  const manifest = path.join(directory, "concat.txt");
  fs.writeFileSync(
    manifest,
    `${parts.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n")}\n`,
  );
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifest,
    "-c",
    "copy",
    output,
  ]);
};

const normalize = (input: string, output: string, config: TtsV2Config): void =>
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-af",
    `loudnorm=I=${config.normalization.integratedLufs}:TP=${config.normalization.truePeakDb}:LRA=${config.normalization.loudnessRange}`,
    "-ar",
    String(config.normalization.sampleRate),
    "-ac",
    "1",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    config.normalization.bitrate,
    output,
  ]);

const generateFiles = async (
  script: Script,
  provider: ChineseTtsProvider,
  config: TtsV2Config,
  options: TtsGenerationOptions,
): Promise<TtsMetadata["files"]> => {
  ensureDir(options.audioDirectory);
  const files: TtsMetadata["files"] = [];
  for (const segment of script.segments) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `tts-${provider.id}-`));
    try {
      const units = provider.splitBySentence
        ? splitSpeechSentences(segment.narration)
        : [segment.narration];
      const parts: string[] = [];
      const timestamps: SpeechTimestamp[] = [];
      let offset = 0;
      let timestamped = true;
      for (const [index, unit] of units.entries()) {
        const part = path.join(temporary, `${index}.mp3`);
        const result = await provider.synthesize(unit, part);
        parts.push(part);
        if (result.timestamps?.length) {
          timestamps.push(
            ...result.timestamps.map((item) => ({
              ...item,
              startMs: item.startMs + offset,
              endMs: item.endMs + offset,
            })),
          );
        } else {
          timestamped = false;
        }
        offset += durationMs(part);
      }
      const combined = path.join(temporary, "combined.mp3");
      concatenate(parts, combined, temporary);
      const output = path.join(options.audioDirectory, `${segment.id}.mp3`);
      normalize(combined, output, config);
      files.push({
        segmentId: segment.id,
        file: options.publicPathForFile?.(output) ?? output,
        ...(timestamped && timestamps.length
          ? {timestamps, timestampSource: `${provider.id}:word`}
          : {}),
      });
      console.log(`generated ${segment.id} with ${provider.label}/${provider.voice}`);
    } finally {
      fs.rmSync(temporary, {recursive: true, force: true});
    }
  }
  return files;
};

export const generateTtsWithProviders = async (
  script: Script,
  options: TtsGenerationOptions,
): Promise<TtsMetadata> => {
  const config = loadTtsV2Config();
  const network = options.network ?? config.network;
  const requested = options.requestedProvider ?? config.defaultProvider;
  const allowFallback = options.allowFallback ?? true;
  const selection = selectTtsProvider({
    requestedProvider: requested,
    hasCredential: Boolean(process.env[config.providers.minimax.apiKeyEnv]),
    allowFallback,
    fallbackOnMissingCredential: config.fallbackOnMissingCredential,
  });
  const initialProvider = providerFor(selection.providerId, config, network);
  const fallbackRun = await runTtsWithFallback({
    requestedProvider: requested,
    provider: initialProvider,
    fallbackProvider: providerFor("edge", config, network),
    allowFallback,
    fallbackOnError: config.fallbackOnError,
    run: (candidate) => generateFiles(script, candidate, config, options),
  });
  const files = fallbackRun.value;
  const provider = fallbackRun.provider;
  const fallbackUsed = selection.fallbackUsed || fallbackRun.fallbackUsed;
  const fallbackReason = selection.fallbackUsed
    ? `missing ${config.providers.minimax.apiKeyEnv}`
    : fallbackRun.fallbackReason;
  const hasTimestamps = files.length > 0 && files.every((file) => file.timestamps?.length);
  const metadata: TtsMetadata = {
    requestedProvider: config.providers[requested].label,
    provider: provider.label,
    providerId: provider.id,
    fallbackUsed,
    fallbackReason,
    generatedAt: new Date().toISOString(),
    voice: provider.voice,
    speed: provider.speed,
    pitch: provider.pitch,
    normalization: `loudnorm I=${config.normalization.integratedLufs} TP=${config.normalization.truePeakDb} LRA=${config.normalization.loudnessRange}`,
    credentialRequired: provider.credentialRequired,
    networkRequired: true,
    alignmentStrategy: hasTimestamps ? "provider-timestamps" : "caption-plan-proportional",
    files,
  };
  if (options.metadataPath) writeJson(options.metadataPath, metadata);
  return metadata;
};
