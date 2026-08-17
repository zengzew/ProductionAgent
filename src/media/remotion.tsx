import React from "react";
import {Audio, Video} from "@remotion/media";
import {AbsoluteFill, Freeze, Img, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import type {Timeline} from "../schemas/episode";
import {
  mediaShotAudioGainsAtFrame,
  mediaShotTransformAtFrame,
  mediaShotVideoOpacityAtFrame,
} from "./render-math";
import type {MediaShot} from "./render";

/**
 * WP-M5.08 generic real-media renderer.
 *
 * ONE generic component set renders every episode's media mix from the
 * hash-bound `media-render-plan-v1` projection — no per-episode React scenes
 * are written for real media. The same visual plan mixes:
 *
 * - real video (`@remotion/media` `Video`, normalized render proxy preferred)
 *   with 9:16 reframe/crop, zoom-pan, PiP, freeze frame and simple
 *   fade/crossfade;
 * - real audio (podcast/founder audio) with a generic audio card visual;
 * - official screenshots (captured page stills);
 * - data-evidence cards and programmatic fallback visuals.
 *
 * The audio contract is deterministic: original clip audio + narration rails
 * with per-rail gains, simple ducking (attack/release ramps), and fades —
 * computed by the pure functions in `src/media/render.ts` so the mix never
 * clips (gains are normalized to sum ≤ 1 at plan build time).
 *
 * Lineage never lives in the renderer: the plan embeds the full hash-bound
 * chain (shot → clip → verification → ClipIndex → MediaAsset → source +
 * timestamp) and `resolveMediaShotLineage` can walk it at any time.
 */

const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif';

const COLORS = {
  void: "#08090d",
  ink: "#f3efe4",
  muted: "#8d94a3",
  gold: "#e8c547",
  line: "#2c313c",
  card: "#181b23",
  real: "#5ee0c8",
  official: "#e8c547",
  demo: "#c9844a",
};

const PRODUCTION_META_TAG =
  /真实画面|数据证据|真实页面|功能演示|程序化画面|Claim Ledger|真实音频/u;

const isProductionMetaTag = (text: string): boolean => PRODUCTION_META_TAG.test(text);

const visibleOnScreenText = (texts: readonly string[]): string[] =>
  texts.filter((text) => text.trim().length > 0 && !isProductionMetaTag(text));

const reframeObjectFit = (mode: MediaShot["transform"]["reframe"]["mode"]): "cover" | "contain" =>
  mode === "cover" ? "cover" : "contain";

/* ------------------------------------------------------------------------- *
 * Real media visual layer (video / audio)
 * ------------------------------------------------------------------------- */

const transformStyle = (
  shot: MediaShot,
  frame: number,
  fps: number,
  canvas: {width: number; height: number},
  extra: React.CSSProperties = {},
): React.CSSProperties => {
  const state = mediaShotTransformAtFrame({
    frame,
    fps,
    durationFrames: shot.durationFrames,
    canvas,
    transform: shot.transform,
  });
  return {
    width: "100%",
    height: "100%",
    transform: `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`,
    transformOrigin: `${state.transformOriginX}% ${state.transformOriginY}%`,
    ...extra,
  };
};

/** One frame of the (trimmed) render proxy the freeze freezes at. */
const freezeFrameOf = (shot: MediaShot, fps: number): number | null =>
  shot.transform.freezeFrameMs === null
    ? null
    : Math.max(0, Math.round((shot.transform.freezeFrameMs / 1000) * fps));

const PIP_CORNERS: Record<
  NonNullable<MediaShot["transform"]["pip"]>["position"],
  React.CSSProperties
> = {
  "bottom-right": {right: 48, bottom: 180},
  "bottom-left": {left: 48, bottom: 180},
  "top-right": {right: 48, top: 200},
  "top-left": {left: 48, top: 200},
};

/**
 * Real VIDEO layer: 9:16 reframe + crop + scale/position + zoom-pan + PiP +
 * freeze. The video element is muted — its audio is mixed separately by
 * `MediaShotOriginalAudio` so gains/ducking stay deterministic.
 */
export const RealVideoLayer: React.FC<{shot: MediaShot; src: string}> = ({shot, src}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const pip = shot.transform.pip;
  const freezeFrame = freezeFrameOf(shot, fps);

  const media = (
    <Video
      src={src}
      muted
      style={{
        width: "100%",
        height: "100%",
        objectFit: reframeObjectFit(shot.transform.reframe.mode),
      }}
    />
  );
  const frozen = freezeFrame === null ? media : <Freeze frame={freezeFrame}>{media}</Freeze>;

  if (pip && pip.enabled) {
    const boxWidth = Math.round(width * pip.size);
    return (
      <AbsoluteFill>
        {/* Blurred full-bleed backdrop keeps the 9:16 frame alive behind the PiP. */}
        <div style={{position: "absolute", inset: 0, overflow: "hidden"}}>
          <Video
            src={src}
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(64px)",
              transform: "scale(1.25)",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            width: boxWidth,
            aspectRatio: "16 / 9",
            overflow: "hidden",
            borderRadius: pip.borderRadius,
            border: `2px solid ${pip.borderColor}`,
            boxShadow: pip.shadow ? "0 24px 60px rgba(0,0,0,.5)" : undefined,
            background: "#000",
            ...PIP_CORNERS[pip.position],
          }}
        >
          <div
            style={transformStyle(shot, frame, fps, {
              width: boxWidth,
              height: Math.round(boxWidth * (9 / 16)),
            })}
          >
            {frozen}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      <div style={transformStyle(shot, frame, fps, {width, height})}>{frozen}</div>
    </AbsoluteFill>
  );
};

/**
 * Real AUDIO layer visual: verified audio has no picture, so the generic
 * renderer shows a deterministic audio card (the audible content is the
 * evidence). The audio itself is mixed by `MediaShotOriginalAudio`.
 */
export const RealAudioCard: React.FC<{shot: MediaShot}> = ({shot}) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      padding: "0 120px",
      color: COLORS.ink,
      fontFamily: SANS,
    }}
  >
    <div
      style={{
        width: "100%",
        padding: "56px 48px",
        borderRadius: 28,
        background: COLORS.card,
        border: `1px solid ${COLORS.line}`,
        textAlign: "center",
      }}
    >
      <div style={{marginTop: 24, fontSize: 44, lineHeight: 1.25, fontWeight: 760}}>
        {shot.overlays.sourceLabel && !isProductionMetaTag(shot.overlays.sourceLabel)
          ? shot.overlays.sourceLabel
          : ""}
      </div>
      <div style={{marginTop: 28, display: "flex", justifyContent: "center", gap: 10}}>
        {Array.from({length: 9}, (_, index) => (
          <div
            key={index}
            style={{
              width: 8,
              height: 34 + ((index * 17) % 26),
              borderRadius: 99,
              background: COLORS.real,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
    </div>
  </AbsoluteFill>
);

/**
 * Original clip audio rail with the deterministic ducked gain. Rendered for
 * real-media shots whenever `originalAudioGain > 0` (the video element stays
 * muted; its audio track is mixed through this element).
 */
export const MediaShotOriginalAudio: React.FC<{shot: MediaShot; src: string}> = ({shot, src}) => {
  const {fps} = useVideoConfig();
  if (shot.audio.originalAudioGain <= 0) return null;
  return (
    <Audio
      src={src}
      volume={(frame) =>
        mediaShotAudioGainsAtFrame({
          frame,
          fps,
          durationFrames: shot.durationFrames,
          audio: shot.audio,
        }).originalGain
      }
    />
  );
};

/** Narration (TTS) rail with the deterministic narration gain. */
export const MediaShotNarration: React.FC<{shot: MediaShot; src: string}> = ({shot, src}) => {
  const {fps} = useVideoConfig();
  if (shot.audio.narrationGain <= 0) return null;
  return (
    <Audio
      src={src}
      volume={(frame) =>
        mediaShotAudioGainsAtFrame({
          frame,
          fps,
          durationFrames: shot.durationFrames,
          audio: shot.audio,
        }).narrationGain
      }
    />
  );
};

/* ------------------------------------------------------------------------- *
 * Official screenshot layer
 * ------------------------------------------------------------------------- */

export const OfficialScreenshotLayer: React.FC<{
  shot: MediaShot;
  src: string;
  label: string;
}> = ({shot, src, label}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      <div style={transformStyle(shot, frame, fps, {width, height})}>
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: reframeObjectFit(shot.transform.reframe.mode),
          }}
        />
      </div>
      {label && !isProductionMetaTag(label) ? (
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 200,
            padding: "10px 16px",
            borderRadius: 999,
            background: "rgba(8,9,13,.88)",
            color: COLORS.ink,
            fontSize: 24,
            zIndex: 4,
          }}
        >
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------- *
 * Fallback visual layers (data card / programmatic)
 * ------------------------------------------------------------------------- */

export const FallbackVisualLayer: React.FC<{
  scene: Timeline["scenes"][number];
  shot: MediaShot | null;
}> = ({scene}) => {
  const lines = visibleOnScreenText(scene.onScreenText);
  const headline = lines[0] ?? "";
  const rest = lines.slice(1);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: "0 96px",
        color: COLORS.ink,
        fontFamily: SANS,
        textAlign: "center",
      }}
    >
      {headline ? (
        <div style={{fontSize: 56, lineHeight: 1.2, fontWeight: 780}}>{headline}</div>
      ) : null}
      {rest.length > 0 ? (
        <div style={{marginTop: 28, fontSize: 36, lineHeight: 1.45, color: COLORS.muted}}>
          {rest.join("\n")}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------- *
 * Overlays (source label + badge)
 * ------------------------------------------------------------------------- */

const BADGE_COLORS: Record<string, string> = {
  real: COLORS.real,
  official: COLORS.official,
  demo: COLORS.demo,
};

export const MediaShotOverlays: React.FC<{shot: MediaShot}> = ({shot}) => {
  const badgeText = shot.overlays.badge?.text ?? "";
  const sourceLabel = shot.overlays.sourceLabel ?? "";
  const showBadge = Boolean(badgeText) && !isProductionMetaTag(badgeText);
  const showSource = Boolean(sourceLabel) && !isProductionMetaTag(sourceLabel);
  if (!showBadge && !showSource) return null;
  return (
    <>
      {showBadge ? (
        <div
          style={{
            position: "absolute",
            right: 48,
            top: 200,
            padding: "10px 18px",
            borderRadius: 999,
            background: BADGE_COLORS[shot.overlays.badge?.tone ?? ""] ?? COLORS.demo,
            color: "#141008",
            fontSize: 24,
            fontWeight: 720,
            zIndex: 5,
          }}
        >
          {badgeText}
        </div>
      ) : null}
      {showSource ? (
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 200,
            maxWidth: 900,
            padding: "10px 16px",
            borderRadius: 999,
            background: "rgba(8,9,13,.88)",
            color: COLORS.ink,
            fontSize: 24,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex: 5,
          }}
        >
          {sourceLabel}
        </div>
      ) : null}
    </>
  );
};

/* ------------------------------------------------------------------------- *
 * One shot scene (media + audio + overlays + fade/crossfade)
 * ------------------------------------------------------------------------- */

export const MediaShotScene: React.FC<{
  scene: Timeline["scenes"][number];
  shot: MediaShot;
  isFirst: boolean;
}> = ({scene, shot, isFirst}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity = mediaShotVideoOpacityAtFrame({
    frame,
    fps,
    durationFrames: shot.durationFrames,
    fade: shot.fade,
    crossfadeMs: shot.crossfadeMs,
    isFirst,
  });
  return (
    <AbsoluteFill style={{opacity, background: COLORS.void}}>
      {shot.visualType === "real-media" && shot.staticFilePath ? (
        <>
          {shot.renderProxyMediaType?.startsWith("audio/") ? (
            <RealAudioCard shot={shot} />
          ) : (
            <RealVideoLayer shot={shot} src={staticFile(shot.staticFilePath)} />
          )}
          <MediaShotOriginalAudio shot={shot} src={staticFile(shot.staticFilePath)} />
        </>
      ) : shot.visualType === "official-screenshot" && shot.fallbackImagePath ? (
        <OfficialScreenshotLayer
          shot={shot}
          src={staticFile(shot.fallbackImagePath)}
          label={shot.overlays.sourceLabel ?? ""}
        />
      ) : (
        <FallbackVisualLayer scene={scene} shot={shot} />
      )}
      <MediaShotOverlays shot={shot} />
    </AbsoluteFill>
  );
};
