import React from "react";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import timelineRaw from "../episode-003-timeline.generated.json";
import captionsRaw from "../episode-003-captions.generated.json";
import claimsRaw from "../../content/episode-003/research/facts.json";
import sourcesRaw from "../../content/episode-003/research/sources.json";
import {
  factSchema,
  generatedCaptionSchema,
  sourceSchema,
  timelineSchema,
  type Timeline,
} from "../schemas/episode";
import {assertTimelineMatchesEpisode} from "../lib/render-contract";
import {fadeSceneOpacity} from "../lib/scene-animation";
import {
  BackgroundCanvas,
  CaptionLayer,
  CLAMP,
  reportingIdentity,
  SourceLabel,
  sourcePublishers,
} from "./shared";

const timeline = timelineSchema.parse(timelineRaw);
assertTimelineMatchesEpisode(timeline, "episode-003");
const claims = claimsRaw.map((claim) => factSchema.parse(claim));
const sources = sourcesRaw.map((source) => sourceSchema.parse(source));
const captions = captionsRaw.map((caption) => generatedCaptionSchema.parse(caption));
const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
const sourceMap = new Map(sources.map((source) => [source.id, source]));

const COLORS = {
  void: "#0b1220",
  ink: "#e8eef8",
  muted: "#8ea0b8",
  cyan: "#5ee0c8",
  cyanSoft: "#18463f",
  amber: "#f0b45a",
  white: "#f7fbff",
  card: "#142033",
  line: "#2a3b55",
  demo: "#c9844a",
};

const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif';

const enter = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 18, stiffness: 120, mass: 0.7},
  });

const evidencePublishers = (claimIds: string[]): string =>
  sourcePublishers({
    claimIds,
    claimsById: claimMap,
    sourcesById: sourceMap,
    reverseClaims: true,
  });

const reportingLabel = (claimIds: string[]): string =>
  reportingIdentity({
    claimIds,
    claimsById: claimMap,
    labels: {
      inference: "边界",
      company: "官方说明",
      founder: "创始人口径",
      verified: "交叉核对",
    },
  });

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 4000], [0, 120], {
    ...CLAMP,
    extrapolateRight: "extend",
  });
  return (
    <BackgroundCanvas
      background={`radial-gradient(circle at 78% 12%, #1a3350 0%, ${COLORS.void} 52%, #070b14 100%)`}
      noisePlacement="after-content"
      noise={{
        baseFrequency: ".85",
        numOctaves: 3,
        rectOpacity: ".22",
        opacity: 0.18,
      }}
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            width: 480 + index * 80,
            height: 480 + index * 80,
            borderRadius: "50%",
            border: "1px solid rgba(94,224,200,.12)",
            left: 280 + index * 40 + drift * 0.04,
            top: 220 + index * 90,
          }}
        />
      ))}
    </BackgroundCanvas>
  );
};

const DemoBadge: React.FC<{visible?: boolean}> = ({visible = true}) => {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 54,
        right: 56,
        padding: "10px 18px",
        borderRadius: 999,
        background: "rgba(201,132,74,.92)",
        color: COLORS.white,
        fontSize: 28,
        fontWeight: 700,
        zIndex: 8,
      }}
    >
      功能演示
    </div>
  );
};

const SourceStill: React.FC<{path: string; label: string; objectPosition?: string}> = ({
  path,
  label,
  objectPosition = "center top",
}) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: 28,
      border: `1px solid ${COLORS.line}`,
      boxShadow: "0 22px 60px rgba(0,0,0,.28)",
      background: COLORS.card,
      height: "100%",
    }}
  >
    <Img
      src={staticFile(path)}
      style={{width: "100%", height: "100%", objectFit: "cover", objectPosition}}
    />
    <SourceLabel
      label={label}
      style={{
        position: "absolute",
        left: 18,
        bottom: 18,
        padding: "10px 16px",
        borderRadius: 999,
        background: "rgba(11,18,32,.88)",
        color: COLORS.white,
        fontSize: 28,
      }}
    />
  </div>
);

const BrowserWindow: React.FC<{progress: number; title?: string}> = ({
  progress,
  title = "research.example / brief",
}) => (
  <div
    style={{
      borderRadius: 28,
      overflow: "hidden",
      border: `1px solid ${COLORS.line}`,
      background: COLORS.card,
      boxShadow: "0 24px 50px rgba(0,0,0,.28)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "18px 22px",
        background: "#0f1a2c",
        color: COLORS.muted,
        fontSize: 24,
      }}
    >
      <span style={{width: 12, height: 12, borderRadius: 99, background: "#e37a6b"}} />
      <span style={{width: 12, height: 12, borderRadius: 99, background: COLORS.amber}} />
      <span style={{width: 12, height: 12, borderRadius: 99, background: COLORS.cyan}} />
      <div style={{marginLeft: 12, flex: 1}}>{title}</div>
    </div>
    <div style={{height: 8, background: COLORS.cyanSoft}}>
      <div
        style={{
          width: `${18 + progress * 62}%`,
          height: "100%",
          background: COLORS.cyan,
        }}
      />
    </div>
    <div style={{padding: "28px 30px 34px", display: "grid", gap: 16}}>
      <div style={{height: 22, width: "72%", background: "rgba(232,238,248,.16)", borderRadius: 8}} />
      <div style={{height: 18, width: "94%", background: "rgba(232,238,248,.1)", borderRadius: 8}} />
      <div style={{height: 18, width: "86%", background: "rgba(232,238,248,.1)", borderRadius: 8}} />
      <div style={{height: 120, background: "rgba(94,224,200,.12)", borderRadius: 16}} />
    </div>
  </div>
);

const TaskBubble: React.FC<{text: string}> = ({text}) => (
  <div
    style={{
      alignSelf: "flex-end",
      maxWidth: 620,
      padding: "22px 28px",
      borderRadius: "28px 28px 8px 28px",
      background: COLORS.cyan,
      color: "#08231d",
      fontSize: 36,
      fontWeight: 700,
      boxShadow: "0 16px 30px rgba(0,0,0,.18)",
    }}
  >
    {text}
  </div>
);

const HookTaskOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const load = interpolate(frame, [0, 28], [0.42, 0.78], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 36}}>
      <div style={{fontSize: 34, color: COLORS.cyan, fontWeight: 700, letterSpacing: 1}}>
        任务已发出
      </div>
      <div style={{display: "grid", gap: 28}}>
        <TaskBubble text="整理竞品页，做成一页摘要" />
        <BrowserWindow progress={load} />
      </div>
    </div>
  );
};

const HookMetric: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = enter(frame, fps);
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 28}}>
      <div style={{fontSize: 30, color: COLORS.muted}}>上线以来 · 公司披露</div>
      <div
        style={{
          fontSize: 168,
          lineHeight: 0.88,
          fontWeight: 780,
          letterSpacing: -6,
          transform: `scale(${0.92 + pop * 0.08})`,
        }}
      >
        8000万+
      </div>
      <div style={{fontSize: 42, fontWeight: 700}}>台虚拟电脑</div>
      <div
        style={{
          marginTop: 12,
          padding: "16px 22px",
          borderLeft: `4px solid ${COLORS.amber}`,
          color: COLORS.amber,
          fontSize: 32,
        }}
      >
        不是用户数
      </div>
      <div style={{fontSize: 40, color: COLORS.ink}}>为什么不聊天，要自己干活？</div>
    </div>
  );
};

const HookCloud: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame % 40, [0, 20, 40], [0.35, 1, 0.35], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "1.15fr 0.85fr", gap: 28}}>
      <SourceStill
        path="episodes/episode-003/captured/manus-home.png"
        label="真实页面截图 · manus.im"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {[
          ["浏览器", "自己打开网页"],
          ["文件", "读写结果"],
          ["继续跑", "关掉页面也在"],
        ].map(([title, detail], index) => (
          <div
            key={title}
            style={{
              padding: "22px 18px",
              borderRadius: 22,
              background: COLORS.card,
              border: `1px solid ${COLORS.line}`,
            }}
          >
            <div style={{color: COLORS.cyan, fontSize: 26, fontWeight: 700}}>{title}</div>
            <div style={{marginTop: 10, fontSize: 28, lineHeight: 1.3}}>{detail}</div>
            {index === 2 ? (
              <div
                style={{
                  marginTop: 16,
                  height: 8,
                  borderRadius: 99,
                  background: COLORS.cyanSoft,
                }}
              >
                <div style={{width: `${40 + pulse * 40}%`, height: "100%", background: COLORS.cyan}} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const ChoiceEngine: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fileY = interpolate(enter(frame, fps, 8), [0, 1], [18, 0]);
  const blink = frame % 24 < 12 ? 1 : 0.15;
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 28}}>
      <div style={{fontSize: 52, fontWeight: 760, lineHeight: 1.15}}>
        一台任务
        <br />
        一台云电脑
      </div>
      <div style={{display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18, minHeight: 520}}>
        <BrowserWindow progress={0.66} title="cloud-sandbox / browser" />
        <div style={{display: "grid", gap: 16}}>
          <div
            style={{
              padding: 22,
              borderRadius: 22,
              background: COLORS.card,
              border: `1px solid ${COLORS.line}`,
              transform: `translateY(${fileY}px)`,
            }}
          >
            <div style={{color: COLORS.cyan, fontWeight: 700, fontSize: 26}}>文件</div>
            <div style={{marginTop: 10, fontSize: 30}}>brief.pdf</div>
            <div style={{marginTop: 8, fontSize: 30}}>notes.md</div>
          </div>
          <div
            style={{
              padding: 22,
              borderRadius: 22,
              background: "#0d1828",
              border: `1px solid ${COLORS.line}`,
              fontFamily: "Menlo, monospace",
              fontSize: 26,
              color: COLORS.cyan,
            }}
          >
            $ collect --src web
            <span style={{opacity: blink}}>▌</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const DesktopApproval: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = enter(frame, fps, 18);
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "1.15fr 0.72fr", gap: 24}}>
      <SourceStill
        path="episodes/episode-003/captured/manus-desktop.png"
        label="真实页面截图 · manus.im/desktop"
      />
      <div
        style={{
          padding: 28,
          borderRadius: 24,
          background: COLORS.card,
          border: `1px solid ${COLORS.line}`,
          opacity: pop,
          transform: `translateY(${(1 - pop) * 20}px)`,
        }}
      >
        <div style={{fontSize: 28, color: COLORS.muted}}>本机命令</div>
        <div style={{marginTop: 10, fontSize: 34, fontFamily: "Menlo, monospace"}}>
          mkdir invoices && rename *.pdf
        </div>
        <div style={{display: "flex", gap: 16, marginTop: 22}}>
          <div
            style={{
              padding: "14px 22px",
              borderRadius: 999,
              background: COLORS.cyan,
              color: "#08231d",
              fontWeight: 760,
              fontSize: 30,
            }}
          >
            允许一次
          </div>
          <div
            style={{
              padding: "14px 22px",
              borderRadius: 999,
              border: `1px solid ${COLORS.line}`,
              fontSize: 30,
              color: COLORS.muted,
            }}
          >
            始终允许
          </div>
        </div>
      </div>
    </div>
  );
};

const EndingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const load = interpolate(frame, [0, 50], [0.42, 0.86], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 32}}>
      <div style={{fontSize: 30, color: COLORS.muted}}>公司口径 · 截至 2025.12.29</div>
      <div style={{fontSize: 72, fontWeight: 760, lineHeight: 1.1}}>数百万用户</div>
      <div style={{fontSize: 36, color: COLORS.ink}}>把任务交给它</div>
      <TaskBubble text="整理竞品页，做成一页摘要" />
      <BrowserWindow progress={load} />
    </div>
  );
};

const SceneVisual: React.FC<{scene: Timeline["scenes"][number]}> = ({scene}) => {
  switch (scene.scene) {
    case "hook-task-open":
      return <HookTaskOpen />;
    case "hook-metric-question":
      return <HookMetric />;
    case "hook-cloud-model":
      return <HookCloud />;
    case "choice-action-engine":
      return <ChoiceEngine />;
    case "desktop-approval":
      return <DesktopApproval />;
    case "ending-still-working":
      return <EndingScene />;
    default:
      return (
        <div style={{fontSize: 56, fontWeight: 750}}>{scene.onScreenText.join(" · ")}</div>
      );
  }
};

const SceneShell: React.FC<{
  scene: Timeline["scenes"][number];
  children: React.ReactNode;
}> = ({scene, children}) => {
  const frame = useCurrentFrame();
  const opacity = fadeSceneOpacity(frame, scene.durationFrames, scene.index === 0);
  const showDemo = scene.visualIntent.includes("功能演示") || scene.onScreenText.includes("功能演示");
  return (
    <AbsoluteFill style={{color: COLORS.ink, fontFamily: SANS, opacity}}>
      <Background />
      <DemoBadge visible={showDemo} />
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 120,
          bottom: 430,
        }}
      >
        {children}
      </div>
      <SourceLabel
        label={`${reportingLabel(scene.claimIds)} · ${evidencePublishers(scene.claimIds)}`}
        style={{
          position: "absolute",
          left: 64,
          bottom: 430,
          color: COLORS.muted,
          fontSize: 24,
        }}
      />
    </AbsoluteFill>
  );
};

export const ManusEpisode: React.FC = () => {
  return (
    <AbsoluteFill style={{background: COLORS.void, fontFamily: SANS}}>
      {timeline.scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
          premountFor={30}
        >
          <SceneShell scene={scene}>
            <SceneVisual scene={scene} />
          </SceneShell>
          <Audio src={staticFile(scene.audio)} />
        </Sequence>
      ))}
      <CaptionLayer
        captions={captions}
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 300,
          minHeight: 98,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "18px 30px",
          borderRadius: 24,
          color: COLORS.white,
          background: "rgba(11,18,32,.9)",
          fontFamily: SANS,
          fontSize: 48,
          lineHeight: 1.3,
          fontWeight: 650,
          letterSpacing: 0.5,
          whiteSpace: "pre-line",
          zIndex: 20,
        }}
      />
    </AbsoluteFill>
  );
};
