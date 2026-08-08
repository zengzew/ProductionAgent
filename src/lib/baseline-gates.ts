import crypto from "node:crypto";

export const EPISODE_001_V1_NARRATION_SHA256 =
  "65288b451d6e8f0816aa43b9a8f569ea29b9dfb4d4e77014ca09a755581a35f9";

export const containsProductStageTranslation = (episodeId: string, narration: string): boolean => {
  // Episode 001 v1 predates the v3 polish rule and is already bound to approved
  // TTS/render artifacts. Only its exact narration hash is grandfathered.
  const narrationSha256 = crypto.createHash("sha256").update(narration).digest("hex");
  const isDeliveryBoundEpisode001 =
    episodeId === "episode-001" && narrationSha256 === EPISODE_001_V1_NARRATION_SHA256;
  const pattern = isDeliveryBoundEpisode001 ? /一般可用状态/u : /Beta\s*用户|一般可用状态/u;
  return pattern.test(narration);
};
