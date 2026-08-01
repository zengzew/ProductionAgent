import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {readJson, repoRoot} from "./project";

const normalization = z.object({
  integratedLufs: z.number(),
  truePeakDb: z.number(),
  loudnessRange: z.number().positive(),
  sampleRate: z.number().int().positive(),
  bitrate: z.string().min(1),
});

export const polishStyleSchema = z.object({
  targetSentenceChars: z.number().int().positive().optional(),
  maxSentenceChars: z.number().int().positive(),
  bannedTerms: z.array(z.string().min(1)),
  protectedTerms: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  numberReading: z.object({
    normalizeForSpeech: z.boolean().optional(),
    rejectArabicDigits: z.boolean(),
    examples: z.array(z.string().min(1)),
  }),
});

const polishConfig = z.object({
  execution: z.object({
    mode: z.literal("hosted-llm-api"),
    networkCalls: z.literal(true),
    apiKeys: z.literal(true),
    selfHostedModels: z.literal(false),
  }),
  llm: z.object({
    endpoint: z.string().url(),
    apiKeyEnv: z.string().min(1),
    modelEnv: z.string().min(1),
    defaultModel: z.string().min(1),
    temperature: z.number().min(0).max(2),
  }),
  prompts: z.object({
    polishSystem: z.string(),
    polishUser: z.string(),
    judgeSystem: z.string(),
    judgeUser: z.string(),
    rewriteUser: z.string(),
  }),
  voiceGuide: z.string(),
  styleRules: z.string(),
  acceptedSamplesDir: z.string(),
  sampleCount: z.number().int().nonnegative(),
  maxRounds: z.number().int().positive(),
  thresholds: z.object({
    translationese: z.number().min(0).max(10),
    spokenChinese: z.number().min(0).max(10),
    informationFidelity: z.number().min(0).max(10),
  }),
});

const ttsConfig = z.object({
  defaultProvider: z.enum(["minimax", "edge"]),
  fallbackProvider: z.literal("edge"),
  fallbackOnMissingCredential: z.boolean(),
  fallbackOnError: z.boolean(),
  normalization,
  providers: z.object({
    minimax: z.object({
      label: z.string(),
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

export type PolishStyle = z.infer<typeof polishStyleSchema>;
export type TtsV2Config = z.infer<typeof ttsConfig>;

export const repoPath = (relative: string): string => {
  const resolved = path.resolve(repoRoot, relative);
  if (path.relative(repoRoot, resolved).startsWith(".."))
    throw new Error(`非法配置路径：${relative}`);
  return resolved;
};

export const loadPolishV2Config = () => {
  const config = polishConfig.parse(readJson<unknown>(repoPath("config/polish-v2.json")));
  const style = polishStyleSchema.parse(readJson<unknown>(repoPath(config.styleRules)));
  for (const value of [
    config.voiceGuide,
    config.acceptedSamplesDir,
    ...Object.values(config.prompts),
  ]) {
    if (!fs.existsSync(repoPath(value))) throw new Error(`缺少 polish 配置路径：${value}`);
  }
  return {config, style};
};

export const loadTtsV2Config = (): TtsV2Config =>
  ttsConfig.parse(readJson<unknown>(repoPath("config/tts-v2.json")));

export const promptText = (relative: string): string =>
  fs.readFileSync(repoPath(relative), "utf8").trim();
