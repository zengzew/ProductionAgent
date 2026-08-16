import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  applyUnfreezeEdits,
  buildArtifactRef,
  createInitialProductionState,
  createLocalCheckpoint,
  createProductionSubgraph,
  artifactIndexControlHash,
  createUnfreezeRequest,
  emptyArtifactIndex,
  freezeContent,
  markStaleTransitively,
  productionStageInputSetHash,
  productionStageOrder,
  readArtifactIndex,
  registerCandidate,
  resumeCheckpoint,
  selectArtifact,
  writeArtifactIndexCas,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRef,
  type ProductionIssue,
  type ProductionStageAdapter,
  type ProductionStageResult,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

const write = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const dependency = (ref: ArtifactRef): ArtifactDependency => ({
  artifactId: ref.artifactId,
  path: ref.path,
  sha256: ref.sha256,
  relation: "reads",
});

const createFixture = (): {
  repoRoot: string;
  state: ReturnType<typeof createInitialProductionState>;
  finalScriptRef: ArtifactRef;
} => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-unfreeze-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-001";
  const finalScriptPath = `content/${episodeId}/story/final-script.md`;
  write(repoRoot, finalScriptPath, "old frozen story\n");
  const finalScriptRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:story:final-script`,
    episodeId,
    path: finalScriptPath,
    mediaType: "text/markdown",
    schemaVersion: "final-script-v1",
    producer: "fixture",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  let artifactIndex = emptyArtifactIndex(episodeId);
  artifactIndex = selectArtifact(
    registerCandidate(artifactIndex, finalScriptRef, "fixture:script", []),
    finalScriptRef,
  );
  const frozen = freezeContent({
    repoRoot,
    episodeId,
    artifactIndex,
    selectedArtifactRefs: [finalScriptRef],
    issues: [],
    approvalEpoch: 0,
    frozenAt: "2026-08-14T00:00:00.000Z",
    frozenBy: "fixture",
  });
  const state = createInitialProductionState({
    episodeId,
    runId: "run-unfreeze",
    artifacts: {finalScript: finalScriptRef},
  });
  return {
    repoRoot,
    finalScriptRef,
    state: {
      ...state,
      ...frozen.stateUpdate,
      phase: "frozen",
      budget: {...state.budget, maxUnfreeze: 1},
    },
  };
};

const issueFor = (
  repoRoot: string,
  request: Parameters<ProductionStageAdapter>[0],
): ProductionIssue => {
  const affectedArtifact = request.inputArtifacts.find((ref) =>
    ref.artifactId.endsWith(":production:test-timeline"),
  );
  if (!affectedArtifact) throw new Error("timeline artifact missing from delivery input");
  const issueId = `issue-delivery-r${request.attempt}-01`;
  const issuePath = `content/${request.episodeId}/production/issues/${issueId}.json`;
  write(repoRoot, issuePath, "delivery blocker\n");
  const issueRef = buildArtifactRef({
    repoRoot,
    artifactId: `${request.episodeId}:production:${issueId}`,
    episodeId: request.episodeId,
    path: issuePath,
    mediaType: "application/json",
    schemaVersion: "production-issue-v1",
    producer: "fixture",
  });
  return {
    issueId,
    issueRef,
    category: "delivery.timeline",
    severity: "blocker",
    status: "open",
    ownerAgent: "production-executor",
    routeTarget: "timeline",
    restartAt: "timeline",
    affectedArtifact,
    locator: {kind: "time-range", value: "whole-timeline"},
    summary: "delivery still cannot be repaired without changing frozen story content",
  };
};

const createProductionAdapter = (repoRoot: string, calls: string[]): ProductionStageAdapter => {
  let deliveryFailures = 0;
  return async (request) => {
    calls.push(`${request.stage}:${request.forceRerun ? "force" : "normal"}`);
    if (request.stage === "validate:delivery" && deliveryFailures === 0) {
      deliveryFailures += 1;
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
        issues: [issueFor(repoRoot, request)],
        decision: {code: "FIXTURE_DELIVERY_REJECT", summary: "fixture delivery blocker"},
        failure: {code: "DELIVERY_REJECTED", retryable: false, detail: "fixture blocker"},
      } satisfies ProductionStageResult;
    }

    const logicalId =
      request.stage === "validate:delivery"
        ? `${request.episodeId}:production:receipt-validate-delivery`
        : `${request.episodeId}:production:test-${request.stage.replaceAll(":", "-")}`;
    const repositoryPath =
      request.stage === "validate:delivery"
        ? `content/${request.episodeId}/production/adapter-receipts/validate-delivery.json`
        : `content/${request.episodeId}/production/test-${request.stage.replaceAll(":", "-")}.json`;
    write(repoRoot, repositoryPath, `${request.stage}:${request.attempt}\n`);
    const previous = request.previousArtifacts.find((ref) => ref.artifactId === logicalId);
    const output = buildArtifactRef({
      repoRoot,
      artifactId: logicalId,
      episodeId: request.episodeId,
      path: repositoryPath,
      mediaType: "application/json",
      schemaVersion: "fixture-production-v1",
      producer: "fixture",
      ...(previous ? {previous} : {}),
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
      decision: {code: "FIXTURE_STAGE_OK", summary: "fixture stage passed"},
    } satisfies ProductionStageResult;
  };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("WP-M3-03 L4 unfreeze", () => {
  it("creates an auditable request only for a blocker and an explicit frozen content owner", () => {
    const fixture = createFixture();
    const issue = {
      issueId: "issue-delivery-blocker",
      issueRef: fixture.finalScriptRef,
      category: "delivery.timeline" as const,
      severity: "blocker" as const,
      status: "open" as const,
      ownerAgent: "production-executor" as const,
      routeTarget: "timeline" as const,
      restartAt: "timeline" as const,
      affectedArtifact: fixture.finalScriptRef,
      locator: {kind: "whole-artifact" as const, value: "script"},
      summary: "fixture blocker",
    } satisfies ProductionIssue;
    const result = createUnfreezeRequest({
      repoRoot: fixture.repoRoot,
      episodeId: fixture.state.episodeId,
      runId: fixture.state.runId,
      contentManifestRef: fixture.state.contentManifestRef!,
      issues: [issue],
      authorizedEdits: [
        {
          artifactRef: fixture.finalScriptRef,
          owner: "script-writer",
          locator: {kind: "whole-artifact", value: "script"},
          reason: "human-approved correction scope",
        },
      ],
      restartAt: "materialize:story",
      approvalEpoch: 0,
      unfreezeUsed: 0,
      maxUnfreeze: 1,
    });

    expect(result.request.schemaVersion).toBe("unfreeze-request-v1");
    expect(result.request.blockerIssues).toHaveLength(1);
    expect(result.request.authorizedEdits[0]?.owner).toBe("script-writer");
    expect(fs.existsSync(path.join(fixture.repoRoot, result.requestRef.path))).toBe(true);
    expect(JSON.stringify(result.request)).not.toContain("old frozen story");
    expect(() =>
      createUnfreezeRequest({
        repoRoot: fixture.repoRoot,
        episodeId: fixture.state.episodeId,
        runId: fixture.state.runId,
        contentManifestRef: fixture.state.contentManifestRef!,
        issues: [{...issue, severity: "high"}],
        authorizedEdits: result.request.authorizedEdits,
        restartAt: "materialize:story",
        approvalEpoch: 0,
        unfreezeUsed: 0,
        maxUnfreeze: 1,
      }),
    ).toThrow(/UNFREEZE_BLOCKER_REQUIRED/u);
  });

  it("pauses before any unfreeze edit, then approves, reruns content gates, refreezes, and resumes production", async () => {
    const fixture = createFixture();
    const calls: string[] = [];
    const validationCalls: string[] = [];
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      maxRepairRounds: 0,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "unfreeze.sqlite",
      }),
      adapter: createProductionAdapter(fixture.repoRoot, calls),
      unfreeze: {
        plan: ({contentManifestRef}) => ({
          restartAt: "materialize:story",
          authorizedEdits: [
            {
              artifactRef: fixture.finalScriptRef,
              owner: "script-writer",
              locator: {kind: "whole-artifact", value: "script"},
              reason: `repair against ${contentManifestRef.sha256}`,
            },
          ],
        }),
        edit: ({repoRoot, request}) => {
          const authorization = request.authorizedEdits[0]!;
          write(repoRoot, authorization.artifactRef.path, "human-approved new story\n");
          const after = buildArtifactRef({
            repoRoot,
            artifactId: authorization.artifactRef.artifactId,
            episodeId: authorization.artifactRef.episodeId,
            path: authorization.artifactRef.path,
            mediaType: authorization.artifactRef.mediaType,
            schemaVersion: authorization.artifactRef.schemaVersion,
            producer: "human:script-writer",
            previous: authorization.artifactRef,
          });
          return [
            {
              artifactId: authorization.artifactRef.artifactId,
              owner: authorization.owner,
              before: authorization.artifactRef,
              after,
              changedLocators: [authorization.locator],
            },
          ];
        },
        validate: ({artifactIndex, changedArtifactRefs}) => {
          validationCalls.push(changedArtifactRefs.map((ref) => ref.artifactId).join(","));
          const validatorPath = "content/episode-001/story/unfreeze-validator.json";
          const criticPath = "content/episode-001/story/unfreeze-critic.json";
          write(fixture.repoRoot, validatorPath, "validator passed\n");
          write(fixture.repoRoot, criticPath, "critic passed\n");
          const validatorRef = buildArtifactRef({
            repoRoot: fixture.repoRoot,
            artifactId: "episode-001:story:unfreeze-validator",
            episodeId: "episode-001",
            path: validatorPath,
            mediaType: "application/json",
            schemaVersion: "content-validator-v1",
            producer: "fixture:validator",
          });
          const criticRef = buildArtifactRef({
            repoRoot: fixture.repoRoot,
            artifactId: "episode-001:story:unfreeze-critic",
            episodeId: "episode-001",
            path: criticPath,
            mediaType: "application/json",
            schemaVersion: "content-critic-v1",
            producer: "fixture:critic",
          });
          return {
            gate: "pass" as const,
            artifactIndex,
            selectedArtifactRefs: [...changedArtifactRefs],
            validatorRefs: [validatorRef],
            criticRefs: [criticRef],
            issues: [],
            rubricVersions: ["content-rubric-v1"],
            summary: "content validators and critics passed",
          };
        },
        now: () => "2026-08-14T00:01:00.000Z",
      },
    });
    const config = {configurable: {thread_id: "unfreeze-thread"}};
    const paused = await graph.invoke(fixture.state, config);
    const interruption = (paused as {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value;
    expect(interruption).toMatchObject({gate: "production-unfreeze"});
    expect((paused as typeof paused).phase).toBe("unfreeze_review");
    expect(calls).toHaveLength(productionStageOrder.length);
    expect(validationCalls).toEqual([]);

    const pausedState = paused as typeof paused & {
      unfreeze: {requestRef: ArtifactRef | null};
    };
    const requestRef = pausedState.unfreeze.requestRef;
    if (!requestRef || !fixture.state.contentManifestRef) throw new Error("unfreeze refs missing");

    const resumed = await graph.invoke(
      resumeCheckpoint({
        decisionId: "unfreeze-approve-formal-1",
        gate: "unfreeze-approval",
        decision: "approve",
        reviewer: "human-editor-1",
        timestamp: "2026-08-14T00:00:30.000Z",
        reason: "the blocker requires a scoped script correction",
        artifactRefs: [requestRef, fixture.state.contentManifestRef, fixture.finalScriptRef],
        approvalEpoch: 0,
        authorizations: [{artifactId: fixture.finalScriptRef.artifactId, owner: "script-writer"}],
      }),
      config,
    );
    expect(resumed.phase).toBe("production_ready");
    expect(resumed.approvalEpoch).toBe(1);
    expect(resumed.budget.unfreezeUsed).toBe(1);
    expect(resumed.unfreeze.status).toBe("completed");
    expect(resumed.unfreeze.changedArtifactIds).toEqual([fixture.finalScriptRef.artifactId]);
    expect(resumed.unfreeze.validatorRefs).toHaveLength(1);
    expect(resumed.unfreeze.criticRefs).toHaveLength(1);
    expect(resumed.unfreeze.humanDecisionRef).toBeTruthy();
    expect(resumed.productionAuthorization?.gate).toBe("unfreeze-approval");
    expect(resumed.contentManifestRef?.sha256).not.toBe(fixture.state.contentManifestRef?.sha256);
    expect(validationCalls).toEqual([fixture.finalScriptRef.artifactId]);
    expect(calls.slice(productionStageOrder.length, productionStageOrder.length + 1)).toEqual([
      "materialize:story:force",
    ]);
    expect(calls.slice(productionStageOrder.length)).toHaveLength(productionStageOrder.length);
    expect(JSON.stringify(resumed)).not.toContain("human-approved new story");
  });

  it("fails closed when the human approves an artifact-owner pair outside the request", async () => {
    const fixture = createFixture();
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      maxRepairRounds: 0,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "mismatch.sqlite",
      }),
      adapter: createProductionAdapter(fixture.repoRoot, []),
      unfreeze: {
        plan: () => ({
          restartAt: "materialize:story",
          authorizedEdits: [
            {
              artifactRef: fixture.finalScriptRef,
              owner: "script-writer",
              locator: {kind: "whole-artifact", value: "script"},
              reason: "scoped fixture edit",
            },
          ],
        }),
        edit: () => {
          throw new Error("must not be called");
        },
        validate: () => {
          throw new Error("must not be called");
        },
      },
    });
    const config = {configurable: {thread_id: "mismatch-thread"}};
    await graph.invoke(fixture.state, config);
    const result = await graph.invoke(
      resumeCheckpoint({
        decision: "approve",
        actorId: "human-editor-1",
        reason: "wrong scope",
        authorizations: [{artifactId: "episode-001:story:other", owner: "script-writer"}],
      }),
      config,
    );
    expect(result.phase).toBe("halted");
    expect(result.productionRepair.status).toBe("human-escalation");
    expect(result.budget.unfreezeUsed).toBe(0);
    expect(result.unfreeze.status).toBe("escalated");
  });

  it("retains downstream selected records as stale when an authorized content ref changes", () => {
    const fixture = createFixture();
    const downstreamPath = "content/episode-001/story/downstream.md";
    write(fixture.repoRoot, downstreamPath, "downstream\n");
    const downstream = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: "episode-001:story:downstream",
      episodeId: "episode-001",
      path: downstreamPath,
      mediaType: "text/markdown",
      schemaVersion: "downstream-v1",
      producer: "fixture",
    });
    const index: ArtifactIndex = {
      schemaVersion: "artifact-index-v1",
      episodeId: "episode-001",
      artifacts: [
        {
          ref: fixture.finalScriptRef,
          state: "selected",
          producedByExecutionId: "fixture:script",
          dependencies: [],
        },
        {
          ref: downstream,
          state: "selected",
          producedByExecutionId: "fixture:downstream",
          dependencies: [dependency(fixture.finalScriptRef)],
        },
      ],
      selected: {
        [fixture.finalScriptRef.artifactId]: {
          revision: fixture.finalScriptRef.revision,
          sha256: fixture.finalScriptRef.sha256,
          path: fixture.finalScriptRef.path,
        },
        [downstream.artifactId]: {
          revision: downstream.revision,
          sha256: downstream.sha256,
          path: downstream.path,
        },
      },
    };
    const before = markStaleTransitively(index, [fixture.finalScriptRef.artifactId]);
    writeArtifactIndexCas({
      filePath: path.join(fixture.repoRoot, "content/episode-001/artifact-index.json"),
      index,
      expectedVersion: null,
      casRoot: fixture.repoRoot,
    });
    const request = createUnfreezeRequest({
      repoRoot: fixture.repoRoot,
      episodeId: fixture.state.episodeId,
      runId: fixture.state.runId,
      contentManifestRef: fixture.state.contentManifestRef!,
      issues: [
        {
          issueId: "issue-delivery-blocker",
          issueRef: fixture.finalScriptRef,
          category: "delivery.timeline",
          severity: "blocker",
          status: "open",
          ownerAgent: "production-executor",
          routeTarget: "timeline",
          restartAt: "timeline",
          affectedArtifact: fixture.finalScriptRef,
          locator: {kind: "whole-artifact", value: "script"},
          summary: "blocker",
        },
      ],
      authorizedEdits: [
        {
          artifactRef: fixture.finalScriptRef,
          owner: "script-writer",
          locator: {kind: "whole-artifact", value: "script"},
          reason: "scoped",
        },
      ],
      restartAt: "materialize:story",
      approvalEpoch: 0,
      unfreezeUsed: 0,
      maxUnfreeze: 1,
    });
    // The frozen bytes remain intact until the approved editor applies the edit.
    write(fixture.repoRoot, fixture.finalScriptRef.path, "new story bytes\n");
    const after = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: fixture.finalScriptRef.artifactId,
      episodeId: fixture.finalScriptRef.episodeId,
      path: fixture.finalScriptRef.path,
      mediaType: fixture.finalScriptRef.mediaType,
      schemaVersion: fixture.finalScriptRef.schemaVersion,
      producer: "human:script-writer",
      previous: fixture.finalScriptRef,
    });
    const decision = {
      schemaVersion: "unfreeze-decision-v1" as const,
      decisionId: "unfreeze-decision-fixture",
      requestId: request.request.requestId,
      requestRef: request.requestRef,
      episodeId: fixture.state.episodeId,
      requestedApprovalEpoch: 0,
      decision: "approve" as const,
      actorId: "human",
      decidedAt: "2026-08-14T00:02:00.000Z",
      authorizations: [
        {artifactId: fixture.finalScriptRef.artifactId, owner: "script-writer" as const},
      ],
      reason: "approve",
    };
    const diskIndex = readArtifactIndex(
      path.join(fixture.repoRoot, "content/episode-001/artifact-index.json"),
    );
    const applied = applyUnfreezeEdits({
      repoRoot: fixture.repoRoot,
      request: request.request,
      decision,
      edits: [
        {
          artifactId: after.artifactId,
          owner: "script-writer",
          before: fixture.finalScriptRef,
          after,
          changedLocators: [{kind: "whole-artifact", value: "script"}],
        },
      ],
      artifactIndex: diskIndex,
      executionId: "fixture:unfreeze",
    });
    expect(
      before.artifacts.find((record) => record.ref.artifactId === downstream.artifactId)?.state,
    ).toBe("stale");
    expect(applied.staleArtifactIds).toContain(downstream.artifactId);
    expect(applied.artifactIndex.selected[downstream.artifactId]).toBeUndefined();
    expect(fs.existsSync(path.join(fixture.repoRoot, downstream.path))).toBe(true);
  });

  it("fails closed when an unfreeze write races a newer artifact index", () => {
    const fixture = createFixture();
    const registryPath = path.join(fixture.repoRoot, "content/episode-001/artifact-index.json");
    const request = createUnfreezeRequest({
      repoRoot: fixture.repoRoot,
      episodeId: fixture.state.episodeId,
      runId: fixture.state.runId,
      contentManifestRef: fixture.state.contentManifestRef!,
      issues: [
        {
          issueId: "issue-delivery-blocker",
          issueRef: fixture.finalScriptRef,
          category: "delivery.timeline",
          severity: "blocker",
          status: "open",
          ownerAgent: "production-executor",
          routeTarget: "timeline",
          restartAt: "timeline",
          affectedArtifact: fixture.finalScriptRef,
          locator: {kind: "whole-artifact", value: "script"},
          summary: "blocker",
        },
      ],
      authorizedEdits: [
        {
          artifactRef: fixture.finalScriptRef,
          owner: "script-writer",
          locator: {kind: "whole-artifact", value: "script"},
          reason: "scoped",
        },
      ],
      restartAt: "materialize:story",
      approvalEpoch: 0,
      unfreezeUsed: 0,
      maxUnfreeze: 1,
    });
    const staleIndex = readArtifactIndex(registryPath);
    write(fixture.repoRoot, fixture.finalScriptRef.path, "raced story bytes\n");
    const after = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: fixture.finalScriptRef.artifactId,
      episodeId: fixture.finalScriptRef.episodeId,
      path: fixture.finalScriptRef.path,
      mediaType: fixture.finalScriptRef.mediaType,
      schemaVersion: fixture.finalScriptRef.schemaVersion,
      producer: "human:script-writer",
      previous: fixture.finalScriptRef,
    });
    writeArtifactIndexCas({
      filePath: registryPath,
      index: emptyArtifactIndex("episode-001"),
      expectedVersion: artifactIndexControlHash(staleIndex),
      casRoot: fixture.repoRoot,
    });
    expect(() =>
      applyUnfreezeEdits({
        repoRoot: fixture.repoRoot,
        request: request.request,
        decision: {
          schemaVersion: "unfreeze-decision-v1",
          decisionId: "unfreeze-decision-race",
          requestId: request.request.requestId,
          requestRef: request.requestRef,
          episodeId: fixture.state.episodeId,
          requestedApprovalEpoch: 0,
          decision: "approve",
          actorId: "human",
          decidedAt: "2026-08-14T00:02:00.000Z",
          authorizations: [{artifactId: fixture.finalScriptRef.artifactId, owner: "script-writer"}],
          reason: "approve",
        },
        edits: [
          {
            artifactId: after.artifactId,
            owner: "script-writer",
            before: fixture.finalScriptRef,
            after,
            changedLocators: [{kind: "whole-artifact", value: "script"}],
          },
        ],
        artifactIndex: staleIndex,
        executionId: "fixture:unfreeze-race",
      }),
    ).toThrow(/ARTIFACT_INDEX_CAS_CONFLICT/u);
  });
});
