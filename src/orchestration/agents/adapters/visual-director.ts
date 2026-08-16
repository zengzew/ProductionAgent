import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  selectVisualSlotForSegment,
  type VisualSelectionConfig,
  type VisualSlotOutcome,
} from "../../../media/select";
import type {MediaEventSink} from "../../../media/events";
import type {ContentArtifactProducer, ContentNodeContext} from "../../graph/content-subgraph";

export type VisualSlotDirectorOptions = {
  /** Repository root used to read media artifacts and persist visual slots. */
  repoRoot: string;
  /** When provided, the director only runs for this episode. */
  episodeId?: string;
  config?: VisualSelectionConfig;
  eventSink?: MediaEventSink;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

const segmentIdSchema = z.string().regex(/^seg-[a-z0-9-]+$/u);

const scriptSegments = (
  repoRoot: string,
  episodeId: string,
):
  | Array<{
      segmentId: string;
      claimIds: string[];
      narration: string;
      visualIntent: string;
      durationTargetMs: number | null;
    }>
  | null => {
  const scriptPath = path.resolve(repoRoot, `content/${episodeId}/story/script.json`);
  if (!fs.existsSync(scriptPath)) return null;
  const parsed = z
    .object({
      segments: z
        .array(
          z.object({
            id: segmentIdSchema,
            claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).min(1),
            narration: z.string().min(1),
            visualIntent: z.string().min(1),
            targetSeconds: z.number().positive().optional(),
          }),
        )
        .min(1),
    })
    .parse(JSON.parse(fs.readFileSync(scriptPath, "utf8")) as unknown);
  return parsed.segments.map((segment) => ({
    segmentId: segment.id,
    claimIds: [...new Set(segment.claimIds)].sort(),
    narration: segment.narration,
    visualIntent: segment.visualIntent,
    durationTargetMs: segment.targetSeconds ? Math.round(segment.targetSeconds * 1000) : null,
  }));
};

/**
 * WP-M5.07 Visual Director node for the foundation content loop.
 *
 * Real-media-first, need-driven only: this node never names a clip id and
 * never bypasses retrieve/verify. It proposes ONLY the visual need of each
 * final-script segment and delegates the concrete media choice to
 * `selectVisualSlotForSegment`, which restricts itself to verified real media
 * from the current retrieval result (fail-closed on rights/tamper/cross-
 * episode) and falls back deterministically (official screenshot →
 * data/evidence card → programmatic visual) when no real media is usable.
 *
 * One formal `visual-slot-v1` artifact is persisted and registered per
 * segment; the returned revisions carry only the hash-bound ArtifactRefs, so
 * LangGraph state stays reference-only. When no final script exists yet, the
 * node produces nothing (the visual need is not materialized).
 */
export const createVisualSlotDirector = (
  options: VisualSlotDirectorOptions,
): ContentArtifactProducer => {
  const repoRoot = path.resolve(options.repoRoot);
  return async (context: ContentNodeContext) => {
    if (options.episodeId !== undefined && options.episodeId !== context.episodeId) {
      return [];
    }
    const episodeId = context.episodeId;
    const segments = scriptSegments(repoRoot, episodeId);
    if (!segments) return [];
    const outcomes: VisualSlotOutcome[] = [];
    for (const segment of segments) {
      outcomes.push(
        await selectVisualSlotForSegment({
          repoRoot,
          episodeId,
          segment: {
            segmentId: segment.segmentId,
            claimIds: segment.claimIds,
            narration: segment.narration,
            visualIntent: segment.visualIntent,
            durationTargetMs: segment.durationTargetMs,
          },
          config: options.config,
          eventSink: options.eventSink,
          runId: options.runId ?? context.runId,
          traceId: options.traceId ?? context.runId,
          now: options.now,
        }),
      );
    }
    return outcomes.map((outcome) => ({ref: outcome.artifactRef}));
  };
};
