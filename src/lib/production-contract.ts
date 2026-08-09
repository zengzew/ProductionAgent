import path from "node:path";
import {z} from "zod";
import {readJson, repoRoot} from "./project";
import type {EpisodeConfig, Timeline} from "../schemas/episode";

export const productionContractSchema = z.object({
  schemaVersion: z.literal("production-contract-v1"),
  delivery: z.object({
    hardMaximumSeconds: z.number().positive(),
    fps: z.number().int().positive(),
    vertical: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  }),
  timeline: z.object({
    hookTailSeconds: z.number().nonnegative(),
    bodyTailSeconds: z.number().nonnegative(),
  }),
  captions: z.object({
    maximumLineCharacters: z.number().int().positive(),
    microCueThresholdSeconds: z.number().positive(),
    microCueRatioLimit: z.number().min(0).max(1),
  }),
  hook: z.object({
    targetSeconds: z.number().positive(),
    firstSegmentMaximumSeconds: z.number().positive(),
    actionTerms: z.array(z.string().min(1)).min(1),
    attributionVerbs: z.array(z.string().min(1)).min(1),
  }),
  capture: z.object({
    navigationTimeoutMs: z.number().int().positive(),
    pageSettleMs: z.number().int().nonnegative(),
    anchorSettleMs: z.number().int().nonnegative(),
  }),
});

export type ProductionContract = z.infer<typeof productionContractSchema>;

export const loadProductionContract = (
  filePath = path.join(repoRoot, "config/production-contract.json"),
): ProductionContract => productionContractSchema.parse(readJson<unknown>(filePath));

export const productionContract = loadProductionContract();

export const assertEpisodeMatchesProductionContract = (
  episode: EpisodeConfig,
  contract: ProductionContract = productionContract,
): void => {
  if (episode.targetSeconds > contract.delivery.hardMaximumSeconds) {
    throw new Error(
      `${episode.id} targetSeconds ${episode.targetSeconds} 超过全局上限 ${contract.delivery.hardMaximumSeconds}`,
    );
  }
};

export const timelineTailSeconds = (
  episode: EpisodeConfig,
  segment: {id: string; section: string},
  contract: ProductionContract = productionContract,
): number =>
  episode.production.timelineTailSeconds[segment.id] ??
  (segment.section === "hook"
    ? contract.timeline.hookTailSeconds
    : contract.timeline.bodyTailSeconds);

export const assertTimelineMatchesProductionContract = (
  timeline: Timeline,
  contract: ProductionContract = productionContract,
): void => {
  if (timeline.fps !== contract.delivery.fps) {
    throw new Error(
      `时间轴 fps 与生产契约不一致：期望 ${contract.delivery.fps}，实际 ${timeline.fps}`,
    );
  }
  const expectedSeconds = timeline.totalFrames / contract.delivery.fps;
  if (Math.abs(timeline.totalSeconds - expectedSeconds) > Number.EPSILON * timeline.totalFrames) {
    throw new Error("时间轴 totalSeconds 必须由 totalFrames 和生产 fps 计算");
  }
  if (timeline.totalSeconds >= contract.delivery.hardMaximumSeconds) {
    throw new Error(
      `时间轴必须严格小于 ${contract.delivery.hardMaximumSeconds} 秒，实际 ${timeline.totalSeconds.toFixed(3)} 秒`,
    );
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const startsWithConfiguredAttribution = (
  narration: string,
  episode: EpisodeConfig,
  contract: ProductionContract = productionContract,
): boolean => {
  const subjects = [...new Set([episode.product, ...episode.production.hookAttributionSubjects])];
  const subjectPattern = subjects
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const verbPattern = contract.hook.attributionVerbs.map(escapeRegex).join("|");
  return new RegExp(`^(?:${subjectPattern})(?:公司)?\\s*(?:${verbPattern})`, "u").test(narration);
};

export const containsConfiguredHookAction = (
  text: string,
  contract: ProductionContract = productionContract,
): boolean => contract.hook.actionTerms.some((term) => text.includes(term));

export const expectedFrameRate = (contract: ProductionContract = productionContract): string =>
  `${contract.delivery.fps}/1`;
