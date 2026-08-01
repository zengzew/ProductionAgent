import path from "node:path";
import {z} from "zod";
import {readJson, repoRoot} from "./project";

const normalizationSchema = z.object({
  integratedLufs: z.number(),
  truePeakDb: z.number(),
  loudnessRange: z.number().positive(),
  sampleRate: z.number().int().positive(),
  bitrate: z.string().min(1),
});

export const ttsConfigSchema = z.object({
  provider: z.literal("edge"),
  acceptsApiKey: z.literal(false),
  providerSelectionEnabled: z.literal(false),
  normalization: normalizationSchema,
  profile: z.object({
    label: z.literal("Microsoft Edge neural TTS"),
    voice: z.literal("zh-CN-YunjianNeural"),
    rate: z.literal("+25%"),
    pitch: z.literal("-2Hz"),
  }),
});

export type TtsConfig = z.infer<typeof ttsConfigSchema>;

export const loadTtsConfig = (): TtsConfig =>
  ttsConfigSchema.parse(readJson<unknown>(path.join(repoRoot, "config/tts.json")));
