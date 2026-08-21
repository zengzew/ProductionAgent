# Autonomous role-aware benchmark and repair loop

- Status: role-aware M7 foundation
- Contract: `role-model-auto-v1`
- Config: `config/role-model-auto-repair.json`
- CLI: `pnpm benchmark:auto --episode <id> --role <role> --models <set>`

The loop is `preflight → capability check → benchmark → deterministic
diagnosis → bounded repair → verification workflow → rerun → review-ready`.
Failure taxonomy and routing are decided in code. An executor may apply only
an authorized repair, and only through a staging worktree. The same loop is
available to every enabled text role through the role contract catalog;
search, multimodal and production-media roles stop at capability preflight
until their correct adapters exist.

## Identity and fairness

Candidate cache identity is:

```text
sha256(inputHash + role + provider + model + prompt version + typed reasoning config + role contract version + repairContextHash)
```

`repairContextHash` is `sha256({appendix, repairRound})`. The base run uses
an empty appendix and `repairRound=0`. A repair appendix change produces a
new identity, so `pnpm benchmark:role` cannot reuse a repaired cache.

Reasoning is a strict typed profile resolved by the hosted provider's exact
provider/model capability. Changing its profile or values also produces a new
identity; arbitrary request-options passthrough is not supported.

Outcomes are explicit:

| Outcome                      | Meaning                                 |
| ---------------------------- | --------------------------------------- |
| `PASS`                       | First-try success on the frozen payload |
| `PASS_AFTER_REPAIR(round=n)` | Success only after a repair payload     |
| `FAIL`                       | Hosted or validator failure             |

Pairwise comparison only includes candidates that share the same
`repairContextHash`. Candidate artifacts are written under `base/` or
`repair-<hash>/`, so a repair rerun cannot overwrite the frozen base
output.

Promotion blind review includes only one `repairContextHash` cohort of
`outcome=PASS` and `promotionEligible=true` candidates. `PASS_AFTER_REPAIR`
goes to `review/diagnostic-review.json` and cannot enter promotion review.
If that clean eligible cohort has fewer than two candidates, the loop
does **not** mark `review-ready`; it returns
`insufficient-comparable-candidates`. `automaticPromotion` remains `false`.

Every role contract separately declares whether candidate-output repair is
allowed, which prompt paths may be repaired, which paths are denied, and what
counts as a clean promotion cohort. A repair never broadens the role's frozen
inputs or output declaration.

## Budgets

| Cap              | Default | Meaning                                      |
| ---------------- | ------- | -------------------------------------------- |
| `maxRounds`      | 3       | Hosted benchmark passes                      |
| `maxRepairs`     | 4       | Authorized repairs                           |
| `maxApiCalls`    | 12      | Hosted chat calls, including failed attempts |
| `maxTotalTokens` | 500000  | Sum of reported `totalTokens`                |

Exhaustion stops the loop. It never retries forever.

## Routing

| Class                               | Target               | May write                                    |
| ----------------------------------- | -------------------- | -------------------------------------------- |
| transport / adapter / CLI / harness | that class           | listed harness files only                    |
| artifact output contract            | role-specific prompt | declared prompt path in the role contract    |
| editorial / factual                 | candidate-output     | rerun the model into the candidate directory |
| auth, canonical tamper, protected   | stop                 | nothing                                      |

Shared prompt or input edits create a new `inputHash`. Every candidate
then reruns from round 0. Candidate-output repair reruns only the failing
candidates under a new `repairContextHash`.

## RepairExecutor

```text
diagnosis → allowPaths/denyPaths
  → executor writes only in a temp staging worktree
  → system diffs actual changed paths
  → assertRepairAuthorization
  → apply patch
  → tests
  → rerun
```

`RepairExecutor` is staging-only (`Promise<void>`). It does not receive a
writable `repoRoot`. The host snapshots the whole working tree before and
after the executor; any unauthorized file change, including `package.json`,
fails closed with `EXECUTOR_TOUCHED_WORKING_TREE`. The host then diffs
staging and applies an authorized patch. If no executor is supplied, a
deterministic catalog produces the staged patch. Timeout repair either
atomically writes `config/role-model-benchmark.json` or records
`runtimeOverride=true` in the journal when that file is absent.

## Protected

Snapshots walk every file under:

- `editorial-calibration/`
- `prompts/v4/`
- `src/lib/editorial/`
- `src/editorial-calibration/`
- `content/<episode>/story/`
- `content/<episode>/research/`

plus `config/agent-model-policy.json` and `script-writer-evaluate.ts`.
Added, deleted, or changed files fail closed.

Promotion still needs an explicit HumanDecision.

## Artifacts

```text
content/<episode>/rollout/auto/<runId>/journal.jsonl
content/<episode>/rollout/auto/<runId>/summary.json
content/<episode>/rollout/benchmarks/<benchmarkId>/<candidate>/base/...
content/<episode>/rollout/benchmarks/<benchmarkId>/<candidate>/repair-<hash>/...
content/<episode>/rollout/benchmarks/<benchmarkId>/review/blind-review.json
content/<episode>/rollout/benchmarks/<benchmarkId>/review/diagnostic-review.json
```

CI covers the loop with a fake HostedChatProvider. Local benchmark runs use
the configured DeepSeek, Qwen and MiniMax candidates only when the required
environment variables are present; missing credentials report only the env
var name. `pnpm verify:autonomous` runs the repository typecheck, related
Vitest, orchestration, benchmark and review/promotion gates, adding the full
suite for high-risk changes.
