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
import timelineRaw from "../episode-002-timeline.generated.json";
import captionsRaw from "../episode-002-captions.generated.json";
import claimsRaw from "../../content/episode-002/research/facts.json";
import sourcesRaw from "../../content/episode-002/research/sources.json";
import {
  claimSchema,
  generatedCaptionSchema,
  sourceSchema,
  timelineSchema,
  type Timeline,
} from "../schemas/episode";
import {assertTimelineMatchesEpisode} from "../lib/render-contract";
import {fadeSceneOpacity} from "../lib/scene-animation";

const timeline = timelineSchema.parse(timelineRaw);
assertTimelineMatchesEpisode(timeline, "episode-002");
const isGoal3Benchmark = timeline.layoutVariant === "roost-goal3";
const claims = claimsRaw.map((claim) => claimSchema.parse(claim));
const sources = sourcesRaw.map((source) => sourceSchema.parse(source));
const captions = captionsRaw.map((caption) => generatedCaptionSchema.parse(caption));
const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
const sourceMap = new Map(sources.map((source) => [source.id, source]));

const COLORS = {
  sky: "#dcebf0",
  skyDeep: "#8eb8c4",
  cloud: "#f8f5ec",
  ink: "#20302f",
  muted: "#61716d",
  green: "#38665b",
  leaf: "#80a36d",
  gold: "#d6a84f",
  rust: "#b86849",
  night: "#1f3337",
  white: "#fffdf7",
  line: "#a9c0bc",
};

const SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", serif';
const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};

const sourcePublishers = (claimIds: string[]): string => {
  const sourceIds = new Set(
    [...claimIds].reverse().flatMap((claimId) => claimMap.get(claimId)?.sourceIds ?? []),
  );
  const publishers = Array.from(sourceIds).map(
    (sourceId) => sourceMap.get(sourceId)?.publisher ?? sourceId,
  );
  return Array.from(new Set(publishers)).slice(0, 3).join(" · ");
};

const reportingLabel = (claimIds: string[]): string => {
  const types = claimIds.map((claimId) => claimMap.get(claimId)?.reportingType).filter(Boolean);
  if (types.includes("inference")) return "边界";
  if (types.includes("founder-reported")) return "创始人口径";
  if (types.includes("company-reported")) return "官方说明";
  return "交叉核对";
};

const Background: React.FC<{dark?: boolean}> = ({dark = false}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 6000], [0, 180], {
    ...clamp,
    extrapolateRight: "extend",
  });
  return (
    <AbsoluteFill
      style={{
        background: dark
          ? `radial-gradient(circle at 78% 12%, #42676c 0%, ${COLORS.night} 42%, #172528 100%)`
          : `radial-gradient(circle at 76% 12%, ${COLORS.white} 0%, ${COLORS.sky} 44%, #c7dadd 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: dark ? 0.08 : 0.2,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E\")",
        }}
      />
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            width: 420 + index * 120,
            height: 130 + index * 28,
            borderRadius: "50%",
            background: dark ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.34)",
            left: -180 + index * 410 + drift * (0.05 + index * 0.015),
            top: 190 + index * 360,
            filter: "blur(16px)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const Bird: React.FC<{
  progress?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({progress = 1, size = 120, color = COLORS.rust, style}) => {
  const flap = Math.sin(progress * Math.PI * 10) * 10;
  return (
    <svg
      viewBox="0 0 180 100"
      style={{
        width: size,
        height: size * 0.56,
        overflow: "visible",
        filter: "drop-shadow(0 12px 12px rgba(32,48,47,.18))",
        ...style,
      }}
    >
      <path
        d={`M89 55 C61 ${32 - flap}, 32 ${28 + flap}, 8 50 C42 48, 62 64, 88 70`}
        fill={color}
        opacity={0.9}
      />
      <path
        d={`M91 55 C119 ${32 + flap}, 148 ${28 - flap}, 172 50 C138 48, 118 64, 92 70`}
        fill={color}
        opacity={0.78}
      />
      <ellipse cx="90" cy="61" rx="19" ry="27" fill={color} />
      <circle cx="94" cy="38" r="14" fill={color} />
      <circle cx="99" cy="35" r="2.7" fill={COLORS.ink} />
      <path d="M107 39 L128 45 L108 48 Z" fill={COLORS.gold} />
    </svg>
  );
};

const FlightMap: React.FC<{
  metric?: boolean;
  initialProgress?: number;
  centerLabel?: string;
}> = ({metric = false, initialProgress = 0, centerLabel}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const animatedProgress = spring({
    frame,
    fps,
    config: {damping: 18, stiffness: 45, mass: 1.4},
    durationInFrames: fps * 3,
  });
  const progress = initialProgress + animatedProgress * (1 - initialProgress);
  const x = interpolate(progress, [0, 1], [105, 775], clamp);
  const y = 310 - Math.sin(progress * Math.PI) * 190;
  return (
    <div
      style={{
        position: "relative",
        width: 880,
        height: 620,
        borderRadius: 46,
        background: "rgba(255,253,247,.72)",
        border: `2px solid ${COLORS.line}`,
        overflow: "hidden",
        boxShadow: "0 30px 80px rgba(32,48,47,.14)",
      }}
    >
      <svg viewBox="0 0 880 620" style={{position: "absolute", inset: 0}}>
        <path
          d="M-20 190 C120 80 230 230 365 140 C500 48 620 130 910 30 L910 620 L-20 620 Z"
          fill="#d8e4d3"
          opacity={0.78}
        />
        <path
          d="M-30 490 C120 390 270 510 420 380 C590 230 720 390 920 270"
          fill="none"
          stroke="#b4c9c6"
          strokeWidth="10"
          opacity={0.62}
        />
        <path
          d="M105 310 Q440 35 775 310"
          fill="none"
          stroke={COLORS.rust}
          strokeDasharray="16 14"
          strokeWidth="5"
          pathLength="1"
          strokeDashoffset={1 - progress}
        />
        <circle cx="105" cy="310" r="13" fill={COLORS.green} />
        <circle cx="775" cy="310" r="13" fill={COLORS.rust} />
      </svg>
      <Bird
        progress={progress}
        size={140}
        style={{position: "absolute", left: x - 70, top: y - 45}}
      />
      <div
        style={{
          position: "absolute",
          left: 50,
          right: 50,
          bottom: 42,
          display: "flex",
          justifyContent: "space-between",
          color: COLORS.muted,
          fontSize: 25,
          fontWeight: 650,
        }}
      >
        <span>出发城市</span>
        <span style={{color: COLORS.rust}}>
          {centerLabel ?? (metric ? "三日增长：10×" : "预计三天后到达")}
        </span>
        <span>朋友所在城市</span>
      </div>
    </div>
  );
};

const Metric: React.FC<{value: string; label: string; accent?: string}> = ({
  value,
  label,
  accent = COLORS.rust,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = spring({frame, fps, config: {damping: 16, stiffness: 90}});
  return (
    <div style={{transform: `scale(${0.86 + scale * 0.14})`, textAlign: "center"}}>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 150,
          lineHeight: 1,
          fontWeight: 800,
          color: accent,
          letterSpacing: -7,
        }}
      >
        {value}
      </div>
      <div style={{marginTop: 22, fontSize: 32, color: COLORS.muted, letterSpacing: 2}}>
        {label}
      </div>
    </div>
  );
};

const Cards: React.FC<{items: string[]; accent?: string}> = ({items, accent = COLORS.green}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: "grid", gap: 22, width: "100%"}}>
      {items.map((item, index) => {
        const enter = spring({
          frame: Math.max(0, frame - index * 6),
          fps,
          config: {damping: 17, stiffness: 100},
        });
        return (
          <div
            key={item}
            style={{
              transform: `translateY(${(1 - enter) * 42}px)`,
              opacity: enter,
              padding: "27px 34px",
              borderRadius: 25,
              background: "rgba(255,253,247,.8)",
              border: `2px solid ${COLORS.line}`,
              boxShadow: "0 16px 40px rgba(32,48,47,.1)",
              fontSize: 34,
              fontWeight: 650,
              color: index === items.length - 1 ? accent : COLORS.ink,
            }}
          >
            <span style={{color: accent, marginRight: 18}}>●</span>
            {item}
          </div>
        );
      })}
    </div>
  );
};

const EvidenceScreenshot: React.FC<{
  src: string;
  source: string;
  height?: number;
}> = ({src, source, height = 500}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({frame, fps, config: {damping: 18, stiffness: 85}});
  return (
    <div
      style={{
        position: "relative",
        width: 900,
        height,
        overflow: "hidden",
        borderRadius: 30,
        border: `3px solid ${COLORS.line}`,
        background: COLORS.white,
        boxShadow: "0 30px 80px rgba(32,48,47,.18)",
        transform: `translateY(${(1 - reveal) * 32}px) scale(${0.97 + reveal * 0.03})`,
        opacity: reveal,
      }}
    >
      <Img src={staticFile(src)} style={{width: "100%", height: "100%", objectFit: "cover"}} />
      <div
        style={{
          position: "absolute",
          left: 20,
          bottom: 18,
          padding: "9px 15px",
          borderRadius: 999,
          color: COLORS.white,
          background: "rgba(20,29,30,.82)",
          fontSize: 20,
          fontWeight: 650,
        }}
      >
        真实页面截图 · {source}
      </div>
    </div>
  );
};

const SceneVisual: React.FC<{scene: Timeline["scenes"][number]}> = ({scene}) => {
  const frame = useCurrentFrame();
  if (scene.scene === "hook-send-bird") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 38}}>
        <div
          style={{
            width: 830,
            padding: "30px 34px",
            borderRadius: 34,
            background: COLORS.white,
            border: `2px solid ${COLORS.line}`,
            fontSize: 42,
            boxShadow: "0 28px 70px rgba(32,48,47,.14)",
          }}
        >
          周末见
          <span
            style={{
              float: "right",
              background: COLORS.rust,
              color: COLORS.white,
              padding: "10px 23px",
              borderRadius: 999,
              fontSize: 28,
            }}
          >
            已发送
          </span>
        </div>
        <FlightMap initialProgress={0.18} />
        <div
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            background: "rgba(32,48,47,.86)",
            color: COLORS.white,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          功能演示 · 送达规则来自 Roost 官方说明
        </div>
      </div>
    );
  }
  if (scene.scene === "hook-rule-growth") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 30}}>
        <EvidenceScreenshot
          src="episodes/episode-002/captured/roost-app-store.png"
          source="Apple App Store"
          height={500}
        />
        <Cards
          items={
            isGoal3Benchmark
              ? ["按距离和鸟速送达", "地图显示飞行路线"]
              : ["按距离和鸟速送达", "地图显示飞行路线", "随时查看剩余时间"]
          }
        />
      </div>
    );
  }
  if (scene.scene === "hook-core-question") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 34}}>
        <EvidenceScreenshot
          src="episodes/episode-002/captured/roost-home.png"
          source="Roost 官网"
          height={440}
        />
        <div style={{display: "flex", alignItems: "center", gap: 28}}>
          <Metric value="1 万" label="用户" />
          <div style={{fontSize: 68, color: COLORS.gold}}>→</div>
          <Metric value="10 万" label="3 天后 · 创始人口径" />
        </div>
        <div style={{fontSize: 34, color: COLORS.rust}}>为什么反而让人期待？</div>
      </div>
    );
  }
  if (scene.scene === "instant-pressure") {
    return (
      <Cards
        accent={COLORS.rust}
        items={["消息已经起飞", "路线清晰可见", "不用立刻回复", "想清楚，再派出一只鸟"]}
      />
    );
  }
  if (scene.scene === "origin-friends-publish") {
    return (
      <Cards
        items={[
          "2025.05 · 朋友间的业余项目",
          "概念视频先获得回应",
          "朋友催他公开",
          "2026.04.28 · Roost 上架",
        ]}
      />
    );
  }
  if (scene.scene === "distance-speed-map") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 30}}>
        <FlightMap centerLabel={isGoal3Benchmark ? "距离改变到达时间" : undefined} />
        <div style={{display: "flex", gap: 18, fontSize: 29}}>
          {(isGoal3Benchmark
            ? ["信使速度不同", "距离越远，到达越久", "路线一直看得见"]
            : ["猎鹰 · 快", "蜂鸟 · 慢", "蜗牛 · 更慢", "乌龟 · 很久"]
          ).map((item, index) => (
            <div
              key={item}
              style={{
                padding: "18px 22px",
                borderRadius: 18,
                background: COLORS.white,
                border: `2px solid ${COLORS.line}`,
                color: index > 1 ? COLORS.rust : COLORS.green,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (scene.scene === "waiting-becomes-play") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 46}}>
        <Bird progress={frame / 30} size={340} color={COLORS.green} />
        <div style={{fontFamily: SERIF, fontSize: 82, fontWeight: 800}}>等待有了形状</div>
        <Cards items={["看它飞过海岸线", "训练自己的鸟", "关掉手机，先过自己的生活"]} />
      </div>
    );
  }
  if (scene.scene === "threads-elizabethan") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 36}}>
        <div
          style={{
            width: 820,
            padding: "58px 60px",
            background: "#f4ead4",
            borderRadius: 18,
            transform: "rotate(-1.5deg)",
            boxShadow: "0 26px 60px rgba(32,48,47,.14)",
            fontFamily: SERIF,
            fontSize: 44,
            lineHeight: 1.55,
          }}
        >
          Good morrow, dear friend.
          <br />
          Thy bird hath finally arrived.
        </div>
        <div style={{fontSize: 29, color: COLORS.muted}}>Threads 上的用户故事 · 身份隐去</div>
        <div style={{display: "flex", alignItems: "center", gap: 35}}>
          <Metric value="1 万" label="用户" />
          <div style={{fontSize: 72, color: COLORS.rust}}>→</div>
          <Metric value="10 万" label="3 天后" />
        </div>
      </div>
    );
  }
  if (scene.scene === "growth-evidence") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 54}}>
        <Metric value="25 万+" label="用户 · 2026.07.07 · 创始人口径" />
        <div style={{display: "flex", gap: 28}}>
          <Metric value="10 万+" label="每日活跃对话" accent={COLORS.green} />
          <Metric value="$0" label="付费获客" accent={COLORS.gold} />
        </div>
        <div style={{fontSize: 28, color: COLORS.muted}}>创始人口径 · 用户与活跃对话分列</div>
      </div>
    );
  }
  if (scene.scene === "bird-store") {
    if (isGoal3Benchmark) {
      return (
        <div style={{display: "grid", justifyItems: "center", gap: 48}}>
          <Bird progress={frame / 30} size={300} color={COLORS.rust} />
          <Cards items={["挑一只喜欢的鸟", "收集和训练", "轮换商店 · 支持者订阅"]} />
        </div>
      );
    }
    return (
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28}}>
        {[
          ["红尾鹰", "$4.99"],
          ["神话凤凰", "$9.99"],
          ["终身支持者", "$50"],
          ["已售终身档", "约 60–70"],
        ].map(([name, price], index) => (
          <div
            key={name}
            style={{
              minHeight: 260,
              padding: 34,
              borderRadius: 30,
              background: COLORS.white,
              border: `2px solid ${COLORS.line}`,
              display: "grid",
              alignContent: "space-between",
            }}
          >
            <Bird
              progress={frame / 30 + index}
              size={150}
              color={index > 1 ? COLORS.gold : COLORS.rust}
            />
            <div style={{fontSize: 30, fontWeight: 700}}>{name}</div>
            <div style={{fontSize: 38, color: COLORS.rust}}>{price}</div>
          </div>
        ))}
      </div>
    );
  }
  if (scene.scene === "privacy-safety") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 36}}>
        <div
          style={{
            width: 540,
            height: 540,
            borderRadius: "50%",
            border: `3px dashed ${COLORS.green}`,
            display: "grid",
            placeItems: "center",
            background: "rgba(255,253,247,.58)",
          }}
        >
          <div style={{fontSize: 48, fontWeight: 800}}>只显示城市</div>
        </div>
        <Cards
          items={[
            "默认只向朋友显示城市",
            "精确位置：由你选择 close friends",
            "Pen Pals：自愿的一对一匿名通信",
            "双方接受后打开对话",
          ]}
        />
      </div>
    );
  }
  if (scene.scene === "artist-community-ending" && isGoal3Benchmark) {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 50, width: 900}}>
        <Metric value="30 万" label="注册用户 · ANSA 7/10" />
        <Cards accent={COLORS.rust} items={["回复不用马上来", "把等待变成看得见的路线"]} />
        <div style={{display: "flex", alignItems: "center", gap: 24, width: "100%"}}>
          <Bird progress={frame / 30} size={180} color={COLORS.rust} />
          <div style={{height: 3, flex: 1, borderTop: `3px dashed ${COLORS.gold}`}} />
          <span style={{fontSize: 31, color: COLORS.rust, fontWeight: 750}}>继续飞向朋友</span>
        </div>
      </div>
    );
  }
  if (scene.scene === "artist-community-ending") {
    return (
      <div style={{display: "grid", justifyItems: "center", gap: 50, width: 900}}>
        <div style={{display: "flex", alignItems: "flex-start", gap: 80}}>
          <Metric value="30 万" label="注册用户 · ANSA 7/10" />
          <Metric value="10 万+" label="每日活跃对话 · 创始人口径 7/7" accent={COLORS.green} />
        </div>
        <Cards
          accent={COLORS.rust}
          items={[
            "缓解每条消息都催人立刻回复的压力",
            "把等待变成看得见的路线",
            "慢速社交 · 阶段性市场信号",
          ]}
        />
        <div style={{display: "flex", alignItems: "center", gap: 24, width: "100%"}}>
          <Bird progress={frame / 30} size={180} color={COLORS.rust} />
          <div style={{height: 3, flex: 1, borderTop: `3px dashed ${COLORS.gold}`}} />
          <span style={{fontSize: 31, color: COLORS.rust, fontWeight: 750}}>继续飞向朋友</span>
        </div>
      </div>
    );
  }
  throw new Error(`Roost 未注册 scene：${scene.scene}`);
};

const CaptionLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const caption = captions.find(
    (candidate) => frame >= candidate.startFrame && frame < candidate.endFrame,
  );
  if (!caption) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 68,
        right: 68,
        bottom: 240,
        minHeight: 112,
        display: "grid",
        placeItems: "center",
        padding: "18px 30px",
        borderRadius: 26,
        color: COLORS.white,
        background: "rgba(24,39,42,.9)",
        fontFamily: SANS,
        fontSize: 46,
        lineHeight: 1.28,
        fontWeight: 700,
        textAlign: "center",
        whiteSpace: "pre-line",
        boxShadow: "0 18px 50px rgba(19,31,33,.24)",
        zIndex: 30,
      }}
    >
      {caption.text}
    </div>
  );
};

const RoostScene: React.FC<{scene: Timeline["scenes"][number]}> = ({scene}) => {
  const frame = useCurrentFrame();
  const dark = false;
  const opacity = fadeSceneOpacity(frame, scene.durationFrames, scene.index === 0);
  return (
    <AbsoluteFill style={{opacity, color: dark ? COLORS.white : COLORS.ink, fontFamily: SANS}}>
      <Background dark={dark} />
      <div
        style={{
          position: "absolute",
          left: 68,
          right: 68,
          top: 64,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 23,
          letterSpacing: 2,
          color: dark ? "#bcd0cd" : COLORS.muted,
          fontWeight: 700,
        }}
      >
        <span>
          <b style={{color: COLORS.rust, marginRight: 14}}>
            {String(scene.index + 1).padStart(2, "0")}
          </b>
          PRODUCT STORY · ROOST
        </span>
        <span
          style={{
            padding: "9px 15px",
            borderRadius: 999,
            border: `1px solid ${dark ? "#8fa8a4" : COLORS.line}`,
            background: dark ? "rgba(255,255,255,.05)" : "rgba(255,253,247,.55)",
            letterSpacing: 0,
          }}
        >
          {reportingLabel(scene.claimIds)}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 68,
          right: 68,
          top: 138,
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 64,
            lineHeight: 1.12,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          {scene.onScreenText[0]}
        </div>
        <div style={{marginTop: 18, fontSize: 28, color: dark ? "#bcd0cd" : COLORS.muted}}>
          {scene.onScreenText.slice(1, 3).join(" · ")}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 68,
          right: 68,
          top: 340,
          bottom: 440,
          display: "grid",
          placeItems: "center",
        }}
      >
        <SceneVisual scene={scene} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 68,
          right: 68,
          bottom: 382,
          fontSize: 22,
          color: dark ? "#a9c2be" : COLORS.muted,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        来源：{sourcePublishers(scene.claimIds)}
      </div>
    </AbsoluteFill>
  );
};

export const RoostEpisode: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: COLORS.sky}}>
    {timeline.scenes.map((scene) => (
      <Sequence
        key={scene.id}
        from={scene.startFrame}
        durationInFrames={scene.durationFrames}
        premountFor={30}
      >
        <RoostScene scene={scene} />
        <Audio src={staticFile(scene.audio)} />
      </Sequence>
    ))}
    <CaptionLayer />
  </AbsoluteFill>
);

export const RoostCover: React.FC = () => (
  <AbsoluteFill style={{fontFamily: SANS, color: COLORS.ink}}>
    <Background />
    <div style={{position: "absolute", left: 70, right: 70, top: 80}}>
      <div style={{fontSize: 25, letterSpacing: 4, color: COLORS.rust, fontWeight: 800}}>
        PRODUCT STORY · 002
      </div>
      <div
        style={{
          marginTop: 70,
          fontFamily: SERIF,
          fontSize: 112,
          lineHeight: 1.05,
          fontWeight: 900,
          letterSpacing: -5,
        }}
      >
        一条消息
        <br />
        飞三天
      </div>
      <div style={{marginTop: 28, fontSize: 42, color: COLORS.green}}>为什么有人偏要等？</div>
    </div>
    <FlightMap />
  </AbsoluteFill>
);
