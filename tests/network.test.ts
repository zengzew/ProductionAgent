import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {chatJson} from "../src/lib/llm";
import {fetchWithRetry} from "../src/lib/network";
import {loadTtsV2Config} from "../src/lib/pipeline-v2-config";
import {
  createMinimaxProvider,
  runTtsWithFallback,
  selectTtsProvider,
  type ChineseTtsProvider,
} from "../src/lib/tts-providers";

afterEach(() => {
  vi.unstubAllEnvs();
});

const response = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {"content-type": "application/json"},
  });

describe("network request safeguards", () => {
  const fakeProvider = (id: "minimax" | "edge"): ChineseTtsProvider => ({
    id,
    label: id,
    voice: id,
    speed: 1,
    pitch: 0,
    credentialRequired: id === "minimax",
    splitBySentence: false,
    synthesize: async () => ({}),
  });

  it("selects the configured Edge fallback when MiniMax credentials are missing", () => {
    expect(
      selectTtsProvider({
        requestedProvider: "minimax",
        hasCredential: false,
        allowFallback: true,
        fallbackOnMissingCredential: true,
      }),
    ).toEqual({
      providerId: "edge",
      fallbackUsed: true,
      fallbackReason: "missing MiniMax credential",
    });
  });

  it("runs the fallback provider after a provider rejection and preserves the reason", async () => {
    const calls: string[] = [];
    const result = await runTtsWithFallback({
      requestedProvider: "minimax",
      provider: fakeProvider("minimax"),
      fallbackProvider: fakeProvider("edge"),
      allowFallback: true,
      fallbackOnError: true,
      run: async (provider) => {
        calls.push(provider.id);
        if (provider.id === "minimax") throw new Error("provider rejected request");
        return "edge-output";
      },
    });

    expect(calls).toEqual(["minimax", "edge"]);
    expect(result).toMatchObject({
      value: "edge-output",
      provider: {id: "edge"},
      fallbackUsed: true,
      fallbackReason: "provider rejected request",
    });
  });

  it("retries transient HTTP failures with exponential backoff", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      calls += 1;
      return calls === 1 ? response(503, {error: "temporary"}) : response(200, {ok: true});
    };

    await expect(
      fetchWithRetry(
        "https://example.test",
        {},
        {
          fetchImpl,
          maxRetries: 1,
          retryBaseDelayMs: 10,
          sleep: async () => undefined,
        },
      ),
    ).resolves.toMatchObject({status: 200});
    expect(calls).toBe(2);
  });

  it("turns an aborted request into a bounded error", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });

    await expect(
      fetchWithRetry(
        "https://example.test",
        {},
        {
          fetchImpl,
          timeoutMs: 5,
          maxRetries: 0,
        },
      ),
    ).rejects.toThrow(/5ms 超时/u);
  });

  it("includes a response snippet when the LLM returns invalid JSON", async () => {
    const fetchImpl: typeof fetch = async () =>
      response(200, {
        choices: [{message: {content: '{"broken":'}}],
      });

    await expect(
      chatJson(
        {
          endpoint: "https://example.test/chat",
          apiKey: "test-key",
          model: "test-model",
          temperature: 0,
          network: {fetchImpl, maxRetries: 0},
        },
        [{role: "user", content: "test"}],
      ),
    ).rejects.toThrow(/content=\{"broken":/u);
  });

  it("applies the retrying fetcher to MiniMax TTS", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "test-key");
    const config = loadTtsV2Config();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? response(500, {base_resp: {status_code: 500, status_msg: "retry"}})
        : response(200, {base_resp: {status_code: 0}, data: {audio: "00"}});
    };
    const provider = createMinimaxProvider(config, {
      fetchImpl,
      maxRetries: 1,
      retryBaseDelayMs: 0,
      sleep: async () => undefined,
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-tts-network-"));
    const output = path.join(directory, "segment.mp3");
    try {
      await provider.synthesize("测试", output);
      expect(calls).toBe(2);
      expect(fs.readFileSync(output)).toEqual(Buffer.from("00", "hex"));
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
});
