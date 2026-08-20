# Role → ModelPolicy rollout

- Status: phase-1 infrastructure
- Policy version: `role-model-rollout-v1`
- Config: `config/agent-model-policy.json`

This document describes how editorial roles choose a model backend. It does
not change routing, rights, Claim validation, revision budget, cache,
episode isolation, render authorization, or the delivery hard gate. Those
stay in deterministic code.

## Precedence

Resolution is fixed. There is no implicit or random model choice.

```text
global default
  → role policy
    → episode override
      → run override
```

| Layer            | Source                                          | Scope                      |
| ---------------- | ----------------------------------------------- | -------------------------- |
| Global default   | `defaults` in `config/agent-model-policy.json`  | Every role and episode     |
| Role policy      | `roles.<agentName>`                             | One role, every episode    |
| Episode override | `episodeOverrides.<episodeId>.<agentName>`      | One role in one episode    |
| Run override     | `createRoleModelRolloutAdapter({runOverrides})` | One adapter instance / run |

A later layer replaces only the fields it names. Missing fields keep the
value from the previous layer. An episode key is read only when it equals
the current `episodeId`; other episodes are never consulted.

## Modes

| Mode         | Calls hosted model | Canonical output                         | Routing / gates / workflow             |
| ------------ | ------------------ | ---------------------------------------- | -------------------------------------- |
| `manual`     | no                 | existing file handoff                    | unchanged                              |
| `shadow`     | yes                | unchanged manual ArtifactRefs            | unchanged                              |
| `hosted-llm` | yes                | hosted bytes become the declared outputs | still decided by code after validation |

`shadow` writes candidate files under
`content/<episode>/rollout/shadow/<role>/` and a comparison artifact under
`content/<episode>/rollout/comparisons/`. Those refs are evidence only.
They are not selected into the artifact index, not admitted to critic or
gate evaluation, and not written to `workflow.json`.

## Phase-1 enablement

Repository default for every role is still `manual`.
`createContentAgentAdapter()` without an explicit mode stays `manual-file`.

| Role               | Allowed modes          | Notes                                                 |
| ------------------ | ---------------------- | ----------------------------------------------------- |
| `oral-rewriter`    | `manual`, `hosted-llm` | Only role officially enabled for canonical hosted-llm |
| `story-director`   | `manual`, `shadow`     |                                                       |
| `viral-director`   | `manual`, `shadow`     |                                                       |
| `script-writer`    | `manual`, `shadow`     |                                                       |
| `oral-judge`       | `manual`, `shadow`     |                                                       |
| `audience-critic`  | `manual`, `shadow`     |                                                       |
| `fact-guardian`    | `manual`, `shadow`     |                                                       |
| `retention-critic` | `manual`, `shadow`     |                                                       |
| `research-analyst` | `manual`               | Search tools are a later WP                           |
| `visual-director`  | `manual`               | M5 media / VLM is a later WP                          |
| `delivery-critic`  | `manual`               | Multimodal review is a later WP                       |

To turn on hosted-llm for Oral Rewriter, set `roles.oral-rewriter.mode` or a
more specific override to `hosted-llm`. Do not flip the other ten roles to
hosted-llm in this phase.

## Episode overrides

Committed examples (mode is not flipped; only provider/model/endpoint):

| Episode       | Role            | Provider label | Model           |
| ------------- | --------------- | -------------- | --------------- |
| `episode-004` | `script-writer` | `openai`       | `gpt-5.6`       |
| `episode-005` | `script-writer` | `deepseek`     | `deepseek-chat` |

These apply only when resolving that episode. `episode-test` and every other
episode keep the role policy. Provider is a config label; the transport is
still the OpenAI-compatible chat JSON endpoint. Roles do not import a brand
SDK.

## Failover

`fallbackMode` is `"none"` or `"manual"`. Default is `"none"`.

- `hosted-llm` + API / auth / schema failure + `fallbackMode: "none"` →
  fail-closed. The adapter does not try another model.
- `hosted-llm` + the same failure + `fallbackMode: "manual"` → bind the
  existing manual files. This is the only allowed fallback.
- `shadow` failure never replaces canonical output and never changes
  routing.

There is no automatic model selection and no quality optimizer.

## Observability

Each rollout execution writes
`content/<episode>/rollout/executions/<role>-<executionId>.json` with:

- `agentName`, `mode`, `provider`, `model`, `policyVersion`
- actual `reasoningProfile` (never `reasoning_content`)
- `promptRef`, `inputArtifacts`, `outputArtifacts`
- `latencyMs`, `attempt`, `executionId`
- token `usage` when the provider reports it
- `fallbackUsed` / `fallbackMode`

API keys are not stored. Shadow runs also write a structured comparison:

- `manualOutputRef` / `shadowOutputRef`
- `schemaValidity`
- structural `validatorResult`
- `criticGateResult` (always `not-evaluated` for shadow)
- `diffSummary` with `shadowIsSourceOfTruth: false`

## Adapter entry

```ts
createContentAgentAdapter({mode: "role-rollout", repoRoot, runOverrides});
```

or `createRoleModelRolloutAdapter(...)`. The default
`createContentAgentAdapter({repoRoot})` path remains manual file handoff.

## Out of scope

- Research Analyst web/search tools
- Visual Director VLM / media reasoning
- Delivery Critic multimodal review
- Automatic model selection
- Model quality optimizer
- Official hosted-llm for any new role besides the existing Oral Rewriter path
