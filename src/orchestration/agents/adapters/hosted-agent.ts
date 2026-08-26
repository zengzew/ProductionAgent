import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {assertArtifactRefBytes, buildArtifactRef} from "../../artifact-registry";
import {
  isHostedLlmEligibleAgent,
  readOptionalAgentModelPolicyFile,
  resolveEffectiveRoleModelPolicy,
  roleModelPolicySchema,
  type AgentModelPolicyFile,
  type RoleModelPolicy,
  type RoleModelPolicyInput,
  type RoleModelPolicyPatch,
} from "../../config/agent-model-policy";
import type {AgentExecutionRequest, AgentExecutionResult, AgentName} from "../../schemas/agent";
import type {ArtifactRef} from "../../schemas/artifact";
import {
  createOpenAiCompatibleChatProvider,
  createHostedEmptyContentContractError,
  emptyHostedChatUsage,
  HostedResponseContractError,
  isMarkdownOnlyHostedResponse,
  normalizeHostedChatResult,
  serializeHostedResponseContent,
  type HostedChatCall,
  type HostedChatJsonFn,
  type HostedChatProvider,
  type HostedChatResult,
  type HostedChatUsage,
} from "../providers/hosted-chat";
import type {ReasoningProfile} from "../../config/reasoning";
import {createAgentRunner, type AgentBackend, type AgentRunner} from "../run-agent";

export type HostedAgentBackend = AgentBackend;

const hostedOutputSchema = z.object({
  outputs: z.array(
    z.object({
      artifactId: z.string().min(1),
      path: z.string().min(1),
      schemaVersion: z.string().min(1),
      content: z.string(),
    }),
  ),
});

export type HostedAgentOutput = z.infer<typeof hostedOutputSchema>["outputs"][number];

/** Transport-only response envelope. Kept out of role prompts. */
export const HOSTED_AGENT_RESPONSE_CONTRACT = [
  "MACHINE RESPONSE CONTRACT:",
  "ONLY return one JSON object.",
  'The top-level object must be exactly {"outputs":[...]}.',
  "Each expectedOutput must appear exactly once.",
  "artifactId, path, and schemaVersion must match the declaration exactly.",
  "Put the actual Markdown or JSON artifact content in the content field.",
  "Do not use a markdown code fence.",
  "Do not add any extra text.",
].join("\n");

export const appendHostedAgentResponseContract = (userPayloadJson: string): string =>
  `${userPayloadJson}\n\n${HOSTED_AGENT_RESPONSE_CONTRACT}`;

export type HostedAgentCallRecord = {
  agentName: AgentName;
  provider: string;
  model: string;
  executionId: string;
  attempt: number;
  latencyMs: number;
  status: "SUCCEEDED" | "FAILED";
  usage: HostedChatUsage;
  retryCount: number;
  reasoningProfile: ReasoningProfile;
};

export type HostedAgentBackendOptions = {
  repoRoot: string;
  policy?: RoleModelPolicy | RoleModelPolicyInput;
  policies?: AgentModelPolicyFile;
  resolvePolicy?: (agentName: AgentName) => RoleModelPolicy;
  runOverrides?: Partial<Record<AgentName, RoleModelPolicyPatch>>;
  env?: NodeJS.ProcessEnv;
  apiKey?: string;
  provider?: HostedChatProvider;
  chat?: HostedChatJsonFn;
  onCall?: (record: HostedAgentCallRecord) => void;
  createdAt?: () => string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  producerFor?: (agentName: AgentName) => string;
  decisionFor?: (agentName: AgentName) => {code: string; summary: string};
  /** Write declared outputs to another episode-local path. The model still sees declared paths. */
  relocateOutputPath?: (declaredPath: string) => string;
  /** Extra transport-only instructions appended after the response contract. */
  userMessageAppendix?: string;
};

export type HostedAgentAdapterOptions = HostedAgentBackendOptions;

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const normalizeRepositoryPath = (repositoryPath: string): string =>
  repositoryPath.split(path.sep).join("/");

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`hosted-agent path escapes repository: ${repositoryPath}`);
  }
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`hosted-agent path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

const relativeRepositoryPath = (repoRoot: string, repositoryPath: string): string =>
  path
    .relative(repoRoot, resolveRepositoryPath(repoRoot, repositoryPath))
    .split(path.sep)
    .join("/");

const assertNotCrossEpisode = (episodeId: string, repositoryPath: string): void => {
  const match = /^content\/(episode-[a-z0-9-]+)\//u.exec(normalizeRepositoryPath(repositoryPath));
  if (match?.[1] && match[1] !== episodeId) {
    throw new Error(`hosted-agent cross-episode path blocked: ${repositoryPath}`);
  }
};

const assertWritableEpisodePath = (
  repoRoot: string,
  episodeId: string,
  repositoryPath: string,
): string => {
  const relative = relativeRepositoryPath(repoRoot, repositoryPath);
  assertNotCrossEpisode(episodeId, relative);
  if (!relative.startsWith(`content/${episodeId}/`)) {
    throw new Error(`hosted-agent cross-episode path blocked: ${repositoryPath}`);
  }
  const base = relative.split("/").at(-1) ?? "";
  if (
    base === "workflow.json" ||
    base === "artifact-index.json" ||
    relative.includes("/observability/")
  ) {
    throw new Error(`hosted-agent cannot modify workflow state: ${repositoryPath}`);
  }
  return relative;
};

const readRepositoryFile = (repoRoot: string, repositoryPath: string): string =>
  fs.readFileSync(resolveRepositoryPath(repoRoot, repositoryPath), "utf8");

const writeRepositoryFilesAtomically = (
  repoRoot: string,
  files: ReadonlyArray<{path: string; content: string}>,
): void => {
  const staged = files.map((file, index) => {
    const absolutePath = resolveRepositoryPath(repoRoot, file.path);
    fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
    const temporaryPath = `${absolutePath}.${process.pid}.${index}.tmp`;
    fs.writeFileSync(temporaryPath, file.content);
    return {temporaryPath, absolutePath};
  });
  for (const item of staged) {
    fs.renameSync(item.temporaryPath, item.absolutePath);
  }
};

const mediaTypeFor = (repositoryPath: string): string =>
  repositoryPath.endsWith(".json") ? "application/json" : "text/markdown";

export const isRetryableHostedChatError = (error: unknown): boolean => {
  if (error instanceof HostedResponseContractError) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const nonRetryable = [
    "auth",
    "api key",
    "missing policy",
    "not approved",
    "https",
    "overwrite",
    "cross-episode",
    "undeclared",
    "incomplete",
    "duplicate",
    "malformed",
    "json",
    "markdown",
    "manual",
    "does not support",
    "workflow",
    "forbidden",
    "escapes",
  ];
  return !nonRetryable.some((token) => message.includes(token));
};

const assertHttpsEndpoint = (policy: RoleModelPolicy): URL => {
  let endpoint: URL;
  try {
    endpoint = new URL(policy.endpoint);
  } catch {
    throw new Error("hosted-agent requires an HTTPS hosted endpoint");
  }
  if (endpoint.protocol !== "https:") {
    throw new Error("hosted-agent requires an HTTPS hosted endpoint");
  }
  if (!policy.allowedOrigins.includes(endpoint.origin)) {
    throw new Error(`hosted-agent endpoint is not approved: ${endpoint.origin}`);
  }
  return endpoint;
};

const resolvePolicyFor = (
  options: HostedAgentBackendOptions,
  request: AgentExecutionRequest,
): RoleModelPolicy => {
  if (options.resolvePolicy) return options.resolvePolicy(request.agentName);
  if (options.policy) {
    const policy = options.policy;
    return roleModelPolicySchema.parse({
      mode: policy.mode,
      fallbackMode: policy.fallbackMode ?? "none",
      provider: policy.provider,
      endpoint: policy.endpoint,
      model: policy.model,
      reasoning: policy.reasoning,
      temperature: policy.temperature,
      stream: policy.stream,
      maxCompletionTokens: policy.maxCompletionTokens,
      apiKeyEnv: policy.apiKeyEnv,
      allowedOrigins: policy.allowedOrigins,
      timeoutMs: policy.timeoutMs,
      maxRetries: policy.maxRetries,
    });
  }
  const fromRepo = options.policies ?? readOptionalAgentModelPolicyFile(options.repoRoot);
  return resolveEffectiveRoleModelPolicy({
    agentName: request.agentName,
    episodeId: request.episodeId,
    runOverride: options.runOverrides?.[request.agentName],
    ...(fromRepo ? {config: fromRepo} : {}),
  });
};

const resolveApiKey = (options: HostedAgentBackendOptions, policy: RoleModelPolicy): string => {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? env[policy.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`hosted-agent missing API key: ${policy.apiKeyEnv}`);
  }
  return apiKey;
};

const providerFor = (options: HostedAgentBackendOptions): HostedChatProvider => {
  if (options.provider) return options.provider;
  if (options.chat) {
    return {
      name: "injected",
      chatJson: async <T>(call: HostedChatCall): Promise<HostedChatResult<T>> =>
        normalizeHostedChatResult(await options.chat!(call)) as HostedChatResult<T>,
    };
  }
  return createOpenAiCompatibleChatProvider({sleep: options.sleep});
};

const assertReadableInput = (
  repoRoot: string,
  episodeId: string,
  ref: ArtifactRef,
  label: string,
): void => {
  if (ref.episodeId !== episodeId) {
    throw new Error(`hosted-agent cross-episode path blocked: ${ref.path}`);
  }
  assertNotCrossEpisode(episodeId, ref.path);
  resolveRepositoryPath(repoRoot, ref.path);
  try {
    assertArtifactRefBytes(repoRoot, ref);
  } catch (error) {
    throw new Error(`${label} ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
};

const collectProtectedInputPaths = (request: AgentExecutionRequest): Set<string> => {
  const paths = new Set<string>([normalizeRepositoryPath(request.promptRef.path)]);
  for (const artifact of request.inputArtifacts) {
    paths.add(normalizeRepositoryPath(artifact.path));
  }
  return paths;
};

const assertWriteDestination = (
  repoRoot: string,
  episodeId: string,
  writePath: string,
  protectedPaths: ReadonlySet<string>,
): string => {
  const relative = assertWritableEpisodePath(repoRoot, episodeId, writePath);
  if (protectedPaths.has(relative) || protectedPaths.has(normalizeRepositoryPath(writePath))) {
    throw new Error(`hosted-agent cannot overwrite input artifact: ${writePath}`);
  }
  return relative;
};

const assertDeclaredOutputs = (
  repoRoot: string,
  request: AgentExecutionRequest,
  protectedPaths: ReadonlySet<string>,
  writePathFor: (declaredPath: string) => string,
): void => {
  for (const output of request.expectedOutputs) {
    assertWriteDestination(repoRoot, request.episodeId, writePathFor(output.path), protectedPaths);
  }
};

const validateModelOutputs = (
  request: AgentExecutionRequest,
  outputs: readonly HostedAgentOutput[],
  protectedPaths: ReadonlySet<string>,
  repoRoot: string,
  writePathFor: (declaredPath: string) => string,
): Array<{declared: HostedAgentOutput; writePath: string}> => {
  const expected = new Map(request.expectedOutputs.map((output) => [output.artifactId, output]));
  if (outputs.length !== expected.size) {
    throw new Error("hosted-agent returned an incomplete output set");
  }
  if (new Set(outputs.map((output) => output.artifactId)).size !== outputs.length) {
    throw new Error("hosted-agent returned duplicate outputs");
  }
  return outputs.map((output) => {
    const declaration = expected.get(output.artifactId);
    if (
      !declaration ||
      declaration.path !== output.path ||
      declaration.schemaVersion !== output.schemaVersion
    ) {
      throw new Error(`hosted-agent returned undeclared output: ${output.artifactId}`);
    }
    const writePath = writePathFor(output.path);
    assertWriteDestination(repoRoot, request.episodeId, writePath, protectedPaths);
    if (output.path.endsWith(".json")) {
      try {
        JSON.parse(output.content);
      } catch (error) {
        throw new Error(`hosted-agent returned malformed JSON artifact: ${output.artifactId}`, {
          cause: error,
        });
      }
    }
    return {declared: output, writePath};
  });
};

const invokeChat = async (
  provider: HostedChatProvider,
  call: HostedChatCall,
  policy: RoleModelPolicy,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<
  | {ok: true; result: HostedChatResult<unknown>; retryCount: number}
  | {ok: false; error: unknown; retryCount: number}
> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt += 1) {
    try {
      return {ok: true, result: await provider.chatJson<unknown>(call), retryCount: attempt};
    } catch (error) {
      lastError = error;
      if (!isRetryableHostedChatError(error) || attempt === policy.maxRetries) {
        return {ok: false, error, retryCount: attempt};
      }
      await sleep(250 * 2 ** attempt);
    }
  }
  return {ok: false, error: lastError, retryCount: policy.maxRetries};
};

/** Generic hosted LLM backend. Roles never import a provider SDK. */
export const createHostedAgentBackend = (
  options: HostedAgentBackendOptions,
): HostedAgentBackend => {
  const provider = providerFor(options);
  const sleep = options.sleep ?? defaultSleep;

  return async (request: AgentExecutionRequest): Promise<AgentExecutionResult> => {
    const startedAt = options.now?.() ?? Date.now();
    let status: HostedAgentCallRecord["status"] = "FAILED";
    let retryCount = 0;
    let usage = emptyHostedChatUsage();
    let policy: RoleModelPolicy | undefined;
    try {
      policy = resolvePolicyFor(options, request);
      if (policy.mode !== "hosted-llm") {
        throw new Error(`hosted-agent requires hosted-llm policy: ${request.agentName}`);
      }
      if (!isHostedLlmEligibleAgent(request.agentName)) {
        throw new Error(`hosted-agent does not support ${request.agentName}`);
      }
      assertHttpsEndpoint(policy);
      const apiKey = resolveApiKey(options, policy);
      assertReadableInput(options.repoRoot, request.episodeId, request.promptRef, "prompt");
      for (const artifact of request.inputArtifacts) {
        assertReadableInput(options.repoRoot, request.episodeId, artifact, "input");
      }
      const writePathFor = (declaredPath: string): string =>
        options.relocateOutputPath?.(declaredPath) ?? declaredPath;
      const protectedPaths = collectProtectedInputPaths(request);
      assertDeclaredOutputs(options.repoRoot, request, protectedPaths, writePathFor);

      const call: HostedChatCall = {
        provider: policy.provider,
        endpoint: policy.endpoint,
        model: policy.model,
        reasoning: policy.reasoning,
        temperature: policy.temperature,
        stream: policy.stream ?? false,
        maxCompletionTokens: policy.maxCompletionTokens,
        timeoutMs: policy.timeoutMs,
        maxRetries: policy.maxRetries,
        apiKey,
        messages: [
          {role: "system", content: readRepositoryFile(options.repoRoot, request.promptRef.path)},
          {
            role: "user",
            content: [
              appendHostedAgentResponseContract(
                JSON.stringify({
                  contractVersion: request.contractVersion,
                  executionId: request.executionId,
                  episodeId: request.episodeId,
                  agentName: request.agentName,
                  attempt: request.attempt,
                  revisionRound: request.revisionRound,
                  expectedOutputs: request.expectedOutputs,
                  inputs: request.inputArtifacts.map((artifact) => ({
                    artifact,
                    content: readRepositoryFile(options.repoRoot, artifact.path),
                  })),
                }),
              ),
              options.userMessageAppendix?.trim() ?? "",
            ]
              .filter((part) => part.length > 0)
              .join("\n\n"),
          },
        ],
      };

      const invoked = await invokeChat(provider, call, policy, sleep);
      retryCount = invoked.retryCount;
      if (!invoked.ok) {
        throw invoked.error instanceof Error ? invoked.error : new Error(String(invoked.error));
      }
      usage = invoked.result.usage;
      const modelValue = invoked.result.value;
      const transportRecovery = invoked.result.transportRecovery;
      if (typeof modelValue === "string" && isMarkdownOnlyHostedResponse(modelValue)) {
        throw new HostedResponseContractError({
          layer: "hosted-agent",
          content: modelValue,
          secrets: [apiKey],
          markdownOnly: true,
        });
      }
      const parsed = hostedOutputSchema.safeParse(modelValue);
      if (!parsed.success) {
        if (transportRecovery?.kind === "reasoning-content-outputs") {
          throw createHostedEmptyContentContractError({
            layer: "hosted-agent",
            responseHash: transportRecovery.responseHash,
            httpStatus: transportRecovery.httpStatus,
            reasoningContentPresent: true,
          });
        }
        throw new HostedResponseContractError({
          layer: "hosted-agent",
          content: serializeHostedResponseContent(modelValue),
          secrets: [apiKey],
          markdownOnly: false,
        });
      }
      let relocated: Array<{declared: HostedAgentOutput; writePath: string}>;
      try {
        relocated = validateModelOutputs(
          request,
          parsed.data.outputs,
          protectedPaths,
          options.repoRoot,
          writePathFor,
        );
      } catch (error) {
        if (transportRecovery?.kind === "reasoning-content-outputs") {
          throw createHostedEmptyContentContractError({
            layer: "hosted-agent",
            responseHash: transportRecovery.responseHash,
            httpStatus: transportRecovery.httpStatus,
            reasoningContentPresent: true,
          });
        }
        throw error;
      }
      writeRepositoryFilesAtomically(
        options.repoRoot,
        relocated.map((output) => ({path: output.writePath, content: output.declared.content})),
      );
      assertArtifactRefBytes(options.repoRoot, request.promptRef);
      for (const artifact of request.inputArtifacts) {
        assertArtifactRefBytes(options.repoRoot, artifact);
      }

      const producer =
        options.producerFor?.(request.agentName) ?? `hosted-agent:${request.agentName}`;
      const outputArtifacts = relocated.map((output) =>
        buildArtifactRef({
          repoRoot: options.repoRoot,
          artifactId: output.declared.artifactId,
          episodeId: request.episodeId,
          path: output.writePath,
          mediaType: mediaTypeFor(output.writePath),
          schemaVersion: output.declared.schemaVersion,
          producer,
          createdAt: options.createdAt?.(),
        }),
      );
      status = "SUCCEEDED";
      return {
        contractVersion: "agent-execution-result-v1",
        executionId: request.executionId,
        status: "SUCCEEDED",
        outputArtifacts,
        decision: options.decisionFor?.(request.agentName) ?? {
          code: "HOSTED_AGENT_SUCCEEDED",
          summary: `hosted agent outputs validated (${request.agentName})`,
        },
      };
    } finally {
      const endedAt = options.now?.() ?? Date.now();
      options.onCall?.({
        agentName: request.agentName,
        provider: policy?.provider ?? provider.name,
        model: policy?.model ?? "unresolved",
        reasoningProfile: policy?.reasoning.profile ?? "none",
        executionId: request.executionId,
        attempt: request.attempt,
        latencyMs: Math.max(0, endedAt - startedAt),
        status,
        usage,
        retryCount,
      });
    }
  };
};

export const createHostedAgentAdapter = (options: HostedAgentAdapterOptions): AgentRunner =>
  createAgentRunner(createHostedAgentBackend(options));
