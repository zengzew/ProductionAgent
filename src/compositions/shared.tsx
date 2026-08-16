import React from "react";
import {AbsoluteFill, Img, interpolate, useCurrentFrame} from "remotion";

export const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

type CaptionCue = {
  startFrame: number;
  endFrame: number;
  text: string;
};

export const findActiveCaption = <T extends {startFrame: number; endFrame: number}>(
  captions: readonly T[],
  frame: number,
): T | undefined =>
  captions.find((candidate) => frame >= candidate.startFrame && frame < candidate.endFrame);

export const CaptionLayer: React.FC<{
  captions: readonly CaptionCue[];
  style: React.CSSProperties;
}> = ({captions, style}) => {
  const frame = useCurrentFrame();
  const caption = findActiveCaption(captions, frame);
  if (!caption) return null;
  return <div style={style}>{caption.text}</div>;
};

export type HighlightSegment = {
  text: string;
  highlighted: boolean;
};

export const highlightSegments = (
  text: string,
  highlights: readonly string[],
): HighlightSegment[] => {
  const needles = [...new Set(highlights.filter((item) => item.length > 0))].sort(
    (left, right) => right.length - left.length,
  );
  if (text.length === 0 || needles.length === 0) {
    return text.length === 0 ? [] : [{text, highlighted: false}];
  }

  const parts: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let matchIndex = -1;
    let matchText = "";
    for (const needle of needles) {
      const index = text.indexOf(needle, cursor);
      if (index < 0) continue;
      const closer = matchIndex < 0 || index < matchIndex;
      const longerTie = index === matchIndex && needle.length > matchText.length;
      if (closer || longerTie) {
        matchIndex = index;
        matchText = needle;
      }
    }
    if (matchIndex < 0) {
      parts.push({text: text.slice(cursor), highlighted: false});
      break;
    }
    if (matchIndex > cursor) {
      parts.push({text: text.slice(cursor, matchIndex), highlighted: false});
    }
    parts.push({text: matchText, highlighted: true});
    cursor = matchIndex + matchText.length;
  }
  return parts;
};

export const HighlightText: React.FC<{
  text: string;
  highlights?: readonly string[];
  highlightColor: string;
  style?: React.CSSProperties;
  highlightStyle?: React.CSSProperties;
}> = ({text, highlights = [], highlightColor, style, highlightStyle}) => (
  <span style={style}>
    {highlightSegments(text, highlights).map((part, index) =>
      part.highlighted ? (
        <span key={`${part.text}-${index}`} style={{color: highlightColor, ...highlightStyle}}>
          {part.text}
        </span>
      ) : (
        <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>
      ),
    )}
  </span>
);

export const HighlightCaption: React.FC<{
  captions: readonly CaptionCue[];
  highlights?: readonly string[];
  highlightColor: string;
  style: React.CSSProperties;
  highlightStyle?: React.CSSProperties;
}> = ({captions, highlights = [], highlightColor, style, highlightStyle}) => {
  const frame = useCurrentFrame();
  const caption = findActiveCaption(captions, frame);
  if (!caption) return null;
  return (
    <div style={style}>
      <HighlightText
        text={caption.text}
        highlights={highlights}
        highlightColor={highlightColor}
        highlightStyle={highlightStyle}
      />
    </div>
  );
};

export const EVIDENCE_STAGE_LAYOUT = {
  width: 1080,
  height: 1920,
  gutter: 64,
  titleTop: 56,
  titleHeight: 176,
  stageTop: 244,
  stageBottom: 1516,
  sourceTop: 1524,
  sourceHeight: 48,
  captionBottom: 228,
} as const;

type NoiseTexture = {
  baseFrequency: string;
  numOctaves: number;
  rectOpacity: string;
  opacity: number;
  mixBlendMode?: React.CSSProperties["mixBlendMode"];
};

const noiseBackgroundImage = ({
  baseFrequency,
  numOctaves,
  rectOpacity,
}: Pick<NoiseTexture, "baseFrequency" | "numOctaves" | "rectOpacity">): string =>
  `url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='${numOctaves}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${rectOpacity}'/%3E%3C/svg%3E")`;

export const BackgroundCanvas: React.FC<{
  background: string;
  noise: NoiseTexture;
  noisePlacement?: "before-content" | "after-content";
  overflow?: React.CSSProperties["overflow"];
  children?: React.ReactNode;
}> = ({background, noise, noisePlacement = "after-content", overflow, children}) => {
  const noiseLayer = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: noise.opacity,
        backgroundImage: noiseBackgroundImage(noise),
        mixBlendMode: noise.mixBlendMode,
      }}
    />
  );
  return (
    <AbsoluteFill style={{background, overflow}}>
      {noisePlacement === "before-content" ? noiseLayer : null}
      {children}
      {noisePlacement === "after-content" ? noiseLayer : null}
    </AbsoluteFill>
  );
};

type ReportingType =
  "inference" | "company-reported" | "founder-reported" | "independently-verified";

type ReportingAttribution = {
  reportingType: ReportingType;
};

type SourceAttribution = {
  sourceIds: readonly string[];
};

export type ReportingIdentityLabels<T> = {
  inference: T;
  company: T;
  founder: T;
  verified: T;
};

export const reportingIdentity = <T,>({
  claimIds,
  claimsById,
  labels,
}: {
  claimIds: readonly string[];
  claimsById: ReadonlyMap<string, ReportingAttribution>;
  labels: ReportingIdentityLabels<T>;
}): T => {
  const types = new Set(claimIds.map((claimId) => claimsById.get(claimId)?.reportingType));
  if (types.has("inference")) return labels.inference;
  if (types.has("company-reported")) return labels.company;
  if (types.has("founder-reported")) return labels.founder;
  return labels.verified;
};

export const sourcePublishers = ({
  claimIds,
  claimsById,
  sourcesById,
  reverseClaims = false,
  limit = 3,
}: {
  claimIds: readonly string[];
  claimsById: ReadonlyMap<string, SourceAttribution>;
  sourcesById: ReadonlyMap<string, {publisher: string}>;
  reverseClaims?: boolean;
  limit?: number;
}): string => {
  const orderedClaimIds = reverseClaims ? [...claimIds].reverse() : claimIds;
  const sourceIds = new Set(
    orderedClaimIds.flatMap((claimId) => claimsById.get(claimId)?.sourceIds ?? []),
  );
  const publishers = Array.from(sourceIds).map(
    (sourceId) => sourcesById.get(sourceId)?.publisher ?? sourceId,
  );
  return Array.from(new Set(publishers)).slice(0, limit).join(" · ");
};

export const SourceLabel: React.FC<{
  label: string;
  style: React.CSSProperties;
}> = ({label, style}) => <div style={style}>{label}</div>;

export const EvidenceStage: React.FC<{
  title: React.ReactNode;
  source: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  titleStyle?: React.CSSProperties;
  stageStyle?: React.CSSProperties;
  sourceStyle?: React.CSSProperties;
}> = ({title, source, badge, children, style, titleStyle, stageStyle, sourceStyle}) => (
  <AbsoluteFill style={style}>
    <div
      style={{
        position: "absolute",
        left: EVIDENCE_STAGE_LAYOUT.gutter,
        right: EVIDENCE_STAGE_LAYOUT.gutter,
        top: EVIDENCE_STAGE_LAYOUT.titleTop,
        height: EVIDENCE_STAGE_LAYOUT.titleHeight,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 20,
        zIndex: 6,
        ...titleStyle,
      }}
    >
      <div style={{minWidth: 0, flex: 1}}>{title}</div>
      {badge}
    </div>
    <div
      style={{
        position: "absolute",
        left: EVIDENCE_STAGE_LAYOUT.gutter,
        right: EVIDENCE_STAGE_LAYOUT.gutter,
        top: EVIDENCE_STAGE_LAYOUT.stageTop,
        bottom: EVIDENCE_STAGE_LAYOUT.height - EVIDENCE_STAGE_LAYOUT.stageBottom,
        minHeight: 0,
        ...stageStyle,
      }}
    >
      {children}
    </div>
    <div
      style={{
        position: "absolute",
        left: EVIDENCE_STAGE_LAYOUT.gutter,
        right: EVIDENCE_STAGE_LAYOUT.gutter,
        top: EVIDENCE_STAGE_LAYOUT.sourceTop,
        height: EVIDENCE_STAGE_LAYOUT.sourceHeight,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        ...sourceStyle,
      }}
    >
      {source}
    </div>
  </AbsoluteFill>
);

export const OfficialStill: React.FC<{
  src: string;
  label: string;
  objectPosition?: string;
  zoom?: number;
  coverTop?: number;
  coverColor?: string;
  kenBurns?: boolean;
  style?: React.CSSProperties;
  imageStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}> = ({
  src,
  label,
  objectPosition = "center top",
  zoom = 1,
  coverTop = 0,
  coverColor = "#f4f3f1",
  kenBurns = false,
  style,
  imageStyle,
  labelStyle,
}) => {
  const frame = useCurrentFrame();
  const motion = kenBurns ? interpolate(frame, [0, 220], [0, 0.08], CLAMP) : 0;
  const scale = zoom + motion;
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        height: "100%",
        background: "#111318",
        ...style,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          transform: `scale(${scale})`,
          transformOrigin: objectPosition,
          ...imageStyle,
        }}
      />
      {coverTop > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: coverTop,
            background: coverColor,
          }}
        />
      ) : null}
      <SourceLabel
        label={label}
        style={{
          position: "absolute",
          left: 18,
          bottom: 18,
          padding: "10px 16px",
          borderRadius: 999,
          background: "rgba(8,9,13,.88)",
          color: "#f3efe4",
          fontSize: 26,
          ...labelStyle,
        }}
      />
    </div>
  );
};

export const MetricCard: React.FC<{
  kicker?: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  caveat?: React.ReactNode;
  question?: React.ReactNode;
  style?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
}> = ({kicker, value, unit, caveat, question, style, valueStyle}) => (
  <div
    style={{
      height: "100%",
      display: "grid",
      alignContent: "center",
      gap: 22,
      ...style,
    }}
  >
    {kicker}
    <div style={valueStyle}>{value}</div>
    {unit}
    {caveat}
    {question}
  </div>
);

export const FlowCards: React.FC<{
  items: readonly {
    key: string;
    title: React.ReactNode;
    detail: React.ReactNode;
    footer?: React.ReactNode;
    style?: React.CSSProperties;
  }[];
  columns?: number;
  gap?: number;
  style?: React.CSSProperties;
}> = ({items, columns, gap = 16, style}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${columns ?? items.length}, minmax(0, 1fr))`,
      gap,
      ...style,
    }}
  >
    {items.map((item) => (
      <div key={item.key} style={item.style}>
        <div>{item.title}</div>
        <div>{item.detail}</div>
        {item.footer}
      </div>
    ))}
  </div>
);
