# WP-M5-08 — Real Media Remotion Editing

- Status: implemented
- Parent: `docs/m5-real-media-plan.md`
- Code: `src/media/render.ts` (formal `media-shot-v1` + `media-render-plan-v1`,
  render gate, cache keys, render-proxy materialization, lineage resolution),
  `src/media/remotion.tsx` (generic real-media renderer), `src/compositions/MediaMixEpisode.tsx`
  (generic mix composition, `MediaMixVertical`), `src/media/paths.ts` (render
  paths), `src/media/events.ts` (render events + `shotId`/`renderProxyRef`
  fields), `src/lib/fine-grained-cache.ts` (`media-render` kind),
  `scripts/build-media-render-plan.ts` (`pnpm media:render-plan`)
- Schemas: `media-shot-v1` (artifact under
  `content/<ep>/media/shots/<segmentId>.json`), `media-render-plan-v1`
  (artifact under `content/<ep>/media/render-plan.json`),
  `media-render-proxy-v1` (bytes artifact under `content/<ep>/media/render/`),
  `media-render-config-v1`
- Cache: M4 fine-grained cache (`media-render` kind; key binds clip SHA +
  trim + crop/transform + timeline/render config)
- Tests: `tests/media-remotion.test.ts` (12 PASS)
- Observability: `media.render.started/completed/failed`, `media.rendered`,
  `media.render.cache.hit/miss` in `media-events.jsonl`

## Scope

Remotion finally consumes the WP-M5.07 selected real media: verified
video/audio clips are trimmed, reframed to 9:16, cropped, zoom/pan'd, PiP'd,
frozen, captioned, and mixed with narration inside ONE generic renderer — no
per-episode React scenes are written for real media. The same visual plan
mixes real video, real audio, official screenshots, data cards, and
programmatic fallbacks. `ORCHESTRATOR=manual` behavior, M1–M4, M5.01–M5.07,
Goal 3.2/Golden Set/prompts/validators are untouched; real-media-first never
means real-media-at-all-costs.

## Timeline / visual layer contract

One hash-bound **`media-shot-v1`** per final-script segment is the render-time
projection of the M5.07 slot:

| Field                                                                  | Type                                                                                       | Notes                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `schemaVersion`                                                        | literal                                                                                    | `media-shot-v1`                                                                                    |
| `shotId`                                                               | `<ep>:media-shot:<segmentId>`                                                              | episode-scoped identity                                                                            |
| `episodeId`/`segmentId`                                                |                                                                                            | must match the timeline scene everywhere                                                           |
| `sceneIndex`/`startFrame`/`durationFrames`/`startSeconds`/`endSeconds` |                                                                                            | timeline binding                                                                                   |
| `visualType`                                                           | `real-media` \| `official-screenshot` \| `data-evidence-card` \| `programmatic-visual`     | slot type or deterministic fallback                                                                |
| `selectedMediaClipRef` / `verificationRef`                             | MediaClipRef / ArtifactRef \| null                                                         | chosen verified clip (real-media only)                                                             |
| `fallbackType` / `fallbackReason`                                      | `REAL_MEDIA_*` \| null / string \| null                                                    | structured fallback                                                                                |
| `trim`                                                                 | `{startMs, endMs}` \| null                                                                 | must lie inside the VLM-recommended range                                                          |
| `transform`                                                            | `{reframe, crop, scale, position, zoomPan, pip, freezeFrameMs}`                            | 9:16 reframe (`cover`/`contain`/`blur-fill`), normalized crop, zoom-pan keyframes, PiP box, freeze |
| `overlays`                                                             | `{sourceLabel, badge, captionsEnabled}`                                                    | source label + evidence badge                                                                      |
| `audio`                                                                | `{originalAudioGain, narrationGain, ducking, fadeInMs, fadeOutMs}`                         | gain rails, simple ducking, fades                                                                  |
| `fade` / `crossfadeMs`                                                 | `{inMs, outMs}` / int                                                                      | simple video fade/crossfade                                                                        |
| `lineage`                                                              | `media-shot-lineage` \| null                                                               | clip → verification → ClipIndex → MediaAsset → source timestamps                                   |
| `renderProxyRef` / `staticFilePath` / `renderProxyMediaType`           | \| null                                                                                    | hash-bound trimmed cut + public `staticFile` path                                                  |
| `fallbackImagePath`                                                    | string \| null                                                                             | official-screenshot capture asset path                                                             |
| `gate`                                                                 | `{slotValid, clipVerified, rightsApproved, hashesValid, episodeIsolated, timestampsValid}` | deterministic snapshot                                                                             |
| `config`                                                               | `media-render-config-v1`                                                                   | canvas 1080×1920, fps, timelineSha256, layoutVariant, extractor                                    |
| `artifactRef` / `createdAt`                                            |                                                                                            | hash-bound artifact                                                                                |

The episode-level **`media-render-plan-v1`** binds the exact production
timeline bytes (`timelineSha256`) and embeds every shot in timeline order; it
is the file the generic composition consumes. Both artifacts are registered in
the episode artifact registry with full `reads` lineage.

## Render gate (fail-closed, re-run before every render)

`assertMediaShotRenderable` re-verifies, at render time and without any cache:

1. the `media-shot-v1` artifact bytes are registered and hash-valid;
2. the M5.07 slot is registered, hash-valid, still `real-media`, and names the
   same clip + verification ref as the shot;
3. `assertMediaClipVerified` PASS — verdict `pass`, current source
   admission/rights re-read, retrieval/ClipIndex/media bytes hash-valid,
   episode isolated;
4. timestamps legal — trim inside the VLM-recommended range, inside the media
   duration, end > start;
5. lineage consistent — clip → verification → ClipIndex (still current) →
   original MediaAsset (bytes unchanged) → source timestamps;
6. render proxy registered + hash-valid, and its public `staticFile` copy
   binds the same bytes;
7. audio rails normalized (sum ≤ 1) and fallback shots carry no media.

Stale/tampered/rights-blocked/cross-episode media throws `MEDIA_RENDER_*`
(e.g. `MEDIA_RENDER_CLIP_GATE_FAILED`, `MEDIA_RENDER_TRIM_OUT_OF_BOUNDS`,
`MEDIA_RENDER_SHOT_TAMPERED`, `MEDIA_RENDER_STATIC_COPY_TAMPERED`,
`MEDIA_RENDER_SLOT_MISSING`) — it never silently falls back. The registry
binding is checked against the EXTERNAL ref (hash of the persisted file
bytes), matching the M5.06/M5.07 convention.

## Remotion integration (generic renderer)

`src/media/remotion.tsx` + `src/compositions/MediaMixEpisode.tsx`
(`MediaMixVertical`) render ANY episode from its render plan:

- **real video** — `@remotion/media` `Video` (normalized render proxy
  preferred) with 9:16 reframe (`cover`/`contain`/`blur-fill`), normalized
  crop, extra scale/position, zoom-pan keyframes, PiP box over a blurred
  backdrop, `Freeze` frame, and simple fade/crossfade;
- **real audio** — verified audio plays through the same mix with a generic
  audio-card visual;
- **official screenshots** — captured page stills with reframe/zoom;
- **data-evidence card / programmatic fallback** — deterministic generic
  visuals (no per-episode scenes);
- overlays (source label + badge) and the timed caption layer.

Lineage never lives in the renderer: the plan embeds the hash-bound chain and
`resolveMediaShotLineage` walks it (shot → clip → verification → ClipIndex →
original MediaAsset → source + timestamp). The plan/timeline/captions are
copied to `public/episodes/<ep>/media/` and loaded by the composition at
metadata time via `staticFile`.

## Audio contract

Deterministic, no automatic mixing system:

- `narrationGain` (TTS rail) and `originalAudioGain` (clip rail) ∈ [0,1];
  `normalizeMediaShotGains` scales both proportionally so their sum never
  exceeds 1 — the mix cannot clip at unity;
- simple ducking: while narration is active the original rail is reduced by
  `reductionDb` with linear `attackMs`/`releaseMs` ramps
  (`mediaShotDuckingGainAtFrame`);
- audio fade in/out and video fade/crossfade are linear ramps
  (`mediaShotAudioGainsAtFrame`, `mediaShotVideoOpacityAtFrame`);
- the video element is muted; its audio track is mixed through a separate
  `Audio` element with the ducked gain so both rails stay independently
  controllable.

Defaults (documented, overridable per shot): narration 1.0, original 0.35
(normalized to ≈0.741/0.259), ducking 10 dB, attack 80 ms, release 240 ms,
video fade 200 ms in/out, crossfade 0 ms. Fallback shots: narration 1.0,
original 0 (schema-enforced).

## Cache / observability

- `media-render` M4 fine-grained cache stores the render proxy bytes; the key
  binds clip SHA + trim + crop/transform + timeline/render config + extractor
  identity + dependency-file hashes — a stale entry can never be reused,
  identical input always yields the identical key.
- A hit republishes the proxy artifact + public copy without re-encoding
  (`media.render.cache.hit`); a miss cuts with ffmpeg
  (`media.render.cache.miss`).
- `media.render.started/completed/failed`, `media.rendered` recorded in
  `media-events.jsonl` with `shotId`, `selectedType`, `cacheKey`,
  `renderProxyRef` (additive event-schema fields only).

## Error codes

`MEDIA_RENDER_SHOT_MISSING/ARTIFACT_MISMATCH/TAMPERED/NOT_REGISTERED/INCOMPLETE`,
`MEDIA_RENDER_SLOT_MISSING/NOT_REAL_MEDIA/CLIP_MISMATCH/VERIFICATION_MISMATCH/NOT_REGISTERED/TAMPERED`,
`MEDIA_RENDER_CLIP_GATE_FAILED`, `MEDIA_RENDER_TRIM_OUT_OF_BOUNDS`,
`MEDIA_RENDER_ASSET_UNKNOWN`, `MEDIA_RENDER_LINEAGE_MISMATCH`,
`MEDIA_RENDER_INDEX_STALE/NOT_REGISTERED/MISSING`,
`MEDIA_RENDER_PROXY_MISSING/NOT_REGISTERED/TAMPERED`,
`MEDIA_RENDER_STATIC_PATH_INVALID/STATIC_COPY_MISSING/STATIC_COPY_TAMPERED`,
`MEDIA_RENDER_FALLBACK_WITH_MEDIA/FALLBACK_REASON_MISSING/FALLBACK_AUDIO_INVALID/FALLBACK_IMAGE_MISSING`,
`MEDIA_RENDER_AUDIO_OVER_GAIN`, `MEDIA_RENDER_SCENE_MISSING`,
`MEDIA_RENDER_TIMELINE_MISSING/STALE`, `MEDIA_RENDER_PLAN_MISSING/NOT_REGISTERED/TAMPERED/EPISODE_MISMATCH`,
`MEDIA_RENDER_FREEZE_OUT_OF_BOUNDS`, `MEDIA_RENDER_CAPTIONS_MISSING`,
`MEDIA_RENDER_PROXY_EXTRACTION_FAILED`, `MEDIA_RENDER_PROXY_MEDIA_TYPE_UNSUPPORTED`,
`MEDIA_RENDER_SOURCE_UNKNOWN`, `MEDIA_RENDER_INDEX_MISSING`.

## Compatibility boundary

M5.01–M5.07 contracts unchanged: `mediaEventTypes` gained
`media.render.started/completed/failed`, `media.rendered`,
`media.render.cache.hit/miss`; `mediaEventSchema` gained optional
`shotId`/`renderProxyRef` fields (additive only); `CacheKind` gained
`media-render`. No VLM/ASR changes, no delivery gate, no publishing.
`ORCHESTRATOR=manual` behavior is untouched. The generic composition is
registered in `src/Root.tsx` but no episode render contract points at it; the
existing per-episode compositions and renders are unchanged.

## Acceptance checklist

- [x] `pnpm exec vitest run tests/media-remotion.test.ts` (12 PASS)
- [x] `pnpm exec vitest run tests/media-contract.test.ts tests/media-discovery.test.ts tests/media-ingest.test.ts tests/media-index.test.ts tests/media-retrieve.test.ts tests/media-verify.test.ts tests/media-selection.test.ts tests/media-remotion.test.ts` (media group regression)
- [x] `pnpm exec vitest run tests/orchestration --maxWorkers=1`
- [x] `pnpm typecheck`
- [x] `pnpm exec eslint <new/modified files> --max-warnings=0`
- [x] Full `pnpm test` regression
