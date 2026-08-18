# WP-M5-06 — Multimodal Clip Verification

- Status: implemented
- Parent: `docs/milestones/m5-real-media-plan.md`
- Code: `src/media/verify.ts`, `src/media/schemas.ts` (formal
  `media-verification-v1`), `src/media/paths.ts` (verification paths),
  `src/media/events.ts` (verification events + `clipId`/`verdict` fields),
  `src/lib/fine-grained-cache.ts` (`media-verify` / `media-verify-clip` kinds)
- Schemas: `media-verification-request-v1`, `media-verification-v1`
  (artifact under `content/<ep>/media/verifications/<segmentId>/<clipId>.json`),
  `media-verification-clip-v1` (short clip bytes artifact)
- Cache: M4 fine-grained cache (`media-verify` result kind, `media-verify-clip`
  short-clip kind)
- Tests: `tests/media-verify.test.ts` (23 PASS)
- Observability: `media.verification.started/completed/failed`,
  `media.verification.cache.hit/miss` in `media-events.jsonl`

## Scope

For one WP-M5.05 Top-K CandidateClip (`episodeId`, `segmentId`, `clipId`,
`claimIds`, `narration`, `visualIntent`, `retrievalResultRef`) the WP runs a
**short-clip-level** multimodal verification and persists a hash-bound
`media-verification-v1` artifact. **The VLM only ever sees the candidate
window** (`startMs..endMs` of the original or its normalized proxy) plus a few
keyframe stills — never the whole long video. The VLM observes, diagnoses, and
scores; deterministic code (`assertMediaClipVerified`) performs the final
authorization. Retrieval ≠ verification, verification ≠ rights approval, and
verification ≠ factual-truth authorization: nothing here grants rights,
modifies the Claim Ledger, or authorizes Remotion.

## Verification request (`media-verification-request-v1`)

| Field                | Type                            | Notes                                                  |
| -------------------- | ------------------------------- | ------------------------------------------------------ |
| `schemaVersion`      | literal                         | `media-verification-request-v1`                        |
| `episodeId`          | `episode-<id>`                  | must equal the running episode                         |
| `segmentId`          | `seg-<id>`                      | final-script segment identity                          |
| `clipId`             | `episode-<id>:media-clip:<hex>` | candidate clip identity                                |
| `claimIds`           | `claim-<id>[]`                  | non-empty; must exist in the current Claim Ledger      |
| `narration`          | string                          | normalized                                             |
| `visualIntent`       | string                          | normalized                                             |
| `retrievalResultRef` | ArtifactRef                     | hash-bound `media-retrieval-result-v1` artifact        |
| `maxKeyframes`       | int 0..16                       | optional keyframe stills attached to the provider call |

## Result (`media-verification-v1`)

| Field                                                                          | Type                                     | Notes                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| `schemaVersion`                                                                | literal                                  | `media-verification-v1`                                                    |
| `verificationId`                                                               | `episode-<id>:media-verification:<slug>` | episode-scoped identity                                                    |
| `episodeId` / `segmentId` / `clipId`                                           |                                          | identity match is enforced on every read/gate                              |
| `clipRef`                                                                      | MediaClipRef                             | candidate range (`startMs..endMs`) + source media ref                      |
| `mediaRef`                                                                     | ArtifactRef                              | hash-bound original MediaAsset                                             |
| `retrievalResultRef`                                                           | ArtifactRef                              | hash-bound retrieval artifact the candidate came from                      |
| `clipArtifactRef`                                                              | ArtifactRef                              | hash-bound short verification clip bytes the VLM actually saw              |
| `claimIds`                                                                     | `claim-<id>[]`                           | equals `clipRef.claimIds` (sorted, unique)                                 |
| `cacheKey`                                                                     | sha256                                   | M4 verification cache key of this run                                      |
| `verdict`                                                                      | `pass` \| `reject` \| `uncertain`        | `uncertain` is never `pass`                                                |
| `relevance` / `claimMatch` / `visualQuality` / `misleadingRisk`                | 0..1                                     | scores (pass requires relevance ≥ 0.5 and claimMatch ≥ 0.5)                |
| `observedActions[]` / `observedEntities[]` / `observedText[]`                  |                                          | what the short clip actually showed                                        |
| `recommendedStartMs` / `recommendedEndMs`                                      | int                                      | must lie strictly inside the candidate range                               |
| `reasons[]`                                                                    | string[]                                 | non-empty                                                                  |
| `provider` / `model` / `verificationVersion` / `promptVersion` / `toolVersion` |                                          | provider identity and versions                                             |
| `sourceSha256`                                                                 | sha256                                   | SHA-256 of the original media bytes                                        |
| `artifactRef`                                                                  | ArtifactRef                              | embedded ref (content hash of the body without the self-referential field) |
| `createdAt`                                                                    | ISO datetime                             |                                                                            |

The embedded `artifactRef.sha256` is the hash of the record body _without_ the
self-referential `artifactRef` field; the authoritative file binding is the
external ref returned by `verifyMediaClip`, written to the artifact file, and
registered in the artifact registry.

## Provider contract (provider-neutral VLM adapter)

```ts
type MediaVerificationProvider = {
  readonly id: string;
  readonly model: string | null;
  readonly verificationVersion: string;
  verify(input: MediaVerificationProviderInput): Promise<MediaVerificationProviderOutput>;
};
```

- `MediaVerificationProviderInput` contains ONLY the materialized short clip
  (`path`, `sha256`, `sizeBytes`, `mediaType`, `startMs`, `endMs`,
  `sourceMediaId`, `sourceMediaSha256`) + bounded keyframes + claim text +
  narration/visualIntent + clip metadata. No original asset path, no original
  bytes, no repository access.
- `MediaVerificationProviderOutput` is schema-constrained
  (`mediaVerificationProviderOutputSchema`); the pipeline re-validates it and
  malformed/incomplete output fails closed (`MEDIA_VERIFY_PROVIDER_OUTPUT_INVALID`).
- Real adapters are hosted-only (`https:` endpoints), read credentials from
  env (`MEDIA_VERIFY_ENDPOINT` / `MEDIA_VERIFY_API_KEY` / `MEDIA_VERIFY_MODEL`),
  use bounded timeout/retry (`fetchWithRetry`), and cannot modify Artifacts or
  rights — they only return observations.
- Tests use `createDeterministicVerificationProvider` — no network, no media
  tooling.

## Short-clip boundary

- `ShortClipExtractor.extract({inputPath, startMs, endMs, outputPath,
mediaType})` cuts only the candidate window; default is ffmpeg
  (exact-seek + bounded re-encode), tests use a deterministic stub.
- Analysis source: normalized proxy preferred, original otherwise; lineage
  always anchors to the original (`derivedFromMediaRef.sha256 ===
original.sha256` checked).
- Extraction writes to `media/.tmp/` first; only a successful, hashed
  extraction is copied to
  `content/<ep>/media/verifications/<segmentId>/<clipId>-clip.<ext>` and
  registered. Failed/temp fragments are never registered.
- The short clip bytes are hash-bound (`media-verification-clip-v1` ArtifactRef)
  and reusable via the `media-verify-clip` cache; the verification records
  source media + exact timestamps.

## Deterministic authorization gate

```ts
assertMediaClipVerified({repoRoot, episodeId, segmentId, clipId, verificationRef}): MediaVerification
isMediaClipVerified(input): boolean
```

Usable only when **all** hold — any single failure fails closed:

- `verification.verdict === "pass"` (`MEDIA_VERIFY_NOT_PASSED`);
- current source admission + rights approval, decisions re-read
  (`MEDIA_VERIFY_SOURCE_NOT_ADMITTED` / `..._RIGHTS_NOT_APPROVED`);
- source media byte-hash-valid + registered (`MEDIA_VERIFY_ASSET_TAMPERED` / ...);
- clip/index/retrieval refs valid: candidate still in the current retrieval
  artifact, clip still in the current ClipIndex with the exact window;
- verification ArtifactRef byte-hash-valid + registered
  (`MEDIA_VERIFY_VERIFICATION_TAMPERED` / `..._NOT_REGISTERED`);
- short clip artifact still hash-valid + registered
  (`MEDIA_VERIFY_CLIP_TAMPERED`);
- recommended range legal (inside the candidate range);
- episode identity matches everywhere (`MEDIA_VERIFY_EPISODE_MISMATCH` /
  `..._ARTIFACT_MISMATCH`).

The VLM cannot bypass this gate: it observes and scores, the gate authorizes.

## Cache identity

Short clip (`media-verify-clip` kind):

```
sha256({
  cacheSchemaVersion: media-verify-clip-cache-v1,
  implementationVersion: media-verify-clip-cache-impl-v1,
  episodeId, clipId,
  mediaSha256, analysisSourceSha256,
  startMs, endMs,
  extractorId, extractorVersion,
  dependencyHashes,
})
```

Verification (`media-verify` kind) — candidate clip bytes SHA is the core input:

```
sha256({
  cacheSchemaVersion: media-verify-cache-v1,
  implementationVersion: media-verify-cache-impl-v1,
  episodeId, segmentId, clipId,
  clipBytesSha256,          // SHA of the materialized short clip bytes
  mediaSha256, indexSha256, retrievalResultSha256,
  claimIds (sorted), narration, visualIntent,
  providerId, model, verificationVersion,
  promptVersion, schemaVersion: media-verification-v1,
  dependencyHashes,
})
```

- identical input → cache hit (provider not called again);
- candidate clip bytes change → different key → invalidate;
- narration/claimIds/visualIntent change → different key → invalidate;
- provider model/version change → different key → invalidate;
- corrupt entries (payload hash mismatch, bad metadata) degrade to miss +
  rebuild with byte-identical artifacts (deterministic provider);
- a cache hit still re-runs the full rights/hash/episode gate.

## Persistence / lineage

`content/<ep>/media/verifications/<segmentId>/<clipId>.json` is written
atomically, hash-bound via `buildArtifactRef`, and registered in the episode
artifact registry with `reads` dependencies on: the short clip artifact, the
retrieval result, the ClipIndex, the original MediaAsset, and the
admission/rights decision refs. The short clip bytes artifact depends on the
MediaAsset/proxy + decisions. LangGraph/orchestration layers hold only the
`MediaVerificationOutcome` — `{artifactRef, clipArtifactRef, status: "ready",
verdict, cacheHit, cacheKey, ...}` — never the verification body or clip bytes.
`readMediaVerification` reads the artifact bytes (source of truth).

## Observability

`media.verification.started/completed/failed` and
`media.verification.cache.hit/miss` record `segmentId`, `clipId`, `claimIds`,
`verdict`, refs/hashes, and cacheKey — never credentials and never media
bodies.

## Error codes

`MEDIA_VERIFY_REQUEST_INVALID`, `MEDIA_VERIFY_EPISODE_MISMATCH`,
`MEDIA_VERIFY_CLAIM_LEDGER_MISSING/INVALID`, `MEDIA_VERIFY_CLAIM_UNKNOWN`,
`MEDIA_VERIFY_RETRIEVAL_REF_EPISODE_MISMATCH/NOT_REGISTERED/TAMPERED/INVALID/MISMATCH`,
`MEDIA_VERIFY_CANDIDATE_NOT_IN_RESULT/CANDIDATE_EPISODE_MISMATCH/CANDIDATE_MEDIA_MISMATCH`,
`MEDIA_VERIFY_ASSET_UNKNOWN/STALE/EPISODE_MISMATCH/NOT_REGISTERED/TAMPERED/RIGHTS_NOT_APPROVED`,
`MEDIA_VERIFY_SOURCE_UNKNOWN/NOT_ADMITTED/RIGHTS_NOT_APPROVED`,
`MEDIA_VERIFY_INDEX_MISSING/NOT_REGISTERED/TAMPERED/INVALID/MISMATCH`,
`MEDIA_VERIFY_CLIP_NOT_IN_INDEX/CLIP_WINDOW_MISMATCH/WINDOW_OUT_OF_BOUNDS`,
`MEDIA_VERIFY_PROXY_STALE`, `MEDIA_VERIFY_CLIP_EXTRACTION_FAILED`,
`MEDIA_VERIFY_CLIP_MEDIA_TYPE_UNSUPPORTED`,
`MEDIA_VERIFY_PROVIDER_NOT_CONFIGURED/FAILED/OUTPUT_INVALID`,
`MEDIA_VERIFY_RECOMMENDED_RANGE_OUT_OF_BOUNDS`, `MEDIA_VERIFY_CACHE_KEY_MISMATCH`,
`MEDIA_VERIFY_VERIFICATION_NOT_REGISTERED/TAMPERED/INVALID/ARTIFACT_MISMATCH/NOT_PASSED`,
`MEDIA_VERIFY_CLIP_NOT_REGISTERED/CLIP_TAMPERED`, `MEDIA_VERIFY_RESULT_MISSING`.

## Compatibility boundary

M5.01–M5.05 contracts unchanged: the M5.01 `mediaVerificationSchema` was
formalized in place (verdict `pass|reject|uncertain`, added `schemaVersion`,
`segmentId`, `claimIds`, `mediaRef`, `retrievalResultRef`, `clipArtifactRef`,
`cacheKey`, `observedText[]`, `verificationVersion`, `sourceSha256`,
recommended-range-inside-candidate constraint); `cacheKindSchema` gained two
kinds (`media-verify`, `media-verify-clip`); `mediaEventSchema` gained optional
`clipId`/`verdict` fields; `retrieve.ts` exported its Claim Ledger helpers. No
VLM is wired into the graph, no Visual Director selection, no Remotion
changes, and `ORCHESTRATOR=manual` behavior is untouched.

## Acceptance checklist

- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media tests/media-verify.test.ts tests/media-contract.test.ts src/lib/fine-grained-cache.ts --max-warnings=0`
- [x] `pnpm exec vitest run tests/media-verify.test.ts` (23 PASS)
- [x] `pnpm exec vitest run tests/media-contract.test.ts tests/media-retrieve.test.ts tests/media-index.test.ts tests/media-ingest.test.ts tests/media-discovery.test.ts` (96 PASS)
- [x] `pnpm exec vitest run tests/orchestration --maxWorkers=1` (193 PASS)
- [x] Full `pnpm test` regression
