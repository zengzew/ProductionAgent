import crypto from "node:crypto";
import {fetchWithRetry, type RetryableFetchOptions} from "../../../lib/platform/network";
import {
  reasoningConfigSchema,
  type ReasoningConfig,
  type ReasoningProfile,
} from "../../config/reasoning";

export type HostedChatRole = "system" | "user";

export type HostedChatMessage = {
  role: HostedChatRole;
  content: string;
};

export type HostedChatUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export const emptyHostedChatUsage = (): HostedChatUsage => ({
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
});

export type HostedChatCall = {
  provider: string;
  endpoint: string;
  model: string;
  reasoning: ReasoningConfig;
  temperature: number;
  stream?: boolean;
  maxCompletionTokens?: number;
  timeoutMs: number;
  maxRetries: number;
  apiKey: string;
  messages: HostedChatMessage[];
};

type HostedChatStreamResult = {
  content: string;
  usage: unknown;
  reasoningContentPresent: boolean;
};

export type HostedChatResult<T> = {
  value: T;
  usage: HostedChatUsage;
  transportRecovery?: HostedChatTransportRecovery;
};

export type HostedChatProvider = {
  readonly name: string;
  chatJson: <T>(call: HostedChatCall) => Promise<HostedChatResult<T>>;
};

export type HostedChatJsonFn = (call: HostedChatCall) => Promise<unknown>;

export type HostedChatTransportRecovery = {
  kind: "reasoning-content-outputs";
  responseHash: string;
  httpStatus: number;
};

const asUsageNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;

export const parseHostedChatUsage = (value: unknown): HostedChatUsage => {
  if (!value || typeof value !== "object") return emptyHostedChatUsage();
  const usage = value as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  const inputTokens = asUsageNumber(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = asUsageNumber(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = asUsageNumber(usage.total_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
  };
};

export const isHostedChatResult = <T>(value: unknown): value is HostedChatResult<T> => {
  if (!value || typeof value !== "object" || !("value" in value) || !("usage" in value)) {
    return false;
  }
  const usage = (value as {usage?: unknown}).usage;
  if (!usage || typeof usage !== "object") return false;
  return "inputTokens" in usage && "outputTokens" in usage && "totalTokens" in usage;
};

export const normalizeHostedChatResult = <T>(
  value: T | HostedChatResult<T>,
): HostedChatResult<T> =>
  isHostedChatResult<T>(value) ? value : {value, usage: emptyHostedChatUsage()};

export const createFakeHostedChatProvider = (input: {
  name?: string;
  handler: HostedChatJsonFn;
}): HostedChatProvider => ({
  name: input.name ?? "fake",
  chatJson: async <T>(call: HostedChatCall): Promise<HostedChatResult<T>> =>
    normalizeHostedChatResult(await input.handler(call)) as HostedChatResult<T>,
});

type DeepSeekReasoningRequestBody = {
  enable_thinking: true;
  reasoning_effort: "max";
};

type QwenReasoningRequestBody = {
  enable_thinking: true;
  thinking_budget: 262144;
};

type HostedReasoningRequestBody =
  DeepSeekReasoningRequestBody | QwenReasoningRequestBody | Record<never, never>;

type HostedReasoningCapability = {
  provider: string;
  model: string;
  profile: Exclude<ReasoningProfile, "none">;
  requestBody: () => HostedReasoningRequestBody;
};

const hostedReasoningCapabilities: readonly HostedReasoningCapability[] = [
  {
    provider: "openai-compatible",
    model: "deepseek-v4-flash-0731",
    profile: "deepseek-v4-flash",
    requestBody: () => ({
      enable_thinking: true,
      reasoning_effort: "max",
    }),
  },
  {
    provider: "openai-compatible",
    model: "qwen3.7-plus",
    profile: "qwen3.7-plus",
    requestBody: () => ({
      enable_thinking: true,
      thinking_budget: 262144,
    }),
  },
  {
    provider: "aliyun-bailian",
    model: "MiniMax/MiniMax-M2.7",
    profile: "minimax-m2.7",
    requestBody: () => ({}),
  },
];

const reasoningRequestBodyFor = (call: HostedChatCall): HostedReasoningRequestBody => {
  const reasoning = reasoningConfigSchema.parse(call.reasoning);
  if (reasoning.profile === "none") return {};
  const capability = hostedReasoningCapabilities.find(
    (item) => item.provider === call.provider && item.model === call.model,
  );
  if (!capability) {
    throw new Error(
      `hosted-chat unsupported reasoning capability: ${call.provider}/${call.model}/${reasoning.profile}`,
    );
  }
  if (capability.profile !== reasoning.profile) {
    throw new Error(
      `hosted-chat reasoning profile mismatch: ${call.provider}/${call.model} expects ${capability.profile}, received ${reasoning.profile}`,
    );
  }
  return capability.requestBody();
};

export const HOSTED_RESPONSE_PREVIEW_LIMIT = 300;

export const hashHostedResponseContent = (content: string): string =>
  crypto.createHash("sha256").update(content, "utf8").digest("hex");

export const redactHostedSecrets = (
  value: string,
  secrets: readonly (string | undefined)[] = [],
): string => {
  let redacted = value;
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted.replace(/Bearer\s+\S+/giu, "Bearer [redacted]");
};

export const previewHostedResponseContent = (
  content: string,
  secrets: readonly (string | undefined)[] = [],
): string => {
  const collapsed = redactHostedSecrets(content, secrets).replace(/\s+/gu, " ").trim();
  if (collapsed.length <= HOSTED_RESPONSE_PREVIEW_LIMIT) return collapsed;
  return `${collapsed.slice(0, HOSTED_RESPONSE_PREVIEW_LIMIT)}…`;
};

export const serializeHostedResponseContent = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const stripJsonFence = (content: string): string =>
  content
    .trim()
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();

/** True when the payload is not JSON and does not even start as a JSON value. */
export const isMarkdownOnlyHostedResponse = (content: string): boolean => {
  const stripped = stripJsonFence(content);
  if (!stripped) return false;
  try {
    JSON.parse(stripped);
    return false;
  } catch {
    return !(stripped.startsWith("{") || stripped.startsWith("["));
  }
};

export class HostedResponseContractError extends Error {
  readonly layer: "hosted-chat" | "hosted-agent";
  readonly markdownOnly: boolean;
  readonly httpStatus: number | null;
  readonly contentHash: string;
  readonly preview: string;

  constructor(input: {
    layer: "hosted-chat" | "hosted-agent";
    content: string;
    httpStatus?: number | null;
    secrets?: readonly (string | undefined)[];
    markdownOnly?: boolean;
    responseHash?: string;
    safeDiagnostic?: {
      contentEmpty: boolean;
      reasoningContentPresent: boolean;
    };
    cause?: unknown;
  }) {
    const markdownOnly = input.markdownOnly ?? isMarkdownOnlyHostedResponse(input.content);
    const contentHash = input.responseHash ?? hashHostedResponseContent(input.content);
    const preview = input.safeDiagnostic
      ? ""
      : previewHostedResponseContent(input.content, input.secrets);
    const label = markdownOnly
      ? `${input.layer} returned markdown-only response`
      : `${input.layer} returned malformed JSON`;
    const message = input.safeDiagnostic
      ? `${input.layer} returned empty content (status=${input.httpStatus ?? "n/a"} sha256=${contentHash} content_empty=${input.safeDiagnostic.contentEmpty} reasoning_content_present=${input.safeDiagnostic.reasoningContentPresent})`
      : `${label} (status=${input.httpStatus ?? "n/a"} sha256=${contentHash} preview=${preview})`;
    super(message, {
      cause: input.cause,
    });
    this.name = "HostedResponseContractError";
    this.layer = input.layer;
    this.markdownOnly = markdownOnly;
    this.httpStatus = input.httpStatus ?? null;
    this.contentHash = contentHash;
    this.preview = preview;
  }
}

export const createHostedEmptyContentContractError = (input: {
  layer: "hosted-chat" | "hosted-agent";
  responseHash: string;
  httpStatus: number | null;
  reasoningContentPresent: boolean;
}): HostedResponseContractError =>
  new HostedResponseContractError({
    layer: input.layer,
    content: "",
    httpStatus: input.httpStatus,
    responseHash: input.responseHash,
    safeDiagnostic: {
      contentEmpty: true,
      reasoningContentPresent: input.reasoningContentPresent,
    },
  });

const extractChatMessageContent = (content: unknown): string | undefined => {
  if (typeof content === "string") {
    return content.trim() ? content : undefined;
  }
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
  return text.trim() ? text : undefined;
};

const extractChatDeltaContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
};

const readStreamChunkWithIdleTimeout = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void reader.cancel("hosted-chat stream idle timeout");
      reject(new Error(`hosted-chat stream stalled for ${timeoutMs}ms`));
    }, timeoutMs);
    void reader.read().then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

const parseHostedChatEventStream = async (
  response: Response,
  timeoutMs: number,
): Promise<HostedChatStreamResult> => {
  if (!response.body) {
    throw new Error("hosted-chat streaming response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: unknown;
  let reasoningContentPresent = false;
  let finished = false;

  const consumeLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trimStart();
    if (!data) return;
    if (data.trim() === "[DONE]") {
      finished = true;
      return;
    }
    let event: {
      choices?: Array<{
        delta?: {content?: unknown; reasoning_content?: unknown};
        message?: {content?: unknown; reasoning_content?: unknown};
      }>;
      usage?: unknown;
      error?: {message?: unknown};
      code?: unknown;
    };
    try {
      event = JSON.parse(data) as typeof event;
    } catch (error) {
      throw new Error(
        `hosted-chat stream returned malformed event (status=${response.status} sha256=${hashHostedResponseContent(data)})`,
        {cause: error},
      );
    }
    if (event.error || event.code) {
      throw new Error(`hosted-chat stream returned an error (status=${response.status})`);
    }
    const choice = event.choices?.[0];
    const delta = choice?.delta ?? choice?.message;
    content += extractChatDeltaContent(delta?.content);
    reasoningContentPresent ||=
      delta?.reasoning_content !== undefined && delta.reasoning_content !== null;
    if (event.usage !== undefined) usage = event.usage;
  };

  while (!finished) {
    const {done, value} = await readStreamChunkWithIdleTimeout(reader, timeoutMs);
    buffer += decoder.decode(value, {stream: !done});
    const lines = buffer.split(/\r?\n/u);
    const remainder = lines.pop() ?? "";
    buffer = done ? "" : remainder;
    for (const line of lines) consumeLine(line);
    if (done) {
      if (remainder) consumeLine(remainder);
      break;
    }
  }
  return {content, usage, reasoningContentPresent};
};

const fetchHostedChatStream = async (
  call: HostedChatCall,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs);
  try {
    return await fetchImpl(call.endpoint, {...init, signal: controller.signal});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`网络请求失败（1 次尝试，${call.timeoutMs}ms 超时）：${message}`, {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
};

const parseReasoningOutputsCandidate = (content: unknown): string | undefined => {
  if (typeof content !== "string" || !content.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const outputs = (parsed as {outputs?: unknown}).outputs;
  if (!Array.isArray(outputs)) return undefined;
  return JSON.stringify({outputs});
};

const parseChatResponseBody = (
  rawBody: string,
  status: number,
  secrets: readonly (string | undefined)[],
): {
  content: string;
  usage: unknown;
  transportRecovery?: HostedChatTransportRecovery;
} => {
  let body: {
    choices?: Array<{message?: {content?: unknown; reasoning_content?: unknown}}>;
    usage?: unknown;
    error?: {message?: string};
  } = {};
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    if (status < 200 || status >= 300) {
      throw new Error(`hosted-chat request failed (${status})`);
    }
    throw new HostedResponseContractError({
      layer: "hosted-chat",
      content: rawBody,
      httpStatus: status,
      secrets,
    });
  }
  if (status < 200 || status >= 300) {
    throw new Error(
      `hosted-chat request failed (${status}): ${body.error?.message ?? "unknown error"}`,
    );
  }
  const message = body.choices?.[0]?.message;
  const content = extractChatMessageContent(message?.content);
  if (!content) {
    const reasoningContent = message?.reasoning_content;
    const recoveredContent = parseReasoningOutputsCandidate(reasoningContent);
    if (recoveredContent) {
      return {
        content: recoveredContent,
        usage: body.usage,
        transportRecovery: {
          kind: "reasoning-content-outputs",
          responseHash: hashHostedResponseContent(rawBody),
          httpStatus: status,
        },
      };
    }
    throw createHostedEmptyContentContractError({
      layer: "hosted-chat",
      responseHash: hashHostedResponseContent(rawBody),
      httpStatus: status,
      reasoningContentPresent: reasoningContent !== undefined && reasoningContent !== null,
    });
  }
  return {content, usage: body.usage};
};

export const createOpenAiCompatibleChatProvider = (
  options: Pick<RetryableFetchOptions, "fetchImpl" | "sleep"> = {},
): HostedChatProvider => ({
  name: "openai-compatible",
  chatJson: async <T>(call: HostedChatCall): Promise<HostedChatResult<T>> => {
    const reasoningBody = reasoningRequestBodyFor(call);
    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${call.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: call.model,
        temperature: call.temperature,
        response_format: {type: "json_object"},
        messages: call.messages,
        ...(call.maxCompletionTokens === undefined
          ? {}
          : {max_completion_tokens: call.maxCompletionTokens}),
        ...(call.stream ? {stream: true, stream_options: {include_usage: true}} : {}),
        ...reasoningBody,
      }),
    };
    const response = call.stream
      ? await fetchHostedChatStream(call, requestInit, options.fetchImpl ?? fetch)
      : await fetchWithRetry(call.endpoint, requestInit, {
          timeoutMs: call.timeoutMs,
          maxRetries: 0,
          fetchImpl: options.fetchImpl,
          sleep: options.sleep,
        });
    const secrets = [call.apiKey];
    let rawBody: string;
    if (
      call.stream &&
      response.status >= 200 &&
      response.status < 300 &&
      response.headers.get("content-type")?.includes("text/event-stream")
    ) {
      const streamed = await parseHostedChatEventStream(response, call.timeoutMs);
      rawBody = JSON.stringify({
        choices: [
          {
            message: {
              content: streamed.content,
              ...(streamed.reasoningContentPresent ? {reasoning_content: true} : {}),
            },
          },
        ],
        usage: streamed.usage,
      });
    } else {
      rawBody = await response.text();
    }
    const parsed = parseChatResponseBody(rawBody, response.status, secrets);
    const normalized = stripJsonFence(parsed.content);
    try {
      const result = {
        value: JSON.parse(normalized) as T,
        usage: parseHostedChatUsage(parsed.usage),
      } as HostedChatResult<T>;
      if (parsed.transportRecovery) {
        result.transportRecovery = parsed.transportRecovery;
      }
      return result;
    } catch (error) {
      throw new HostedResponseContractError({
        layer: "hosted-chat",
        content: parsed.content,
        httpStatus: response.status,
        secrets,
        cause: error,
      });
    }
  },
});
