import React from "react";
import {Composition} from "remotion";
import pokeTimelineRaw from "../content/episode-001/production/timeline.json";
import {PokeCover, PokeEpisode} from "./compositions/legacy/PokeEpisode";
import roostTimelineRaw from "../content/episode-002/production/timeline.json";
import {RoostCover, RoostEpisode} from "./compositions/legacy/RoostEpisode";
import manusTimelineRaw from "../content/episode-003/production/timeline.json";
import {ManusEpisode} from "./compositions/legacy/ManusEpisode";
import {MediaMixEpisode, mediaMixMetadata} from "./compositions/MediaMixEpisode";
import {timelineSchema} from "./schemas/episode";

const pokeTimeline = timelineSchema.parse(pokeTimelineRaw);
const roostTimeline = timelineSchema.parse(roostTimelineRaw);
const manusTimeline = timelineSchema.parse(manusTimelineRaw);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PokeVertical"
        component={PokeEpisode}
        defaultProps={{orientation: "vertical" as const}}
        durationInFrames={pokeTimeline.totalFrames}
        fps={pokeTimeline.fps}
        width={1080}
        height={1920}
      />
      <Composition
        id="PokeVerticalSmoke"
        component={PokeEpisode}
        defaultProps={{orientation: "vertical" as const}}
        durationInFrames={300}
        fps={pokeTimeline.fps}
        width={1080}
        height={1920}
      />
      <Composition
        id="PokeCover3x4"
        component={PokeCover}
        defaultProps={{orientation: "portrait" as const}}
        durationInFrames={1}
        fps={pokeTimeline.fps}
        width={1080}
        height={1440}
      />
      <Composition
        id="RoostVertical"
        component={RoostEpisode}
        durationInFrames={roostTimeline.totalFrames}
        fps={roostTimeline.fps}
        width={1080}
        height={1920}
      />
      <Composition
        id="RoostVerticalSmoke"
        component={RoostEpisode}
        durationInFrames={300}
        fps={roostTimeline.fps}
        width={1080}
        height={1920}
      />
      <Composition
        id="RoostCover3x4"
        component={RoostCover}
        durationInFrames={1}
        fps={roostTimeline.fps}
        width={1080}
        height={1440}
      />
      <Composition
        id="ManusVertical"
        component={ManusEpisode}
        durationInFrames={manusTimeline.totalFrames}
        fps={manusTimeline.fps}
        width={1080}
        height={1920}
      />
      <Composition
        id="ManusVerticalSmoke"
        component={ManusEpisode}
        durationInFrames={300}
        fps={manusTimeline.fps}
        width={1080}
        height={1920}
      />
      {/* WP-M5.08 generic real-media mix. Studio preview defaults to episode-003;
          `pnpm render` must pass --props.episodeId and re-authorize the public plan. */}
      <Composition
        id="MediaMixVertical"
        component={MediaMixEpisode}
        defaultProps={{episodeId: "episode-003"}}
        calculateMetadata={mediaMixMetadata}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
