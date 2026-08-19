import fs from "node:fs";
import path from "node:path";
import {buildArtifactRef} from "../../artifact-registry";
import type {ArtifactRef} from "../../schemas/artifact";
import {createAgentRunner, type AgentBackend, type AgentRunner} from "../run-agent";

export type ManualFileAdapterOptions = {
  repoRoot: string;
  previousArtifacts?: Readonly<Record<string, ArtifactRef>>;
  mediaType?: (repositoryPath: string) => string;
  createdAt?: () => string;
};

const defaultMediaType = (repositoryPath: string): string =>
  repositoryPath.endsWith(".json") ? "application/json" : "text/markdown";

/**
 * Adapts the existing human/agent file handoff to the common run-agent boundary.
 * It never writes an artifact: success means every declared output already exists
 * and can be bound to its exact bytes.
 */
export const createManualFileAdapter = (options: ManualFileAdapterOptions): AgentRunner => {
  const backend: AgentBackend = (request) => {
    const missing = request.expectedOutputs.find(
      (output) => !fs.existsSync(path.resolve(options.repoRoot, output.path)),
    );
    if (missing) {
      return {
        contractVersion: "agent-execution-result-v1",
        executionId: request.executionId,
        status: "FAILED",
        outputArtifacts: [],
        decision: {
          code: "MANUAL_FILE_PENDING",
          summary: `manual output is not ready: ${missing.path}`,
        },
        failure: {
          code: "MANUAL_OUTPUT_MISSING",
          retryable: true,
          detail: `Declared manual output does not exist: ${missing.path}`,
        },
      };
    }

    const outputArtifacts = request.expectedOutputs.map((output) =>
      buildArtifactRef({
        repoRoot: options.repoRoot,
        artifactId: output.artifactId,
        episodeId: request.episodeId,
        path: output.path,
        mediaType: options.mediaType?.(output.path) ?? defaultMediaType(output.path),
        schemaVersion: output.schemaVersion,
        producer: `manual-file:${request.agentName}`,
        previous: options.previousArtifacts?.[output.artifactId],
        createdAt: options.createdAt?.(),
      }),
    );

    return {
      contractVersion: "agent-execution-result-v1",
      executionId: request.executionId,
      status: "SUCCEEDED",
      outputArtifacts,
      decision: {
        code: "MANUAL_FILE_ACCEPTED",
        summary: `validated ${outputArtifacts.length} manual output artifact(s)`,
      },
    };
  };
  return createAgentRunner(backend);
};
