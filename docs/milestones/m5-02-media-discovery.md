# WP-M5-02 — Media Discovery + Source Admission

- Status: implemented
- Parent: `docs/milestones/m5-real-media-plan.md`
- Code: `src/media/discovery.ts`, `src/media/discovery-config.ts`,
  `config/media-discovery.json`
- Schemas: `src/media/schemas.ts` (optional decision refs on `MediaSource`),
  `src/orchestration/schemas/human-decision.ts` (two new gates)
- Tests: `tests/media-discovery.test.ts`

## Scope

M5.02 makes media source discovery **bounded, auditable, and fail-closed**. A
URL is only a candidate locator: `proposeMediaSource` never downloads bytes and
never creates a `MediaAsset`. A source may become `admitted` or
`rightsStatus=approved` only through a persisted, hash-bound `HumanDecision`.
There is no unrestricted crawler, no automatic admission, and no change to
Remotion or the manual pipeline.

## Discovery config (allowlist)

`config/media-discovery.json` (`media-discovery-config-v1`):

```json
{
  "schemaVersion": "media-discovery-config-v1",
  "allowedHosts": ["example.com", "www.example.com", "cdn.example.com"],
  "allowedSourceTypes": [
    "official",
    "founder",
    "product-demo",
    "media",
    "platform",
    "analysis",
    "social",
    "local-approved"
  ],
  "maxCandidatesPerEpisode": 50,
  "requireHttps": true
}
```

- `allowedHosts` are exact hostnames only (no scheme, path, port, or
  wildcard). Matching is against the normalized `URL.hostname`, so
  `example.com` never matches `fooexample.com` or `example.com.evil.net`.
- `allowedSourceTypes` uses the existing `mediaSourceTypeSchema` values.
- `maxCandidatesPerEpisode` is a positive integer; an episode over the limit
  fails closed with `MEDIA_DISCOVERY_CANDIDATE_LIMIT`.
- `requireHttps` must be `true` (`z.literal(true)`); `false` is rejected.
- The config is parsed at module load (`parseMediaDiscoveryConfig`); a missing
  or invalid file **throws** — there is no silent allow-all default.

## Candidate proposal (`proposeMediaSource`)

Rules:

1. Episode isolation: `sourceId` must be `episode-<id>:media-source:<slug>`.
2. `local-approved` sources use an empty `sourceUrl`; all other types require a
   valid `https:` URL whose hostname is in `allowedHosts`.
3. `http`, off-allowlist hosts, and unknown/not-allowed source types fail with
   explicit error codes (below).
4. New sources always enter the manifest as `admissionStatus=pending` with
   `rightsStatus=review-required` (or `unknown`) — never pre-approved.
5. Written through `registerMediaSource` + `writeMediaSourceManifestCas`
   (optimistic CAS; `expectedManifestVersion` defaults to the current version).
6. Same `sourceId` + identical content is idempotent; different content under
   the same id fails closed (`MEDIA_SOURCE_ID_CONFLICT`).
7. No `MediaAsset` is created and nothing is written under `media/assets/`.

## HumanDecision gates

Two gates were added to `humanDecisionGates`:

- `media-admission` — admit or reject a candidate source.
- `media-rights` — approve or reject usage rights for a source.

Both entry points (`applyMediaSourceAdmission`, `applyMediaSourceRights`):

1. Require the matching gate (`MEDIA_DISCOVERY_GATE_MISMATCH` otherwise) and a
   real `approve`/`reject` (`direct-edit` is rejected).
2. Persist the decision through `persistHumanDecision` (idempotent, hash-bound
   `ArtifactRef`) before the manifest is touched.
3. Reject decisions require a structured `issue`
   (`HUMAN_DECISION_REJECT_ISSUE_REQUIRED`).
4. All `artifactRefs` must belong to the episode
   (`MEDIA_DISCOVERY_DECISION_EPISODE_MISMATCH`) and must anchor to the exact
   source-manifest bytes the reviewer approved
   (`MEDIA_DISCOVERY_DECISION_REF_NOT_RELATED` /
   `MEDIA_DISCOVERY_DECISION_REF_STALE`). The source-manifest is the control
   ledger for sources in M5.02; per-source control refs arrive with M5.03
   ingest.
5. The resulting `decisionRef` is stored on the source in the new optional
   fields `admissionDecisionRef` / `rightsDecisionRef` — the `HumanDecision`
   body itself is never embedded in the manifest.
6. A source with an existing decision ref cannot be re-decided by a different
   decision (`MEDIA_DISCOVERY_ADMISSION_DECISION_CONFLICT` /
   `MEDIA_DISCOVERY_RIGHTS_DECISION_CONFLICT`).
7. Manifest writes use CAS; stale writes fail with
   `MEDIA_SOURCE_MANIFEST_CAS_CONFLICT`.

Approving rights does not change admission, and approving admission never
silently approves rights. `isMediaSourceAdmitted` requires both
`admissionStatus=admitted` and a persisted `admissionDecisionRef`, so a source
flipped by the raw manifest primitive is not considered admitted.

## Queries

- `listDiscoveredSources(manifest)` — all candidate sources in manifest order.
- `getMediaSource(manifest, sourceId)` — one source or `undefined`.
- `isMediaSourceAdmitted(source)` — `admitted` **and** has
  `admissionDecisionRef`.

M5.02 does not call `assertMediaAssetRenderable`: there are no assets yet.

## Error codes

| Code                                                                                       | Meaning                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `MEDIA_DISCOVERY_SOURCE_ID_INVALID`                                                        | sourceId is not a media-source identity             |
| `MEDIA_DISCOVERY_EPISODE_MISMATCH`                                                         | sourceId or decision refs belong to another episode |
| `MEDIA_DISCOVERY_SOURCE_TYPE_NOT_ALLOWED`                                                  | unknown or not-allowlisted sourceType               |
| `MEDIA_DISCOVERY_URL_REQUIRED` / `MEDIA_DISCOVERY_URL_INVALID`                             | missing or malformed URL                            |
| `MEDIA_DISCOVERY_HTTPS_REQUIRED`                                                           | non-https URL (e.g. `http:`)                        |
| `MEDIA_DISCOVERY_HOST_NOT_ALLOWED`                                                         | hostname not in the allowlist (exact match)         |
| `MEDIA_DISCOVERY_LOCAL_SOURCE_URL_INVALID`                                                 | local-approved source with a non-empty URL          |
| `MEDIA_DISCOVERY_RIGHTS_STATE_INVALID`                                                     | new candidate with approved/rejected rights         |
| `MEDIA_DISCOVERY_CANDIDATE_LIMIT`                                                          | episode already has maxCandidatesPerEpisode         |
| `MEDIA_DISCOVERY_GATE_MISMATCH`                                                            | decision gate is not media-admission/media-rights   |
| `MEDIA_DISCOVERY_DECISION_KIND_INVALID`                                                    | direct-edit decision on a media gate                |
| `MEDIA_DISCOVERY_DECISION_EPISODE_MISMATCH`                                                | decision refs cross episodes                        |
| `MEDIA_DISCOVERY_DECISION_REF_NOT_RELATED`                                                 | no ref points at the episode source-manifest        |
| `MEDIA_DISCOVERY_DECISION_REF_STALE`                                                       | decision anchors an older manifest version          |
| `MEDIA_DISCOVERY_ADMISSION_DECISION_CONFLICT` / `MEDIA_DISCOVERY_RIGHTS_DECISION_CONFLICT` | re-deciding with a different decision               |
| `HUMAN_DECISION_REJECT_ISSUE_REQUIRED`                                                     | reject without a structured issue                   |
| `MEDIA_SOURCE_MANIFEST_CAS_CONFLICT`                                                       | stale source-manifest version                       |

## Compatibility boundary

M5.02 keeps the M5.01 contract intact: `MediaSource` gained only the two
optional decision-ref fields, `setMediaSourceAdmission` semantics are reused,
and the manual pipeline / Remotion / episode source bytes are untouched. The
graph wiring (Visual Director real-media-first selection) remains M5.07.

## Acceptance checklist

- [x] `pnpm typecheck`
- [x] `pnpm exec eslint src/media src/orchestration/schemas/human-decision.ts tests/media-discovery.test.ts --max-warnings=0`
- [x] `pnpm exec vitest run tests/media-discovery.test.ts tests/media-contract.test.ts tests/orchestration/hitl.test.ts`
- [x] No download / VLM / episode-source changes / manual-pipeline changes
