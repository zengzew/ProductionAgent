import {fetchWithRetry, type RetryableFetchOptions} from "../platform/network";

export type ChatClientConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  network?: RetryableFetchOptions;
};

export const chatJson = async <T>(
  config: ChatClientConfig,
  messages: Array<{role: "system" | "user"; content: string}>,
): Promise<T> => {
  const response = await fetchWithRetry(
    config.endpoint,
    {
      method: "POST",
      headers: {Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        response_format: {type: "json_object"},
        messages,
      }),
    },
    config.network,
  );
  const rawBody = await response.text();
  let body: {
    choices?: Array<{message?: {content?: string}}>;
    error?: {message?: string};
  } = {};
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    if (!response.ok) {
      throw new Error(`LLM 请求失败 (${response.status})：${rawBody.slice(0, 500)}`);
    }
    throw new Error(`LLM 返回不是有效 JSON：${rawBody.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`LLM 请求失败 (${response.status})：${body.error?.message ?? "未知错误"}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回缺少 message.content");
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "");
  try {
    return JSON.parse(normalized) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM JSON 解析失败：${reason}；content=${content.slice(0, 500)}`, {
      cause: error,
    });
  }
};
