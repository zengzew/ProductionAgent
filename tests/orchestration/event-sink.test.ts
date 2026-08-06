import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  appendExecutionEvent,
  importLegacyEpisode001,
  type ExecutionEvent,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("M1.2 append-only execution event sink", () => {
  it("appends JSONL records and sanitizes secret-like error text", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const imported = importLegacyEpisode001({
      repoRoot,
      occurredAt: "2026-08-05T00:00:00.000Z",
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-events-"));
    temporaryDirectories.push(directory);
    const logPath = path.join(directory, "executions.jsonl");
    const base = imported.executionEvents[0];
    if (!base) throw new Error("legacy fixture has no execution event");
    appendExecutionEvent(logPath, base);
    const firstBytes = fs.readFileSync(logPath);

    const failed: ExecutionEvent = {
      ...base,
      eventId: "failed-event",
      eventType: "execution.failed",
      status: "FAILED",
      decision: null,
      error: {
        code: "TEST",
        class: "authentication",
        retryable: false,
        message: "Authorization: Bearer secret_token_123456789 and api_key=sk-test_123456789012345",
        providerRequestId: null,
        retryAfterMs: null,
        invalidOutputHash: null,
      },
    };
    appendExecutionEvent(logPath, failed);

    const bytes = fs.readFileSync(logPath);
    expect(bytes.subarray(0, firstBytes.length)).toEqual(firstBytes);
    const lines = bytes.toString("utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("[REDACTED]");
    expect(lines[1]).not.toContain("secret_token_123456789");
    expect(lines[1]).not.toContain("sk-test_123456789012345");
  });
});
