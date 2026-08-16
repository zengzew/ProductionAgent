# WP-M5-04 — Media Understanding + Clip Index

- Status: implemented
- Parent: `docs/m5-real-media-plan.md`
- Code: `src/media/{transcript,scenes,keyframes,semantic,clip-index,understanding}.ts`,
  `src/media/events.ts`, `src/media/paths.ts`, `src/lib/fine-grained-cache.ts`
  (four new cache kinds)
- Schemas: `media-transcript-v1`, `media-scenes-v1`, `media-keyframe-v1`,
  `media-clip-index-v1` (all in the modules above)
- Cache: M4 fine-grained cache (`media-transcript`, `media-scenes`,
  `media-keyframes`, `media-clip-index` kinds)
- Tests: `tests/media-index.test.ts` (22 PASS)
- Observability: `content/<ep>/media/observability/media-events.jsonl`

## Scope

M5.04 turns one **hash-valid, rights-approved, episode-scoped original
MediaAsset** (video or audio) into deterministic, cacheable, hash-bound derived
artifacts under `content/<episode>/media/indexes/<slug>/`:

```text
content/<ep>/media/indexes/<slug>/
  transcript.json      (media-transcript-v1)
  scenes.json          (media-scenes-v1; video only)
  keyframes/           (keyframe-<scene>-<tsMs>.jpg; video only)
  clip-index.json      (media-clip-index-v1)
  status.json          (internal ledger: ArtifactRef/status only, never bodies)
```

Every product is a formal `ArtifactRef` candidate in the episode artifact
registry with full lineage back to the original MediaAsset. Images are not
deeply understood (`MEDIA_INDEX_NOT_APPLICABLE`); their indexable basic
metadata is the MediaAsset itself.

## Input gate (fail-closed, runs before any cache/reuse)

`indexMediaAsset({repoRoot, episodeId, mediaId})` reads the asset from the
source manifest and refuses everything that is not provably current:

| State                                                                    | Result                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| mediaId of another episode                                               | `MEDIA_INDEX_MEDIA_ID_EPISODE_MISMATCH`   |
| asset not in this episode manifest                                       | `MEDIA_INDEX_ASSET_UNKNOWN` / `..._STALE` |
| source not formally admitted (`admissionDecisionRef` missing)            | `MEDIA_INDEX_SOURCE_NOT_ADMITTED`         |
| rights not approved (`rightsDecisionRef` missing)                        | `MEDIA_INDEX_RIGHTS_NOT_APPROVED`         |
| persisted admission/rights decision bytes tampered                       | `HUMAN_DECISION_ARTIFACT_HASH_MISMATCH`   |
| asset `rightsStatus` no longer approved                                  | `MEDIA_INDEX_ASSET_RIGHTS_NOT_APPROVED`   |
| original bytes no longer match their ArtifactRef SHA-256                 | `MEDIA_INDEX_ASSET_TAMPERED`              |
| original not registered in the artifact registry (stale/superseded)      | `MEDIA_INDEX_ASSET_NOT_REGISTERED`        |
| proxy exists but its bytes are tampered / linkage no longer matches      | `MEDIA_INDEX_ASSET_TAMPERED` / `_PROXY_STALE` |
| image media                                                              | `MEDIA_INDEX_NOT_APPLICABLE`              |

Analysis prefers the **normalized proxy** (`usedProxy`), but every artifact's
`sourceMediaRef` is the original MediaAsset ArtifactRef — the lineage root.
A tampered proxy fails closed (no silent fallback to the original).

## Transcript contract (`src/media/transcript.ts`)

Provider-neutral ASR interface (`TranscriptProvider.transcribe(ctx)`), no
network in tests:

- `createStubTranscriptProvider({segments})` — deterministic test/demo provider.
- `createUnavailableTranscriptProvider({reason})` — the default when no
  provider is configured.

`media-transcript-v1` fields: `episodeId`, `mediaId`, `sourceMediaRef`
(original), `analysisSourceRef` (proxy preferred), `provider`, `model`,
`toolVersion`, `asrVersion`, `availability` (`available` | `unavailable`),
`unavailableReason`, `durationMs`, `segments[]`.

Each segment: `index`, `text`, `startMs`, `endMs`, `speaker` (default
`unknown`), `confidence` (nullable). Validation is fail-closed
(`MEDIA_TRANSCRIPT_INVALID`): segments must be ordered, non-overlapping,
`0 <= startMs < endMs <= durationMs`, and **text is stored untouched** — ASR
output is never rewritten or reordered. An empty/silent transcript is valid
when the provider says `available`; a missing provider is recorded explicitly
as `unavailable` — no transcript is ever fabricated.

## Scene contract (`src/media/scenes.ts`)

Deterministic, content-independent detector (the most deterministic tool
possible for M5.04 — no model, no network): boundaries snap to multiples of
`targetSceneMs`, trailing scenes shorter than `minSceneMs` merge into their
predecessor, nothing exceeds `maxSceneMs`. Defaults: 4s / 0.8s / 6s.

`media-scenes-v1` binds `sourceSha256` (media SHA) + `detector` +
`detectorVersion`; `scenes[]` are sequential non-overlapping
`{sceneIndex, startMs, endMs}` covering `[0, durationMs)`. A missing/invalid
duration or config throws (`MEDIA_SCENES_NO_DURATION`, `..._TOO_SHORT`) —
scene failure is never faked. Audio has no scenes stage (recorded
`not-applicable`).

## Keyframe contract (`src/media/keyframes.ts`)

One representative keyframe per scene at the deterministic scene midpoint
(`keyframe-<sceneIndex>-<timestampMs>.jpg`). `KeyframeExtractor` is injectable:

- `createFfmpegKeyframeExtractor()` — default; pulls a real JPEG frame from
  the analysis source with ffmpeg; any failure is `MEDIA_INDEX_KEYFRAME_EXTRACTION_FAILED`.
- `createStubKeyframeExtractor()` — deterministic bytes for tests.

Keyframes are derived `media-keyframe-v1` ArtifactRefs (SHA-256 over the
bytes), registered with dependencies on the scenes artifact + original +
analysis source + decisions. The original video is never modified, and
repeated runs with the same input + tool produce identical bytes.

## ClipIndex schema (`src/media/clip-index.ts`)

`media-clip-index-v1`:

- `clipId` — deterministic, episode-scoped `episode-<id>:media-clip:<24-hex>`
  over `{episodeId, mediaId, startMs, endMs, clipWindowConfig, indexVersion}`.
  **Never time/run/counter-derived.**
- `episodeId`, `mediaRef` (original), `analysisSourceRef`, `sourceSha256`,
  `indexVersion`
- per-stage availability: `transcriptAvailability`, `scenesAvailability`,
  `keyframesAvailability`, `semanticAvailability`
- tool identity: `asrProvider/asrModel`, `sceneDetector(+Version)`,
  `keyframeTool(+Version)`, `semanticAdapter(+Version)`
- `items[]` — `ClipIndexItem`: `clipId`, `episodeId`, `mediaRef`, `startMs`,
  `endMs`, `transcriptRefs`, `sceneRefs`, `keyframeRefs`, `textSummary`,
  `keywords`, `entities`, `speaker`, `observedText`, `semanticTags`,
  `embeddingRef` (optional — no real embeddings in M5.04), `sourceSha256`,
  `indexVersion`

Clip windows are deterministic: **video → one window per scene**; **audio →
greedy grouping of timestamped transcript segments under `maxWindowMs`**
(optional `minWindowMs` trailing merge). `observedText` concatenates the
transcript text observed inside the window; `speaker` is the unique speaker of
the window's segments (or the semantic adapter's). Semantic metadata comes
from the injectable `SemanticUnderstandingAdapter`
(`createDeterministicSemanticAdapter()` offline default) and is
schema-validated — malformed model output is
`MEDIA_INDEX_SEMANTIC_METADATA_INVALID`, and metadata can only describe
content (never grant rights or claim truth).

## Cache / invalidation rules

Per-stage M4 fine-grained cache entries, each keyed deterministically:

| Stage           | Cache kind           | Key binds                                                     |
| --------------- | -------------------- | ------------------------------------------------------------- |
| transcript      | `media-transcript`   | media SHA + analysis-source SHA + ASR provider/model/version + dependency hashes |
| scenes          | `media-scenes`       | media SHA + analysis-source SHA + detector version + scene config + dep hashes |
| keyframes       | `media-keyframes`    | stage key (above) + extractor version + keyframe config + scenes key; per-keyframe + scene index + timestamp |
| clip index      | `media-clip-index`   | media SHA + transcript key + scenes key + keyframes key + semantic adapter version + clip window config + index schema version + dep hashes |

Consequences (all covered by tests):

- identical inputs → cache hit; ASR/scene detection/keyframe extraction are
  **not re-run**;
- a single stage change (ASR version, detector version, keyframe config, clip
  window config, semantic adapter, schema version) invalidates only the
  **corresponding downstream** (e.g. ASR change → transcript + index rebuild,
  scenes/keyframes stay cached);
- a changed media SHA changes every key (different media → different index);
- corrupt cache entries (payload hash mismatch, bad metadata, malformed
  entry) degrade to miss + rebuild, and the rebuilt artifact is byte-identical;
- cache hits never bypass the input gate — rights, lineage, and original
  bytes are re-validated first;
- crash/resume without a cache reuses hash-valid stages through the
  `status.json` ledger (ArtifactRef + cache key only) plus re-validation of
  the artifact bytes.

## Persistence / lineage

All products are written atomically, hash-bound via `buildArtifactRef`, and
registered as artifact-index candidates with `reads` dependencies:

```text
clip-index.json → transcript.json / scenes.json / keyframes/*.jpg → original MediaAsset
                                                                    → proxy (analysis source)
                                                                    → admission/rights HumanDecisions
```

`registerCandidate` dedupes by (artifactId, SHA-256), so repeated runs never
duplicate registry records. LangGraph/orchestration layers hold only
ArtifactRefs and status — never transcript or index bodies. Readers:
`readMediaTranscript`, `readMediaScenes`, `readMediaClipIndex`,
`readMediaUnderstandingStatus`, `listMediaKeyframes`.

## Observability

`media-events.jsonl` records `media.transcript.started/completed/failed`,
`media.scenes.started/completed/failed`, `media.keyframes.started/completed/failed`,
`media.index.started/completed/failed`, and `media.understanding.cache.hit/miss`.
Events carry only refs, hashes, sizes, stage availability (`available` /
`unavailable` / `not-applicable`), and redacted reasons — never credentials or
payload bodies. Reused/cache-hit stages record a `reason` (`reused`,
`cache-hit`, `produced`). The cache store also writes M4 `cache-event-v1`
events to `cache-events.jsonl` when a cache is configured.

## Error codes

`MEDIA_INDEX_MEDIA_ID_EPISODE_MISMATCH/INVALID`, `MEDIA_INDEX_ASSET_UNKNOWN/STALE`,
`MEDIA_INDEX_SOURCE_UNKNOWN/NOT_ADMITTED`, `MEDIA_INDEX_RIGHTS_NOT_APPROVED`,
`MEDIA_INDEX_ASSET_RIGHTS_NOT_APPROVED`, `MEDIA_INDEX_ASSET_NOT_REGISTERED`,
`MEDIA_INDEX_ASSET_TAMPERED`, `MEDIA_INDEX_PROXY_STALE`,
`MEDIA_INDEX_NOT_APPLICABLE`, `MEDIA_TRANSCRIPT_INVALID`,
`MEDIA_SCENES_NO_DURATION/TOO_SHORT/EMPTY`,
`MEDIA_INDEX_KEYFRAME_EXTRACTION_FAILED`,
`MEDIA_INDEX_SEMANTIC_METADATA_INVALID`, `MEDIA_TRANSCRIPT_MISSING`,
`MEDIA_SCENES_MISSING`, `MEDIA_CLIP_INDEX_MISSING`.

## Compatibility boundary

M5.01–M5.03 contracts unchanged: `cacheKindSchema` gained four kinds,
`mediaEventSchema` gained optional `availability`, and the media barrel gained
the new modules. No retrieval/ranking, no embeddings provider, no VLM clip
verification, no Visual Director wiring, no Remotion changes, and
`ORCHESTRATOR=manual` behavior is untouched (nothing in this WP is wired into
the graph).

## Acceptance checklist

- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media tests/media-index.test.ts src/lib/fine-grained-cache.ts --max-warnings=0`
- [x] `pnpm exec vitest run tests/media-index.test.ts` (22 PASS)
- [x] `pnpm exec vitest run tests/media-ingest.test.ts tests/media-discovery.test.ts tests/media-contract.test.ts`
- [x] `pnpm exec vitest run tests/orchestration` (193 PASS)
- [x] Full `pnpm test` regression (411 PASS, 59 files)
