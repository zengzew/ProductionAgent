# Routing Policy

- Status: normative engineering contract
- Policy version: `routing-policy-v1`

## Principle

Routing is a pure function over structured issue fields, artifact provenance, revision budget, and a
fixed table. The critic's prose, chain of thought, model confidence, or suggested correction MUST NOT
select the next agent.

```text
route = f(category, severity, affectedArtifact, critic, round, budgetRemaining)
```

If the submitted `ownerAgent`, `routeTarget`, or `primaryRoute` differs from this function, the critic
output is invalid and follows operational failure handling. It does not start a creative revision.

## Category routing table

| Category                        | Owner agent           | Route target       | Restart at             |
| ------------------------------- | --------------------- | ------------------ | ---------------------- |
| `contract.invalid-output`       | producing agent       | producing agent    | same stage             |
| `contract.stale-input`          | producing agent       | producing agent    | after inputs are valid |
| `research.evidence-gap`         | `research-analyst`    | `research-analyst` | `research-analyst`     |
| `research.source-conflict`      | `research-analyst`    | `research-analyst` | `research-analyst`     |
| `research.claim-ledger-error`   | `research-analyst`    | `research-analyst` | `research-analyst`     |
| `story.core-question`           | `story-director`      | `story-director`   | `story-director`       |
| `story.unsupported-premise`     | `story-director`      | `story-director`   | `story-director`       |
| `story.structure`               | `story-director`      | `story-director`   | `story-director`       |
| `story.information-progression` | `story-director`      | `story-director`   | `story-director`       |
| `story.ending-payoff`           | `story-director`      | `story-director`   | `story-director`       |
| `attention.hook`                | `viral-director`      | `viral-director`   | `viral-director`       |
| `attention.curiosity-gap`       | `viral-director`      | `viral-director`   | `viral-director`       |
| `attention.reveal-order`        | `viral-director`      | `viral-director`   | `viral-director`       |
| `attention.emotional-tension`   | `viral-director`      | `viral-director`   | `viral-director`       |
| `script.information-selection`  | `script-writer`       | `script-writer`    | `script-writer`        |
| `script.claim-binding`          | `script-writer`       | `script-writer`    | `script-writer`        |
| `script.fact-accuracy`          | `script-writer`       | `script-writer`    | `script-writer`        |
| `script.repetition`             | `script-writer`       | `script-writer`    | `script-writer`        |
| `oral.naturalness`              | `oral-rewriter`       | `oral-rewriter`    | `oral-rewriter`        |
| `oral.spoken-delivery`          | `oral-rewriter`       | `oral-rewriter`    | `oral-rewriter`        |
| `oral.information-fidelity`     | `oral-rewriter`       | `oral-rewriter`    | `oral-rewriter`        |
| `visual.evidence`               | `visual-director`     | `visual-director`  | `visual-director`      |
| `visual.asset-rights`           | `visual-director`     | `visual-director`  | `visual-director`      |
| `visual.readability`            | `visual-director`     | `visual-director`  | `visual-director`      |
| `visual.pacing`                 | `visual-director`     | `visual-director`  | `visual-director`      |
| `visual.safe-area`              | `visual-director`     | `visual-director`  | `visual-director`      |
| `retention.first-3-seconds`     | `viral-director`      | `viral-director`   | `viral-director`       |
| `retention.first-30-seconds`    | `viral-director`      | `viral-director`   | `viral-director`       |
| `retention.mid-video`           | `script-writer`       | `script-writer`    | `script-writer`        |
| `retention.ending`              | `viral-director`      | `viral-director`   | `viral-director`       |
| `delivery.caption-split`        | `production-executor` | `captions`         | `captions`             |
| `delivery.caption-timing`       | `production-executor` | `timeline`         | `timeline`             |
| `delivery.audio`                | `production-executor` | `tts`              | `tts`                  |
| `delivery.timeline`             | `production-executor` | `timeline`         | `timeline`             |
| `delivery.duration-audio`       | `production-executor` | `tts`              | `tts`                  |
| `delivery.duration-timeline`    | `production-executor` | `timeline`         | `timeline`             |
| `delivery.duration-render`      | `production-executor` | `render`           | `render`               |
| `delivery.format`               | `production-executor` | `render`           | `render`               |
| `delivery.render`               | `production-executor` | `render`           | `render`               |
| `delivery.evidence-readability` | `production-executor` | `render`           | `render`               |
| `delivery.asset-manifest`       | `production-executor` | `render`           | `render`               |

`producing agent` is resolved from the selected artifact registry. If producer provenance is absent,
the result is `UNROUTABLE` and escalates to a human; the runner must not guess from a filename.

## Root-cause categorization

Critics MUST use the category of the artifact correction, not merely the symptom location.

Examples:

| Observation                                                              | Category                      | Route            |
| ------------------------------------------------------------------------ | ----------------------------- | ---------------- |
| A Claim has no usable source or the ledger contradicts the source.       | `research.evidence-gap` or    | Research Analyst |
|                                                                          | `research.claim-ledger-error` |                  |
| The approved story question depends on an unsupported causal premise.    | `story.unsupported-premise`   | Story Director   |
| The draft converts message count to user count.                          | `script.fact-accuracy`        | Script Writer    |
| The draft is accurate but the spoken rewrite changes the metric meaning. | `oral.information-fidelity`   | Oral Rewriter    |
| The hook reveals the answer before establishing the curiosity gap.       | `attention.reveal-order`      | Viral Director   |
| Mid-video risk comes from unreadable evidence rather than repeated copy. | `visual.readability`          | Visual Director  |
| A Chinese word is split across two SRT cues.                             | `delivery.caption-split`      | Captions stage   |

Fact Guardian therefore routes by defect provenance using the same controlled categories. It does
not use a generic “fact issue” route. Provenance is established by comparing current research,
`script-draft.md`, and `final-script.md`:

```text
ledger/source defect                    -> research.*
unsupported Director premise            -> story.unsupported-premise
defect already present in script draft  -> script.claim-binding or script.fact-accuracy
draft correct, final rewrite changed it -> oral.information-fidelity
```

If the comparison cannot establish provenance, the issue is not safely routable and requires human
triage. The model may not choose the most convenient owner.

Duration failures are categorized from measured artifacts, not model judgment:

```text
measured TTS/audio duration reaches the hard maximum   -> delivery.duration-audio
audio is below the maximum but timeline reaches it     -> delivery.duration-timeline
timeline is below the maximum but final MP4 reaches it -> delivery.duration-render
resolution/frame rate/orientation/container is wrong   -> delivery.format
```

## Critic category permissions

| Critic           | Allowed correction categories                                                              |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Oral Judge       | `oral.*`, `script.information-selection`, `script.fact-accuracy`, `contract.*`             |
| Audience Critic  | `story.*`, `attention.*`, `script.*`, `oral.*`, `contract.*`                               |
| Fact Guardian    | `research.*`, `story.unsupported-premise`, `script.claim-binding`, `script.fact-accuracy`, |
|                  | `oral.information-fidelity`, `contract.*`                                                  |
| Retention Critic | `story.*`, `attention.*`, `script.*`, `oral.spoken-delivery`, `visual.*`, `retention.*`,   |
|                  | `contract.*`                                                                               |
| Delivery Critic  | `delivery.*`, `contract.*`                                                                 |

An issue outside the critic's allowed set is invalid output.

## Primary route selection

A report may contain multiple issues, but the workflow has exactly one primary restart boundary.
Selection is deterministic:

1. Remove `info`, `resolved`, and valid human-waived issues.
2. If the revision budget is exhausted, route all remaining issues to `human-editor`.
3. Separate operational `contract.*` failures. Recover these before any creative route.
4. Map every remaining category through the table.
5. Choose the earliest `restartAt` in this fixed order:

   ```text
   research-analyst < story-director < viral-director < script-writer < oral-rewriter
   < visual-director < captions < tts < timeline < render
   ```

6. Batch all issues with that same owner and restart boundary in `primaryRoute.issueIds`.
7. Select `reasonCode` from that batch by severity (`blocker`, `high`, `medium`, `low`), then category
   lexicographic order, then issue ID lexicographic order.
8. Do not dispatch later owners. The earlier fix invalidates their inputs; the critic will reassess
   remaining issues against regenerated artifacts.

The fixed order is dependency order, not business priority. TTS precedes timeline because timeline
depends on measured audio; captions precede both when text segmentation must change.

## Restart closures

After the owner publishes a valid correction, these stages must rerun:

| Restart at       | Required closure                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Research Analyst | Story Director through Retention Critic; then all production artifacts and Delivery Critic   |
| Story Director   | Viral Director through Retention Critic; then production and Delivery Critic                 |
| Viral Director   | Script Writer through Retention Critic; then production and Delivery Critic                  |
| Script Writer    | Oral Rewriter, Oral Judge, Audience, Fact, Visual, Retention; then production and Delivery   |
| Oral Rewriter    | Oral Judge, Audience, Fact, Visual, Retention; then production and Delivery                  |
| Visual Director  | Retention Critic; affected render/materialization and Delivery Critic                        |
| Captions         | Caption materialization, timeline if cue timing changes, render, inspection, Delivery Critic |
| TTS              | TTS metadata/audio, timeline, captions alignment, render, inspection, Delivery Critic        |
| Timeline         | Timeline, captions materialization, render, inspection, Delivery Critic                      |
| Render           | Vertical render, inspection, Delivery Critic                                                 |

The exact stale set is calculated from artifact hashes as specified in
[artifact-contract.md](./artifact-contract.md). The table is the minimum closure, not permission to
keep a hash-mismatched descendant.

## Legacy `returnTo` mapping

Current gate enums remain supported while `primaryRoute` is introduced.

| New deterministic target                  | Legacy field                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Any target already permitted by that gate | Same value                                                                   |
| Audience Critic `viral-director`          | `story-director` in `product-story-v4`; `primaryRoute` remains Viral         |
| Delivery issue                            | Existing `captions`, `timeline`, `tts`, or `render` stage                    |
| Operational `contract.*` failure          | No domain report is accepted; retry same critic outside legacy `returnTo`    |
| Exhausted budget                          | `human-editor` where supported; otherwise workflow status carries escalation |

The Audience compatibility mapping is intentionally explicit: the current `criticGateSchema`
cannot represent `viral-director` as top-level `returnTo`, although viewer-risk entries can. A future
rubric/parser revision removes this exception. New orchestration MUST use `primaryRoute`; legacy
validators may continue reading the mapped field.

## Human escalation

Routing becomes `human-editor` when any of these is true:

- the applicable creative revision budget is exhausted;
- Oral Judge rejects round 3;
- issue provenance is unknown or produces no table entry;
- two required constraints conflict and no artifact establishes priority;
- the same oscillation signature reaches the threshold in [revision-policy.md](./revision-policy.md);
- a rights or source decision requires authority absent from repository artifacts.

Human escalation is a terminal workflow state for automated revision. It does not grant the runner
permission to edit, waive, publish, or continue production.

## Routing validation examples

```json
{
  "category": "attention.hook",
  "severity": "high",
  "ownerAgent": "viral-director",
  "routeTarget": "viral-director",
  "affectedArtifact": {"path": "content/episode-002/story/viral-strategy.md"}
}
```

```json
{
  "category": "delivery.caption-split",
  "severity": "blocker",
  "ownerAgent": "production-executor",
  "routeTarget": "captions",
  "affectedArtifact": {"path": "output/episode-002/subtitles_zh.srt"}
}
```

The first route restarts Viral Director and invalidates Script Writer onward. The second reruns the
caption stage and its production descendants. Neither route is inferred from the correction prose.
