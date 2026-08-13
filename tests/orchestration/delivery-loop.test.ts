import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  createInitialProductionState,
  createLocalCheckpoint,
  createProductionSubgraph,
  freezeContent,
  productionStageInputSetHash,
  productionStageOrder,
  type ProductionStageAdapter,
  type ProductionStageResult,
} from "../../src/orchestration";
import type {ProductionState} from "../../src/orchestration/state";
import type {ArtifactRef} from "../../src/orchestration/schemas/artifact";
import type {ProductionIssue} from "../../src/orchestration/schemas/production";

const temporaryDirectories: string[] = [];

const write = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const createFixture = (): {repoRoot: string; state: ProductionState} => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-delivery-loop-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-001";
  const finalScriptPath = `content/${episodeId}/story/final-script.md`;
  write(repoRoot, finalScriptPath, "frozen script bytes\n");
  const finalScriptRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:story:final-script`,
    episodeId,
    path: finalScriptPath,
    mediaType: "text/markdown",
    schemaVersion: "final-script-v1",
    producer: "fixture",
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  const frozen = freezeContent({
    repoRoot,
    episodeId,
    artifactIndex: {
      schemaVersion: "artifact-index-v1",
      episodeId,
      artifacts: [
        {
          ref: finalScriptRef,
          state: "selected",
          producedByExecutionId: "fixture:freeze",
          dependencies: [],
        },
      ],
      selected: {
        [finalScriptRef.artifactId]: {
          revision: finalScriptRef.revision,
          sha256: finalScriptRef.sha256,
          path: finalScriptRef.path,
        },
      },
    },
    selectedArtifactRefs: [finalScriptRef],
    issues: [],
    frozenAt: "2026-08-13T00:00:00.000Z",
    frozenBy: "fixture",
  });
  const state = createInitialProductionState({
    episodeId,
    runId: "run-delivery-loop",
    artifacts: {finalScript: finalScriptRef},
  });
  return {repoRoot, state: {...state, ...frozen.stateUpdate, phase: "frozen"}};
};

const issueFor = (
  repoRoot: string,
  request: Parameters<ProductionStageAdapter>[0],
  affectedArtifact: ArtifactRef,
) => {
  const issueId = `issue-delivery-r${request.attempt}-01`;
  const issueRefPath = `content/${request.episodeId}/production/issues/${issueId}.json`;
  write(repoRoot, issueRefPath, "fixture issue body\n");
  const issueRef = buildArtifactRef({
    repoRoot,
    artifactId: `${request.episodeId}:production:${issueId}`,
    episodeId: request.episodeId,
    path: issueRefPath,
    mediaType: "application/json",
    schemaVersion: "production-issue-v1",
    producer: "fixture",
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  return {
    issueId,
    issueRef,
    category: "delivery.caption-split" as const,
    severity: "blocker" as const,
    status: "open" as const,
    ownerAgent: "production-executor" as const,
    routeTarget: "captions" as const,
    restartAt: "timeline" as const,
    affectedArtifact,
    locator: {kind: "srt-cue" as const, value: "1"},
    summary: "caption split requires timeline regeneration",
  } satisfies ProductionIssue;
};

const fakeAdapter = (repoRoot: string, calls: string[]): ProductionStageAdapter => {
  let version = 0;
  let deliveryAttempts = 0;
  return async (request) => {
    calls.push(`${request.stage}:${request.forceRerun ? "force" : "normal"}`);
    const shouldSkip = Boolean(
      request.cached &&
      !request.forceRerun &&
      request.cached.status !== "FAILED" &&
      request.cached.outputArtifacts.length > 0,
    );
    if (shouldSkip) {
      return {
        contractVersion: "production-stage-result-v1",
        executionId: request.executionId,
        episodeId: request.episodeId,
        stage: request.stage,
        status: "SKIPPED",
        attempt: request.attempt,
        inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
        inputArtifacts: request.inputArtifacts,
        outputArtifacts: request.cached?.outputArtifacts ?? [],
        issues: [],
        decision: {code: "FIXTURE_SKIPPED", summary: "fixture hash cache hit"},
      } satisfies ProductionStageResult;
    }

    version += 1;
    const slug = request.stage.replaceAll(":", "-");
    const artifactId =
      request.stage === "validate:delivery"
        ? `${request.episodeId}:production:receipt-validate-delivery`
        : `${request.episodeId}:production:${slug}`;
    const artifactPath = `content/${request.episodeId}/production/${slug}.json`;
    write(repoRoot, artifactPath, `fixture-${request.stage}-v${version}\n`);
    const output = buildArtifactRef({
      repoRoot,
      artifactId,
      episodeId: request.episodeId,
      path: artifactPath,
      mediaType: "application/json",
      schemaVersion: "fixture-production-v1",
      producer: `fixture:${request.stage}`,
      previous: request.previousArtifacts.find((artifact) => artifact.artifactId === artifactId),
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    if (request.stage === "validate:delivery") {
      deliveryAttempts += 1;
      if (deliveryAttempts === 1) {
        const affected = request.inputArtifacts.find((artifact) =>
          artifact.artifactId.endsWith(":timeline"),
        );
        if (!affected) throw new Error("fixture timeline artifact missing");
        return {
          contractVersion: "production-stage-result-v1",
          executionId: request.executionId,
          episodeId: request.episodeId,
          stage: request.stage,
          status: "FAILED",
          attempt: request.attempt,
          inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
          inputArtifacts: request.inputArtifacts,
          outputArtifacts: [],
          issues: [issueFor(repoRoot, request, affected)],
          decision: {code: "FIXTURE_DELIVERY_REJECT", summary: "fixture rejected delivery"},
          failure: {
            code: "DELIVERY_REJECTED",
            retryable: false,
            detail: "fixture caption split",
          },
        } satisfies ProductionStageResult;
      }
    }
    return {
      contractVersion: "production-stage-result-v1",
      executionId: request.executionId,
      episodeId: request.episodeId,
      stage: request.stage,
      status: "SUCCEEDED",
      attempt: request.attempt,
      inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
      inputArtifacts: request.inputArtifacts,
      outputArtifacts: [output],
      issues: [],
      decision: {code: "FIXTURE_STAGE_SUCCEEDED", summary: "fixture stage succeeded"},
    } satisfies ProductionStageResult;
  };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("WP-M3-02 production subgraph", () => {
  it("runs frozen production, routes a delivery reject to one owner, and reruns only the repair closure", async () => {
    const fixture = createFixture();
    const calls: string[] = [];
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "loop.sqlite",
      }),
      adapter: fakeAdapter(fixture.repoRoot, calls),
    });

    const result = await graph.invoke(fixture.state, {
      configurable: {thread_id: fixture.state.runId},
    });
    expect(result.phase).toBe("production_ready");
    expect(result.productionRepair.status).toBe("production-ready");
    expect(result.gates.delivery).toBe("pass");
    expect(
      Object.values(result.productionIssues).every((issue) => issue.status === "resolved"),
    ).toBe(true);
    expect(calls.slice(0, productionStageOrder.length)).toEqual(
      productionStageOrder.map((stage) => `${stage}:normal`),
    );
    expect(calls.slice(productionStageOrder.length)).toEqual([
      "timeline:force",
      "render:smoke:normal",
      "render:vertical:normal",
      "inspect:output:normal",
      "validate:delivery:normal",
    ]);
    expect(JSON.stringify(result)).not.toContain("fixture issue body");

    const resumedCalls: string[] = [];
    const resumedGraph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "resume.sqlite",
      }),
      adapter: fakeAdapter(fixture.repoRoot, resumedCalls),
    });
    const resumed = await resumedGraph.invoke(result, {
      configurable: {thread_id: "resume-valid"},
    });
    expect(resumed.phase).toBe("production_ready");
    expect(resumedCalls).toEqual([]);
  });

  it("escalates after the repair round cap and does not dispatch a fourth repair", async () => {
    const fixture = createFixture();
    let graphCalls = 0;
    const adapter: ProductionStageAdapter = async (request) => {
      graphCalls += 1;
      if (request.stage === "validate:delivery") {
        const affected = request.inputArtifacts.find((artifact) =>
          artifact.artifactId.includes("timeline"),
        );
        if (!affected) throw new Error("fixture timeline artifact missing");
        return {
          contractVersion: "production-stage-result-v1",
          executionId: request.executionId,
          episodeId: request.episodeId,
          stage: request.stage,
          status: "FAILED",
          attempt: request.attempt,
          inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
          inputArtifacts: request.inputArtifacts,
          outputArtifacts: [],
          issues: [issueFor(fixture.repoRoot, request, affected)],
          decision: {code: "FIXTURE_REJECT", summary: "always reject"},
          failure: {code: "DELIVERY_REJECTED", retryable: false, detail: "always reject"},
        } satisfies ProductionStageResult;
      }
      const artifactPath = `content/${request.episodeId}/production/retry-${request.stage.replaceAll(":", "-")}-${request.attempt}.json`;
      write(fixture.repoRoot, artifactPath, `retry-${request.attempt}\n`);
      const output = buildArtifactRef({
        repoRoot: fixture.repoRoot,
        artifactId: `${request.episodeId}:production:retry-${request.stage.replaceAll(":", "-")}`,
        episodeId: request.episodeId,
        path: artifactPath,
        mediaType: "application/json",
        schemaVersion: "fixture-production-v1",
        producer: "fixture",
        previous: request.previousArtifacts.find(
          (artifact) =>
            artifact.artifactId ===
            `${request.episodeId}:production:retry-${request.stage.replaceAll(":", "-")}`,
        ),
      });
      return {
        contractVersion: "production-stage-result-v1",
        executionId: request.executionId,
        episodeId: request.episodeId,
        stage: request.stage,
        status: "SUCCEEDED",
        attempt: request.attempt,
        inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
        inputArtifacts: request.inputArtifacts,
        outputArtifacts: [output],
        issues: [],
        decision: {code: "FIXTURE_OK", summary: "fixture stage succeeded"},
      } satisfies ProductionStageResult;
    };
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      maxRepairRounds: 2,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "budget.sqlite",
      }),
      adapter,
    });
    const result = await graph.invoke(fixture.state, {
      configurable: {thread_id: "budget-thread"},
    });
    expect(result.phase).toBe("halted");
    expect(result.productionRepair.status).toBe("human-escalation");
    expect(result.productionRepair.round).toBe(2);
    expect(result.productionRepair.decision.summary).toMatch(/budget-exhausted/u);
    expect(graphCalls).toBe(9 + 5 + 5);
  });

  it("fails closed and escalates when a repair adapter changes an unauthorized artifact", async () => {
    const fixture = createFixture();
    const calls: string[] = [];
    const base = fakeAdapter(fixture.repoRoot, calls);
    const adapter: ProductionStageAdapter = async (request) => {
      const result = await base(request);
      if (request.stage === "timeline" && request.forceRerun) {
        const artifactPath = `content/${request.episodeId}/production/unauthorized.json`;
        write(fixture.repoRoot, artifactPath, "unauthorized\n");
        const artifact = buildArtifactRef({
          repoRoot: fixture.repoRoot,
          artifactId: `${request.episodeId}:production:unauthorized`,
          episodeId: request.episodeId,
          path: artifactPath,
          mediaType: "application/json",
          schemaVersion: "fixture-unauthorized-v1",
          producer: "fixture:unauthorized",
        });
        return {...result, outputArtifacts: [...result.outputArtifacts, artifact]};
      }
      return result;
    };
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "unauthorized.sqlite",
      }),
      adapter,
    });

    const result = await graph.invoke(fixture.state, {
      configurable: {thread_id: "unauthorized-thread"},
    });
    expect(result.phase).toBe("halted");
    expect(result.productionRepair.status).toBe("human-escalation");
    expect(result.productionRepair.decision.code).toBe("PRODUCTION_HUMAN_ESCALATION");
    expect(result.artifacts["episode-001:production:unauthorized"]).toBeUndefined();
    expect(calls).toEqual([
      ...productionStageOrder.map((stage) => `${stage}:normal`),
      "timeline:force",
    ]);
  });
});
