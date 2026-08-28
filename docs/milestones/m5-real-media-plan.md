# M5 — Real Media First

- Status: accepted scope; M5.01 implemented; M5.02 implemented; M5.03 implemented; M5.04 implemented (`docs/milestones/m5-04-media-index.md`); M5.05 implemented (`docs/milestones/m5-05-media-retrieval.md`); M5.06 implemented (`docs/milestones/m5-06-media-verification.md`); M5.07 implemented (`docs/milestones/m5-07-visual-director-selection.md`); M5.08 implemented (`docs/milestones/m5-08-media-remotion.md`); M5.09 implemented (`docs/milestones/m5-09-media-e2e.md`)
- Predecessor: M4 exit-accepted (`docs/milestones/m4-acceptance-report.md`)
- Default orchestrator: `ORCHESTRATOR=langgraph`; explicit `ORCHESTRATOR=manual`
  remains available as the rollback path
- Product constraints (inherited, not renegotiable):
  - Final delivery is 1080×1920 9:16 only
  - Final MP4 duration must read back in 40–80 seconds (target 60)
  - No self-hosted GPT, LLM, ASR, TTS, or VLM; Codex handles capability-gated inspection
  - Facts, Claim Ledger locators, and review records remain source of truth
  - No hand-edit of the final cut; content or component change regenerates
  - Production reads only a frozen content manifest
  - Formal `HumanDecision` is required for source admission and rights approval
  - M4 observability completeness still blocks approval
  - Media cache keys are episode-scoped M4 fine-grained cache keys

## Goal

Upgrade ProductionAgent from a programmatic-visual video pipeline into a media
production system that can discover, understand, retrieve, verify, and edit real
media, while keeping artifact files and hash-bound `ArtifactRef`s as the source
of truth.

Real media preference order:

1. real interview / founder audio
2. real product operation / demo
3. official launch video / event
4. official UI / webpage screenshot
5. real data / news evidence
6. programmatic Remotion visual

Rule: when a suitable, trusted, usable real media opportunity exists, use it;
otherwise record a structured fallback reason. There is no fixed real-media
percentage target.

## Work packages

| WP    | Modules                                                                                         | Depends on                              | Tests                                                                   | Acceptance                                                                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5.01 | `src/media/{schemas,paths,manifest}.ts`                                                         | M4                                      | `tests/media-contract.test.ts`                                          | Hash-bound `MediaAsset`; URL ≠ artifact; rights/admission fail-closed; source-manifest CAS; episode isolation. No download/ASR/VLM/Remotion.                                                                                                                                                                |
| M5.02 | `src/media/discovery.ts`, HumanDecision admission/rights (**implemented**)                      | M5.01                                   | `tests/media-discovery.test.ts`                                         | Bounded, allowlisted source admission. No unrestricted crawler. Admit/reject is a persisted `HumanDecision`. Secrets stay in env (`MEDIA_BROWSER_*` only if capture is used).                                                                                                                               |
| M5.03 | `src/media/ingest.ts` (**implemented**)                                                         | M5.01, M5.02                            | `tests/media-ingest.test.ts`                                            | Resumable download/import to `content/<ep>/media/assets/`. Original bytes + probe + lineage. Incomplete files never selected.                                                                                                                                                                               |
| M5.04 | `src/media/understanding.ts` clip index (**implemented**)                                       | M5.03                                   | `tests/media-index.test.ts`                                             | Long video produces hash-bound transcript/scene/keyframe index ArtifactRefs under `media/indexes/`. Cache key: `media-index:<episode>:<mediaId>:<toolVersion>`.                                                                                                                                             |
| M5.05 | `src/media/retrieve.ts`                                                                         | M5.04                                   | `tests/media-retrieve.test.ts`                                          | Narration/claim → deterministic Top-K clip candidates. Same inputs → same ranking. Claim Ledger ids are the query keys.                                                                                                                                                                                     |
| M5.06 | `src/media/verify.ts` Codex media-verification handoff                                          | M5.05                                   | `tests/media-verify.test.ts`                                            | Codex sees only bounded short candidate clips and keyframes, never whole long videos. The structured result is request-hash-bound. `assertMediaClipRenderable` requires `verdict=pass` + hash-valid verification ArtifactRef.                                                                               |
| M5.07 | `src/media/select.ts`, `src/orchestration/agents/adapters/visual-director.ts` (**implemented**) | M5.06, content loop on foundation graph | `tests/media-selection.test.ts` (13 PASS) plus orchestration regression | Visual Director real-media-first runs **inside** `runContentLoop` as composed by `createFoundationGraph` (`createVisualSlotDirector`). One `visual-slot-v1` artifact per final-script segment; verified real media preferred; structured fallback reason + fixed fallback stage; deterministic tie-breaker. |
| M5.08 | Remotion real-clip layers (**implemented**)                                                     | M5.06, M5.07                            | `tests/media-remotion.test.ts` (12 PASS)                                | Trim/crop/PiP/caption/mix only from renderable clips. Shot traces to source + timestamp. Output still 1080×1920.                                                                                                                                                                                            |
| M5.09 | Delivery gate + E2E (**implemented**)                                                           | M5.08, M4.04                            | `tests/media-e2e.test.ts`                                               | Inspect/delivery enforce 40–80s and 9:16. One real-media E2E PASS. One tampered-media E2E FAIL. Observability complete before final approval. Dual-ledger render-time projection (`media-render-manifest-v1`).                                                                                              |

Dependencies: M5.02 and M5.01 feed M5.03; M5.04 feeds M5.05; M5.07 and M5.06
feed M5.08. Sequential delivery in 01 → 09 is recommended for regression
control. **Do not start M5.02 until M5.01 review is accepted.**

## Non-goals

- No social-platform auto publication
- No recommendation algorithm or published-retention A/B loop
- No large-scale distributed media storage
- No unrestricted internet crawler
- No self-trained **or self-hosted** vision, ASR, or language model
- No rewrite of the 11 agents into provider-specific APIs

## Providers, secrets, and rate limits

| Capability                 | Allowed provider class                        | Secret                  | Rate / budget                           |
| -------------------------- | --------------------------------------------- | ----------------------- | --------------------------------------- |
| Browser capture (optional) | Existing capture tooling                      | none new                | per-episode, no crawl                   |
| Ingest download            | HTTPS allowlist                               | none                    | resume-only, hashed                     |
| ASR / transcript           | Hosted API already permitted by decision-0001 | existing hosted key env | M4 cache, per-segment                   |
| media verify               | Codex 5.6 local file handoff                  | no API key              | short clips only; max N clips / episode |
| TTS                        | Existing MiniMax + Edge fallback              | existing TTS env        | M4 segment cache                        |

Unknown provider, missing key, or self-hosted endpoint is fail-closed.

## Cache keys

Reuse `src/lib/fine-grained-cache.ts`. Metadata must carry `episodeId`. Suggested
key shapes:

- ingest probe: `media-probe:<episodeId>:<sha256>`
- index: `media-index:<episodeId>:<mediaId>:<toolVersion>`
- retrieve: `media-retrieve:<episodeId>:<claimId>:<indexSha256>`
- verify: `media-verify:<episodeId>:<clipId>:<promptVersion>:<toolVersion>`

A cache hit logs cost 0 and never bypasses `assertMediaClipRenderable`.

## Dual manifests

`content/<episode>/production/asset-manifest.json` remains the current
screenshot/generated-asset ledger. `content/<episode>/media/source-manifest.json`
is the real-media ledger. M5.09 makes the render-time manifest a projection
of admitted sources + ingested assets + verified clips + usage decisions
(`content/<episode>/media/render-manifest.json`). Both source ledgers stay
independent files; delivery fail-closes if the render plan uses anything
outside that projection. `pnpm media:render-plan` writes the projection.
`validate:delivery` runs the media gate for `media-mix` episodes.

## Exit criteria

M5 exits when all of the following hold:

- Every real media byte is hash-bound to an `ArtifactRef`.
- Source/publisher/acquisition/rights provenance is complete and admitted by
  `HumanDecision`.
- MP4/audio/image ingest is verifiable, resumable, and normalized without losing
  original lineage.
- Long video produces cached transcript/scene/keyframe index ArtifactRefs.
- Narration/claim (Claim Ledger ids) can retrieve deterministic Top-K candidates.
- Codex verifies only short candidate clips and keyframes, never whole long videos.
- Unverified, rights-blocked, or tampered media cannot render.
- Visual Director uses real-media-first selection on the foundation-graph
  content loop, with deterministic fallback.
- Real clips can be trimmed, cropped, PiP'd, captioned, and mixed in Remotion.
- Every rendered real-media shot traces back to source + timestamp.
- Final inspect/delivery still enforce 1080×1920 and 40–80s readout.
- ASR/index/VLM/clip processing uses the M4 fine-grained cache key shapes above.
- Crash/resume does not repeat valid media processing.
- Discovery → render events are observable; M4 completeness still blocks approval.
- Episode media/cache/index are isolated.
- `ORCHESTRATOR=manual` behavior and Goal 3.2/Golden Set/hard validators remain
  unchanged.
- One real-media E2E passes and one tampered-media failure E2E passes.

## M5.01 boundary

M5.01 only builds the data model, manifest persistence, Artifact Registry
integration, provenance/rights fail-closed rules, and tests. It does not
download video, call ASR/VLM, or change Remotion.
