# WP-M3-01 Production Adapters and WP-M3-02 Production Subgraph

WP-M3-01 adds a framework-neutral deterministic adapter layer for the existing
manual production commands. The adapter does not replace the scripts or move
artifact bodies into LangGraph state.

## Covered stages

The fixed order is:

```text
materialize:story
  -> validate:content
  -> capture
  -> tts
  -> timeline
  -> render:smoke
  -> render:vertical
  -> inspect:output
  -> validate:delivery
```

`src/orchestration/agents/adapters/deterministic-tool.ts` owns the stage
contract and invokes the existing `scripts/*.ts` implementation in an isolated
temporary workspace. A complete expected output set must exist before anything
is published to the repository. Publication copies each output through a
same-filesystem temporary file, writes the episode-local
`content/<episode>/artifact-index.json`, and verifies the canonical bytes again
before the stage is reported successful. When a changed output would replace a
selected-valid revision, the old bytes are first retained under the episode's
`.artifact-history/` path and the registry/dependency paths are migrated with
them. A multi-file publication failure rolls back both files and the registry.

Validation-only stages also publish a deterministic stage receipt under
`content/<episode>/production/adapter-receipts/`. Receipts are audit artifacts;
they do not infer a pass and are written only after the wrapped validator exits
successfully. Every returned output is an `ArtifactRef` with exact byte size,
SHA-256, revision, producer, and repository-relative path.

## Frozen input and resume rules

Every request carries a hash-bound `contentManifestRef`. The adapter reads and
schema-validates that manifest, verifies all manifest-selected bytes, and rejects
an input that is not in the frozen manifest or a previously published production
stage. It never resolves production inputs from mutable `artifactIndex.selected`
pointers.

`ProductionState.productionStages` stores only a controlled checkpoint summary:
stage/status, attempt, input-set SHA-256, output `ArtifactRef`s, decision, and a
bounded failure. If the input-set hash is unchanged and every cached output
still matches its recorded bytes, the stage returns `SKIPPED` without invoking
the script. A changed or missing hash reruns the stage. A failed stage returns a
stage-scoped error and the pipeline stops; no partial output is promoted.

The framework-neutral `runProductionPipeline()` runs the nine stages in order.
`createProductionStageNode()` returns a partial reference-only state update for
use by a LangGraph node. The existing sequential helper remains unchanged and
does not schedule a repair loop.

## WP-M3-02 production subgraph

`src/orchestration/graph/production-subgraph.ts` connects the same adapters to
the LangGraph compatibility layer. A frozen state runs this fixed path:

```text
content frozen
  -> materialize:story -> validate:content -> capture -> tts -> timeline
  -> render:smoke -> render:vertical -> inspect:output -> validate:delivery
  -> production-ready
```

When Delivery Critic returns `REJECT`, the delivery adapter writes a structured
issue artifact under
`content/<episode>/production/issues/`. LangGraph state receives only the issue
reference and bounded summary. The issue category and `returnTo` value are
mapped deterministically to the single `production-executor` owner:

| Delivery target          | Restart stage  | Downstream closure                                         |
| ------------------------ | -------------- | ---------------------------------------------------------- |
| `captions` or `timeline` | `timeline`     | timeline, smoke render, vertical render, inspect, delivery |
| `tts`                    | `tts`          | TTS, timeline, both renders, inspect, delivery             |
| `render`                 | `render:smoke` | both renders, inspect, delivery                            |

The repair route carries an allow-list of artifact IDs. Adapter output is
checked against that allow-list, and a changed artifact is propagated as stale
through the episode artifact registry before its replacement is selected.
Stages outside the closure are reused by checkpoint input-set hash and current
artifact bytes. The route's first stage is forced once so a valid old
checkpoint cannot suppress the requested repair; downstream stages still use
their valid checkpoints.

The repair loop has a bounded `maxRepairRounds` (default `2`, configurable on
`createProductionSubgraph`). A missing route, unauthorized artifact, failed
stage, or exhausted budget ends in `human-escalation`. A Delivery PASS resolves
open production issues and ends in `production-ready`. Resume is idempotent for
valid completed stages, including an already completed production-ready state.

## WP-M3-03 L4 unfreeze

When the bounded production repair budget is exhausted, the subgraph may create
`content/<episode>/production/unfreeze-requests/<request-id>.json`. The request
is hash-bound to the current content manifest and contains only blocker issue
summaries plus explicit frozen content `ArtifactRef`/owner/locator authorizations.
It is rejected when any trigger is non-blocker, `unfreezeUsed >= maxUnfreeze`,
the target is not in the manifest, the owner is `production-executor`, or the
requested restart is later than `materialize:story`.

The graph then pauses at `production_unfreeze_review` with a reference-only
interrupt payload. Resume input is normalized to the formal
`human-decision-v1` `unfreeze-approval` decision (the legacy
`approve`/`reject` payload remains accepted for checkpoint compatibility).
Approval writes both the formal decision audit artifact and the legacy request
decision needed by the editor, increments `approvalEpoch` and
`budget.unfreezeUsed`, and calls the explicitly configured content editor. A
formal direct edit may provide already-materialized human versions instead;
the same locked-range and stale-closure rules apply. The editor must return
only new hash-bound revisions for the approved artifact/owner pairs. The
configured content gate runner must return a passing gate plus validator and
critic artifact refs; otherwise the graph stops closed. Downstream registry
records are marked stale transitively, while old production files/checkpoints
remain available for audit or cache reuse. A successful gate writes a new
frozen manifest carrying the new approval epoch and resumes from
`materialize:story`.

No production adapter is allowed to edit story, fact, or content artifacts.
Formal final approval is documented below; publication, M4
persistence/cache/observability, and Goal 3.2 editorial policy or calibration
changes remain out of scope.

## WP-M3-04 Formal HumanDecision and final approval

`src/orchestration/schemas/human-decision.ts` defines the canonical
`HumanDecision` envelope. It accepts `approve`, `reject`, and `direct-edit`
for `content-approval`, `unfreeze-approval`, and `final-approval`. The
persisted decision contains only references and bounded metadata; its artifact
is registered in `artifact-index.json` and replaying the same `decisionId` is
idempotent.

`createFoundationGraph({repoRoot})` enables the formal content and final
interrupt handlers. Content approval freezes the explicit refs and produces a
current-epoch `productionAuthorization`; `assertProductionStart(state,
{requireFormalApproval: true})` rejects missing or stale authorization. Final
approval ends in the internal `published` state with an explicit
`no external publication performed` marker. It does not call upload, network,
or platform-publish code.

Rejects are stored as structured Issue artifacts and routed through the
ownership table. Direct edits use a new hash-bound artifact revision, record
human provenance, stale dependent selections transitively, and add locked
ranges. Content-loop callers inherit `ProductionState.lockedRanges` when no
override is supplied, so an automated revision that overlaps a lock fails
closed. State/checkpoint values continue to carry refs and controlled
summaries only.

Example shape:

```ts
const result = await runProductionSubgraph({
  repoRoot,
  state: frozenState,
  checkpointer,
});

if (result.phase !== "production_ready") {
  throw new Error(`production stopped at ${result.phase}`);
}
```

The default `ORCHESTRATOR=manual` path and all existing `pnpm` production
commands remain unchanged. The adapter layer is opt-in from orchestration code.
