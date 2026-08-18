export type RetryableFetchOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const shouldRetryStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const fetchWithRetry = async (
  input: RequestInfo | URL,
  init: RequestInit,
  options: RetryableFetchOptions = {},
): Promise<Response> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!shouldRetryStatus(response.status) || attempt === maxRetries) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw new Error(
          `网络请求失败（${attempt + 1} 次尝试，${timeoutMs}ms 超时）：${errorMessage(error)}`,
          {cause: error},
        );
      }
    }

    await sleep(retryBaseDelayMs * 2 ** attempt);
  }

  throw new Error(`网络请求失败：${errorMessage(lastError)}`);
};
