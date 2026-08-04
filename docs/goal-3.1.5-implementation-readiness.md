# Goal 3.1.5 Implementation Readiness Review

- Review date: 2026-08-03
- Repository snapshot: working tree on `master`, base commit `56ec150`
- Target: `ProductionAgent_Goal_3.1_LangGraph_架构设计文档_v0.2.md`
- Scope: architecture gap analysis only; no LangGraph implementation or workflow refactor

## Executive verdict

ProductionAgent is **contract-prepared but not implementation-ready** for Goal 3.1.

The current repository already has a strong artifact-based editorial pipeline: 11 stable role
boundaries, canonical episode artifacts, SHA-256-bound Markdown gates, deterministic content and
delivery validators, and a working vertical-video production chain. Nine normative engineering
documents also define most of the intended control-plane behavior.

The missing layer is the executable control plane. There is no LangGraph dependency or graph, no
typed `ProductionState`, no reducer implementation, no common node runner, no artifact registry or
transitive staleness engine, no executable issue router, no cross-role revision ledger, no freeze
manifest, no persistent checkpointer, no interrupt/resume HITL path, and no append-only execution
event stream. Most Goal 3.1 behavior currently exists only as prose contracts.

There is also design drift between the Goal 3.1 document and the repository contracts. The design
document itself is not tracked in the current repository, so its exact version and SHA-256 cannot be
bound to an implementation plan. Several target concepts also have competing definitions: broad
versus granular issue categories, numeric improvement versus Pareto selection, `_runs/` versus
episode-local observability paths, and `latest.json`/freeze manifests versus the reserved
`artifact-index.json`. These decisions must be resolved before M1 implementation.

## Top readiness findings

| Severity | Location                                 | User-visible/operational impact                                                                                                | Evidence                                                                                                                    | Required before implementation                                                                   | Verification gap                                                           |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Critical | `package.json`, `src/`, `scripts/`       | Goal 3.1 cannot schedule, route, pause, resume, or replay the existing roles.                                                  | No LangGraph package, graph, `ProductionState`, reducer, or node runner exists.                                             | Build and test the framework-neutral control-plane contracts before wiring graph edges.          | No graph topology, reducer, or checkpoint-resume test exists.              |
| Critical | Story-to-production boundary             | Production can read mutable canonical content after `story-approved`; human edits have no protected ranges.                    | No freeze manifest, `locked_ranges`, unfreeze request, or freeze counter exists.                                            | Define the freeze/approval/lock contract and make production resolve only a frozen artifact set. | No stale-after-freeze or human-edit-preservation test exists.              |
| High     | Critic reports and `src/lib/story.ts`    | A model-authored legacy `returnTo` remains the practical route signal; cross-critic issues cannot be merged deterministically. | Current reports lack `critic-output-v1`, structured issues, ArtifactRefs, and `primaryRoute`.                               | Implement the common issue/evaluation envelope and a pure route function with legacy adapters.   | The planned schema, route coverage, and permutation tests are not present. |
| High     | Goal 3.1 design versus `docs/` contracts | An implementation plan could encode the wrong state, issue, selection, manifest, or log model.                                 | The Goal 3.1 document is not versioned in the repository, and several definitions conflict with newer repository contracts. | Select one versioned authority or define explicit migrations/translations.                       | No contract-drift or architecture-version gate exists.                     |
| Medium   | `package.json` `validate:story`          | A non-default episode can have another episode's workflow validated, hiding a cross-episode mismatch.                          | The wrapper does not forward `--episode` to its nested `validate:workflow`; `LEGACY-005` documents the missing test.        | Fix during compatibility work before graph execution can target multiple episode IDs.            | No wrapper argument-propagation regression test exists.                    |

## Review basis and status rules

This review treats files in `docs/` as specifications, not runtime evidence. A component is marked:

- **Implemented** when executable code, persistence, and tests enforce the requirement.
- **Partial** when current code enforces a useful subset but not the Goal 3.1 contract.
- **Contract-only** when a normative document exists but the runtime does not.
- **Absent** when neither a compatible runtime nor a complete repository contract exists.

Migration effort is relative:

- **S**: one isolated module or adapter.
- **M**: several modules plus fixtures and compatibility work.
- **L**: cross-cutting control-plane work affecting state, persistence, and multiple stages.

Risk describes the consequence of implementing the component incorrectly, not the quality of the
existing editorial pipeline.

## Current repository snapshot

| Surface                  | Current implementation                                                                                                                                                              | Readiness implication                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository structure     | TypeScript strict mode, pnpm, Zod, Vitest, React/Remotion, FFmpeg scripts; episode content under `content/<episode>/`                                                               | A TypeScript control plane can reuse the current runtime and schemas, but no graph runtime is installed.                                                                |
| Artifact workflow        | Research, story, review, production, and delivery artifacts are passed through files; `story/workflow.json` records role order, decisions, review cycles, and one of three statuses | The artifact boundary is suitable, but the control file stores mutable paths and prose decisions rather than versioned references, issues, evaluations, or checkpoints. |
| Agent boundaries         | 11 role files under `agents/`; each declares read-only inputs, writable outputs, gates, and forbidden actions                                                                       | Editorial ownership is reusable. The roles are prompts/manual Codex handoffs, not callable nodes.                                                                       |
| Automated agent behavior | `pnpm polish` contains a bounded Oral Rewriter/judge API loop; TTS and media stages are deterministic scripts                                                                       | This is a useful adapter example, but it is not integrated with `workflow.json`, routing, revision selection, or checkpointing.                                         |
| Validation pipeline      | Zod parsers and validators cover research, workflow, story, materialized content, delivery, and comparison                                                                          | Existing gates are healthy and reusable, but they validate legacy report shapes rather than the common Goal 3.1 contracts.                                              |
| Prompts and configs      | Stable role prompts in `agents/`; automated oral prompts in `prompts/v3/`; polish and TTS JSON configs                                                                              | There is no orchestration prompt registry or `ownership`, `routing`, `budget`, `models`, or graph-threshold configuration.                                              |
| Architecture contracts   | Nine normative files cover agent, artifact, issue, evaluation, routing, revision, observability, failure, and tests                                                                 | The desired semantics are unusually well specified, but nearly all are explicitly future requirements.                                                                  |

The current artifact flow is:

```text
research files
  -> director brief and story structure
  -> viral strategy and hook plan
  -> script draft
  -> oral rewrite and oral review
  -> audience and fact review
  -> visual plan and retention review
  -> materialize -> TTS -> captions/timeline -> render/inspect
  -> delivery review
```

People or individual Codex tasks advance this flow and edit `workflow.json`. The validators verify the
result after the fact; they do not schedule work, create immutable revisions, calculate a global stale
set, or resume an interrupted run.

## 1. Architecture Compliance Matrix

| Component           | Required by Goal 3.1                                                                                                                                                                                                                                                                                           | Current implementation status                                                                                                                                                                                                                                                            | Exact gap                                                                                                                                                                                                                                                                                                                                                              | Effort | Risk                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| State model         | Versioned `ProductionState` with full phase progression, artifact refs, best/selected state, evaluations, issues, gates/approvals, budgets, events, and reference-only controlled summaries. Parallel fields require explicit reducers.                                                                        | **Partial.** `director-workflow-v1` contains episode ID, three coarse statuses, ordered stages, decisions, and review cycles. `src/lib/workflow.ts` validates that shape.                                                                                                                | No Goal 3.1 state schema, schema migration, phase machine, reducer functions, budget state, best pointers, issue/evaluation collections, approval state, or protection against full artifact bodies entering state.                                                                                                                                                    | L      | Critical: incorrect merges or stale state could approve the wrong bytes.                             |
| Artifact contract   | Immutable `ArtifactRef`s with version/hash/provenance/dependencies/staleness; versioned files; transitive invalidation; atomic candidate publication; human locks; content freeze manifest and stable pointers.                                                                                                | **Contract-only with partial legacy enforcement.** Current gates bind selected inputs by SHA-256. `docs/artifact-contract.md` reserves `ArtifactRef` and `artifact-index-v1`, while runtime workflow stages contain path strings. Existing writers publish directly to canonical paths.  | Implement the runtime schema, artifact index, dependency DAG, full stale-set calculation, candidate/quarantine lifecycle, atomic promotion, revision retention, legacy importer, and human lock metadata. Reconcile Goal 3.1 `latest.json`/manifest concepts with the repository's `artifact-index.json` contract.                                                     | L      | Critical: this is the source-of-truth and rollback boundary.                                         |
| Issue contract      | Typed issue with stable ID, category, severity, status, owner, artifact/locator, evidence, requested outcome, protected constraints, and deterministic route inputs.                                                                                                                                           | **Contract-only.** `docs/critic-output-schema.md` defines `critic-output-v1` and 41 controlled categories. Runtime reports still expose critic-specific `viewerExitRisks`, free-form blocker strings, and legacy `returnTo`; current episode reports do not contain the common envelope. | Implement shared schemas and validation, migrate or adapt all five critic gates, preserve issue identity across rounds, and decide whether Goal 3.1's broad categories/severities or the repository's granular taxonomy is authoritative.                                                                                                                              | M      | High: ambiguous categories create wrong-owner revisions and false closure.                           |
| Evaluation contract | Typed `Evaluation` records bound to exact artifact, critic, rubric/prompt versions, dimensions, weighted score, gate, issues, time, and cost; a deterministic gate evaluator aggregates critic output and decides acceptance.                                                                                  | **Partial.** Per-critic Zod schemas and validators recompute totals, floors, hashes, blockers, and delivery metrics. `evaluation-rubric.md` defines common semantics.                                                                                                                    | No common evaluation artifact or registry, no model/prompt/cost binding, no evaluator node, no parallel merge, and no executable candidate-versus-best acceptance function. Goal 3.1 numeric `epsilon/max_drop/target_gain` rules also conflict with the repository's newer Pareto policy and must be reconciled.                                                      | M      | High: score drift could select a worse candidate or hide a blocker.                                  |
| Node abstraction    | Framework-independent `run_agent` boundary plus LangGraph wrappers declaring inputs, outputs, cost tier, cacheability, idempotency, retry, timeout, and partial state updates. Deterministic evaluator/router/refresh nodes remain distinct from editorial agents.                                             | **Absent.** Role boundaries exist as Markdown instructions; scripts and the oral polish loop expose unrelated function shapes. No common `AgentInvocation`/`AgentResult` implementation or node registry exists.                                                                         | Build the runtime-neutral execution interface, adapters for manual/Codex, hosted-model, stub, and deterministic-tool work, input/output validation, timeout/retry hooks, and LangGraph wrappers that return partial updates only. Map `gate_evaluator`, `issue_router`, `downstream_refresh`, and `compliance_check` without silently changing the 11 editorial roles. | L      | High: a leaky wrapper would couple content logic to LangGraph and make replay impossible.            |
| Routing             | Pure, deterministic `RoutingDecision`; one category maps to one owner; upstream/severity priority; one owner per round; budget-aware human escalation; ownership in configuration.                                                                                                                             | **Contract-only.** `docs/routing-policy.md` defines a deterministic table and restart closures. Runtime critics author legacy `returnTo`, and validators check only limited enum/closure consistency.                                                                                    | Implement the routing function, configuration loader, category-table coverage tests, root-cause/provenance resolution, primary issue batching, budget checks, and downstream stale closure. Decide the authority between Goal 3.1 `config/ownership.yaml` and the hard-coded Markdown/TypeScript definitions.                                                          | M      | High: wrong routing can overwrite the wrong artifact and waste a revision round.                     |
| Revision loop       | Diff-aware single-owner revision, downstream refresh, critic rerun, candidate/best comparison, bounded round/cost/time budgets, escalation levels, no-progress/oscillation detection, rollback, and immutable `revision_log`.                                                                                  | **Partial.** `pnpm polish` has a three-round local rewrite loop. `workflow.json` stores some review cycles; retention reports can bind before/after hashes. `docs/revision-policy.md` reserves a future ledger.                                                                          | No cross-role loop, budget accounting, revision ledger, selected/best pointers, diff-aware locks, candidate transaction, deterministic regression/oscillation handling, downstream rerun scheduler, or rollback. Review cycles are incomplete: current v2 workflow files do not represent all Oral/Fact history as structured cycles.                                  | L      | Critical: automated revisions could regress facts, lose the best version, or loop indefinitely.      |
| Freeze protocol     | Formal Content Approval creates an immutable manifest of exact best artifacts and gate snapshot; production reads the manifest, not mutable latest files. Human edits create new versions with `locked_ranges`. Delivery fixes use L1-L4 repair levels; L4 requires approved unfreeze.                         | **Absent.** `story-approved` is a validated workflow label, after which production scripts read canonical episode paths directly. There is no freeze/lock/unfreeze artifact or counter.                                                                                                  | Define and implement content manifest identity, approval artifact, freeze guard, production input resolver, locked-range format/enforcement, repair classification, unfreeze request/approval, maximum unfreeze count, and stale production retention.                                                                                                                 | L      | Critical: production can consume silently changed content, and automation can overwrite human edits. |
| Checkpointing       | Persistent LangGraph checkpointer, versioned checkpoint schema, resume after every lifecycle boundary, reference-only state, and recovery across content/revision/HITL/production. Goal 3.1 calls for persistent storage rather than `MemorySaver`, with SQLite for development and PostgreSQL for production. | **Contract-only.** `failure-modes.md` specifies commit/recovery semantics, but no checkpointer, checkpoint store, commit marker, state migration, or resume command exists. Direct writers do not commit artifact index, workflow, and revision ledger atomically.                       | Select the LangGraph runtime and persistent saver, define thread/run/approval-epoch identity, implement checkpoint migration and the relationship between LangGraph checkpoint commits and filesystem artifact transactions, and add crash/resume tests.                                                                                                               | L      | Critical: interruption can leave control pointers and canonical files inconsistent.                  |
| HITL                | Two formal gates: Content Approval before freeze and Final Publication before publish; structured approve/reject/direct-edit actions; dynamic `interrupt()` and `Command(resume=...)`; escalation for budgets, conflicts, compliance, unfreeze, and unrecoverable errors.                                      | **Partial/manual.** Documents route exhausted revisions to `human-editor`, reports mention human review, and release checks are manual. There is no decision schema in runtime, authenticated actor, interrupt, resume, pending-decision state, or approval history.                     | Implement human-decision artifacts, review payloads, pause/resume states, actor/time/reason provenance, direct-edit ingestion as a new locked artifact version, unfreeze approval, and final-approval behavior. Preserve the repository rule that no external publishing occurs.                                                                                       | M-L    | High: an implicit or lost human decision can bypass a required gate.                                 |
| Observability       | Append-only per-run lifecycle events; trace/execution hierarchy; exact artifact, model, prompt, usage, cost, duration, cache, route, checkpoint, and error data; derived run reports and operational views without logging artifact bodies.                                                                    | **Contract-only.** Current scripts print console summaries and write domain reports. `docs/observability-spec.md` defines `agent-execution-event-v1`, but no event emitter, JSONL sink, trace IDs, completeness gate, or views exist.                                                    | Implement event schema/code, redaction, lifecycle instrumentation, token/cost availability, cache/checkpoint events, approval completeness validation, replay projections, and path retention. Reconcile Goal 3.1 `_runs/{run_id}/events.jsonl` with the contract's `content/<episode>/observability/executions.jsonl`.                                                | M-L    | High: failures, retries, costs, and approval provenance would remain unreconstructable.              |

### Important compatibility findings

1. **The current episode artifacts are legacy shapes.** All inspected Oral, Audience, Fact,
   Retention, and Delivery report gates use their existing rubric-specific fields. None currently
   carries the full `critic-output-v1` envelope, `ArtifactRef[]`, structured issues, or
   `primaryRoute`.
2. **`workflow.json` is not a checkpoint.** It does not bind each completed stage to complete
   artifact references, prompt/rubric versions, or an atomic revision ledger.
3. **Direct canonical writes are normal today.** `materialize`, TTS, timeline, render, and polish
   commands write selected paths without a candidate/promotion transaction.
4. **Nested Goal 3 packages need flat-ID aliases.** Current project path resolution accepts only
   `content/<episode-id>`, and the v2 packages use compatibility symlinks. An artifact registry must
   distinguish logical episode identity from filesystem aliases.
5. **The non-default wrapper gap remains.** `validate:story` invokes `pnpm validate:workflow`
   without forwarding the caller's `--episode`; the direct story validator receives the flag. This
   can validate one episode's workflow and another episode's story. `LEGACY-005` documents the
   required test, but it is not implemented.

## 2. Implementation Dependencies

### What must be built first

The dependency order should be:

```text
freeze design authority
  -> executable schemas and configuration
  -> artifact registry, hashing, dependency DAG, and atomic publication
  -> ProductionState, reducers, and legacy import
  -> deterministic evaluation, routing, revision, and budget functions
  -> checkpoint transaction and event lifecycle
  -> LangGraph topology and node adapters
```

The first implementation tranche must not begin with role prompts or graph edges. The graph cannot
correctly schedule or resume work until artifact identity, staleness, route ownership, and checkpoint
commit semantics are executable and tested.

| Dependency                           | Why it precedes graph execution                                                                                      | Existing reusable basis                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Versioned architecture authority     | Prevents implementation against an untracked or changing v0.2 design                                                 | Goal 3.1 component list and nine repository contracts                                    |
| Shared schema package                | Gives state, artifacts, issues, evaluations, invocations, results, budgets, approvals, and events one parse boundary | Existing Zod patterns in `src/lib/story.ts`, `workflow.ts`, and `src/schemas/episode.ts` |
| Configuration authority              | Makes ownership, routing, budgets, models, thresholds, and version IDs deterministic                                 | Current polish/TTS config loaders and routing/rubric documents                           |
| Artifact control plane               | Establishes immutable handoffs, selected/best state, staleness, and rollback before any node can write               | Existing canonical paths and SHA-256 gates                                               |
| Pure policy functions                | Lets routing, evaluation, invalidation, budget, and convergence be tested without LangGraph or live models           | `docs/test-plan.md` and current validator arithmetic                                     |
| Persistent checkpoint/event boundary | Makes pause, crash recovery, and replay safe before HITL or production side effects are added                        | Failure and observability contracts                                                      |
| Legacy adapter                       | Allows current episodes to seed references without inventing historical telemetry or revisions                       | Existing validated v1/v2 artifacts and gate hashes                                       |

### What can be deferred

| Deferred item                                                    | Earliest milestone        | Reason                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL checkpointer and multi-host execution                 | M4                        | SQLite persistence is sufficient for a local single-run skeleton if the interface is backend-neutral.                    |
| External OpenTelemetry/analytics sink and dashboards             | M4                        | The append-only local event contract and completeness gate must exist first.                                             |
| Multi-episode fan-out and distributed queues                     | M4                        | The current workflow and media workload are single-episode and local.                                                    |
| Best-of-N, model-tier escalation, and advanced fallback policies | M4                        | Bounded single-candidate revision plus human escalation can prove the control loop first.                                |
| Cost optimization and broad cache tuning                         | M4                        | Correct artifact identity and idempotency must precede optimization. Basic per-segment production caching belongs in M3. |
| Automatic publication to external platforms                      | Out of scope              | The repository explicitly stops at delivery approval and does not publish.                                               |
| Real audience-data learning or critic-score optimization         | Out of scope for Goal 3.1 | Current scores are editorial proxies; no publication outcome data supports a learning target.                            |

### What requires design decisions

Implementation is blocked until the repository has one authority for: state schema and reducers,
artifact pointer/manifest layout, issue taxonomy, acceptance algorithm, content-critic topology,
configuration format, checkpoint identity, observability path, human decision format, and freeze/lock
semantics. These are listed in Section 4.

## 3. Recommended MVP Scope

### M1: LangGraph skeleton

Include:

- the selected TypeScript-compatible LangGraph runtime and a persistent local checkpointer;
- `ProductionState` v1 containing references and controlled summaries only;
- reducers for artifacts, evaluations, issues, events, approvals, gates, and budget usage;
- executable ArtifactRef/index, dependency, schema, invocation/result, and event contracts;
- a legacy importer for one current episode package;
- node wrappers for all declared stages using deterministic stub responses; existing production
  commands are exposed only through adapters and are not executed by the M1 graph;
- the happy-path topology through content approval, stubbed production/delivery, and final human
  approval, with revision edges disabled except for explicit test routes;
- a minimal append-only local event sink;
- reducer, state-body-leak, artifact hash, graph topology, checkpoint-resume, and current-validator
  compatibility tests.

Do not include live content generation, automatic revision, production caching optimization,
PostgreSQL, dashboards, or publishing.

M1 exit criterion: a synthetic fixture and one legacy-derived episode can traverse the graph, pause at
both human gates, resume from a persistent checkpoint without rerunning completed valid nodes, and
finish with exactly the same selected ArtifactRefs as an uninterrupted run. Existing repository
validators must remain green.

### M2: Content revision loop

Include:

- real content-node adapters under the agreed manual/Codex/hosted execution policy;
- common critic issue and evaluation artifacts;
- the agreed parallel critic/evaluator topology and reducers;
- deterministic single-owner routing, downstream staleness, and required critic reruns;
- revision ledger, selected/best pointers, before/after evidence, regression, no-progress,
  oscillation, and round/cost/time budgets;
- content approval, freeze manifest, human direct-edit ingestion, and locked-range enforcement;
- one golden hook correction, one fact/provenance correction, budget exhaustion, and human-resume
  tests.

M2 exit criterion: a structured content issue routes to exactly one owner, changes only authorized
artifacts, marks all descendants stale, reruns required gates, preserves or restores the best valid
version, and reaches an auditable human-approved freeze. No full script, Claim Ledger, or report body
may enter graph state or checkpoints.

### M3: Production loop

Include:

- deterministic nodes for materialization, TTS, captions, timeline, asset generation/capture, render,
  inspection, and Delivery Critic;
- idempotency keys and exact-input cache keys, including per-segment audio and per-shot assets;
- production-side stale propagation and restart boundaries;
- L1-L3 delivery repair paths without content unfreeze;
- L4 unfreeze request, human approval, approval-epoch transition, and retained stale media;
- final human approval that stops before any external publication;
- crash/retry/resume tests proving no duplicate selected audio, asset, or render output.

M3 exit criterion: a frozen manifest is the only production input; a delivery issue reruns the
minimum valid production closure; a story/fact issue cannot unfreeze automatically; and resume from
every production checkpoint is idempotent.

### M4: Hardening

Include:

- production-grade checkpoint backend and state/checkpoint migrations;
- complete failure injection, retry, quarantine, recovery, and replay suites;
- local event completeness gate, redaction tests, run reports, cost/token/duration/cache views, and
  optional external telemetry mirror;
- legacy episode import/backfill with explicit `legacy-derived` provenance;
- multi-episode isolation and controlled concurrency;
- advanced model escalation/best-of-N only if separately authorized and budgeted;
- all schema, routing, artifact, revision, observability, failure, legacy, golden, and replay tests in
  `docs/test-plan.md`.

M4 exit criterion: the full contract test plan passes network-free with stubs, current episode gates
still pass, schema migrations can restore historical checkpoints, and injected failures cannot
silently approve, overwrite, or publish stale artifacts.

## 4. Open Questions

The following decisions remain before implementation. Questions 1-10 block M1; the remainder block
M2 or M3.

1. **Architecture authority:** Where will
   `ProductionAgent_Goal_3.1_LangGraph_架构设计文档_v0.2.md` live in the repository, and what version/hash
   becomes the implementation baseline?
2. **Runtime language and package:** Will the graph use the TypeScript LangGraph runtime inside the
   existing Node project, or a separately governed Python runtime? The current TypeScript engineering
   standard favors one runtime, but the decision is not recorded.
3. **State authority:** What is the exact `ProductionState` v1 field set, phase enum, reducer for each
   concurrently written field, and checkpoint migration rule?
4. **Artifact pointer model:** Is the authoritative control layout the repository contract's
   `artifact-index.json` plus canonical paths, the Goal 3.1 `latest.json`/manifest model, or a specified
   combination? Which file owns selected and best pointers?
5. **Issue taxonomy:** Does implementation use Goal 3.1's broad categories and
   `blocker/major/minor`, or `critic-output-v1`'s 41 categories and
   `info/low/medium/high/blocker`? A versioned translation table is required if both remain.
6. **Revision acceptance:** Is candidate selection the Goal 3.1 weighted improvement rule with
   `epsilon`, `max_drop`, and `target_gain`, or `revision-policy-v1` Pareto dominance plus
   critic-specific regression thresholds? The runner cannot implement both as silent alternatives.
7. **Graph topology and role mapping:** Which critics may legally run in parallel given the current
   dependency order `Oral -> Audience -> Fact -> Visual -> Retention`? Is Goal 3.1
   `compliance_check` a new deterministic gate/profile, part of Fact Guardian/Delivery Critic, or a
   new editorial role? `gate_evaluator`, `issue_router`, and `downstream_refresh` should be classified
   explicitly as system nodes.
8. **Configuration authority:** Will `ownership`, `routing`, `budget`, `models`, `rubrics`, and
   thresholds be YAML as in Goal 3.1, JSON like current configs, or generated TypeScript? How will
   documents and executable config be prevented from drifting?
9. **Checkpoint identity:** What are `thread_id`, `run_id`, approval epoch, and checkpoint namespace
   rules for repeated runs of the same episode? Which local SQLite saver and production PostgreSQL
   saver are approved, and how does a LangGraph checkpoint commit relate to filesystem atomic
   promotion?
10. **Observability location:** Is the canonical append-only log `_runs/{run_id}/events.jsonl` or
    `content/<episode>/observability/executions.jsonl`? What is retained per run versus per episode?
11. **Human decision contract:** What schema, actor identity, interface, and authorization model are
    required for approve, reject, direct edit, select-best, change-constraint, unfreeze, and stop?
12. **Freeze and locked ranges:** What is the freeze manifest path/schema? How are locked ranges
    addressed across Markdown and JSON, how are overlapping model edits rejected, and when may a
    human intentionally unlock them?
13. **Unfreeze policy:** What exact delivery findings map to L1-L4, what is `max_unfreeze`, and which
    human role may approve an L4 transition to a new content approval epoch?
14. **Legacy migration:** Which current episode packages become import fixtures? Should legacy gates
    remain read-only, or be wrapped in additive `critic-output-v1` adapters? How are the flat-ID
    compatibility symlinks represented without becoming artifact identity?
15. **Execution backend boundary:** Which roles remain manual Codex file handoffs, which may call a
    hosted model through an adapter, and which must be deterministic tools? Stub mode must exercise
    the same node contract without authorizing self-hosted models.
16. **Final Publication meaning:** Does the second HITL gate mean “approved for human publication”
    only? The current repository explicitly performs no upload, so the graph must not infer external
    publishing authority.

## Verification evidence for this review

Fresh read-only checks against the current working tree passed:

| Check                                                                       | Result                                  |
| --------------------------------------------------------------------------- | --------------------------------------- |
| `pnpm typecheck`                                                            | PASS                                    |
| `pnpm test`                                                                 | PASS: 10 test files, 41 tests           |
| Direct workflow and story validation for `episode-001-v2-goal3`             | PASS: 11 owners, 4 reviews, 10 segments |
| Direct workflow and story validation for `episode-002-v2-goal3`             | PASS: 11 owners, 3 reviews, 12 segments |
| Research, content, delivery, and comparison validation for both v2 packages | PASS                                    |

These results prove the current artifact pipeline is internally healthy. They do not provide evidence
for Goal 3.1 state merging, deterministic routing, checkpoint recovery, HITL resume, freeze safety,
revision convergence, or observability because those executable components and their planned contract
tests do not yet exist.

## Readiness conclusion

The repository is ready for a bounded architecture-decision pass and then an implementation plan. It
is not ready to begin LangGraph coding directly. The first plan should resolve the conflicting
authorities in Section 4 and implement/test the deterministic artifact control plane before graph
orchestration. Existing role responsibilities, canonical episode artifacts, validators, and media
pipeline should be treated as compatibility constraints rather than rewritten.
