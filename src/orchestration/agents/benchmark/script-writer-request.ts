import fs from "node:fs";
import path from "node:path";
import {buildArtifactRef} from "../../artifact-registry";
import type {AgentExecutionRequest} from "../../schemas/agent";

const createdAtFallback = "2026-08-19T00:00:00.000Z";

const mediaTypeFor = (repositoryPath: string): string =>
  repositoryPath.endsWith(".json") ? "application/json" : "text/markdown";

const leafId = (repositoryPath: string): string => {
  const base = repositoryPath.split("/").at(-1) ?? "artifact";
  return base.replace(/\.[a-z0-9]+$/iu, "").replace(/[^a-z0-9-]+/gu, "-");
};

const bindRef = (input: {
  repoRoot: string;
  episodeId: string;
  path: string;
  kind: string;
  createdAt?: string;
}): ReturnType<typeof buildArtifactRef> =>
  buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: `${input.episodeId}:${input.kind}:${leafId(input.path)}`,
    episodeId: input.episodeId,
    path: input.path,
    mediaType: mediaTypeFor(input.path),
    schemaVersion: `${input.kind}-v1`,
    producer: "benchmark-fixture",
    createdAt: input.createdAt ?? createdAtFallback,
  });

export const scriptWriterInputPaths = (episodeId: string): string[] => [
  `content/${episodeId}/research/facts.json`,
  `content/${episodeId}/story/director-brief.md`,
  `content/${episodeId}/story/story-bible.md`,
  `content/${episodeId}/story/story-angle.md`,
  `content/${episodeId}/story/three-act-structure.md`,
  `content/${episodeId}/story/hook-candidates.md`,
  `content/${episodeId}/story/viral-strategy.md`,
];

export const scriptWriterGatePaths = (episodeId: string): string[] => [
  `content/${episodeId}/story/director-brief.md`,
  `content/${episodeId}/story/viral-strategy.md`,
];

export const resolveScriptWriterPromptPath = (repoRoot: string, episodeId: string): string => {
  const episodePrompt = `content/${episodeId}/prompts/script-writer.md`;
  if (fs.existsSync(path.join(repoRoot, episodePrompt))) return episodePrompt;
  const rolePrompt = "agents/script-writer.md";
  if (fs.existsSync(path.join(repoRoot, rolePrompt))) return rolePrompt;
  throw new Error(`script-writer prompt is missing for ${episodeId}`);
};

export const buildScriptWriterBenchmarkRequest = (input: {
  repoRoot: string;
  episodeId: string;
  createdAt?: string;
}): AgentExecutionRequest => {
  const createdAt = input.createdAt ?? createdAtFallback;
  const promptPath = resolveScriptWriterPromptPath(input.repoRoot, input.episodeId);
  const promptRef = bindRef({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    path: promptPath,
    kind: "prompt",
    createdAt,
  });
  const inputArtifacts = scriptWriterInputPaths(input.episodeId).map((repositoryPath) =>
    bindRef({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      path: repositoryPath,
      kind: repositoryPath.includes("/research/") ? "research" : "story",
      createdAt,
    }),
  );
  const upstreamGateRefs = scriptWriterGatePaths(input.episodeId).map((repositoryPath) =>
    bindRef({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      path: repositoryPath,
      kind: "gate",
      createdAt,
    }),
  );
  return {
    contractVersion: "agent-execution-v1",
    executionId: `bench-${input.episodeId}-script-writer`,
    episodeId: input.episodeId,
    agentName: "script-writer",
    attempt: 1,
    revisionRound: 0,
    promptRef,
    inputArtifacts,
    expectedOutputs: [
      {
        artifactId: `${input.episodeId}:story:script-draft`,
        path: `content/${input.episodeId}/story/script-draft.md`,
        schemaVersion: "script-draft-v1",
      },
    ],
    upstreamGateRefs,
    revisionBudgetRemaining: 0,
  };
};
