# Goal 3.2A LangGraph Implementation Plan

- Status: **READY — all work packages are unblocked; ADR-003 fixes the candidate-selection operator**
- Scope: planning/documentation only; no LangGraph code, dependency install, runtime, or episode-artifact edits
- Rewrite date: 2026-08-04
- Approved architecture baseline: [Goal 3.1 LangGraph Architecture Design v0.2](../ProductionAgent_Goal_3.1_LangGraph_架构设计文档_v0.2.md)
- Engineering constraints: the nine Goal 3.0 contracts (linked in [§2](#2-authority-and-precedence))
- Readiness input: [Goal 3.1.5 Implementation Readiness Review](../goal-3.1.5-implementation-readiness.md)
- Companion: [traceability-matrix.md](./traceability-matrix.md)

## 1. What changed from the previous revision

The previous plan globally blocked M1–M4 behind sixteen architecture decisions (`AD-01`–`AD-16`).
Every one of those blockers rested on a single premise: that Goal 3.1 and Goal 3.0 were competing,
unranked authorities, so any concrete choice would be a "hidden architecture decision."

That premise is now removed by explicit instruction and by Goal 3.1's own text:

- Goal 3.1 is the **approved architecture baseline**.
- The nine Goal 3.0 contracts are its **detailed engineering constraints**, applied unless Goal 3.1
  explicitly overrides them.
- Goal 3.1 §4 already states its contract layer is "继承自 Goal 3.0，在此冻结" (inherited from Goal
  3.0 and frozen here). The two documents are layered, not rival.

Under that precedence, fifteen of the sixteen decisions are derivable from an existing authority and
are recorded as resolved in [§3](#3-architecture-decision-reassessment). The remaining decision — the
candidate-versus-best **selection operator** — had two normative authorities that gave incompatible
rules. [ADR-003](#adr-003--candidate-to-best-selection-operator) now resolves it in favor of Pareto
dominance, so `WP-M2-06` and every other work package are unblocked.

This plan therefore assigns target modules, PR-sized work packages, dependencies, a critical path,
safe parallel lanes, tests, and measurable acceptance criteria. It does not choose anything that an
authority already fixes; ADR-003 records the one explicit selection-policy decision supplied after
review.

## 2. Authority and precedence

Precedence, highest first, resolving `AD-01`:

1. **Goal 3.1 v0.2** — topology, phase machine, freeze/unfreeze, revision strategy ladder, budget
   model, HITL gates, observability shape, migration ordering. When Goal 3.1 states a rule
   explicitly, it wins.
2. **Goal 3.0 engineering contracts** — the executable shapes and hard rules Goal 3.1 inherits:
   - [Agent Contract](../agent-contract.md) — role registry, execution request/result, completion rule.
   - [Artifact Contract](../artifact-contract.md) — `ArtifactRef`, `artifact-index.json`, dependency
     validity, transitive invalidation, publication protocol.
   - [Critic Output Schema](../critic-output-schema.md) — `critic-output-v1`, 41 issue categories,
     issue/evaluation/route shapes.
   - [Evaluation Rubric](../evaluation-rubric.md) — per-critic dimensions, floors, thresholds, blockers.
   - [Routing Policy](../routing-policy.md) — deterministic category→owner table, primary-route selection.
   - [Revision Policy](../revision-policy.md) — budgets, regression, no-progress, oscillation, best tracking.
   - [Observability Spec](../observability-spec.md) — `agent-execution-event-v1`, JSONL sink, completeness gate.
   - [Failure Modes](../failure-modes.md) — failure classes, retry ceilings, commit protocol, recovery.
   - [Contract Test Plan](../test-plan.md) — `SCHEMA-*`, `RUBRIC-*`, `ROUTE-*`, `ARTIFACT-*`,
     `REVISION-*`, `REPLAY-*`, `FAILURE-*`, `LEGACY-*`, `GOLDEN-*` test IDs.
3. **Repository reality** — TypeScript strict mode, pnpm, Zod, Vitest, Remotion/FFmpeg, and the
   canonical episode layout that the manual pipeline and both episodes already use.

Where a concern maps to a dedicated Goal 3.0 contract (for example, observability path or revision
budgets), that contract's concrete rule governs over an illustrative sketch in Goal 3.1. Where Goal
3.1 makes an explicit topology or policy statement absent from Goal 3.0 (for example, the parallel
critic fan-out or the L1–L4 unfreeze ladder), Goal 3.1 governs.

### Derived runtime (transparent, not hidden)

Goal 3.1's code blocks are written in Python (`TypedDict`, `.py`, `lg_compat.py`). This is
illustrative schema syntax in an architecture document; Goal 3.1 §1.2–1.3 never lists language choice
as an in-scope decision, and Goal 3.1 §4 defers its contract layer to Goal 3.0. Every binding
authority around that syntax is TypeScript: the repository is TypeScript strict mode, all nine Goal
3.0 contracts express their schemas in TypeScript, the Contract Test Plan's `MockAgent` boundary is
TypeScript, and the manual pipeline that MUST remain operational lives in this same Node project.

Therefore the runtime is **derived**, not chosen: the graph uses the TypeScript LangGraph runtime
(`@langchain/langgraph`) inside the existing Node workspace, and Goal 3.1's `orchestration/lg_compat.py`
becomes `src/orchestration/lg-compat.ts`. This derivation is stated openly so it is auditable; the
only substitution point is a future ADR that deliberately forks a separate Python runtime, which no
current authority requires and which would split the codebase away from the manual pipeline.

## 3. Architecture decision reassessment

Each former blocker is reassessed against the precedence in §2. "Resolved" means the decision is
either derivable from a named authority or explicitly fixed by an accepted ADR. Recording these
choices here is not a hidden decision: every row cites the authority or ADR that resolves it.

| ID      | Former blocker                        | Reassessment                                                                                                                                                                                                                                                                                                                                | Verdict            |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `AD-01` | Architecture authority / precedence   | Resolved by §2. Goal 3.1 is baseline; Goal 3.0 is the constraint layer; repository reality breaks ties. Tracking the design file is a process step, not an architecture blocker.                                                                                                                                                            | Resolved           |
| `AD-02` | Runtime language and packages         | Derived (§2): TypeScript `@langchain/langgraph`; only `lg-compat.ts` imports it directly and exports wrappers/types to `graph/` (Goal 3.1 §7.4). SQLite saver for dev, Postgres for prod (Goal 3.1 §14.2). Minor version pinned.                                                                                                            | Resolved (derived) |
| `AD-03` | `ProductionState` v1 + reducers       | Fully specified: Goal 3.1 §5.1 field set, §5.2 reducer table, §5.3 migration rules. Executed as Zod-validated state with per-field reducers.                                                                                                                                                                                                | Resolved           |
| `AD-04` | Artifact identity / pointers / freeze | Not a conflict; two fidelities of one model. Goal 3.0 `ArtifactRef` + `artifact-index.json` is the executable schema (it is the dedicated contract). Goal 3.1 `latest.json`/`content_manifest.json` are the selected-pointer view and the freeze snapshot layered on top. Lossless field map in [§8.3](#83-legacy-and-identity-mapping).    | Resolved           |
| `AD-05` | Issue taxonomy (9 vs 41)              | Goal 3.0 `critic-output-v1` 41 categories are authoritative (dedicated contract + the routing table is built on them). Goal 3.1's 9 categories are parent families that map onto the 41. `compliance` is the one new family (see `AD-07`).                                                                                                  | Resolved           |
| `AD-06` | Acceptance / best-version algorithm   | Resolved by ADR-003. Regression thresholds, floors, no-progress, oscillation, budgets, and the strategy ladder remain governed by revision-policy-v1 + Goal 3.1 §10.3–10.5. Automatic best promotion uses Pareto dominance; `weighted_score` is reporting-only.                                                                             | Resolved           |
| `AD-07` | Topology / Oral Judge / Compliance    | Goal 3.1 is the approved topology and carries explicit ADRs: §8.3 inlines Oral Judge, §8.4 adds `compliance_check`, §8.2 classifies `gate_evaluator`/`issue_router`/`downstream_refresh`/`compliance_check` as system nodes. Parallel critics are DAG-consistent because critics write only their own reports.                              | Resolved           |
| `AD-08` | Configuration format / drift          | Goal 3.1 §16 fixes the six config namespaces and the "no magic numbers" rule (P8). Serialization is an implementation detail; JSON is used to match existing Zod loaders. Drift is caught by schema validation + version stamping into events.                                                                                              | Resolved           |
| `AD-09` | Checkpoint identity / transaction     | Composed: `thread_id = episode_id` (Goal 3.1 §14.2); `run_id = traceId` and `executionId` per attempt (observability-spec); `approvalEpoch` rules (revision-policy); checkpoint↔filesystem transaction is the failure-modes commit protocol.                                                                                                | Resolved           |
| `AD-10` | Observability path                    | observability-spec is the dedicated contract and reserves `content/<episode>/observability/executions.jsonl`; it governs over Goal 3.1 §15's illustrative `_runs/`. The human `run-report.md` is an additional artifact.                                                                                                                    | Resolved           |
| `AD-11` | Human-decision contract               | Composed: Goal 3.1 §13.1 actions, §13.3 interrupt/`Command(resume=)`, §13.4 edit reflow with `producer="human:{user}"`; reject reasons use the `critic-output-v1` Issue shape; escalation uses revision-policy `HumanEscalation`; recorded as `human-decision` executions in observability.                                                 | Resolved           |
| `AD-12` | Freeze / lock schemas                 | Goal 3.1 §11.2 manifest, §6.3/§13.4 locked-range reflow; lock addressing reuses the `critic-output-v1` locator taxonomy (`line-range`, `json-pointer`, `segment`). Overlap rule: automated revision may not touch a locked range (Goal 3.1 §6.3).                                                                                           | Resolved           |
| `AD-13` | L1–L4 unfreeze                        | Goal 3.1 §11.3 gives the exact repair table, `max_unfreeze` default 1, and the blocker + human-approval gate.                                                                                                                                                                                                                               | Resolved           |
| `AD-14` | Legacy migration scope                | Resolved by baseline-analysis + 3.1.5 finding #4: fixtures are canonical Episode 001/002 (v1) and both nested `v2-goal3` packages; legacy gates stay read-only and gain additive `critic-output-v1` adapters; flat-ID symlinks are lookups, never identity. One importer M1, full backfill M4.                                              | Resolved           |
| `AD-15` | Execution-backend classification      | Resolved by decision-0001 + agent-contract + failure-modes: editorial roles default to manual Codex/file handoffs; `oral-rewriter` may use the existing hosted polish adapter; production is deterministic tools; TTS uses the configured provider + Edge fallback. Stub implements the same boundary for all. No self-hosted models, ever. | Resolved           |
| `AD-16` | Terminal state / publication          | Resolved: the graph stops at human `final_approval`. Goal 3.1's `published` means "approved for a human to publish"; the repository has no upload command and none is added (decision-0001, failure-modes, task constraint).                                                                                                                | Resolved           |

### ADR-003 — Candidate-to-Best Selection Operator

#### Status

Accepted.

#### Decision

ProductionAgent uses Pareto dominance to determine whether a validated candidate replaces the
current best artifact. A candidate is eligible only when:

1. it contains no open blocker;
2. every dimension remains above its configured floor;
3. the targeted dimension improves by at least `target_gain`;
4. no protected dimension regresses beyond its permitted threshold; and
5. it weakly dominates the current best across all comparable dimensions and strictly improves at
   least one dimension.

`weighted_score` is retained for reporting, trend visualization, and human review. It must not
override a dimension regression or determine automatic best-version promotion. Candidates evaluated
with different rubric versions are incomparable.

#### Consequences

- `WP-M2-06` is unblocked.
- `REVISION-001` and `REVISION-005` use Pareto-based fixtures.
- Goal 3.1 §10.2 weighted-score improvement is superseded for automatic selection only. Its blocker,
  floor, targeted-improvement, and regression requirements remain active.

## 4. Reusable current components

"Reusable" means the behavior is correct behind an adapter or as compatibility evidence. It does not
mean the component already implements the target control plane. Paths are current repository files.

| Current component                                                                                                             | Reused as                                                                                                 | Boundary to preserve                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `agents/*.md` (11 role files) + [agent-contract.md](../agent-contract.md)                                                     | Editorial responsibilities and declared handoffs behind `run_agent` adapters                              | Agent logic stays runnable without LangGraph; roles are not redesigned.                          |
| `src/schemas/episode.ts`                                                                                                      | Domain schemas for research, script, captions, timeline, assets                                           | Domain schemas, not `ProductionState` or `artifact-index`.                                       |
| `src/lib/story.ts`                                                                                                            | Legacy gate parsers (`parseCriticGate`, `parseOralReviewGate`, `parseFactCheckGate`, final-script parser) | Legacy readers/adapters; never synthesize missing `critic-output-v1` fields from prose.          |
| `src/lib/workflow.ts`                                                                                                         | `orderedStoryRoles`, `directorWorkflowSchema` — the 11-role order and control record                      | Compatibility input, not a checkpoint or target state.                                           |
| `src/lib/project.ts`                                                                                                          | Repo-root guard, episode selection, `readJson`/`writeJson`/`ensureDir`                                    | Selection is flat-ID and process-global; current writers are not transactional.                  |
| `src/lib/pipeline-v2-config.ts`, `editorial-text-rules.ts`, `production-contract.ts`                                          | Zod-validated JSON config loader pattern and shared production contracts                                  | Reused pattern for orchestration configs; v1 loaders were removed after dependency review.       |
| `src/lib/story-quality.ts`, `captions.ts`, `delivery.ts`, `comparison.ts`                                                     | Pure validation/measurement helpers (score/floor/caption/delivery arithmetic)                             | Keep deterministic and framework-independent; feed the evaluation recompute.                     |
| `src/lib/polish.ts` + `config/polish-v2.json` + Goal 3.2 rewrite files in `prompts/v4/` + unchanged v3 judge files            | The one existing hosted-API bounded generate/judge loop; adapter-shape precedent                          | Not the cross-role revision loop; not permission to couple other agents to LangGraph.            |
| `scripts/validate-*.ts` + `package.json` `validate:*`                                                                         | Manual-compatibility gates (research, workflow, story, content, delivery, comparison)                     | Remain authoritative for `ORCHESTRATOR=manual`; they do not schedule or checkpoint.              |
| `scripts/materialize-story.ts`, `generate-tts.ts`, `build-timeline.ts`, `capture-assets.ts`, `render.ts`, `inspect-output.ts` | Production primitives behind deterministic-tool adapters                                                  | Invoke only through adapters; current direct canonical writes do not satisfy atomic publication. |
| `src/lib/tts-providers.ts` + `config/tts-v2.json`                                                                             | TTS with configured MiniMax provider + Edge neural fallback (failure-modes §TTS)                          | Per-segment caching is a target; the no-key/approved-hosted boundary is permanent.               |
| `src/lib/llm.ts`                                                                                                              | `chatJson<T>` hosted-LLM helper for the optional oral polish adapter                                      | Hosted API only; never a self-hosted model.                                                      |
| Current Vitest suite (10 files, 41 tests)                                                                                     | Regression coverage for legacy parsers, rubric helper, workflow order, captions, delivery, TTS, polish    | Covers legacy shapes; does not implement the `docs/test-plan.md` contract IDs.                   |
| Episode 001/002 canonical + `v2-goal3` packages + flat-ID symlinks                                                            | Real compatibility fixtures with SHA-256-bound gates and finished media                                   | Import is reference-only, `legacy-derived`, non-destructive, alias-aware.                        |

Two current defects are compatibility work, not inherited behaviour:

1. `validate:story` runs `pnpm validate:workflow` without forwarding `--episode`; `LEGACY-005` is
   specified but not implemented. Fixed in `WP-M1-09`.
2. `materialize`, TTS, timeline, render, and polish write canonical files directly. A LangGraph runner
   must wrap these in the publication protocol; direct writes are not committed transactions. Addressed
   by the artifact registry (`WP-M1-04`) and the production adapters (`WP-M3-01`).

## 5. Target modules and responsibilities

All new code lives under `src/orchestration/` so the manual pipeline (`src/lib/`, `scripts/`) is
untouched. Only `src/orchestration/lg-compat.ts` may import `@langchain/langgraph` directly. Modules
under `src/orchestration/graph/` must import LangGraph wrappers and exported types only from
`lg-compat.ts`.

| Module                                   | Responsibility                                                                                                                                                                                    | Authority                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/orchestration/lg-compat.ts`         | Sole direct `@langchain/langgraph` import surface; wraps and exports `interrupt`, command/retry/cache abstractions, saver factories, and the graph-facing types required by `graph/`.             | Goal 3.1 §7.4                                          |
| `src/orchestration/schemas/`             | Zod schemas: `artifact-ref`, `artifact-index`, `critic-output` (issue/evaluation/route), `production-state`, `budget`, `revision-ledger`, `human-decision`, `execution-event`, `freeze-manifest`. | Goal 3.0 contracts (executable form)                   |
| `src/orchestration/state.ts`             | `ProductionState` type, phase enum, controlled-summary limits.                                                                                                                                    | Goal 3.1 §5.1; artifact-contract §Controlled summaries |
| `src/orchestration/reducers.ts`          | `mergeArtifacts`, `pickBest`, `appendDedupe`, `upsertIssues`, `dictMerge`, `mergeBudget`, first-write-immutable, `max`.                                                                           | Goal 3.1 §5.2                                          |
| `src/orchestration/artifact-registry.ts` | `ArtifactRef` build + SHA-256, `artifact-index.json` read/write, dependency DAG, transitive stale set, candidate→quarantine→promote transaction.                                                  | Artifact Contract                                      |
| `src/orchestration/evaluation.ts`        | Recompute dimensions, floors, normalized total, blockers, PASS/REJECT — never trust model arithmetic.                                                                                             | Evaluation Rubric; Critic Output Schema                |
| `src/orchestration/routing.ts`           | Pure `selectPrimaryRoute()` over structured issues, provenance, budget, fixed table; legacy `returnTo` mapping.                                                                                   | Routing Policy                                         |
| `src/orchestration/revision.ts`          | Budgets, hard/score regression, no-progress, oscillation, strategy ladder L0–L4, best-per-epoch tracking, and ADR-003 Pareto selection.                                                           | Revision Policy; Goal 3.1 §10; ADR-003                 |
| `src/orchestration/freeze.ts`            | Freeze preconditions, `content_manifest.json`, locked-range enforcement, L1–L4 unfreeze request/approval.                                                                                         | Goal 3.1 §11                                           |
| `src/orchestration/checkpoint.ts`        | Persistent saver adapter, commit protocol (intent→validate→temp→fsync→promote→marker→event), recovery ladder.                                                                                     | Failure Modes §Checkpoint; Goal 3.1 §14                |
| `src/orchestration/observability.ts`     | `agent-execution-event-v1` emitter, append-only JSONL sink, redaction, completeness gate, `run-report.md`.                                                                                        | Observability Spec; Goal 3.1 §15                       |
| `src/orchestration/agents/run-agent.ts`  | Framework-neutral `AgentExecutionRequest → AgentExecutionResult`. MUST NOT import LangGraph.                                                                                                      | Agent Contract; Goal 3.1 §4.4                          |
| `src/orchestration/agents/stub.ts`       | Deterministic fixture backend for every role and system node.                                                                                                                                     | Goal 3.1 §17; test-plan Mock agents                    |
| `src/orchestration/agents/adapters/`     | `manual-file`, `hosted-polish`, `deterministic-tool` backends behind `run-agent`.                                                                                                                 | `AD-15`; decision-0001                                 |
| `src/orchestration/nodes/`               | `productionNode()` wrapper (stale guard → cache → `run_agent` → validate → publish → propagate → cost → event) + node registry. Returns partial state only.                                       | Goal 3.1 §8                                            |
| `src/orchestration/graph/`               | `content-subgraph.ts`, `production-subgraph.ts`, `main-graph.ts`; consumes graph wrappers and exported types from `lg-compat.ts`, never `@langchain/langgraph` directly.                          | Goal 3.1 §7, §7.4                                      |
| `src/orchestration/legacy-import.ts`     | Synthesize `legacy-derived` `ArtifactRef`s and execution records from current packages; alias-aware.                                                                                              | Artifact/Observability legacy rules; `AD-14`           |
| `src/orchestration/config/`              | Loaders for `config/{ownership,routing,budget,models,rubric,thresholds}.json`, version-stamped.                                                                                                   | Goal 3.1 §16                                           |
| `src/orchestration/entry.ts`             | `ORCHESTRATOR=manual\|langgraph` dispatch; default and invalid-value behaviour.                                                                                                                   | Goal 3.1 §18; `REQ-015`                                |

## 6. Milestones

Milestone names, ordering, and exit criteria follow the 3.1.5 MVP scope and Goal 3.1 §18.

| Milestone | Outcome                                                                                                                                                                                               | Depends on                     | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------ |
| **M1**    | Deterministic graph skeleton with Stub agents: reference-only state, reducers, artifact registry, two stub `interrupt()` gates, checkpointed pause/resume, one legacy import, validators still green. | —                              | Ready  |
| **M2**    | Content evaluation and bounded single-owner revision loop: common critic envelope, deterministic route, downstream refresh, Pareto best selection, freeze manifest, locked ranges.                    | M1                             | Ready  |
| **M3**    | Formal HITL and production: `HumanDecision`, content/final approval semantics, human reject/edit handling, approval epochs, frozen-manifest-only production, L1–L4 repair, idempotent resume.         | M2                             | Ready  |
| **M4**    | Persistence, caching, observability, and migration hardening: production saver, migrations, event completeness, segment/shot caches, full replay/failure suite, full legacy backfill.                 | M3 (parts parallel with M2/M3) | Ready  |

**HITL ownership boundary:** M1 owns only the two gate locations, stub `interrupt()` calls, pause,
checkpoint, and resume plumbing. M3 keeps those locations and plumbing intact, then adds the formal
`HumanDecision` schema, reject-Issue handling, direct-edit versioning and locks, approval-epoch
transitions, and content/final approval semantics. M3 extends the M1 skeleton; it does not replace it.

## 7. Work packages

Each work package is intended as one focused pull request. `Tests` names concrete files under
`tests/orchestration/` (all **to implement** unless marked _existing_) and the contract IDs from
[test-plan.md](../test-plan.md) they satisfy. Default command for new tests:
`node_modules/.bin/vitest run <path>` (equivalently `pnpm test` for the whole suite).

### M1 — Deterministic graph skeleton with Stub agents

| WP         | Scope & target modules                                                                                                                                                                                                                                                                  | Depends on                         | Tests (file → contract IDs)                                                                                                              | Acceptance criterion                                                                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WP-M1-01` | Shared Zod schemas: `ArtifactRef`, `ArtifactIndex`, `critic-output-v1` (issue/evaluation/route), `execution-event`. `schemas/`.                                                                                                                                                         | —                                  | `schemas.artifact.test.ts`, `schemas.critic-output.test.ts` → `SCHEMA-001..011`, `SCHEMA-004`                                            | Every field/enum from the contracts parses; each negative case rejects with the exact error code required by `SCHEMA-002/003/005/006`.                                                                                                                                                                           |
| `WP-M1-02` | `ProductionState` + phase enum + controlled-summary guard; reducer set. `state.ts`, `reducers.ts`.                                                                                                                                                                                      | `WP-M1-01`                         | `reducers.test.ts` → reducer property tests; `state-body-leak.test.ts` → `ARTIFACT-010`, `GOLDEN-001` assertion 11                       | Reducers pass commutativity, idempotency, JSON-serializability (Goal 3.1 §5.2); a scan of any state/checkpoint finds no artifact body.                                                                                                                                                                           |
| `WP-M1-03` | Config loaders + the six `config/*.json` with defaults and version IDs. `config/`.                                                                                                                                                                                                      | `WP-M1-01`                         | `config.test.ts` → ownership-table coverage precheck for `ROUTE-001`                                                                     | Each config validates; every `critic-output-v1` category has exactly one owner in `ownership.json`; versions are load-stamped.                                                                                                                                                                                   |
| `WP-M1-04` | Artifact registry: build/hash `ArtifactRef`, `artifact-index.json` I/O, dependency DAG, transitive stale set, candidate→quarantine→promote. `artifact-registry.ts`.                                                                                                                     | `WP-M1-01`                         | `artifact-registry.test.ts` → `ARTIFACT-001..009`                                                                                        | All restart classes in artifact-contract invalidate transitively; same bytes → same revision; multi-file partial publish selects neither file.                                                                                                                                                                   |
| `WP-M1-05` | `run_agent` boundary + deterministic Stub backend for every role and system node. `agents/run-agent.ts`, `agents/stub.ts`.                                                                                                                                                              | `WP-M1-01`                         | `run-agent-boundary.test.ts`, `stub-agents.test.ts` → Mock-agent boundary suite                                                          | `run-agent.ts` imports no LangGraph symbol; stub returns fixtures for all 11 roles + system nodes offline.                                                                                                                                                                                                       |
| `WP-M1-06` | `productionNode()` wrapper + node registry; partial-update contract. `nodes/`.                                                                                                                                                                                                          | `WP-M1-04`, `WP-M1-05`             | `node-wrapper.test.ts` → full-state-return rejection; role-to-node bijection (`REQ-009`)                                                 | Every node returns a partial dict; returning full state is rejected; the 11 roles map to nodes with no silent redesign (Oral Judge inlined per Goal 3.1 §8.3).                                                                                                                                                   |
| `WP-M1-07` | Persistent checkpoint adapter (SQLite dev) + commit protocol + recovery ladder. `checkpoint.ts`, `lg-compat.ts` saver factory.                                                                                                                                                          | `WP-M1-04`                         | `checkpoint-resume.test.ts` → `REPLAY-002`, `FAILURE-007/008`                                                                            | Resume after each lifecycle boundary reruns no already-valid node; intent-without-marker restores prior pointers; corrupt marker restores earlier verified checkpoint.                                                                                                                                           |
| `WP-M1-08` | Minimal append-only event sink + emitter (subset of `agent-execution-event-v1`). `observability.ts`.                                                                                                                                                                                    | `WP-M1-01`                         | `event-sink.test.ts` → observability append-only + redaction subset                                                                      | Events are append-only JSONL at `content/<episode>/observability/executions.jsonl`; no artifact body or secret pattern appears.                                                                                                                                                                                  |
| `WP-M1-09` | Fix `validate:story` to forward `--episode` to nested `validate:workflow`. `package.json`, `scripts/validate-story.ts`.                                                                                                                                                                 | —                                  | `wrapper-episode.test.ts` → `LEGACY-005` _(currently specified, not implemented)_                                                        | A non-default episode reaches every nested validator; the test fails if a wrapper validates the default workflow while validating another episode's story.                                                                                                                                                       |
| `WP-M1-10` | Legacy importer for **one** episode package (`episode-001` v1). `legacy-import.ts`.                                                                                                                                                                                                     | `WP-M1-04`, `WP-M1-08`             | `legacy-import.test.ts` → `LEGACY-003`                                                                                                   | Imported refs are `legacy-derived`; unknown model/token/cost/duration are explicit `null`; import mutates no source bytes (before/after hash equal).                                                                                                                                                             |
| `WP-M1-11` | Happy-path topology: `content-subgraph` (stub, revision edges disabled), `freeze` stub, `production-subgraph` (stub), two stub `interrupt()` gates, `publish` terminal (no upload). `graph/`, `entry.ts`. No formal `HumanDecision` schema or production approval semantics land in M1. | `WP-M1-06`, `WP-M1-07`, `WP-M1-08` | `golden-skeleton.test.ts` → `GOLDEN-001` assertions 1–12; `orchestrator-switch.test.ts` → `REQ-015`; `langgraph-import-boundary.test.ts` | A synthetic fixture and imported `episode-001` pause at both stub gates, persist the checkpoint, resume without rerunning valid nodes, and finish with identical selected refs. Only `lg-compat.ts` imports `@langchain/langgraph`; `graph/` consumes its wrappers/types. Formal gate semantics remain M3 scope. |

**M1 exit:** `GOLDEN-001` passes for one synthetic and one legacy-derived episode; both pause and
resume at the two stub gate locations without rerunning valid nodes; state contains references only;
existing validators remain green (`ARTIFACT-010`, `REPLAY-002`, `LEGACY-005` implemented). M1 proves
only the interrupt/checkpoint/resume skeleton. It does not define `HumanDecision`, reject/edit
handling, approval epochs, or production-stage approval semantics.

### M2 — Content evaluation and revision loop

| WP         | Scope & target modules                                                                                                                                                                                                | Depends on                         | Tests (file → contract IDs)                                                                  | Acceptance criterion                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WP-M2-01` | Real content-node adapters (`manual-file` default; optional `hosted-polish` for `oral-rewriter`). `agents/adapters/`.                                                                                                 | `WP-M1-05`                         | `adapters.test.ts` → adapter validation; `REPLAY-004` boundary                               | Adapters satisfy the same `run_agent` contract as stub; hosted adapter is opt-in and network-gated; no self-hosted model path exists.                                                                                                             |
| `WP-M2-02` | Common critic envelope + `evaluation.ts` recompute for all five critics + legacy `returnTo` adapters. `evaluation.ts`, `schemas/`.                                                                                    | `WP-M1-01`, `WP-M1-03`             | `rubric-recompute.test.ts` → `RUBRIC-001..011`; `legacy-envelope.test.ts` → `LEGACY-001/002` | Every critic total/floor/blocker is recomputed, not trusted; additive `critic-output-v1` fields do not break legacy Zod readers.                                                                                                                  |
| `WP-M2-03` | Pure routing: `selectPrimaryRoute()` + ownership table + provenance + budget gate. `routing.ts`.                                                                                                                      | `WP-M1-03`, `WP-M2-02`             | `routing.test.ts` → `ROUTE-001..013` + permutation property test                             | Every category routes to exactly one owner; identical issue sets route identically under any permutation; unknown provenance escalates, never guesses.                                                                                            |
| `WP-M2-04` | Fan-out topology: `visual_director` → parallel `{audience, retention, fact, compliance}` → `gate_evaluator` → `issue_router` → single-owner revise → `downstream_refresh` → rerun all critics. `content-subgraph.ts`. | `WP-M1-11`, `WP-M2-03`             | `content-loop.test.ts` → `GOLDEN-002`                                                        | One `attention.hook` issue routes to Viral Director, marks Script Writer onward stale, reruns all critics, closes the issue, and completes.                                                                                                       |
| `WP-M2-05` | Revision ledger + budgets + hard/score regression + no-progress + oscillation + strategy ladder L0–L4. `revision.ts`, `schemas/revision-ledger`.                                                                      | `WP-M2-02`                         | `revision-detect.test.ts` → `REVISION-002..011`                                              | Fact-blocker candidate rejected; `A→B→A` warns and keeps best; `A→B→A→B` escalates; 3rd creative reject exhausts budget; invalid attempts consume no creative budget.                                                                             |
| `WP-M2-06` | **Best-version selection operator.** `revision.ts` `selectBest()`, implementing ADR-003 Pareto dominance.                                                                                                             | `WP-M2-05`                         | `revision-select.test.ts` → `REVISION-001`, `REVISION-005`                                   | A candidate is promoted only with no blocker/floor break, `target_gain` met, no protected regression beyond its permitted threshold, and Pareto dominance; different-rubric candidates are incomparable. `weighted_score` never selects the best. |
| `WP-M2-07` | Content freeze preconditions + `content_manifest.json` creation + `locked_ranges` enforcement. `freeze.ts` (freeze half). Formal human decisions and direct-edit ingestion remain `WP-M3-04`.                         | `WP-M2-04`, `WP-M2-06`, `WP-M1-07` | `freeze-content.test.ts` → freeze preconditions; `locked-range.test.ts` → lock enforcement   | Freeze is refused while any artifact is `stale` or any blocker/major remains open; the manifest binds selected refs; automated revision cannot overwrite an existing locked range.                                                                |

**M2 exit:** a structured content issue routes to exactly one owner, changes only authorized
artifacts, marks descendants stale, reruns required gates, selects the best valid version through
ADR-003 Pareto dominance, and produces a freeze-ready manifest; no artifact body enters state. Formal
human approval, rejection, and direct-edit semantics are deliberately deferred to `WP-M3-04`.

### M3 — Freeze, production, and HITL

| WP         | Scope & target modules                                                                                                                                                                                                                                                                                                      | Depends on             | Tests (file → contract IDs)                                                                                                        | Acceptance criterion                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WP-M3-01` | Deterministic production adapters wrapping materialize/TTS/timeline/captions/asset/render/inspect in the publication protocol. `agents/adapters/deterministic-tool.ts`.                                                                                                                                                     | `WP-M1-04`, `WP-M3-04` | `production-adapters.test.ts` → `ARTIFACT-006`, partial-stage recovery                                                             | Production starts only after a formal content-approval decision and reads only its frozen manifest, never mutable selected pointers; an incomplete MP4 is never selected.                                                                                               |
| `WP-M3-02` | Production subgraph over `materialize → validate content → capture → TTS → timeline → smoke/vertical render → inspect → delivery`, with deterministic delivery repair routing (no unfreeze). `graph/production-subgraph.ts`, `schemas/production.ts`.                                                                       | `WP-M3-01`, `WP-M2-03` | `delivery-loop.test.ts` → `GOLDEN-003`                                                                                             | A `delivery.caption-split` creates a structured issue, routes uniquely to `production-executor`, reruns the minimum timeline-to-delivery closure, marks downstream artifacts stale, and stops at `production-ready` or bounded human escalation.                        |
| `WP-M3-03` | L4 `UnfreezeRequest`/decision artifacts, scoped human interrupt, approval-epoch transition, content-gate refreeze, minimum-stage resume, and retained stale media. `schemas/unfreeze.ts`, `freeze.ts`, `graph/production-subgraph.ts`.                                                                                      | `WP-M3-02`, `WP-M2-05` | `unfreeze.test.ts` → request authorization, pause/approve/reject, stale closure                                                    | L4 needs an open blocker + human approval + `unfreeze_used < max_unfreeze`; only explicitly authorized frozen content artifact/owner pairs may change; content validators/critics must pass before a new epoch is frozen; old production artifacts remain retained.     |
| `WP-M3-04` | Formal `HumanDecision` schema and handlers for content, unfreeze, and final approval: approve, reject-as-Issue, direct edit as a new locked artifact version, approval-epoch transitions, and production-stage authorization. `schemas/human-decision`, `freeze.ts`, `graph/main-graph.ts`, `graph/production-subgraph.ts`. | `WP-M1-11`, `WP-M2-07` | `hitl.test.ts` → contract validation plus pause/restart/resume at content/final and formal unfreeze coverage; `REQ-017`, `REQ-020` | M3 replaces no gate location or resume plumbing from M1: it supplies formal payloads and semantics. Reject creates a structured Issue; direct edit creates a hashed locked version; approval advances the epoch; final approval performs no network/upload side effect. |

**M3 exit:** both formal human gates use `HumanDecision` and the M1 pause/resume skeleton; a frozen
manifest approved in the current epoch is the only production input; reject/edit actions preserve
Issue and artifact provenance; a delivery issue reruns the minimum valid closure; a story/fact issue
cannot unfreeze automatically; resume is idempotent; final approval performs no external upload.

### M4 — Persistence, caching, observability, and migration hardening

| WP         | Scope & target modules                                                                                                                                                              | Depends on             | Tests (file → contract IDs)                                                        | Acceptance criterion                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WP-M4-01` | Production checkpoint backend (Postgres saver) behind the same interface + state/checkpoint schema migrations. `checkpoint.ts`, `schemas/migrations/`.                              | `WP-M1-07`             | `checkpoint-migration.test.ts` → schema-migration + `FAILURE-008`                  | A `minor` schema bump migrates a stored checkpoint; a `major` mismatch refuses resume with a clear error; in-flight episodes block a `major` bump.                                            |
| `WP-M4-02` | **Implemented:** full failure-injection + replay suite. `checkpoint.ts`, `revision.ts`, `agents/`, `replay.ts`.                                                                     | `WP-M2-05`, `WP-M3-02` | `failure-suite.test.ts` → `FAILURE-001..012`; `replay.test.ts` → `REPLAY-001..006` | Bounded retries, one contract-repair, fake-clock delays, redaction, strict checkpoint/artifact/log verification, and no-duplicate resume all hold; tampered inputs cannot approve an episode. |
| `WP-M4-03` | **Implemented:** segment-level TTS cache + shot-level asset cache + cache-key events. `agents/adapters/deterministic-tool.ts`, `src/lib/fine-grained-cache.ts`, `observability.ts`. | `WP-M3-01`             | `cache.test.ts` → per-segment/per-shot cache keys                                  | Changing one narration segment resynthesizes only that segment; a cache hit is logged with cost 0 and never bypasses aggregate validation.                                                    |
| `WP-M4-04` | **Implemented:** observability completeness gate + `run-report.md` + derived views. `observability.ts`, `observability-gate.ts`, `schemas/execution-event.ts`.                      | `WP-M1-08`             | `observability-complete.test.ts` → completeness/redaction; `REPLAY-003`            | Before approval, every stage has a terminal event and committed checkpoint; usage availability is explicit; `observability-degraded` blocks approval until repaired.                          |
| `WP-M4-05` | Full legacy backfill: both episodes' v1 + `v2-goal3` packages, alias-aware. `legacy-import.ts`.                                                                                     | `WP-M1-10`             | `legacy-backfill.test.ts` → `LEGACY-001..004` for both episodes                    | Every named package imports as `legacy-derived` with byte-hash equal before/after; flat-ID symlinks resolve without becoming artifact identity.                                               |
| `WP-M4-06` | Multi-episode isolation + per-episode lock + controlled concurrency. `entry.ts`, `checkpoint.ts`.                                                                                   | `WP-M4-01`             | `concurrency.test.ts` → per-episode lock, no version race                          | Two runs of one episode cannot both advance a revision; global concurrency respects a configured cap.                                                                                         |

**M4 exit:** the full contract test plan passes network-free with stubs; current episode gates still
pass; migrations restore historical checkpoints; injected failures cannot silently approve, overwrite,
or publish stale artifacts.

## 8. Dependencies, critical path, and parallel work

### 8.1 Critical path

```text
WP-M1-01 (schemas)
  → WP-M1-04 (artifact registry)      → WP-M1-07 (checkpoint) ┐
  → WP-M1-02 (state/reducers)                                  ├→ WP-M1-11 (skeleton graph, M1 exit)
  → WP-M1-05 (run_agent + stub) → WP-M1-06 (node wrapper) ─────┘
      → WP-M2-02 (evaluation) → WP-M2-03 (routing) → WP-M2-04 (content loop)
          → WP-M2-05 (regression) → WP-M2-06 (Pareto selection) → WP-M2-07 (freeze)
              → WP-M3-04 (formal HITL) → WP-M3-01 (production adapters)
                  → WP-M3-02 (delivery loop) → WP-M3-03 (unfreeze) → M3 exit
                      → WP-M4-02 (failure/replay) → M4 exit
```

`WP-M1-01` is the universal prerequisite. The registry, state, and node stack form the M1 spine.
ADR-003 fixes the selection policy consumed by `WP-M2-06`; no unresolved architecture decision sits
on or off the critical path.

### 8.2 Safe parallel lanes

Once `WP-M1-01` merges, these run concurrently without touching each other's files:

- **Lane A (control plane):** `WP-M1-02` (reducers), `WP-M1-04` (registry).
- **Lane B (agents):** `WP-M1-05` (run_agent + stub).
- **Lane C (config):** `WP-M1-03`.
- **Lane D (compatibility):** `WP-M1-09` (wrapper fix) — no dependency on the new schemas at all; can
  merge first.
- **Lane E (observability):** `WP-M1-08`.

Within M2, `WP-M2-03` starts only after `WP-M2-02`: routing consumes the structured issues normalized
and recomputed by `evaluation.ts`. They are not parallel lanes.
Within M4, `WP-M4-03` (caches) and `WP-M4-05` (legacy backfill) are independent of `WP-M4-02`.

### 8.3 Legacy and identity mapping

Goal 3.1 §4.1 fields map losslessly onto the Goal 3.0 `ArtifactRef` (the executable form):

| Goal 3.1 §4.1           | Goal 3.0 `ArtifactRef` / `ArtifactIndex`                         |
| ----------------------- | ---------------------------------------------------------------- |
| `name`                  | logical part of `artifactId` (`<episode>:<area>:<logical-name>`) |
| `version`               | `revision`                                                       |
| `sha256`                | `sha256`                                                         |
| `depends_on`            | `dependencies[].{artifactId,path,sha256,relation}`               |
| `stale`                 | `state: "stale"`                                                 |
| `locked_ranges`         | lock metadata addressed by `critic-output-v1` locators           |
| `latest.json`           | `ArtifactIndex.selected`                                         |
| `content_manifest.json` | separate freeze control artifact (Goal 3.1 §11.2)                |

## 9. Compatibility, rollback, and preserved constraints

### 9.1 Manual pipeline compatibility

- `ORCHESTRATOR=manual` runs the existing `pnpm` commands and `validate:*` gates against current
  canonical paths, with no LangGraph, state, migration, or checkpointer required. This is the default
  and remains the compatibility authority until a separately approved cutover.
- `ORCHESTRATOR=langgraph` schedules the same agent and production boundaries only after the relevant
  milestone passes. It never makes artifacts secondary to state.
- An absent or invalid `ORCHESTRATOR` value falls back to `manual` (`WP-M1-11` `orchestrator-switch.test.ts`).

### 9.2 Rollback

- Switching back to `manual` never rewrites or deletes Episode 001/002 artifacts, selected/best
  history, rejected candidates, or media.
- Rollback starts from the last verified artifact/control commit, revalidates hashes and current
  gates, then uses the existing manual entry points. Event logs never repair or approve state
  (Failure Modes §Recovery).
- In-flight LangGraph work rolls back to the previous committed checkpoint's selected pointers;
  pointer promotion is a file operation, never a Git history rewrite.

### 9.3 Episode 001 / 002 artifact compatibility

- Import is reference-only and `legacy-derived`; `WP-M1-10` (one episode) and `WP-M4-05` (both,
  including `v2-goal3` packages) assert byte-hash equality before and after import.
- Flat-ID symlink aliases resolve as lookups; they never become artifact identity.
- All existing SHA-256-bound gates and finished media stay valid and untouched.

### 9.4 Preserved constraints (mapped to enforcement)

| Constraint                                               | Enforced by                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Artifacts remain the source of truth                     | `artifact-registry.ts`; `GOLDEN-001` assertions 3–4, 9, 11                                                                           |
| State holds references + controlled summaries only       | `state.ts` guard; `WP-M1-02` `state-body-leak.test.ts`; `ARTIFACT-010`                                                               |
| LangGraph dependency isolated behind compatibility layer | Import-scan asserts only `lg-compat.ts` imports `@langchain/langgraph`; `graph/` imports its wrappers/types (`WP-M1-05`, `WP-M1-11`) |
| Routing is deterministic                                 | `routing.ts` pure function; `ROUTE-001..013` + permutation property test                                                             |
| Nodes return partial state updates                       | `productionNode()` full-state-return rejection (`WP-M1-06`)                                                                          |
| Stub mode completes before real model integration        | M1 uses `stub.ts` only; adapters land in `WP-M2-01`                                                                                  |
| Existing role responsibilities not redesigned            | role-to-node bijection test; Oral Judge inlined per Goal 3.1 §8.3, rubric unchanged                                                  |
| Manual pipeline operational throughout                   | `ORCHESTRATOR=manual` default; `LEGACY-004` keeps `validate:*` green                                                                 |
| No external publication authorized                       | terminal at `final_approval`; `REQ-020` no-upload assertion                                                                          |
| No self-hosted GPT/LLM/speech model                      | adapters allow only manual-file, approved hosted API, deterministic tools (`AD-15`, decision-0001)                                   |

## 10. Existing vs. to-implement tests

**Existing** (`node_modules/.bin/vitest run`, or `pnpm test` — 10 files, 41 tests, currently green):
`captions.test.ts`, `creative-roles.test.ts`, `delivery.test.ts`, `director-workflow.test.ts`,
`oral-review-rubric.test.ts`, `polish.test.ts`, `research-schema.test.ts`, `story-pipeline.test.ts`,
`story-quality.test.ts`, `tts.test.ts`. Plus the manual gates `pnpm validate:{research,workflow,story,content,delivery,comparison}`.
These cover legacy shapes and stay as regression + `LEGACY-004` compatibility evidence.

**To implement** (none exist yet — every contract ID below is a design requirement, not a passing
test): all `SCHEMA-*`, `RUBRIC-*` (as recompute tests, distinct from the existing rubric helper
coverage), `ROUTE-*`, `ARTIFACT-*`, `REVISION-*`, `REPLAY-*`, `FAILURE-*`, `GOLDEN-001..003`, and
`LEGACY-001..005`. `LEGACY-005` is specified in the current repo but not implemented; it lands in
`WP-M1-09`. Each work package in §7 names the file that will implement its IDs.

Passing the existing suite proves the manual pipeline is healthy; it does not prove state-merge
safety, deterministic routing, checkpoint recovery, HITL resume, freeze isolation, revision
convergence, or event completeness. Those require the to-implement tests above.

## 11. ADR-003 implementation conditions

`WP-M2-06` must encode the five eligibility conditions in ADR-003 as independent assertions. Its
fixtures must prove that `weighted_score` cannot compensate for a protected-dimension regression,
that meeting `target_gain` alone is insufficient without Pareto dominance, and that candidates with
different rubric versions are incomparable. No milestone or work package is blocked on an unresolved
architecture decision.
