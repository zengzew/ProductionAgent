import {z} from "zod";

export const deliveryGateSchema = z.object({
  rubricVersion: z.literal("delivery-critic-v1"),
  reviewedVideo: z.string().regex(/^output\/episode-[a-z0-9-]+\/vertical_9x16\.mp4$/u),
  reviewedVideoSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewedSubtitles: z.string().regex(/^output\/episode-[a-z0-9-]+\/subtitles_zh\.srt$/u),
  reviewedSubtitlesSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewedTimeline: z.string().regex(/^content\/episode-[a-z0-9-]+\/production\/timeline\.json$/u),
  reviewedTimelineSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  metrics: z.object({
    captionWordBreaks: z.number().int().nonnegative(),
    englishWordBreaks: z.number().int().nonnegative(),
    microCueThresholdSeconds: z.literal(1),
    microCueCount: z.number().int().nonnegative(),
    microCueRatio: z.number().min(0).max(1),
    microCueRatioLimit: z.literal(0.1),
    minimumCueSeconds: z.number().positive(),
    firstFrameZeroContextReadable: z.boolean(),
    speechClippingOrSwallowing: z.boolean(),
  }),
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  returnTo: z.enum(["none", "captions", "timeline", "tts", "render"]),
});

export type SrtCue = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

const parseSrtTime = (value: string): number => {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/u);
  if (!match) throw new Error(`无效 SRT 时间：${value}`);
  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000
  );
};

export const parseSrt = (srt: string): SrtCue[] =>
  srt
    .trim()
    .split(/\n\s*\n/gu)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const index = Number(lines[0]);
      const timing = lines[1]?.match(/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/u);
      const text = lines.slice(2).join("\n").trim();
      if (!Number.isInteger(index) || !timing?.[1] || !timing[2] || !text) {
        throw new Error(`无效 SRT cue：${block}`);
      }
      return {
        index,
        startSeconds: parseSrtTime(timing[1]),
        endSeconds: parseSrtTime(timing[2]),
        text,
      };
    });

export const measureCaptionDelivery = (
  cues: SrtCue[],
  microCueThresholdSeconds = 1,
): {
  microCueCount: number;
  microCueRatio: number;
  minimumCueSeconds: number;
} => {
  if (cues.length === 0) throw new Error("字幕为空，无法执行 Delivery Critic");
  const durations = cues.map((cue) => cue.endSeconds - cue.startSeconds);
  if (durations.some((duration) => duration <= 0)) {
    throw new Error("字幕包含零时长或负时长 cue");
  }
  const microCueCount = durations.filter(
    (duration) => duration + Number.EPSILON < microCueThresholdSeconds,
  ).length;
  return {
    microCueCount,
    microCueRatio: microCueCount / cues.length,
    minimumCueSeconds: Math.min(...durations),
  };
};

export const parseDeliveryGate = (markdown: string): z.infer<typeof deliveryGateSchema> => {
  const raw = markdown.match(/<!-- delivery-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("delivery-critic-report.md is missing delivery-gate metadata");
  return deliveryGateSchema.parse(JSON.parse(raw));
};
