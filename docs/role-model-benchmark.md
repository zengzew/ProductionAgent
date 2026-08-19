# Role model shadow benchmark

- Status: phase-2 infrastructure
- Contract: `model-benchmark-v1`
- Config: `config/role-model-benchmark.json`
- Policy version: `role-model-rollout-v1`

This work package compares hosted models for one role on frozen
ArtifactRefs. It never changes the canonical workflow, RoleModelPolicy,
or `ORCHESTRATOR=manual`.

## Benchmark contract

Every run freezes:

| Field                      | Meaning                                          |
| -------------------------- | ------------------------------------------------ |
| `episodeId`                | Only this episode may be read or written         |
| `agentName`                | Phase 2 allows `script-writer` only              |
| `promptRef` + SHA          | Same prompt bytes for every candidate            |
| `input ArtifactRefs` + SHA | Same research/story inputs                       |
| `upstreamGateRefs`         | Same director / viral gates                      |
| `revisionRound`            | Frozen on the request                            |
| `expectedOutputs`          | Declared logical outputs; models see these paths |
| `policyVersion`            | `role-model-rollout-v1`                          |

`inputHash` is the SHA-256 of the stable JSON of those fields. The
benchmark identity for one candidate is:

```text
sha256(inputHash + role + provider + model + prompt version)
```

All candidates receive the identical hosted chat payload. Writes are
relocated after the model returns so no candidate sees a different
working tree.

## Frozen-input mechanism

`benchmark-input.json` is hash-bound. Before and after every candidate:

- prompt, inputs, and upstream gates must still match the recorded SHA
- canonical expected-output files must still match their recorded SHA

Any mismatch fails closed with `BENCHMARK_INPUT_TAMPERED` or
`BENCHMARK_CANONICAL_TAMPERED`. The run does not continue with mixed
inputs.

## Candidate isolation

Candidates come from config, not from a brand enum. The committed
`default` set is three OpenAI-compatible endpoints:

- `openai-gpt-5-mini`
- `deepseek-chat`
- `xai-grok-4`

Each candidate runs `HostedAgentBackend` independently and writes only
under:

```text
content/<episode>/rollout/benchmarks/<benchmarkId>/<candidate-id>/
```

Canonical `story/script-draft.md` is never opened for write. A later
identical identity may reuse a successful cached candidate; a changed
model or input hash must re-execute.

## Evaluation metrics

Each candidate record includes:

- schema validity
- expectedOutputs complete
- hard validators PASS/FAIL (script-writer structure + Claim binding)
- factual contract (claim IDs, unsupported count, coverage)
- downstream critic result when a runner is supplied; otherwise
  `not-evaluated`
- latency, attempt, retries, token usage
- provider, model, output hashes, output length

Pairwise comparison is deterministic: candidate ids sorted, then every
`(i, j)` with `i < j`. It records structural diff, validator failures,
claim coverage, unsupported claim count, length, critic, latency, and
tokens.

`humanReview` is a separate field. It is never filled from automatic
scores.

The aggregator does not rank models. There is no LLM self-score.

## Promotion gate

A candidate is eligible only when all of the following hold:

- schema 100% valid
- hard validators 100% PASS
- no unsupported factual regression versus the frozen canonical draft
- no new blocker from an optional critic
- canonical contract unchanged

Eligibility is a review signal only.

```text
automaticPromotion = false
promotionRequires = explicit-config-or-human-decision
```

The benchmark never writes `config/agent-model-policy.json`. Promotion
to `hosted-llm` remains an explicit config edit or HumanDecision.

## CLI

```bash
pnpm benchmark:role \
  --episode episode-004 \
  --role script-writer \
  --models default
```

Defaults: `--role script-writer`, `--models default`. The command only
runs a shadow benchmark. It does not modify the canonical script.
Phase 2 rejects any role other than `script-writer`.

## Out of scope

- Automatic model router or cost-based selection
- Research search tools
- Visual Director / Delivery Critic VLM
- M6 repair loop
- Changing Goal 3.2 prompts, Golden Set, or hard validators
- Official hosted-llm for any new role
