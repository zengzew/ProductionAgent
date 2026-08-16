# WP-M5-07 — Visual Director Real-Media-First Integration

- Status: implemented
- Parent: `docs/m5-real-media-plan.md`
- Code: `src/media/select.ts` (formal `visual-slot-v1`), `src/media/paths.ts`
  (`media/selections/` paths), `src/media/events.ts`
  (`media.selection.started/completed/failed` + `selectedType`/`fallbackType`
  fields), `src/orchestration/agents/adapters/visual-director.ts`
  (`createVisualSlotDirector` content-loop node)
- Schemas: `visual-slot-v1` (artifact under
  `content/<ep>/media/selections/<segmentId>.json`), `visual-selection-config-v1`
- Tests: `tests/media-selection.test.ts` (13 PASS)
- Observability: `media.selection.started/completed/failed` in
  `media-events.jsonl`

## Scope

For every final-script segment, the Visual Director produces ONE formal,
hash-bound `visual-slot-v1` artifact. Selection is **real-media-first but
never real-media-at-all-costs**: the slot picks the best candidate from the
WP-M5.05 retrieval result that also carries a WP-M5.06 `pass` verification and
whose source is still admitted and rights-approved. When no candidate is
usable, the slot records a structured fallback reason plus a deterministic
fallback stage. Retrieval ≠ verification ≠ selection: this WP authorizes the
**slot only** — it grants no rights and authorizes no Remotion rendering
(M5.08 remains unimplemented: no trim/crop/PiP, no real-video render, no audio
mixing).

## Decision rules

Evidence fit dominates in this order:

1. `evidence fit > source trust > rights > verification > visual quality >
   media type` — a clip is selectable only when it survives every check;
2. a high retrieval score is **not** sufficient: reject/uncertain VLM verdicts
   are never selectable;
3. rights revoked → the clip becomes ineligible and, when nothing else
   remains, the segment falls back with `REAL_MEDIA_RIGHTS_BLOCKED` — the clip
   itself is never selected;
4. tampered artifacts (retrieval/verification/media bytes) and cross-episode
   refs are integrity failures: they abort fail-closed (`MEDIA_SELECT_*`),
   they never silently fall back.

## Visual slot (`visual-slot-v1`)

| Field                | Type                                                            | Notes                                            |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `schemaVersion`      | literal                                                         | `visual-slot-v1`                                 |
| `slotId`             | `<episode>:media-visual-slot:<segmentId>`                       | episode-scoped identity                          |
| `episodeId` / `segmentId` |                                                            | final-script segment identity                    |
| `claimIds`           | `claim-<id>[]` (sorted, unique)                                 | Claim Ledger ids of the segment                  |
| `visualIntent`       | string                                                          | normalized — the ONLY thing the Visual Director proposes |
| `selectedType`       | `real-media` \| `official-screenshot` \| `data-evidence-card` \| `programmatic-visual` | |
| `selectedMediaClipRef` | MediaClipRef \| null                                          | chosen real clip (only for real-media)           |
| `verificationRef`    | ArtifactRef \| null                                             | hash-bound `media-verification-v1` ref backing the clip (the registered external ref returned by the M5.06 pipeline) |
| `fallbackType`       | one of the six `REAL_MEDIA_*` codes \| null                     | null when real media was selected                |
| `fallbackReason`     | string \| null                                                  | structured explanation                           |
| `selectionScore`     | 0..1                                                            | deterministic score of the chosen clip; 0 on fallback |
| `reasons[]`          | non-empty                                                       | deterministic audit trail                        |
| `selectionVersion`   | literal                                                         | `visual-selection-v1`                            |
| `gate`               | sourceAdmitted/rightsApproved/hashValid/verificationPassed/episodeIsolated | hard-gate snapshot                    |
| `config`             | `visual-selection-config-v1`                                    | weights + gates + tie-breaker used               |
| `artifactRef`        | ArtifactRef                                                     | embedded ref (hash of body without this field)   |
| `createdAt`          | ISO datetime                                                    |                                                  |

Schema invariants: `real-media` requires clipRef + verificationRef + no
fallback reason + positive score + all hard gates true; any fallback requires
no clip/verification refs + score 0 + a structured fallback type/reason; the
verificationRef must be the verification artifact of the selected clip.

## Deterministic selection

Per candidate the selector computes:

- claim fit (retrieval `scoreBreakdown.claim`),
- visual-intent fit (retrieval `scoreBreakdown.visualIntent`),
- retrieval score (WP-M5.05 total),
- verification `claimMatch` and `relevance`,
- `visualQuality` (gate: below `minVisualQuality` → unusable),
- misleading-risk safety `1 - misleadingRisk` (gate: above
  `maxMisleadingRisk` → unusable),
- source trust (`SOURCE_PREFERENCE_TIERS` normalized to 0..1),
- duration suitability against the segment target (recommended window).

Weighted sum (defaults: 0.2/0.1/0.15/0.15/0.1/0.1/0.1/0.05/0.05, sum = 1).
Tie-breaker is a **fixed total order — never random**:
`score desc → sourceTrust desc → retrieval rank asc → mediaId asc → startMs
asc → clipId asc` (clip ids are content-derived, so the order is total).

Fallback determination (fixed priority):

| Condition                                                             | Fallback type                  |
| -------------------------------------------------------------------- | ------------------------------ |
| no retrieval result / zero candidates                                | `REAL_MEDIA_NOT_FOUND`         |
| no candidate has a valid `pass` verification (missing/reject/uncertain) | `REAL_MEDIA_NOT_VERIFIED`    |
| every pass-verified candidate lost admission/rights                   | `REAL_MEDIA_RIGHTS_BLOCKED`    |
| every pass-verified candidate lacks claim evidence (claim-bound)      | `REAL_MEDIA_LOW_EVIDENCE_FIT`  |
| every remaining candidate below `minVisualQuality`                    | `REAL_MEDIA_LOW_VISUAL_QUALITY`|
| every remaining candidate above `maxMisleadingRisk`                   | `REAL_MEDIA_MISLEADING_RISK`   |

Fallback stage order (recorded in `selectedType` when real media fails):
**official screenshot → data/evidence card → programmatic visual**.
`official-screenshot` requires an admitted/rights-approved image asset or
episode `captureAssets`; `data-evidence-card` requires a claim with a metric;
`programmatic-visual` always exists. All decisions are deterministic.

## Fail-closed gates (run on every selection, never cached)

- retrieval artifact: episode-scoped, registered, byte-hash-valid, parses, and
  matches the segment (`MEDIA_SELECT_RETRIEVAL_*`);
- verification artifact (discovered per candidate at
  `media/verifications/<segmentId>/<clipId>.json`): self-consistent embedded
  ref, registered, byte-hash-valid, episode/segment/clip identity match
  (`MEDIA_SELECT_VERIFICATION_*`);
- source media: current manifest, episode-scoped, registered, byte-hash-valid,
  admission/rights decisions re-read (`MEDIA_SELECT_ASSET_*` /
  `MEDIA_SELECT_SOURCE_*`); revoked rights → ineligible (fallback), tampering →
  hard error.

## Visual Director boundary

`createVisualSlotDirector` (a `ContentArtifactProducer` for
`runContentLoop`/`createFoundationGraph`) never names a clip id and never
bypasses retrieve/verify: it reads the final script
(`content/<ep>/story/script.json`) and proposes only each segment's visual
need, then delegates to `selectVisualSlotForSegment`, which may select only
verified candidates from the current retrieval result. The node returns only
the hash-bound slot ArtifactRefs — LangGraph state stays reference-only. When
no final script exists yet, the node produces nothing. `ORCHESTRATOR=manual`
behavior is untouched; M1–M4 and M5.01–M5.06 contracts are unchanged (event
schema gained only optional additive fields).

## Persistence / lineage

`content/<ep>/media/selections/<segmentId>.json` is written atomically,
hash-bound via `buildArtifactRef`, and registered in the episode artifact
registry with `reads` dependencies on: the retrieval result, every
pass-verified candidate's verification ref, the source media assets, and the
admission/rights decision refs. `readVisualSlot` reads the artifact bytes
(source of truth). `selectVisualSlotsForScript` produces one slot per
final-script segment.

## Error codes

`MEDIA_SELECT_CLAIM_IDS_REQUIRED`,
`MEDIA_SELECT_RETRIEVAL_REF_EPISODE_MISMATCH/NOT_REGISTERED/TAMPERED/INVALID/MISMATCH`,
`MEDIA_SELECT_VERIFICATION_INVALID/EPISODE_MISMATCH/MISMATCH/TAMPERED/NOT_REGISTERED`,
`MEDIA_SELECT_ASSET_UNKNOWN/EPISODE_MISMATCH/STALE/MISMATCH/NOT_REGISTERED/TAMPERED`,
`MEDIA_SELECT_SOURCE_UNKNOWN`, `MEDIA_SELECT_MANIFEST_MISSING`,
`MEDIA_SELECT_SCRIPT_MISSING/INVALID`, `MEDIA_SELECT_SLOT_MISSING/ARTIFACT_MISMATCH`.

## Compatibility boundary

M5.01–M5.06 contracts unchanged: `mediaEventTypes` gained
`media.selection.started/completed/failed`; `mediaEventSchema` gained optional
`selectedType`/`fallbackType` fields (additive only). No VLM is wired into the
graph, no Remotion changes, and `ORCHESTRATOR=manual` behavior is untouched.

## Acceptance checklist

- [x] `pnpm exec vitest run tests/media-selection.test.ts` (13 PASS)
- [x] `pnpm exec vitest run tests/media-contract.test.ts tests/media-discovery.test.ts tests/media-ingest.test.ts tests/media-index.test.ts tests/media-retrieve.test.ts tests/media-verify.test.ts` (119 PASS)
- [x] `pnpm exec vitest run tests/orchestration --maxWorkers=1` (193 PASS, Node 24)
- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media/select.ts src/media/events.ts src/media/paths.ts tests/media-selection.test.ts src/orchestration/agents/adapters/visual-director.ts --max-warnings=0`
- [x] Full `pnpm test` regression (469–470 PASS; the real-WebM ingest case is
      flaky only under full parallel load — passes standalone and in the media
      group — and is untouched by this WP)
