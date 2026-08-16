# WP-M5-03 — Media Ingest + Normalization

- Status: implemented
- Parent: `docs/m5-real-media-plan.md`
- Code: `src/media/ingest.ts`, `src/media/probe.ts`, `src/media/events.ts`,
  `src/media/ingest-config.ts`, `config/media-ingest.json`
- Schemas: `src/media/schemas.ts` (`derivedFromMediaRef` on proxy assets)
- Cache: `src/lib/fine-grained-cache.ts` (`media-normalize` kind)
- Tests: `tests/media-ingest.test.ts`

## Scope

M5.03 turns an **admission-approved + rights-approved** `MediaSource` into an
immutable, byte-hashed **original** `MediaAsset` (SHA-256 + ffprobe metadata +
formal `ArtifactRef`), and derives a production-friendly **normalized proxy**
for videos. Acquisition is adapter-injected; nothing is ever downloaded at
module load, and tests never touch the real internet.

## Ingest gate (fail-closed)

`ingestMediaSource` refuses everything that is not formally approved:

| State                                                                            | Result                                                            |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `admissionStatus=pending` / `rejected` / no `admissionDecisionRef`               | `MEDIA_INGEST_SOURCE_NOT_ADMITTED`                                |
| `rightsStatus=review-required` / `rejected` / `unknown` / no `rightsDecisionRef` | `MEDIA_INGEST_RIGHTS_NOT_APPROVED`                                |
| persisted decision bytes tampered                                                | `HUMAN_DECISION_ARTIFACT_HASH_MISMATCH`                           |
| source or mediaId belongs to another episode                                     | `MEDIA_INGEST_*_EPISODE_MISMATCH` / `MEDIA_INGEST_SOURCE_UNKNOWN` |
| URL source not `https:` or host off the discovery allowlist                      | `MEDIA_INGEST_HTTPS_REQUIRED` / `MEDIA_INGEST_HOST_NOT_ALLOWED`   |

`isMediaSourceAdmitted` + the new `isMediaSourceRightsApproved` both require
the persisted, hash-bound decision ref — flipping the manifest primitive is
not enough. Ingest **never** grants or changes rights: `applyMediaSourceRights`
is the only entry point that can, and the source record + decision bytes are
bit-identical before/after ingest.

## Acquisition

`MediaAcquisitionAdapter.acquire(ctx): Promise<AcquiredMediaFile>`:

- `createLocalFileAcquisitionAdapter({localFilePath})` — `local-approved`
  sources. Existence, regular-file, and size checks.
- `createHttpsAcquisitionAdapter({fetchImpl, timeoutMs})` — plain GET with no
  credentials; `401/403/404` fail closed (`MEDIA_INGEST_DOWNLOAD_REJECTED`),
  redirects must stay on the discovery allowlist, content type must be in
  `config/media-ingest.json` `allowedContentTypes`, `Content-Length` and the
  byte ceiling are enforced during the stream, and a body shorter than the
  declared `Content-Length` is a **partial download** that is never published.

The gate re-checks `https:` + the discovery allowlist even when a custom
adapter is injected, so an adapter cannot bypass the host policy.

## Original MediaAsset

1. Bytes land in `content/<ep>/media/.tmp/<slug>-<rand>/` (stale temp dirs from
   crashes are swept before a new attempt).
2. SHA-256 is computed over the temp file, then ffprobe extracts duration,
   codecs, width/height, fps, and audio channels (`src/media/probe.ts`).
3. The stored media type is resolved from the **real probe** and cross-checked
   against the source filename extension and any declared content type —
   obvious conflicts reject (`MEDIA_INGEST_MIME_PROBE_MISMATCH`,
   `MEDIA_INGEST_EXTENSION_PROBE_MISMATCH`).
4. Publish is atomic: verified temp bytes are renamed into
   `content/<ep>/media/assets/<slug>.<ext>`, the `ArtifactRef` is built from
   the final bytes, the hash is re-verified, the asset is registered in
   `source-manifest.json` via CAS, and the ref is recorded as a **candidate**
   in the episode `artifact-index.json` (selection stays M5.07).

A URL or metadata alone can never become a `MediaAsset` — registration asserts
the bytes (`ARTIFACT_HASH_MISMATCH` otherwise, per M5.01).

## Normalization

For videos (with `normalization.enabled`): a deterministic H.264 proxy is
derived — `libx264` + `yuv420p` + stable fps (nearest of 24/25/30/50/60,
fallback 30) + AAC 48 kHz stereo when the original has audio, MP4 + faststart.
The original is never overwritten; the proxy is a separate derived artifact
(`kind=proxy`, `mediaId=<slug>-proxy`) whose `derivedFromMediaRef` hash-binds
it to the original's `ArtifactRef`.

The proxy output is re-probed and must satisfy the contract
(`MEDIA_INGEST_PROXY_PROBE_FAILED` otherwise). Audio and image originals are
ingested safely without a proxy.

## Lineage

```text
normalized proxy (kind=proxy, derivedFromMediaRef=original ArtifactRef)
  → original MediaAsset (kind=original, artifactRef sha256-bound)
    → source-manifest entry (mediaSourceId, sourceUrl / local-approved)
      → admission HumanDecision (admissionDecisionRef)
      → rights HumanDecision (rightsDecisionRef)
```

All identities and paths stay inside `content/<episode>/media/`.

## Cache / resume

- New cache kind `media-normalize` (episode-scoped directory on top of the M4
  fine-grained cache).
- Key = SHA-256 of `{cacheSchemaVersion, implementationVersion, originalSha256,
normalization contract (codec/pixfmt/fps/audio), toolVersion, dependencyHashes}`.
- A hit is only honored after the source gate **and** original byte-integrity
  checks pass; corrupt entries degrade to a miss + rebuild; the cached payload
  is re-probed before publish.
- Idempotency: the same (source, mediaId, bytes) returns the already published
  hash-valid work without re-acquiring or re-normalizing; a crash between
  original and proxy publish resumes from the valid original.

## Observability

`content/<episode>/media/observability/media-events.jsonl`
(`media-event-v1`, hash-bound + idempotent) records:
`media.ingest.started / completed / failed`,
`media.normalize.started / completed / failed`, and
`media.cache.hit / miss`. Events carry only refs, hashes, sizes, and statuses —
never credentials, URLs with secrets, or media bodies. The cache store also
writes M4 `cache-event-v1` events to `cache-events.jsonl` in the same
directory when a cache is configured.

## Error codes

`MEDIA_INGEST_SOURCE_NOT_ADMITTED`, `MEDIA_INGEST_RIGHTS_NOT_APPROVED`,
`MEDIA_INGEST_EPISODE_MISMATCH`, `MEDIA_INGEST_SOURCE_UNKNOWN`,
`MEDIA_INGEST_MEDIA_ID_EPISODE_MISMATCH`, `MEDIA_INGEST_MEDIA_ID_INVALID`,
`MEDIA_INGEST_MEDIA_ID_CONFLICT`, `MEDIA_INGEST_URL_REQUIRED/INVALID`,
`MEDIA_INGEST_HTTPS_REQUIRED`, `MEDIA_INGEST_HOST_NOT_ALLOWED`,
`MEDIA_INGEST_LOCAL_FILE_REQUIRED/MISSING/NOT_A_FILE`,
`MEDIA_INGEST_DOWNLOAD_FAILED/REJECTED/PARTIAL/TOO_LARGE/EMPTY`,
`MEDIA_INGEST_CONTENT_TYPE_NOT_ALLOWED`, `MEDIA_INGEST_PROBE_FAILED`,
`MEDIA_INGEST_UNSUPPORTED_MEDIA`, `MEDIA_INGEST_MEDIA_TYPE_NOT_ALLOWED`,
`MEDIA_INGEST_MIME_PROBE_MISMATCH`, `MEDIA_INGEST_EXTENSION_PROBE_MISMATCH`,
`MEDIA_INGEST_ASSET_TAMPERED`, `MEDIA_INGEST_NORMALIZE_FAILED`,
`MEDIA_INGEST_PROXY_PROBE_FAILED`, `MEDIA_INGEST_PROXY_CONFLICT`,
`MEDIA_INGEST_NORMALIZE_NOT_APPLICABLE`, `MEDIA_INGEST_ACQUIRED_PATH_ESCAPES_TEMP`.

## Compatibility boundary

M5.01/M5.02 contracts are unchanged: `mediaAssetSchema` gained one optional
field (`derivedFromMediaRef` on proxies), `cacheKindSchema` gained one kind,
and `discovery.ts` gained a read-only `isMediaSourceRightsApproved` helper.
No ASR/transcript, scene detection, embeddings, VLM, Visual Director wiring,
or Remotion changes.

## Acceptance checklist

- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media src/lib/fine-grained-cache.ts tests/media-ingest.test.ts --max-warnings=0`
- [x] `pnpm exec vitest run tests/media-ingest.test.ts` (26 PASS)
- [x] `pnpm exec vitest run tests/media-discovery.test.ts tests/media-contract.test.ts`
- [x] `pnpm exec vitest run tests/orchestration` (193 PASS)
- [x] Full `pnpm test` regression
