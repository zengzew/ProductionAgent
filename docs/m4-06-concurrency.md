# M4.06 concurrency contract

M4.06 keeps runtime state episode-scoped while allowing different episodes to run concurrently.
`episodeId`, `runId`, `threadId`, and `traceId` are carried together by `RuntimeIdentity`. A
checkpoint config uses the episode as the physical LangGraph `thread_id` and repeats it as
`episode_id`; a run-aware config also carries `run_id` and `trace_id`.

## Admission and lock

`config/concurrency.json` is the source of truth for the global cap, admission policy, polling,
lease heartbeat, and stale timeout. The default cap is two concurrent orchestration runs. The
global slot lease and the per-episode lease are separate files and separate constraints. The
episode lease owner records `episodeId`, `runId`, `threadId`, `traceId`, `acquiredAt`, heartbeat,
PID, and a random token. Normal completion, thrown errors, and rejected admission release the
leases; release is idempotent.

A lease is stale only after `staleAfterMs` since the latest heartbeat/acquisition and only when
its owner PID is no longer alive. A live PID is never reclaimed just because its timestamp is
old. Recovery re-reads the record, removes the stale lease, and emits `lock.stale-recovery`.
Malformed old lease files use their file mtime and follow the same bounded recovery path.

## Optimistic safety

Checkpoint writes compare the current latest checkpoint ID with the caller's expected
`configurable.checkpoint_id` while holding a short file mutex. Artifact index publication uses the
same compare-and-swap pattern over an index control hash. A mismatch fails closed with a
`CHECKPOINT_CAS_CONFLICT` or `ARTIFACT_INDEX_CAS_CONFLICT`; it never overwrites the newer state.

SQLite and Postgres use the same runtime identity validation and CAS contract at the versioned
checkpoint boundary. Postgres connection setup remains configuration-only in local tests; no
external database or publish service is started by M4.06.

## Observability and isolation

Concurrency events are written to
`content/<episodeId>/observability/concurrency-events.jsonl`. Event identity includes episode,
run, thread, and trace IDs. Run reports include lock acquisition/release, contention, stale
recovery, queue/admission/rejection, and the configured cap. Artifact registries, production
outputs, cache entries, and reports resolve below the owning episode directory. Content-addressed
cache bytes may share a key, but cache metadata with a different episode is rejected and formal
ArtifactRefs remain episode-scoped.
