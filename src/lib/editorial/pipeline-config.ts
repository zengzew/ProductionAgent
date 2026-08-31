import path from "node:path";
import {z} from "zod";
import {readJson, repoRoot} from "../episode/paths";
import type {RetryableFetchOptions} from "../platform/network";

const normalization = z.object({
  integratedLufs: z.number(),
  truePeakDb: z.number(),
  loudnessRange: z.number().positive(),
  sampleRate: z.number().int().positive(),
  bitrate: z.string().min(1),
});

const ttsConfig = z.object({
  defaultProvider: z.enum(["minimax", "edge"]),
  fallbackProvider: z.literal("edge"),
  fallbackOnMissingCredential: z.boolean(),
  fallbackOnError: z.boolean(),
  network: z.object({
    timeoutMs: z.number().int().positive(),
    maxRetries: z.number().int().nonnegative(),
    retryBaseDelayMs: z.number().int().nonnegative(),
  }),
  normalization,
  pronunciation: z.object({
    fourDigitYears: z.literal("digit-by-digit"),
  }),
  providers: z.object({
    minimax: z.object({
      label: z.string(),
      apiStyle: z.literal("aliyun-bailian"),
      endpoint: z.string().url(),
      apiKeyEnv: z.string(),
      model: z.string(),
      voice: z.string(),
      speed: z.number(),
      pitch: z.number(),
      volume: z.number(),
      languageBoost: z.string(),
      requestTimestamps: z.boolean(),
    }),
    edge: z.object({
      label: z.string(),
      voice: z.string(),
      speed: z.number(),
      pitch: z.string(),
    }),
  }),
});

export type TtsV2Config = z.infer<typeof ttsConfig>;
export type NetworkConfig = RetryableFetchOptions;

export const repoPath = (relative: string): string => {
  const resolved = path.resolve(repoRoot, relative);
  if (path.relative(repoRoot, resolved).startsWith(".."))
    throw new Error(`非法配置路径：${relative}`);
  return resolved;
};

export const loadTtsV2Config = (): TtsV2Config =>
  ttsConfig.parse(readJson<unknown>(repoPath("config/tts-v2.json")));
