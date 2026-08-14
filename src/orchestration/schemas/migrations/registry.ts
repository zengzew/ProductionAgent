import {z} from "zod";
import {
  assertReferenceOnlyState,
  createInitialProductionState,
  productionStateSchema,
  type ProductionState,
} from "../../state";
import {stableJson, stableJsonEqual} from "../../stable-json";
import {
  LEGACY_PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
  LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
  PRODUCTION_CHECKPOINT_SCHEMA_NAME,
  PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
  PRODUCTION_STATE_SCHEMA_NAME,
  PRODUCTION_STATE_SCHEMA_VERSION,
  parseSchemaVersion,
  schemaVersionSchema,
  type SchemaVersion,
} from "./versions";

export const checkpointMetadataSchema = z
  .object({
    checkpointSchemaVersion: schemaVersionSchema,
    productionStateSchemaVersion: schemaVersionSchema,
  })
  .passthrough();

export type CheckpointMetadataWithSchema = z.infer<typeof checkpointMetadataSchema>;

export const migrationErrorCodes = [
  "CHECKPOINT_SCHEMA_VERSION_INVALID",
  "CHECKPOINT_SCHEMA_MAJOR_MISMATCH",
  "CHECKPOINT_SCHEMA_MAJOR_MIGRATION_IN_FLIGHT",
  "CHECKPOINT_SCHEMA_MIGRATION_MISSING",
  "CHECKPOINT_SCHEMA_VERSION_NEWER",
  "CHECKPOINT_SCHEMA_METADATA_MISMATCH",
  "CHECKPOINT_STATE_INVALID",
  "CHECKPOINT_REFERENCE_ONLY_VIOLATION",
  "CHECKPOINT_MIGRATION_FIELD_LOSS",
  "CHECKPOINT_MIGRATION_ARTIFACT_MUTATION",
] as const;

export type MigrationErrorCode = (typeof migrationErrorCodes)[number];

export class CheckpointMigrationError extends Error {
  readonly code: MigrationErrorCode;

  constructor(code: MigrationErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "CheckpointMigrationError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CheckpointMigrationError(
      "CHECKPOINT_STATE_INVALID",
      `${label} must be a JSON object`,
    );
  }
  return value as JsonRecord;
};

const cloneJson = <T>(value: T): T => structuredClone(value);

const forbiddenBodyKeys = new Set([
  "body",
  "content",
  "narration",
  "transcript",
  "captions",
  "claimLedger",
  "sourcePassage",
]);

const assertReferenceOnlyCandidate = (value: unknown): void => {
  const scan = (current: unknown, trail: string[]): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => scan(item, [...trail, String(index)]));
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenBodyKeys.has(key)) {
        throw new CheckpointMigrationError(
          "CHECKPOINT_REFERENCE_ONLY_VIOLATION",
          `checkpoint state contains forbidden artifact body field at ${[...trail, key].join(".")}`,
        );
      }
      scan(child, [...trail, key]);
    }
  };
  scan(value, []);
};

const assertMigrationPreservedFields = (before: JsonRecord, after: JsonRecord): void => {
  const missing = Object.keys(before).filter((key) => key !== "schemaVersion" && !(key in after));
  if (missing.length > 0) {
    throw new CheckpointMigrationError(
      "CHECKPOINT_MIGRATION_FIELD_LOSS",
      `migration dropped state fields: ${missing.sort().join(", ")}`,
    );
  }
  for (const key of ["artifacts", "best", "contentManifestRef"]) {
    if (key in before && !stableJsonEqual(before[key], after[key])) {
      throw new CheckpointMigrationError(
        "CHECKPOINT_MIGRATION_ARTIFACT_MUTATION",
        `migration changed artifact references at ${key}`,
      );
    }
  }
};

const assertNoKeysDropped = (before: unknown, after: unknown, trail: string[] = []): void => {
  if (Array.isArray(before)) {
    if (!Array.isArray(after) || after.length < before.length) {
      throw new CheckpointMigrationError(
        "CHECKPOINT_MIGRATION_FIELD_LOSS",
        `migration dropped array values at ${trail.join(".") || "state"}`,
      );
    }
    before.forEach((value, index) =>
      assertNoKeysDropped(value, after[index], [...trail, String(index)]),
    );
    return;
  }
  if (!before || typeof before !== "object") return;
  if (!after || typeof after !== "object" || Array.isArray(after)) {
    throw new CheckpointMigrationError(
      "CHECKPOINT_MIGRATION_FIELD_LOSS",
      `migration changed object shape at ${trail.join(".") || "state"}`,
    );
  }
  for (const [key, value] of Object.entries(before)) {
    const nextTrail = [...trail, key];
    if (!(key in (after as JsonRecord))) {
      if (value === undefined) continue;
      throw new CheckpointMigrationError(
        "CHECKPOINT_MIGRATION_FIELD_LOSS",
        `migration dropped field ${nextTrail.join(".")}`,
      );
    }
    assertNoKeysDropped(value, (after as JsonRecord)[key], nextTrail);
  }
};

const isInFlightState = (value: JsonRecord): boolean => {
  const phase = value.phase;
  if (phase !== "halted" && phase !== "published") return true;
  if (phase === "published") return false;
  if (value.pendingHumanRoute !== null && value.pendingHumanRoute !== undefined) return true;
  const repair = value.productionRepair;
  if (repair && typeof repair === "object" && !Array.isArray(repair)) {
    const status = (repair as JsonRecord).status;
    if (status === "human-escalation" || status === "repairing" || status === "unfreeze-review") {
      return true;
    }
  }
  return false;
};

const currentStateVersion = parseSchemaVersion(PRODUCTION_STATE_SCHEMA_VERSION);
const currentCheckpointVersion = parseSchemaVersion(PRODUCTION_CHECKPOINT_SCHEMA_VERSION);

export type ProductionStateMigration = {
  readonly from: string;
  readonly to: string;
  readonly kind: "minor";
  readonly migrate: (state: JsonRecord) => JsonRecord;
};

const defaultStateFor = (state: JsonRecord): ProductionState =>
  createInitialProductionState({
    episodeId: String(state.episodeId),
    runId: String(state.runId),
    artifacts: (state.artifacts ?? {}) as ProductionState["artifacts"],
  });

const migrateV1ToV11 = (state: JsonRecord): JsonRecord => {
  const defaults = defaultStateFor(state) as unknown as JsonRecord;
  return {
    ...defaults,
    ...state,
    schemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
  };
};

export const productionStateMigrationRegistry: readonly ProductionStateMigration[] = [
  {
    from: LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
    to: PRODUCTION_STATE_SCHEMA_VERSION,
    kind: "minor",
    migrate: migrateV1ToV11,
  },
  {
    from: "production-state-v1.0",
    to: PRODUCTION_STATE_SCHEMA_VERSION,
    kind: "minor",
    migrate: migrateV1ToV11,
  },
];

export type CheckpointSchemaMigration = {
  readonly from: string;
  readonly to: string;
  readonly kind: "minor";
  readonly migrate: (metadata: JsonRecord) => JsonRecord;
};

export const checkpointSchemaMigrationRegistry: readonly CheckpointSchemaMigration[] = [
  {
    from: LEGACY_PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    to: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    kind: "minor",
    migrate: (metadata) => ({
      ...metadata,
      checkpointSchemaVersion: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    }),
  },
  {
    from: "production-checkpoint-v1.0",
    to: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    kind: "minor",
    migrate: (metadata) => ({
      ...metadata,
      checkpointSchemaVersion: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    }),
  },
];

const schemaMismatch = (source: SchemaVersion, target: SchemaVersion, state: JsonRecord): never => {
  if (source.major !== target.major) {
    if (isInFlightState(state)) {
      throw new CheckpointMigrationError(
        "CHECKPOINT_SCHEMA_MAJOR_MIGRATION_IN_FLIGHT",
        `cannot migrate in-flight episode ${String(state.episodeId)} from ${source.value} to ${target.value}; drain or explicitly recover the episode first`,
      );
    }
    throw new CheckpointMigrationError(
      "CHECKPOINT_SCHEMA_MAJOR_MISMATCH",
      `incompatible checkpoint schema ${source.value}; supported schema is ${target.value}; automatic major migration is disabled`,
    );
  }
  if (source.minor > target.minor) {
    throw new CheckpointMigrationError(
      "CHECKPOINT_SCHEMA_VERSION_NEWER",
      `checkpoint schema ${source.value} is newer than supported schema ${target.value}`,
    );
  }
  throw new CheckpointMigrationError(
    "CHECKPOINT_SCHEMA_MIGRATION_MISSING",
    `no deterministic migration is registered from ${source.value} to ${target.value}`,
  );
};

const parseStateVersion = (value: unknown): SchemaVersion => {
  try {
    const parsed = parseSchemaVersion(value);
    if (parsed.name !== PRODUCTION_STATE_SCHEMA_NAME) throw new Error("wrong schema name");
    return parsed;
  } catch (error) {
    if (error instanceof CheckpointMigrationError) throw error;
    throw new CheckpointMigrationError(
      "CHECKPOINT_SCHEMA_VERSION_INVALID",
      `invalid production state schema version: ${String(value)}`,
    );
  }
};

const parseCheckpointVersion = (value: unknown): SchemaVersion => {
  try {
    const parsed = parseSchemaVersion(value);
    if (parsed.name !== PRODUCTION_CHECKPOINT_SCHEMA_NAME) throw new Error("wrong schema name");
    return parsed;
  } catch {
    throw new CheckpointMigrationError(
      "CHECKPOINT_SCHEMA_VERSION_INVALID",
      `invalid production checkpoint schema version: ${String(value)}`,
    );
  }
};

export type ProductionStateMigrationResult = {
  readonly state: ProductionState;
  readonly from: string;
  readonly to: string;
  readonly migrated: boolean;
};

export const migrateProductionState = (value: unknown): ProductionStateMigrationResult => {
  const original = asRecord(value, "production state");
  assertReferenceOnlyCandidate(original);
  const source = parseStateVersion(original.schemaVersion);
  let current = cloneJson(original);
  let migrated = false;

  while (parseStateVersion(current.schemaVersion).value !== PRODUCTION_STATE_SCHEMA_VERSION) {
    const currentVersion = parseStateVersion(current.schemaVersion);
    if (currentVersion.major !== currentStateVersion.major) {
      schemaMismatch(currentVersion, currentStateVersion, current);
    }
    const migration = productionStateMigrationRegistry.find(
      (candidate) => candidate.from === currentVersion.value,
    );
    if (!migration) schemaMismatch(currentVersion, currentStateVersion, current);
    const before = current;
    current = migration!.migrate(cloneJson(current));
    assertMigrationPreservedFields(before, current);
    assertReferenceOnlyCandidate(current);
    migrated = true;
  }

  if (parseStateVersion(current.schemaVersion).major !== currentStateVersion.major) {
    schemaMismatch(parseStateVersion(current.schemaVersion), currentStateVersion, current);
  }

  try {
    const parsedState = productionStateSchema.strict().parse(current);
    assertNoKeysDropped(current, parsedState);
    const state = assertReferenceOnlyState(parsedState);
    return {
      state,
      from: source.value,
      to: PRODUCTION_STATE_SCHEMA_VERSION,
      migrated,
    };
  } catch (error) {
    if (error instanceof CheckpointMigrationError) throw error;
    throw new CheckpointMigrationError(
      "CHECKPOINT_STATE_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }
};

export type CheckpointMetadataMigrationResult = {
  readonly metadata: CheckpointMetadataWithSchema;
  readonly from: string;
  readonly to: string;
  readonly migrated: boolean;
};

export const migrateCheckpointMetadata = (
  value: unknown,
  stateVersion: string,
  state: JsonRecord,
): CheckpointMetadataMigrationResult => {
  const original = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const metadata = cloneJson(original as JsonRecord);
  const rawVersion =
    metadata.checkpointSchemaVersion ?? LEGACY_PRODUCTION_CHECKPOINT_SCHEMA_VERSION;
  const source = parseCheckpointVersion(rawVersion);
  const parsedStateVersion = parseStateVersion(stateVersion);
  if (parsedStateVersion.value !== PRODUCTION_STATE_SCHEMA_VERSION) {
    throw new CheckpointMigrationError(
      "CHECKPOINT_SCHEMA_METADATA_MISMATCH",
      `checkpoint metadata state version ${parsedStateVersion.value} was not migrated to ${PRODUCTION_STATE_SCHEMA_VERSION}`,
    );
  }
  if (source.major !== currentCheckpointVersion.major) {
    schemaMismatch(source, currentCheckpointVersion, state);
  }
  if (source.minor > currentCheckpointVersion.minor) {
    throw new CheckpointMigrationError(
      "CHECKPOINT_SCHEMA_VERSION_NEWER",
      `checkpoint schema ${source.value} is newer than supported schema ${PRODUCTION_CHECKPOINT_SCHEMA_VERSION}`,
    );
  }

  let current: JsonRecord = {
    ...metadata,
    checkpointSchemaVersion: rawVersion,
  };
  let migrated = false;
  while (
    parseCheckpointVersion(current.checkpointSchemaVersion).value !==
    PRODUCTION_CHECKPOINT_SCHEMA_VERSION
  ) {
    const version = parseCheckpointVersion(current.checkpointSchemaVersion);
    const migration = checkpointSchemaMigrationRegistry.find(
      (candidate) => candidate.from === version.value,
    );
    if (!migration) schemaMismatch(version, currentCheckpointVersion, state);
    const before = current;
    current = migration!.migrate(cloneJson(current));
    assertMigrationPreservedFields(before, current);
    migrated = true;
  }
  current = {
    ...current,
    checkpointSchemaVersion: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    productionStateSchemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
  };
  return {
    metadata: checkpointMetadataSchema.parse(current),
    from: source.value,
    to: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    migrated,
  };
};

export const migrationRegistrySummary = (): readonly {
  from: string;
  to: string;
  kind: "minor";
}[] =>
  [...productionStateMigrationRegistry, ...checkpointSchemaMigrationRegistry].map(
    ({from, to, kind}) => ({from, to, kind}),
  );

export const migrationFingerprint = (value: unknown): string => stableJson(value);
