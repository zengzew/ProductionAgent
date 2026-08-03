import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const comparisonDimensionSchema = z.object({
  baseline: z.number().min(0).max(10),
  directorCut: z.number().min(0).max(10),
  evidence: z.string().min(1),
});

export const comparisonGateSchema = z.object({
  rubricVersion: z.literal("director-comparison-v1"),
  method: z.literal("editorial-retention-proxy"),
  baselineVideo: z.string().min(1),
  baselineVideoSha256: sha256Schema,
  directorVideo: z.string().min(1),
  directorVideoSha256: sha256Schema,
  baselineTimeline: z.string().min(1),
  baselineTimelineSha256: sha256Schema,
  directorTimeline: z.string().min(1),
  directorTimelineSha256: sha256Schema,
  dimensions: z.object({
    hookStrength: comparisonDimensionSchema,
    storyCoherence: comparisonDimensionSchema,
    viewerCuriosity: comparisonDimensionSchema,
    productUnderstanding: comparisonDimensionSchema,
    visualStorytelling: comparisonDimensionSchema,
    retentionPotential: comparisonDimensionSchema,
  }),
  baselineTotal: z.number().min(0).max(60),
  directorCutTotal: z.number().min(0).max(60),
  verdict: z.literal("IMPROVED"),
  limitations: z.array(z.string().min(1)).min(1),
});

export const parseComparisonGate = (markdown: string): z.infer<typeof comparisonGateSchema> => {
  const raw = markdown.match(/<!-- comparison-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("comparison-report.md is missing comparison-gate metadata");
  return comparisonGateSchema.parse(JSON.parse(raw));
};
