import {z} from "zod";

export const PRODUCTION_STATE_SCHEMA_NAME = "production-state" as const;
export const PRODUCTION_STATE_SCHEMA_VERSION = "production-state-v1.1" as const;
export const LEGACY_PRODUCTION_STATE_SCHEMA_VERSION = "production-state-v1" as const;

export const PRODUCTION_CHECKPOINT_SCHEMA_NAME = "production-checkpoint" as const;
export const PRODUCTION_CHECKPOINT_SCHEMA_VERSION = "production-checkpoint-v1.1" as const;
export const LEGACY_PRODUCTION_CHECKPOINT_SCHEMA_VERSION = "production-checkpoint-v1" as const;

export const schemaVersionSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*-v[0-9]+(?:\.[0-9]+)?$/u,
    "schema version must use name-v<major>.<minor> format",
  );

export type SchemaVersion = {
  readonly name: string;
  readonly major: number;
  readonly minor: number;
  readonly value: string;
};

const versionPattern = /^([a-z][a-z0-9-]*)-v([0-9]+)(?:\.([0-9]+))?$/u;

export const parseSchemaVersion = (value: unknown): SchemaVersion => {
  if (typeof value !== "string") {
    throw new Error("schema version must be a string");
  }
  const match = versionPattern.exec(value);
  if (!match) throw new Error(`invalid schema version: ${value}`);
  return {
    name: match[1]!,
    major: Number.parseInt(match[2]!, 10),
    minor: Number.parseInt(match[3] ?? "0", 10),
    value,
  };
};

export const isProductionStateSchemaVersion = (value: unknown): boolean => {
  try {
    return parseSchemaVersion(value).name === PRODUCTION_STATE_SCHEMA_NAME;
  } catch {
    return false;
  }
};

export const isProductionCheckpointSchemaVersion = (value: unknown): boolean => {
  try {
    return parseSchemaVersion(value).name === PRODUCTION_CHECKPOINT_SCHEMA_NAME;
  } catch {
    return false;
  }
};
