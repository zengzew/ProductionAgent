# Artifact Contract

- Status: normative engineering contract
- Contract set: `engineering-contracts-v1`

## Principle

Artifact files are the single source of truth. Future orchestration state, checkpoints, prompts,
logs, and messages may contain only artifact references and controlled summaries. They MUST NOT
contain a full research package, script, report, media transcript, or other artifact copy.

## Artifact identity and reference

A logical artifact has a stable `artifactId`; each byte-level revision has a unique SHA-256.

```ts
type ArtifactRef = {
  artifactId: string;
  episodeId: string;
  path: string; // repository-relative, never absolute
  mediaType: string;
  schemaVersion: string;
  revision: number; // monotonic for this artifactId
  sha256: string; // lowercase SHA-256 of exact file bytes
  sizeBytes: number;
  producer: string;
  createdAt: string; // RFC 3339 UTC
  legacyProvenance?: {
    packageId: string;
    packageName: string;
    packageVersion: string;
    canonicalSourcePath: string;
    canonicalRelativePath: string;
    aliases: string[];
  };
};
```

`legacyProvenance` is only present on references synthesized by the read-only legacy backfill. Its
canonical source and repository-relative path are provenance, not a second identity. Alias or
symlink paths may locate the package but MUST NOT be stored as `path` or used to derive `artifactId`.

Normative rules:

- `artifactId` is `<episode-id>:<area>:<logical-name>`, for example
  `episode-002:story:final-script`.
- `path` MUST stay inside the repository and MUST use `/` separators.
- `revision` increases only when bytes change. A rerun that produces the same SHA-256 records a new
  execution attempt but not a new artifact revision.
- `schemaVersion` describes the artifact's parse contract, not its editorial revision.
- SHA-256 is computed over exact file bytes. No newline, JSON, Markdown, or Unicode normalization is
  allowed before hashing.
- Artifact references MUST include the hash. A path without a hash is a mutable lookup, not a valid
  handoff.
- Timestamps and model metadata do not establish identity and MUST NOT be used for cache validity.

## Current canonical paths

The contract preserves the current layout:

| Area       | Canonical artifacts                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Episode    | `content/<episode>/episode.config.json`                                                             |
| Research   | `research/facts.json`, `sources.json`, `timeline.json`, `technology.md`, `growth-data.md`           |
| Direction  | `story/director-brief.md`, `story-bible.md`, `story-angle.md`, `three-act-structure.md`             |
| Attention  | `story/hook-candidates.md`, `story/viral-strategy.md`                                               |
| Script     | `story/script-draft.md`, `story/final-script.md`, `story/script.json`, `story/narration.txt`        |
| Reviews    | `story/oral-review.md`, `critic-report.md`, `fact-check-report.md`, `retention-report.md`           |
| Visual     | `story/visual-plan.md`, `story/caption-plan.json`, `production/asset-manifest.json`                 |
| Production | `production/tts-metadata.json`, `production/timeline.json`, `production/captions.generated.json`    |
| Delivery   | `output/<episode>/vertical_9x16.mp4`, `subtitles_zh.srt`, `inspection.json`, delivery critic report |
| Control    | `story/workflow.json`                                                                               |

Generated files are artifacts too. Their producer is the project command and their dependencies MUST
be recorded exactly like model-authored artifacts.

## Version registry

A future implementation MUST maintain one episode-local artifact registry. The reserved path is:

```text
content/<episode>/artifact-index.json
```

Until that file is implemented, the compatibility adapter MAY synthesize references from the current
filesystem and embedded gate hashes, but it MUST label their provenance `legacy-derived` and MUST NOT
invent historical revisions.

The registry schema is:

```ts
type ArtifactIndex = {
  schemaVersion: "artifact-index-v1";
  episodeId: string;
  artifacts: Array<{
    ref: ArtifactRef;
    state: "candidate" | "selected" | "stale" | "quarantined" | "superseded";
    producedByExecutionId: string;
    dependencies: Array<{
      artifactId: string;
      path: string;
      sha256: string;
      relation: "reads" | "reviews" | "materializes" | "renders";
    }>;
    supersedes?: {artifactId: string; revision: number; sha256: string};
  }>;
  selected: Record<string, {revision: number; sha256: string; path: string}>;
};
```

The registry stores references and dependency edges only. It MUST NOT store artifact bodies. The
registry itself is a control artifact and is checkpointed with the workflow; it does not list its own
hash inside itself.

## Publication protocol

Artifact writes are transactional:

1. Write a candidate to a same-filesystem temporary path.
2. Parse and schema-validate the candidate.
3. Compute byte size and SHA-256.
4. Confirm every declared input still has the requested hash.
5. Record the candidate revision and dependency edges.
6. Promote it atomically to the canonical path only when the owning stage accepts it.
7. Update workflow and selected pointer in one checkpoint transaction.
8. Append observability events after the checkpoint succeeds.

If steps 2 through 5 fail, the file is quarantined and MUST NOT replace the canonical artifact. If
step 7 fails, recovery uses the previous checkpoint and canonical selection; logs never repair state.

Current direct file writers remain compatible, but a future runner MUST snapshot the previous bytes
before overwrite so revision and best-version policies can be enforced.

## Dependency validity

An artifact is `selected-valid` only when all of these are true:

1. The file exists at its registered path.
2. Its current byte hash equals the selected reference.
3. Its schema version is supported and validation passes.
4. Every dependency path exists and its current hash equals the recorded dependency hash.
5. No upstream dependency is stale, quarantined, or missing.
6. Any required gate verdict is compatible with its issues and scores.

Changing mtime, rerunning an agent, or changing chat state does not invalidate an artifact. Changing
any dependency bytes does. If an upstream artifact later returns to the exact recorded SHA-256, the
dependent artifact MAY become valid again after schema and gate validation; no model rerun is needed.

## Invalidation algorithm

Invalidation is deterministic and transitive:

```text
changed = artifact whose current sha256 != selected sha256
stale = changed plus every descendant in the dependency graph
next runnable stage = earliest owner among stale required artifacts
```

The runner MUST calculate the full stale set before scheduling work. It MUST NOT mark only the first
direct consumer stale.

### Required restart boundaries

| Changed artifact class             | First invalid stage and required descendants                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Research facts/sources/timeline    | Story Director; all later story and production artifacts                           |
| Director Brief/story structure     | Viral Director; Script Writer onward                                               |
| Hook candidates/viral strategy     | Script Writer; all later script, review, visual, and production artifacts          |
| Script draft                       | Oral Rewriter; Oral Judge onward                                                   |
| Final script                       | Oral Judge, Audience Critic, Fact Guardian, Visual Director, Retention, production |
| Oral review                        | Audience Critic onward                                                             |
| Audience report                    | Fact Guardian onward                                                               |
| Fact report                        | Visual Director onward                                                             |
| Visual plan                        | Retention Critic and visual production artifacts                                   |
| Caption plan                       | Materialized captions, timeline, render, Delivery Critic                           |
| TTS config/audio/metadata          | Timeline, render, inspection, Delivery Critic                                      |
| Timeline                           | Render, inspection, Delivery Critic                                                |
| Asset manifest or used asset bytes | Render, inspection, Delivery Critic                                                |
| Final MP4, SRT, or inspection      | Delivery Critic only                                                               |
| Rubric or critic prompt            | That critic report and every approval depending on it                              |

Changing a prose-only human projection inside a critic report changes the report hash and therefore
invalidates consumers of that report. This is intentional: the machine gate and its explanation are
one auditable artifact.

## Hash binding in Markdown artifacts

Current Markdown artifacts contain a leading JSON gate. The gate MUST list hashes of reviewed inputs,
but MUST NOT include the report's own hash. The workflow or artifact index records the report hash.
This avoids self-referential hashing.

The machine gate is authoritative for:

- reviewed artifact identities and hashes;
- rubric version;
- scores and issues;
- verdict and deterministic route.

The remaining Markdown body is the human-readable projection. A conflict between the body and gate
is an invalid output, not a reason to infer a corrected verdict.

## Schema and prompt versioning

Versions are immutable identifiers:

- `schemaVersion` changes for a breaking parse or meaning change.
- `rubricVersion` changes when scoring anchors, weights, thresholds, or blockers change.
- `promptVersion` changes whenever role instructions that can affect output change.
- Stable wording or typo changes that cannot alter parse or decision may retain a version, but the
  prompt artifact hash still changes and is recorded.

An execution MUST record all three where applicable. Results from different rubric versions MUST NOT
be compared for regression or best-version selection without an explicit migration function.

## Controlled summaries

An orchestrator MAY keep a controlled summary with at most:

- artifact ID, path, hash, revision, schema version, and state;
- gate verdict, total score, blocker count, open issue IDs, and primary route;
- segment or Claim IDs needed for scheduling;
- a decision reason no longer than 500 UTF-8 bytes.

It MUST NOT keep narration, source passages, the Claim Ledger, full issue evidence, captions, or media
transcripts in state. Consumers load the canonical artifact after verifying its reference.

## Deletion and retention

- Selected, best, rejected, and evidence-bearing revisions MUST be retained through episode delivery
  approval and any configured audit window.
- Quarantined invalid output MAY be deleted after its failure metadata and hash are retained.
- No automated retry may overwrite the last selected-valid or best revision.
- Media cleanup is a separate explicit operation and MUST NOT be inferred from orchestration success.

Best-version and revision retention details are defined in
[revision-policy.md](./revision-policy.md).
