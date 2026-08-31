import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {captionPlanMismatchIds} from "../../scripts/lib/caption-artifacts";
import {
  groupCaptionTextsByScene,
  readCaptionPlan,
  readGeneratedCaptions,
  readScript,
  readTimeline,
} from "../../scripts/lib/validation";
import {findCaptionSemanticBoundaryIssues} from "../lib/delivery/captions";
import {measureCaptionDelivery, parseSrt} from "../lib/delivery/delivery";
import {
  assertTimelineMatchesProductionContract,
  productionContract,
} from "../lib/episode/production-contract";
import {generatedCaptionsPath} from "../lib/episode/render-contract";
import {assertArtifactRefBytes} from "./artifact-registry";
import {hashArtifactInputs} from "./observability";
import type {ArtifactRef} from "./schemas/artifact";

export const PRE_RENDER_GATE_SCHEMA_VERSION = "pre-render-gate-v1" as const;

export const preRenderGateSchema = z
  .object({
    schemaVersion: z.literal(PRE_RENDER_GATE_SCHEMA_VERSION),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    inputSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    checks: z
      .object({
        timelineMatchesScript: z.boolean(),
        hookWithinTarget: z.boolean(),
        firstSceneWithinTarget: z.boolean(),
        captionPlanMatches: z.boolean(),
        captionBoundariesValid: z.boolean(),
        captionDurationsValid: z.boolean(),
        captionOverlapsAbsent: z.boolean(),
        unexpectedGapsAbsent: z.boolean(),
      })
      .strict(),
    blockers: z.array(z.string()),
    verdict: z.enum(["PASS", "REJECT"]),
    returnTo: z.enum(["none", "timeline", "captions", "content"]),
    checkedAt: z.string().datetime({offset: true}),
  })
  .strict();

export type PreRenderGate = z.infer<typeof preRenderGateSchema>;

export type PreRenderGateInput = {
  repoRoot: string;
  episodeId: string;
  inputArtifacts: readonly ArtifactRef[];
  now?: () => string;
};

const file = (repoRoot: string, relativePath: string): string =>
  path.resolve(repoRoot, relativePath);

const bounded = (value: string): string => {
  if (Buffer.byteLength(value, "utf8") <= 500) return value;
  return `${value.slice(0, 497)}...`;
};

/**
 * Runs the deterministic gates immediately before the first render. It reads
 * canonical files and returns only a bounded, reference-free decision body;
 * callers persist that body as an ArtifactRef before putting it in state.
 */
export const runPreRenderGate = (input: PreRenderGateInput): PreRenderGate => {
  const now = input.now ?? (() => new Date().toISOString());
  for (const artifact of input.inputArtifacts) {
    assertArtifactRefBytes(input.repoRoot, artifact, {boundary: "pre-render"});
  }
  const episodeRoot = `content/${input.episodeId}`;
  const scriptPath = file(input.repoRoot, `${episodeRoot}/story/script.json`);
  const captionPlanPath = file(input.repoRoot, `${episodeRoot}/story/caption-plan.json`);
  const generatedCaptionsFile = file(input.repoRoot, generatedCaptionsPath(input.episodeId));
  const timelinePath = file(input.repoRoot, `${episodeRoot}/production/timeline.json`);
  const subtitlesPath = file(input.repoRoot, `output/${input.episodeId}/subtitles_zh.srt`);
  const blockers: string[] = [];
  const add = (message: string): void => {
    blockers.push(bounded(message));
  };

  const checks = {
    timelineMatchesScript: false,
    hookWithinTarget: false,
    firstSceneWithinTarget: false,
    captionPlanMatches: false,
    captionBoundariesValid: false,
    captionDurationsValid: false,
    captionOverlapsAbsent: false,
    unexpectedGapsAbsent: false,
  };

  const required = [
    scriptPath,
    captionPlanPath,
    generatedCaptionsFile,
    timelinePath,
    subtitlesPath,
  ];
  for (const requiredPath of required) {
    if (!fs.existsSync(requiredPath))
      add(`PRE_RENDER_REQUIRED_ARTIFACT_MISSING:${path.relative(input.repoRoot, requiredPath)}`);
  }
  if (blockers.length > 0) {
    return preRenderGateSchema.parse({
      schemaVersion: PRE_RENDER_GATE_SCHEMA_VERSION,
      episodeId: input.episodeId,
      inputSetHash: hashArtifactInputs(input.inputArtifacts),
      checks,
      blockers,
      verdict: "REJECT",
      returnTo: "content",
      checkedAt: now(),
    });
  }

  let script: ReturnType<typeof readScript>;
  let captionPlan: ReturnType<typeof readCaptionPlan>;
  let generatedCaptions: ReturnType<typeof readGeneratedCaptions>;
  let timeline: ReturnType<typeof readTimeline>;
  let cues: ReturnType<typeof parseSrt>;
  try {
    script = readScript(scriptPath);
    captionPlan = readCaptionPlan(captionPlanPath);
    generatedCaptions = readGeneratedCaptions(generatedCaptionsFile);
    timeline = readTimeline(timelinePath);
    cues = parseSrt(fs.readFileSync(subtitlesPath, "utf8"));
  } catch (error) {
    add(`PRE_RENDER_PARSE_FAILED:${error instanceof Error ? error.message : String(error)}`);
    return preRenderGateSchema.parse({
      schemaVersion: PRE_RENDER_GATE_SCHEMA_VERSION,
      episodeId: input.episodeId,
      inputSetHash: hashArtifactInputs(input.inputArtifacts),
      checks,
      blockers,
      verdict: "REJECT",
      returnTo: "content",
      checkedAt: now(),
    });
  }

  try {
    if (timeline.episodeId !== input.episodeId) add("PRE_RENDER_TIMELINE_EPISODE_MISMATCH");
    assertTimelineMatchesProductionContract(timeline);
  } catch (error) {
    add(
      `PRE_RENDER_TIMELINE_CONTRACT_FAILED:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  checks.timelineMatchesScript =
    timeline.scenes.length === script.segments.length &&
    timeline.scenes.every(
      (scene, index) =>
        scene.id === script.segments[index]?.id &&
        scene.narration === script.segments[index]?.narration,
    );
  if (!checks.timelineMatchesScript) add("PRE_RENDER_TIMELINE_NARRATION_MISMATCH");

  const hookScenes = timeline.scenes.filter((scene) => scene.section === "hook");
  const hookEnd = hookScenes.at(-1)?.endSeconds ?? Number.POSITIVE_INFINITY;
  const hookHardMaximum =
    productionContract.hook.targetSeconds + productionContract.hook.timingToleranceSeconds;
  checks.hookWithinTarget = hookEnd <= hookHardMaximum;
  if (!checks.hookWithinTarget) {
    add(
      `PRE_RENDER_HOOK_EXCEEDS_TARGET:${hookEnd.toFixed(3)}>${hookHardMaximum}`,
    );
  }
  const firstSceneEnd = timeline.scenes[0]?.endSeconds ?? Number.POSITIVE_INFINITY;
  const firstSceneHardMaximum =
    productionContract.hook.firstSegmentMaximumSeconds +
    productionContract.hook.firstSegmentTimingToleranceSeconds;
  checks.firstSceneWithinTarget =
    firstSceneEnd <= firstSceneHardMaximum;
  if (!checks.firstSceneWithinTarget) {
    add(
      `PRE_RENDER_FIRST_SCENE_EXCEEDS_TARGET:${firstSceneEnd.toFixed(3)}>${firstSceneHardMaximum}`,
    );
  }

  const mismatchIds = captionPlanMismatchIds({
    script,
    captionPlan,
    timeline,
    generatedCaptions,
    maximumLineCharacters: productionContract.captions.maximumLineCharacters,
    microCueThresholdSeconds: productionContract.captions.microCueThresholdSeconds,
  });
  checks.captionPlanMatches = mismatchIds.length === 0;
  if (!checks.captionPlanMatches) add(`PRE_RENDER_CAPTION_PLAN_MISMATCH:${mismatchIds.join(",")}`);

  const captionsByScene = groupCaptionTextsByScene(generatedCaptions);
  let semanticCount = 0;
  for (const segment of script.segments) {
    semanticCount += findCaptionSemanticBoundaryIssues(
      segment.narration,
      captionsByScene.get(segment.id) ?? [],
    ).length;
  }
  checks.captionBoundariesValid = semanticCount === 0;
  if (!checks.captionBoundariesValid) add(`PRE_RENDER_CAPTION_SEMANTIC_BOUNDARY:${semanticCount}`);

  try {
    const measured = measureCaptionDelivery(
      cues,
      productionContract.captions.microCueThresholdSeconds,
    );
    checks.captionDurationsValid =
      measured.microCueRatio <= productionContract.captions.microCueRatioLimit;
    if (!checks.captionDurationsValid) add("PRE_RENDER_MICRO_CUE_RATIO_EXCEEDED");
  } catch (error) {
    add(
      `PRE_RENDER_CAPTION_DURATION_FAILED:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  checks.captionOverlapsAbsent = cues.every(
    (cue, index) => index === 0 || cue.startSeconds >= (cues[index - 1]?.endSeconds ?? 0),
  );
  if (!checks.captionOverlapsAbsent) add("PRE_RENDER_CAPTION_OVERLAP");
  const maxExpectedGapSeconds = 1;
  checks.unexpectedGapsAbsent = cues.every(
    (cue, index) =>
      index === 0 || cue.startSeconds - (cues[index - 1]?.endSeconds ?? 0) <= maxExpectedGapSeconds,
  );
  if (!checks.unexpectedGapsAbsent) add("PRE_RENDER_UNEXPECTED_CAPTION_GAP");

  const returnTo = blockers.some((blocker) => blocker.includes("CAPTION"))
    ? "captions"
    : "timeline";
  return preRenderGateSchema.parse({
    schemaVersion: PRE_RENDER_GATE_SCHEMA_VERSION,
    episodeId: input.episodeId,
    inputSetHash: hashArtifactInputs(input.inputArtifacts),
    checks,
    blockers,
    verdict: blockers.length === 0 ? "PASS" : "REJECT",
    returnTo: blockers.length === 0 ? "none" : returnTo,
    checkedAt: now(),
  });
};
