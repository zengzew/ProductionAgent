# WP-M4-01 checkpoint persistence and schema migration

WP-M4-01 adds a versioned persistence boundary without changing the graph-facing
LangGraph `BaseCheckpointSaver` contract. Artifact files and their exact hashes
remain the source of truth; checkpoint state contains only `ArtifactRef`s and
bounded control summaries.

## Backend selection

`config/checkpoint.json` is the checked-in default. It selects SQLite and stores
the local database at `.orchestration/checkpoints.sqlite`. The default is also
used when `CHECKPOINT_BACKEND` is absent, so the default `ORCHESTRATOR=langgraph`
path and explicit `ORCHESTRATOR=manual` local/dev callers use the same SQLite
behavior.

Production callers can select PostgreSQL without changing a graph node:

```ts
const checkpointer = createConfiguredCheckpoint({
  repoRoot,
  env: {
    CHECKPOINT_BACKEND: "postgres",
    CHECKPOINT_POSTGRES_URL: process.env.CHECKPOINT_POSTGRES_URL,
  },
});
await initializeCheckpointBackend(checkpointer);
```

The PostgreSQL saver is the official `@langchain/langgraph-checkpoint-postgres`
implementation. Its tables are isolated in the configured `production_checkpoints`
schema by default. The connection string is never written to checkpoint metadata.
`createPostgresCheckpoint` and `createConfiguredCheckpoint` fail closed when a
PostgreSQL backend has no connection string.

The compatibility boundary is `src/orchestration/lg-compat.ts`. `graph/` only
receives the existing `LocalCheckpointer`/`BaseCheckpointSaver` shape; it does
not select SQLite, PostgreSQL, or a database client.

## Versions and registry

The current versions are:

| Layer                           | Current version              | Legacy version                                            | Minor migration                                                                 |
| ------------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ProductionState.schemaVersion` | `production-state-v1.1`      | `production-state-v1` / `production-state-v1.0`           | Add deterministic M3 control-field defaults and retain all existing refs/values |
| checkpoint metadata             | `production-checkpoint-v1.1` | `production-checkpoint-v1` / `production-checkpoint-v1.0` | Add version metadata without changing LangGraph's internal `checkpoint.v`       |

The state and checkpoint registries live under
`src/orchestration/schemas/migrations/`. Migration is a pure, deterministic
function and is idempotent: applying it to an already-current state returns the
same state and reports `migrated: false`.

On `getTuple`/`list`, the versioned saver:

1. extracts only the production state channels and leaves LangGraph framework
   channels untouched;
2. applies the registered minor migration, if needed;
3. restores `approvalEpoch`, `HumanDecision` summaries and authorization,
   production-stage receipts, revision history, and budget counters as stored;
4. adds checkpoint metadata versions; and
5. runs `assertReferenceOnlyState` before the graph can resume.

Migrations never synthesize an approval, mutate an artifact reference, or read
and rewrite an artifact body. Unknown fields are rejected rather than silently
dropped. A major mismatch never gets auto-migrated. It raises a clear
`CheckpointMigrationError`; if the episode is in-flight, the error is
`CHECKPOINT_SCHEMA_MAJOR_MIGRATION_IN_FLIGHT` and recovery must first drain or
explicitly handle that episode.

## Verification boundary

`tests/orchestration/checkpoint-migration.test.ts` covers deterministic minor
migration, idempotence, field preservation, no-auto-approval defaults, body
rejection, major-version fail-closed behavior, SQLite readback through a fresh
saver instance, and backend configuration. The PostgreSQL factory is exercised
without requiring a live database; live database provisioning and deployment are
outside WP-M4-01.

WP-M4-02 is documented and tested separately in
[`m4-02-failure-replay.md`](m4-02-failure-replay.md). M4-03 cache, M4-04
observability completeness, M4-05 legacy backfill, and M4-06 concurrency remain
outside this checkpoint-persistence work package.
