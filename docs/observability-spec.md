# Observability Specification

- Status: normative engineering contract
- Compatibility schema: `agent-execution-event-v1`
- Canonical approval schema: `observability-event-v1` (WP-M4-04)

## Objective

Every role execution must be reconstructable without storing artifact bodies in logs. An operator must
be able to determine who ran, with which model and prompt, over which exact artifact versions, what it
produced, how much it used, how long it took, and why the workflow advanced or routed backward.

Observability is evidence about execution. Artifact files and gates remain the source of truth for
content and workflow decisions.

## Trace hierarchy

```text
episodeId
  traceId       one end-to-end approval attempt or replay
    executionId one agent/tool attempt
      eventId   append-only lifecycle event
```

- `traceId` remains stable across creative revisions inside one approval epoch.
- `executionId` changes for every retry, including retries that produce identical bytes.
- `parentExecutionId` links a revision, retry, critic review, or deterministic production command to
  the execution that caused it.
- IDs are generated before work starts and are never reused.

## Storage

The reserved episode-local sink is:

```text
content/<episode>/observability/executions.jsonl
```

Each line is one complete JSON event. The log is append-only; corrections are new events that refer to
the invalid event ID. An external OpenTelemetry or analytics sink MAY mirror these events, but the
episode-local trace remains the portable audit record.

Logs MUST contain ArtifactRefs, not full scripts, Claims, sources, prompts, captions, transcripts,
images, audio, or video.

## Event envelope

```ts
type AgentExecutionEvent = {
  schemaVersion: "agent-execution-event-v1";
  eventId: string;
  eventType:
    | "execution.started"
    | "model.completed"
    | "artifact.validated"
    | "evaluation.completed"
    | "route.decided"
    | "checkpoint.committed"
    | "execution.completed"
    | "execution.failed"
    | "execution.recovered";
  occurredAt: string; // RFC 3339 UTC
  episodeId: string;
  traceId: string;
  executionId: string;
  parentExecutionId: string | null;
  agentName: string;
  executionKind: "model" | "deterministic-tool" | "human-decision";
  attempt: number;
  revisionRound: number;
  approvalEpoch: number;
  model: ModelRef | null;
  prompt: PromptRef | null;
  inputArtifacts: ArtifactRef[];
  outputArtifacts: ArtifactRef[];
  usage: Usage;
  timing: Timing;
  status: "STARTED" | "SUCCEEDED" | "REJECTED" | "FAILED" | "RECOVERED";
  decision: Decision | null;
  error: ExecutionError | null;
  checkpoint: CheckpointRef | null;
  environment: EnvironmentRef;
};
```

Fields unused at an early lifecycle event are explicit empty arrays or `null`; they are never omitted.
This makes event replay deterministic.

## Required identity fields

Every event MUST include:

- `episodeId` matching the episode config and all ArtifactRefs;
- `agentName` using the role IDs from [agent-contract.md](./agent-contract.md), or
  `production-executor` for deterministic production work;
- `traceId`, `executionId`, attempt number, revision round, and approval epoch;
- exact input and output artifact paths, schema versions, revisions, hashes, sizes, and producers;
- prompt and model identity for model work;
- status, timing, usage availability, and decision/error data.

## Model reference

```ts
type ModelRef = {
  provider: string;
  model: string;
  version: string;
  deployment: string | null;
  configurationHash: string;
};
```

`version` MUST identify the provider version or immutable model snapshot when available. A floating
alias such as `latest` may be recorded as `model` but not as `version`; if the provider exposes no
immutable version, use `unavailable` and record the resolved alias in `deployment`.

`configurationHash` covers the canonical generation/evaluation settings that can affect output,
including temperature, seed when supported, tool policy, and response-format schema. It MUST NOT
contain credentials.

Deterministic tools use `model=null`.

## Prompt reference

```ts
type PromptRef = {
  promptId: string;
  promptVersion: string;
  path: string;
  sha256: string;
  policyRefs: ArtifactRef[];
};
```

The log records the prompt reference and stable policy references, not rendered prompt content. A
prompt assembled from a role file, voice guide, and critic schema records all component hashes in
`policyRefs`. `promptVersion` is immutable; changing instructions that may affect output requires a
new version or at minimum a new recorded hash under an explicit migration.

Human decisions use `prompt=null`.

## Token usage and cost

```ts
type Usage = {
  availability: "reported" | "estimated" | "unavailable" | "not-applicable";
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  cost: {
    amount: string | null; // decimal string
    currency: string | null; // ISO 4217, normally USD
    pricingVersion: string | null;
  };
};
```

- Provider-reported usage is preferred.
- Estimated usage MUST be labeled and include the tokenizer/pricing version in `pricingVersion`.
- Unknown usage is `null`, never zero.
- Deterministic local commands use `not-applicable`, zero token counts, and cost amount `"0"`.
- Retries record their own usage and cost; summary views sum attempts without overwriting them.
- Cost never participates in content score, routing, or best-version selection.

## Timing

```ts
type Timing = {
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  queueMs: number | null;
  providerMs: number | null;
};
```

Wall-clock timestamps use UTC. `durationMs` is measured with a monotonic clock and MUST equal the
completed execution span, including local validation but excluding queue time. `providerMs` is the
remote model/API time when measurable.

## Decision reason

```ts
type Decision = {
  code:
    | "GATE_PASS"
    | "GATE_REJECT"
    | "ISSUE_ROUTE"
    | "HUMAN_ESCALATION"
    | "CACHE_HIT"
    | "REPLAY_MATCH"
    | "REPLAY_DIVERGENCE"
    | "CANDIDATE_SELECTED"
    | "CANDIDATE_REGRESSION"
    | "CANDIDATE_OSCILLATION";
  summary: string; // <= 500 UTF-8 bytes
  rubricVersion: string | null;
  score: number | null;
  verdict: "PASS" | "REJECT" | null;
  issueIds: string[];
  route: {
    ownerAgent: string;
    routeTarget: string;
    restartAt: string;
  } | null;
  criticResultRef: ArtifactRef | null;
};
```

The controlled `code`, issue IDs, score, verdict, and route drive queries. `summary` is an explanation
only. It cannot override a gate or route.

## Error record

```ts
type ExecutionError = {
  code: string;
  class:
    | "transient-api"
    | "rate-limit"
    | "authentication"
    | "invalid-output"
    | "stale-input"
    | "tooling"
    | "checkpoint"
    | "unknown";
  retryable: boolean;
  message: string;
  providerRequestId: string | null;
  retryAfterMs: number | null;
  invalidOutputHash: string | null;
};
```

Error messages MUST be sanitized. They must not include API keys, authorization headers, full source
text, signed URLs, prompt bodies, narration, or provider responses containing artifact content.

## Environment and checkpoint

```ts
type EnvironmentRef = {
  repositoryCommit: string | null;
  worktreeState: "clean" | "dirty" | "unknown";
  inputSetHash: string;
  runtime: string;
  runnerVersion: string;
};

type CheckpointRef = {
  checkpointId: string;
  artifactIndexSha256: string;
  workflowSha256: string;
  revisionLedgerSha256: string;
};
```

`inputSetHash` is SHA-256 of canonical JSON containing sorted input ArtifactRefs. It is safe to log and
allows cache/replay comparison without logging content. Dirty worktrees are permitted; the exact input
hashes, not the Git commit alone, establish reproducibility.

## Event lifecycle

Minimum successful model execution:

```text
execution.started
model.completed
artifact.validated (one or more)
evaluation.completed (critic only)
route.decided (only PASS/REJECT decision)
checkpoint.committed
execution.completed
```

Minimum failed execution:

```text
execution.started
execution.failed
[execution.started ... retry]
execution.recovered (after a later successful attempt)
```

An execution is considered trace-complete only after exactly one terminal `execution.completed` or
`execution.failed` event. A checkpoint event must precede successful completion when state changed.

## WP-M4-04 canonical contract

Approval-facing events use `observability-event-v1`. In addition to the compatibility envelope, every
event has `runId`, `stage`, `checkpointVersion`, `inputSetHash`, a non-null reference-only checkpoint,
and `eventHash`. `eventHash` is SHA-256 over the complete redacted event with `eventHash` omitted; the
stable `eventId` remains the execution/event-type identity. Terminal events are exactly one of
`execution.completed` (`succeeded`), `execution.failed` (`failed`), or `execution.skipped` (`skipped`),
and set `terminalStatus` accordingly. Each executed `(executionId, stage, attempt)` must have one
`execution.started`, one terminal event, and one matching `checkpoint.committed` event. Retry, repair,
unfreeze, `human-decision`, approval-blocked, degraded, and cache actions are structured control
events; they carry ArtifactRefs and hashes only, never artifact bodies.

The completeness gate is fail-closed. It rejects missing or duplicate lifecycle events, event/content
hash mismatches, episode/run or input-set mismatches, checkpoint conflicts, unverifiable ArtifactRefs,
missing retry/repair/unfreeze/HumanDecision/cache evidence, non-zero cache-hit cost, and redaction
failures. It returns `observability-complete` only when approval is allowed; all other cases return
`observability-degraded` and approval must wait until the evidence is repaired. Replay remains based on
checkpoints and ArtifactRefs; the gate and report are derived views and do not become state authority.

Usage is recorded as `reported`, `estimated`, `unavailable`, or `not-applicable`. Unknown model/tool
usage is `null`/`unavailable`, never a fabricated zero. Deterministic local work is
`not-applicable` with cost `0`; a cache hit is always zero-cost and is reported separately from a
skipped stage.

## Run report

`content/<episode>/observability/run-report.md` is generated from the canonical event and cache logs,
plus reference-only checkpoint/state data. It includes run/episode/schema/checkpoint hashes, stage
timeline, ArtifactRef revisions and hashes, retries/repairs, cache hit/miss, HumanDecision and approval
epoch, usage/cost availability, failures/escalations, and the final observability status. It is
rebuildable and is never a source of truth. Deterministic redaction removes credential-like values
from free text and rejects forbidden body/secret fields or secrets in identity fields; redaction
failure blocks approval.

## Trace completeness gate

Before `story-approved` or `delivery-approved`, validation MUST confirm:

- every complete workflow stage has a successful execution or a labeled legacy-derived record;
- each selected output hash appears in an `artifact.validated` and `checkpoint.committed` event;
- each critic verdict references its report artifact and rubric;
- each REJECT has a route or human escalation;
- retries form a continuous attempt sequence with no duplicate execution IDs;
- token/cost availability is explicit;
- no event contains forbidden content or obvious credential fields.

A logging failure after artifact publication creates `observability-degraded`. Content remains
recoverable from artifacts, but final approval MUST wait until the missing event is reconstructed or a
human records why it is unavailable.

## Legacy compatibility

Existing manually run episodes do not have complete event logs. A compatibility importer MAY create
`legacy-derived` execution records from current workflow stages and gate hashes with these rules:

- unknown model, prompt, token, cost, and duration fields are `unavailable`/`null`;
- no value may be inferred from a filename, conversation, or Git timestamp;
- provenance says `legacy-derived` in `runnerVersion`;
- imported records cannot claim replay determinism;
- current artifact hashes and verdicts must still validate.

This allows the current production workflow to remain usable while making missing historical
telemetry explicit rather than fabricating it.

## M4-03 cache telemetry boundary

Segment TTS and shot asset lookups may append a separate
`content/<episode>/observability/cache-events.jsonl` stream using
`cache-event-v1`. Each record carries the stage, logical item, SHA-256 cache
key, lookup/hit/miss/invalidation event, bounded reason, and cost. Cache hits
have zero token usage and cost. These records contain no narration, prompt, source body, binary
payload, credential, or selected Artifact Registry pointer. They are
optimization evidence only; M4-04 remains responsible for execution-log
completeness and approval blocking.

## Privacy, security, and retention

Never log:

- credentials, environment values, auth headers, cookies, or signed query strings;
- full source excerpts, Claim text, narration, captions, transcripts, prompts, or model responses;
- personal data not already required in an approved artifact;
- binary data or base64.

Execution logs and artifact/revision references MUST be retained at least as long as the selected and
best revisions they describe. External sinks may use longer operational retention, but deletion from
an external sink must not delete canonical episode artifacts.

## Required operational views

An implementation SHOULD expose these derived views without changing state:

- episode trace timeline by agent and stage;
- cost/tokens/duration by agent, model, prompt, and revision round;
- PASS/REJECT and issue-category counts by rubric version;
- retries and failures by error class;
- route frequency and human-escalation reasons;
- stale artifact and checkpoint recovery counts;
- replay match/divergence rate.

Views are recomputable projections over append-only events. They are not workflow authority.
