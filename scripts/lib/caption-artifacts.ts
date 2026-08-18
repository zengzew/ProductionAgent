import {
  captionPartsFromPlan,
  captionTextsEquivalent,
  fitCaptionPartsToDuration,
} from "../../src/lib/delivery/captions";
import type {CaptionPlan, Script, Timeline} from "../../src/schemas/episode";
import {groupCaptionTextsByScene, type GeneratedCaptionArtifact} from "./validation";

export const validateCaptionPlanCoverage = (script: Script, captionPlan: CaptionPlan): string[] => {
  const ids = captionPlan.segments.map((segment) => segment.segmentId);
  const uniqueIds = new Set(ids);
  const scriptIds = new Set(script.segments.map((segment) => segment.id));
  const errors: string[] = [];
  if (uniqueIds.size !== ids.length) errors.push("字幕规划 segmentId 不得重复");
  if (
    uniqueIds.size !== scriptIds.size ||
    [...uniqueIds].some((segmentId) => !scriptIds.has(segmentId))
  ) {
    errors.push("字幕规划必须与脚本段落一一对应");
  }
  return errors;
};

export const captionPlanMismatchIds = (options: {
  script: Script;
  captionPlan: CaptionPlan;
  timeline: Timeline;
  generatedCaptions: readonly GeneratedCaptionArtifact[];
  maximumLineCharacters: number;
  microCueThresholdSeconds: number;
}): string[] => {
  const {
    script,
    captionPlan,
    timeline,
    generatedCaptions,
    maximumLineCharacters,
    microCueThresholdSeconds,
  } = options;
  const plannedBySegment = new Map(
    captionPlan.segments.map((segment) => [segment.segmentId, segment.cues]),
  );
  const timelineBySegment = new Map(timeline.scenes.map((scene) => [scene.id, scene]));
  const actualByScene = groupCaptionTextsByScene(generatedCaptions);
  const mismatches: string[] = [];

  for (const segment of script.segments) {
    const plannedCues = plannedBySegment.get(segment.id);
    const timelineScene = timelineBySegment.get(segment.id);
    if (!plannedCues || !timelineScene) {
      mismatches.push(segment.id);
      continue;
    }
    const expected = fitCaptionPartsToDuration(
      captionPartsFromPlan(segment.narration, plannedCues, maximumLineCharacters),
      timelineScene.audioDurationSeconds,
      microCueThresholdSeconds,
      maximumLineCharacters,
    ).map((part) => part.text);
    if (!captionTextsEquivalent(actualByScene.get(segment.id) ?? [], expected)) {
      mismatches.push(segment.id);
    }
  }

  return mismatches;
};
