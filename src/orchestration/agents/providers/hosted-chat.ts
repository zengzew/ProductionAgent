import {fetchWithRetry, type RetryableFetchOptions} from "../../../lib/platform/network";

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
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  apiKey: string;
  messages: HostedChatMessage[];
};

export type HostedChatResult<T> = {
  value: T;
  usage: HostedChatUsage;
};

export type HostedChatProvider = {
  readonly name: string;
  chatJson: <T>(call: HostedChatCall) => Promise<HostedChatResult<T>>;
};

export type HostedChatJsonFn = (call: HostedChatCall) => Promise<unknown>;

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

const parseChatResponseBody = (
  rawBody: string,
  status: number,
): {content: string; usage: unknown} => {
  let body: {
    choices?: Array<{message?: {content?: string}}>;
    usage?: unknown;
    error?: {message?: string};
  } = {};
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    if (status < 200 || status >= 300) {
      throw new Error(`hosted-chat request failed (${status})`);
    }
    throw new Error("hosted-chat returned malformed JSON");
  }
  if (status < 200 || status >= 300) {
    throw new Error(
      `hosted-chat request failed (${status}): ${body.error?.message ?? "unknown error"}`,
    );
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("hosted-chat returned malformed JSON");
  return {content, usage: body.usage};
};

export const createOpenAiCompatibleChatProvider = (
  options: Pick<RetryableFetchOptions, "fetchImpl" | "sleep"> = {},
): HostedChatProvider => ({
  name: "openai-compatible",
  chatJson: async <T>(call: HostedChatCall): Promise<HostedChatResult<T>> => {
    const response = await fetchWithRetry(
      call.endpoint,
      {
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
        }),
      },
      {
        timeoutMs: call.timeoutMs,
        maxRetries: 0,
        fetchImpl: options.fetchImpl,
        sleep: options.sleep,
      },
    );
    const rawBody = await response.text();
    const parsed = parseChatResponseBody(rawBody, response.status);
    const normalized = parsed.content
      .trim()
      .replace(/^```(?:json)?\s*/u, "")
      .replace(/\s*```$/u, "");
    try {
      return {
        value: JSON.parse(normalized) as T,
        usage: parseHostedChatUsage(parsed.usage),
      };
    } catch (error) {
      throw new Error("hosted-chat returned malformed JSON", {cause: error});
    }
  },
});
