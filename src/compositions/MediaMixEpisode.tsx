import React from "react";
import {AbsoluteFill, Sequence, staticFile} from "remotion";
import {CaptionLayer} from "./shared";
import {MediaShotNarration, MediaShotScene} from "../media/remotion";
import {mediaRenderPublicFilePath} from "../media/render-math";
import type {MediaRenderPlan} from "../media/render";
import type {Timeline} from "../schemas/episode";
import type {CalculateMetadataFunction} from "remotion";

/**
 * WP-M5.08 generic mix composition.
 *
 * ONE composition renders ANY episode's media mix from the hash-bound
 * `media-render-plan-v1` projection — real video, real audio, official
 * screenshots, data cards and programmatic fallbacks — plus narration (TTS)
 * and captions. No per-episode React scenes are written for real media.
 *
 * Data is loaded at metadata time through `staticFile` from the public
 * copies the plan builder produces (`episodes/<ep>/media/`): render-plan,
 * timeline and captions. The plan's shots carry every scene's trim/transform/
 * audio/overlay contract; the timeline carries narration paths and fallback
 * text; captions are the timed subtitle layer.
 *
 * Bundle boundary: this composition must stay free of Node-only imports (the
 * full `media-shot-v1`/`media-render-plan-v1` zod schemas live in
 * `src/media/render.ts`, which is Node-side). It consumes the plan as trusted
 * data (the plan is hash-bound and render-gate authorized server-side) and
 * performs a light structural check only.
 */

export type MediaMixEpisodeProps = {
  episodeId?: string;
  plan?: MediaRenderPlan;
  timeline?: Timeline;
  captions?: Array<{startFrame: number; endFrame: number; text: string}>;
};

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(staticFile(path));
  if (!response.ok) {
    throw new Error(`MEDIA_MIX_LOAD_FAILED:${path}:${response.status}`);
  }
  return (await response.json()) as T;
};

const assertPlanShape = (value: unknown): MediaRenderPlan => {
  const plan = value as MediaRenderPlan;
  if (
    !plan ||
    typeof plan !== "object" ||
    typeof plan.episodeId !== "string" ||
    typeof plan.totalFrames !== "number" ||
    typeof plan.fps !== "number" ||
    typeof plan.timelineSha256 !== "string" ||
    !Array.isArray(plan.shots) ||
    plan.shots.length === 0
  ) {
    throw new Error("MEDIA_MIX_PLAN_INVALID:render-plan.json");
  }
  return plan;
};

export const mediaMixMetadata: CalculateMetadataFunction<MediaMixEpisodeProps> = async ({
  props,
}) => {
  const episodeId = props.episodeId ?? "episode-003";
  const [planRaw, timelineRaw, captionsRaw] = await Promise.all([
    fetchJson<unknown>(mediaRenderPublicFilePath(episodeId, "render-plan.json")),
    fetchJson<unknown>(mediaRenderPublicFilePath(episodeId, "timeline.json")),
    fetchJson<unknown>(mediaRenderPublicFilePath(episodeId, "captions.json")),
  ]);
  const plan = assertPlanShape(planRaw);
  const timeline = timelineRaw as Timeline;
  const captions = Array.isArray(captionsRaw)
    ? (captionsRaw as Array<{startFrame: number; endFrame: number; text: string}>)
    : [];
  return {
    durationInFrames: plan.totalFrames,
    fps: plan.fps,
    props: {episodeId, plan, timeline, captions},
  };
};

const CAPTION_STYLE: React.CSSProperties = {
  position: "absolute",
  left: 64,
  right: 64,
  bottom: 228,
  minHeight: 98,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "16px 28px",
  borderRadius: 20,
  color: "#ffffff",
  background: "rgba(8,9,13,.92)",
  fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
  fontSize: 46,
  lineHeight: 1.28,
  fontWeight: 650,
  letterSpacing: 0.4,
  whiteSpace: "pre-line",
  zIndex: 20,
};

export const MediaMixEpisode: React.FC<MediaMixEpisodeProps> = ({
  episodeId = "episode-003",
  plan,
  timeline,
  captions,
}) => {
  if (!plan || !timeline || !captions) {
    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          color: "#f3efe4",
          fontFamily: '"PingFang SC", Arial, sans-serif',
          fontSize: 40,
          background: "#08090d",
        }}
      >
        MediaMixEpisode requires metadata (run `pnpm media:render-plan` for
        {episodeId})
      </AbsoluteFill>
    );
  }
  const shotsBySegment = new Map(plan.shots.map((shot) => [shot.segmentId, shot]));
  return (
    <AbsoluteFill
      style={{
        background: "#08090d",
        color: "#f3efe4",
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
      }}
    >
      {timeline.scenes.map((scene, index) => {
        const shot = shotsBySegment.get(scene.id);
        if (!shot) {
          throw new Error(`MEDIA_MIX_SHOT_MISSING:${scene.id}`);
        }
        const crossfadeFrames =
          index > 0 && shot.crossfadeMs > 0 ? Math.round((shot.crossfadeMs / 1000) * plan.fps) : 0;
        const from = scene.startFrame - crossfadeFrames;
        const durationInFrames = scene.durationFrames + crossfadeFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} premountFor={30}>
            <MediaShotScene scene={scene} shot={shot} isFirst={index === 0} />
            <MediaShotNarration shot={shot} src={staticFile(scene.audio)} />
          </Sequence>
        );
      })}
      <CaptionLayer captions={captions} style={CAPTION_STYLE} />
    </AbsoluteFill>
  );
};
