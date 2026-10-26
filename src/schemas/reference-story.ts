import {z} from "zod";

/** Explicit per-episode format; old episodes retain their original contracts. */
export const referenceStorySchema = z.object({
  profile: z.literal("golden-reference-v1"),
  headline: z.string().trim().min(1).max(24),
  resultLine: z.string().trim().min(1).max(24),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).min(1),
});

export type ReferenceStory = z.infer<typeof referenceStorySchema>;

// Observed openings finish within ~3–8 seconds. Ten is a safety ceiling,
// not an instruction to pad a hook or a proxy for creative quality.
export const REFERENCE_HOOK_MAX_SECONDS = 10;
