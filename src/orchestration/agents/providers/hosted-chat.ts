import crypto from "node:crypto";
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
    cause?: unknown;
  }) {
    const markdownOnly = input.markdownOnly ?? isMarkdownOnlyHostedResponse(input.content);
    const contentHash = hashHostedResponseContent(input.content);
    const preview = previewHostedResponseContent(input.content, input.secrets);
    const label = markdownOnly
      ? `${input.layer} returned markdown-only response`
      : `${input.layer} returned malformed JSON`;
    super(
      `${label} (status=${input.httpStatus ?? "n/a"} sha256=${contentHash} preview=${preview})`,
      {
        cause: input.cause,
      },
    );
    this.name = "HostedResponseContractError";
    this.layer = input.layer;
    this.markdownOnly = markdownOnly;
    this.httpStatus = input.httpStatus ?? null;
    this.contentHash = contentHash;
    this.preview = preview;
  }
}

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

const parseChatResponseBody = (
  rawBody: string,
  status: number,
  secrets: readonly (string | undefined)[],
): {content: string; usage: unknown} => {
  let body: {
    choices?: Array<{message?: {content?: unknown}}>;
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
  const content = extractChatMessageContent(body.choices?.[0]?.message?.content);
  if (!content) {
    throw new HostedResponseContractError({
      layer: "hosted-chat",
      content: rawBody,
      httpStatus: status,
      secrets,
    });
  }
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
    const secrets = [call.apiKey];
    const parsed = parseChatResponseBody(rawBody, response.status, secrets);
    const normalized = stripJsonFence(parsed.content);
    try {
      return {
        value: JSON.parse(normalized) as T,
        usage: parseHostedChatUsage(parsed.usage),
      };
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
