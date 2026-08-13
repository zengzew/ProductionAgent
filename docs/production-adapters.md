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

This scope deliberately does not add `HumanDecision`, unfreeze, final approval,
publication, M4 persistence/cache/observability, or any Goal 3.2 editorial
policy or calibration changes.

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
