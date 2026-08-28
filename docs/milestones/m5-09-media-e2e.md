# WP-M5-09 — Delivery Gate + Real-Media E2E

- Status: implemented
- Parent: `docs/milestones/m5-real-media-plan.md`
- Code: `src/media/projection.ts` (`media-render-manifest-v1` dual-ledger
  projection), `src/media/delivery-gate.ts` (inspect 1080×1920 / 40–80s,
  lineage, media observability, optional M4 approval completeness),
  `src/media/paths.ts` (`media/render-manifest.json`),
  `scripts/build-media-render-plan.ts` (writes the projection),
  `scripts/validate-delivery.ts` (media-mix episodes run the media gate)
- Schemas: `media-render-manifest-v1` (artifact under
  `content/<ep>/media/render-manifest.json`)
- Tests: `tests/media-e2e.test.ts`
- Observability: Discovery → render media events must have terminals before
  delivery _approval_; M4 `assertObservabilityComplete` still blocks
  LangGraph final approval. `validate:delivery` inspects dimensions/duration
  without requiring a full M4 execution log (manual path).

## Scope

M5.09 is the last M5 work package. It does not add Remotion features. It
makes the two ledgers meet at render time, and it turns the M5 exit
acceptance scripts into a repeatable, isolated test.

1. **Render-time manifest projection.** `production/asset-manifest.json`
   remains the screenshot/generated-asset ledger.
   `media/source-manifest.json` remains the real-media ledger. Delivery now
   computes a hash-bound `media-render-manifest-v1` from admitted sources +
   ingested assets + verified clips + usage decisions (visual slots / shots)
   and fail-closes if the render plan uses anything outside that projection.
2. **Inspect / delivery enforce 40–80s and 9:16.** The media delivery gate
   re-reads `inspection.json` or live-probes the vertical MP4 and rejects
   the wrong canvas or a duration outside the production contract window.
3. **One real-media E2E PASS / one tampered-media E2E FAIL.** Isolated temp
   repo: admission → ingest → index → retrieve → verify → select → render
   plan → projection → 1080×1920 40–80s readout → Delivery PASS. Tampering
   original bytes, verification, selection, or rebuilding through a warm
   cache fails closed.
4. **Observability complete before approval.** Missing
   `media.render.completed` / `media.rendered` after a real-media plan
   blocks approval. Passing `observability` into the gate still runs the M4
   completeness checker.

`ORCHESTRATOR=manual` remains the default. The real-media Graph path is
available through explicit `ORCHESTRATOR=langgraph` selection. Goal 3.2 /
Golden Set / hard validators are unchanged. No publish/upload path is added.

## Projection contract

`media-render-manifest-v1` binds:

| Field                                 | Source                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| `sourceManifestSha256`                | `media/source-manifest.json`                                 |
| `assetManifestSha256`                 | `production/asset-manifest.json` (nullable)                  |
| `timelineSha256` / `renderPlanSha256` | current production timeline + render plan                    |
| `sources[]`                           | admission + rights flags, never URL bodies                   |
| `assets[]`                            | original / proxy MediaAsset hashes                           |
| `clips[]`                             | clip ids used by real-media shots                            |
| `usage[]`                             | per-segment selected type, clip, fallback, official asset id |
| `officialAssets[]`                    | approved / used-in-render screenshot ledger rows             |

`assertMediaRenderManifestConsistent` requires:

- every real-media shot's clip appears in `clips[]`;
- that clip's source is admitted and rights-approved;
- original MediaAsset bytes still match the registered SHA-256;
- usage `selectedType` matches the render-plan shot;
- a stored manifest, if present, is not stale versus the current plan.

A missing stored file is allowed: the gate computes the projection live. The
opt-in `pnpm media:render-plan` command writes the artifact so later
delivery can detect staleness.

## Delivery gate

`assertMediaDeliveryGate`:

1. `assertMediaRenderPlanRenderable` (M5.08 fail-closed re-authorization);
2. projection consistency;
3. lineage for every real-media shot (clip → verification → asset → source
   - timestamp);
4. vertical inspect: 1080×1920 and 40–80 seconds;
5. optional `requireObservabilityComplete` for media event terminals;
6. optional M4 `observability` input — degraded logs still cannot approve.

`scripts/validate-delivery.ts` calls the gate for `renderer === "media-mix"`
episodes. It does **not** require a LangGraph execution log. Duration and
canvas still come from the existing inspect + timeline checks; the media
gate repeats the inspect contract so a media-mix episode cannot Delivery
PASS on a 16:9 or 20-second file.

## Tests

`tests/media-e2e.test.ts` (isolated temp repos, no mutation of
`content/episode-m5e2e`):

- real-media E2E: pipeline + live ffmpeg 1080×1920 ~41s MP4 + Delivery PASS;
- tamper original / verification / selection / warm-cache rebuild FAIL;
- duration <40s, >80s, and non-9:16 FAIL;
- undeclared clip / stale projection FAIL;
- stripped render-completed events block approval.

Hosted ASR/VLM are not called. Deterministic adapters stand in; hash,
rights, admission, and registry gates are the real code paths.

## Compatibility boundary

- Episode 001–003 (`legacy-composition`) do not run the media gate.
- Media-mix episodes without a render plan fail closed at delivery.
- Default `ORCHESTRATOR=manual` behavior is unchanged; LangGraph remains opt-in.
- No new event types; no self-hosted models; no social publish.

## Acceptance checklist

- [x] `pnpm exec vitest run tests/media-e2e.test.ts` (6 PASS)
- [x] media remotion + delivery + validation entrypoints regression (28 PASS)
- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media/projection.ts src/media/delivery-gate.ts src/media/paths.ts src/media/index.ts scripts/validate-delivery.ts scripts/build-media-render-plan.ts tests/media-e2e.test.ts tests/helpers/media-e2e-pipeline.ts --max-warnings=0`
