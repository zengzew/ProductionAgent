# Contract Test Plan

- Status: normative test design
- Plan version: `orchestration-contract-test-v1`

## Scope

This plan verifies the deterministic artifact control plane before any LangGraph implementation. Tests
target schemas, hashing, invalidation, scoring, routing, revision, observability, retries, and checkpoint
recovery. They do not test a graph framework.

The editorial quality of a live model sample is not deterministic. The contract claim is narrower and
testable: given the same artifacts, recorded model output, schemas, and policy versions, validation,
scores, routes, invalidation, checkpoints, and replay decisions are deterministic.

## Test layers

| Layer                 | Purpose                                                                         | Network |
| --------------------- | ------------------------------------------------------------------------------- | ------- |
| Schema unit           | Parse/reject every artifact and critic contract field.                          | no      |
| Policy unit           | Recompute score, route, stale set, budget, regression, and oscillation.         | no      |
| Artifact integration  | Exercise transactional publication, hashing, selection, and checkpoint restore. | no      |
| Mock-agent workflow   | Run all role boundaries with deterministic fixtures.                            | no      |
| Replay                | Feed recorded outputs and events through a fresh control plane.                 | no      |
| Current compatibility | Run existing repository validators over current episode layout and gates.       | no      |
| Optional provider     | Verify declared API/TTS adapters with credentials and explicit opt-in.          | yes     |

Default CI MUST be credential-free and network-free.

## Fixture layout

When implemented, fixtures SHOULD use:

```text
tests/fixtures/contracts/
  golden-episode/
    content/episode-contract-golden/
    output/episode-contract-golden/
    responses/
    events/
  invalid/
    critic-results/
    artifacts/
    checkpoints/
  routing/
  revisions/
  legacy/
```

Fixtures are synthetic and small. They MUST NOT copy complete production research, scripts, media, or
secrets. Binary fixtures use a tiny generated vertical test clip and short synthetic audio.

Every golden fixture declares its schema, prompt, rubric, and routing versions. Updating a golden
decision requires an explicit fixture review; tests must not rewrite snapshots automatically in CI.

## Golden path test

### `GOLDEN-001`: episode reaches `delivery-approved`

Run a deterministic mock workflow through:

```text
Research Analyst
Story Director
Viral Director
Script Writer
Oral Rewriter
Oral Judge PASS
Audience Critic PASS
Fact Guardian PASS
Visual Director READY
Retention Critic PASS
production-executor
Delivery Critic PASS
```

Assertions:

1. Each role reads only declared input ArtifactRefs and writes only declared outputs.
2. Every input hash is verified before dispatch.
3. Every output receives stable artifact ID, revision, schema version, byte hash, size, and producer.
4. All gate hashes equal the reviewed bytes.
5. Score totals/floors and PASS verdicts are recomputed.
6. No primary route exists on PASS.
7. `story-approved` occurs only after Retention Critic PASS.
8. `delivery-approved` occurs only after the final MP4/SRT/timeline hashes pass Delivery Critic.
9. Artifact index, workflow, and revision ledger checkpoint together.
10. All executions have complete trace events, explicit usage availability, and decision reasons.
11. Orchestration state contains references/controlled summaries only; a scan finds no fixture
    narration, source text, captions, or binary payload.
12. Replaying from the committed checkpoint performs no already-valid stage.

### `GOLDEN-002`: one creative correction closes

Audience Critic emits one `attention.hook` issue. Assert route owner/target is Viral Director, the
legacy Audience `returnTo` mapping is stable, Script Writer onward become stale, revision round becomes
1, before/after hashes differ, the issue closes in the next report, and the episode then completes.

### `GOLDEN-003`: one delivery correction closes

Delivery Critic emits `delivery.caption-split`. Assert the route is
`production-executor/captions`, story approval remains valid, caption/timeline/render/delivery artifacts
invalidate as required, and a new Delivery report binds the rebuilt hashes.

## Schema tests

| ID           | Case                                                                                       | Expected |
| ------------ | ------------------------------------------------------------------------------------------ | -------- |
| `SCHEMA-001` | Minimal valid common critic result plus each critic profile.                               | accept   |
| `SCHEMA-002` | Missing category, severity, owner, affected artifact, evidence, correction, or constraint. | reject   |
| `SCHEMA-003` | Unknown issue category or owner.                                                           | reject   |
| `SCHEMA-004` | Invalid SHA-256, absolute/out-of-repo path, wrong episode ID.                              | reject   |
| `SCHEMA-005` | PASS with blocker/open route/failed floor.                                                 | reject   |
| `SCHEMA-006` | REJECT with no open issue or route.                                                        | reject   |
| `SCHEMA-007` | Markdown body contradicts leading gate.                                                    | reject   |
| `SCHEMA-008` | Blocker list references missing/resolved issue.                                            | reject   |
| `SCHEMA-009` | Issue locator too vague or constraints array empty.                                        | reject   |
| `SCHEMA-010` | Critic emits a category outside its allowed family.                                        | reject   |
| `SCHEMA-011` | Additive `critic-output-v1` fields are ignored safely by current legacy gate readers.      | accept   |

Schema tests MUST assert exact error codes, not only that an exception occurred.

## Rubric tests

| ID           | Case                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| `RUBRIC-001` | Recompute each Audience dimension, hook breakdown, total=85 boundary, and 60% floors. |
| `RUBRIC-002` | Audience total 90 with one dimension below floor rejects.                             |
| `RUBRIC-003` | Oral scores `[4,4,4]` pass; `[5,5,3]` rejects; third REJECT routes human.             |
| `RUBRIC-004` | Retention total 80 and windows 15 pass when no high risk; 79 rejects.                 |
| `RUBRIC-005` | Retention high risk rejects even with total 100.                                      |
| `RUBRIC-006` | Fact Guardian receives 100 only when every binary dimension passes.                   |
| `RUBRIC-007` | Delivery receives 100 only when every binary dimension passes.                        |
| `RUBRIC-008` | MP4 duration 179.999 passes duration rule; 180.000 rejects.                           |
| `RUBRIC-009` | Micro-cue ratio 0.10 passes; any representable value greater than 0.10 rejects.       |
| `RUBRIC-010` | Score arithmetic supplied by mock model is wrong and validator rejects it.            |
| `RUBRIC-011` | Same evidence under same rubric cannot change severity/score without a drift error.   |

## Routing tests

### Table coverage

`ROUTE-001` is a parameterized test over every category in `routing-policy-v1`. Each category MUST have
exactly one expected owner, route target, and restart boundary. The test fails when a schema category
has no route or a route exists for no schema category.

### Deterministic cases

| ID          | Case                                                                       | Expected                                                   |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `ROUTE-002` | Research evidence gap plus hook issue.                                     | Research first; hook not dispatched in parallel.           |
| `ROUTE-003` | Draft metric error.                                                        | Script Writer.                                             |
| `ROUTE-004` | Draft correct, final rewrite changes metric.                               | Oral Rewriter.                                             |
| `ROUTE-005` | Hook/high issue in Audience report.                                        | Viral Director; fixed legacy mapping.                      |
| `ROUTE-006` | Visual readability issue in retention window.                              | Visual Director, not generic mid-video route.              |
| `ROUTE-007` | SRT word split.                                                            | Production executor, captions.                             |
| `ROUTE-008` | Same-stage issues with mixed severities.                                   | One batch; reason chosen by severity/category/ID ordering. |
| `ROUTE-009` | Unknown provenance for a Fact issue.                                       | Human escalation, no guessed owner.                        |
| `ROUTE-010` | Budget remaining zero.                                                     | Human escalation before agent dispatch.                    |
| `ROUTE-011` | Suggested correction names a different owner than category table.          | Table owner wins; submitted report invalid.                |
| `ROUTE-012` | Prose changes while structured issue is unchanged.                         | Identical route.                                           |
| `ROUTE-013` | Duration fails at audio, timeline, and encode layers in separate fixtures. | TTS, timeline, and render respectively.                    |

Property test: for any permutation of the same issue set, the primary route and ordered issue batch
are identical.

## Artifact lifecycle tests

| ID             | Case                                                           |
| -------------- | -------------------------------------------------------------- |
| `ARTIFACT-001` | Same bytes written twice.                                      |
|                | Same revision/hash; new execution only.                        |
| `ARTIFACT-002` | One-byte/newline change.                                       |
|                | New SHA-256 and revision; descendants stale.                   |
| `ARTIFACT-003` | Mtime changes without byte change.                             |
|                | No invalidation.                                               |
| `ARTIFACT-004` | Research fact changes.                                         |
|                | Story Director through delivery stale.                         |
| `ARTIFACT-005` | Visual plan changes.                                           |
|                | Retention/render/delivery stale; research/script remain valid. |
| `ARTIFACT-006` | Final MP4 changes.                                             |
|                | Delivery review stale only.                                    |
| `ARTIFACT-007` | Dependency returns to the exact recorded hash.                 |
|                | Descendant becomes valid after validation without model rerun. |
| `ARTIFACT-008` | Path exists but hash mismatches selected reference.            |
|                | Not complete; no dispatch with stale reference.                |
| `ARTIFACT-009` | Multi-file stage publishes one valid and one invalid file.     |
|                | Neither becomes selected.                                      |
| `ARTIFACT-010` | State/log contains a full fixture artifact body.               |
|                | Contract test fails.                                           |

The invalidation test graph MUST include all restart classes in `artifact-contract.md`.

## Revision tests

| ID             | Case                                                             | Expected                                             |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `REVISION-001` | Candidate closes target issue, no score/constraint regression.   | select and mark best                                 |
| `REVISION-002` | Candidate raises total but introduces fact blocker.              | reject; retain best                                  |
| `REVISION-003` | Audience dimension drops 2 while total remains above 85.         | regression; reject                                   |
| `REVISION-004` | Candidate hashes equal before hashes but report changes to PASS. | no-progress; reject                                  |
| `REVISION-005` | Candidate and best use different rubric versions.                | incomparable; no automatic best selection            |
| `REVISION-006` | Sequence `A -> B -> A`.                                          | oscillation warning; retain best                     |
| `REVISION-007` | Sequence `A -> B -> A -> B`.                                     | human escalation                                     |
| `REVISION-008` | Issue A/B repeatedly recreate one another.                       | human escalation on second signature                 |
| `REVISION-009` | Third valid creative rejection.                                  | budget exhausted; no fourth dispatch                 |
| `REVISION-010` | Schema-invalid attempts occur before a valid creative rejection. | invalid attempts do not consume creative budget      |
| `REVISION-011` | Old best dependencies are stale.                                 | retain historically, never restore as selected-valid |

## Replay tests

### `REPLAY-001`: recorded-response replay

Start with an empty control plane, fixed fixture files, fixed IDs/timestamps supplied by the test clock,
and recorded agent responses. Replay all events. Excluding event transport metadata, assert identical:

- artifact bytes and hashes;
- schema and rubric results;
- stale sets and stage order;
- routes and issue batches;
- revision dispositions and best pointers;
- checkpoint hashes;
- final workflow status.

### `REPLAY-002`: checkpoint resume

Interrupt after each lifecycle boundary in turn. Resume from the last commit and assert no selected
artifact is produced twice, no successful stage reruns unnecessarily, attempt counters remain
continuous, and the final state equals uninterrupted `REPLAY-001`.

### `REPLAY-003`: event log rebuild

Rebuild derived execution views from JSONL only and compare them to the stored summary. Then rebuild
workflow truth from artifacts/checkpoints, not from logs, and confirm a tampered log cannot approve an
episode.

### `REPLAY-004`: live-model boundary

Two live samples may produce different artifact bytes and are not required to match. The test requires
both to validate under the same schema and requires deterministic routing for any identical structured
issue set. This prevents an untestable promise of deterministic language generation.

## Mock-agent tests

Mock agents implement the same request/result boundary as real roles:

```ts
type MockAgent = (request: AgentExecutionRequest) => Promise<AgentExecutionResult>;
```

Required mocks:

- `pass`: emits valid expected artifacts and gate;
- `reject(category)`: emits one valid structured issue;
- `multiReject(categories)`: tests precedence/batching;
- `staleInput`: changes an input after dispatch but before publication;
- `invalidJson`, `missingField`, `wrongHash`, `wrongScore`, `contradictoryVerdict`;
- `sameBytes`: exercises no-progress and revision identity;
- `regression`: resolves target while worsening a protected metric;
- `oscillateA` and `oscillateB`;
- `timeout`, `rateLimit`, `authFailure`, `toolFailure`;
- `partialOutputs`: one valid and one invalid file;
- `loggingFailure` and `checkpointFailure`.

Mocks MUST NOT special-case workflow internals. They receive ArtifactRefs, load fixture bytes through the
same artifact reader, and publish through the same validation/transaction boundary.

## Failure and recovery tests

| ID            | Case                                                              |
| ------------- | ----------------------------------------------------------------- |
| `FAILURE-001` | API timeouts then success on attempt 3.                           |
| `FAILURE-002` | Rate limit `Retry-After` above 60 seconds.                        |
|               | Delay caps at 60 seconds and is recorded.                         |
| `FAILURE-003` | Authentication failure.                                           |
|               | No retry/fallback; sanitized error.                               |
| `FAILURE-004` | Invalid output then valid contract-repair output.                 |
|               | One repair, no creative budget consumed.                          |
| `FAILURE-005` | Two invalid outputs.                                              |
|               | Quarantine and human/tooling escalation.                          |
| `FAILURE-006` | Input hash changes immediately before retry.                      |
|               | Cancel and recalculate stale set.                                 |
| `FAILURE-007` | Crash after transaction intent, before commit marker.             |
|               | Restore prior checkpoint.                                         |
| `FAILURE-008` | Commit marker exists but control hash mismatches.                 |
|               | Restore earlier verified checkpoint; never trust newest mtime.    |
| `FAILURE-009` | Configured TTS primary fails and declared Edge fallback succeeds. |
|               | New provider metadata; timeline/render/delivery rebuilt.          |
| `FAILURE-010` | Both TTS providers fail.                                          |
|               | Stop before timeline/render.                                      |
| `FAILURE-011` | Observability write fails after content checkpoint.               |
|               | `observability-degraded`; approval blocked until repaired.        |
| `FAILURE-012` | Error includes a fake API key/source paragraph.                   |
|               | Redaction test proves neither appears in JSONL.                   |

Tests use a fake clock; they do not actually sleep.

## Observability tests

Validate required fields for every event and these invariants:

- exactly one terminal event per execution;
- attempt numbers are positive and continuous per request purpose;
- model executions have model/prompt refs; deterministic tools do not;
- unavailable usage is null, not zero;
- cost is a decimal string with currency/pricing provenance;
- completed state changes have a preceding committed checkpoint;
- selected output hashes appear in validation and checkpoint events;
- every REJECT has issue IDs and route/human decision;
- logs contain no configured secret patterns or full fixture artifact substrings;
- totals by agent equal the sum of attempt records, including retries.

## Legacy compatibility tests

### `LEGACY-001`

Parse historical `oral-review-v1` plus current `oral-review-v2`, `product-story-v4`,
`fact-guardian-v1`, `retention-critic-v2`, and `delivery-critic-v1` reports. V1 remains parse-only;
new v2 reports require evidence for every named oral check.

### `LEGACY-002`

Add `critic-output-v1` fields to fixture gate JSON and assert current Zod parsers still accept the
known legacy fields and current validators calculate the same result.

### `LEGACY-003`

Import a current `director-workflow-v1` fixture into labeled legacy-derived ArtifactRefs/execution
records. Unknown model, token, cost, duration, and historical revisions remain explicitly unavailable.

### `LEGACY-004`

Run existing repository commands against the fixture layout:

```bash
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
pnpm validate:content
pnpm validate:delivery
```

No new contract implementation may break these entry points without an explicit versioned migration.

### `LEGACY-005`

Run every wrapper command against a non-default episode and assert the selected `episodeId` reaches
all nested validators. The test MUST fail if a wrapper validates the default episode's workflow while
validating another episode's story or delivery artifacts.

## Test implementation order

1. Pure schemas and route-table coverage.
2. Hashing/dependency graph and rubric recomputation.
3. Artifact transaction/checkpoint and revision ledger.
4. Mock-agent workflow and golden path.
5. Failure injection and replay.
6. Legacy importer/compatibility gates.
7. Optional provider tests.

This order exposes contract ambiguity before orchestration code exists.

## Exit criteria before orchestration

The engineering-contract phase is ready for a future orchestrator when:

- all schema, rubric, routing, artifact, revision, failure, observability, and legacy tests pass;
- every schema category has exactly one deterministic route;
- `GOLDEN-001`, both correction golden tests, and all replay tests pass;
- no checkpoint/state/log fixture contains full artifact content;
- retry/fallback tests prove bounded behavior and no hidden budget consumption;
- current production validators remain green;
- tests run without LangGraph or any other orchestration framework.
