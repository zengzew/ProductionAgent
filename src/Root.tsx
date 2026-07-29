import React from "react";
import {Composition} from "remotion";
import pokeTimeline from "./poke-timeline.generated.json";
import {PokeCover, PokeEpisode} from "./compositions/PokeEpisode";

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
    </>
  );
};
