import {z} from "zod";

export const episodeConfigSchema = z.object({
  id: z.string().regex(/^episode-[a-z0-9-]+$/u),
  slug: z.string().min(1),
  product: z.string().min(1),
  title: z.string().min(1),
  language: z.string().min(1),
  fps: z.number().int().positive(),
  targetSeconds: z.number().positive().max(180),
  hardMaximumSeconds: z.number().positive().max(180),
  vertical: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
  }),
  selection: z.string().min(1),
  selectionReason: z.string().min(1),
  publishStatus: z.string().min(1),
  publishBlocker: z.string(),
  asOf: z.iso.date(),
});

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.string(),
  accessedAt: z.string().min(1),
  sourceType: z.enum(["official", "founder", "platform", "media", "analysis", "social"]),
  notes: z.string(),
});

export const factSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  metricName: z.string(),
  value: z.string(),
  period: z.string(),
  eventDate: z.string(),
  sourceIds: z.array(z.string()).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  reportingType: z.enum([
    "independently-verified",
    "company-reported",
    "founder-reported",
    "inference",
  ]),
  allowedInNarration: z.boolean(),
  notes: z.string(),
});

// Kept as an alias because the rendering layer still uses the established
// Claim type. The canonical research artifact is research/facts.json.
export const claimSchema = factSchema;

export const researchTimelineEventSchema = z.object({
  id: z.string().min(1),
  dateLabel: z.string().min(1),
  sortDate: z.iso.date(),
  datePrecision: z.enum(["day", "month", "before", "range", "as-of"]),
  event: z.string().min(1),
  eventType: z.enum([
    "company",
    "problem",
    "product",
    "user-behavior",
    "distribution",
    "growth",
    "policy",
    "acquisition",
  ]),
  factIds: z.array(z.string()).min(1),
  sourceIds: z.array(z.string()).min(1),
  relationToPrevious: z.enum(["not-applicable", "chronology-only", "source-supported-influence"]),
  storyFunction: z.enum([
    "context",
    "problem",
    "decision",
    "validation",
    "turning-point",
    "public-expansion",
    "distribution-event",
    "durability-test",
  ]),
  notes: z.string(),
});

export const researchTimelineSchema = z.object({
  asOf: z.iso.date(),
  events: z.array(researchTimelineEventSchema).min(1),
});

export const segmentSchema = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  narration: z.string().min(1),
  onScreenText: z.array(z.string()),
  claimIds: z.array(z.string()).min(1),
  scene: z.string().min(1),
  visualIntent: z.string().min(1),
  targetSeconds: z.number().positive(),
});

export const scriptSchema = z.object({
  selectedHook: z.string().min(1),
  segments: z.array(segmentSchema).min(1),
});

export const captionPlanSchema = z.object({
  segments: z
    .array(
      z.object({
        segmentId: z.string().min(1),
        cues: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

export const assetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["screenshot", "recording", "image", "audio", "generated"]),
  path: z.string().min(1),
  sourceUrl: z.string(),
  owner: z.string().min(1),
  licenseOrBasis: z.string().min(1),
  capturedAt: z.string(),
  usage: z.string().min(1),
  approved: z.boolean(),
  usedInRender: z.boolean(),
  claimIds: z.array(z.string()),
});

export const timelineSceneSchema = segmentSchema.extend({
  index: z.number().int().nonnegative(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  audioDurationSeconds: z.number().positive(),
  audio: z.string().min(1),
});

export const timelineSchema = z.object({
  fps: z.number().int().positive(),
  totalFrames: z.number().int().positive(),
  totalSeconds: z.number().positive(),
  ttsProvider: z.string().min(1),
  captionAlignment: z.enum(["provider-timestamps", "caption-plan-proportional"]).optional(),
  scenes: z.array(timelineSceneSchema).min(1),
});

export type Source = z.infer<typeof sourceSchema>;
export type Claim = z.infer<typeof factSchema>;
export type EpisodeConfig = z.infer<typeof episodeConfigSchema>;
export type ResearchTimeline = z.infer<typeof researchTimelineSchema>;
export type Script = z.infer<typeof scriptSchema>;
export type CaptionPlan = z.infer<typeof captionPlanSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
