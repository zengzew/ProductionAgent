import fs from "node:fs";
import path from "node:path";
import {
  createPostgresCheckpointer,
  createSqliteCheckpointer,
  resumeAfterStubApproval,
  type LocalCheckpointer,
} from "./lg-compat";
import {
  resolveCheckpointConfig,
  type CheckpointBackend,
  type ResolvedCheckpointConfig,
} from "./config/checkpoint";
import {assertCheckpointControlHash} from "./checkpoint-integrity";
import {assertReferenceOnlyState, productionStateFieldNames, type ProductionState} from "./state";
import {episodeIdSchema} from "./identity";

export const DEFAULT_CHECKPOINT_PATH = ".orchestration/checkpoints.sqlite";

export const createLocalCheckpoint = (input: {
  repoRoot: string;
  databasePath?: string;
}): LocalCheckpointer => {
  const requested = input.databasePath ?? DEFAULT_CHECKPOINT_PATH;
  const absolutePath = path.resolve(input.repoRoot, requested);
  const relative = path.relative(input.repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("checkpoint path must stay inside the repository");
  }
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  return createSqliteCheckpointer(absolutePath, {casRoot: input.repoRoot});
};

export const createPostgresCheckpoint = (input: {
  connectionString: string;
  schema?: string;
  casRoot?: string;
}): LocalCheckpointer => {
  if (!input.connectionString.trim()) {
    throw new Error("CHECKPOINT_POSTGRES_CONNECTION_REQUIRED");
  }
  return createPostgresCheckpointer(input.connectionString, {
    schema: input.schema,
    casRoot: input.casRoot,
  });
};

export const createConfiguredCheckpoint = (input: {
  repoRoot: string;
  backend?: CheckpointBackend;
  databasePath?: string;
  postgresConnectionString?: string;
  postgresSchema?: string;
  env?: NodeJS.ProcessEnv;
}): LocalCheckpointer => {
  const config = resolveCheckpointConfig({
    backend: input.backend,
    sqlitePath: input.databasePath,
    postgresConnectionString: input.postgresConnectionString,
    postgresSchema: input.postgresSchema,
    env: input.env,
  });
  if (config.backend === "sqlite") {
    return createLocalCheckpoint({repoRoot: input.repoRoot, databasePath: config.sqlitePath});
  }
  if (!config.postgresConnectionString) {
    throw new Error(
      "CHECKPOINT_POSTGRES_CONNECTION_REQUIRED: set CHECKPOINT_POSTGRES_URL or pass postgresConnectionString",
    );
  }
  return createPostgresCheckpoint({
    connectionString: config.postgresConnectionString,
    schema: config.postgresSchema,
    casRoot: input.repoRoot,
  });
};

export const initializeCheckpointBackend = async (
  checkpointer: LocalCheckpointer,
): Promise<void> => {
  const setup = (checkpointer as LocalCheckpointer & {setup?: () => void | Promise<void>}).setup;
  if (setup) await setup.call(checkpointer);
};

export const closeCheckpointBackend = async (checkpointer: LocalCheckpointer): Promise<void> => {
  const end = (checkpointer as LocalCheckpointer & {end?: () => void | Promise<void>}).end;
  if (end) await end.call(checkpointer);
};

export type {ResolvedCheckpointConfig};

export type RuntimeCheckpointConfig = {
  configurable: {
    thread_id: string;
    episode_id?: string;
    run_id?: string;
    trace_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
    [key: string]: unknown;
  };
};

export const checkpointConfig = (
  input:
    | string
    | {
        episodeId: string;
        runId: string;
        threadId?: string;
        traceId?: string;
      },
): RuntimeCheckpointConfig => {
  const identity =
    typeof input === "string"
      ? {episodeId: input, threadId: input}
      : {
          ...input,
          threadId: input.threadId,
        };
  const episodeId = episodeIdSchema.parse(identity.episodeId);
  const threadId = identity.threadId ?? episodeId;
  return {
    configurable: {
      thread_id: threadId,
      episode_id: episodeId,
      ...(typeof input === "string" ? {} : {run_id: input.runId}),
      ...(typeof input === "string"
        ? {}
        : {trace_id: input.traceId ?? `${episodeId}:run:${input.runId}`}),
    },
  };
};

export const checkpointIdentityFromConfig = (
  config: Parameters<LocalCheckpointer["getTuple"]>[0],
): {episodeId?: string; runId?: string; threadId?: string; traceId?: string} => {
  const configurable = (config.configurable ?? {}) as Record<string, unknown>;
  return {
    ...(typeof configurable.episode_id === "string" ? {episodeId: configurable.episode_id} : {}),
    ...(typeof configurable.run_id === "string" ? {runId: configurable.run_id} : {}),
    ...(typeof configurable.thread_id === "string" ? {threadId: configurable.thread_id} : {}),
    ...(typeof configurable.trace_id === "string" ? {traceId: configurable.trace_id} : {}),
  };
};

// The concrete Command generic includes graph node names and must not leak past
// lg-compat. `never` keeps callers framework-neutral while preserving the runtime value.
export const resumeCheckpoint = (value: unknown): never => resumeAfterStubApproval(value) as never;

export type VerifiedCheckpoint = {
  tuple: NonNullable<Awaited<ReturnType<LocalCheckpointer["getTuple"]>>>;
  state: ProductionState;
};

/**
 * Strict replay entry point. Legacy M1/M3 callers may continue to read a checkpoint without a
 * control hash, but a replay must prove that the persisted state is the state being resumed.
 */
export const restoreVerifiedCheckpoint = async (input: {
  checkpointer: LocalCheckpointer;
  config: Parameters<LocalCheckpointer["getTuple"]>[0];
}): Promise<VerifiedCheckpoint> => {
  const tuple = await input.checkpointer.getTuple(input.config);
  if (!tuple) throw new Error("REPLAY_CHECKPOINT_MISSING");
  const values = tuple.checkpoint.channel_values as Record<string, unknown>;
  const state = assertReferenceOnlyState(
    Object.fromEntries(
      Object.entries(values).filter(([key]) => productionStateFieldNames.includes(key)),
    ),
  );
  const identity = checkpointIdentityFromConfig(input.config);
  if (identity.episodeId && identity.episodeId !== state.episodeId) {
    throw new Error(`CHECKPOINT_EPISODE_MISMATCH:${identity.episodeId}:${state.episodeId}`);
  }
  if (identity.runId && identity.runId !== state.runId) {
    throw new Error(`CHECKPOINT_RUN_MISMATCH:${identity.runId}:${state.runId}`);
  }
  assertCheckpointControlHash({
    state,
    expectedHash: (tuple.metadata as Record<string, unknown>).productionStateSha256,
    requireHash: true,
  });
  return {tuple, state};
};
