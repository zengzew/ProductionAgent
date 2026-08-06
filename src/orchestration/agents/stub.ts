import crypto from "node:crypto";
import {agentNames, type AgentExecutionResult, type AgentName} from "../schemas/agent";
import {createAgentRunner, type AgentBackend, type AgentRunner} from "./run-agent";

export const stubAgentNames: readonly AgentName[] = agentNames;

export type StubAgentOptions = {
  onCall?: (agentName: AgentName) => void;
  failOnceAt?: AgentName;
};

export const createDeterministicStubAgent = (options: StubAgentOptions = {}): AgentRunner => {
  const failed = new Set<AgentName>();
  const backend: AgentBackend = (request): AgentExecutionResult => {
    options.onCall?.(request.agentName);
    if (options.failOnceAt === request.agentName && !failed.has(request.agentName)) {
      failed.add(request.agentName);
      throw new Error(`stub failure at ${request.agentName}`);
    }

    const decisionId = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          agentName: request.agentName,
          episodeId: request.episodeId,
          inputHashes: request.inputArtifacts.map((artifact) => artifact.sha256),
          revisionRound: request.revisionRound,
        }),
      )
      .digest("hex")
      .slice(0, 16);

    return {
      contractVersion: "agent-execution-result-v1",
      executionId: request.executionId,
      status: "SUCCEEDED",
      outputArtifacts: [],
      decision: {
        code: `STUB_${request.agentName.toUpperCase().replaceAll("-", "_")}_SUCCEEDED`,
        summary: `deterministic-stub:${decisionId}`,
      },
    };
  };
  return createAgentRunner(backend);
};
