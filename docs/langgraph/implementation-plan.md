# Goal 3.2A LangGraph Implementation Plan

- Status: **BLOCKED — architecture decisions required**
- Scope: planning only; no LangGraph code or architecture redesign
- Review date: 2026-08-04
- Stop authority: [Goal 3.1.5 Implementation Readiness Review](../goal-3.1.5-implementation-readiness.md)

## Stop decision

An implementation-ready plan cannot be produced from the current authorities without making hidden
architecture decisions. The readiness review explicitly classifies the repository as
“contract-prepared but not implementation-ready,” says Questions 1–10 block M1, and identifies six
additional decisions that block M2 or M3.

This document therefore records the blockers, the verified reusable baseline, and the conditions for
resuming Goal 3.2A. It intentionally does **not** choose target modules, LangGraph packages, state
fields, reducers, persistence backends, pointer layouts, routing taxonomies, graph edges, work
packages, or acceptance algorithms. M1–M4 remain unplanned until the decisions below are added to a
versioned architecture authority.

## Inputs reviewed

The review used the current working-tree bytes, including uncommitted files. Hashes below bind this
stop decision to those exact inputs; they do not make an untracked document repository-authoritative.

| Input                       | Status observed                                                                                           | SHA-256                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Goal 3.1 architecture v0.2  | File says `Draft for Review`; file is untracked                                                           | `f0024c5e2b6e014df1e62719b38aa4cd62b84dbce5fc36aa6767715e9147bd31` |
| Goal 3.1.5 readiness review | Untracked; verdict is not implementation-ready                                                            | `f546ac93dd3ba1a41239e5225ec7f04d8ed25d87f24a7efcaacf38a7569a1fc9` |
| Goal 3.0 contract set       | Nine normative documents; some have working-tree changes                                                  | See the individual files listed below                              |
| Current runtime             | TypeScript strict mode, Node 22+, pnpm, Zod, Vitest, Remotion and FFmpeg                                  | `package.json`, `tsconfig.json`, `requirements.txt`                |
| Current implementation      | Artifact parsers, validators, manual workflow, polish loop and production commands                        | `src/`, `scripts/`, `agents/`, `config/`                           |
| Current tests               | Ten Vitest files; no control-plane, reducer, route-table, checkpoint, HITL or replay implementation tests | `tests/`                                                           |
| Compatibility fixtures      | Episode 001 and 002 plus current nested `v2-goal3` packages and flat-ID symlink aliases                   | `content/`                                                         |

The Goal 3.0 set reviewed was:

- [Agent Contract](../agent-contract.md)
- [Artifact Contract](../artifact-contract.md)
- [Critic Output Schema](../critic-output-schema.md)
- [Evaluation Rubric](../evaluation-rubric.md)
- [Routing Policy](../routing-policy.md)
- [Revision Policy](../revision-policy.md)
- [Observability Specification](../observability-spec.md)
- [Failure Modes and Recovery](../failure-modes.md)
- [Contract Test Plan](../test-plan.md)

## Architecture decision blockers

`AD-01` through `AD-10` block M1. The remaining decisions block a complete M2/M3 plan and therefore
also prevent this document from assigning all requested pull requests, tests, and acceptance
criteria.

| ID      | Decision required                                                                                                                                               | Conflicting or incomplete authorities                                                                                                                                                                            | Earliest blocked milestone                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `AD-01` | Name one tracked, versioned implementation authority and define precedence or translations between Goal 3.1 and Goal 3.0.                                       | Goal 3.1 v0.2 is untracked and marked draft; Goal 3.0 files are normative and define incompatible contracts.                                                                                                     | M1                                         |
| `AD-02` | Select the graph runtime language, exact LangGraph package/minor version, compatibility boundary, and approved local/production saver packages.                 | The repository is TypeScript; Goal 3.1 specifies Python `TypedDict`, `.py` migrations and `lg_compat.py`; no LangGraph dependency exists.                                                                        | M1                                         |
| `AD-03` | Freeze `ProductionState` v1, its phase machine, every reducer, controlled-summary limits, and checkpoint migration rules.                                       | Goal 3.1 contains one state sketch; Goal 3.0 has no executable state schema; current `director-workflow-v1` has only coarse legacy status.                                                                       | M1                                         |
| `AD-04` | Select the artifact identity, version, selected/best pointer, dependency, freeze-manifest and atomic-publication model.                                         | Goal 3.1 uses `name`, `version`, `depends_on`, version directories and `latest.json`; Goal 3.0 reserves `artifactId`, `revision`, dependency entries and `artifact-index.json` while preserving canonical paths. | M1                                         |
| `AD-05` | Select one Issue/Evaluation schema or approve a versioned, lossless translation.                                                                                | Goal 3.1 has 9 broad categories, 3 severities and different status/locator fields; `critic-output-v1` has 41 categories, 5 severities and different owner/route semantics.                                       | M1                                         |
| `AD-06` | Select the candidate-acceptance and best-version algorithm.                                                                                                     | Goal 3.1 requires weighted improvement with `epsilon`, `max_drop` and `target_gain`; `revision-policy-v1` requires Pareto dominance and critic-specific regression thresholds.                                   | M1                                         |
| `AD-07` | Freeze graph topology and classify editorial versus system nodes.                                                                                               | Goal 3.1 inlines Oral Judge, adds Compliance Check and parallelizes critics after Visual Director; Goal 3.0 fixes 11 roles in `Oral → Audience → Fact → Visual → Retention` order.                               | M1                                         |
| `AD-08` | Select executable configuration format, ownership of defaults, versioning, and drift detection.                                                                 | Goal 3.1 proposes YAML; current loaders use JSON and some policy lives in TypeScript/Markdown; no orchestration configuration exists.                                                                            | M1                                         |
| `AD-09` | Define `thread_id`, `run_id`, approval epoch, checkpoint namespace, filesystem transaction boundary, lock semantics, and recovery ordering.                     | Goal 3.1 says `thread_id = episode_id`; repeated runs and approval epochs are not resolved; Goal 3.0 defines a filesystem commit protocol but no LangGraph/checkpointer transaction relationship.                | M1                                         |
| `AD-10` | Select the canonical event-log path and per-run/per-episode retention model.                                                                                    | Goal 3.1 uses `_runs/{run_id}/events.jsonl`; `agent-execution-event-v1` reserves `observability/executions.jsonl`.                                                                                               | M1                                         |
| `AD-11` | Define the human-decision schema, actor identity, authorization boundary, review payload, decision artifact and resume behavior.                                | Goal 3.1 names actions but does not define a repository contract; current human reviews are manual files with no interrupt/resume state.                                                                         | M2                                         |
| `AD-12` | Define freeze and lock schemas, paths and locator semantics for Markdown/JSON, including overlap and intentional unlock rules.                                  | Goal 3.1 gives an illustrative manifest and line ranges; Goal 3.0 has approval epochs but no complete freeze/lock contract.                                                                                      | M2                                         |
| `AD-13` | Freeze L1–L4 classification, unfreeze authority, `max_unfreeze`, approval-epoch transition and stale-media treatment.                                           | Goal 3.1 proposes a policy; it is not represented in the Goal 3.0 route taxonomy or executable config.                                                                                                           | M3                                         |
| `AD-14` | Select exact legacy import fixtures, additive critic adapters, provenance rules, and treatment of flat-ID symlink aliases.                                      | Canonical Episode 001/002, nested `v2-goal3` packages and aliases coexist; current resolution accepts only flat IDs.                                                                                             | M1 for one importer; M4 for full migration |
| `AD-15` | Classify every role backend as manual Codex/file handoff, hosted adapter or deterministic tool, while preserving Stub parity and the ban on self-hosted models. | Goal 3.1 assumes `run_agent`; current roles are mostly manual, `pnpm polish` is a hosted API loop, and production stages are scripts.                                                                            | M2                                         |
| `AD-16` | Define the terminal state and formalize whether final approval means “approved for human publication” only.                                                     | Goal 3.1 shows `publish → published`; current repository authority permits no external upload.                                                                                                                   | M3                                         |

These decisions must be made in the architecture/ADR layer. Recording a choice only in this
implementation plan would violate the requested stop condition and Goal 3.1’s own rule that contract
changes require ADRs.

## Verified reusable baseline

The following components can be reused regardless of the blocked choices. “Reusable” means the
behavior is useful behind an adapter or as compatibility evidence; it does not mean the component
already implements the target control plane.

| Current component                                                            | Reusable capability                                                                                   | Boundary that must be preserved                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `agents/` and `docs/agent-contract.md`                                       | Stable editorial responsibilities and declared artifact handoffs                                      | Agent logic remains runnable without LangGraph; system nodes must not become editorial roles.           |
| `src/schemas/episode.ts`                                                     | Zod schemas for episode config, research, script, captions, timeline and assets                       | These are domain schemas, not `ProductionState` or artifact-registry schemas.                           |
| `src/lib/story.ts`                                                           | Parsers and decision checks for current Markdown gates and final-script structure                     | Keep as legacy readers/adapters; do not reinterpret missing `critic-output-v1` fields.                  |
| `src/lib/workflow.ts`                                                        | Ordered 11-role registry and `director-workflow-v1` parser                                            | Current workflow is compatibility input, not a checkpoint or target state.                              |
| `src/lib/project.ts` and `src/lib/pipeline-v2-config.ts`                     | Repository-root guards, episode selection and Zod-backed JSON loading                                 | Current episode selection is process-global and flat-ID based; current writers are not transactional.   |
| `src/lib/story-quality.ts`, `captions.ts`, `delivery.ts` and `comparison.ts` | Pure or mostly pure validation/measurement helpers                                                    | Keep deterministic and framework-independent.                                                           |
| `scripts/validate-*.ts`                                                      | Existing research, workflow, story, content, delivery and comparison gates                            | They remain authoritative for manual compatibility; they do not schedule or checkpoint.                 |
| `scripts/materialize-story.ts`, TTS, timeline, render and inspection code    | Existing production primitives                                                                        | Invoke only through future adapters; current direct canonical writes do not satisfy atomic publication. |
| `src/lib/polish.ts`                                                          | Bounded generation/judge loop and adapter-shape precedent                                             | It is not the cross-role revision loop and is not permission to couple other agents to LangGraph.       |
| Current Vitest suite                                                         | Legacy parser, rubric helper, artifact binding, caption, delivery, TTS and polish regression coverage | It does not implement the contract test IDs in `docs/test-plan.md`.                                     |
| Episode 001/002 artifact packages                                            | Real compatibility data with SHA-256-bound gates and completed production outputs                     | Import must be reference-only, `legacy-derived`, non-destructive and alias-aware.                       |

Two current defects must be compatibility work, not inherited behavior:

1. `validate:story -- --episode X` does not forward the episode to its nested
   `validate:workflow`; `LEGACY-005` is specified but not implemented.
2. Current materialize, polish, TTS, timeline and render paths write canonical files directly. A
   LangGraph runner cannot treat those writes as committed artifact transactions.

## Milestone and dependency status

The required milestone names and ordering are preserved, but work packages are deliberately not
assigned.

| Milestone                                                       | Required outcome                                                                                                              | Blocking decisions                         | Status      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- |
| M1: deterministic graph skeleton with Stub agents               | Reference-only state, deterministic stub nodes, persistence, both HITL pauses, resume, legacy import and unchanged validators | `AD-01`–`AD-10`, initial `AD-14`           | **BLOCKED** |
| M2: content evaluation and revision loop                        | Common critic envelope, deterministic route, single-owner revision, best/selected handling, freeze and direct-edit protection | `AD-05`–`AD-08`, `AD-11`, `AD-12`, `AD-15` | **BLOCKED** |
| M3: freeze, production and HITL                                 | Frozen-input-only production, production repair closure, unfreeze, final human approval and idempotent resume                 | `AD-04`, `AD-09`, `AD-11`–`AD-13`, `AD-16` | **BLOCKED** |
| M4: persistence, caching, observability and migration hardening | Production saver, migrations, event completeness, cache views, failure/replay suite and full legacy backfill                  | `AD-02`, `AD-08`–`AD-10`, `AD-14`          | **BLOCKED** |

The critical path is therefore architecture authority → executable contract choices → artifact and
state semantics → checkpoint transaction semantics → graph topology. No LangGraph node or graph-edge
pull request is safe before that path is resolved. Safe parallel implementation tasks cannot yet be
named because the shared schema, path, topology and configuration boundaries are among the blocked
decisions.

## Manual compatibility and rollback contract held for the resumed plan

The future implementation plan must preserve these externally visible semantics:

- `ORCHESTRATOR=manual` runs the existing manual commands, current canonical artifact paths and
  validators without requiring LangGraph state, migrations or a checkpointer.
- `ORCHESTRATOR=langgraph` may schedule the same agent and production boundaries only after the
  applicable milestone passes. It must not make artifacts secondary to state.
- Switching back to `manual` must not rewrite or delete Episode 001/002 artifacts, selected/best
  history, rejected candidates or existing media.
- Rollback must start from the last verified artifact/control commit, validate hashes and current
  gates, and then use the existing manual entry points. Event logs cannot repair or approve state.
- An absent or invalid `ORCHESTRATOR` value, treatment of in-flight LangGraph work, and the exact
  pointer-promotion procedure must be decided by `AD-08` and `AD-09`; this plan does not invent them.
- M1 Stub mode must complete before any real model integration. Stub and real adapters must share the
  same framework-independent request/result contract.

The manual path stays the compatibility authority until a separately approved cutover. Shadow output
must not replace manual-selected files or claim delivery approval.

## Conditions to resume Goal 3.2A

Resume implementation planning only after all of the following are true:

1. A tracked architecture version or ADR set resolves `AD-01` through `AD-16`, including explicit
   translations where Goal 3.1 and Goal 3.0 both remain supported.
2. The architecture file no longer contradicts its approval status, and its version/hash is named as
   the implementation baseline.
3. The chosen schemas, paths, configuration and topology cross-reference the nine Goal 3.0
   contracts without competing authorities.
4. The checkpoint/filesystem transaction and human-decision contracts are precise enough to derive
   crash/resume and authorization tests.
5. Legacy scope explicitly names canonical Episode 001/002, nested `v2-goal3` packages and alias
   behavior.
6. The terminal state is confirmed to stop before any unauthorized external publication.

Once these conditions are met, replace the blocked milestone rows with target modules, PR-sized work
packages, dependencies, safe parallel lanes, test commands and measurable acceptance criteria. The
[traceability matrix](./traceability-matrix.md) identifies every requirement that must receive a task
and implemented test at that time.
