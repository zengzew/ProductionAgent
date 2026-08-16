import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  appendExecutionEvent,
  artifactIndexControlHash,
  buildArtifactRef,
  checkpointConfig,
  createDeterministicStubAgent,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  createProductionSubgraph,
  emptyArtifactIndex,
  ensureArtifactIndexForRefs,
  freezeContent,
  hashExecutionEvents,
  productionStageInputSetHash,
  productionStageOrder,
  readArtifactIndex,
  readExecutionEventLog,
  restoreVerifiedCheckpoint,
  resumeCheckpoint,
  selectArtifact,
  registerCandidate,
  writeRunReport,
  type ArtifactRef,
  type ExecutionEvent,
  type ProductionStageAdapter,
  type ProductionStageResult,
  type ProductionState,
} from "../../src/orchestration";
import type {ObservabilityEvent} from "../../src/orchestration/observability-gate";

const temporaryDirectories: string[] = [];

const sha256File = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const write = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const createClock = () => {
  let current = Date.parse("2026-08-15T00:00:00.000Z");
  const ticks: string[] = [];
  return {
    ticks,
    now: () => {
      const value = new Date(current++).toISOString();
      ticks.push(value);
      return value;
    },
    advanceTo: (value: string) => {
      current = Math.max(current, Date.parse(value) + 1);
    },
  };
};

const createFixture = (): {
  repoRoot: string;
  episodeId: string;
  state: ProductionState;
  finalScriptRef: ArtifactRef;
  eventLogPath: string;
  reportPath: string;
} => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m4-e2e-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-m4-e2e";
  const runId = "run-m4-e2e";
  const finalScriptPath = `content/${episodeId}/story/final-script.md`;
  write(repoRoot, finalScriptPath, "frozen M4 story bytes\n");
  const finalScriptRef = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:story:final-script`,
    episodeId,
    path: finalScriptPath,
    mediaType: "text/markdown",
    schemaVersion: "final-script-v1",
    producer: "m4-e2e-fixture",
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const indexed = ensureArtifactIndexForRefs({
    repoRoot,
    episodeId,
    refs: [finalScriptRef],
    artifactIndex: selectArtifact(
      registerCandidate(emptyArtifactIndex(episodeId), finalScriptRef, "m4:script", []),
      finalScriptRef,
    ),
    executionId: "m4:seed-script",
  });
  const frozen = freezeContent({
    repoRoot,
    episodeId,
    artifactIndex: indexed,
    selectedArtifactRefs: [finalScriptRef],
    issues: [],
    approvalEpoch: 0,
    runId,
    frozenAt: "2026-08-15T00:00:01.000Z",
    frozenBy: "m4-e2e-fixture",
  });
  const initial = createInitialProductionState({
    episodeId,
    runId,
    artifacts: {finalScript: finalScriptRef},
  });
  const state = {
    ...initial,
    ...frozen.stateUpdate,
    phase: "frozen" as const,
    budget: {...initial.budget, maxUnfreeze: 1},
  };
  return {
    repoRoot,
    episodeId,
    state,
    finalScriptRef,
    eventLogPath: `content/${episodeId}/observability/executions.jsonl`,
    reportPath: `content/${episodeId}/observability/run-report.md`,
  };
};

type AbsoluteFixture = ReturnType<typeof createFixture> & {eventLogPathAbsolute: string};

const withAbsolutePaths = (fixture: ReturnType<typeof createFixture>): AbsoluteFixture => ({
  ...fixture,
  eventLogPathAbsolute: path.join(fixture.repoRoot, fixture.eventLogPath),
});

const createObservation = (fixture: AbsoluteFixture, clock: ReturnType<typeof createClock>) => {
  const eventSink = (event: ObservabilityEvent): void => {
    appendExecutionEvent(fixture.eventLogPathAbsolute, event as ExecutionEvent);
  };
  return {
    eventSink,
    events: () => readExecutionEventLog(fixture.eventLogPathAbsolute),
    now: clock.now,
    checkpointVersion: "production-checkpoint-v2",
    runnerVersion: "m4-exit-e2e-v1",
    eventLogPath: fixture.eventLogPathAbsolute,
    reportPath: fixture.reportPath,
  };
};

const createStageAdapter = (input: {
  fixture: ReturnType<typeof withAbsolutePaths>;
  calls: string[];
  shouldRejectDelivery?: () => boolean;
  shouldInterrupt?: (stage: string) => boolean;
  issueCount?: {value: number};
}): ProductionStageAdapter => {
  const issueCount = input.issueCount ?? {value: 0};
  return async (request) => {
    input.calls.push(`${request.stage}:${request.forceRerun ? "force" : "normal"}`);
    if (input.shouldInterrupt?.(request.stage)) {
      throw new Error(`M4_E2E_INTERRUPTED:${request.stage}`);
    }

    const slug = request.stage.replaceAll(":", "-");
    const artifactId =
      request.stage === "validate:delivery"
        ? `${request.episodeId}:production:receipt-validate-delivery`
        : `${request.episodeId}:production:e2e-${slug}`;
    const artifactPath = `content/${request.episodeId}/production/e2e/${slug}-attempt-${request.attempt}.json`;
    write(input.fixture.repoRoot, artifactPath, `${request.stage}:${request.attempt}\n`);
    const output = buildArtifactRef({
      repoRoot: input.fixture.repoRoot,
      artifactId,
      episodeId: request.episodeId,
      path: artifactPath,
      mediaType: "application/json",
      schemaVersion: "m4-e2e-production-v1",
      producer: `m4-e2e:${request.stage}`,
      previous: request.previousArtifacts.find((ref) => ref.artifactId === artifactId),
      createdAt: "2026-08-15T00:00:00.000Z",
    });

    if (request.stage === "validate:delivery" && input.shouldRejectDelivery?.()) {
      issueCount.value += 1;
      const affectedArtifact = request.inputArtifacts.find((ref) =>
        ref.artifactId.includes(":e2e-timeline"),
      );
      if (!affectedArtifact) throw new Error("M4_E2E_TIMELINE_REF_MISSING");
      const issueId = `m4-e2e-delivery-${issueCount.value}`;
      const issuePath = `content/${request.episodeId}/production/issues/${issueId}.json`;
      write(input.fixture.repoRoot, issuePath, `delivery reject ${issueId}\n`);
      const issueRef = buildArtifactRef({
        repoRoot: input.fixture.repoRoot,
        artifactId: `${request.episodeId}:production:${issueId}`,
        episodeId: request.episodeId,
        path: issuePath,
        mediaType: "application/json",
        schemaVersion: "production-issue-v1",
        producer: "m4-e2e:delivery-critic",
        createdAt: "2026-08-15T00:00:00.000Z",
      });
      ensureArtifactIndexForRefs({
        repoRoot: input.fixture.repoRoot,
        episodeId: request.episodeId,
        refs: [issueRef],
        executionId: request.executionId,
      });
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
        issues: [
          {
            issueId,
            issueRef,
            category: "delivery.caption-split",
            severity: "blocker",
            status: "open",
            ownerAgent: "production-executor",
            routeTarget: "captions",
            restartAt: "timeline",
            affectedArtifact,
            locator: {kind: "srt-cue", value: "1"},
            summary: "minimum timeline-to-delivery repair is required",
          },
        ],
        decision: {code: "M4_E2E_DELIVERY_REJECT", summary: "delivery rejected by fixture critic"},
        failure: {
          code: "DELIVERY_REJECTED",
          retryable: false,
          detail: "fixture delivery reject",
        },
      } satisfies ProductionStageResult;
    }

    ensureArtifactIndexForRefs({
      repoRoot: input.fixture.repoRoot,
      episodeId: request.episodeId,
      refs: [output],
      executionId: request.executionId,
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
      decision: {code: "M4_E2E_STAGE_PASS", summary: "fixture stage passed"},
    } satisfies ProductionStageResult;
  };
};

const persistAndReadEvidence = async (input: {
  fixture: ReturnType<typeof withAbsolutePaths>;
  checkpointer: ReturnType<typeof createLocalCheckpoint>;
  config: ReturnType<typeof checkpointConfig>;
  state: ProductionState;
}) => {
  const restored = await restoreVerifiedCheckpoint({
    checkpointer: input.checkpointer,
    config: input.config,
  });
  const indexPath = path.join(
    input.fixture.repoRoot,
    `content/${input.fixture.episodeId}/artifact-index.json`,
  );
  const index = readArtifactIndex(indexPath);
  const events = readExecutionEventLog(input.fixture.eventLogPathAbsolute);
  const report = writeRunReport({
    repoRoot: input.fixture.repoRoot,
    episodeId: input.fixture.episodeId,
    runId: input.state.runId,
    state: input.state,
    events,
    eventLogPath: input.fixture.eventLogPathAbsolute,
    reportPath: input.fixture.reportPath,
  });
  const reportBytes = fs.readFileSync(path.join(input.fixture.repoRoot, input.fixture.reportPath));
  const stateHash = (restored.tuple.metadata as Record<string, unknown>).productionStateSha256;
  expect(stateHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(artifactIndexControlHash(index)).toMatch(/^[a-f0-9]{64}$/u);
  expect(hashExecutionEvents(events)).toBe(report.eventLogSha256);
  expect(report.reportSha256).toBe(
    sha256File(path.join(input.fixture.repoRoot, input.fixture.reportPath)),
  );
  expect(reportBytes.toString("utf8")).toContain(
    `event log sha256: ${hashExecutionEvents(events)}`,
  );
  expect(reportBytes.toString("utf8")).toContain("## Artifact revisions / hashes");
  expect(input.state.episodeId).toBe(restored.state.episodeId);
  expect(input.state.runId).toBe(restored.state.runId);
  return {
    restored,
    index,
    events,
    report,
    stateHash,
    artifactIndexHash: artifactIndexControlHash(index),
  };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("M4 exit integrated E2E", () => {
  it("persists content approval, freeze, production PASS, delivery PASS and final approval", async () => {
    const fixture = withAbsolutePaths(createFixture());
    const clock = createClock();
    const calls: string[] = [];
    const observation = createObservation(fixture, clock);
    const adapter = createStageAdapter({fixture, calls});
    const checkpointer = createLocalCheckpoint({
      repoRoot: fixture.repoRoot,
      databasePath: ".orchestration/happy.sqlite",
    });
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      repoRoot: fixture.repoRoot,
      now: clock.now,
      humanDecision: {repoRoot: fixture.repoRoot},
      checkpointer,
      observability: {
        eventSink: observation.eventSink,
        events: observation.events,
        eventLogPath: observation.eventLogPath,
        repoRoot: fixture.repoRoot,
        reportPath: fixture.reportPath,
      },
      production: async (state) => {
        const result = await import("../../src/orchestration").then(({runProductionPipeline}) =>
          runProductionPipeline({
            repoRoot: fixture.repoRoot,
            state,
            adapter,
            requireFormalApproval: true,
            observability: observation,
          }),
        );
        expect(result.status).toBe("SUCCEEDED");
        return result.state;
      },
    });
    const config = checkpointConfig({episodeId: fixture.episodeId, runId: fixture.state.runId});
    const paused = await graph.invoke(fixture.state, config);
    const contentPayload = (paused as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    expect(contentPayload).toMatchObject({gate: "content-approval"});
    clock.advanceTo("2026-08-15T00:10:00.000Z");
    const productionPaused = await graph.invoke(
      resumeCheckpoint({
        decisionId: "m4-content-approve",
        gate: "content-approval",
        decision: "approve",
        reviewer: "m4-reviewer",
        timestamp: "2026-08-15T00:10:00.000Z",
        reason: "content approved and frozen for production",
        artifactRefs: contentPayload?.artifactRefs,
        approvalEpoch: contentPayload?.approvalEpoch,
      }),
      config,
    );
    expect(productionPaused.productionStages["validate:delivery"]?.status).toBe("SUCCEEDED");
    const finalPayload = (productionPaused as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    clock.advanceTo("2026-08-15T00:20:00.000Z");
    const final = await graph.invoke(
      resumeCheckpoint({
        decisionId: "m4-final-approve",
        gate: "final-approval",
        decision: "approve",
        reviewer: "m4-reviewer",
        timestamp: "2026-08-15T00:20:00.000Z",
        reason: "delivery passed; final internal approval recorded",
        artifactRefs: finalPayload?.artifactRefs,
        approvalEpoch: finalPayload?.approvalEpoch,
      }),
      config,
    );
    expect(final.phase).toBe("published");
    expect(final.gates["content-approval"]).toBe("pass");
    expect(final.gates["final-approval"]).toBe("pass");
    expect(calls).toEqual(productionStageOrder.map((stage) => `${stage}:normal`));
    const evidence = await persistAndReadEvidence({fixture, checkpointer, config, state: final});
    expect(evidence.events.some((event) => event.eventType === "human-decision.recorded")).toBe(
      true,
    );
    // Regression: the whole graph (foundation agents + production) must share the test clock,
    // never a second wall-clock source. Every event timestamp must be clock-issued or an
    // explicit resume timestamp, and the log order must follow the clock.
    const resumeTimestamps = new Set(["2026-08-15T00:10:00.000Z", "2026-08-15T00:20:00.000Z"]);
    for (const event of evidence.events) {
      expect(clock.ticks.includes(event.occurredAt) || resumeTimestamps.has(event.occurredAt)).toBe(
        true,
      );
    }
    const occurredAts = evidence.events.map((event) => event.occurredAt);
    expect(occurredAts).toEqual([...occurredAts].sort((a, b) => Date.parse(a) - Date.parse(b)));
    expect(evidence.report.status).toBe("observability-complete");
  });

  it("resumes an interrupted production from the checkpoint without rerunning hash-valid stages", async () => {
    const fixture = withAbsolutePaths(createFixture());
    const clock = createClock();
    const calls: string[] = [];
    let interrupted = true;
    const observation = createObservation(fixture, clock);
    const adapter = createStageAdapter({
      fixture,
      calls,
      shouldInterrupt: (stage) => stage === "render:vertical" && interrupted,
    });
    const checkpointer = createLocalCheckpoint({
      repoRoot: fixture.repoRoot,
      databasePath: ".orchestration/recovery.sqlite",
    });
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer,
      adapter,
      observability: observation,
    });
    const config = checkpointConfig({episodeId: fixture.episodeId, runId: fixture.state.runId});
    await expect(graph.invoke(fixture.state, config)).rejects.toThrow(
      "M4_E2E_INTERRUPTED:render:vertical",
    );
    const beforeResume = await graph.getState(config);
    expect(beforeResume.values.productionStages["render:smoke"]?.status).toBe("SUCCEEDED");
    expect(beforeResume.values.productionStages["render:vertical"]).toBeUndefined();
    interrupted = false;
    const resumed = await graph.invoke(null, config);
    expect(resumed.phase).toBe("production_ready");
    const interruptedStageIndex = productionStageOrder.indexOf("render:vertical");
    expect(calls.slice(0, interruptedStageIndex + 1)).toEqual([
      ...productionStageOrder.slice(0, interruptedStageIndex).map((stage) => `${stage}:normal`),
      "render:vertical:normal",
    ]);
    expect(calls.slice(interruptedStageIndex + 1)).toEqual([
      "render:vertical:normal",
      "inspect:output:normal",
      "validate:delivery:normal",
    ]);
    const evidence = await persistAndReadEvidence({fixture, checkpointer, config, state: resumed});
    expect(evidence.events.filter((event) => event.stage === "materialize:story")).toHaveLength(3);
    expect(evidence.report.status).toBe("observability-complete");
  });

  it("closes a delivery REJECT through the minimum repair closure and records PASS", async () => {
    const fixture = withAbsolutePaths(createFixture());
    const clock = createClock();
    const calls: string[] = [];
    let reject = true;
    const observation = createObservation(fixture, clock);
    const adapter = createStageAdapter({
      fixture,
      calls,
      shouldRejectDelivery: () => {
        const shouldReject = reject;
        reject = false;
        return shouldReject;
      },
    });
    const checkpointer = createLocalCheckpoint({
      repoRoot: fixture.repoRoot,
      databasePath: ".orchestration/repair.sqlite",
    });
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer,
      adapter,
      observability: observation,
      maxRepairRounds: 1,
    });
    const config = checkpointConfig({episodeId: fixture.episodeId, runId: fixture.state.runId});
    const repaired = await graph.invoke(fixture.state, config);
    expect(repaired.phase).toBe("production_ready");
    expect(repaired.gates.delivery).toBe("pass");
    expect(repaired.productionRepair.status).toBe("production-ready");
    expect(calls.slice(productionStageOrder.length)).toEqual([
      "timeline:force",
      "render:smoke:normal",
      "render:vertical:normal",
      "inspect:output:normal",
      "validate:delivery:normal",
    ]);
    const evidence = await persistAndReadEvidence({fixture, checkpointer, config, state: repaired});
    expect(evidence.events.some((event) => event.eventType === "repair.started")).toBe(true);
    expect(evidence.events.some((event) => event.eventType === "repair.completed")).toBe(true);
    expect(evidence.report.status).toBe("observability-complete");
  });

  it("runs L4 unfreeze approval, scoped edit, content gates, refreeze and production resume", async () => {
    const fixture = withAbsolutePaths(createFixture());
    const clock = createClock();
    const calls: string[] = [];
    let unfreezeApplied = false;
    const observation = createObservation(fixture, clock);
    const adapter = createStageAdapter({
      fixture,
      calls,
      shouldRejectDelivery: () => !unfreezeApplied,
    });
    const checkpointer = createLocalCheckpoint({
      repoRoot: fixture.repoRoot,
      databasePath: ".orchestration/unfreeze.sqlite",
    });
    const graph = createProductionSubgraph({
      repoRoot: fixture.repoRoot,
      checkpointer,
      adapter,
      observability: observation,
      maxRepairRounds: 0,
      unfreeze: {
        plan: () => ({
          restartAt: "materialize:story",
          authorizedEdits: [
            {
              artifactRef: fixture.finalScriptRef,
              owner: "script-writer",
              locator: {kind: "whole-artifact", value: "final-script"},
              reason: "delivery blocker requires one scoped script correction",
            },
          ],
        }),
        edit: ({request}) => {
          unfreezeApplied = true;
          const editedScriptPath = `content/${fixture.episodeId}/story/final-script.r2.md`;
          write(fixture.repoRoot, editedScriptPath, "human-approved M4 scoped edit\n");
          const after = buildArtifactRef({
            repoRoot: fixture.repoRoot,
            artifactId: fixture.finalScriptRef.artifactId,
            episodeId: fixture.episodeId,
            path: editedScriptPath,
            mediaType: fixture.finalScriptRef.mediaType,
            schemaVersion: fixture.finalScriptRef.schemaVersion,
            producer: "human:script-writer",
            previous: fixture.finalScriptRef,
            createdAt: "2026-08-15T00:10:01.000Z",
          });
          return [
            {
              artifactId: fixture.finalScriptRef.artifactId,
              owner: "script-writer",
              before: fixture.finalScriptRef,
              after,
              changedLocators: [request.authorizedEdits[0]!.locator],
            },
          ];
        },
        validate: ({artifactIndex, changedArtifactRefs}) => {
          const validatorPath = `content/${fixture.episodeId}/story/unfreeze-validator.json`;
          const criticPath = `content/${fixture.episodeId}/story/unfreeze-critic.json`;
          write(fixture.repoRoot, validatorPath, "validator passed\n");
          write(fixture.repoRoot, criticPath, "critic passed\n");
          const validatorRef = buildArtifactRef({
            repoRoot: fixture.repoRoot,
            artifactId: `${fixture.episodeId}:story:unfreeze-validator`,
            episodeId: fixture.episodeId,
            path: validatorPath,
            mediaType: "application/json",
            schemaVersion: "content-validator-v1",
            producer: "m4-e2e:validator",
          });
          const criticRef = buildArtifactRef({
            repoRoot: fixture.repoRoot,
            artifactId: `${fixture.episodeId}:story:unfreeze-critic`,
            episodeId: fixture.episodeId,
            path: criticPath,
            mediaType: "application/json",
            schemaVersion: "content-critic-v1",
            producer: "m4-e2e:critic",
          });
          return {
            gate: "pass" as const,
            artifactIndex: ensureArtifactIndexForRefs({
              repoRoot: fixture.repoRoot,
              episodeId: fixture.episodeId,
              refs: [validatorRef, criticRef],
              artifactIndex,
              executionId: "m4-e2e:unfreeze-gates",
            }),
            selectedArtifactRefs: [...changedArtifactRefs],
            validatorRefs: [validatorRef],
            criticRefs: [criticRef],
            issues: [],
            rubricVersions: ["content-rubric-v1"],
            summary: "scoped content edit passed validators and critics",
          };
        },
        now: () => "2026-08-15T00:10:02.000Z",
      },
    });
    const config = checkpointConfig({episodeId: fixture.episodeId, runId: fixture.state.runId});
    const paused = await graph.invoke(fixture.state, config);
    expect(
      (paused as {__interrupt__?: {value: unknown}[]}).__interrupt__?.[0]?.value,
    ).toMatchObject({
      gate: "production-unfreeze",
    });
    const requestRef = paused.unfreeze.requestRef;
    const manifestRef = fixture.state.contentManifestRef;
    if (!requestRef || !manifestRef) throw new Error("M4_E2E_UNFREEZE_REFS_MISSING");
    clock.advanceTo("2026-08-15T00:10:00.000Z");
    const resumed = await graph.invoke(
      resumeCheckpoint({
        decisionId: "m4-unfreeze-approve",
        gate: "unfreeze-approval",
        decision: "approve",
        reviewer: "m4-editor",
        timestamp: "2026-08-15T00:10:00.000Z",
        reason: "approve the explicitly scoped script edit",
        artifactRefs: [requestRef, manifestRef, fixture.finalScriptRef],
        approvalEpoch: 0,
        authorizations: [{artifactId: fixture.finalScriptRef.artifactId, owner: "script-writer"}],
      }),
      config,
    );
    expect(resumed.phase).toBe("production_ready");
    expect(resumed.unfreeze.status).toBe("completed");
    expect(resumed.productionRepair.status).toBe("production-ready");
    expect(resumed.unfreeze.changedArtifactIds).toEqual([fixture.finalScriptRef.artifactId]);
    expect(resumed.contentManifestRef?.sha256).not.toBe(manifestRef.sha256);
    expect(calls).toContain("materialize:story:force");
    const evidence = await persistAndReadEvidence({fixture, checkpointer, config, state: resumed});
    expect(evidence.events.some((event) => event.eventType === "unfreeze.requested")).toBe(true);
    expect(evidence.events.some((event) => event.eventType === "unfreeze.approved")).toBe(true);
    expect(evidence.events.some((event) => event.eventType === "human-decision.recorded")).toBe(
      true,
    );
    expect(evidence.report.status).toBe("observability-complete");
  });
});
