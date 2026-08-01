export type ChatClientConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
};

export const chatJson = async <T>(
  config: ChatClientConfig,
  messages: Array<{role: "system" | "user"; content: string}>,
): Promise<T> => {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json"},
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      response_format: {type: "json_object"},
      messages,
    }),
  });
  const body = (await response.json()) as {
    choices?: Array<{message?: {content?: string}}>;
    error?: {message?: string};
  };
  if (!response.ok) {
    throw new Error(`LLM 请求失败 (${response.status})：${body.error?.message ?? "未知错误"}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回缺少 message.content");
  return JSON.parse(
    content
      .trim()
      .replace(/^```(?:json)?\s*/u, "")
      .replace(/\s*```$/u, ""),
  ) as T;
};
