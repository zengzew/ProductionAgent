import {z} from "zod";

export const reasoningProfiles = [
  "none",
  "deepseek-v4-flash",
  "qwen3.7-plus",
  "minimax-m2.7",
] as const;

export const reasoningProfileSchema = z.enum(reasoningProfiles);

const noReasoningConfigSchema = z
  .object({
    profile: z.literal("none"),
  })
  .strict();

const deepSeekV4FlashReasoningConfigSchema = z
  .object({
    profile: z.literal("deepseek-v4-flash"),
    thinking: z
      .object({
        type: z.literal("enabled"),
      })
      .strict(),
    reasoning_effort: z.literal("max"),
  })
  .strict();

const qwen37PlusReasoningConfigSchema = z
  .object({
    profile: z.literal("qwen3.7-plus"),
    enable_thinking: z.literal(true),
    thinking_budget: z.literal(262144),
  })
  .strict();

const minimaxM27ReasoningConfigSchema = z
  .object({
    profile: z.literal("minimax-m2.7"),
    mode: z.literal("native-thinking-only"),
  })
  .strict();

export const reasoningConfigSchema = z.discriminatedUnion("profile", [
  noReasoningConfigSchema,
  deepSeekV4FlashReasoningConfigSchema,
  qwen37PlusReasoningConfigSchema,
  minimaxM27ReasoningConfigSchema,
]);

export type ReasoningProfile = z.infer<typeof reasoningProfileSchema>;
export type ReasoningConfig = z.infer<typeof reasoningConfigSchema>;

export const defaultReasoningConfig = (): ReasoningConfig => ({profile: "none"});
