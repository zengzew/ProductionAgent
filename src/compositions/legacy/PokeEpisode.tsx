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
import timelineRaw from "../../../content/episode-001/production/timeline.json";
import captionsRaw from "../../../content/episode-001/production/captions.generated.json";
import claimsRaw from "../../../content/episode-001/research/facts.json";
import sourcesRaw from "../../../content/episode-001/research/sources.json";
import {
  factSchema,
  generatedCaptionSchema,
  sourceSchema,
  timelineSchema,
  type Timeline,
} from "../../schemas/episode";
import {assertTimelineMatchesEpisode} from "../../lib/episode/render-contract";
import {fadeSceneOpacity} from "../../lib/delivery/scene-animation";
import {buildPokeSoundCues} from "./poke-sound-design";
import {
  BackgroundCanvas,
  CaptionLayer,
  CLAMP,
  reportingIdentity,
  SourceLabel,
  sourcePublishers,
} from "../shared";

const timeline = timelineSchema.parse(timelineRaw);
assertTimelineMatchesEpisode(timeline, "episode-001");
const claims = claimsRaw.map((claim) => factSchema.parse(claim));
const sources = sourcesRaw.map((source) => sourceSchema.parse(source));
const captions = captionsRaw.map((caption) => generatedCaptionSchema.parse(caption));
const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
const sourceMap = new Map(sources.map((source) => [source.id, source]));

const COLORS = {
  paper: "#eeeae4",
  paperLight: "#f8f5ef",
  ink: "#15171b",
  muted: "#626873",
  blue: "#3d78b5",
  blueSoft: "#cfe0ed",
  blueMist: "#e7f0f5",
  line: "#c8c6c0",
  caution: "#a65c43",
  green: "#4a725f",
  white: "#ffffff",
};

const SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", "Times New Roman", serif';
const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif';

const enter = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 18, stiffness: 115, mass: 0.7},
  });

const fadeFirstScene = (frame: number, duration: number) =>
  interpolate(frame, [Math.max(0, duration - 10), duration], [1, 0], CLAMP);

const PaperBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 3000], [0, 70], {
    ...CLAMP,
    extrapolateRight: "extend",
  });
  return (
    <BackgroundCanvas
      background={`
          radial-gradient(circle at 78% 18%, rgba(156,199,226,.55), transparent 34%),
          radial-gradient(circle at 12% 92%, rgba(188,215,231,.42), transparent 31%),
          linear-gradient(145deg, ${COLORS.paperLight} 0%, ${COLORS.paper} 68%, #e8e3dc 100%)
        `}
      overflow="hidden"
      noise={{
        baseFrequency: ".9",
        numOctaves: 3,
        rectOpacity: ".16",
        opacity: 0.19,
        mixBlendMode: "multiply",
      }}
    >
      <svg
        viewBox={"0 0 1080 1920"}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.42,
          transform: `translateY(${drift * 0.08}px)`,
        }}
      >
        {Array.from({length: 7}).map((_, index) => {
          const offset = index * 24;
          const path = `M 600 ${40 + offset} C 760 ${100 + offset}, 820 ${210 + offset}, 1080 ${180 + offset}`;
          return (
            <path
              key={index}
              d={path}
              fill="none"
              stroke={COLORS.blue}
              strokeWidth={1.4}
              opacity={0.45 - index * 0.04}
            />
          );
        })}
      </svg>
    </BackgroundCanvas>
  );
};

const reportingLabel = (claimIds: string[]): {label: string; color: string} => {
  return reportingIdentity({
    claimIds,
    claimsById: claimMap,
    labels: {
      inference: {label: "分析", color: COLORS.blue},
      company: {label: "公司口径", color: COLORS.caution},
      founder: {label: "访谈", color: COLORS.caution},
      verified: {label: "事实", color: COLORS.green},
    },
  });
};

const evidencePublishers = (claimIds: string[]): string =>
  sourcePublishers({claimIds, claimsById: claimMap, sourcesById: sourceMap});

const sceneEvidenceLabel = (scene: Timeline["scenes"][number]): string => {
  if (scene.scene === "launch-timeline") {
    return "Poke 官方 Release Notes · 真实页面截图";
  }
  if (scene.id === "seg-001" || scene.id === "seg-012") {
    return "Poke 官方能力说明 · 功能演示";
  }
  if (scene.id === "seg-002" || scene.id === "seg-009") {
    return "Cognition 披露 · 消息数不是用户数";
  }
  if (scene.id === "seg-008") return "Poke 官方 Release Notes · 真实页面截图";
  if (scene.id === "seg-011") return "Cognition 收购公告 · 真实页面截图";
  return evidencePublishers(scene.claimIds);
};

const SceneShell: React.FC<{
  scene: Timeline["scenes"][number];
  children: React.ReactNode;
}> = ({scene, children}) => {
  const frame = useCurrentFrame();
  const badge = reportingLabel(scene.claimIds);
  const padX = 72;
  const padTop = 76;
  return (
    <AbsoluteFill
      style={{
        color: COLORS.ink,
        fontFamily: SANS,
        opacity:
          scene.index === 0
            ? fadeFirstScene(frame, scene.durationFrames)
            : fadeSceneOpacity(frame, scene.durationFrames),
      }}
    >
      <PaperBackground />
      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          top: padTop,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 24,
          letterSpacing: 2,
          fontWeight: 650,
          color: COLORS.muted,
          zIndex: 5,
        }}
      >
        <div>
          <span style={{color: COLORS.blue, marginRight: 14}}>
            {String(scene.index + 1).padStart(2, "0")}
          </span>
          PRODUCT STORY · POKE
        </div>
        <div
          style={{
            border: `1px solid ${badge.color}88`,
            color: badge.color,
            padding: "10px 16px",
            borderRadius: 999,
            letterSpacing: 0,
            fontSize: 22,
            background: `${COLORS.paperLight}cc`,
          }}
        >
          {badge.label}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          top: 150,
          bottom: 520,
          zIndex: 2,
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          bottom: 462,
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: COLORS.muted,
          fontSize: 32,
          zIndex: 5,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 20,
            background: COLORS.blue,
            flex: "0 0 auto",
          }}
        />
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sceneEvidenceLabel(scene)}
        </span>
      </div>
    </AbsoluteFill>
  );
};

const BigTitle: React.FC<{
  children: React.ReactNode;
  size?: number;
}> = ({children, size}) => (
  <div
    style={{
      fontFamily: SERIF,
      fontSize: size ?? 88,
      lineHeight: 1.08,
      fontWeight: 700,
      letterSpacing: -3,
    }}
  >
    {children}
  </div>
);

const Phone: React.FC<{
  compact?: boolean;
  staticState?: boolean;
}> = ({compact = false, staticState = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = staticState ? 1 : enter(frame, fps, 8);
  const width = compact ? 760 : 820;
  return (
    <div
      style={{
        width,
        height: compact ? width * 0.63 : width * 0.76,
        borderRadius: 54,
        background: "rgba(255,255,255,.88)",
        border: "2px solid rgba(40,45,52,.16)",
        boxShadow: "0 26px 70px rgba(45,59,72,.17)",
        overflow: "hidden",
        transform: `scale(${0.9 + scale * 0.1})`,
      }}
    >
      <div
        style={{
          height: 96,
          borderBottom: `1px solid ${COLORS.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontWeight: 700,
          fontSize: 28,
        }}
      >
        <span
          style={{
            width: 52,
            height: 52,
            borderRadius: 99,
            background: COLORS.blueSoft,
            display: "grid",
            placeItems: "center",
            fontFamily: SERIF,
            color: COLORS.blue,
          }}
        >
          P
        </span>
        Poke
        <span style={{fontSize: 20, color: COLORS.muted}}>AI</span>
      </div>
      <div style={{padding: 38}}>
        <div
          style={{
            maxWidth: "86%",
            background: COLORS.blueMist,
            border: `1px solid ${COLORS.blueSoft}`,
            borderRadius: "30px 30px 30px 8px",
            padding: "26px 30px",
            fontSize: 34,
            lineHeight: 1.42,
            opacity: staticState ? 1 : interpolate(frame, [10, 24], [0, 1], CLAMP),
            transform: `translateY(${
              staticState ? 0 : interpolate(frame, [10, 24], [26, 0], CLAMP)
            }px)`,
          }}
        >
          早上好。今天有三件事需要你确认，要现在一起处理吗？
        </div>
      </div>
    </div>
  );
};

const HookScene: React.FC<{
  scene: Timeline["scenes"][number];
}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = enter(frame, fps, 2);
  if (scene.scene === "hook-calendar-action") {
    const confirmation = interpolate(frame, [0, 18, 34], [0.94, 1.03, 1], CLAMP);
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          alignContent: "center",
          gap: 56,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            opacity: 1,
          }}
        >
          <div
            style={{
              maxWidth: "82%",
              padding: "28px 34px",
              borderRadius: "30px 30px 8px 30px",
              background: COLORS.ink,
              color: COLORS.white,
              fontSize: 42,
              lineHeight: 1.35,
              boxShadow: "0 22px 55px rgba(21,23,27,.24)",
            }}
          >
            <div
              style={{
                marginBottom: 12,
                color: COLORS.blueSoft,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              已发送
            </div>
            把周三的会
            <br />
            改到下午三点
          </div>
        </div>
        <div
          style={{
            alignSelf: "center",
            padding: "40px 42px",
            borderRadius: 34,
            background: "rgba(255,255,255,.84)",
            border: `2px solid ${COLORS.blue}`,
            boxShadow: "0 26px 75px rgba(61,120,181,.18)",
            opacity: 1,
            transform: `scale(${confirmation})`,
            transformOrigin: "center center",
          }}
        >
          <div style={{color: COLORS.blue, fontSize: 26, fontWeight: 760}}>
            日历已更新 · 功能演示
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 78,
              fontWeight: 760,
              marginTop: 18,
            }}
          >
            周三 15:00
          </div>
          <div style={{fontSize: 28, color: COLORS.muted, marginTop: 12}}>与项目组开会</div>
        </div>
      </div>
    );
  }
  if (scene.scene === "hook-metric-cost") {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          alignContent: "center",
          gap: 44,
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 800,
            fontSize: 230,
            lineHeight: 0.82,
            letterSpacing: -12,
            transform: `scale(${interpolate(frame, [0, 20], [0.82, 1], CLAMP)})`,
            transformOrigin: "left center",
          }}
        >
          1 亿+
        </div>
        <div style={{fontSize: 34, color: COLORS.muted}}>约三个月 · 消息往来</div>
        <div style={{display: "flex", gap: 12, alignItems: "center", marginTop: 4}}>
          {Array.from({length: 6}).map((_, index) => (
            <div
              key={index}
              style={{
                width: 24 + index * 5,
                height: 14,
                borderRadius: 999,
                background: index === 5 ? COLORS.caution : COLORS.blue,
                opacity: interpolate(frame, [index * 5, index * 5 + 10], [0.2, 0.9], CLAMP),
              }}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            padding: "26px 30px",
            borderLeft: `8px solid ${COLORS.blue}`,
            background: "rgba(61,120,181,.08)",
            color: COLORS.ink,
            fontFamily: SERIF,
            fontSize: 52,
            fontWeight: 760,
            lineHeight: 1.25,
            opacity: interpolate(frame, [24, 38], [0, 1], CLAMP),
          }}
        >
          一个小动作
          <br />
          变成一个产品问题
        </div>
        <div style={{fontSize: 22, color: COLORS.muted}}>
          消息数，不是用户数 · Cognition 披露 + 创始人口述
        </div>
      </div>
    );
  }
  if (scene.scene === "hook-core-question") {
    const pulse = 0.55 + Math.sin(frame / 5) * 0.2;
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          alignContent: "center",
          gap: 46,
        }}
      >
        <div style={{display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 18}}>
          <TaskCard label="联系人里的 Poke" detail="你只发一句" accent={COLORS.blue} delay={2} />
          <div style={{alignSelf: "center", fontSize: 54, color: COLORS.blue}}>→</div>
          <div
            style={{
              display: "grid",
              gap: 14,
              paddingTop: 10,
              opacity: interpolate(frame, [12, 28], [0, 1], CLAMP),
            }}
          >
            {["读邮件", "改日历", "主动提醒"].map((label, index) => (
              <div
                key={label}
                style={{
                  padding: "18px 22px",
                  borderRadius: 999,
                  border: `2px solid ${index === 2 ? COLORS.caution : COLORS.blue}`,
                  background: "rgba(255,255,255,.72)",
                  fontSize: 27,
                  textAlign: "center",
                  boxShadow: `0 0 ${24 * pulse}px rgba(61,120,181,.14)`,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div>
          <BigTitle size={78}>为什么收起工作台？</BigTitle>
          <div
            style={{
              marginTop: 24,
              fontSize: 40,
              lineHeight: 1.35,
              color: COLORS.caution,
              fontWeight: 720,
            }}
          >
            用户又怎样把它带出邮箱？
          </div>
        </div>
      </div>
    );
  }
  if (scene.scene === "hook-beta-actions") {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          alignContent: "center",
          gap: 42,
        }}
      >
        <BigTitle size={98}>
          提醒吃药
          <br />
          问球赛结果
          <br />
          出门前看天气
        </BigTitle>
      </div>
    );
  }
  if (scene.scene === "hook-source" || scene.scene === "hook-result") {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: SERIF,
              fontWeight: 760,
              fontSize: 190,
              lineHeight: 0.9,
            }}
          >
            1 亿+
          </div>
          <div
            style={{
              marginTop: 44,
              fontSize: 38,
              color: COLORS.muted,
            }}
          >
            过去约三个月消息量
          </div>
          <div
            style={{
              margin: `${38}px auto 0`,
              display: "inline-flex",
              gap: 18,
              alignItems: "center",
              padding: "18px 25px",
              border: `1px solid ${COLORS.caution}88`,
              borderRadius: 999,
              color: COLORS.caution,
              fontSize: 26,
            }}
          >
            Cognition · 截至 2026.07.23
          </div>
          {scene.scene === "hook-source" ? (
            <div
              style={{
                marginTop: 70,
                fontSize: 64,
                fontWeight: 760,
              }}
            >
              消息量 <span style={{color: COLORS.caution}}>≠</span> 用户数
            </div>
          ) : (
            <div
              style={{
                marginTop: 70,
                fontSize: 42,
                color: COLORS.muted,
              }}
            >
              Cognition 披露的消息往来规模
            </div>
          )}
        </div>
      </div>
    );
  }
  if (scene.scene === "hook-direction-change") {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          alignContent: "center",
          gap: 46,
        }}
      >
        <BigTitle>
          最早围着邮箱做，
          <br />
          后来进入联系人列表
        </BigTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 1fr",
            alignItems: "center",
            gap: 20,
          }}
        >
          <TaskCard
            label="最初方向"
            detail="邮件客户端与自动化"
            accent={COLORS.caution}
            delay={2}
          />
          <div style={{fontSize: 62, color: COLORS.blue, textAlign: "center"}}>→</div>
          <TaskCard label="后来" detail="联系人列表里的主动消息" accent={COLORS.blue} delay={12} />
        </div>
        <div style={{fontSize: 24, color: COLORS.muted}}>
          创始人回忆 + 官方能力说明 · 主动消息为功能演示
        </div>
      </div>
    );
  }
  if (scene.scene === "hook-question") {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          alignItems: "center",
          gridTemplateColumns: "1fr",
          gap: 30,
        }}
      >
        <BigTitle size={112}>
          让一个联系人
          <br />
          读邮件、改日历？
        </BigTitle>
        <div style={{display: "grid", gap: 20}}>
          <TaskCard label="先授权" detail="连接邮件与日历" accent={COLORS.caution} delay={2} />
          <TaskCard label="再动手" detail="草拟回复、安排会议" accent={COLORS.blue} delay={10} />
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr",
        alignItems: "center",
        gap: 42,
      }}
    >
      <div style={{transform: `translateY(${(1 - pop) * 30}px)`, opacity: pop}}>
        <BigTitle>
          日程有变化，
          <br />
          Poke 先来提醒
        </BigTitle>
        <div
          style={{
            marginTop: 44,
            fontFamily: SERIF,
            fontSize: 220,
            lineHeight: 0.82,
            fontWeight: 760,
            letterSpacing: -10,
          }}
        >
          1 亿+
        </div>
        <div
          style={{
            marginTop: 38,
            paddingTop: 24,
            borderTop: `2px solid ${COLORS.blue}`,
            fontSize: 26,
            color: COLORS.muted,
            lineHeight: 1.5,
          }}
        >
          约三个月消息量
          <br />
          Cognition · 截至 2026.07.23
        </div>
      </div>
      <Phone />
    </div>
  );
};

const SourceStill: React.FC<{
  path: string;
  label: string;
  objectPosition?: string;
}> = ({path, label, objectPosition = "center"}) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: 32,
      border: `1px solid ${COLORS.line}`,
      boxShadow: "0 22px 60px rgba(34,46,59,.14)",
      background: COLORS.white,
      height: "100%",
    }}
  >
    <Img
      src={staticFile(path)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition,
      }}
    />
    <SourceLabel
      label={label}
      style={{
        position: "absolute",
        left: 20,
        bottom: 20,
        padding: "12px 18px",
        borderRadius: 999,
        background: "rgba(21,23,27,.86)",
        color: COLORS.white,
        fontSize: 32,
      }}
    />
  </div>
);

const TaskCard: React.FC<{
  label: string;
  detail: string;
  accent: string;
  delay: number;
}> = ({label, detail, accent, delay}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 14], [0, 1], CLAMP);
  return (
    <div
      style={{
        padding: "28px 30px",
        borderRadius: 24,
        border: `1px solid ${COLORS.line}`,
        background: "rgba(248,245,239,.82)",
        boxShadow: "0 12px 28px rgba(35,48,62,.08)",
        opacity,
        transform: `translateY(${(1 - opacity) * 28}px)`,
      }}
    >
      <div
        style={{
          color: accent,
          fontWeight: 750,
          fontSize: 26,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div style={{fontSize: 34, lineHeight: 1.3}}>{detail}</div>
    </div>
  );
};

const PainScene: React.FC = () => (
  <div style={{height: "100%", display: "grid", alignContent: "center", gap: 42}}>
    <BigTitle>
      邮件里的日期，
      <br />
      要搬三次
    </BigTitle>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 20,
      }}
    >
      <TaskCard label="邮件" detail="客户确认周四前回复" accent={COLORS.caution} delay={4} />
      <TaskCard label="日历" detail="周三下午有空档" accent={COLORS.blue} delay={12} />
      <TaskCard label="待办" detail="复制日期，再补一句提醒" accent={COLORS.green} delay={20} />
    </div>
    <div
      style={{
        fontSize: 24,
        color: COLORS.muted,
        borderLeft: `3px solid ${COLORS.caution}`,
        paddingLeft: 16,
      }}
    >
      团队与投资方访谈
    </div>
  </div>
);

const OriginScene: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: "1fr",
      alignItems: "center",
      gap: 26,
    }}
  >
    <div>
      <div style={{fontSize: 24, color: COLORS.blue, fontWeight: 750}}>起点</div>
      <BigTitle size={78}>邮件自动化</BigTitle>
      <div
        style={{
          marginTop: 28,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 24,
          background: "rgba(255,255,255,.72)",
          padding: 30,
          fontSize: 28,
          lineHeight: 1.65,
        }}
      >
        收件箱
        <div style={{height: 1, background: COLORS.line, margin: "16px 0"}} />
        自动整理、草拟、提醒
      </div>
    </div>
    <div
      style={{
        fontSize: 56,
        color: COLORS.blue,
        transform: "rotate(90deg)",
        textAlign: "center",
      }}
    >
      →
    </div>
    <div>
      <div style={{fontSize: 24, color: COLORS.caution, fontWeight: 750}}>访谈反馈</div>
      <BigTitle size={78}>那它该出现在哪儿？</BigTitle>
      <div
        style={{
          marginTop: 28,
          color: COLORS.muted,
          fontSize: 28,
          lineHeight: 1.6,
        }}
      >
        “用户不愿再学一个新界面”
        <br />
        <span style={{fontSize: ".78em"}}>创始人回忆</span>
      </div>
    </div>
  </div>
);

const ValidationScene: React.FC = () => {
  const requests = ["提醒我吃药", "告诉我球赛结果", "今天要穿外套吗？"];
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 38,
        alignItems: "center",
      }}
    >
      <BigTitle size={78}>
        用户很快把它
        <br />
        用出了邮件
      </BigTitle>
      <div style={{display: "grid", gap: 24}}>
        {requests.map((request, index) => (
          <TaskCard
            key={request}
            label="Beta 请求"
            detail={request}
            accent={index === 2 ? COLORS.caution : COLORS.blue}
            delay={index * 10}
          />
        ))}
        <div style={{fontSize: 22, color: COLORS.muted}}>创始人转述 · 非独立日志审计</div>
      </div>
    </div>
  );
};

const DateClarifier: React.FC = () => (
  <div style={{height: "100%", display: "grid", alignContent: "center", gap: 64}}>
    <BigTitle>Poke 早在 2025 就出现了</BigTitle>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 26,
      }}
    >
      <div
        style={{
          padding: 38,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 28,
          background: "rgba(255,255,255,.62)",
        }}
      >
        <div style={{fontFamily: SERIF, fontSize: 70, fontWeight: 700}}>2025.09</div>
        <div style={{fontSize: 34, marginTop: 18}}>已经公开，仍有限制</div>
        <div style={{fontSize: 22, color: COLORS.muted, marginTop: 16}}>
          公司称公开发布，但仍有准入限制
        </div>
      </div>
      <div
        style={{
          padding: 38,
          border: `2px solid ${COLORS.blue}`,
          borderRadius: 28,
          background: COLORS.blueMist,
        }}
      >
        <div style={{fontFamily: SERIF, fontSize: 70, fontWeight: 700}}>2026.03</div>
        <div style={{fontSize: 34, marginTop: 18}}>候补名单取消</div>
        <div style={{fontSize: 22, color: COLORS.muted, marginTop: 16}}>Recipes 同日开放</div>
      </div>
    </div>
    <div style={{fontSize: 40, fontWeight: 760}}>
      2026 取消名单 <span style={{color: COLORS.caution}}>≠</span> 2026 首次出现
    </div>
  </div>
);

const LaunchScene: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 36,
      alignItems: "center",
    }}
  >
    <div>
      <div style={{fontFamily: SERIF, fontSize: 84, fontWeight: 760}}>03.19</div>
      <BigTitle size={76}>
        候补名单取消
        <br />
        Recipes 开放
      </BigTitle>
      <div
        style={{
          marginTop: 30,
          padding: "16px 20px",
          display: "inline-block",
          borderRadius: 999,
          border: `1px solid ${COLORS.blue}`,
          color: COLORS.blue,
          fontSize: 24,
        }}
      >
        从等待准入到一般可用
      </div>
    </div>
    <div style={{height: 610}}>
      <SourceStill
        path="episodes/episode-001/captured/poke-release-notes.png"
        label="Poke 官方 Release Notes · 2026.03.19"
        objectPosition="58% 58%"
      />
    </div>
  </div>
);

const MessageNativeScene: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 34,
      alignItems: "center",
    }}
  >
    <div>
      <div style={{color: COLORS.blue, fontWeight: 750, fontSize: 26}}>一个取舍</div>
      <BigTitle>消息列表就是入口</BigTitle>
      <div style={{marginTop: 26, fontSize: 30, lineHeight: 1.65}}>
        你在这里找它
        <br />
        它也从这里找你
      </div>
    </div>
    <div style={{height: 650}}>
      <SourceStill
        path="episodes/episode-001/captured/poke-home.png"
        label="Poke 官方主页 · 2026.07.28 抓取"
        objectPosition="50% 56%"
      />
    </div>
  </div>
);

const ActionLoopScene: React.FC = () => {
  const items = [
    {label: "读邮件", detail: "找到日期和上下文"},
    {label: "改日历", detail: "移动或新建日程"},
    {label: "设提醒", detail: "动作完成前交给用户核对"},
  ];
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 52}}>
      <div>
        <div style={{color: COLORS.blue, fontWeight: 750, fontSize: 26}}>拿到授权以后</div>
        <BigTitle>它真能动日历</BigTitle>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 20,
        }}
      >
        {items.map((item, index) => (
          <TaskCard
            key={item.label}
            label={item.label}
            detail={item.detail}
            accent={index === 2 ? COLORS.green : COLORS.blue}
            delay={index * 10}
          />
        ))}
      </div>
      <div
        style={{
          color: COLORS.caution,
          fontSize: 25,
          borderLeft: `3px solid ${COLORS.caution}`,
          paddingLeft: 18,
        }}
      >
        Poke 条款要求用户核对日程安排和重要决定
      </div>
    </div>
  );
};

const ProactivePermissionRiskScene: React.FC = () => {
  const frame = useCurrentFrame();
  const review = interpolate(frame, [150, 178], [0, 1], CLAMP);
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 34,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{color: COLORS.blue, fontSize: 26, fontWeight: 760}}>它先来找你</div>
        <BigTitle size={74}>
          少切窗口，
          <br />
          结果仍要核对
        </BigTitle>
        <div
          style={{
            marginTop: 30,
            padding: "24px 28px",
            borderRadius: 24,
            background: COLORS.ink,
            color: COLORS.white,
            fontSize: 28,
            lineHeight: 1.45,
          }}
        >
          Poke：会议时间变了。
          <br />
          要现在一起改吗？
        </div>
      </div>
      <div style={{position: "relative", minHeight: 620}}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: 32,
            borderRadius: 32,
            background: "rgba(255,255,255,.82)",
            border: `2px solid ${COLORS.blue}`,
            boxShadow: "0 25px 70px rgba(61,120,181,.16)",
          }}
        >
          <div style={{fontSize: 24, color: COLORS.blue, fontWeight: 760}}>已授权 · 功能演示</div>
          <div style={{fontFamily: SERIF, fontSize: 62, marginTop: 28}}>周四 14:00</div>
          <div style={{fontSize: 28, color: COLORS.muted, marginTop: 14}}>项目复盘</div>
          <div
            style={{
              marginTop: 42,
              height: 3,
              background: COLORS.line,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -11,
                left: `${interpolate(frame, [45, 120], [8, 74], CLAMP)}%`,
                width: 24,
                height: 24,
                borderRadius: 99,
                background: review > 0 ? COLORS.green : COLORS.blue,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 42,
              padding: "22px 24px",
              borderLeft: `6px solid ${COLORS.green}`,
              background: `rgba(74,114,95,${0.04 + review * 0.08})`,
              color: COLORS.green,
              fontSize: 26,
              opacity: review,
            }}
          >
            操作完成
            <br />
            请核对日历时间
          </div>
        </div>
      </div>
    </div>
  );
};

const RecipesScene: React.FC = () => {
  const parts = ["初始上下文", "第一条消息", "所需集成", "分享链接"];
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 38,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{color: COLORS.blue, fontWeight: 750, fontSize: 26}}>Recipes</div>
        <BigTitle>
          一次交代，
          <br />
          做成一条链接
        </BigTitle>
        <div style={{fontSize: 28, color: COLORS.muted, marginTop: 24}}>
          背景、开场消息、服务连接都放在同一张卡里
        </div>
      </div>
      <div
        style={{
          padding: 32,
          borderRadius: 30,
          border: `1px solid ${COLORS.line}`,
          background: "rgba(255,255,255,.66)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {parts.map((part, index) => (
          <TaskCard
            key={part}
            label={`0${index + 1}`}
            detail={part}
            accent={index === 3 ? COLORS.green : COLORS.blue}
            delay={index * 7}
          />
        ))}
        <div
          style={{
            gridColumn: "1 / -1",
            paddingTop: 18,
            color: COLORS.muted,
            fontSize: 22,
          }}
        >
          同一套设置，可以发给下一个人
        </div>
      </div>
    </div>
  );
};

const RecipeReleaseScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 34,
      }}
    >
      <div>
        <div style={{color: COLORS.blue, fontWeight: 760, fontSize: 25}}>Recipe</div>
        <BigTitle size={70}>一套设置，发给下一个人</BigTitle>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 22,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            alignContent: "center",
            gap: 16,
            padding: 24,
            borderRadius: 28,
            background: "rgba(255,255,255,.75)",
            border: `1px solid ${COLORS.line}`,
            transform: `translateX(${interpolate(frame, [0, 35], [-40, 0], CLAMP)}px)`,
          }}
        >
          {["背景设定", "开场白", "所需服务", "分享链接"].map((item, index) => (
            <div
              key={item}
              style={{
                padding: "18px 20px",
                borderRadius: 18,
                background: index === 3 ? COLORS.blue : COLORS.paperLight,
                color: index === 3 ? COLORS.white : COLORS.ink,
                fontSize: 24,
                opacity: interpolate(frame, [index * 8, index * 8 + 12], [0, 1], CLAMP),
              }}
            >
              {item}
            </div>
          ))}
          <div style={{fontSize: 20, color: COLORS.muted}}>账户仍需接收者授权</div>
        </div>
        <SourceStill
          path="episodes/episode-001/captured/poke-release-notes.png"
          label="Poke Release Notes · 2026.03.19"
          objectPosition="58% 57%"
        />
      </div>
    </div>
  );
};

const GrowthScene: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 30,
      alignItems: "center",
    }}
  >
    <div>
      <div style={{fontFamily: SERIF, fontSize: 190, lineHeight: 0.84}}>1 亿+</div>
      <div style={{fontSize: 34, marginTop: 28}}>统计项：消息</div>
      <div style={{fontSize: 23, color: COLORS.muted, lineHeight: 1.7}}>
        约三个月 · 截至 2026.07.23
        <br />
        Cognition
      </div>
      <div
        style={{
          marginTop: 28,
          padding: 24,
          borderRadius: 22,
          border: `1px solid ${COLORS.caution}`,
          color: COLORS.caution,
          fontWeight: 700,
          fontSize: 26,
          lineHeight: 1.6,
        }}
      >
        用户数：未公布
        <br />
        留存：未公布
        <br />
        成功任务数：未公布
      </div>
    </div>
    <div style={{height: 620}}>
      <SourceStill
        path="episodes/episode-001/captured/cognition-announcement.png"
        label="Cognition · 2026.07.23"
        objectPosition="61% 55%"
      />
    </div>
  </div>
);

const GrowthCostCounterScene: React.FC = () => {
  const frame = useCurrentFrame();
  const messages = ["改一下日历", "提醒我吃药", "查明天的天气", "告诉我球赛结果"];
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 36}}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          fontSize: 23,
          color: COLORS.muted,
        }}
      >
        {[
          ["约三个月", "统计窗口"],
          ["1 亿+", "消息往来"],
          ["≠ 用户数", "只看消息规模"],
        ].map(([date, label], index) => (
          <div
            key={date}
            style={{
              padding: "22px 18px",
              borderTop: `4px solid ${index === 2 ? COLORS.caution : COLORS.blue}`,
              background: "rgba(255,255,255,.64)",
              opacity: interpolate(frame, [index * 18, index * 18 + 14], [0, 1], CLAMP),
            }}
          >
            <div style={{fontFamily: SERIF, fontSize: 40, color: COLORS.ink}}>{date}</div>
            <div style={{marginTop: 8}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 26}}>
        <div style={{display: "grid", gap: 14, alignContent: "center"}}>
          {messages.map((message, index) => (
            <div
              key={message}
              style={{
                padding: "18px 22px",
                borderRadius: "22px 22px 6px 22px",
                background: index === 0 ? COLORS.ink : "rgba(255,255,255,.76)",
                color: index === 0 ? COLORS.white : COLORS.ink,
                border: index === 0 ? "none" : `1px solid ${COLORS.line}`,
                fontSize: 24,
                transform: `translateX(${interpolate(
                  frame,
                  [index * 9, index * 9 + 18],
                  [-42, 0],
                  CLAMP,
                )}px)`,
                opacity: interpolate(frame, [index * 9, index * 9 + 18], [0, 1], CLAMP),
              }}
            >
              {message}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            placeItems: "center",
            alignSelf: "center",
            minHeight: 360,
            borderRadius: 36,
            border: `2px solid ${COLORS.blue}`,
            background: "rgba(61,120,181,.08)",
            opacity: interpolate(frame, [28, 48], [0, 1], CLAMP),
          }}
        >
          <div style={{textAlign: "center"}}>
            <div
              style={{
                width: 100,
                height: 100,
                margin: "0 auto 24px",
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: COLORS.blue,
                color: COLORS.white,
                fontFamily: SERIF,
                fontSize: 54,
              }}
            >
              P
            </div>
            <div style={{fontSize: 30, fontWeight: 760}}>同一个联系人入口</div>
            <div style={{marginTop: 12, color: COLORS.muted, fontSize: 21}}>
              Poke · 官方入口说明
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AppleScene: React.FC = () => (
  <div style={{height: "100%", display: "grid", alignContent: "center", gap: 48}}>
    <div>
      <div style={{fontFamily: SERIF, fontSize: 74, fontWeight: 760}}>2026.06.04</div>
      <BigTitle>
        进入 Apple
        <br />
        Messages for Business
      </BigTitle>
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 22,
      }}
    >
      <TaskCard
        label="Poke 公告"
        detail="进入 Apple 商业消息渠道"
        accent={COLORS.caution}
        delay={2}
      />
      <TaskCard label="实际变化" detail="新增一个消息分发渠道" accent={COLORS.blue} delay={10} />
      <TaskCard label="日期" detail="2026.06.04" accent={COLORS.muted} delay={18} />
    </div>
    <div style={{fontSize: 23, color: COLORS.muted}}>TechCrunch 同日报道</div>
  </div>
);

const TechnologyScene: React.FC = () => {
  const stages = [
    {title: "模型", text: "按任务选择"},
    {title: "授权", text: "邮件与日历"},
    {title: "工具", text: "MCP 支持"},
    {title: "动作", text: "读邮件 / 改日历 / 发提醒"},
  ];
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 54}}>
      <div>
        <BigTitle>现在可确认的四块能力</BigTitle>
        <div style={{fontSize: 28, color: COLORS.muted, marginTop: 20}}>
          并列展示，不代表 Poke 已披露内部编排
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        {stages.map((stage, index) => (
          <div
            key={stage.title}
            style={{
              minHeight: 210,
              padding: 28,
              border: `1px solid ${index === 1 ? COLORS.caution : COLORS.line}`,
              borderRadius: 26,
              background: index === 1 ? "rgba(166,92,67,.06)" : "rgba(255,255,255,.64)",
            }}
          >
            <div style={{fontSize: 24, color: COLORS.blue}}>0{index + 1}</div>
            <div
              style={{
                fontFamily: SERIF,
                fontWeight: 720,
                fontSize: 44,
                marginTop: 18,
              }}
            >
              {stage.title}
            </div>
            <div
              style={{
                whiteSpace: "pre-line",
                fontSize: 22,
                color: COLORS.muted,
                marginTop: 12,
                lineHeight: 1.5,
              }}
            >
              {stage.text}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: 24,
          background: "rgba(21,23,27,.88)",
          color: COLORS.white,
          borderRadius: 20,
          fontSize: 24,
        }}
      >
        机制示意，非内部架构 · 用户决定能读什么、能改什么
      </div>
    </div>
  );
};

const ReliabilityPlatformScene: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "grid",
      alignContent: "center",
      gap: 46,
    }}
  >
    <BigTitle>
      动到真实账户，
      <br />
      错误和平台规则都会落地
    </BigTitle>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 22,
      }}
    >
      <TaskCard
        label="用户责任"
        detail="日程安排和业务决定仍要核对"
        accent={COLORS.caution}
        delay={2}
      />
      <TaskCard
        label="平台边界"
        detail="WhatsApp 规则曾改变可用地区"
        accent={COLORS.blue}
        delay={12}
      />
    </div>
    <div style={{fontSize: 23, color: COLORS.muted, lineHeight: 1.6}}>
      Poke 服务条款 · Poke Release Notes · 欧盟委员会临时措施
    </div>
  </div>
);

const RiskScene: React.FC = () => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 30,
      alignItems: "center",
    }}
  >
    <div>
      <BigTitle size={76}>
        每次自动化，
        <br />
        都会继续产生推理成本
      </BigTitle>
      <div style={{display: "grid", gap: 16, marginTop: 34}}>
        {[
          ["实时任务", "新邮件自动化、航班状态检查"],
          ["创始人口述", "Poke 运行昂贵，也很难盈利"],
          ["随后发生", "Cognition 于 2026.07.23 宣布收购"],
        ].map(([title, detail], index) => (
          <div
            key={title}
            style={{
              padding: "22px 24px",
              borderLeft: `4px solid ${index === 2 ? COLORS.blue : COLORS.caution}`,
              background: "rgba(255,255,255,.58)",
            }}
          >
            <div style={{fontSize: 27, fontWeight: 750}}>{title}</div>
            <div
              style={{
                fontSize: 21,
                color: COLORS.muted,
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              {detail}
            </div>
          </div>
        ))}
      </div>
      <div style={{fontSize: 21, color: COLORS.muted, marginTop: 20}}>
        成本与收购只按时间先后展示，不声明因果
      </div>
    </div>
    <div style={{height: 560}}>
      <SourceStill
        path="episodes/episode-001/captured/cognition-announcement.png"
        label="Cognition · 2026.07.23"
        objectPosition="60% 48%"
      />
    </div>
  </div>
);

const CostCallChainScene: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = (offset: number) => 0.35 + 0.65 * ((Math.sin((frame - offset) / 8) + 1) / 2);
  const calls = [
    ["新邮件到达", "自动化再跑一次"],
    ["航班还没落地", "状态继续刷新"],
    ["任务仍在进行", "模型与工具继续调用"],
  ];
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 42,
      }}
    >
      <div>
        <div style={{color: COLORS.caution, fontSize: 26, fontWeight: 760}}>你只发了一句</div>
        <BigTitle size={78}>后台还在继续跑</BigTitle>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "0.76fr 1.24fr", gap: 26}}>
        <div
          style={{
            alignSelf: "center",
            padding: "28px 30px",
            borderRadius: "28px 28px 8px 28px",
            background: COLORS.ink,
            color: COLORS.white,
            fontSize: 34,
            lineHeight: 1.35,
          }}
        >
          帮我盯着
          <br />
          这趟航班
        </div>
        <div style={{display: "grid", gap: 18, alignContent: "center"}}>
          {calls.map(([title, detail], index) => (
            <div
              key={title}
              style={{
                padding: "24px 26px",
                borderRadius: 22,
                border: `2px solid rgba(166,92,67,${pulse(index * 7)})`,
                background: `rgba(166,92,67,${0.025 + pulse(index * 7) * 0.05})`,
              }}
            >
              <div style={{fontSize: 26, fontWeight: 760}}>{title}</div>
              <div
                style={{
                  fontSize: 22,
                  color: COLORS.caution,
                  marginTop: 8,
                }}
              >
                {detail}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{fontSize: 22, color: COLORS.muted}}>创始人口述 · 不推算单次调用数量或金额</div>
    </div>
  );
};

const AcquisitionInfrastructureScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 28,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.7fr 1.3fr",
          gap: 26,
          alignItems: "end",
        }}
      >
        <div>
          <div style={{fontFamily: SERIF, fontSize: 66, fontWeight: 760}}>07.23</div>
          <div style={{fontSize: 22, color: COLORS.muted}}>2026</div>
        </div>
        <div
          style={{
            borderLeft: `7px solid ${COLORS.blue}`,
            paddingLeft: 24,
            color: COLORS.blue,
            fontSize: 31,
            lineHeight: 1.4,
            opacity: interpolate(frame, [0, 18], [0, 1], CLAMP),
          }}
        >
          产品来到
          <br />
          一个公开新阶段
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 26,
          minHeight: 0,
        }}
      >
        <SourceStill
          path="episodes/episode-001/captured/cognition-announcement.png"
          label="Cognition 收购公告 · 2026.07.23"
          objectPosition="58% 44%"
        />
        <div
          style={{
            alignSelf: "center",
            padding: "28px 30px",
            borderRadius: 28,
            background: "rgba(61,120,181,.09)",
            border: `1px solid ${COLORS.blue}`,
            opacity: interpolate(frame, [45, 70], [0, 1], CLAMP),
          }}
        >
          <div style={{color: COLORS.blue, fontSize: 23}}>公告里的下一步</div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 48,
              lineHeight: 1.25,
              marginTop: 14,
            }}
          >
            接入 Cognition
            <br />
            的模型与基础设施
          </div>
          <div style={{fontSize: 21, color: COLORS.muted, marginTop: 18}}>
            暂时照常使用 · 长期整合未定
          </div>
        </div>
      </div>
    </div>
  );
};

const ConclusionScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        alignContent: "center",
        gap: 36,
      }}
    >
      <div>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24}}>
          {["工作台收起", "联系人留下", "用户带出邮箱"].map((label, index) => (
            <div
              key={label}
              style={{
                padding: "12px 17px",
                borderRadius: 999,
                background: index === 2 ? COLORS.blue : "rgba(255,255,255,.76)",
                color: index === 2 ? COLORS.white : COLORS.ink,
                border: index === 2 ? "none" : `1px solid ${COLORS.line}`,
                fontSize: 22,
                opacity: interpolate(frame, [index * 16, index * 16 + 14], [0, 1], CLAMP),
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <BigTitle size={72}>
          发一句话
          <br />
          日历已经改好了
        </BigTitle>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "0.88fr 1.12fr", gap: 24}}>
        <div
          style={{
            alignSelf: "center",
            padding: "26px 28px",
            borderRadius: "28px 28px 8px 28px",
            background: COLORS.ink,
            color: COLORS.white,
            fontSize: 31,
            lineHeight: 1.4,
            opacity: interpolate(frame, [34, 52], [0, 1], CLAMP),
          }}
        >
          把周三的会
          <br />
          改到下午三点
        </div>
        <div
          style={{
            alignSelf: "center",
            padding: "30px 32px",
            borderRadius: 30,
            background: "rgba(255,255,255,.86)",
            border: `2px solid ${COLORS.blue}`,
            boxShadow: "0 24px 62px rgba(61,120,181,.16)",
            opacity: interpolate(frame, [52, 72], [0, 1], CLAMP),
          }}
        >
          <div style={{color: COLORS.blue, fontSize: 22, fontWeight: 760}}>
            日历已更新 · 功能演示
          </div>
          <div
            style={{
              marginTop: 18,
              fontFamily: SERIF,
              fontSize: 56,
              fontWeight: 760,
            }}
          >
            周三 15:00
          </div>
          <div style={{marginTop: 10, color: COLORS.muted, fontSize: 22}}>与项目组开会</div>
        </div>
      </div>
    </div>
  );
};

const SceneVisual: React.FC<{
  scene: Timeline["scenes"][number];
}> = ({scene}) => {
  switch (scene.scene) {
    case "hook-result":
    case "hook-beta-actions":
    case "hook-calendar-action":
    case "hook-metric-cost":
    case "hook-core-question":
    case "hook-direction-change":
    case "hook-stat":
    case "hook-source":
    case "hook-question":
      return <HookScene scene={scene} />;
    case "problem-fragmentation":
    case "pain-fragmentation":
      return <PainScene />;
    case "decision-messaging":
    case "origin-email":
      return <OriginScene />;
    case "beta-user-pull":
    case "validation-bubbles":
      return <ValidationScene />;
    case "release-timeline":
    case "date-clarifier":
      return <DateClarifier />;
    case "launch-timeline":
      return <LaunchScene />;
    case "proactive-message":
    case "message-native":
      return <MessageNativeScene />;
    case "permission-action-loop":
    case "action-loop":
      return <ActionLoopScene />;
    case "proactive-permission-risk":
      return <ProactivePermissionRiskScene />;
    case "recipe-setup":
    case "recipes":
      return <RecipesScene />;
    case "recipe-release":
      return <RecipeReleaseScene />;
    case "message-metric-boundary":
    case "growth-evidence":
      return <GrowthScene />;
    case "growth-cost-counter":
      return <GrowthCostCounterScene />;
    case "apple-distribution":
      return <AppleScene />;
    case "why-now-components":
    case "technology":
      return <TechnologyScene />;
    case "reliability-platform-risk":
      return <ReliabilityPlatformScene />;
    case "cost-then-acquisition":
    case "risk-acquisition":
      return <RiskScene />;
    case "cost-call-chain":
      return <CostCallChainScene />;
    case "acquisition-infrastructure":
      return <AcquisitionInfrastructureScene />;
    case "ending-known-edge":
    case "conclusion":
      return <ConclusionScene />;
    default:
      return <BigTitle>{scene.onScreenText.join(" · ")}</BigTitle>;
  }
};

export const PokeEpisode: React.FC<{orientation: "vertical"}> = () => {
  const soundCues = buildPokeSoundCues(timeline.scenes);
  return (
    <AbsoluteFill style={{background: COLORS.paper, fontFamily: SANS}}>
      <Audio src={staticFile("episodes/episode-001/sound-design/ambient-bed.mp3")} volume={0.72} />
      {soundCues.map((cue) => (
        <Sequence key={cue.id} from={cue.from} durationInFrames={cue.durationInFrames}>
          <Audio
            src={staticFile(`episodes/episode-001/sound-design/${cue.file}`)}
            volume={cue.volume}
          />
        </Sequence>
      ))}
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
          background: "rgba(21,23,27,.88)",
          boxShadow: "0 12px 30px rgba(26,31,43,.15)",
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

export const PokeCover: React.FC<{orientation: "portrait"}> = () => {
  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, fontFamily: SANS}}>
      <PaperBackground />
      <div
        style={{
          position: "absolute",
          inset: "70px 64px",
          display: "grid",
          gridTemplateColumns: "1fr",
          alignItems: "center",
          gap: 40,
        }}
      >
        <div>
          <div style={{fontSize: 27, color: COLORS.blue, fontWeight: 750}}>
            POKE · 2026 PRODUCT STORY
          </div>
          <div
            style={{
              marginTop: 24,
              fontFamily: SERIF,
              fontWeight: 760,
              fontSize: 104,
              lineHeight: 1.04,
              letterSpacing: -4,
            }}
          >
            AI 助手，
            <br />
            住进消息列表
          </div>
          <div
            style={{
              marginTop: 44,
              fontFamily: SERIF,
              fontSize: 190,
              fontWeight: 760,
              lineHeight: 0.82,
            }}
          >
            1 亿+
          </div>
          <div style={{fontSize: 28, color: COLORS.muted, marginTop: 26}}>
            约三个月消息量 · 截至 2026.07.23 · Cognition
          </div>
          <div
            style={{
              marginTop: 54,
              paddingTop: 30,
              borderTop: `2px solid ${COLORS.blue}`,
              fontSize: 46,
              fontWeight: 760,
            }}
          >
            它为什么先给你发消息？
          </div>
        </div>
        <div style={{display: "grid", placeItems: "center"}}>
          <Phone compact staticState />
        </div>
      </div>
    </AbsoluteFill>
  );
};
