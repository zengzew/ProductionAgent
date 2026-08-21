import fs from "node:fs";
import path from "node:path";
import {buildArtifactRef} from "../../artifact-registry";
import type {AgentExecutionRequest, AgentName} from "../../schemas/agent";
import {
  getRoleModelContract,
  resolveRoleContractPath,
  roleContractPromptPath,
} from "./role-contract";
import {buildScriptWriterBenchmarkRequest} from "./script-writer-request";

const createdAtFallback = "2026-08-19T00:00:00.000Z";

const mediaTypeFor = (repositoryPath: string): string => {
  if (repositoryPath.endsWith(".json")) return "application/json";
  if (repositoryPath.endsWith(".mp4")) return "video/mp4";
  if (repositoryPath.endsWith(".srt")) return "text/plain";
  return "text/markdown";
};

const leafId = (repositoryPath: string): string => {
  const base = repositoryPath.split("/").at(-1) ?? "artifact";
  return base.replace(/\.[a-z0-9]+$/iu, "").replace(/[^a-z0-9-]+/gu, "-");
};

const artifactKindFor = (repositoryPath: string): string => {
  if (repositoryPath.includes("/research/")) return "research";
  if (repositoryPath.includes("/production/")) return "production";
  if (repositoryPath.includes("/media/")) return "media";
  if (repositoryPath.startsWith("output/")) return "delivery";
  if (repositoryPath.startsWith("style/")) return "style";
  if (repositoryPath.startsWith("docs/")) return "contract";
  return "story";
};

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`role benchmark path escapes repository: ${repositoryPath}`);
  }
  const absolute = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`role benchmark path escapes repository: ${repositoryPath}`);
  }
  return absolute;
};

const assertRequiredFiles = (repoRoot: string, paths: readonly string[]): void => {
  for (const repositoryPath of paths) {
    if (!fs.existsSync(resolveRepositoryPath(repoRoot, repositoryPath))) {
      throw new Error(`role benchmark missing frozen input: ${repositoryPath}`);
    }
  }
};

const bindRef = (input: {
  repoRoot: string;
  episodeId: string;
  repositoryPath: string;
  kind: string;
  schemaVersion?: string;
  createdAt: string;
}): ReturnType<typeof buildArtifactRef> =>
  buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: `${input.episodeId}:${input.kind}:${leafId(input.repositoryPath)}`,
    episodeId: input.episodeId,
    path: input.repositoryPath,
    mediaType: mediaTypeFor(input.repositoryPath),
    schemaVersion: input.schemaVersion ?? `${input.kind}-v1`,
    producer: "benchmark-fixture",
    createdAt: input.createdAt,
  });

const outputArtifactId = (episodeId: string, role: AgentName, repositoryPath: string): string =>
  `${episodeId}:${artifactKindFor(repositoryPath)}:${role}:${leafId(repositoryPath)}`;

/** Builds the exact frozen request declared by a role contract. */
export const buildRoleBenchmarkRequest = (input: {
  repoRoot: string;
  episodeId: string;
  role: AgentName;
  createdAt?: string;
}): AgentExecutionRequest => {
  if (input.role === "script-writer") {
    return buildScriptWriterBenchmarkRequest({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      createdAt: input.createdAt,
    });
  }

  const contract = getRoleModelContract(input.role);
  if (contract.benchmarkMode !== "enabled") {
    throw new Error(
      `benchmark capability contract is not configured for ${input.role}: ${contract.capabilities.join(",")}`,
    );
  }
  const createdAt = input.createdAt ?? createdAtFallback;
  const promptPath = roleContractPromptPath(input.repoRoot, input.role, input.episodeId);
  const inputPaths = contract.allowedFrozenInputs.map((item) =>
    resolveRoleContractPath(input.episodeId, item),
  );
  const gatePaths = contract.upstreamGatePaths.map((item) =>
    resolveRoleContractPath(input.episodeId, item),
  );
  const outputContracts = contract.expectedOutputs.map((output) => ({
    ...output,
    path: resolveRoleContractPath(input.episodeId, output.path),
  }));
  assertRequiredFiles(input.repoRoot, [
    promptPath,
    ...inputPaths,
    ...gatePaths,
    ...outputContracts.map((item) => item.path),
  ]);

  const promptRef = bindRef({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    repositoryPath: promptPath,
    kind: "prompt",
    createdAt,
  });
  const inputArtifacts = inputPaths.map((repositoryPath) =>
    bindRef({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      repositoryPath,
      kind: artifactKindFor(repositoryPath),
      createdAt,
    }),
  );
  const upstreamGateRefs = gatePaths.map((repositoryPath) =>
    bindRef({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      repositoryPath,
      kind: "gate",
      createdAt,
    }),
  );

  return {
    contractVersion: "agent-execution-v1",
    executionId: `bench-${input.episodeId}-${input.role}`,
    episodeId: input.episodeId,
    agentName: input.role,
    attempt: 1,
    revisionRound: 0,
    promptRef,
    inputArtifacts,
    expectedOutputs: outputContracts.map((output) => ({
      artifactId: outputArtifactId(input.episodeId, input.role, output.path),
      path: output.path,
      schemaVersion: output.schemaVersion,
    })),
    upstreamGateRefs,
    revisionBudgetRemaining: 0,
  };
};
