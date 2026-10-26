import type {Timeline} from "../../schemas/episode";

export type RendererKind = "media-mix" | "legacy-composition";

export type LayoutVariant = "poke-standard" | "roost-standard" | "roost-goal3";

export type RenderContract = {
  renderer: RendererKind;
  composition: string;
  smokeComposition: string;
  layoutVariant: LayoutVariant;
};

const mediaMix = (layoutVariant: LayoutVariant): RenderContract => ({
  renderer: "media-mix",
  composition: "MediaMixVertical",
  smokeComposition: "MediaMixVertical",
  layoutVariant,
});

const renderContracts: Readonly<Record<string, RenderContract>> = {
  "episode-001": {
    renderer: "legacy-composition",
    composition: "PokeVertical",
    smokeComposition: "PokeVerticalSmoke",
    layoutVariant: "poke-standard",
  },
  "episode-002": {
    renderer: "legacy-composition",
    composition: "RoostVertical",
    smokeComposition: "RoostVerticalSmoke",
    layoutVariant: "roost-standard",
  },
  "episode-003": {
    renderer: "legacy-composition",
    composition: "ManusVertical",
    smokeComposition: "ManusVerticalSmoke",
    layoutVariant: "poke-standard",
  },
  "episode-m5e2e": mediaMix("poke-standard"),
  "episode-004": mediaMix("poke-standard"),
  "episode-005": mediaMix("poke-standard"),
  "episode-006": mediaMix("poke-standard"),
  "episode-007": mediaMix("poke-standard"),
  "episode-008": mediaMix("poke-standard"),
  "episode-009": mediaMix("poke-standard"),
  "episode-009-v2": mediaMix("poke-standard"),
  "episode-010": mediaMix("poke-standard"),
  "episode-011": mediaMix("poke-standard"),
  "episode-012": mediaMix("poke-standard"),
};

export const getRenderContract = (episodeId: string): RenderContract => {
  const contract = renderContracts[episodeId];
  if (!contract) {
    throw new Error(`没有为 ${episodeId} 配置渲染契约；请先注册 media-mix 渲染器并完成回归验证。`);
  }
  return contract;
};

/** Historical compositions never enter the current MediaMix bundle. */
export const renderEntrypoint = (episodeId: string): string =>
  getRenderContract(episodeId).renderer === "legacy-composition"
    ? "src/compositions/legacy/index.tsx"
    : "src/index.ts";

/** Canonical measured timeline. Same bytes as `content/<ep>/production/timeline.json`. */
export const generatedTimelinePath = (episodeId: string): string =>
  `content/${episodeId}/production/timeline.json`;

/** Canonical generated caption JSON written by `pnpm timeline`. */
export const generatedCaptionsPath = (episodeId: string): string =>
  `content/${episodeId}/production/captions.generated.json`;

/** Remotion `staticFile` runtime copy of the timeline. */
export const publicTimelineRepositoryPath = (episodeId: string): string =>
  `public/episodes/${episodeId}/media/timeline.json`;

/** Remotion `staticFile` runtime copy of the captions. */
export const publicCaptionsRepositoryPath = (episodeId: string): string =>
  `public/episodes/${episodeId}/media/captions.json`;

export const assertTimelineMatchesEpisode = (timeline: Timeline, episodeId: string): void => {
  const contract = getRenderContract(episodeId);
  if (timeline.episodeId !== episodeId) {
    throw new Error(`时间轴 episodeId 不匹配：期望 ${episodeId}，实际 ${timeline.episodeId}`);
  }
  if (timeline.layoutVariant !== contract.layoutVariant) {
    throw new Error(
      `时间轴版式不匹配：${episodeId} 期望 ${contract.layoutVariant}，实际 ${timeline.layoutVariant}`,
    );
  }
  const expectedAudioPrefix = `episodes/${episodeId}/`;
  const mismatchedScenes = timeline.scenes
    .filter((scene) => !scene.audio.startsWith(expectedAudioPrefix))
    .map((scene) => scene.id);
  if (mismatchedScenes.length > 0) {
    throw new Error(
      `时间轴与当前 episode 不一致：${episodeId} 的音频路径不匹配 ${mismatchedScenes.join(", ")}`,
    );
  }
};
