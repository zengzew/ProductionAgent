# Failure Modes and Recovery

- Status: normative engineering contract
- Policy version: `failure-policy-v1`

## Boundary between rejection and failure

An editorial `REJECT` is a valid critic decision and follows routing/revision policy. A `FAILED`
execution means no valid domain decision or output was produced.

```text
valid artifact + valid REJECT gate -> revision flow
missing/invalid/stale artifact      -> failure recovery
```

Operational failures MUST NOT consume creative revision budget or be converted into low scores.

## Failure classes

| Code                          | Class          | Retryable   | Default response                                                   |
| ----------------------------- | -------------- | ----------- | ------------------------------------------------------------------ |
| `INPUT_MISSING`               | input          | no          | Stop; repair dependency or route to its producer.                  |
| `INPUT_HASH_MISMATCH`         | stale input    | no          | Cancel attempt; recalculate stale set and restart from dependency. |
| `INPUT_SCHEMA_INVALID`        | input          | no          | Quarantine dependency; do not call model.                          |
| `PROMPT_VERSION_UNAVAILABLE`  | configuration  | no          | Stop; require declared prompt artifact.                            |
| `AUTHENTICATION_FAILED`       | API            | no          | Stop; request credential/config recovery without logging secret.   |
| `PERMISSION_DENIED`           | API/filesystem | no          | Stop; require authority/config correction.                         |
| `RATE_LIMITED`                | API            | yes         | Retry schedule, honoring bounded provider `Retry-After`.           |
| `API_TIMEOUT`                 | API            | yes         | Retry same idempotent request.                                     |
| `API_UNAVAILABLE`             | API            | yes         | Retry, then declared fallback or stop.                             |
| `MODEL_REFUSAL`               | model          | no          | Stop or human review; never weaken fact/safety constraints.        |
| `OUTPUT_TRUNCATED`            | output         | yes once    | One contract-repair attempt.                                       |
| `OUTPUT_PARSE_FAILED`         | output         | yes once    | One contract-repair attempt.                                       |
| `OUTPUT_SCHEMA_INVALID`       | output         | yes once    | One contract-repair attempt.                                       |
| `OUTPUT_HASH_BINDING_INVALID` | output         | yes once    | One contract-repair attempt; never infer hashes.                   |
| `OUTPUT_GATE_INCONSISTENT`    | output         | yes once    | One contract-repair attempt.                                       |
| `TOOL_EXIT_NONZERO`           | tooling        | conditional | Classify deterministic vs transient before retry.                  |
| `CHECKPOINT_WRITE_FAILED`     | checkpoint     | yes         | Recover last committed checkpoint; retry commit only.              |
| `CHECKPOINT_CORRUPT`          | checkpoint     | no          | Restore last verified checkpoint or human escalation.              |
| `OBSERVABILITY_WRITE_FAILED`  | observability  | yes         | Preserve content state; enter degraded state until repaired.       |
| `UNKNOWN_FAILURE`             | unknown        | no          | Stop and escalate with sanitized evidence.                         |

“Conditional” means the runner classifies the exact command result. A compiler/test/schema failure is
deterministic and not retried unchanged. A process interruption or declared transient external service
may retry.

## Retry strategy

### API retries

Transient API and rate-limit errors use at most three total attempts per execution request:

```text
attempt 1: immediate
attempt 2: after 1 second
attempt 3: after 5 seconds
```

If the provider supplies `Retry-After`, use `min(provider value, 60 seconds)` instead of the fixed
delay. No random jitter is used in local deterministic replay; a distributed deployment MAY use
deterministic jitter derived from `executionId` and must record the delay.

Every retry MUST preserve:

- episode and approval epoch;
- input ArtifactRefs and `inputSetHash`;
- prompt version/hash;
- model and configuration hash unless an explicit fallback begins;
- response schema and rubric;
- idempotency key.

Before each retry, recheck input hashes. If they changed, stop with `INPUT_HASH_MISMATCH`; do not send
the stale request.

### Contract-repair retry

For truncated, unparsable, schema-invalid, hash-invalid, or gate-inconsistent model output:

1. Quarantine the invalid bytes and record only their hash in observability.
2. Supply the validator's structured error codes to the same model, prompt, input hashes, and schema.
3. Allow exactly one repair attempt.
4. Validate from scratch.
5. If still invalid, stop with `OUTPUT_SCHEMA_INVALID` and escalate to tooling/prompt maintenance or a
   human.

The repair request may ask only for contract conformance. It MUST NOT invite a new editorial answer,
change scores to satisfy thresholds, or consume creative revision budget.

### Deterministic tool retries

- Syntax, schema, lint, test, content, or delivery validation failures are evidence and are not retried
  unchanged.
- A killed/interrupted local process may retry once after confirming no partial publication.
- Rendering may resume only from a verified production checkpoint; an incomplete MP4 is never selected.
- ffmpeg/ffprobe errors caused by an invalid media file route to the producing stage, not another blind
  probe.

## Idempotency

External calls and stage executions use:

```text
idempotencyKey = sha256(
  episodeId + agentName + approvalEpoch + revisionRound + attemptPurpose
  + inputSetHash + promptHash + modelConfigurationHash + schemaVersion
)
```

Retries reuse the key. A fallback model, changed prompt, changed input, or new revision purpose creates
a new key and execution ID. If a provider returns a completed response for the same key, the runner
validates and reuses it rather than billing or producing twice.

## Invalid output handling

Invalid output is never an artifact candidate and never changes workflow status.

Reserved quarantine location:

```text
content/<episode>/.quarantine/<execution-id>/
```

Quarantine metadata records execution ID, sanitized error codes, byte hash, size, and retention deadline.
It does not publish the invalid file at a canonical path. Invalid output may be deleted after audit
retention, but its metadata and hash remain.

The runner MUST NOT:

- extract a plausible JSON substring from an otherwise invalid answer unless the declared parser does
  exactly that for all outputs;
- fill a missing hash, score, issue, owner, or verdict from Markdown prose;
- coerce an unknown enum to a nearby known value;
- keep partial outputs from a multi-artifact stage while marking the stage complete;
- turn a validation error into a critic REJECT.

## API failure recovery and fallback

### Model APIs

No implicit model fallback is allowed. An ordered fallback MAY be used only when it is declared in the
execution profile before the run. Fallback starts a new execution with its own model/config reference,
usage, cost, and idempotency key.

A fallback MUST preserve input hashes, prompt contract, response schema, rubric, and constraints. It
cannot lower thresholds or remove tools/evidence to make a request succeed. Results from different
model versions are not replay-equivalent and are compared only after normal validation.

The project boundary permanently excludes self-hosted GPT/LLM runtimes. Failure does not authorize
installing or starting one.

### TTS

TTS follows `config/tts-v2.json`: the configured primary provider is attempted first, and the declared
Microsoft Edge neural TTS fallback may run only under that configuration. A fallback execution records
the provider, voice, rate, pitch, reason, and new audio hashes. Timeline, captions, render, inspection,
and Delivery Critic are invalidated and rebuilt from measured fallback audio.

No other voice/provider fallback is inferred. If both configured providers fail, stop before timeline
or rendering.

### Sources and assets

A failed source-page capture does not authorize substituting an untraceable screenshot. The allowed
fallback is a Claim-supported programmatic graphic labeled as a demonstration, when current story and
asset contracts permit it. Rights uncertainty escalates to a human; it is not retryable.

## Checkpoint requirements

Checkpointing protects artifact references, not full content in state. A checkpoint contains hashes of:

- artifact index;
- workflow control artifact;
- revision ledger;
- selected/best pointers;
- the execution event up to the commit boundary.

### Commit protocol

1. Create a transaction intent with previous checkpoint ID and before/after ArtifactRefs.
2. Validate candidate files and dependency hashes.
3. Write new control files to same-filesystem temporary paths.
4. fsync files where the runtime supports it.
5. Atomically promote artifact/control files in deterministic order.
6. Write a commit marker containing the resulting control hashes.
7. Append `checkpoint.committed` and terminal execution events.

An episode may expose only one committed checkpoint as current. A model response, candidate file, or
partial control-file update is not a checkpoint.

### Recovery

On startup or after `CHECKPOINT_WRITE_FAILED`:

```text
valid commit marker + all hashes match -> resume after checkpoint
intent without commit marker           -> restore previous selected pointers and retry commit
commit marker with mismatch             -> mark corrupt; restore last earlier verified checkpoint
no verified checkpoint                  -> stop for human recovery
```

Recovery revalidates referenced files and gates before scheduling. It must not trust event order alone
or assume the newest mtime is correct. Restoring a checkpoint is recoverable pointer/file promotion,
not Git history rewriting.

## Partial-stage recovery

| Stage type                | Recoverable unit                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Multi-file research/story | Entire declared output set; partial files remain candidate/quarantine only.                      |
| Critic                    | One complete report gate; prose without valid gate is not recoverable.                           |
| TTS                       | Per-segment audio may be cached by exact narration/config hash, but metadata selects a full set. |
| Timeline/captions         | Rebuild from selected script and measured selected audio; do not hand-edit generated output.     |
| Render                    | Only a fully encoded, probed MP4 may be selected.                                                |
| Delivery review           | Rerun against exact current MP4/SRT/timeline hashes.                                             |

Cached segment reuse is allowed only when all dependency hashes and provider configuration match. A
cache hit is logged and does not bypass final aggregate validation.

## Failure escalation payload

After retry exhaustion, emit a concise failure artifact/reference containing:

- episode, trace, execution, agent, and stage;
- sanitized error code/class and provider request ID if safe;
- exact input ArtifactRefs and prompt/model versions;
- attempts, delays, usage/cost, and last valid checkpoint;
- invalid output hash if one exists;
- whether fallback was attempted;
- the single action or authority needed from a human.

Do not include full provider response, artifact content, prompt content, credentials, or speculative
root cause.

## Compatibility with the current workflow

- Existing project commands remain the production recovery primitives.
- Existing artifact and gate validation remains authoritative before any resume.
- Current manually executed stages may be treated as one committed legacy checkpoint after their
  hashes validate.
- No current report or output needs to be rewritten merely to adopt this policy.
- This policy prepares orchestration but does not implement LangGraph, queues, databases, or remote
  checkpoint stores.
