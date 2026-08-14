import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {emptyCheckpoint} from "@langchain/langgraph";
import {SqliteSaver} from "@langchain/langgraph-checkpoint-sqlite";
import {afterEach, describe, expect, it} from "vitest";
import {
  LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
  PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
  PRODUCTION_STATE_SCHEMA_VERSION,
  assertReferenceOnlyState,
  buildArtifactRef,
  createConfiguredCheckpoint,
  createInitialProductionState,
  createLocalCheckpoint,
  createPostgresCheckpoint,
  migrateCheckpointMetadata,
  migrateProductionState,
  resolveCheckpointConfig,
  stableJson,
  type ProductionState,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const createFixture = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-migration-"));
  temporaryDirectories.push(repoRoot);
  const artifactPath = "content/episode-migration/control/contract.md";
  fs.mkdirSync(path.join(repoRoot, path.dirname(artifactPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, artifactPath), "artifact body remains outside state\n");
  const ref = buildArtifactRef({
    repoRoot,
    artifactId: "episode-migration:control:contract",
    episodeId: "episode-migration",
    path: artifactPath,
    mediaType: "text/markdown",
    schemaVersion: "fixture-v1",
    producer: "test",
  });
  const state = createInitialProductionState({
    episodeId: "episode-migration",
    runId: "run-migration",
    artifacts: {contract: ref},
  });
  return {repoRoot, ref, state};
};

const richState = (state: ProductionState, ref: ProductionState["artifacts"][string]) => ({
  ...state,
  schemaVersion: LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
  phase: "production" as const,
  approvalEpoch: 7,
  round: 4,
  contentManifestRef: ref,
  revisionLog: [{revisionId: "revision-4", artifactRef: ref}],
  approvals: {
    "content-gate": {
      decisionRef: ref,
      status: "approved" as const,
      gate: "content-approval" as const,
      decision: "approve" as const,
      approvalEpoch: 7,
      reason: "approved in the current epoch",
    },
  },
  productionAuthorization: {
    decisionRef: ref,
    manifestRef: ref,
    decisionId: "decision-migration",
    gate: "content-approval" as const,
    approvalEpoch: 7,
  },
  lockedRanges: [
    {
      lockId: "lock-migration",
      artifactRef: ref,
      locator: {kind: "whole-artifact" as const, value: ref.artifactId},
      reviewer: "reviewer",
      decisionId: "decision-migration",
    },
  ],
  pendingHumanRoute: {
    ownerAgent: "production-executor" as const,
    routeTarget: "timeline",
    restartAt: "timeline",
    issueIds: ["issue-migration"],
  },
  productionStages: {
    "materialize:story": {
      stage: "materialize:story" as const,
      status: "SUCCEEDED" as const,
      attempt: 1,
      inputSetHash: "0".repeat(64),
      outputArtifacts: [ref],
      issues: [],
      decision: {code: "STAGE_SUCCEEDED", summary: "fixture stage completed"},
    },
  },
  budget: {
    ...state.budget,
    maxRoundsContent: 4,
    maxRoundsProduction: 2,
    roundsUsed: {"production-executor": 2},
    spentCostUsd: 3.25,
    spentWallclockSeconds: 91,
  },
});

const stateChannels = (value: Record<string, unknown>): Record<string, unknown> => {
  const fields = new Set([
    "schemaVersion",
    "episodeId",
    "runId",
    "phase",
    "approvalEpoch",
    "round",
    "artifacts",
    "best",
    "evaluations",
    "issues",
    "gates",
    "revisionLog",
    "events",
    "budget",
    "approvals",
    "contentManifestRef",
    "strategyLevel",
    "completedAgents",
    "attempts",
    "decisions",
    "haltReason",
    "productionStages",
    "productionIssues",
    "lockedRanges",
    "processedDecisionIds",
    "productionAuthorization",
    "pendingHumanRoute",
    "unfreeze",
    "productionRepair",
  ]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => fields.has(key)));
};

describe("WP-M4-01 schema migrations", () => {
  it("deterministically migrates a minor state version without changing references or approvals", () => {
    const {ref, state} = createFixture();
    const legacy = richState(state, ref);
    const first = migrateProductionState(legacy);
    const second = migrateProductionState(first.state);

    expect(first).toMatchObject({
      from: LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
      to: PRODUCTION_STATE_SCHEMA_VERSION,
      migrated: true,
    });
    expect(first.state.schemaVersion).toBe(PRODUCTION_STATE_SCHEMA_VERSION);
    expect(first.state.approvalEpoch).toBe(7);
    expect(first.state.approvals["content-gate"]).toMatchObject({status: "approved"});
    expect(first.state.productionAuthorization?.decisionId).toBe("decision-migration");
    expect(first.state.lockedRanges[0]?.lockId).toBe("lock-migration");
    expect(first.state.pendingHumanRoute?.restartAt).toBe("timeline");
    expect(first.state.revisionLog).toEqual(legacy.revisionLog);
    expect(first.state.budget).toEqual(legacy.budget);
    expect(first.state.artifacts).toEqual(legacy.artifacts);
    expect(first.state.contentManifestRef).toEqual(legacy.contentManifestRef);
    expect(second.migrated).toBe(false);
    expect(stableJson(second.state)).toBe(stableJson(first.state));
    expect(assertReferenceOnlyState(first.state)).toEqual(first.state);

    const metadata = migrateCheckpointMetadata(
      {source: "loop", step: 4, parents: {}},
      first.to,
      first.state as unknown as Record<string, unknown>,
    );
    const reappliedMetadata = migrateCheckpointMetadata(
      metadata.metadata,
      first.to,
      first.state as unknown as Record<string, unknown>,
    );
    expect(metadata.migrated).toBe(true);
    expect(reappliedMetadata.migrated).toBe(false);
    expect(stableJson(reappliedMetadata.metadata)).toBe(stableJson(metadata.metadata));
  });

  it("adds only deterministic defaults and never creates an approval", () => {
    const {ref, state} = createFixture();
    const legacy: Record<string, unknown> = {
      ...richState(state, ref),
      schemaVersion: LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
    };
    for (const key of [
      "approvalEpoch",
      "lockedRanges",
      "processedDecisionIds",
      "productionAuthorization",
      "pendingHumanRoute",
      "unfreeze",
      "productionRepair",
      "productionStages",
      "productionIssues",
    ]) {
      delete legacy[key];
    }
    delete legacy.approvals;

    const migrated = migrateProductionState(legacy);
    expect(migrated.state.approvalEpoch).toBe(0);
    expect(migrated.state.approvals).toEqual({});
    expect(migrated.state.productionAuthorization).toBeNull();
    expect(migrated.state.productionStages).toEqual({});
    expect(migrated.state.productionIssues).toEqual({});
    expect(migrated.state.productionRepair.status).toBe("idle");
    expect(migrated.state.pendingHumanRoute).toBeNull();
  });

  it("fails closed for incompatible major versions and blocks in-flight migration", () => {
    const {state} = createFixture();
    const inFlight = {...state, schemaVersion: "production-state-v2", phase: "production" as const};
    expect(() => migrateProductionState(inFlight)).toThrow(
      /CHECKPOINT_SCHEMA_MAJOR_MIGRATION_IN_FLIGHT/u,
    );

    const terminal = {...state, schemaVersion: "production-state-v2", phase: "halted" as const};
    expect(() => migrateProductionState(terminal)).toThrow(/CHECKPOINT_SCHEMA_MAJOR_MISMATCH/u);

    expect(() =>
      migrateCheckpointMetadata(
        {
          checkpointSchemaVersion: "production-checkpoint-v2",
          productionStateSchemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
        },
        PRODUCTION_STATE_SCHEMA_VERSION,
        inFlight,
      ),
    ).toThrow(/CHECKPOINT_SCHEMA_MAJOR_MIGRATION_IN_FLIGHT/u);
  });

  it("rejects artifact bodies instead of dropping them during migration", () => {
    const {state} = createFixture();
    expect(() =>
      migrateProductionState({
        ...state,
        schemaVersion: LEGACY_PRODUCTION_STATE_SCHEMA_VERSION,
        content: "full artifact body",
      }),
    ).toThrow(/CHECKPOINT_REFERENCE_ONLY_VIOLATION/u);
  });

  it("fails closed rather than silently dropping nested fields", () => {
    const {ref, state} = createFixture();
    const legacy = richState(state, ref);
    expect(() =>
      migrateProductionState({
        ...legacy,
        budget: {...legacy.budget, unmodeledBudgetField: "must remain visible"},
      }),
    ).toThrow(/CHECKPOINT_MIGRATION_FIELD_LOSS/u);
  });
});

describe("WP-M4-01 SQLite persistence and backend config", () => {
  it("restores a legacy checkpoint through a fresh saver instance with versioned metadata", async () => {
    const {repoRoot, ref, state} = createFixture();
    const databasePath = path.join(repoRoot, ".orchestration", "checkpoints.sqlite");
    fs.mkdirSync(path.dirname(databasePath), {recursive: true});
    const legacy = richState(state, ref);
    const rawSaver = SqliteSaver.fromConnString(databasePath);
    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = stateChannels(legacy);
    checkpoint.channel_versions = Object.fromEntries(
      Object.keys(checkpoint.channel_values).map((key, index) => [key, index + 1]),
    );
    await rawSaver.put({configurable: {thread_id: state.episodeId}}, checkpoint, {
      source: "input",
      step: -1,
      parents: {},
    });

    const firstSaver = createLocalCheckpoint({repoRoot});
    const first = await firstSaver.getTuple({configurable: {thread_id: state.episodeId}});
    const restartedSaver = createLocalCheckpoint({repoRoot});
    const recovered = await restartedSaver.getTuple({
      configurable: {thread_id: state.episodeId},
    });

    expect(first?.metadata).toMatchObject({
      checkpointSchemaVersion: PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
      productionStateSchemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
    });
    expect(recovered?.checkpoint.channel_values).toEqual(first?.checkpoint.channel_values);
    const recoveredState = stateChannels(
      recovered?.checkpoint.channel_values as Record<string, unknown>,
    );
    expect(recoveredState.approvalEpoch).toBe(7);
    expect((recoveredState.productionAuthorization as {decisionId: string}).decisionId).toBe(
      "decision-migration",
    );
    expect(
      (recoveredState.productionStages as Record<string, {status: string}>)["materialize:story"]
        ?.status,
    ).toBe("SUCCEEDED");
    expect((recoveredState.budget as {spentCostUsd: number}).spentCostUsd).toBe(3.25);
    expect(assertReferenceOnlyState(recoveredState)).toEqual(recoveredState);
  });

  it("keeps SQLite as the default and requires a URL for configured Postgres", () => {
    expect(resolveCheckpointConfig({env: {}})).toMatchObject({
      backend: "sqlite",
      sqlitePath: ".orchestration/checkpoints.sqlite",
    });
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pa-config-"));
    temporaryDirectories.push(configRoot);
    const postgres = createPostgresCheckpoint({
      connectionString:
        "postgresql://checkpoint-user:checkpoint-password@localhost:5432/production",
    });
    expect(typeof postgres.getTuple).toBe("function");
    expect(() =>
      createConfiguredCheckpoint({repoRoot: configRoot, backend: "postgres", env: {}}),
    ).toThrow(/CHECKPOINT_POSTGRES_CONNECTION_REQUIRED/u);
  });
});
