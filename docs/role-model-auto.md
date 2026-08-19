# Autonomous role benchmark and repair loop

- Status: M6
- Contract: `role-model-auto-v1`
- Config: `config/role-model-auto-repair.json`
- CLI: `pnpm benchmark:auto --episode <id> --role <role> --models <set>`

The loop is `preflight → benchmark → deterministic diagnosis → bounded
repair → test → rerun → review-ready`. Failure taxonomy and routing are
decided in code. An executor may apply only an authorized repair.

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
then reruns from round 0. Candidate-output repair invalidates only the
failing identities.

## Protected

These paths are snapshotted and must not change:

- Goal 3.2 / Golden Set: `editorial-calibration/`, `prompts/v4/`
- hard validators: `src/lib/editorial/`, `script-writer-evaluate.ts`
- `config/agent-model-policy.json`
- canonical `content/<episode>/story/` and `research/`

`automaticPromotion` is always `false`. Promotion still needs an explicit
HumanDecision.

## Artifacts

```text
content/<episode>/rollout/auto/<runId>/journal.jsonl
content/<episode>/rollout/auto/<runId>/summary.json
content/<episode>/rollout/benchmarks/<benchmarkId>/review/blind-review.json
```

CI covers the loop with a fake HostedChatProvider. It does not call a
real model API.
