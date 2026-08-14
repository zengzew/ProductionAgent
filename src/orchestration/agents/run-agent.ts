import {
  agentExecutionRequestSchema,
  agentExecutionResultSchema,
  type AgentExecutionRequest,
  type AgentExecutionResult,
} from "../schemas/agent";
import {
  FailureSignal,
  runBoundedRetry,
  type BoundedRetryPolicy,
  type BoundedRetryResult,
  type FailureClock,
} from "../failure-replay";

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

const failureClassForAgent = (
  code: string,
): "transient-api" | "rate-limit" | "authentication" | "stale-input" | "tooling" => {
  const normalized = code.toLowerCase();
  if (normalized.includes("auth")) return "authentication";
  if (normalized.includes("rate") || normalized.includes("429")) return "rate-limit";
  if (normalized.includes("stale") || normalized.includes("input")) return "stale-input";
  if (normalized.includes("tool") || normalized.includes("contract")) return "tooling";
  return "transient-api";
};

export type AgentRetryInput = {
  runAgent: AgentRunner;
  request: AgentExecutionRequest;
  policy?: Partial<BoundedRetryPolicy>;
  clock?: FailureClock;
  requestForAttempt?: (input: {
    request: AgentExecutionRequest;
    attempt: number;
  }) => AgentExecutionRequest;
  repairContract?: (input: {
    request: AgentExecutionRequest;
    attempt: number;
    repairNumber: number;
    error: FailureSignal;
  }) => void | Promise<void>;
};

/** Provider/contract boundary with an explicit retry cap and a separately capped repair path. */
export const runAgentWithBoundedRetry = async (
  input: AgentRetryInput,
): Promise<BoundedRetryResult<AgentExecutionResult>> => {
  let lastRequest = input.request;
  return runBoundedRetry({
    policy: input.policy,
    clock: input.clock,
    operation: async (attempt) => {
      const request = agentExecutionRequestSchema.parse(
        input.requestForAttempt?.({request: input.request, attempt}) ?? {
          ...input.request,
          attempt,
          executionId:
            attempt === input.request.attempt
              ? input.request.executionId
              : `${input.request.executionId}:retry-${attempt}`,
        },
      );
      lastRequest = request;
      const result = await input.runAgent(request);
      if (result.status === "FAILED") {
        throw new FailureSignal({
          code: result.failure?.code ?? "AGENT_FAILURE_DETAILS_MISSING",
          class: failureClassForAgent(result.failure?.code ?? "agent-failure"),
          retryable: result.failure?.retryable ?? false,
          message: result.failure?.detail ?? "agent returned a failed result",
          retryAfterMs: null,
        });
      }
      return result;
    },
    ...(input.repairContract
      ? {
          repairContract: async ({
            attempt,
            repairNumber,
            failure,
          }: {
            attempt: number;
            repairNumber: number;
            failure: import("../failure-replay").FailureDescriptor;
          }) => {
            await input.repairContract!({
              request: lastRequest,
              attempt,
              repairNumber,
              error: new FailureSignal(failure),
            });
          },
        }
      : {}),
  });
};
