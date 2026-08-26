import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentNames,
  buildArtifactRef,
  closeCheckpointBackend,
  contentCriticNames,
  createLocalCheckpoint,
  getRoleModelContract,
  loadAgentModelPolicyFile,
  productionStageInputSetHash,
  productionStageNames,
  runEpisodeOrchestrator,
  runLangGraphEpisode,
  type ArtifactRef,
  type ContentCriticName,
  type ContentLoopNodes,
  type ProductionStageAdapter,
} from "../../src/orchestration";
import {
  loadRoleModelContractFile,
  roleContractOutputArtifactId,
  resolveRoleContractPath,
  roleContractPromptPath,
} from "../../src/orchestration/agents/benchmark/role-contract";
import {criticResultFixture} from "../helpers/critics";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const write = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body, "utf8");
};

const seedContractFiles = (repoRoot: string, episodeId: string): void => {
  const contracts = loadRoleModelContractFile();
  write(repoRoot, `content/${episodeId}/episode.config.json`, "{}\n");
  for (const role of agentNames) {
    const contract = getRoleModelContract(role, contracts);
    write(repoRoot, roleContractPromptPath(repoRoot, role, episodeId), `prompt:${role}\n`);
    const paths = [
      ...contract.allowedFrozenInputs,
      ...contract.upstreamGatePaths,
      ...contract.expectedOutputs.map((output) => output.path),
    ];
    for (const contractPath of paths) {
      const resolved = resolveRoleContractPath(episodeId, contractPath);
      if (!fs.existsSync(path.join(repoRoot, resolved)))
        write(repoRoot, resolved, `fixture:${resolved}\n`);
    }
  }
};

const createPassingContentNodes = (repoRoot: string, episodeId: string): ContentLoopNodes => {
  const critics = Object.fromEntries(
    contentCriticNames.map((critic) => [
      critic,
      (context: Parameters<ContentLoopNodes["critics"][ContentCriticName]>[0]) => {
        const finalScript = Object.values(context.artifacts).find((ref) =>
          ref.path.endsWith("/story/final-script.md"),
        );
        if (!finalScript) throw new Error("ENTRYPOINT_FIXTURE_FINAL_SCRIPT_MISSING");
        const result = criticResultFixture({
          episodeId,
          critic,
          reviewedArtifacts: [finalScript],
        });
        const repositoryPath =
          critic === "audience-critic"
            ? `content/${episodeId}/story/critic-report.md`
            : critic === "fact-guardian"
              ? `content/${episodeId}/story/fact-check-report.md`
              : critic === "retention-critic"
                ? `content/${episodeId}/story/retention-report.md`
                : `content/${episodeId}/story/compliance-critic-output.json`;
        write(repoRoot, repositoryPath, JSON.stringify(result, null, 2) + "\n");
        const resultRef = buildArtifactRef({
          repoRoot,
          artifactId:
            critic === "compliance-critic"
              ? `${episodeId}:story:compliance-critic-output`
              : roleContractOutputArtifactId(episodeId, critic, repositoryPath),
          episodeId,
          path: repositoryPath,
          mediaType: repositoryPath.endsWith(".json") ? "application/json" : "text/markdown",
          schemaVersion: "critic-output-v1",
          producer: `entrypoint-fixture:${critic}`,
          createdAt: "2026-08-26T00:00:00.000Z",
        });
        return {result, resultRef};
      },
    ]),
  ) as ContentLoopNodes["critics"];
  return {
    visualDirector: () => {
      const repositoryPath = `content/${episodeId}/story/visual-plan.md`;
      write(repoRoot, repositoryPath, "fixture visual plan\n");
      return [
        {
          ref: buildArtifactRef({
            repoRoot,
            artifactId: roleContractOutputArtifactId(episodeId, "visual-director", repositoryPath),
            episodeId,
            path: repositoryPath,
            mediaType: "text/markdown",
            schemaVersion: "visual-plan-v3",
            producer: "entrypoint-fixture:visual-director",
            createdAt: "2026-08-26T00:00:00.000Z",
          }),
        },
      ];
    },
    critics,
  };
};

const createProductionAdapter = (repoRoot: string, episodeId: string, calls: string[]) =>
  (async (request) => {
    calls.push(`${request.stage}:${request.forceRerun ? "force" : "normal"}`);
    const slug = request.stage.replaceAll(":", "-");
    const artifactId =
      request.stage === "validate:delivery"
        ? `${episodeId}:production:receipt-validate-delivery`
        : `${episodeId}:production:entry-${slug}`;
    const repositoryPath = `content/${episodeId}/production/entry/${slug}.json`;
    write(repoRoot, repositoryPath, `${request.stage}:${request.attempt}\n`);
    const output = buildArtifactRef({
      repoRoot,
      artifactId,
      episodeId,
      path: repositoryPath,
      mediaType: "application/json",
      schemaVersion: "entrypoint-fixture-v1",
      producer: `entrypoint-fixture:${request.stage}`,
      previous: request.previousArtifacts.find((ref) => ref.artifactId === artifactId),
      createdAt: "2026-08-26T00:00:00.000Z",
    });
    return {
      contractVersion: "production-stage-result-v1" as const,
      executionId: request.executionId,
      episodeId,
      stage: request.stage,
      status: "SUCCEEDED" as const,
      attempt: request.attempt,
      inputSetHash: productionStageInputSetHash(request.stage, request.inputArtifacts),
      inputArtifacts: request.inputArtifacts,
      outputArtifacts: [output],
      issues: [],
      decision: {code: "ENTRYPOINT_FIXTURE_PASS", summary: `${request.stage} passed`},
    };
  }) satisfies ProductionStageAdapter;

const decisionFor = (input: {
  gate: "content-approval" | "final-approval";
  runId: string;
  approvalEpoch: number;
  artifactRefs: readonly ArtifactRef[];
  decisionId: string;
  timestamp: string;
}) => ({
  schemaVersion: "human-decision-v1" as const,
  decisionId: input.decisionId,
  runId: input.runId,
  gate: input.gate,
  decision: "approve" as const,
  reviewer: "entrypoint-test-human",
  timestamp: input.timestamp,
  reason: `approved ${input.gate} in integration fixture`,
  artifactRefs: [...input.artifactRefs],
  approvalEpoch: input.approvalEpoch,
  authorizations: [],
  edits: [],
});

describe("production LangGraph entrypoint", () => {
  it("keeps manual mode isolated from the opt-in graph command", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-entry-switch-"));
    temporaryDirectories.push(repoRoot);
    const result = await runEpisodeOrchestrator({
      repoRoot,
      episodeId: "episode-entrypoint-switch",
      env: {...process.env, ORCHESTRATOR: "manual"},
    });
    expect(result).toMatchObject({
      mode: "manual",
      status: "manual-handoff",
      episodeId: "episode-entrypoint-switch",
    });
    expect(fs.existsSync(path.join(repoRoot, ".orchestration"))).toBe(false);
  });

  it("executes the graph entrypoint through formal approvals and resumes without rerunning stages", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-entrypoint-"));
    temporaryDirectories.push(repoRoot);
    const episodeId = "episode-entrypoint";
    seedContractFiles(repoRoot, episodeId);
    const checkpointer = createLocalCheckpoint({
      repoRoot,
      databasePath: ".orchestration/entrypoint.sqlite",
    });
    const productionCalls: string[] = [];
    let clockTick = 0;
    const common = {
      repoRoot,
      episodeId,
      checkpointer,
      contracts: loadRoleModelContractFile(),
      policies: loadAgentModelPolicyFile(),
      contentLoopNodes: createPassingContentNodes(repoRoot, episodeId),
      productionAdapter: createProductionAdapter(repoRoot, episodeId, productionCalls),
      env: {...process.env, ORCHESTRATOR: "langgraph"},
      createdAt: () => "2026-08-26T00:00:00.000Z",
      now: () => new Date(Date.UTC(2026, 7, 26, 0, 0, clockTick++)).toISOString(),
    };

    try {
      const contentPaused = await runLangGraphEpisode(common);
      expect(contentPaused.status).toBe("paused");
      expect(contentPaused.handoff?.gate).toBe("content-approval");
      expect(contentPaused.handoff?.runId).toBe(contentPaused.runId);
      expect(contentPaused.handoff?.threadId).toBe(episodeId);
      expect(contentPaused.handoff?.approvalEpoch).toBe(0);
      expect(contentPaused.handoff?.artifactRefs.length).toBeGreaterThan(0);

      const finalPaused = await runLangGraphEpisode({
        ...common,
        resume: true,
        resumeValue: decisionFor({
          gate: "content-approval",
          runId: contentPaused.runId!,
          approvalEpoch: contentPaused.handoff!.approvalEpoch,
          artifactRefs: contentPaused.handoff!.artifactRefs,
          decisionId: "entrypoint-content-approval",
          timestamp: common.now(),
        }),
      });
      expect(finalPaused.status).toBe("paused");
      expect(finalPaused.handoff?.gate).toBe("final-approval");
      expect(finalPaused.handoff?.runId).toBe(contentPaused.runId);
      expect(finalPaused.handoff?.approvalEpoch).toBe(1);
      expect(finalPaused.state?.phase).toBe("production_ready");
      expect(finalPaused.state?.completedAgents).toContain("delivery-critic");
      expect(productionCalls).toEqual(productionStageNames.map((stage) => `${stage}:normal`));

      const completed = await runLangGraphEpisode({
        ...common,
        resume: true,
        resumeValue: decisionFor({
          gate: "final-approval",
          runId: finalPaused.runId!,
          approvalEpoch: finalPaused.handoff!.approvalEpoch,
          artifactRefs: finalPaused.handoff!.artifactRefs,
          decisionId: "entrypoint-final-approval",
          timestamp: common.now(),
        }),
      });
      expect(completed).toMatchObject({mode: "langgraph", status: "completed"});
      expect(completed.state?.phase).toBe("published");
      expect(completed.state?.gates["content-approval"]).toBe("pass");
      expect(completed.state?.gates["final-approval"]).toBe("pass");
      expect(completed.state).toBeDefined();
      expect(
        fs.existsSync(path.join(repoRoot, `content/${episodeId}/observability/executions.jsonl`)),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(repoRoot, `content/${episodeId}/observability/run-report.md`)),
      ).toBe(true);
      expect(JSON.stringify(completed.state)).not.toContain('"body"');
      expect(JSON.stringify(completed.state)).not.toContain('"transcript"');
      expect(JSON.stringify(completed.state)).not.toContain('"captions"');
      const tuple = await checkpointer.getTuple({
        configurable: {
          thread_id: episodeId,
          episode_id: episodeId,
          run_id: completed.runId,
        },
      });
      expect(tuple?.config.configurable?.thread_id).toBe(episodeId);
      expect(tuple?.checkpoint.channel_values).toMatchObject({
        episodeId,
        runId: completed.runId,
      });
    } finally {
      await closeCheckpointBackend(checkpointer);
    }
  });
});
