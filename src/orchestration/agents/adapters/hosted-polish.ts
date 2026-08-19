import {chatJson, type ChatClientConfig} from "../../../lib/editorial/llm";
import type {AgentExecutionRequest} from "../../schemas/agent";
import {createAgentRunner, type AgentRunner} from "../run-agent";
import {createHostedAgentBackend} from "./hosted-agent";

type HostedChat = <T>(
  config: ChatClientConfig,
  messages: Array<{role: "system" | "user"; content: string}>,
) => Promise<T>;

export type HostedPolishAdapterOptions = {
  repoRoot: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | undefined;
  model: string;
  temperature?: number;
  allowedOrigins?: readonly string[];
  chat?: HostedChat;
  createdAt?: () => string;
};

/** Optional, network-capable adapter for the one approved hosted content role. */
export const createHostedPolishAdapter = (options: HostedPolishAdapterOptions): AgentRunner => {
  if (!options.enabled) throw new Error("hosted-polish requires explicit opt-in");
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:") {
    throw new Error("hosted-polish requires an HTTPS hosted endpoint");
  }
  const allowedOrigins = options.allowedOrigins ?? ["https://api.openai.com"];
  if (!allowedOrigins.includes(endpoint.origin)) {
    throw new Error(`hosted-polish endpoint is not approved: ${endpoint.origin}`);
  }
  if (!options.apiKey) throw new Error("hosted-polish requires an API key");

  const runChat = options.chat ?? chatJson;
  const backend = createHostedAgentBackend({
    repoRoot: options.repoRoot,
    policy: {
      mode: "hosted-llm",
      provider: "openai-compatible",
      endpoint: options.endpoint,
      model: options.model,
      temperature: options.temperature ?? 0.4,
      apiKeyEnv: "OPENAI_API_KEY",
      allowedOrigins: [...allowedOrigins],
      timeoutMs: 30_000,
      maxRetries: 0,
    },
    apiKey: options.apiKey,
    chat: async (call) =>
      runChat(
        {
          endpoint: call.endpoint,
          apiKey: call.apiKey,
          model: call.model,
          temperature: call.temperature,
        },
        call.messages,
      ),
    producerFor: () => "hosted-polish:oral-rewriter",
    decisionFor: () => ({
      code: "HOSTED_POLISH_SUCCEEDED",
      summary: "hosted polish outputs validated",
    }),
    createdAt: options.createdAt,
  });

  return createAgentRunner(async (request: AgentExecutionRequest) => {
    if (request.agentName !== "oral-rewriter") {
      throw new Error("hosted-polish is allowed only for oral-rewriter");
    }
    return backend(request);
  });
};
