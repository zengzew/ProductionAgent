import React from "react";
import {Composition, registerRoot} from "remotion";
import pokeTimelineRaw from "../../../content/episode-001/production/timeline.json";
import {PokeCover, PokeEpisode} from "./PokeEpisode";
import roostTimelineRaw from "../../../content/episode-002/production/timeline.json";
import {RoostCover, RoostEpisode} from "./RoostEpisode";
import manusTimelineRaw from "../../../content/episode-003/production/timeline.json";
import {ManusEpisode} from "./ManusEpisode";
import {timelineSchema} from "../../schemas/episode";

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
    </>
  );
};

registerRoot(RemotionRoot);
