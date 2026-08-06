import {
  agentExecutionRequestSchema,
  agentExecutionResultSchema,
  type AgentExecutionRequest,
  type AgentExecutionResult,
} from "../schemas/agent";

export type AgentBackend = (
  request: AgentExecutionRequest,
) => AgentExecutionResult | Promise<AgentExecutionResult>;

export type AgentRunner = (request: AgentExecutionRequest) => Promise<AgentExecutionResult>;

export const createAgentRunner =
  (backend: AgentBackend): AgentRunner =>
  async (rawRequest) => {
    const request = agentExecutionRequestSchema.parse(rawRequest);
    const result = agentExecutionResultSchema.parse(await backend(request));
    if (result.executionId !== request.executionId) {
      throw new Error("agent result executionId does not match request");
    }
    const unexpected = result.outputArtifacts.filter(
      (artifact) =>
        !request.expectedOutputs.some(
          (expected) =>
            expected.artifactId === artifact.artifactId &&
            expected.path === artifact.path &&
            expected.schemaVersion === artifact.schemaVersion,
        ),
    );
    if (unexpected.length > 0) {
      throw new Error(`agent returned undeclared output: ${unexpected[0]?.artifactId}`);
    }
    if (
      result.status === "SUCCEEDED" &&
      result.outputArtifacts.length !== request.expectedOutputs.length
    ) {
      throw new Error("successful agent result is missing declared outputs");
    }
    return result;
  };
