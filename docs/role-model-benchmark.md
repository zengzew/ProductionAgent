# Role-aware role-model benchmark

- Status: role-aware infrastructure
- Contract: `model-benchmark-v1`
- Config: `config/role-model-benchmark.json`
- Role contracts: `config/role-model-contracts.json`
- Policy version: `role-model-rollout-v1`

This work package compares hosted models for a role on frozen ArtifactRefs. The
catalog covers all 11 roles, while execution is capability-gated. Text roles
may use the hosted text candidates; Research Analyst requires search, Visual
Director requires multimodal input, and Delivery Critic requires production
media inspection. A role without its required capability fails closed before
provider calls. It never changes the canonical workflow, RoleModelPolicy, or
`ORCHESTRATOR=manual`.

## Benchmark contract

Every run freezes:

| Field                      | Meaning                                          |
| -------------------------- | ------------------------------------------------ |
| `episodeId`                | Only this episode may be read or written         |
| `agentName`                | One of the 11 role contracts; capability-gated   |
| `promptRef` + SHA          | Same prompt bytes for every candidate            |
| `input ArtifactRefs` + SHA | Same research/story inputs                       |
| `upstreamGateRefs`         | Same director / viral gates                      |
| `revisionRound`            | Frozen on the request                            |
| `expectedOutputs`          | Declared logical outputs; models see these paths |
| `policyVersion`            | `role-model-rollout-v1`                          |

`inputHash` is the SHA-256 of the stable JSON of those fields. The
benchmark identity for one candidate is:

```text
sha256(inputHash + role + provider + model + prompt version + typed reasoning config + role contract version)
```

`reasoning` is a strict discriminated union, not a generic request-options
bag. The committed profiles map to provider capabilities as follows:

| Candidate           | Typed profile                     | Hosted request parameters                        |
| ------------------- | --------------------------------- | ------------------------------------------------ |
| `deepseek-v4-flash` | DeepSeek V4 Flash                 | `thinking.type=enabled`, `reasoning_effort=max`  |
| `qwen3-7-plus`      | Qwen 3.7 Plus                     | `enable_thinking=true`, `thinking_budget=262144` |
| `minimax-m2-7`      | MiniMax M2.7 native thinking-only | no extra effort/budget fields                    |

The provider resolves parameters from the exact provider/model capability and
fails closed for an unsupported profile or mismatch. A changed reasoning
profile or value therefore creates a new cache identity.

All candidates receive the identical frozen prompt and user-input payload.
Only the typed reasoning fields vary according to the candidate's exact
provider/model capability. Writes are relocated after the model returns so no
candidate sees a different working tree.

## Frozen-input mechanism

`benchmark-input.json` is hash-bound. Before and after every candidate:

- prompt, inputs, and upstream gates must still match the recorded SHA
- canonical expected-output files must still match their recorded SHA

Any mismatch fails closed with `BENCHMARK_INPUT_TAMPERED` or
`BENCHMARK_CANONICAL_TAMPERED`. The run does not continue with mixed
inputs.

## Candidate isolation

Candidates come from config, not from a brand enum. The committed
`default` set is:

- `deepseek-v4-flash`
- `qwen3-7-plus`
- `minimax-m2-7`

First real calls use `timeoutMs=300000` and `maxRetries=0` so a slow
model is not retried into three API burns. `HostedAgentBackend` appends
the `{outputs:[...]}` machine response contract to the user message;
role prompts stay unchanged.

Each candidate runs `HostedAgentBackend` independently and writes only
under:

```text
content/<episode>/rollout/benchmarks/<benchmarkId>/<candidate-id>/
```

Canonical `story/script-draft.md` is never opened for write. A later
identical identity may reuse a successful cached candidate; a changed
model, input hash, or reasoning config must re-execute.

## Role contract catalog

`config/role-model-contracts.json` is the deterministic source for each role's
allowed frozen inputs, expected outputs, hard-validator IDs, evaluator ID,
promotion requirements, blind-review dimensions, cache identity version and
repair fairness. `buildRoleBenchmarkRequest` expands only those declared
paths; it never imports another role's inputs or outputs. Adding an agent role
without adding its contract fails the contract schema at startup.

The current text rollout order is Story Director → Viral Director → Oral
Rewriter → Oral Judge → Audience Critic → Fact Guardian → Retention Critic.
Script Writer remains benchmark-enabled but its promotion is already complete.
Research, Visual and Delivery remain capability contracts until search,
multimodal and production-media adapters are configured.

## Evaluation metrics

Each candidate record includes:

- schema validity
- expectedOutputs complete
- role-specific hard validators PASS/FAIL plus Claim binding where the role
  contract reads facts
- factual contract (claim IDs, unsupported count, coverage)
- downstream critic result when a runner is supplied; otherwise
  `not-evaluated`
- latency, attempt, retries, token usage
- provider, model, actual `reasoningProfile`, output hashes, output length

### Role-aware claim boundary

The factual boundary applies only to roles whose machine-readable gate binds
Claims to narration evidence, and only through the gate's positive structure
fields — never through a full-text regex over the Markdown body:

| Role             | Positive narration-evidence fields                    | Boundary |
| ---------------- | ----------------------------------------------------- | -------- |
| script-writer    | segment `Claim IDs` (unchanged)                       | strict   |
| story-director   | `emotionalArc[].claimIds`                             | strict   |
| viral-director   | gate `claimIds`                                       | strict   |
| oral-rewriter    | segment `Claim IDs` + `Narration units` claim cells   | strict   |
| oral-judge / audience-critic / fact-guardian / retention-critic | none                    | none     |
| research-analyst | none                                                  | none     |

Consequences:

- Story Director may name `allowedInNarration=false` Claims in `factBoundary`
  (or the brief body) to declare "must not enter narration"; that reference is
  not an `unsupported-claim`.
- Only Claims actually bound as positive narration evidence (e.g.
  `emotionalArc.claimIds`) must satisfy `allowedInNarration=true` and
  `confidence != low`.
- Critic roles may cite any existing Claim to review, reject, or explain a
  blocker; citing a forbidden Claim is never a factual regression.
- Research Analyst is not subject to the narration claim boundary.
- Script Writer keeps its existing strict segment-level enforcement.

For roles with no positive narration-evidence fields the claim contract is
vacuously satisfied (`claimCoverage=1`, no unsupported Claims).

Reasoning content is never stored in benchmark results or telemetry. Only the
typed profile and ordinary token usage are recorded.

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
runs a shadow benchmark. It does not modify canonical artifacts.
Unsupported capabilities are rejected before API-key checks and provider calls.

Autonomous diagnosis and bounded repair live in
[`role-model-auto.md`](./role-model-auto.md):

```bash
pnpm benchmark:auto \
  --episode episode-004 \
  --role script-writer \
  --models default
```

## Out of scope

- Automatic model router or cost-based selection
- Configuring the search, multimodal and production-media adapters required by
  Research Analyst, Visual Director and Delivery Critic
- Changing Goal 3.2 prompts, Golden Set, or hard validators
- Official hosted-llm for any new role
