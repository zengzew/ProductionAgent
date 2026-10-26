import React from "react";
import {Composition} from "remotion";
import {MediaMixEpisode, mediaMixMetadata} from "./compositions/MediaMixEpisode";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MediaMixVertical"
    component={MediaMixEpisode}
    defaultProps={{episodeId: "episode-012"}}
    calculateMetadata={mediaMixMetadata}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1920}
  />
);
