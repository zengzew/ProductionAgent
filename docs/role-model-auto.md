# Autonomous role benchmark and repair loop

- Status: M6
- Contract: `role-model-auto-v1`
- Config: `config/role-model-auto-repair.json`
- CLI: `pnpm benchmark:auto --episode <id> --role <role> --models <set>`

The loop is `preflight → benchmark → deterministic diagnosis → bounded
repair → test → rerun → review-ready`. Failure taxonomy and routing are
decided in code. An executor may apply only an authorized repair, and
only through a staging worktree.

## Identity and fairness

Candidate cache identity is:

```text
sha256(inputHash + role + provider + model + prompt version + repairContextHash)
```

`repairContextHash` is `sha256({appendix, repairRound})`. The base run uses
an empty appendix and `repairRound=0`. A repair appendix change produces a
new identity, so `pnpm benchmark:role` cannot reuse a repaired cache.

Outcomes are explicit:

| Outcome                      | Meaning                                 |
| ---------------------------- | --------------------------------------- |
| `PASS`                       | First-try success on the frozen payload |
| `PASS_AFTER_REPAIR(round=n)` | Success only after a repair payload     |
| `FAIL`                       | Hosted or validator failure             |

Pairwise comparison and blind review only include candidates that share the
same `repairContextHash`. Mixed base/repair variants are never head-to-head.
A repaired payload is not promotion-eligible (`repaired-payload`).
`automaticPromotion` remains `false`.

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
| artifact output contract            | Script Writer prompt | `agents/script-writer.md` or episode prompt  |
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

The executor cannot write the main working tree. If no executor is
supplied, a deterministic catalog produces the staged patch. Timeout
repair either atomically writes `config/role-model-benchmark.json` or
records `runtimeOverride=true` in the journal when that file is absent.

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
content/<episode>/rollout/benchmarks/<benchmarkId>/review/blind-review.json
```

CI covers the loop with a fake HostedChatProvider. It does not call a
real model API.
