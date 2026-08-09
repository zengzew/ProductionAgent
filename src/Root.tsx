import React from "react";
import {Composition} from "remotion";
import pokeTimelineRaw from "./poke-timeline.generated.json";
import {PokeCover, PokeEpisode} from "./compositions/PokeEpisode";
import roostTimelineRaw from "./episode-002-timeline.generated.json";
import {RoostCover, RoostEpisode} from "./compositions/RoostEpisode";
import {timelineSchema} from "./schemas/episode";

const pokeTimeline = timelineSchema.parse(pokeTimelineRaw);
const roostTimeline = timelineSchema.parse(roostTimelineRaw);

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
    </>
  );
};
