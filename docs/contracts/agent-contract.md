# Agent Contract

- Status: normative engineering contract
- Contract set: `engineering-contracts-v1`

## Purpose

This document defines the stable boundary around the current artifact-based roles. It does not
introduce LangGraph, change editorial responsibilities, or make chat history part of workflow
state. A future orchestrator may schedule these contracts, but it must not reinterpret them.

The words MUST, MUST NOT, SHOULD, and MAY are normative.

## Contract map

| Concern              | Authority                                            |
| -------------------- | ---------------------------------------------------- |
| Artifact identity    | [artifact-contract.md](./artifact-contract.md)       |
| Critic result shape  | [critic-output-schema.md](./critic-output-schema.md) |
| Scores and blockers  | [evaluation-rubric.md](./evaluation-rubric.md)       |
| Issue ownership      | [routing-policy.md](./routing-policy.md)             |
| Revision and best    | [revision-policy.md](./revision-policy.md)           |
| Traces, tokens, cost | [observability-spec.md](./observability-spec.md)     |
| Retry and recovery   | [failure-modes.md](./failure-modes.md)               |
| Verification design  | [test-plan.md](./test-plan.md)                       |

If two documents appear to conflict, artifact identity and hash validity are resolved first, then
critic schema, rubric, routing, revision, and operational policy in that order. Editorial scope still
comes from the role files under `agents/` and project `AGENTS.md`.

## Shared execution contract

Every role execution is an isolated function over immutable artifact references:

```text
AgentExecutionRequest + referenced artifact bytes
  -> AgentExecutionResult + new artifact bytes
```

The execution request MUST contain references, never copies of complete artifact content:

```ts
type AgentExecutionRequest = {
  contractVersion: "agent-execution-v1";
  executionId: string;
  episodeId: string;
  agentName: AgentName;
  attempt: number;
  revisionRound: number;
  promptRef: ArtifactRef;
  inputArtifacts: ArtifactRef[];
  expectedOutputs: Array<{
    artifactId: string;
    path: string;
    schemaVersion: string;
  }>;
  upstreamGateRefs: ArtifactRef[];
  revisionBudgetRemaining: number;
};

type AgentExecutionResult = {
  contractVersion: "agent-execution-result-v1";
  executionId: string;
  status: "SUCCEEDED" | "REJECTED" | "FAILED";
  outputArtifacts: ArtifactRef[];
  criticResultRef?: ArtifactRef;
  decision: {code: string; summary: string};
  failure?: {code: string; retryable: boolean; detail: string};
};
```

`ArtifactRef` is defined in [artifact-contract.md](./artifact-contract.md). Before execution, the
runner MUST verify every input path and SHA-256. After execution, it MUST validate every expected
output before publishing it or changing workflow state.

### Common invariants

All roles MUST:

- read only the input artifacts declared in the request, plus stable project policy files explicitly
  allowed by the role contract;
- write only their declared output artifacts;
- preserve `episodeId`, Claim IDs, source identity, and repository-relative paths;
- bind each gate or evaluation to the exact SHA-256 of every artifact it reviewed;
- return controlled status and decision codes; free-form prose may explain a decision but MUST NOT
  determine routing;
- leave an upstream artifact unchanged when rejecting it;
- emit no successful result if an output is missing, invalid, or bound to stale inputs.

All roles MUST NOT:

- treat conversation history, model memory, execution logs, or future orchestration state as source
  of truth;
- place complete artifact content into execution state or observability events;
- edit an upstream artifact to make their own gate pass;
- silently change model, prompt, rubric, or input versions during a retry;
- mark downstream work valid after an input hash changes.

### Status semantics

| Status      | Meaning                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `SUCCEEDED` | Declared outputs exist, validate, and are bound to the declared inputs.                |
| `REJECTED`  | A valid critic/gate artifact requests deterministic revision or human escalation.      |
| `FAILED`    | No valid domain decision was produced because execution or contract validation failed. |

`REJECTED` is a product workflow decision and consumes revision budget. `FAILED` is an operational
failure and follows [failure-modes.md](./failure-modes.md); it does not consume creative revision
budget.

## Stable role registry

Role order is fixed:

```text
research-analyst -> story-director -> viral-director -> script-writer -> oral-rewriter
-> oral-judge -> audience-critic -> fact-guardian -> visual-director -> retention-critic
-> delivery-critic
```

The order matches the current `director-workflow-v1` control plane. A future orchestrator MAY skip
already-valid stages but MUST NOT reorder dependencies.

### Research Analyst

| Field         | Contract                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| Agent name    | `research-analyst`                                                                         |
| Preconditions | Episode config exists; source collection scope is declared.                                |
| Inputs        | `episode.config.json`, source URLs/material, current `research/` artifacts if revising.    |
| Outputs       | `research/facts.json`, `sources.json`, `timeline.json`, `technology.md`, `growth-data.md`. |
| Success gate  | `pnpm validate:research -- --episode <episode-id>` passes.                                 |
| Rejection     | Missing evidence is recorded as a boundary; no story fact is invented.                     |
| Forbidden     | Hook, story structure, narration, causal inference unsupported by sources.                 |

Research output remains valid when it explicitly records an evidence gap. It becomes stale when a
referenced source snapshot or any canonical research artifact changes.

### Story Director

| Field         | Contract                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Agent name    | `story-director`                                                                                 |
| Preconditions | Research gate is valid for the exact current research hashes.                                    |
| Inputs        | The five Research Analyst outputs.                                                               |
| Outputs       | `story/director-brief.md`, `story-bible.md`, `story-angle.md`, `three-act-structure.md`.         |
| Success gate  | `director-brief-gate` is `READY`, blocker-free, and hash-bound to facts, sources, and timeline.  |
| Rejection     | `returnTo` is `research-analyst` or `story-director` according to the controlled category.       |
| Forbidden     | Final narration, unsupported answer, invented protagonist, motive, crisis, or causal transition. |

### Viral Director

| Field         | Contract                                                                            |
| ------------- | ----------------------------------------------------------------------------------- |
| Agent name    | `viral-director`                                                                    |
| Preconditions | Current Director Brief is `READY`.                                                  |
| Inputs        | Research artifacts and the four Story Director outputs.                             |
| Outputs       | `story/hook-candidates.md`, `story/viral-strategy.md`.                              |
| Success gate  | `viral-strategy-v2` is `READY`, total >= 20/25, every dimension >= 3/5, no blocker. |
| Rejection     | Routes only to Research Analyst, Story Director, or Viral Director.                 |
| Forbidden     | New facts, unsupported emotion or causality, performance or view-count promises.    |

### Script Writer

| Field         | Contract                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Agent name    | `script-writer`                                                                                  |
| Preconditions | Director and attention gates are valid for current hashes.                                       |
| Inputs        | Approved research, story structure, Director Brief, hook candidates, and viral strategy.         |
| Outputs       | `story/script-draft.md`.                                                                         |
| Success gate  | Draft has complete Claim bindings and can be transformed into the final-script segment contract. |
| Rejection     | Missing research returns through a structured issue; the writer does not fill the gap.           |
| Forbidden     | Writing `final-script.md`, changing Claim Ledger, or adding unsupported facts.                   |

### Oral Rewriter

| Field         | Contract                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Agent name    | `oral-rewriter`                                                                                 |
| Preconditions | Current information draft is valid.                                                             |
| Inputs        | `script-draft.md`, research Claims, story structure, `style/voice-guide.md`, and at most three  |
|               | actually approved samples.                                                                      |
| Outputs       | `story/final-script.md`.                                                                        |
| Success gate  | Segment structure and Claim bindings are preserved; expression passes the seven v2 oral checks. |
| Rejection     | Information-structure defects route to Script Writer.                                           |
| Forbidden     | New fact, person, scene, result, causal relation, metric, or source identity.                   |

### Oral Judge

| Field         | Contract                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| Agent name    | `oral-judge`                                                                                 |
| Preconditions | Draft and final script both exist and their hashes are declared.                             |
| Inputs        | Research Claims, draft, final script, voice guide, and only the style samples actually used. |
| Outputs       | `story/oral-review.md`.                                                                      |
| Success gate  | `oral-review-v2`; all three dimensions >= 4/5; seven checks PASS; no blocker; hashes match.  |
| Rejection     | Oral Rewriter, Script Writer, or `human-editor` on the third failed round.                   |
| Forbidden     | Editing either script or silently approving information drift.                               |

### Audience Critic

| Field         | Contract                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| Agent name    | `audience-critic`                                                              |
| Preconditions | Oral Judge PASS is bound to the current final script.                          |
| Inputs        | Research package, all story artifacts, current oral review, and final script.  |
| Outputs       | `story/critic-report.md`.                                                      |
| Success gate  | Total >= 85/100, every dimension >= 60% of its maximum, no high/blocker issue. |
| Rejection     | Story Director, Script Writer, or Oral Rewriter by issue category.             |
| Forbidden     | Editing upstream artifacts or using a prose recommendation as a route.         |

### Fact Guardian

| Field         | Contract                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Agent name    | `fact-guardian`                                                                                |
| Preconditions | Audience Critic PASS is bound to the current final script.                                     |
| Inputs        | Research package, story structure, final script, oral review, and audience report.             |
| Outputs       | `story/fact-check-report.md`.                                                                  |
| Success gate  | Every factual dimension passes, no open issue or blocker, current script hash matches.         |
| Rejection     | Research Analyst, Story Director, Script Writer, or Oral Rewriter by provenance of the defect. |
| Forbidden     | Enhancing drama, correcting source artifacts directly, or weakening a blocker into prose.      |

### Visual Director

| Field         | Contract                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Agent name    | `visual-director`                                                                                |
| Preconditions | Oral, audience, and fact gates PASS for the current script.                                      |
| Inputs        | Final script, research evidence, all passed reviews, and asset manifest.                         |
| Outputs       | `story/visual-plan.md`.                                                                          |
| Success gate  | Every script segment is planned; reviewed hash matches; assets are resolved; verdict is `READY`. |
| Rejection     | Routes to the owner of the missing evidence, story premise, copy, or visual requirement.         |
| Forbidden     | Rewriting narration or representing generated/demo UI as a real product image.                   |

### Retention Critic

| Field         | Contract                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------- |
| Agent name    | `retention-critic`                                                                            |
| Preconditions | Current visual plan is `READY`; oral, audience, and fact gates remain valid.                  |
| Inputs        | Final script, viral strategy, visual plan, and the three earlier review artifacts.            |
| Outputs       | `story/retention-report.md`.                                                                  |
| Success gate  | Total >= 80/100, every window >= 15/25, no high risk or blocker, feedback chain closed.       |
| Rejection     | Viral Director, Story Director, Script Writer, Oral Rewriter, or Visual Director by category. |
| Forbidden     | Editing script/visuals or changing a prior REJECT to PASS without changed artifact hashes.    |

`story-approved` requires all stages from Research Analyst through Retention Critic to be complete
and valid. Fact Guardian PASS alone is `fact-pass`, not final story approval.

### Delivery Critic

| Field         | Contract                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Agent name    | `delivery-critic`                                                                                 |
| Preconditions | `story-approved`; TTS, captions, timeline, vertical render, and output inspection completed.      |
| Inputs        | Final 1080x1920 MP4, SRT, TTS metadata, timeline, asset manifest, episode config, generated cues. |
| Outputs       | `production/delivery-critic-report.md`.                                                           |
| Success gate  | All binary delivery dimensions pass, hard duration/caption/audio/evidence blockers absent.        |
| Rejection     | `captions`, `timeline`, `tts`, or `render`; these are production stage targets.                   |
| Forbidden     | Editing production artifacts, reviewing a smoke/landscape substitute, or routing defects to copy. |

`delivery-approved` requires the current delivery report to bind the exact MP4, SRT, and timeline
hashes and `pnpm validate:delivery` to pass.

## Non-editorial execution owner

`production-executor` is a system owner identifier, not a new editorial role and not an additional
workflow stage. It names the existing deterministic work that materializes story data and runs TTS,
captions, timeline, render, and inspection commands. Delivery issues use:

```json
{
  "ownerAgent": "production-executor",
  "routeTarget": "captions | timeline | tts | render"
}
```

This preserves Delivery Critic's current routing without assigning production defects to an
editorial agent. The executor MUST follow project scripts and configuration; it MUST NOT make
editorial decisions.

## Compatibility rules

- Existing artifact names and role files under `agents/` remain authoritative for editorial scope.
- Existing leading gate markers such as `oral-review-gate`, `critic-gate`, and `delivery-gate`
  remain valid. The structured fields in [critic-output-schema.md](./critic-output-schema.md) are
  additive so current parsers may ignore unknown fields.
- Existing `oral-review-v1` reports remain valid only for their bound historical artifacts. New Oral
  Judge executions use `oral-review-v2`; v1 scores MUST NOT be reinterpreted or compared as v2.
- Current `story/workflow.json` remains the control plane until a versioned successor is implemented.
- Markdown prose remains useful for humans, but only the leading machine gate may drive status,
  invalidation, routing, or revision counters.
- No compatibility adapter may infer a PASS, owner, issue category, or artifact hash from prose.

## Contract completion rule

An agent stage is complete only when its declared output exists, its schema/gate validates, every
recorded input hash equals the current artifact hash, all required issues are closed, and the
workflow stage points to that exact output version. File existence alone is never completion.
