# WP-M5-01 — Media Artifact + Provenance Contract

- Status: implemented, pending M5.01 review
- Parent: `docs/m5-real-media-plan.md`
- Code: `src/media/`
- Tests: `tests/media-contract.test.ts`

## Scope

M5.01 establishes the data model and persistence boundary for real media. It
does not download, transcode, index, verify with a VLM, or render media.

## Identity rules

All media identities are episode-scoped and slug-validated:

```text
sourceId          episode-<id>:media-source:<slug>
mediaId           episode-<id>:media:<slug>
clipId            episode-<id>:media-clip:<slug>
verificationId    episode-<id>:media-verification:<slug>
decisionId        episode-<id>:media-usage-decision:<slug>
```

A slug is non-empty and matches `[a-z0-9]([a-z0-9._-]*[a-z0-9])?`.

`URL != Media Artifact`. A URL is only a candidate locator. Only acquired bytes
with an exact `ArtifactRef` (`sha256`, `sizeBytes`, repository-relative path,
producer, revision) may enter the media manifest.

## Schemas

- `MediaSource`: source URL/publisher/type, admission state, admission and
  rights decisions, access timestamp.
- `MediaAsset`: acquired byte identity (`mediaType`, `sha256`, `sizeBytes`,
  probe summary fields), provenance copied from its admitted source, rights
  status, and a hash-bound `artifactRef`.
- `MediaClipRef`: source media ref + `startMs`/`endMs`, claim IDs, visual
  intent, optional transcript refs and verification ref.
- `MediaVerification`: structured multimodal verdict and scores, observed
  actions/entities, recommended clip window, model/provider/prompt/tool
  versions, and a persisted `artifactRef`.
- `MediaUsageDecision`: deterministic `use-real` / `fallback` / `reject`
  decision with the four required gates (`sourceAdmitted`,
  `rightsApproved`, `hashValid`, `verificationPassed`).

`source-manifest.json` (`media-source-manifest-v1`) persists sources and assets
under `content/<episode>/media/`.

## Fail-closed rules

`assertMediaAssetRenderable` allows render only when all of the following are
true:

1. the exact asset record is present in `source-manifest.json`;
2. its source is `admitted`;
3. source and asset rights are both `approved`;
4. current bytes still match `artifactRef.sha256` and `sizeBytes`;
5. by default, the media `ArtifactRef` is selected in the episode
   `artifact-index.json`.

`unknown`, `review-required`, and `rejected` rights never render.

## Registry integration

`buildMediaArtifactRef` creates a `media-asset-v1` `ArtifactRef` under
`content/<episode>/media/assets/<filename>`. Registration is idempotent for
identical bytes/identity and fails on ID conflict or hash mismatch. The source
manifest is written atomically and supports optimistic CAS writes.

## Tests

`tests/media-contract.test.ts` covers:

- episode isolation in every media schema;
- URL-without-bytes cannot become a media asset;
- idempotent manifest registration and persistence;
- unknown/review-required/rejected rights fail closed for asset and source;
- tampered bytes fail closed;
- unselected `ArtifactRef` cannot render by default;
- cross-episode registration rejection;
- source manifest CAS conflict handling;
- clip, verification, and use-real decision schema gates.

## Compatibility boundary

Existing `content/<episode>/production/asset-manifest.json` entries are the
current screenshot/generated-asset ledger. M5.01 does not migrate, rewrite, or
stop validating those files. A later WP will make the render-time manifest a
projection of admitted sources, ingested assets, verified clips, and usage
decisions; until then both systems are independent and the manual pipeline is
unchanged.

## M5.01 acceptance checklist

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm exec vitest run tests/media-contract.test.ts`
- [x] Human review of schema names, rights semantics, and Artifact Registry
      integration before M5.02 starts (accepted as the prerequisite gate by
      WP-M5.02; M5.01 behavior is unchanged)
