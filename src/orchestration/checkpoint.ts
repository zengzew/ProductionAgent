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
  return createSqliteCheckpointer(absolutePath);
};

export const createPostgresCheckpoint = (input: {
  connectionString: string;
  schema?: string;
}): LocalCheckpointer => {
  if (!input.connectionString.trim()) {
    throw new Error("CHECKPOINT_POSTGRES_CONNECTION_REQUIRED");
  }
  return createPostgresCheckpointer(input.connectionString, {schema: input.schema});
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

export const checkpointConfig = (episodeId: string) => ({
  configurable: {thread_id: episodeId},
});

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
  assertCheckpointControlHash({
    state,
    expectedHash: (tuple.metadata as Record<string, unknown>).productionStateSha256,
    requireHash: true,
  });
  return {tuple, state};
};
