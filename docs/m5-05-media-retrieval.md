# WP-M5-05 — Claim-to-Clip Retrieval

- Status: implemented
- Parent: `docs/m5-real-media-plan.md`
- Code: `src/media/retrieve.ts`, `src/media/events.ts` (retrieval events +
  segment fields), `src/media/paths.ts` (`mediaRetrievalCandidateRepositoryPath`),
  `src/lib/fine-grained-cache.ts` (`media-retrieve` cache kind)
- Schemas: `media-retrieval-request-v1`, `media-retrieval-result-v1`
  (`media-retrieval-result-v1` artifact under
  `content/<ep>/media/candidates/<segmentId>.json`)
- Cache: M4 fine-grained cache (`media-retrieve` kind)
- Tests: `tests/media-retrieve.test.ts` (22 PASS)
- Observability: `media.retrieval.started/completed/failed`,
  `media.retrieval.cache.hit/miss` in `media-events.jsonl`

## Scope

For one final-script segment (`episodeId`, `segmentId`, `claimIds`,
`narration`, `visualIntent`, optional `preferredMediaTypes` / duration
constraints, `topK`) the WP turns the Claim Ledger + the episode's
hash-valid `media-clip-index-v1` indexes into a deterministic Top-K
`CandidateClip` list for M5.06 VLM verification. **No clip is approved and no
VLM is called in this WP.** A retrieval result is candidate generation only:
it never verifies a clip (M5.06) and never authorizes rendering (M5.07/M5.08).

## Retrieval request (`media-retrieval-request-v1`)

| Field                 | Type                   | Notes                                                |
| --------------------- | ---------------------- | ---------------------------------------------------- |
| `schemaVersion`       | literal                | `media-retrieval-request-v1`                         |
| `episodeId`           | `episode-<id>`         | must equal the running episode                       |
| `segmentId`           | `seg-<id>`             | final-script segment identity                        |
| `claimIds`            | `claim-<id>[]`         | primary query key; empty → weaker evidence mode      |
| `narration`           | string                 | normalized (NFKC, collapsed whitespace)              |
| `visualIntent`        | string                 | normalized                                           |
| `preferredMediaTypes` | `("video"\|"audio")[]` | optional media-kind filter                           |
| `topK`                | int 1..50              | max candidates                                       |
| `durationTargetMs`    | int \| null            | optional soft duration target (duration suitability) |
| `maxDurationMs`       | int \| null            | optional hard upper bound on clip duration           |

## Result (`media-retrieval-result-v1`)

The artifact binds the normalized request, `evidenceMode`
(`claim-bound` | `weaker-textual`), ranked `candidates[]`, the ranking
config/version, the hash-bound `clipIndexRefs[]` of every eligible index, a
Claim Ledger binding `{path, sha256, sizeBytes}`, a deterministic `gate`
record, `cacheKey`, and `createdAt`.

Each `CandidateClip` carries: `rank`, `clipId`, `episodeId`, `mediaId`,
`mediaSourceId`, `mediaRef` (hash-bound original), `indexRef` (hash-bound
ClipIndex), `startMs`, `endMs`, `score` (0..1), `matchedClaimIds`,
`scoreBreakdown` (claim / lexical / metadata / visualIntent /
sourcePreference / duration), and `reasons[]`.

## Deterministic hybrid ranking (`media-retrieval-ranking-v1`)

`score = Σ weights·components`, all components in [0,1], rounded to 6
decimals:

| Component          | Weight | Definition                                                                                                               |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `claim`            | 0.40   | per-claim term overlap vs clip text; `0.6·coverage + 0.4·maxFit` over the request claims                                 |
| `lexical`          | 0.20   | narration term overlap vs observedText + textSummary                                                                     |
| `metadata`         | 0.15   | query terms (claims + narration + visualIntent) vs keywords/entities/semanticTags/speaker                                |
| `visualIntent`     | 0.10   | visualIntent term overlap vs textSummary + semanticTags + observedText                                                   |
| `sourcePreference` | 0.10   | deterministic trust tier / 5 (official/founder 5, product-demo/media 4, platform/local-approved 3, analysis 2, social 1) |
| `duration`         | 0.05   | `1 - min(1,                                                                                                              | dur − target | / max(target, 1000))`; neutral 0.5 without target |

Claim-bound mode: a clip with zero claim evidence is multiplied by
`claimlessPenalty = 0.5` (claim evidence fit always outranks pure text
similarity). Candidates below `minRelevanceScore = 0.1` are dropped, so Top-K
is never padded with obviously unrelated material.

**Tie-breaker (total order, never random):**
`score desc → source preference desc → mediaId asc → startMs asc → clipId asc`.

Embeddings are not used; the ranking is a pure function of inputs + index, so
identical inputs + identical index always produce the identical ranking.

## Corpus gate (fail-closed, runs before any cache consult)

For every video/audio original of the current episode:

- asset must be current-episode, byte-hash-valid, and registered
  (`MEDIA_RETRIEVE_ASSET_TAMPERED` / `MEDIA_INDEX_ASSET_STALE` /
  `MEDIA_RETRIEVE_ASSET_NOT_REGISTERED`);
- source admission/rights HumanDecisions are re-read (hash-checked) and the
  clip index must exist and be hash-valid and episode-scoped
  (`MEDIA_RETRIEVE_INDEX_MISSING` / `..._TAMPERED` / `..._INVALID` /
  `..._MISMATCH` / `..._NOT_REGISTERED`);
- window legality is re-checked against the media duration
  (`MEDIA_RETRIEVE_WINDOW_OUT_OF_BOUNDS`);
- a source that is **not currently** admitted/rights-approved is excluded
  from the corpus (its clips are never returned) — no stale state is ever
  served;
- claimIds must exist in the current Claim Ledger
  (`MEDIA_RETRIEVE_CLAIM_UNKNOWN`); a missing/invalid ledger fails closed
  (`..._MISSING` / `..._INVALID`);
- a cache hit still re-runs the full gate; tampered media/index/decisions
  fail even with a warm cache.

## Cache identity (`media-retrieve` kind)

```
sha256({
  cacheSchemaVersion: media-retrieve-cache-v1,
  implementationVersion: media-retrieve-cache-impl-v1,
  episodeId,
  request: normalized request,
  claimLedger: {path, sha256, sizeBytes},
  clipIndexHashes: {mediaId: indexSha256},
  mediaEligibilityHash,          // admission/rights state of every video/audio original
  rankingConfig,
  toolVersion: media-retrieval-v1,
  dependencyHashes,
})
```

Changes to narration/claimIds/visualIntent, the Claim Ledger, any eligible
ClipIndex, the admission/rights eligibility state, the ranking config, or the
implementation/dependency files all produce a different key. Corrupt entries
(payload hash mismatch, bad metadata) degrade to miss + rebuild, and the
rebuilt artifact is byte-identical. Cache hits never bypass the gate.

## Persistence / lineage

`content/<ep>/media/candidates/<segmentId>.json` is written atomically,
hash-bound via `buildArtifactRef`, and registered in the episode artifact
registry with `reads` dependencies on every eligible ClipIndex ref, original
MediaAsset ref, and admission/rights decision ref. LangGraph/orchestration
layers hold only the `MediaRetrievalOutcome` — `{artifactRef, status:
"ready", cacheHit, cacheKey, candidateCount, evidenceMode}` — never the
result body. `readMediaRetrievalResult` reads the artifact bytes (source of
truth).

## Observability

`media.retrieval.started/completed/failed` and
`media.retrieval.cache.hit/miss` record `segmentId`, `claimIds`,
`candidateCount`, refs/hashes, cacheKey, and a compact `rankSummary`
(`rank:clipId:score` list) — never transcript bodies.

## Error codes

`MEDIA_RETRIEVE_REQUEST_INVALID` (schema), `MEDIA_RETRIEVE_EPISODE_MISMATCH`,
`MEDIA_RETRIEVE_CLAIM_LEDGER_MISSING/INVALID`, `MEDIA_RETRIEVE_CLAIM_UNKNOWN`,
`MEDIA_RETRIEVE_ASSET_STALE/UNKNOWN/NOT_REGISTERED/TAMPERED`,
`MEDIA_RETRIEVE_SOURCE_UNKNOWN`, `MEDIA_RETRIEVE_RIGHTS_NOT_APPROVED` (via
exclusion), `MEDIA_RETRIEVE_INDEX_MISSING/TAMPERED/INVALID/MISMATCH/NOT_REGISTERED`,
`MEDIA_RETRIEVE_WINDOW_OUT_OF_BOUNDS`, `MEDIA_RETRIEVE_RESULT_MISSING`,
`MEDIA_RETRIEVE_ARTIFACT_MISMATCH`, `MEDIA_RETRIEVE_CACHE_KEY_MISMATCH`, plus
`HUMAN_DECISION_ARTIFACT_HASH_MISMATCH` for tampered decisions.

## Compatibility boundary

M5.01–M5.04 contracts unchanged: `cacheKindSchema` gained one kind
(`media-retrieve`), `mediaEventSchema` gained optional `segmentId`,
`claimIds`, `candidateCount`, `rankSummary` fields, and the media barrel
gained `retrieve.ts`. No VLM verification, no clip approval, no Visual
Director wiring, no Remotion changes, no embedding provider, and
`ORCHESTRATOR=manual` behavior is untouched (nothing in this WP is wired into
the graph).

## Acceptance checklist

- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media tests/media-retrieve.test.ts src/lib/fine-grained-cache.ts --max-warnings=0`
- [x] `pnpm exec vitest run tests/media-retrieve.test.ts` (22 PASS)
- [x] `pnpm exec vitest run tests/media-index.test.ts tests/media-ingest.test.ts tests/media-discovery.test.ts tests/media-contract.test.ts`
- [x] `pnpm exec vitest run tests/orchestration`
- [x] Full `pnpm test` regression
