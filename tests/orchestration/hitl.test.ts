import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  applyHumanDirectEdits,
  assertLockedRangesPreserved,
  assertProductionStart,
  assertReferenceOnlyState,
  buildArtifactRef,
  checkpointConfig,
  createDeterministicStubAgent,
  createFoundationGraph,
  createInitialProductionState,
  createLocalCheckpoint,
  ensureArtifactIndexForRefs,
  humanDecisionSchema,
  persistHumanDecision,
  persistHumanIssue,
  registerCandidate,
  resumeCheckpoint,
  selectArtifact,
  type ArtifactRef,
  type HumanDecision,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

const write = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const createFixture = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-hitl-"));
  temporaryDirectories.push(repoRoot);
  const episodeId = "episode-hitl";
  const artifactPath = `content/${episodeId}/story/final-script.md`;
  write(repoRoot, artifactPath, "old human-reviewable story\n");
  const ref = buildArtifactRef({
    repoRoot,
    artifactId: `${episodeId}:story:final-script`,
    episodeId,
    path: artifactPath,
    mediaType: "text/markdown",
    schemaVersion: "final-script-v1",
    producer: "fixture",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  const state = createInitialProductionState({
    episodeId,
    runId: "run-hitl",
    artifacts: {finalScript: ref},
  });
  return {repoRoot, episodeId, ref, state};
};

const baseDecision = (input: {
  gate: HumanDecision["gate"];
  decision: HumanDecision["decision"];
  ref: ArtifactRef;
  decisionId: string;
  reason?: string;
  approvalEpoch?: number;
}): Record<string, unknown> => ({
  decisionId: input.decisionId,
  gate: input.gate,
  decision: input.decision,
  reviewer: "human-reviewer-1",
  timestamp: "2026-08-14T00:10:00.000Z",
  reason: input.reason ?? "review decision is recorded for the audit trail",
  artifactRefs: [input.ref],
  approvalEpoch: input.approvalEpoch ?? 0,
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("WP-M3-04 formal human decisions", () => {
  it("validates the complete envelope and canonicalizes only supported transport aliases", () => {
    const fixture = createFixture();
    const parsed = humanDecisionSchema.parse({
      decisionId: "schema-approve-1",
      gate: "content",
      action: "approve",
      actorId: "human-reviewer-1",
      decidedAt: "2026-08-14T00:10:00.000Z",
      reason: "complete decision metadata",
      relatedArtifactRefs: [fixture.ref],
      requestedApprovalEpoch: 0,
    });
    expect(parsed.gate).toBe("content-approval");
    expect(parsed.decision).toBe("approve");
    expect(parsed.reviewer).toBe("human-reviewer-1");
    expect(() =>
      humanDecisionSchema.parse({...parsed, body: "artifact body must not be inline"}),
    ).toThrow();
    expect(() =>
      humanDecisionSchema.parse({...parsed, decision: "direct-edit", edits: []}),
    ).toThrow();
  });

  it("validates and persists a reject as a deterministic Issue route", () => {
    const fixture = createFixture();
    const index = ensureArtifactIndexForRefs({
      repoRoot: fixture.repoRoot,
      episodeId: fixture.episodeId,
      refs: [fixture.ref],
    });
    const decision = humanDecisionSchema.parse({
      ...baseDecision({
        gate: "content-approval",
        decision: "reject",
        ref: fixture.ref,
        decisionId: "content-reject-1",
        reason: "the story structure still needs one owner revision",
      }),
      issue: {
        category: "story.structure",
        severity: "high",
        locator: {kind: "whole-artifact", value: "story"},
        affectedArtifactRef: fixture.ref,
      },
    });
    const persisted = persistHumanDecision({
      repoRoot: fixture.repoRoot,
      decision,
      artifactIndex: index,
    });
    const persistedReplay = persistHumanDecision({
      repoRoot: fixture.repoRoot,
      decision,
      artifactIndex: persisted.artifactIndex,
    });
    const rejected = persistHumanIssue({
      repoRoot: fixture.repoRoot,
      decision,
      decisionRef: persisted.decisionRef,
      artifactIndex: persisted.artifactIndex,
    });

    expect(rejected.issue.sourceDecisionId).toBe(decision.decisionId);
    expect(rejected.route.ownerAgent).toBe("story-director");
    expect(rejected.route.restartAt).toBe("story-director");
    expect(persistedReplay.decisionRef).toEqual(persisted.decisionRef);
    expect(
      persistedReplay.artifactIndex.artifacts.filter(
        (record) => record.ref.artifactId === persisted.decisionRef.artifactId,
      ),
    ).toHaveLength(1);
    expect(rejected.issueRef.path).toContain("production/issues/");
    expect(JSON.stringify(rejected.issue)).not.toContain("old human-reviewable story");
  });

  it("creates a hash-bound human version, locks its ranges, marks downstream stale, and replays idempotently", () => {
    const fixture = createFixture();
    let index = ensureArtifactIndexForRefs({
      repoRoot: fixture.repoRoot,
      episodeId: fixture.episodeId,
      refs: [fixture.ref],
    });
    const downstreamPath = `content/${fixture.episodeId}/story/downstream.json`;
    write(fixture.repoRoot, downstreamPath, "derived from old story\n");
    const downstream = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: `${fixture.episodeId}:story:downstream`,
      episodeId: fixture.episodeId,
      path: downstreamPath,
      mediaType: "application/json",
      schemaVersion: "downstream-v1",
      producer: "fixture",
    });
    index = selectArtifact(
      registerCandidate(index, downstream, "fixture:downstream", [
        {
          artifactId: fixture.ref.artifactId,
          path: fixture.ref.path,
          sha256: fixture.ref.sha256,
          relation: "reads",
        },
      ]),
      downstream,
    );
    write(fixture.repoRoot, fixture.ref.path, "human locked story revision\n");
    const after = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: fixture.ref.artifactId,
      episodeId: fixture.episodeId,
      path: fixture.ref.path,
      mediaType: fixture.ref.mediaType,
      schemaVersion: fixture.ref.schemaVersion,
      producer: "human:human-reviewer-1",
      previous: fixture.ref,
    });
    const decision = humanDecisionSchema.parse({
      ...baseDecision({
        gate: "content-approval",
        decision: "direct-edit",
        ref: fixture.ref,
        decisionId: "content-edit-1",
      }),
      edits: [
        {
          artifactId: fixture.ref.artifactId,
          owner: "script-writer",
          before: fixture.ref,
          after,
          changedLocators: [{kind: "line-range", value: "1-1"}],
        },
      ],
    });
    const persisted = persistHumanDecision({
      repoRoot: fixture.repoRoot,
      decision,
      artifactIndex: index,
    });
    const applied = applyHumanDirectEdits({
      repoRoot: fixture.repoRoot,
      decision,
      decisionRef: persisted.decisionRef,
      artifactIndex: persisted.artifactIndex,
    });
    const replay = applyHumanDirectEdits({
      repoRoot: fixture.repoRoot,
      decision,
      decisionRef: persisted.decisionRef,
      artifactIndex: applied.artifactIndex,
    });

    expect(applied.changedArtifactRefs).toEqual([after]);
    expect(applied.lockedRanges[0]?.artifactRef.sha256).toBe(after.sha256);
    expect(applied.staleArtifactIds).toContain(downstream.artifactId);
    expect(replay.changedArtifactRefs).toEqual([after]);
    expect(
      replay.artifactIndex.artifacts.filter((record) => record.ref.sha256 === after.sha256),
    ).toHaveLength(1);
    const candidatePath = fixture.ref.path;
    write(fixture.repoRoot, candidatePath, "agent overwrote the locked story\n");
    const candidate = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: fixture.ref.artifactId,
      episodeId: fixture.episodeId,
      path: candidatePath,
      mediaType: fixture.ref.mediaType,
      schemaVersion: fixture.ref.schemaVersion,
      producer: "agent:script-writer",
      previous: after,
    });
    expect(() =>
      assertLockedRangesPreserved({
        before: after,
        candidate,
        lockedRanges: applied.lockedRanges,
        changedLocators: [{kind: "whole-artifact", value: "story"}],
      }),
    ).toThrow(/LOCKED_RANGE_OVERWRITE/u);
  });

  it("requires content authorization, invalidates a stale epoch, and pauses/resumes final approval internally", async () => {
    const fixture = createFixture();
    const createGraph = () =>
      createFoundationGraph({
        runAgent: createDeterministicStubAgent(),
        repoRoot: fixture.repoRoot,
        checkpointer: createLocalCheckpoint({
          repoRoot: fixture.repoRoot,
          databasePath: "hitl.sqlite",
        }),
        now: () => "2026-08-14T00:10:00.000Z",
      });
    const graph = createGraph();
    const config = checkpointConfig(fixture.episodeId);
    const first = await graph.invoke(fixture.state, config);
    const contentPayload = (first as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    expect(contentPayload).toMatchObject({
      gate: "content-approval",
      decisionOptions: ["approve", "reject", "direct-edit"],
    });
    const contentDecision = {
      decisionId: "content-approve-1",
      gate: "content-approval",
      decision: "approve",
      reviewer: "human-reviewer-1",
      timestamp: "2026-08-14T00:11:00.000Z",
      reason: "content gate approved for production",
      artifactRefs: contentPayload?.artifactRefs,
      approvalEpoch: contentPayload?.approvalEpoch,
    };
    const restartedGraph = createGraph();
    const finalPause = await restartedGraph.invoke(resumeCheckpoint(contentDecision), config);
    const finalPayload = (finalPause as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    expect(finalPayload).toMatchObject({
      gate: "final-approval",
      decisionOptions: ["approve", "reject", "direct-edit"],
    });
    const checkpointAfterContent = await graph.getState(config);
    expect(checkpointAfterContent.values.productionAuthorization).toBeTruthy();
    expect(() =>
      assertProductionStart(checkpointAfterContent.values, {requireFormalApproval: true}),
    ).not.toThrow();
    expect(() =>
      assertProductionStart(
        {
          ...checkpointAfterContent.values,
          approvalEpoch: checkpointAfterContent.values.approvalEpoch + 1,
        },
        {requireFormalApproval: true},
      ),
    ).toThrow(/PRODUCTION_APPROVAL_EPOCH_STALE/u);

    write(fixture.repoRoot, fixture.ref.path, "human revised story after final review\n");
    const revisedStoryRef = buildArtifactRef({
      repoRoot: fixture.repoRoot,
      artifactId: fixture.ref.artifactId,
      episodeId: fixture.episodeId,
      path: fixture.ref.path,
      mediaType: fixture.ref.mediaType,
      schemaVersion: fixture.ref.schemaVersion,
      producer: "human:human-reviewer-1",
      previous: fixture.ref,
      createdAt: "2026-08-14T00:12:00.000Z",
    });
    const contentRevisionPause = await createGraph().invoke(
      resumeCheckpoint({
        decisionId: "final-content-edit-1",
        gate: "final-approval",
        decision: "direct-edit",
        reviewer: "human-reviewer-1",
        timestamp: "2026-08-14T00:12:00.000Z",
        reason: "final review changes frozen story content",
        artifactRefs: [
          ...((finalPayload?.artifactRefs as ArtifactRef[] | undefined) ?? []).filter(
            (ref) => ref.artifactId !== fixture.ref.artifactId,
          ),
          revisedStoryRef,
        ],
        approvalEpoch: finalPayload?.approvalEpoch,
        edits: [
          {
            artifactId: fixture.ref.artifactId,
            owner: "script-writer",
            before: fixture.ref,
            after: revisedStoryRef,
            changedLocators: [{kind: "line-range", value: "1-1"}],
          },
        ],
      }),
      config,
    );
    const revisedContentPayload = (
      contentRevisionPause as {__interrupt__?: {value: Record<string, unknown>}[]}
    ).__interrupt__?.[0]?.value;
    expect(revisedContentPayload).toMatchObject({
      gate: "content-approval",
      approvalEpoch: 2,
    });

    const revisedFinalPause = await createGraph().invoke(
      resumeCheckpoint({
        decisionId: "content-approve-2",
        gate: "content-approval",
        decision: "approve",
        reviewer: "human-reviewer-1",
        timestamp: "2026-08-14T00:13:00.000Z",
        reason: "revised story content approved for regeneration",
        artifactRefs: revisedContentPayload?.artifactRefs,
        approvalEpoch: revisedContentPayload?.approvalEpoch,
      }),
      config,
    );
    const revisedFinalPayload = (
      revisedFinalPause as {__interrupt__?: {value: Record<string, unknown>}[]}
    ).__interrupt__?.[0]?.value;
    expect(revisedFinalPayload).toMatchObject({gate: "final-approval", approvalEpoch: 3});

    const final = await createGraph().invoke(
      resumeCheckpoint({
        decisionId: "final-approve-1",
        gate: "final-approval",
        decision: "approve",
        reviewer: "human-reviewer-1",
        timestamp: "2026-08-14T00:14:00.000Z",
        reason: "final internal approval recorded",
        artifactRefs: revisedFinalPayload?.artifactRefs,
        approvalEpoch: revisedFinalPayload?.approvalEpoch,
      }),
      config,
    );
    expect(final.phase).toBe("published");
    expect(final.gates["final-approval"]).toBe("pass");
    expect(final.haltReason).toContain("no external publication performed");
    expect(final.processedDecisionIds).toEqual([
      "content-approve-1",
      "content-approve-2",
      "final-approve-1",
      "final-content-edit-1",
    ]);
    expect(assertReferenceOnlyState(final)).toEqual(final);
  });

  it("fails closed when a reject omits the structured issue", async () => {
    const fixture = createFixture();
    const graph = createFoundationGraph({
      runAgent: createDeterministicStubAgent(),
      repoRoot: fixture.repoRoot,
      requireFormalHumanDecision: true,
      checkpointer: createLocalCheckpoint({
        repoRoot: fixture.repoRoot,
        databasePath: "hitl-reject.sqlite",
      }),
      now: () => "2026-08-14T00:10:00.000Z",
    });
    const config = checkpointConfig(fixture.episodeId);
    const first = await graph.invoke(fixture.state, config);
    const contentPayload = (first as {__interrupt__?: {value: Record<string, unknown>}[]})
      .__interrupt__?.[0]?.value;
    await expect(
      graph.invoke(
        resumeCheckpoint({
          decisionId: "content-reject-missing-issue",
          gate: "content-approval",
          decision: "reject",
          reviewer: "human-reviewer-1",
          timestamp: "2026-08-14T00:11:00.000Z",
          reason: "reject without an issue must not be invented",
          artifactRefs: contentPayload?.artifactRefs,
          approvalEpoch: contentPayload?.approvalEpoch,
        }),
        config,
      ),
    ).rejects.toThrow(/HUMAN_DECISION_REJECT_ISSUE_REQUIRED|require structured issue/u);
  });
});
