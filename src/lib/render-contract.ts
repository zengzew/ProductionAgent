import type {Timeline} from "../schemas/episode";

export type RenderContract = {
  composition: string;
  smokeComposition: string;
  generatedPrefix: string;
  layoutVariant: "poke-standard" | "roost-standard" | "roost-goal3";
};

const renderContracts: Readonly<Record<string, RenderContract>> = {
  "episode-001": {
    composition: "PokeVertical",
    smokeComposition: "PokeVerticalSmoke",
    generatedPrefix: "poke",
    layoutVariant: "poke-standard",
  },
  "episode-002": {
    composition: "RoostVertical",
    smokeComposition: "RoostVerticalSmoke",
    generatedPrefix: "episode-002",
    layoutVariant: "roost-standard",
  },
  "episode-003": {
    composition: "ManusVertical",
    smokeComposition: "ManusVerticalSmoke",
    generatedPrefix: "episode-003",
    layoutVariant: "poke-standard",
  },
};

export const getRenderContract = (episodeId: string): RenderContract => {
  const contract = renderContracts[episodeId];
  if (!contract) {
    throw new Error(
      `没有为 ${episodeId} 配置渲染契约；请先注册 composition、生成物前缀和回归验证。`,
    );
  }
  return contract;
};

export const generatedTimelinePath = (episodeId: string): string =>
  `src/${getRenderContract(episodeId).generatedPrefix}-timeline.generated.json`;

export const generatedCaptionsPath = (episodeId: string): string =>
  `src/${getRenderContract(episodeId).generatedPrefix}-captions.generated.json`;

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
