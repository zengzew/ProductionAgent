import React from "react";
import {AbsoluteFill} from "remotion";
import type {ReferenceStory} from "../../schemas/reference-story";

/** A stable reading hierarchy. Evidence changes inside it, without title cards. */
export const ReferenceStoryFrame: React.FC<{
  presentation: ReferenceStory;
  children: React.ReactNode;
  sourceLabel?: string;
  evidenceLabel?: string;
}> = ({presentation, children, sourceLabel, evidenceLabel}) => (
  <AbsoluteFill style={{background: "#050505", color: "white"}}>
    <div style={{position: "absolute", top: 290, left: 58, right: 58, textAlign: "center"}}>
      <div
        style={{
          fontSize: Math.min(46, Math.floor(960 / presentation.headline.length)),
          lineHeight: 1.35,
        }}
      >
        {presentation.headline}
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: Math.min(60, Math.floor(960 / presentation.resultLine.length)),
          lineHeight: 1.25,
          fontWeight: 750,
          color: "#f4d66c",
        }}
      >
        {presentation.resultLine}
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        top: 500,
        left: 48,
        right: 48,
        height: 48,
        textAlign: "center",
        fontSize: 28,
        color: "#e8dca8",
      }}
    >
      {evidenceLabel}
    </div>
    <div
      style={{position: "absolute", top: 562, left: 48, right: 48, height: 760, overflow: "hidden"}}
    >
      {children}
    </div>
    <div
      style={{
        position: "absolute",
        top: 1340,
        left: 64,
        right: 64,
        textAlign: "center",
        fontSize: 22,
        color: "#bbb",
        lineHeight: 1.4,
      }}
    >
      {sourceLabel}
    </div>
  </AbsoluteFill>
);

export const referenceCaptionStyle: React.CSSProperties = {
  position: "absolute",
  left: 70,
  right: 70,
  top: 1450,
  color: "white",
  textAlign: "center",
  fontSize: 44,
  lineHeight: 1.4,
  fontWeight: 500,
  whiteSpace: "pre-line",
  zIndex: 20,
};
