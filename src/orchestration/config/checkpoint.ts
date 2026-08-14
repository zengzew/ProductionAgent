import {z} from "zod";
import checkpointFile from "../../../config/checkpoint.json";

export const checkpointBackendSchema = z.enum(["sqlite", "postgres"]);

const checkpointConfigSchema = z
  .object({
    schemaVersion: z.literal("checkpoint-config-v1"),
    backend: checkpointBackendSchema,
    sqlite: z
      .object({
        path: z.string().min(1),
      })
      .strict(),
    postgres: z
      .object({
        connectionStringEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
        schema: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/u),
      })
      .strict(),
  })
  .strict();

export type CheckpointBackend = z.infer<typeof checkpointBackendSchema>;
export type CheckpointFileConfig = z.infer<typeof checkpointConfigSchema>;

export type ResolvedCheckpointConfig = {
  readonly backend: CheckpointBackend;
  readonly sqlitePath: string;
  readonly postgresConnectionString?: string;
  readonly postgresSchema: string;
};

export const checkpointFileConfig = checkpointConfigSchema.parse(checkpointFile);

export const resolveCheckpointConfig = (
  input: {
    backend?: CheckpointBackend;
    sqlitePath?: string;
    postgresConnectionString?: string;
    postgresSchema?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): ResolvedCheckpointConfig => {
  const env = input.env ?? process.env;
  const backend =
    input.backend ??
    (env.CHECKPOINT_BACKEND as CheckpointBackend | undefined) ??
    checkpointFileConfig.backend;
  const parsedBackend = checkpointBackendSchema.parse(backend);
  const postgresSchema = z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/u)
    .parse(
      input.postgresSchema ??
        env.CHECKPOINT_POSTGRES_SCHEMA ??
        checkpointFileConfig.postgres.schema,
    );
  const postgresConnectionString =
    input.postgresConnectionString ?? env[checkpointFileConfig.postgres.connectionStringEnv];
  return {
    backend: parsedBackend,
    sqlitePath: input.sqlitePath ?? env.CHECKPOINT_SQLITE_PATH ?? checkpointFileConfig.sqlite.path,
    postgresConnectionString,
    postgresSchema,
  };
};
