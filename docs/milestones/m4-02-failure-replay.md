# WP-M4-02 failure injection and replay

WP-M4-02 adds the fail-closed recovery boundary around the M1–M3 graph, the
WP-M4-01 versioned checkpoint saver, M3 production adapters, HumanDecision
artifacts, and the append-only execution log. It does not add caching,
observability completeness/report generation, legacy backfill, or concurrency.

## Recovery contracts

- `boundedRetryPolicySchema` requires a positive total-attempt limit, caps
  delay at 60 seconds, and gives contract repair its own explicit maximum.
  Authentication, stale-input, and invalid-output failures never become
  unbounded ordinary retries.
- `createFakeClock` records delays and advances logical time without sleeping.
  `DeterministicFailureInjector` provides call-counted provider, stage,
  contract, artifact, checkpoint-before/after, and event-log failures.
- `VersionedCheckpointSaver` persists `productionStateSha256` beside the
  version metadata. `restoreVerifiedCheckpoint` requires that hash and rejects
  a changed reference-only state. Legacy checkpoint reads remain compatible,
  but a strict replay cannot resume a checkpoint without the control hash.
- `restoreVerifiedReplayState` restores the persisted checkpoint first, then
  verifies the current bytes and selected registry version for every explicit
  artifact ref, verifies the event-log digest and lifecycle order, and checks
  that the checkpoint event summaries exist in the verified log. Missing,
  reordered, or tampered inputs stop recovery before a caller can resume a
  graph.
- HumanDecision replay reads the immutable decision artifact and compares the
  complete normalized envelope. A duplicate `decisionId` with a different
  payload is a conflict. Content and final approval also verify current
  artifact bytes before persisting or accepting an approval.
- Production stage retries are total-attempt bounded. Failed attempts publish
  no partial output refs; valid stage checkpoints remain reusable only when
  their input/output bytes and registered selected versions still match.

LangGraph state remains reference-only. Failure details, summaries, hashes,
budgets, approval epochs, issue refs, revision refs, and production-stage
checkpoints are persisted as bounded control data; artifact bodies stay in
files addressed by `ArtifactRef`.

## Verification matrix

`tests/orchestration/failure-suite.test.ts` covers `FAILURE-001..012`, plus
artifact/stale-registry, duplicate HumanDecision, revision-budget, and stage
contract guards. `tests/orchestration/replay.test.ts` covers deterministic
recorded replay, checkpoint resume without duplicate valid work, event-log
rebuild and integrity failures, differing live sample text with deterministic
routing, artifact tampering, and final-approval tamper rejection.

The tests use fixed IDs/timestamps, deterministic agent/provider/stage stubs,
temporary isolated repositories, and fake clocks. They do not make network
requests or wait for real retry delays. A tampered log or artifact can only
produce a failed recovery; it cannot produce approval, `production_ready`,
published, or final approval state.

Run the focused suite with:

```sh
pnpm exec vitest run tests/orchestration/failure-suite.test.ts tests/orchestration/replay.test.ts
```

M4-03, M4-04, M4-05, and M4-06 remain outside this work package.
