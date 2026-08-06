import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {directorWorkflowSchema} from "../lib/workflow";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  registerCandidate,
  selectArtifact,
} from "./artifact-registry";
import {hashArtifactInputs, stableEventId} from "./observability";
import type {ExecutionEvent} from "./schemas/execution-event";
import type {ArtifactIndex, ArtifactRef} from "./schemas/artifact";

const mediaTypeFor = (artifactPath: string): string => {
  const extension = path.extname(artifactPath).toLowerCase();
  return (
    {
      ".json": "application/json",
      ".md": "text/markdown",
      ".txt": "text/plain",
      ".srt": "application/x-subrip",
      ".mp4": "video/mp4",
    }[extension] ?? "application/octet-stream"
  );
};

const stableArtifactId = (episodeId: string, artifactPath: string): string =>
  `${episodeId}:legacy:${crypto.createHash("sha256").update(artifactPath).digest("hex").slice(0, 20)}`;

export type LegacyEpisodeImport = {
  episodeId: "episode-001";
  workflowRef: ArtifactRef;
  artifacts: Record<string, ArtifactRef>;
  artifactIndex: ArtifactIndex;
  executionEvents: ExecutionEvent[];
};

export const importLegacyEpisode001 = (input: {
  repoRoot: string;
  occurredAt?: string;
}): LegacyEpisodeImport => {
  const episodeId = "episode-001" as const;
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const workflowPath = `content/${episodeId}/story/workflow.json`;
  const workflow = directorWorkflowSchema.parse(
    JSON.parse(fs.readFileSync(path.resolve(input.repoRoot, workflowPath), "utf8")),
  );
  if (workflow.episodeId !== episodeId) {
    throw new Error("legacy workflow does not belong to Episode 001");
  }

  const artifactPaths = [
    ...new Set([workflowPath, ...workflow.stages.flatMap((stage) => stage.artifacts)]),
  ];
  const artifacts = Object.fromEntries(
    artifactPaths.map((artifactPath) => {
      const ref = buildArtifactRef({
        repoRoot: input.repoRoot,
        artifactId: stableArtifactId(episodeId, artifactPath),
        episodeId,
        path: artifactPath,
        mediaType: mediaTypeFor(artifactPath),
        schemaVersion:
          artifactPath === workflowPath ? "director-workflow-v1" : "legacy-unversioned",
        producer: "legacy-derived",
        createdAt: occurredAt,
      });
      return [artifactPath, ref];
    }),
  );

  let artifactIndex = emptyArtifactIndex(episodeId);
  for (const ref of Object.values(artifacts)) {
    artifactIndex = registerCandidate(artifactIndex, ref, `legacy:${ref.artifactId}`, []);
    artifactIndex = selectArtifact(artifactIndex, ref);
  }

  const executionEvents = workflow.stages.map((stage): ExecutionEvent => {
    const outputArtifacts = stage.artifacts.map((artifactPath) => {
      const ref = artifacts[artifactPath];
      if (!ref) throw new Error(`legacy artifact was not imported: ${artifactPath}`);
      return ref;
    });
    const executionId = `legacy:${episodeId}:${stage.id}`;
    return {
      schemaVersion: "agent-execution-event-v1",
      eventId: stableEventId(executionId, "execution.completed"),
      eventType: "execution.completed",
      occurredAt,
      episodeId,
      traceId: `legacy:${episodeId}`,
      executionId,
      parentExecutionId: null,
      agentName: stage.owner,
      executionKind: "deterministic-tool",
      attempt: 1,
      revisionRound: 0,
      approvalEpoch: 0,
      model: null,
      prompt: null,
      inputArtifacts: [],
      outputArtifacts,
      usage: {
        availability: "unavailable",
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        totalTokens: null,
        cost: {amount: null, currency: null, pricingVersion: null},
      },
      timing: {
        startedAt: occurredAt,
        endedAt: null,
        durationMs: null,
        queueMs: null,
        providerMs: null,
      },
      status: "SUCCEEDED",
      decision: {
        code: "LEGACY_STAGE_IMPORTED",
        summary: `legacy-derived:${stage.id}`,
        rubricVersion: null,
        score: null,
        verdict: null,
        issueIds: [],
        route: null,
        criticResultRef: null,
      },
      error: null,
      checkpoint: null,
      environment: {
        repositoryCommit: null,
        worktreeState: "unknown",
        inputSetHash: hashArtifactInputs([]),
        runtime: "unavailable",
        runnerVersion: "legacy-derived",
      },
    };
  });

  const workflowRef = artifacts[workflowPath];
  if (!workflowRef) throw new Error("legacy workflow reference was not imported");
  return {episodeId, workflowRef, artifacts, artifactIndex, executionEvents};
};
