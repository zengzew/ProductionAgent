import React from "react";
import {Audio, Video} from "@remotion/media";
import {
  AbsoluteFill,
  Freeze,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
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

const PRODUCTION_META_TAG = /真实画面|数据证据|真实页面|功能演示|程序化画面|Claim Ledger|真实音频/u;

const isProductionMetaTag = (text: string): boolean => PRODUCTION_META_TAG.test(text);

const visibleOnScreenText = (texts: readonly string[]): string[] =>
  texts.filter((text) => text.trim().length > 0 && !isProductionMetaTag(text));

const evidenceSnippets = (texts: readonly string[]): string[] =>
  texts
    .flatMap((text) => text.split(/[；;]/u))
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && !isProductionMetaTag(text))
    .slice(0, 3);

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

/** Brief evidence overlay; the underlying product demo remains the visual track. */
export const RealMediaEvidenceOverlay: React.FC<{
  scene: Timeline["scenes"][number];
  shot: MediaShot;
}> = ({scene, shot}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const snippets = evidenceSnippets(scene.onScreenText);
  const start = Math.min(Math.round(fps * 1.1), Math.round(shot.durationFrames * 0.22));
  const end = Math.min(shot.durationFrames - 5, start + Math.round(fps * 1.8));
  const opacity = interpolate(
    frame,
    [start, start + 7, Math.max(start + 8, end - 7), end],
    [0, 1, 1, 0],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );
  const evidenceStillOpacity = shot.evidenceImagePath
    ? interpolate(frame, [start, start + 7, Math.max(start + 8, end - 7), end], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 48,
          padding: "9px 15px",
          borderRadius: 999,
          background: "rgba(8,9,13,.82)",
          color: "rgba(255,255,255,.86)",
          fontFamily: SANS,
          fontSize: 22,
          fontWeight: 650,
          zIndex: 8,
        }}
      >
        GAMMA 产品演示 · B-roll
      </div>
      {snippets.length > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 54,
            right: 54,
            top: 210,
            padding: "22px 26px",
            borderRadius: 24,
            background: "rgba(8,9,13,.88)",
            border: "1px solid rgba(255,255,255,.15)",
            boxShadow: "0 18px 50px rgba(0,0,0,.35)",
            color: "#fff",
            fontFamily: SANS,
            fontSize: 34,
            lineHeight: 1.3,
            fontWeight: 760,
            opacity,
            zIndex: 8,
          }}
        >
          {snippets.join(" · ")}
        </div>
      ) : null}
      {shot.evidenceImagePath ? (
        <div
          style={{
            position: "absolute",
            left: 74,
            right: 74,
            top: 350,
            height: 640,
            padding: 14,
            borderRadius: 28,
            background: "rgba(8,9,13,.92)",
            border: "1px solid rgba(255,255,255,.2)",
            boxShadow: "0 24px 70px rgba(0,0,0,.5)",
            opacity: evidenceStillOpacity,
            overflow: "hidden",
            zIndex: 9,
          }}
        >
          <Img
            src={staticFile(shot.evidenceImagePath)}
            style={{width: "100%", height: "100%", objectFit: "cover", borderRadius: 18}}
          />
        </div>
      ) : null}
    </>
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
  scene: Timeline["scenes"][number];
}> = ({shot, src, label, scene}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1, shot.durationFrames - 1));
  const scale = interpolate(progress, [0, 1], [1, 1.045]);
  const enter = interpolate(frame, [0, Math.round(fps * 0.35)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const overlay = (() => {
    const base: React.CSSProperties = {
      position: "absolute",
      left: 54,
      right: 54,
      zIndex: 6,
      fontFamily: SANS,
      color: "#fff",
    };
    const card: React.CSSProperties = {
      borderRadius: 24,
      background: "rgba(9,11,16,.90)",
      border: "1px solid rgba(255,255,255,.14)",
      boxShadow: "0 24px 70px rgba(0,0,0,.42)",
    };
    if (scene.scene === "几何网格与成品 Logo 同框") {
      return (
        <div style={{...base, top: 120, opacity: enter}}>
          <div style={{fontSize: 30, fontWeight: 850, letterSpacing: 5}}>RIKYŪ</div>
          <div style={{marginTop: 14, fontSize: 54, lineHeight: 1.12, fontWeight: 840}}>
            几何构成 → 成品 Logo
          </div>
          <div style={{marginTop: 14, fontSize: 24, color: "rgba(255,255,255,.76)"}}>
            开发者官方 X · 公开演示不代表内部算法
          </div>
        </div>
      );
    }
    if (scene.scene === "产品定义与整套品牌资产") {
      return (
        <div style={{...base, top: 112, opacity: enter}}>
          <div style={{fontSize: 28, fontWeight: 800, color: "#d9ff51"}}>RIKYŪ 真实案例</div>
          <div style={{marginTop: 12, fontSize: 51, lineHeight: 1.15, fontWeight: 840}}>
            一句需求，变成整套品牌资产
          </div>
          <div style={{display: "flex", gap: 12, marginTop: 18}}>
            {["LOGO", "网页", "社交", "印刷"].map((item) => (
              <div key={item} style={{...card, padding: "9px 15px", fontSize: 24}}>
                {item}
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (scene.scene === "两个使用入口") {
      return (
        <div style={{...base, top: 100, opacity: enter}}>
          <div style={{...card, padding: "22px 26px"}}>
            <div style={{fontSize: 22, color: "rgba(255,255,255,.62)"}}>说出你的需求</div>
            <div style={{marginTop: 8, fontSize: 36, fontWeight: 760}}>给咖啡品牌做一套视觉</div>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 13, marginTop: 18}}>
            {["Claude", "Codex"].map((item) => (
              <div
                key={item}
                style={{...card, padding: "13px 20px", fontSize: 26, fontWeight: 760}}
              >
                {item}
              </div>
            ))}
            <div style={{fontSize: 28}}>→ 在常用 AI 里发起设计</div>
          </div>
          <div style={{marginTop: 12, fontSize: 20, color: "rgba(255,255,255,.62)"}}>功能示意</div>
        </div>
      );
    }
    if (scene.scene === "低起点与公开演示动作") {
      return (
        <div
          style={{
            ...base,
            top: 110,
            opacity: enter,
            display: "flex",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          <div style={{...card, padding: "20px 24px", flex: 1}}>
            <div style={{fontSize: 24, color: "rgba(255,255,255,.68)"}}>上线首日 · 开发者回顾</div>
            <div style={{fontSize: 72, fontWeight: 900, color: "#d9ff51"}}>7 人</div>
          </div>
          <div
            style={{
              ...card,
              padding: "20px 24px",
              flex: 1,
              display: "flex",
              alignItems: "center",
              fontSize: 34,
              fontWeight: 820,
            }}
          >
            随后发布到 X →
          </div>
        </div>
      );
    }
    if (scene.scene === "规模数字") {
      return (
        <div style={{...base, top: 108, opacity: enter}}>
          <div style={{...card, padding: "24px 30px"}}>
            <div style={{fontSize: 25, color: "rgba(255,255,255,.66)"}}>
              发布后一天 · 开发者披露
            </div>
            <div style={{fontSize: 98, lineHeight: 1.05, fontWeight: 920, color: "#d9ff51"}}>
              10,000+
            </div>
            <div style={{fontSize: 34, fontWeight: 740}}>人使用 Rikyū</div>
          </div>
        </div>
      );
    }
    if (scene.scene === "传播与用户反馈") {
      return (
        <div style={{...base, top: 108, opacity: enter}}>
          <div style={{...card, padding: "24px 30px"}}>
            <div style={{fontSize: 25, color: "rgba(255,255,255,.66)"}}>ITmedia 2026-08-13</div>
            <div style={{fontSize: 88, lineHeight: 1.05, fontWeight: 920, color: "#d9ff51"}}>
              5,000,000+
            </div>
            <div style={{fontSize: 32, fontWeight: 740}}>帖子展示 · 有人分享生成结果</div>
          </div>
        </div>
      );
    }
    if (scene.scene === "当前入口与定价") {
      return (
        <div style={{...base, top: 108, opacity: enter}}>
          <div style={{fontSize: 27, fontWeight: 800, color: "#d9ff51"}}>
            RIKYŪ · 现在可以这样开始
          </div>
          <div style={{display: "flex", gap: 16, marginTop: 14}}>
            <div style={{...card, padding: "20px 24px", flex: 1}}>
              <div style={{fontSize: 24, color: "rgba(255,255,255,.66)"}}>FREE</div>
              <div style={{fontSize: 48, fontWeight: 880}}>2,000 积分</div>
            </div>
            <div style={{...card, padding: "20px 24px", flex: 1}}>
              <div style={{fontSize: 24, color: "rgba(255,255,255,.66)"}}>BASIC</div>
              <div style={{fontSize: 48, fontWeight: 880}}>$5 / 月起</div>
              <div style={{fontSize: 22, marginTop: 6}}>SVG · 商用</div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  })();
  return (
    <AbsoluteFill style={{overflow: "hidden", background: "#090b10"}}>
      <Img
        src={src}
        style={{
          position: "absolute",
          inset: -80,
          width: width + 160,
          height: height + 160,
          objectFit: "cover",
          filter: "blur(58px) brightness(.42) saturate(.9)",
          transform: `scale(${1.12 + progress * 0.04})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          top: 330,
          bottom: 360,
          overflow: "hidden",
          borderRadius: 30,
          border: "1px solid rgba(255,255,255,.16)",
          boxShadow: "0 38px 100px rgba(0,0,0,.48)",
          background: "#fff",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transform: `scale(${scale})`,
          }}
        />
      </div>
      {overlay}
      {label && !isProductionMetaTag(label) ? (
        <div
          style={{
            position: "absolute",
            left: 58,
            bottom: 390,
            padding: "10px 16px",
            borderRadius: 999,
            background: "rgba(8,9,13,.94)",
            color: "#fff",
            fontSize: 24,
            fontWeight: 620,
            textShadow: "0 1px 2px rgba(0,0,0,.9)",
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
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lines = visibleOnScreenText(scene.onScreenText);
  const headline = lines[0] ?? "";
  const rest = lines.slice(1);
  const pulse = interpolate(frame % Math.round(fps * 2), [0, fps, fps * 2], [0.9, 1.04, 0.9]);
  const enter = interpolate(frame, [0, Math.round(fps * 0.55)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const Grid = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.24,
        backgroundImage:
          "linear-gradient(rgba(232,197,71,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(232,197,71,.22) 1px, transparent 1px)",
        backgroundSize: "72px 72px",
      }}
    />
  );
  const Source = ({children}: {children: React.ReactNode}) => (
    <div
      style={{
        position: "absolute",
        top: 118,
        left: 64,
        right: 64,
        color: COLORS.muted,
        fontSize: 25,
        letterSpacing: 0.4,
      }}
    >
      {children}
    </div>
  );
  const LogoMark = ({large = false}: {large?: boolean}) => {
    const size = large ? 520 : 360;
    return (
      <div style={{position: "relative", width: size, height: size, transform: `scale(${pulse})`}}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `8px solid ${COLORS.gold}`,
            borderRadius: "50%",
            boxShadow: "0 0 90px rgba(232,197,71,.28)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -42,
            bottom: -42,
            width: 5,
            background: "rgba(232,197,71,.55)",
            transform: "rotate(32deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "20%",
            top: "19%",
            color: COLORS.ink,
            fontSize: large ? 250 : 170,
            fontWeight: 860,
            lineHeight: 1,
          }}
        >
          R
        </div>
      </div>
    );
  };

  const sceneVisual = (() => {
    if (scene.scene === "hook-logo-result" || scene.scene === "geometric-process") {
      return (
        <>
          <Grid />
          <Source>功能演示 · ITmedia 2026-08-13</Source>
          <div
            style={{
              position: "absolute",
              top: 270,
              left: 280,
              opacity: scene.scene === "hook-logo-result" ? 1 : enter,
            }}
          >
            <LogoMark large />
          </div>
          <div
            style={{
              position: "absolute",
              top: 900,
              left: 80,
              right: 80,
              padding: "38px 44px",
              borderRadius: 30,
              background: "rgba(24,27,35,.92)",
              border: `2px solid ${COLORS.gold}`,
            }}
          >
            <div style={{fontSize: 84, fontWeight: 860, color: COLORS.gold}}>5,000,000+</div>
            <div style={{fontSize: 32, marginTop: 8}}>帖子展示 · 不是用户数</div>
          </div>
        </>
      );
    }
    if (scene.scene === "product-prompt-design") {
      return (
        <>
          <Source>Rikyū · 自然语言生成设计 · 功能演示</Source>
          <div
            style={{
              position: "absolute",
              top: 260,
              left: 64,
              right: 64,
              padding: 42,
              borderRadius: 34,
              background: COLORS.card,
              border: `1px solid ${COLORS.line}`,
              opacity: enter,
            }}
          >
            <div style={{fontSize: 28, color: COLORS.muted}}>你想设计什么？</div>
            <div style={{fontSize: 48, marginTop: 18}}>给咖啡店做一个 Logo</div>
            <div
              style={{height: 5, marginTop: 28, background: COLORS.gold, width: `${enter * 100}%`}}
            />
          </div>
          <div style={{position: "absolute", top: 610, left: 360}}>
            <LogoMark />
          </div>
          <div
            style={{position: "absolute", top: 1080, left: 80, right: 80, display: "flex", gap: 18}}
          >
            {["Logo", "网页", "社交", "印刷"].map((label) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: "28px 10px",
                  borderRadius: 22,
                  background: COLORS.card,
                  fontSize: 29,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </>
      );
    }
    if (scene.scene === "contrast-seven-users") {
      return (
        <>
          <Source>创始人公开回顾 · 2026 年 7 月</Source>
          <div style={{position: "absolute", top: 300, left: 80, right: 80, textAlign: "left"}}>
            <div style={{fontSize: 34, color: COLORS.muted}}>上线首日</div>
            <div style={{fontSize: 330, fontWeight: 900, lineHeight: 1, color: COLORS.gold}}>7</div>
            <div style={{fontSize: 58, fontWeight: 760}}>名用户</div>
            <div style={{marginTop: 110, height: 2, background: COLORS.line}} />
            <div style={{marginTop: 72, fontSize: 54, lineHeight: 1.35}}>
              后来，为什么一天内
              <br />
              有一万人来试？
            </div>
          </div>
        </>
      );
    }
    if (scene.scene === "ten-thousand-disclosure") {
      return (
        <>
          <Source>创始人公开披露 · 经 ITmedia 报道</Source>
          <div
            style={{
              position: "absolute",
              inset: "330px 64px auto",
              padding: "70px 48px",
              borderRadius: 38,
              background: COLORS.card,
              border: `2px solid ${COLORS.real}`,
              opacity: enter,
            }}
          >
            <div style={{fontSize: 34, color: COLORS.muted}}>发布后一天内</div>
            <div style={{fontSize: 180, fontWeight: 900, color: COLORS.real, letterSpacing: -8}}>
              10,000+
            </div>
            <div style={{fontSize: 52, fontWeight: 760}}>人使用 Rikyū</div>
            <div style={{fontSize: 28, marginTop: 46, color: COLORS.muted}}>
              2026-08-12 · 不是注册或留存口径
            </div>
          </div>
        </>
      );
    }
    if (scene.scene === "media-user-shares") {
      return (
        <>
          <Source>ITmedia 2026-08-13 · 用户公开分享</Source>
          <div style={{position: "absolute", top: 260, left: 70, right: 70}}>
            {["我的咖啡店 Logo", "几何过程很有趣", "生成结果分享"].map((label, index) => (
              <div
                key={label}
                style={{
                  marginTop: index ? -32 : 0,
                  marginLeft: index * 36,
                  padding: "40px",
                  height: 280,
                  borderRadius: 34,
                  background: index === 1 ? "#202633" : COLORS.card,
                  border: `1px solid ${COLORS.line}`,
                  transform: `rotate(${index - 1}deg)`,
                }}
              >
                <div style={{display: "flex", alignItems: "center", gap: 28}}>
                  <div
                    style={{
                      width: 110,
                      height: 110,
                      borderRadius: 55,
                      border: `5px solid ${COLORS.gold}`,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 58,
                      fontWeight: 850,
                    }}
                  >
                    R
                  </div>
                  <div style={{fontSize: 42, fontWeight: 750}}>{label}</div>
                </div>
                <div
                  style={{
                    marginTop: 30,
                    height: 12,
                    width: `${80 - index * 12}%`,
                    borderRadius: 9,
                    background: COLORS.line,
                  }}
                />
              </div>
            ))}
          </div>
        </>
      );
    }
    if (scene.scene === "pricing-mcp") {
      return (
        <>
          <Source>官网与条款 · 截至 2026-08-25</Source>
          <div
            style={{position: "absolute", top: 250, left: 70, right: 70, display: "flex", gap: 22}}
          >
            <div style={{flex: 1, padding: "50px 34px", borderRadius: 34, background: COLORS.card}}>
              <div style={{fontSize: 32, color: COLORS.muted}}>免费</div>
              <div style={{fontSize: 82, fontWeight: 880, color: COLORS.gold}}>2,000</div>
              <div style={{fontSize: 30}}>积分</div>
            </div>
            <div
              style={{
                flex: 1,
                padding: "50px 34px",
                borderRadius: 34,
                background: COLORS.card,
                border: `2px solid ${COLORS.real}`,
              }}
            >
              <div style={{fontSize: 32, color: COLORS.muted}}>商用 + SVG</div>
              <div style={{fontSize: 82, fontWeight: 880, color: COLORS.real}}>$5</div>
              <div style={{fontSize: 30}}>每月起</div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              top: 790,
              left: 100,
              right: 100,
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{padding: "28px 42px", borderRadius: 999, background: "#272d39", fontSize: 42}}
            >
              Claude / Codex
            </div>
            <div style={{height: 160, width: 5, background: COLORS.gold}} />
            <div
              style={{
                padding: "34px 64px",
                borderRadius: 999,
                background: COLORS.gold,
                color: COLORS.void,
                fontSize: 48,
                fontWeight: 850,
              }}
            >
              Rikyū
            </div>
            <div style={{fontSize: 29, color: COLORS.muted, marginTop: 26}}>
              MCP · 从外部发起设计
            </div>
          </div>
        </>
      );
    }
    if (scene.scene === "closing-process-price") {
      return (
        <>
          <Grid />
          <Source>功能演示 · 当前公开价格</Source>
          <div style={{position: "absolute", top: 280, left: 330}}>
            <LogoMark />
          </div>
          <div
            style={{
              position: "absolute",
              top: 860,
              left: 70,
              right: 70,
              padding: "44px",
              borderRadius: 34,
              background: COLORS.card,
              border: `2px solid ${COLORS.gold}`,
            }}
          >
            <div style={{fontSize: 44}}>首日 7 人 → 一天 10,000+ 人</div>
            <div style={{fontSize: 62, fontWeight: 860, marginTop: 32, color: COLORS.gold}}>
              免费试 · 商用 $5/月起
            </div>
          </div>
        </>
      );
    }
    return null;
  })();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: "0 96px",
        color: COLORS.ink,
        fontFamily: SANS,
        textAlign: "center",
        background: "radial-gradient(circle at 50% 35%, #171c26 0%, #08090d 62%)",
      }}
    >
      {sceneVisual ??
        (headline ? (
          <div style={{fontSize: 56, lineHeight: 1.2, fontWeight: 780}}>{headline}</div>
        ) : null)}
      {!sceneVisual && rest.length > 0 ? (
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

export const MediaShotOverlays: React.FC<{shot: MediaShot; hideSource?: boolean}> = ({
  shot,
  hideSource = false,
}) => {
  const badgeText = shot.overlays.badge?.text ?? "";
  const sourceLabel = shot.overlays.sourceLabel ?? "";
  const showBadge = Boolean(badgeText) && !isProductionMetaTag(badgeText);
  const showSource = !hideSource && Boolean(sourceLabel) && !isProductionMetaTag(sourceLabel);
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
            background: "rgba(8,9,13,.94)",
            color: "#fff",
            fontSize: 24,
            fontWeight: 620,
            textShadow: "0 1px 2px rgba(0,0,0,.9)",
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
  const calculatedOpacity = mediaShotVideoOpacityAtFrame({
    frame,
    fps,
    durationFrames: shot.durationFrames,
    fade: shot.fade,
    crossfadeMs: shot.crossfadeMs,
    isFirst,
  });
  const opacity = isFirst ? 1 : calculatedOpacity;
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
          {!shot.renderProxyMediaType?.startsWith("audio/") ? (
            <RealMediaEvidenceOverlay scene={scene} shot={shot} />
          ) : null}
        </>
      ) : shot.visualType === "official-screenshot" && shot.fallbackImagePath ? (
        <OfficialScreenshotLayer
          shot={shot}
          src={staticFile(shot.fallbackImagePath)}
          label={shot.overlays.sourceLabel ?? ""}
          scene={scene}
        />
      ) : (
        <FallbackVisualLayer scene={scene} shot={shot} />
      )}
      <MediaShotOverlays shot={shot} hideSource={shot.visualType === "official-screenshot"} />
    </AbsoluteFill>
  );
};
