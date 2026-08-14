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
