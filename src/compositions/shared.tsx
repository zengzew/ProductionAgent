import React from "react";
import {AbsoluteFill, useCurrentFrame} from "remotion";

export const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

type CaptionCue = {
  startFrame: number;
  endFrame: number;
  text: string;
};

export const CaptionLayer: React.FC<{
  captions: readonly CaptionCue[];
  style: React.CSSProperties;
}> = ({captions, style}) => {
  const frame = useCurrentFrame();
  const caption = captions.find(
    (candidate) => frame >= candidate.startFrame && frame < candidate.endFrame,
  );
  if (!caption) return null;
  return <div style={style}>{caption.text}</div>;
};

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
