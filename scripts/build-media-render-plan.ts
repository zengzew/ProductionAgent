import {episodeId, repoRoot} from "../src/lib/episode/paths";
import {
  assertMediaRenderManifestConsistent,
  buildMediaRenderManifest,
} from "../src/media/projection";
import {
  assertMediaRenderPlanRenderable,
  buildMediaRenderPlanForTimeline,
} from "../src/media/render";
import {installCliErrorHandlers} from "./lib/validation";

/**
 * WP-M5.08 opt-in manual step: builds the hash-bound `media-render-plan-v1`
 * for the current episode (one `media-shot-v1` per timeline scene), materializes
 * render proxies (M4 fine-grained cache), copies the plan/timeline/captions to
 * `public/episodes/<ep>/media/`, and authorizes the plan fail-closed before any
 * Remotion run. `ORCHESTRATOR=manual` stays untouched: this step only adds the
 * real-media projection the generic `MediaMixVertical` composition consumes.
 */

installCliErrorHandlers();

const plan = buildMediaRenderPlanForTimeline({repoRoot, episodeId});
// Re-authorize right after the build — stale/tampered/rights-blocked media
// fails closed before Remotion ever starts.
assertMediaRenderPlanRenderable({repoRoot, episodeId});
const projection = buildMediaRenderManifest({repoRoot, episodeId});
assertMediaRenderManifestConsistent({repoRoot, episodeId});

const realMedia = plan.shots.filter((shot) => shot.visualType === "real-media").length;
const fallback = plan.shots.length - realMedia;
console.log(
  `media render plan complete: ${plan.shots.length} shots ` +
    `(${realMedia} real-media, ${fallback} fallback), ${plan.totalFrames} frames @ ${plan.fps}fps, ` +
    `plan ${plan.artifactRef.sha256.slice(0, 12)}, ` +
    `projection ${projection.artifactRef.sha256.slice(0, 12)}`,
);
