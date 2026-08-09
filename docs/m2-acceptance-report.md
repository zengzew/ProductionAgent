# M2 Exit Acceptance Report

- Date: 2026-08-10
- Repository: `/Users/zengze/Documents/ProductionAgent`
- Verification worktree: `/Users/zengze/.codex/worktrees/d91b/ProductionAgent`
- Implementation Plan: `docs/langgraph/implementation-plan.md`, M2 / `WP-M2-01..07`
- Base commit preserved: `903d0e0` (`Harden episode render contracts and validation`)
- Final decision: **PASS**
- M3 started: **No**

## Decision summary

M2 now satisfies the implementation plan's bounded content-loop exit contract. `runContentLoop`
executes the Visual Director followed by parallel Audience, Retention, Fact, and Compliance checks;
routes one owner; stages a candidate and its refreshed descendants; reruns all four checks; applies
regression, no-progress, oscillation, budget, and strategy controls; and promotes a candidate only
when ADR-003 `selectBest()` accepts it. Rejected candidates remain audit references while the ledger's
selected and best pointers remain unchanged.

WP-M2-07 protects lock metadata that already exists: an automated owner or downstream refresh must
declare changed locators and cannot overlap a `locked_range`. M2 does not create locks from human
edits. Formal `HumanDecision`, direct-edit ingestion, approval-epoch transitions, production
authorization, production subgraphs, unfreeze approval, and publication remain M3 work and are not
M2 failures.

## Acceptance matrix

| Acceptance item                                      | Result   | Current implementation and evidence                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic single-owner routing                   | **PASS** | `selectPrimaryRoute()` remains the only route selector. The loop dispatches only the selected route's issue IDs and `authorizedArtifactIds`; `content-loop.test.ts` and `content-loop-bounded.test.ts` verify Viral Director and Script Writer routes.                                                                                                                                   |
| Authorized-artifact-only revision                    | **PASS** | `applySelectedRevisions()` rejects an artifact outside the route-derived allowlist. The golden loop asserts that an `attention.hook` issue authorizes only the hook artifact.                                                                                                                                                                                                            |
| Downstream stale propagation and refresh             | **PASS** | The staged candidate uses `markStaleTransitively()`, requires the exact stale descendant set, verifies dependency hashes, refreshes every descendant, and reruns all critics. `content-loop.test.ts` covers hook → script/narration/visual-plan propagation.                                                                                                                             |
| Four-way content critic fan-out                      | **PASS** | `contentCriticNames` contains Audience, Retention, Fact, and Compliance. `runCritics()` uses one parallel group before revision and after every candidate. The golden integration test verifies all four run twice.                                                                                                                                                                      |
| Compliance schema, rubric, and profile               | **PASS** | `critic-output-v1` now includes `compliance-critic` and three `compliance.*` categories; `evaluation.ts` defines the binary `compliance-critic-v1` rubric; `config/ownership.json` maps every new category to one owner. `critic-output.test.ts` and the bounded loop test cover rejection, routing, rerun, and PASS.                                                                    |
| Revision ledger is part of the loop                  | **PASS** | `runContentLoop` accepts an existing `RevisionLedger`, validates it against the current selection, creates one when absent, records every valid candidate attempt, and returns the updated ledger. Attempts bind before/candidate/evaluation refs, disposition, regression and oscillation IDs, usage, and immutable best/selected refs. The ledger body never enters `ProductionState`. |
| Creative, cost, and wall-clock budgets               | **PASS** | Creative rounds are checked before dispatch. Cost and wall-clock usage are recorded for every attempt and checked before the next dispatch. Exhaustion produces `human-escalation-v1` and leaves best selected. Integration tests cover creative round 3, exact cost exhaustion, and exact wall-clock exhaustion.                                                                        |
| Hard/score regression and no-progress                | **PASS** | Each candidate runs through `assessRevision()` and `selectBest()`. Hard or score regression, unchanged bytes, or an unchanged targeted issue records a rejected attempt and cannot advance selected/best. Integration coverage includes a new fact blocker and a higher weighted total with a protected-dimension drop.                                                                  |
| Oscillation and strategy escalation                  | **PASS** | The loop carries candidate history across rounds. `A→B→A` records a warning and retains best; `A→B→A→B` creates an oscillation escalation. Owner requests receive deterministic L0/L1/L2 strategy metadata within the default three-round budget.                                                                                                                                        |
| ADR-003 Pareto best selection                        | **PASS** | Candidate review happens in an isolated working index. Only `selectBest()` can commit that index and update ledger best/selected. Eligibility requires closed target issue, all gates/floors, comparable rubrics, no hard/protected regression, target gain, and Pareto dominance. `normalizedTotal` is used only in reports/tests and never by `selectBest()`.                          |
| Existing `locked_ranges` protected from automation   | **PASS** | `assertLockedRangesPreserved()` binds each lock to exact selected bytes, rejects stale lock metadata, detects line and JSON-pointer overlap, and fails closed when changed locators are omitted. It is called for owner revisions and downstream refreshes. Unit and loop integration tests cover overlapping and non-overlapping edits.                                                 |
| Freeze preconditions and exact manifest binding      | **PASS** | Existing `freezeContent()` still rejects stale or byte-mismatched artifacts and open blocker/high/major issues, writes atomically, and binds the explicit selected refs through `selectionHash`. Existing freeze tests remain green.                                                                                                                                                     |
| Reference-only state, byte hashes, and atomic freeze | **PASS** | No artifact body or ledger body is merged into graph state. Candidate, best, evaluation, lock, and manifest data use `ArtifactRef` plus SHA-256. The full state-body-leak, artifact-registry, reducer, checkpoint, and freeze suites pass.                                                                                                                                               |

## M3 boundary (explicitly deferred, not an M2 failure)

The following remain assigned to `WP-M3-01..04` by the implementation plan:

- formal `HumanDecision` payloads and approve/reject/direct-edit handlers;
- ingestion of a human direct edit as a new locked artifact version;
- approval-epoch transitions and production-stage authorization;
- production adapters/subgraph, TTS/render/delivery repair routing, and frozen-manifest-only production;
- L4 unfreeze approval and final publication gate semantics;
- any upload, publish, or external side effect.

M2 emits a reference-only `human-escalation-v1` when automation must stop. It does not interpret that
artifact as a human decision or resume production.

## Verification evidence

The worktree reuses the source repository's installed `node_modules`. pnpm therefore reports that the
workspace install metadata belongs to another worktree; commands were run with
`--config.verify-deps-before-run=warn` so pnpm used the existing lockfile-matched packages instead of
attempting a network install. The warning did not change source or dependency files. The full test
suite read the source repository's existing ignored Episode 001 MP4 artifacts through temporary
worktree symlinks; no media was generated or changed, and the links were removed after verification.

| Command                                                       | Result   | Evidence                                                                               |
| ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `pnpm --config.verify-deps-before-run=warn format:check`      | **PASS** | All matched files use Prettier code style.                                             |
| `pnpm --config.verify-deps-before-run=warn lint`              | **PASS** | ESLint completed with zero warnings.                                                   |
| `pnpm --config.verify-deps-before-run=warn typecheck`         | **PASS** | TypeScript strict build completed with no errors.                                      |
| `pnpm --config.verify-deps-before-run=warn test`              | **PASS** | 33 test files, 165 tests.                                                              |
| `pnpm --config.verify-deps-before-run=warn validate:research` | **PASS** | 17 sources, 28 facts, 10 events; lineage resolved.                                     |
| `pnpm --config.verify-deps-before-run=warn validate:workflow` | **PASS** | 11 owners, 9 decisions, 2 reviews, 1 closed revision; `delivery-approved`.             |
| `pnpm --config.verify-deps-before-run=warn validate:story`    | **PASS** | 12 segments; target 150s; oral PASS; critic 95; fact PASS; visual READY; retention 93. |
| `pnpm --config.verify-deps-before-run=warn validate:content`  | **PASS** | 12 segments, 6 assets, 20-second hook.                                                 |
| `git diff --check`                                            | **PASS** | No whitespace errors in the implementation and report patch.                           |

The four `tsx` validators initially hit the managed sandbox's IPC-socket restriction (`listen EPERM`)
and were rerun unchanged outside the sandbox; all passed. Real TTS, hosted model calls, asset capture,
timeline/materialization, smoke/full rendering, output inspection, delivery validation, and comparison
validation were not run because this change does not alter episode content or media.

## Final disposition

**PASS.** M2 is exit-accepted against `WP-M2-01..07`. The bounded revision loop now retains the best
valid version, stops predictably on budget or oscillation, protects existing locked ranges, reruns all
four content critics, and can produce the exact selected reference set required by the atomic content
freeze. M3 remains unstarted.
