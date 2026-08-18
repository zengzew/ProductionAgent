import React from "react";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import timelineRaw from "../../../content/episode-003/production/timeline.json";
import captionsRaw from "../../../content/episode-003/production/captions.generated.json";
import claimsRaw from "../../../content/episode-003/research/facts.json";
import sourcesRaw from "../../../content/episode-003/research/sources.json";
import {
  factSchema,
  generatedCaptionSchema,
  sourceSchema,
  timelineSchema,
  type Timeline,
} from "../../schemas/episode";
import {assertTimelineMatchesEpisode} from "../../lib/episode/render-contract";
import {fadeSceneOpacity} from "../../lib/delivery/scene-animation";
import {
  BackgroundCanvas,
  CLAMP,
  EvidenceStage,
  FlowCards,
  HighlightCaption,
  HighlightText,
  MetricCard,
  OfficialStill,
  reportingIdentity,
  SourceLabel,
  sourcePublishers,
} from "../shared";

const timeline = timelineSchema.parse(timelineRaw);
assertTimelineMatchesEpisode(timeline, "episode-003");
const claims = claimsRaw.map((claim) => factSchema.parse(claim));
const sources = sourcesRaw.map((source) => sourceSchema.parse(source));
const captions = captionsRaw.map((caption) => generatedCaptionSchema.parse(caption));
const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
const sourceMap = new Map(sources.map((source) => [source.id, source]));

const COLORS = {
  void: "#08090d",
  ink: "#f3efe4",
  muted: "#8d94a3",
  gold: "#e8c547",
  goldSoft: "rgba(232,197,71,.16)",
  paper: "#12141a",
  card: "#181b23",
  line: "#2c313c",
  demo: "#c9844a",
  live: "#5ee0c8",
  white: "#f7f4ea",
};

const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif';
const STILL_HOME = staticFile("episodes/episode-003/captured/manus-home.png");
const STILL_DESKTOP = staticFile("episodes/episode-003/captured/manus-desktop.png");
const STILL_MY_COMPUTER = staticFile("episodes/episode-003/captured/manus-my-computer.png");
const TASK_COPY = "整理竞品页，做成一页摘要";
const TITLE_HIGHLIGHTS = ["自己干活"];
const CAPTION_HIGHLIGHTS = [
  "八千万",
  "数百万",
  "2026",
  "执行引擎",
  "自己打开",
  "批准",
  "虚拟电脑",
  "云电脑",
  "桌面版",
];

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
  const drift = interpolate(frame, [0, 4000], [0, 36], {
    ...CLAMP,
    extrapolateRight: "extend",
  });
  return (
    <BackgroundCanvas
      background={`radial-gradient(circle at 50% 18%, #1a1710 0%, ${COLORS.void} 46%, #050507 100%)`}
      noisePlacement="after-content"
      noise={{
        baseFrequency: ".9",
        numOctaves: 3,
        rectOpacity: ".18",
        opacity: 0.16,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 248,
          height: 1,
          background: "rgba(232,197,71,.18)",
          transform: `translateY(${drift * 0.04}px)`,
        }}
      />
    </BackgroundCanvas>
  );
};

const DemoBadge: React.FC<{visible?: boolean}> = ({visible = true}) => {
  if (!visible) return null;
  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "10px 16px",
        borderRadius: 999,
        background: COLORS.demo,
        color: COLORS.white,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: 0.4,
      }}
    >
      功能演示
    </div>
  );
};

const StakeTitle: React.FC<{compact?: boolean}> = ({compact = false}) =>
  compact ? (
    <div style={{fontSize: 28, fontWeight: 730, color: COLORS.ink}}>
      为什么不聊天，
      <HighlightText
        text="要自己干活？"
        highlights={TITLE_HIGHLIGHTS}
        highlightColor={COLORS.gold}
      />
    </div>
  ) : (
    <div>
      <div
        style={{
          fontSize: 22,
          letterSpacing: 3,
          color: COLORS.gold,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        MANUS · 任务已发出
      </div>
      <div
        style={{
          fontSize: 44,
          lineHeight: 1.1,
          fontWeight: 780,
          letterSpacing: -1,
          color: COLORS.ink,
        }}
      >
        为什么不聊天
        <HighlightText
          text=" 要自己干活？"
          highlights={TITLE_HIGHLIGHTS}
          highlightColor={COLORS.gold}
        />
      </div>
    </div>
  );

const TaskChip: React.FC<{text: string}> = ({text}) => (
  <div
    style={{
      alignSelf: "flex-end",
      maxWidth: 620,
      padding: "20px 24px",
      borderRadius: "26px 26px 8px 26px",
      background: COLORS.gold,
      color: "#1a1404",
      fontSize: 32,
      fontWeight: 730,
      boxShadow: "0 16px 30px rgba(0,0,0,.28)",
    }}
  >
    {text}
  </div>
);

const WorkingBrowser: React.FC<{progress: number; label?: string}> = ({
  progress,
  label = "功能演示 · 它正在打开网页办事",
}) => {
  const frame = useCurrentFrame();
  const typed = "competitors.dev/brief";
  const shown = typed.slice(
    0,
    Math.max(8, Math.floor(interpolate(frame, [0, 22], [8, typed.length], CLAMP))),
  );
  const rows = [
    ["竞品 A 定价页", "已打开 · 抓取套餐表"],
    ["竞品 B 功能栏", "已滚动到对照项"],
    ["一页摘要", "正在写入 notes.md"],
  ];
  const visibleRows = Math.max(
    1,
    Math.min(rows.length, 1 + Math.floor(interpolate(frame, [8, 36], [0, 3], CLAMP))),
  );
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto auto 1fr auto",
        overflow: "hidden",
        borderRadius: 22,
        border: `1px solid ${COLORS.line}`,
        background: "#f6f4ee",
        color: "#161410",
        boxShadow: "0 22px 50px rgba(0,0,0,.32)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          background: "#111318",
          color: COLORS.muted,
          fontSize: 22,
        }}
      >
        <span style={{width: 10, height: 10, borderRadius: 99, background: "#e37a6b"}} />
        <span style={{width: 10, height: 10, borderRadius: 99, background: COLORS.gold}} />
        <span style={{width: 10, height: 10, borderRadius: 99, background: COLORS.live}} />
        <div
          style={{
            marginLeft: 8,
            flex: 1,
            padding: "8px 14px",
            borderRadius: 999,
            background: "#1d212b",
            color: COLORS.white,
            fontFamily: "Menlo, monospace",
            fontSize: 22,
          }}
        >
          {shown}
        </div>
      </div>
      <div style={{height: 6, background: "#e7e1d4"}}>
        <div style={{width: `${18 + progress * 70}%`, height: "100%", background: COLORS.gold}} />
      </div>
      <div style={{padding: "28px 28px 18px", display: "grid", alignContent: "start", gap: 16}}>
        <div style={{fontSize: 36, fontWeight: 760}}>竞品页正在被拆开</div>
        {rows.slice(0, visibleRows).map(([title, detail], index) => (
          <div
            key={title}
            style={{
              padding: "18px 20px",
              borderRadius: 16,
              background: index === visibleRows - 1 ? "#fff7d6" : "#fff",
              border: "1px solid #e4ddd0",
              transform: `translateY(${interpolate(frame, [8 + index * 8, 16 + index * 8], [16, 0], CLAMP)}px)`,
            }}
          >
            <div style={{fontSize: 28, fontWeight: 730}}>{title}</div>
            <div style={{marginTop: 6, fontSize: 24, color: "#6d675c"}}>{detail}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: "12px 18px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <SourceLabel
          label={label}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(8,9,13,.88)",
            color: COLORS.white,
            fontSize: 22,
          }}
        />
      </div>
    </div>
  );
};

const HookTaskOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const load = interpolate(frame, [0, 28], [0.42, 0.78], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 18}}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{fontSize: 30, color: COLORS.gold, fontWeight: 750}}>任务已发出</div>
        <div style={{fontSize: 26, color: COLORS.muted}}>网页已打开</div>
      </div>
      <div style={{position: "relative", minHeight: 0}}>
        <WorkingBrowser progress={load} />
        <div style={{position: "absolute", right: 22, bottom: 36, zIndex: 3}}>
          <TaskChip text={TASK_COPY} />
        </div>
      </div>
    </div>
  );
};

const HookMetric: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = enter(frame, fps);
  return (
    <div style={{height: "100%", position: "relative"}}>
      <MetricCard
        style={{height: "100%", position: "relative", gap: 16}}
        kicker={<div style={{fontSize: 28, color: COLORS.muted}}>上线以来 · 公司披露</div>}
        value={
          <div
            style={{
              fontSize: 148,
              lineHeight: 0.88,
              fontWeight: 780,
              letterSpacing: -6,
              color: COLORS.gold,
              transform: `scale(${0.94 + pop * 0.06})`,
              transformOrigin: "left center",
            }}
          >
            8000万+
          </div>
        }
        unit={<div style={{fontSize: 40, fontWeight: 720}}>台虚拟电脑</div>}
        caveat={
          <div
            style={{
              padding: "12px 18px",
              borderLeft: `4px solid ${COLORS.gold}`,
              color: COLORS.gold,
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            不是用户数
          </div>
        }
        question={<div style={{fontSize: 36, color: COLORS.ink}}>为什么不聊天，要自己干活？</div>}
      />
    </div>
  );
};

const HookCloud: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame % 40, [0, 20, 40], [0.35, 1, 0.35], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "1fr auto", gap: 18}}>
      <OfficialStill
        src={STILL_HOME}
        label="真实页面截图 · manus.im"
        objectPosition="50% 58%"
        zoom={1.35}
        coverTop={0}
        kenBurns
        style={{
          borderRadius: 22,
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 22px 50px rgba(0,0,0,.28)",
        }}
      />
      <FlowCards
        items={[
          {
            key: "browser",
            title: <div style={{color: COLORS.gold, fontSize: 24, fontWeight: 730}}>浏览器</div>,
            detail: (
              <div style={{marginTop: 10, fontSize: 28, lineHeight: 1.3, color: COLORS.ink}}>
                云电脑打开网页
              </div>
            ),
            style: cardStyle,
          },
          {
            key: "files",
            title: <div style={{color: COLORS.gold, fontSize: 24, fontWeight: 730}}>文件</div>,
            detail: (
              <div style={{marginTop: 10, fontSize: 28, lineHeight: 1.3, color: COLORS.ink}}>
                读写结果
              </div>
            ),
            style: cardStyle,
          },
          {
            key: "run",
            title: <div style={{color: COLORS.gold, fontSize: 24, fontWeight: 730}}>继续跑</div>,
            detail: (
              <div style={{marginTop: 10, fontSize: 28, lineHeight: 1.3, color: COLORS.ink}}>
                关掉页面也能跑
              </div>
            ),
            footer: (
              <div
                style={{
                  marginTop: 14,
                  height: 7,
                  borderRadius: 99,
                  background: "#2a2618",
                }}
              >
                <div
                  style={{
                    width: `${40 + pulse * 40}%`,
                    height: "100%",
                    background: COLORS.gold,
                  }}
                />
              </div>
            ),
            style: cardStyle,
          },
        ]}
      />
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  padding: "18px 16px 20px",
  borderRadius: 18,
  background: COLORS.card,
  border: `1px solid ${COLORS.line}`,
};

const ChoiceEngine: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const recede = interpolate(frame, [0, 28], [1, 0.72], CLAMP);
  const fileY = interpolate(enter(frame, fps, 10), [0, 1], [22, 0]);
  const blink = frame % 24 < 12 ? 1 : 0.16;
  const scroll = interpolate(frame, [12, 180], [0, 18], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 16}}>
      <div style={{fontSize: 44, fontWeight: 760, lineHeight: 1.15, color: COLORS.ink}}>
        执行引擎
        <br />
        <span style={{color: COLORS.gold}}>一台任务一台云电脑</span>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "0.68fr 1.32fr", gap: 16, minHeight: 0}}>
        <div
          style={{
            alignSelf: "start",
            opacity: recede,
            transform: `translateY(${(1 - recede) * 10}px) scale(0.92)`,
          }}
        >
          <TaskChip text={TASK_COPY} />
        </div>
        <div style={{display: "grid", gridTemplateRows: "1fr auto", gap: 12, minHeight: 0}}>
          <div style={{minHeight: 0, transform: `translateY(${-scroll}px)`}}>
            <WorkingBrowser progress={0.66} label="功能演示 · 云电脑浏览器" />
          </div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12}}>
            <div
              style={{
                ...cardStyle,
                transform: `translateY(${fileY}px)`,
              }}
            >
              <div style={{color: COLORS.gold, fontWeight: 730, fontSize: 24}}>文件</div>
              <div style={{marginTop: 10, fontSize: 28}}>brief.pdf</div>
              <div style={{marginTop: 6, fontSize: 28}}>notes.md</div>
            </div>
            <div
              style={{
                ...cardStyle,
                background: "#0d1014",
                fontFamily: "Menlo, monospace",
                fontSize: 24,
                color: COLORS.live,
              }}
            >
              <div style={{color: COLORS.gold, fontWeight: 730, fontSize: 22, fontFamily: SANS}}>
                命令行
              </div>
              <div style={{marginTop: 12}}>
                $ collect --src web
                <span style={{opacity: blink}}>▌</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DesktopApproval: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = enter(frame, fps, 22);
  const showBlog = frame >= 88;
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "1fr auto", gap: 16}}>
      <OfficialStill
        src={showBlog ? STILL_MY_COMPUTER : STILL_DESKTOP}
        label={showBlog ? "真实页面截图 · manus.im/blog" : "真实页面截图 · manus.im/desktop"}
        objectPosition={showBlog ? "50% 42%" : "50% 32%"}
        zoom={showBlog ? 1.2 : 1.45}
        coverTop={0}
        kenBurns
        style={{
          borderRadius: 22,
          border: `1px solid ${COLORS.line}`,
          boxShadow: "0 22px 50px rgba(0,0,0,.28)",
        }}
      />
      <div
        style={{
          ...cardStyle,
          padding: 24,
          opacity: pop,
          transform: `translateY(${(1 - pop) * 18}px)`,
        }}
      >
        <div style={{fontSize: 26, color: COLORS.muted}}>2026.03.16 桌面版 · 本机命令</div>
        <div style={{marginTop: 10, fontSize: 30, fontFamily: "Menlo, monospace"}}>
          mkdir invoices && rename *.pdf
        </div>
        <div style={{display: "flex", gap: 14, marginTop: 18}}>
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 999,
              background: COLORS.gold,
              color: "#1a1404",
              fontWeight: 760,
              fontSize: 28,
            }}
          >
            允许一次
          </div>
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 999,
              border: `1px solid ${COLORS.line}`,
              fontSize: 28,
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
  const load = interpolate(frame, [0, 80], [0.42, 0.9], CLAMP);
  const reveal = interpolate(frame, [8, 28], [0, 1], CLAMP);
  return (
    <div style={{height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 16}}>
      <div style={{opacity: reveal}}>
        <div style={{fontSize: 26, color: COLORS.muted}}>公司口径 · 截至 2025.12.29</div>
        <div style={{fontSize: 56, fontWeight: 760, lineHeight: 1.1, color: COLORS.gold}}>
          数百万用户
        </div>
        <div style={{fontSize: 30, color: COLORS.ink, marginTop: 6}}>开头那个任务，还在跑</div>
      </div>
      <div style={{position: "relative", minHeight: 0}}>
        <WorkingBrowser progress={load} label="功能演示 · 同一条任务仍在打开网页" />
        <div style={{position: "absolute", right: 22, bottom: 36, zIndex: 3}}>
          <TaskChip text={TASK_COPY} />
        </div>
      </div>
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
      return <div style={{fontSize: 56, fontWeight: 750}}>{scene.onScreenText.join(" · ")}</div>;
  }
};

const SceneShell: React.FC<{
  scene: Timeline["scenes"][number];
  children: React.ReactNode;
}> = ({scene, children}) => {
  const frame = useCurrentFrame();
  const opacity = fadeSceneOpacity(frame, scene.durationFrames, scene.index === 0);
  const showDemo =
    scene.visualIntent.includes("功能演示") || scene.onScreenText.includes("功能演示");
  return (
    <AbsoluteFill style={{color: COLORS.ink, fontFamily: SANS, opacity}}>
      <Background />
      <EvidenceStage
        title={<StakeTitle compact={scene.index > 0} />}
        badge={<DemoBadge visible={showDemo} />}
        source={
          <SourceLabel
            label={`${reportingLabel(scene.claimIds)} · ${evidencePublishers(scene.claimIds)}`}
            style={{
              color: COLORS.muted,
              fontSize: 24,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          />
        }
      >
        {children}
      </EvidenceStage>
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
      <HighlightCaption
        captions={captions}
        highlights={CAPTION_HIGHLIGHTS}
        highlightColor={COLORS.gold}
        style={{
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
          color: COLORS.white,
          background: "rgba(8,9,13,.92)",
          fontFamily: SANS,
          fontSize: 46,
          lineHeight: 1.28,
          fontWeight: 650,
          letterSpacing: 0.4,
          whiteSpace: "pre-line",
          zIndex: 20,
        }}
      />
    </AbsoluteFill>
  );
};
