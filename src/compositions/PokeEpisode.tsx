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
import timelineRaw from "../poke-timeline.generated.json";
import captionsRaw from "../poke-captions.generated.json";
import claimsRaw from "../../content/episode-001/research/facts.json";
import sourcesRaw from "../../content/episode-001/research/sources.json";
import type {Claim, Source, Timeline} from "../schemas/episode";

const timeline = timelineRaw as Timeline;
const claims = claimsRaw as Claim[];
const sources = sourcesRaw as Source[];
const captions = captionsRaw as Array<{
  startFrame: number;
  endFrame: number;
  text: string;
}>;
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

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const enter = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 18, stiffness: 115, mass: 0.7},
  });

const fadeScene = (frame: number, duration: number) =>
  interpolate(frame, [0, 10, Math.max(11, duration - 10), duration], [0, 1, 1, 0], clamp);

const fadeFirstScene = (frame: number, duration: number) =>
  interpolate(frame, [Math.max(0, duration - 10), duration], [1, 0], clamp);

const PaperBackground: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 3000], [0, isVertical ? 70 : 110], {
    ...clamp,
    extrapolateRight: "extend",
  });
  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(circle at 78% 18%, rgba(156,199,226,.55), transparent 34%),
          radial-gradient(circle at 12% 92%, rgba(188,215,231,.42), transparent 31%),
          linear-gradient(145deg, ${COLORS.paperLight} 0%, ${COLORS.paper} 68%, #e8e3dc 100%)
        `,
        overflow: "hidden",
      }}
    >
      <svg
        viewBox={isVertical ? "0 0 1080 1920" : "0 0 1920 1080"}
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
          const offset = index * (isVertical ? 24 : 18);
          const path = isVertical
            ? `M 600 ${40 + offset} C 760 ${100 + offset}, 820 ${210 + offset}, 1080 ${180 + offset}`
            : `M 0 ${840 + offset} C 380 ${760 + offset}, 690 ${980 + offset}, 1060 ${850 + offset} S 1650 ${760 + offset}, 1920 ${830 + offset}`;
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.19,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E\")",
          mixBlendMode: "multiply",
        }}
      />
    </AbsoluteFill>
  );
};

const reportingLabel = (claimIds: string[]): {label: string; color: string} => {
  const types = claimIds
    .map((id) => claimMap.get(id)?.reportingType)
    .filter((type): type is Claim["reportingType"] => Boolean(type));
  if (types.includes("inference")) return {label: "分析", color: COLORS.blue};
  if (types.includes("company-reported")) return {label: "公司口径", color: COLORS.caution};
  if (types.includes("founder-reported")) return {label: "访谈", color: COLORS.caution};
  return {label: "事实", color: COLORS.green};
};

const sourcePublishers = (claimIds: string[]): string => {
  const ids = new Set(claimIds.flatMap((claimId) => claimMap.get(claimId)?.sourceIds ?? []));
  const publishers = new Set(Array.from(ids).map((id) => sourceMap.get(id)?.publisher ?? id));
  return Array.from(publishers).slice(0, 3).join(" · ");
};

const sceneEvidenceLabel = (scene: Timeline["scenes"][number]): string => {
  if (scene.id === "seg-001" || scene.id === "seg-012") {
    return "Poke 官方能力说明 · 功能演示";
  }
  if (scene.id === "seg-002" || scene.id === "seg-009") {
    return "Cognition 披露 · 消息数不是用户数";
  }
  if (scene.id === "seg-008") return "Poke 官方 Release Notes · 真实页面截图";
  if (scene.id === "seg-011") return "Cognition 收购公告 · 真实页面截图";
  return sourcePublishers(scene.claimIds);
};

const SceneShell: React.FC<{
  scene: Timeline["scenes"][number];
  children: React.ReactNode;
  isVertical: boolean;
}> = ({scene, children, isVertical}) => {
  const frame = useCurrentFrame();
  const badge = reportingLabel(scene.claimIds);
  const padX = isVertical ? 72 : 96;
  const padTop = isVertical ? 76 : 54;
  return (
    <AbsoluteFill
      style={{
        color: COLORS.ink,
        fontFamily: SANS,
        opacity:
          scene.index === 0
            ? fadeFirstScene(frame, scene.durationFrames)
            : fadeScene(frame, scene.durationFrames),
      }}
    >
      <PaperBackground isVertical={isVertical} />
      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          top: padTop,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: isVertical ? 24 : 18,
          letterSpacing: isVertical ? 2 : 3,
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
            padding: isVertical ? "10px 16px" : "7px 13px",
            borderRadius: 999,
            letterSpacing: 0,
            fontSize: isVertical ? 22 : 17,
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
          top: isVertical ? 150 : 118,
          bottom: isVertical ? 520 : 240,
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
          bottom: isVertical ? 462 : 196,
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: COLORS.muted,
          fontSize: isVertical ? 32 : 18,
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

const CaptionLayer: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  const caption = captions.find(
    (candidate) => frame >= candidate.startFrame && frame < candidate.endFrame,
  );
  if (!caption) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: isVertical ? 72 : 140,
        right: isVertical ? 72 : 140,
        bottom: isVertical ? 300 : 96,
        minHeight: isVertical ? 98 : 68,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: isVertical ? "18px 30px" : "10px 26px",
        borderRadius: isVertical ? 24 : 18,
        color: COLORS.white,
        background: "rgba(21,23,27,.88)",
        boxShadow: "0 12px 30px rgba(26,31,43,.15)",
        fontFamily: SANS,
        fontSize: isVertical ? 48 : 38,
        lineHeight: 1.3,
        fontWeight: 650,
        letterSpacing: 0.5,
        zIndex: 20,
      }}
    >
      {caption.text}
    </div>
  );
};

const BigTitle: React.FC<{
  children: React.ReactNode;
  isVertical: boolean;
  size?: number;
}> = ({children, isVertical, size}) => (
  <div
    style={{
      fontFamily: SERIF,
      fontSize: size ?? (isVertical ? 88 : 84),
      lineHeight: 1.08,
      fontWeight: 700,
      letterSpacing: isVertical ? -3 : -4,
    }}
  >
    {children}
  </div>
);

const Phone: React.FC<{
  isVertical: boolean;
  compact?: boolean;
  staticState?: boolean;
}> = ({isVertical, compact = false, staticState = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = staticState ? 1 : enter(frame, fps, 8);
  const width = compact ? (isVertical ? 760 : 520) : isVertical ? 820 : 590;
  return (
    <div
      style={{
        width,
        height: compact ? width * 0.63 : width * 0.76,
        borderRadius: isVertical ? 54 : 46,
        background: "rgba(255,255,255,.88)",
        border: "2px solid rgba(40,45,52,.16)",
        boxShadow: "0 26px 70px rgba(45,59,72,.17)",
        overflow: "hidden",
        transform: `scale(${0.9 + scale * 0.1})`,
      }}
    >
      <div
        style={{
          height: isVertical ? 96 : 72,
          borderBottom: `1px solid ${COLORS.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontWeight: 700,
          fontSize: isVertical ? 28 : 22,
        }}
      >
        <span
          style={{
            width: isVertical ? 52 : 40,
            height: isVertical ? 52 : 40,
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
        <span style={{fontSize: isVertical ? 20 : 15, color: COLORS.muted}}>AI</span>
      </div>
      <div style={{padding: isVertical ? 38 : 30}}>
        <div
          style={{
            maxWidth: "86%",
            background: COLORS.blueMist,
            border: `1px solid ${COLORS.blueSoft}`,
            borderRadius: isVertical ? "30px 30px 30px 8px" : "24px 24px 24px 7px",
            padding: isVertical ? "26px 30px" : "20px 24px",
            fontSize: isVertical ? 34 : 28,
            lineHeight: 1.42,
            opacity: staticState ? 1 : interpolate(frame, [10, 24], [0, 1], clamp),
            transform: `translateY(${
              staticState ? 0 : interpolate(frame, [10, 24], [26, 0], clamp)
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
  isVertical: boolean;
}> = ({scene, isVertical}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = enter(frame, fps, 2);
  if (scene.scene === "hook-calendar-action") {
    const confirmation = interpolate(frame, [0, 18, 34], [0.94, 1.03, 1], clamp);
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          alignContent: "center",
          gap: isVertical ? 56 : 48,
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
              padding: isVertical ? "28px 34px" : "22px 28px",
              borderRadius: "30px 30px 8px 30px",
              background: COLORS.ink,
              color: COLORS.white,
              fontSize: isVertical ? 42 : 34,
              lineHeight: 1.35,
              boxShadow: "0 22px 55px rgba(21,23,27,.24)",
            }}
          >
            <div
              style={{
                marginBottom: 12,
                color: COLORS.blueSoft,
                fontSize: isVertical ? 22 : 17,
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
            padding: isVertical ? "40px 42px" : "34px 38px",
            borderRadius: 34,
            background: "rgba(255,255,255,.84)",
            border: `2px solid ${COLORS.blue}`,
            boxShadow: "0 26px 75px rgba(61,120,181,.18)",
            opacity: 1,
            transform: `scale(${confirmation})`,
            transformOrigin: "center center",
          }}
        >
          <div style={{color: COLORS.blue, fontSize: isVertical ? 26 : 20, fontWeight: 760}}>
            日历已更新 · 功能演示
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: isVertical ? 78 : 64,
              fontWeight: 760,
              marginTop: 18,
            }}
          >
            周三 15:00
          </div>
          <div style={{fontSize: isVertical ? 28 : 22, color: COLORS.muted, marginTop: 12}}>
            与项目组开会
          </div>
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
          gap: isVertical ? 44 : 36,
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 800,
            fontSize: isVertical ? 230 : 230,
            lineHeight: 0.82,
            letterSpacing: -12,
            transform: `scale(${interpolate(frame, [0, 20], [0.82, 1], clamp)})`,
            transformOrigin: "left center",
          }}
        >
          1 亿+
        </div>
        <div style={{fontSize: isVertical ? 34 : 28, color: COLORS.muted}}>约三个月 · 消息往来</div>
        <div style={{display: "flex", gap: 12, alignItems: "center", marginTop: 4}}>
          {Array.from({length: 6}).map((_, index) => (
            <div
              key={index}
              style={{
                width: 24 + index * 5,
                height: 14,
                borderRadius: 999,
                background: index === 5 ? COLORS.caution : COLORS.blue,
                opacity: interpolate(frame, [index * 5, index * 5 + 10], [0.2, 0.9], clamp),
              }}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            padding: isVertical ? "26px 30px" : "22px 26px",
            borderLeft: `8px solid ${COLORS.blue}`,
            background: "rgba(61,120,181,.08)",
            color: COLORS.ink,
            fontFamily: SERIF,
            fontSize: isVertical ? 52 : 46,
            fontWeight: 760,
            lineHeight: 1.25,
            opacity: interpolate(frame, [24, 38], [0, 1], clamp),
          }}
        >
          一个小动作
          <br />
          变成一个产品问题
        </div>
        <div style={{fontSize: isVertical ? 22 : 17, color: COLORS.muted}}>
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
          gap: isVertical ? 46 : 40,
        }}
      >
        <div style={{display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 18}}>
          <TaskCard
            label="联系人里的 Poke"
            detail="你只发一句"
            accent={COLORS.blue}
            delay={2}
            isVertical={isVertical}
          />
          <div style={{alignSelf: "center", fontSize: 54, color: COLORS.blue}}>→</div>
          <div
            style={{
              display: "grid",
              gap: 14,
              paddingTop: 10,
              opacity: interpolate(frame, [12, 28], [0, 1], clamp),
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
                  fontSize: isVertical ? 27 : 22,
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
          <BigTitle isVertical={isVertical} size={isVertical ? 78 : 72}>
            为什么收起工作台？
          </BigTitle>
          <div
            style={{
              marginTop: 24,
              fontSize: isVertical ? 40 : 34,
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
          gap: isVertical ? 42 : 48,
        }}
      >
        <BigTitle isVertical={isVertical} size={isVertical ? 98 : 96}>
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
              fontSize: isVertical ? 190 : 210,
              lineHeight: 0.9,
            }}
          >
            1 亿+
          </div>
          <div
            style={{
              marginTop: isVertical ? 44 : 32,
              fontSize: isVertical ? 38 : 34,
              color: COLORS.muted,
            }}
          >
            过去约三个月消息量
          </div>
          <div
            style={{
              margin: `${isVertical ? 38 : 30}px auto 0`,
              display: "inline-flex",
              gap: 18,
              alignItems: "center",
              padding: isVertical ? "18px 25px" : "14px 20px",
              border: `1px solid ${COLORS.caution}88`,
              borderRadius: 999,
              color: COLORS.caution,
              fontSize: isVertical ? 26 : 22,
            }}
          >
            Cognition · 截至 2026.07.23
          </div>
          {scene.scene === "hook-source" ? (
            <div
              style={{
                marginTop: isVertical ? 70 : 44,
                fontSize: isVertical ? 64 : 58,
                fontWeight: 760,
              }}
            >
              消息量 <span style={{color: COLORS.caution}}>≠</span> 用户数
            </div>
          ) : (
            <div
              style={{
                marginTop: isVertical ? 70 : 44,
                fontSize: isVertical ? 42 : 38,
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
          gap: isVertical ? 46 : 54,
        }}
      >
        <BigTitle isVertical={isVertical}>
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
            isVertical={isVertical}
          />
          <div style={{fontSize: 62, color: COLORS.blue, textAlign: "center"}}>→</div>
          <TaskCard
            label="后来"
            detail="联系人列表里的主动消息"
            accent={COLORS.blue}
            delay={12}
            isVertical={isVertical}
          />
        </div>
        <div style={{fontSize: isVertical ? 24 : 20, color: COLORS.muted}}>
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
          gridTemplateColumns: isVertical ? "1fr" : "1.15fr .85fr",
          gap: isVertical ? 30 : 90,
        }}
      >
        <BigTitle isVertical={isVertical} size={isVertical ? 112 : 110}>
          让一个联系人
          <br />
          读邮件、改日历？
        </BigTitle>
        <div style={{display: "grid", gap: 20}}>
          <TaskCard
            label="先授权"
            detail="连接邮件与日历"
            accent={COLORS.caution}
            delay={2}
            isVertical={isVertical}
          />
          <TaskCard
            label="再动手"
            detail="草拟回复、安排会议"
            accent={COLORS.blue}
            delay={10}
            isVertical={isVertical}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : "1.15fr .85fr",
        alignItems: "center",
        gap: isVertical ? 42 : 80,
      }}
    >
      <div style={{transform: `translateY(${(1 - pop) * 30}px)`, opacity: pop}}>
        <BigTitle isVertical={isVertical}>
          日程有变化，
          <br />
          Poke 先来提醒
        </BigTitle>
        <div
          style={{
            marginTop: isVertical ? 44 : 32,
            fontFamily: SERIF,
            fontSize: isVertical ? 220 : 230,
            lineHeight: 0.82,
            fontWeight: 760,
            letterSpacing: -10,
          }}
        >
          1 亿+
        </div>
        <div
          style={{
            marginTop: isVertical ? 38 : 30,
            paddingTop: isVertical ? 24 : 18,
            borderTop: `2px solid ${COLORS.blue}`,
            fontSize: isVertical ? 26 : 22,
            color: COLORS.muted,
            lineHeight: 1.5,
          }}
        >
          约三个月消息量
          <br />
          Cognition · 截至 2026.07.23
        </div>
      </div>
      <Phone isVertical={isVertical} />
    </div>
  );
};

const SourceStill: React.FC<{
  path: string;
  label: string;
  isVertical: boolean;
  objectPosition?: string;
}> = ({path, label, isVertical, objectPosition = "center"}) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: isVertical ? 32 : 26,
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
    <div
      style={{
        position: "absolute",
        left: isVertical ? 20 : 16,
        bottom: isVertical ? 20 : 16,
        padding: isVertical ? "12px 18px" : "9px 13px",
        borderRadius: 999,
        background: "rgba(21,23,27,.86)",
        color: COLORS.white,
        fontSize: isVertical ? 32 : 17,
      }}
    >
      {label}
    </div>
  </div>
);

const TaskCard: React.FC<{
  label: string;
  detail: string;
  accent: string;
  delay: number;
  isVertical: boolean;
}> = ({label, detail, accent, delay, isVertical}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 14], [0, 1], clamp);
  return (
    <div
      style={{
        padding: isVertical ? "28px 30px" : "24px 28px",
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
          fontSize: isVertical ? 26 : 21,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div style={{fontSize: isVertical ? 34 : 28, lineHeight: 1.3}}>{detail}</div>
    </div>
  );
};

const PainScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div style={{height: "100%", display: "grid", alignContent: "center", gap: isVertical ? 42 : 50}}>
    <BigTitle isVertical={isVertical}>
      邮件里的日期，
      <br />
      要搬三次
    </BigTitle>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : "repeat(3, 1fr)",
        gap: isVertical ? 20 : 26,
      }}
    >
      <TaskCard
        label="邮件"
        detail="客户确认周四前回复"
        accent={COLORS.caution}
        delay={4}
        isVertical={isVertical}
      />
      <TaskCard
        label="日历"
        detail="周三下午有空档"
        accent={COLORS.blue}
        delay={12}
        isVertical={isVertical}
      />
      <TaskCard
        label="待办"
        detail="复制日期，再补一句提醒"
        accent={COLORS.green}
        delay={20}
        isVertical={isVertical}
      />
    </div>
    <div
      style={{
        fontSize: isVertical ? 24 : 20,
        color: COLORS.muted,
        borderLeft: `3px solid ${COLORS.caution}`,
        paddingLeft: 16,
      }}
    >
      团队与投资方访谈
    </div>
  </div>
);

const OriginScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: isVertical ? "1fr" : "1fr 110px 1fr",
      alignItems: "center",
      gap: isVertical ? 26 : 30,
    }}
  >
    <div>
      <div style={{fontSize: isVertical ? 24 : 18, color: COLORS.blue, fontWeight: 750}}>起点</div>
      <BigTitle isVertical={isVertical} size={isVertical ? 78 : 70}>
        邮件自动化
      </BigTitle>
      <div
        style={{
          marginTop: 28,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 24,
          background: "rgba(255,255,255,.72)",
          padding: isVertical ? 30 : 25,
          fontSize: isVertical ? 28 : 23,
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
        fontSize: isVertical ? 56 : 72,
        color: COLORS.blue,
        transform: isVertical ? "rotate(90deg)" : undefined,
        textAlign: "center",
      }}
    >
      →
    </div>
    <div>
      <div style={{fontSize: isVertical ? 24 : 18, color: COLORS.caution, fontWeight: 750}}>
        访谈反馈
      </div>
      <BigTitle isVertical={isVertical} size={isVertical ? 78 : 70}>
        那它该出现在哪儿？
      </BigTitle>
      <div
        style={{
          marginTop: 28,
          color: COLORS.muted,
          fontSize: isVertical ? 28 : 23,
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

const ValidationScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const requests = ["提醒我吃药", "告诉我球赛结果", "今天要穿外套吗？"];
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : ".85fr 1.15fr",
        gap: isVertical ? 38 : 80,
        alignItems: "center",
      }}
    >
      <BigTitle isVertical={isVertical} size={isVertical ? 78 : 78}>
        用户很快把它
        <br />
        用出了邮件
      </BigTitle>
      <div style={{display: "grid", gap: isVertical ? 24 : 20}}>
        {requests.map((request, index) => (
          <TaskCard
            key={request}
            label="Beta 请求"
            detail={request}
            accent={index === 2 ? COLORS.caution : COLORS.blue}
            delay={index * 10}
            isVertical={isVertical}
          />
        ))}
        <div style={{fontSize: isVertical ? 22 : 17, color: COLORS.muted}}>
          创始人转述 · 非独立日志审计
        </div>
      </div>
    </div>
  );
};

const DateClarifier: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div style={{height: "100%", display: "grid", alignContent: "center", gap: isVertical ? 64 : 60}}>
    <BigTitle isVertical={isVertical}>Poke 早在 2025 就出现了</BigTitle>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : "1fr 1fr",
        gap: isVertical ? 26 : 36,
      }}
    >
      <div
        style={{
          padding: isVertical ? 38 : 34,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 28,
          background: "rgba(255,255,255,.62)",
        }}
      >
        <div style={{fontFamily: SERIF, fontSize: isVertical ? 70 : 66, fontWeight: 700}}>
          2025.09
        </div>
        <div style={{fontSize: isVertical ? 34 : 30, marginTop: 18}}>已经公开，仍有限制</div>
        <div style={{fontSize: isVertical ? 22 : 18, color: COLORS.muted, marginTop: 16}}>
          公司称公开发布，但仍有准入限制
        </div>
      </div>
      <div
        style={{
          padding: isVertical ? 38 : 34,
          border: `2px solid ${COLORS.blue}`,
          borderRadius: 28,
          background: COLORS.blueMist,
        }}
      >
        <div style={{fontFamily: SERIF, fontSize: isVertical ? 70 : 66, fontWeight: 700}}>
          2026.03
        </div>
        <div style={{fontSize: isVertical ? 34 : 30, marginTop: 18}}>候补名单取消</div>
        <div style={{fontSize: isVertical ? 22 : 18, color: COLORS.muted, marginTop: 16}}>
          Recipes 同日开放
        </div>
      </div>
    </div>
    <div style={{fontSize: isVertical ? 40 : 36, fontWeight: 760}}>
      2026 取消名单 <span style={{color: COLORS.caution}}>≠</span> 2026 首次出现
    </div>
  </div>
);

const LaunchScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: isVertical ? "1fr" : ".85fr 1.15fr",
      gap: isVertical ? 36 : 54,
      alignItems: "center",
    }}
  >
    <div>
      <div style={{fontFamily: SERIF, fontSize: isVertical ? 84 : 86, fontWeight: 760}}>03.19</div>
      <BigTitle isVertical={isVertical} size={isVertical ? 76 : 70}>
        候补名单取消
        <br />
        Recipes 开放
      </BigTitle>
      <div
        style={{
          marginTop: 30,
          padding: isVertical ? "16px 20px" : "13px 17px",
          display: "inline-block",
          borderRadius: 999,
          border: `1px solid ${COLORS.blue}`,
          color: COLORS.blue,
          fontSize: isVertical ? 24 : 19,
        }}
      >
        时间先后明确 · 增长因果未证明
      </div>
    </div>
    <div style={{height: isVertical ? 610 : 650}}>
      <SourceStill
        path="episodes/episode-001/captured/poke-release-notes.png"
        label="Poke 官方 Release Notes · 2026.03.19"
        isVertical={isVertical}
        objectPosition="58% 58%"
      />
    </div>
  </div>
);

const MessageNativeScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: isVertical ? "1fr" : ".78fr 1.22fr",
      gap: isVertical ? 34 : 54,
      alignItems: "center",
    }}
  >
    <div>
      <div style={{color: COLORS.blue, fontWeight: 750, fontSize: isVertical ? 26 : 20}}>
        一个取舍
      </div>
      <BigTitle isVertical={isVertical}>消息列表就是入口</BigTitle>
      <div style={{marginTop: 26, fontSize: isVertical ? 30 : 26, lineHeight: 1.65}}>
        你在这里找它
        <br />
        它也从这里找你
      </div>
    </div>
    <div style={{height: isVertical ? 650 : 700}}>
      <SourceStill
        path="episodes/episode-001/captured/poke-home.png"
        label="Poke 官方主页 · 2026.07.28 抓取"
        isVertical={isVertical}
        objectPosition="50% 56%"
      />
    </div>
  </div>
);

const ActionLoopScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const items = [
    {label: "读邮件", detail: "找到日期和上下文"},
    {label: "改日历", detail: "移动或新建日程"},
    {label: "设提醒", detail: "动作完成前交给用户核对"},
  ];
  return (
    <div
      style={{height: "100%", display: "grid", alignContent: "center", gap: isVertical ? 52 : 58}}
    >
      <div>
        <div style={{color: COLORS.blue, fontWeight: 750, fontSize: isVertical ? 26 : 20}}>
          拿到授权以后
        </div>
        <BigTitle isVertical={isVertical}>它真能动日历</BigTitle>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr" : "repeat(3, 1fr)",
          gap: isVertical ? 20 : 24,
        }}
      >
        {items.map((item, index) => (
          <TaskCard
            key={item.label}
            label={item.label}
            detail={item.detail}
            accent={index === 2 ? COLORS.green : COLORS.blue}
            delay={index * 10}
            isVertical={isVertical}
          />
        ))}
      </div>
      <div
        style={{
          color: COLORS.caution,
          fontSize: isVertical ? 25 : 20,
          borderLeft: `3px solid ${COLORS.caution}`,
          paddingLeft: 18,
        }}
      >
        Poke 条款要求用户核对日程安排和重要决定
      </div>
    </div>
  );
};

const ProactivePermissionRiskScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  const review = interpolate(frame, [150, 178], [0, 1], clamp);
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : "0.9fr 1.1fr",
        gap: isVertical ? 34 : 52,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{color: COLORS.blue, fontSize: isVertical ? 26 : 20, fontWeight: 760}}>
          它先来找你
        </div>
        <BigTitle isVertical={isVertical} size={isVertical ? 74 : 68}>
          少切窗口，
          <br />
          结果仍要核对
        </BigTitle>
        <div
          style={{
            marginTop: 30,
            padding: isVertical ? "24px 28px" : "20px 24px",
            borderRadius: 24,
            background: COLORS.ink,
            color: COLORS.white,
            fontSize: isVertical ? 28 : 23,
            lineHeight: 1.45,
          }}
        >
          Poke：会议时间变了。
          <br />
          要现在一起改吗？
        </div>
      </div>
      <div style={{position: "relative", minHeight: isVertical ? 620 : 610}}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: isVertical ? 32 : 28,
            borderRadius: 32,
            background: "rgba(255,255,255,.82)",
            border: `2px solid ${COLORS.blue}`,
            boxShadow: "0 25px 70px rgba(61,120,181,.16)",
          }}
        >
          <div style={{fontSize: isVertical ? 24 : 19, color: COLORS.blue, fontWeight: 760}}>
            已授权 · 功能演示
          </div>
          <div style={{fontFamily: SERIF, fontSize: isVertical ? 62 : 54, marginTop: 28}}>
            周四 14:00
          </div>
          <div style={{fontSize: isVertical ? 28 : 23, color: COLORS.muted, marginTop: 14}}>
            项目复盘
          </div>
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
                left: `${interpolate(frame, [45, 120], [8, 74], clamp)}%`,
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
              fontSize: isVertical ? 26 : 21,
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

const RecipesScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const parts = ["初始上下文", "第一条消息", "所需集成", "分享链接"];
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : ".8fr 1.2fr",
        gap: isVertical ? 38 : 70,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{color: COLORS.blue, fontWeight: 750, fontSize: isVertical ? 26 : 20}}>
          Recipes
        </div>
        <BigTitle isVertical={isVertical}>
          一次交代，
          <br />
          做成一条链接
        </BigTitle>
        <div style={{fontSize: isVertical ? 28 : 24, color: COLORS.muted, marginTop: 24}}>
          背景、开场消息、服务连接都放在同一张卡里
        </div>
      </div>
      <div
        style={{
          padding: isVertical ? 32 : 30,
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
            isVertical={isVertical}
          />
        ))}
        <div
          style={{
            gridColumn: "1 / -1",
            paddingTop: 18,
            color: COLORS.muted,
            fontSize: isVertical ? 22 : 18,
          }}
        >
          同一套设置，可以发给下一个人
        </div>
      </div>
    </div>
  );
};

const RecipeReleaseScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: isVertical ? 34 : 28,
      }}
    >
      <div>
        <div style={{color: COLORS.blue, fontWeight: 760, fontSize: isVertical ? 25 : 19}}>
          Recipe
        </div>
        <BigTitle isVertical={isVertical} size={isVertical ? 70 : 64}>
          一套设置，发给下一个人
        </BigTitle>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr 1fr" : "0.9fr 1.1fr",
          gap: isVertical ? 22 : 34,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            alignContent: "center",
            gap: 16,
            padding: isVertical ? 24 : 26,
            borderRadius: 28,
            background: "rgba(255,255,255,.75)",
            border: `1px solid ${COLORS.line}`,
            transform: `translateX(${interpolate(frame, [0, 35], [-40, 0], clamp)}px)`,
          }}
        >
          {["背景设定", "开场白", "所需服务", "分享链接"].map((item, index) => (
            <div
              key={item}
              style={{
                padding: isVertical ? "18px 20px" : "16px 18px",
                borderRadius: 18,
                background: index === 3 ? COLORS.blue : COLORS.paperLight,
                color: index === 3 ? COLORS.white : COLORS.ink,
                fontSize: isVertical ? 24 : 20,
                opacity: interpolate(frame, [index * 8, index * 8 + 12], [0, 1], clamp),
              }}
            >
              {item}
            </div>
          ))}
          <div style={{fontSize: isVertical ? 20 : 16, color: COLORS.muted}}>
            账户仍需接收者授权
          </div>
        </div>
        <SourceStill
          path="episodes/episode-001/captured/poke-release-notes.png"
          label="Poke Release Notes · 2026.03.19"
          isVertical={isVertical}
          objectPosition="58% 57%"
        />
      </div>
    </div>
  );
};

const GrowthScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: isVertical ? "1fr" : ".85fr 1.15fr",
      gap: isVertical ? 30 : 60,
      alignItems: "center",
    }}
  >
    <div>
      <div style={{fontFamily: SERIF, fontSize: isVertical ? 190 : 210, lineHeight: 0.84}}>
        1 亿+
      </div>
      <div style={{fontSize: isVertical ? 34 : 30, marginTop: 28}}>统计项：消息</div>
      <div style={{fontSize: isVertical ? 23 : 19, color: COLORS.muted, lineHeight: 1.7}}>
        约三个月 · 截至 2026.07.23
        <br />
        Cognition
      </div>
      <div
        style={{
          marginTop: 28,
          padding: isVertical ? 24 : 20,
          borderRadius: 22,
          border: `1px solid ${COLORS.caution}`,
          color: COLORS.caution,
          fontWeight: 700,
          fontSize: isVertical ? 26 : 22,
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
    <div style={{height: isVertical ? 620 : 700}}>
      <SourceStill
        path="episodes/episode-001/captured/cognition-announcement.png"
        label="Cognition · 2026.07.23"
        isVertical={isVertical}
        objectPosition="61% 55%"
      />
    </div>
  </div>
);

const GrowthCostCounterScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  const messages = ["改一下日历", "提醒我吃药", "查明天的天气", "告诉我球赛结果"];
  return (
    <div style={{height: "100%", display: "grid", alignContent: "center", gap: 36}}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          fontSize: isVertical ? 23 : 18,
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
              padding: isVertical ? "22px 18px" : "18px",
              borderTop: `4px solid ${index === 2 ? COLORS.caution : COLORS.blue}`,
              background: "rgba(255,255,255,.64)",
              opacity: interpolate(frame, [index * 18, index * 18 + 14], [0, 1], clamp),
            }}
          >
            <div style={{fontFamily: SERIF, fontSize: isVertical ? 40 : 34, color: COLORS.ink}}>
              {date}
            </div>
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
                padding: isVertical ? "18px 22px" : "16px 20px",
                borderRadius: "22px 22px 6px 22px",
                background: index === 0 ? COLORS.ink : "rgba(255,255,255,.76)",
                color: index === 0 ? COLORS.white : COLORS.ink,
                border: index === 0 ? "none" : `1px solid ${COLORS.line}`,
                fontSize: isVertical ? 24 : 19,
                transform: `translateX(${interpolate(
                  frame,
                  [index * 9, index * 9 + 18],
                  [-42, 0],
                  clamp,
                )}px)`,
                opacity: interpolate(frame, [index * 9, index * 9 + 18], [0, 1], clamp),
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
            minHeight: isVertical ? 360 : 320,
            borderRadius: 36,
            border: `2px solid ${COLORS.blue}`,
            background: "rgba(61,120,181,.08)",
            opacity: interpolate(frame, [28, 48], [0, 1], clamp),
          }}
        >
          <div style={{textAlign: "center"}}>
            <div
              style={{
                width: isVertical ? 100 : 84,
                height: isVertical ? 100 : 84,
                margin: "0 auto 24px",
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: COLORS.blue,
                color: COLORS.white,
                fontFamily: SERIF,
                fontSize: isVertical ? 54 : 46,
              }}
            >
              P
            </div>
            <div style={{fontSize: isVertical ? 30 : 25, fontWeight: 760}}>同一个联系人入口</div>
            <div style={{marginTop: 12, color: COLORS.muted, fontSize: isVertical ? 21 : 17}}>
              Poke · 官方入口说明
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AppleScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div style={{height: "100%", display: "grid", alignContent: "center", gap: isVertical ? 48 : 52}}>
    <div>
      <div style={{fontFamily: SERIF, fontSize: isVertical ? 74 : 70, fontWeight: 760}}>
        2026.06.04
      </div>
      <BigTitle isVertical={isVertical}>
        进入 Apple
        <br />
        Messages for Business
      </BigTitle>
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : "1fr 1fr 1fr",
        gap: 22,
      }}
    >
      <TaskCard
        label="Poke 公告"
        detail="进入 Apple 商业消息渠道"
        accent={COLORS.caution}
        delay={2}
        isVertical={isVertical}
      />
      <TaskCard
        label="实际变化"
        detail="新增一个消息分发渠道"
        accent={COLORS.blue}
        delay={10}
        isVertical={isVertical}
      />
      <TaskCard
        label="日期"
        detail="2026.06.04"
        accent={COLORS.muted}
        delay={18}
        isVertical={isVertical}
      />
    </div>
    <div style={{fontSize: isVertical ? 23 : 18, color: COLORS.muted}}>TechCrunch 同日报道</div>
  </div>
);

const TechnologyScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const stages = [
    {title: "模型", text: "按任务选择"},
    {title: "授权", text: "邮件与日历"},
    {title: "工具", text: "MCP 支持"},
    {title: "动作", text: "读邮件 / 改日历 / 发提醒"},
  ];
  return (
    <div
      style={{height: "100%", display: "grid", alignContent: "center", gap: isVertical ? 54 : 58}}
    >
      <div>
        <BigTitle isVertical={isVertical}>现在可确认的四块能力</BigTitle>
        <div style={{fontSize: isVertical ? 28 : 24, color: COLORS.muted, marginTop: 20}}>
          并列展示，不代表 Poke 已披露内部编排
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: isVertical ? 20 : 24,
        }}
      >
        {stages.map((stage, index) => (
          <div
            key={stage.title}
            style={{
              minHeight: isVertical ? 210 : 230,
              padding: isVertical ? 28 : 26,
              border: `1px solid ${index === 1 ? COLORS.caution : COLORS.line}`,
              borderRadius: 26,
              background: index === 1 ? "rgba(166,92,67,.06)" : "rgba(255,255,255,.64)",
            }}
          >
            <div style={{fontSize: isVertical ? 24 : 20, color: COLORS.blue}}>0{index + 1}</div>
            <div
              style={{
                fontFamily: SERIF,
                fontWeight: 720,
                fontSize: isVertical ? 44 : 40,
                marginTop: 18,
              }}
            >
              {stage.title}
            </div>
            <div
              style={{
                whiteSpace: "pre-line",
                fontSize: isVertical ? 22 : 18,
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
          padding: isVertical ? 24 : 20,
          background: "rgba(21,23,27,.88)",
          color: COLORS.white,
          borderRadius: 20,
          fontSize: isVertical ? 24 : 20,
        }}
      >
        机制示意，非内部架构 · 用户决定能读什么、能改什么
      </div>
    </div>
  );
};

const ReliabilityPlatformScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      alignContent: "center",
      gap: isVertical ? 46 : 54,
    }}
  >
    <BigTitle isVertical={isVertical}>
      动到真实账户，
      <br />
      错误和平台规则都会落地
    </BigTitle>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isVertical ? "1fr" : "1fr 1fr",
        gap: 22,
      }}
    >
      <TaskCard
        label="用户责任"
        detail="日程安排和业务决定仍要核对"
        accent={COLORS.caution}
        delay={2}
        isVertical={isVertical}
      />
      <TaskCard
        label="平台边界"
        detail="WhatsApp 规则曾改变可用地区"
        accent={COLORS.blue}
        delay={12}
        isVertical={isVertical}
      />
    </div>
    <div style={{fontSize: isVertical ? 23 : 18, color: COLORS.muted, lineHeight: 1.6}}>
      Poke 服务条款 · Poke Release Notes · 欧盟委员会临时措施
    </div>
  </div>
);

const RiskScene: React.FC<{isVertical: boolean}> = ({isVertical}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: isVertical ? "1fr" : "1fr 1fr",
      gap: isVertical ? 30 : 48,
      alignItems: "center",
    }}
  >
    <div>
      <BigTitle isVertical={isVertical} size={isVertical ? 76 : 72}>
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
              padding: isVertical ? "22px 24px" : "19px 22px",
              borderLeft: `4px solid ${index === 2 ? COLORS.blue : COLORS.caution}`,
              background: "rgba(255,255,255,.58)",
            }}
          >
            <div style={{fontSize: isVertical ? 27 : 23, fontWeight: 750}}>{title}</div>
            <div
              style={{
                fontSize: isVertical ? 21 : 17,
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
      <div style={{fontSize: isVertical ? 21 : 17, color: COLORS.muted, marginTop: 20}}>
        成本与收购只按时间先后展示，不声明因果
      </div>
    </div>
    <div style={{height: isVertical ? 560 : 680}}>
      <SourceStill
        path="episodes/episode-001/captured/cognition-announcement.png"
        label="Cognition · 2026.07.23"
        isVertical={isVertical}
        objectPosition="60% 48%"
      />
    </div>
  </div>
);

const CostCallChainScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
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
        gap: isVertical ? 42 : 34,
      }}
    >
      <div>
        <div style={{color: COLORS.caution, fontSize: isVertical ? 26 : 20, fontWeight: 760}}>
          你只发了一句
        </div>
        <BigTitle isVertical={isVertical} size={isVertical ? 78 : 72}>
          后台还在继续跑
        </BigTitle>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "0.76fr 1.24fr", gap: 26}}>
        <div
          style={{
            alignSelf: "center",
            padding: isVertical ? "28px 30px" : "24px 28px",
            borderRadius: "28px 28px 8px 28px",
            background: COLORS.ink,
            color: COLORS.white,
            fontSize: isVertical ? 34 : 28,
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
                padding: isVertical ? "24px 26px" : "20px 22px",
                borderRadius: 22,
                border: `2px solid rgba(166,92,67,${pulse(index * 7)})`,
                background: `rgba(166,92,67,${0.025 + pulse(index * 7) * 0.05})`,
              }}
            >
              <div style={{fontSize: isVertical ? 26 : 21, fontWeight: 760}}>{title}</div>
              <div
                style={{
                  fontSize: isVertical ? 22 : 18,
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
      <div style={{fontSize: isVertical ? 22 : 18, color: COLORS.muted}}>
        创始人口述 · 不推算单次调用数量或金额
      </div>
    </div>
  );
};

const AcquisitionInfrastructureScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: isVertical ? 28 : 24,
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
          <div style={{fontFamily: SERIF, fontSize: isVertical ? 66 : 58, fontWeight: 760}}>
            07.23
          </div>
          <div style={{fontSize: isVertical ? 22 : 18, color: COLORS.muted}}>2026</div>
        </div>
        <div
          style={{
            borderLeft: `7px solid ${COLORS.blue}`,
            paddingLeft: 24,
            color: COLORS.blue,
            fontSize: isVertical ? 31 : 25,
            lineHeight: 1.4,
            opacity: interpolate(frame, [0, 18], [0, 1], clamp),
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
          gridTemplateColumns: isVertical ? "1fr" : "1fr 1fr",
          gap: 26,
          minHeight: 0,
        }}
      >
        <SourceStill
          path="episodes/episode-001/captured/cognition-announcement.png"
          label="Cognition 收购公告 · 2026.07.23"
          isVertical={isVertical}
          objectPosition="58% 44%"
        />
        <div
          style={{
            alignSelf: "center",
            padding: isVertical ? "28px 30px" : "24px 26px",
            borderRadius: 28,
            background: "rgba(61,120,181,.09)",
            border: `1px solid ${COLORS.blue}`,
            opacity: interpolate(frame, [45, 70], [0, 1], clamp),
          }}
        >
          <div style={{color: COLORS.blue, fontSize: isVertical ? 23 : 18}}>公告里的下一步</div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: isVertical ? 48 : 42,
              lineHeight: 1.25,
              marginTop: 14,
            }}
          >
            接入 Cognition
            <br />
            的模型与基础设施
          </div>
          <div style={{fontSize: isVertical ? 21 : 17, color: COLORS.muted, marginTop: 18}}>
            暂时照常使用 · 长期整合未定
          </div>
        </div>
      </div>
    </div>
  );
};

const ConclusionScene: React.FC<{isVertical: boolean}> = ({isVertical}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        alignContent: "center",
        gap: isVertical ? 36 : 30,
      }}
    >
      <div>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24}}>
          {["工作台收起", "联系人留下", "用户带出邮箱"].map((label, index) => (
            <div
              key={label}
              style={{
                padding: isVertical ? "12px 17px" : "10px 14px",
                borderRadius: 999,
                background: index === 2 ? COLORS.blue : "rgba(255,255,255,.76)",
                color: index === 2 ? COLORS.white : COLORS.ink,
                border: index === 2 ? "none" : `1px solid ${COLORS.line}`,
                fontSize: isVertical ? 22 : 18,
                opacity: interpolate(frame, [index * 16, index * 16 + 14], [0, 1], clamp),
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <BigTitle isVertical={isVertical} size={isVertical ? 72 : 66}>
          发一句话
          <br />
          日历已经改好了
        </BigTitle>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "0.88fr 1.12fr", gap: 24}}>
        <div
          style={{
            alignSelf: "center",
            padding: isVertical ? "26px 28px" : "22px 24px",
            borderRadius: "28px 28px 8px 28px",
            background: COLORS.ink,
            color: COLORS.white,
            fontSize: isVertical ? 31 : 25,
            lineHeight: 1.4,
            opacity: interpolate(frame, [34, 52], [0, 1], clamp),
          }}
        >
          把周三的会
          <br />
          改到下午三点
        </div>
        <div
          style={{
            alignSelf: "center",
            padding: isVertical ? "30px 32px" : "26px 28px",
            borderRadius: 30,
            background: "rgba(255,255,255,.86)",
            border: `2px solid ${COLORS.blue}`,
            boxShadow: "0 24px 62px rgba(61,120,181,.16)",
            opacity: interpolate(frame, [52, 72], [0, 1], clamp),
          }}
        >
          <div style={{color: COLORS.blue, fontSize: isVertical ? 22 : 18, fontWeight: 760}}>
            日历已更新 · 功能演示
          </div>
          <div
            style={{
              marginTop: 18,
              fontFamily: SERIF,
              fontSize: isVertical ? 56 : 48,
              fontWeight: 760,
            }}
          >
            周三 15:00
          </div>
          <div style={{marginTop: 10, color: COLORS.muted, fontSize: isVertical ? 22 : 18}}>
            与项目组开会
          </div>
        </div>
      </div>
    </div>
  );
};

const SceneVisual: React.FC<{
  scene: Timeline["scenes"][number];
  isVertical: boolean;
}> = ({scene, isVertical}) => {
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
      return <HookScene scene={scene} isVertical={isVertical} />;
    case "problem-fragmentation":
    case "pain-fragmentation":
      return <PainScene isVertical={isVertical} />;
    case "decision-messaging":
    case "origin-email":
      return <OriginScene isVertical={isVertical} />;
    case "beta-user-pull":
    case "validation-bubbles":
      return <ValidationScene isVertical={isVertical} />;
    case "release-timeline":
    case "date-clarifier":
      return <DateClarifier isVertical={isVertical} />;
    case "launch-timeline":
      return <LaunchScene isVertical={isVertical} />;
    case "proactive-message":
    case "message-native":
      return <MessageNativeScene isVertical={isVertical} />;
    case "permission-action-loop":
    case "action-loop":
      return <ActionLoopScene isVertical={isVertical} />;
    case "proactive-permission-risk":
      return <ProactivePermissionRiskScene isVertical={isVertical} />;
    case "recipe-setup":
    case "recipes":
      return <RecipesScene isVertical={isVertical} />;
    case "recipe-release":
      return <RecipeReleaseScene isVertical={isVertical} />;
    case "message-metric-boundary":
    case "growth-evidence":
      return <GrowthScene isVertical={isVertical} />;
    case "growth-cost-counter":
      return <GrowthCostCounterScene isVertical={isVertical} />;
    case "apple-distribution":
      return <AppleScene isVertical={isVertical} />;
    case "why-now-components":
    case "technology":
      return <TechnologyScene isVertical={isVertical} />;
    case "reliability-platform-risk":
      return <ReliabilityPlatformScene isVertical={isVertical} />;
    case "cost-then-acquisition":
    case "risk-acquisition":
      return <RiskScene isVertical={isVertical} />;
    case "cost-call-chain":
      return <CostCallChainScene isVertical={isVertical} />;
    case "acquisition-infrastructure":
      return <AcquisitionInfrastructureScene isVertical={isVertical} />;
    case "ending-known-edge":
    case "conclusion":
      return <ConclusionScene isVertical={isVertical} />;
    default:
      return <BigTitle isVertical={isVertical}>{scene.onScreenText.join(" · ")}</BigTitle>;
  }
};

export const PokeEpisode: React.FC<{orientation: "landscape" | "vertical"}> = ({orientation}) => {
  const isVertical = orientation === "vertical";
  const sceneStart = (id: string) =>
    timeline.scenes.find((scene) => scene.id === id)?.startFrame ?? 0;
  return (
    <AbsoluteFill style={{background: COLORS.paper, fontFamily: SANS}}>
      <Audio src={staticFile("episodes/episode-001/sound-design/ambient-bed.mp3")} volume={0.72} />
      <Sequence from={sceneStart("seg-001")} durationInFrames={20}>
        <Audio
          src={staticFile("episodes/episode-001/sound-design/message-pop.wav")}
          volume={0.55}
        />
      </Sequence>
      {["seg-002", "seg-009", "seg-011"].map((id) => (
        <Sequence key={`impact-${id}`} from={sceneStart(id)} durationInFrames={32}>
          <Audio src={staticFile("episodes/episode-001/sound-design/impact.wav")} volume={0.42} />
        </Sequence>
      ))}
      <Sequence from={sceneStart("seg-008") + 24} durationInFrames={20}>
        <Audio
          src={staticFile("episodes/episode-001/sound-design/message-pop.wav")}
          volume={0.35}
        />
      </Sequence>
      {[50, 105, 160, 215, 270].map((offset) => (
        <Sequence
          key={`pulse-${offset}`}
          from={sceneStart("seg-010") + offset}
          durationInFrames={20}
        >
          <Audio src={staticFile("episodes/episode-001/sound-design/pulse.wav")} volume={0.3} />
        </Sequence>
      ))}
      {timeline.scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
          premountFor={30}
        >
          <SceneShell scene={scene} isVertical={isVertical}>
            <SceneVisual scene={scene} isVertical={isVertical} />
          </SceneShell>
          <Audio src={staticFile(scene.audio)} />
        </Sequence>
      ))}
      <CaptionLayer isVertical={isVertical} />
    </AbsoluteFill>
  );
};

export const PokeCover: React.FC<{orientation: "landscape" | "portrait"}> = ({orientation}) => {
  const isVertical = orientation === "portrait";
  return (
    <AbsoluteFill style={{background: COLORS.paper, color: COLORS.ink, fontFamily: SANS}}>
      <PaperBackground isVertical={isVertical} />
      <div
        style={{
          position: "absolute",
          inset: isVertical ? "70px 64px" : "70px 90px",
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr" : "1.08fr .92fr",
          alignItems: "center",
          gap: isVertical ? 40 : 76,
        }}
      >
        <div>
          <div style={{fontSize: isVertical ? 27 : 22, color: COLORS.blue, fontWeight: 750}}>
            POKE · 2026 PRODUCT STORY
          </div>
          <div
            style={{
              marginTop: 24,
              fontFamily: SERIF,
              fontWeight: 760,
              fontSize: isVertical ? 104 : 110,
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
              marginTop: isVertical ? 44 : 36,
              fontFamily: SERIF,
              fontSize: isVertical ? 190 : 190,
              fontWeight: 760,
              lineHeight: 0.82,
            }}
          >
            1 亿+
          </div>
          <div style={{fontSize: isVertical ? 28 : 24, color: COLORS.muted, marginTop: 26}}>
            约三个月消息量 · 截至 2026.07.23 · Cognition
          </div>
          <div
            style={{
              marginTop: isVertical ? 54 : 42,
              paddingTop: isVertical ? 30 : 24,
              borderTop: `2px solid ${COLORS.blue}`,
              fontSize: isVertical ? 46 : 42,
              fontWeight: 760,
            }}
          >
            它为什么先给你发消息？
          </div>
        </div>
        <div style={{display: "grid", placeItems: "center"}}>
          <Phone isVertical={isVertical} compact staticState />
        </div>
      </div>
    </AbsoluteFill>
  );
};
