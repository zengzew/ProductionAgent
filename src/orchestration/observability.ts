import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  executionEventSchema,
  observabilityEventSchema,
  type ExecutionEvent,
} from "./schemas/execution-event";
import {stableJson} from "./stable-json";
import type {ProductionState} from "./state";
export {
  appendCacheEvent,
  buildSegmentTtsCacheKey,
  buildShotAssetCacheKey,
  cacheEntryPath,
  copyBytesAtomically,
  createCacheEventSink,
  FINE_CACHE_ENTRY_SCHEMA_VERSION,
  fineGrainedCacheEntrySchema,
  FineGrainedCacheStore,
  hashRepositoryFiles,
  normalizeNarration,
  sha256Bytes,
  sha256File,
  sha256Json,
  SHOT_ASSET_CACHE_SCHEMA_VERSION,
  TTS_SEGMENT_CACHE_SCHEMA_VERSION,
  type CacheEventSink,
  type CacheLookup,
  type CacheLookupHit,
  type CacheLookupMiss,
  type FineGrainedCacheStoreOptions,
} from "../lib/platform/cache";
export {cacheEventSchema, type CacheEvent} from "./schemas/cache-event";

export const EXECUTION_LOG_PATH = (episodeId: string): string =>
  `content/${episodeId}/observability/executions.jsonl`;

const secretPatterns = [
  /\b(?:sk|pk|api|access|refresh)[-_](?:key[-_])?[A-Za-z0-9_-]{12,}\b/giu,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/giu,
  /\b(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token|password)\s*[:=]\s*[^\s,;]+/giu,
  /\b(?:x-amz-credential|x-amz-signature|sig(?:nature)?)\s*=\s*[^\s&;,]+/giu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
];

const forbiddenBodyKeys = new Set([
  "body",
  "content",
  "narration",
  "transcript",
  "captions",
  "claimLedger",
  "sourcePassage",
  "sourceText",
  "promptBody",
  "requestBody",
  "responseBody",
  "requestPayload",
  "responsePayload",
]);

const forbiddenSecretKeys = new Set([
  "authorization",
  "authorizationHeader",
  "apiKey",
  "accessToken",
  "refreshToken",
  "secretEnv",
  "cookie",
  "signedUrl",
]);

const secretBearingIdentityKeys = new Set([
  "artifactId",
  "path",
  "episodeId",
  "runId",
  "traceId",
  "executionId",
  "eventId",
  "checkpointId",
  "sha256",
  "stateSha256",
  "configurationHash",
  "promptId",
  "promptVersion",
]);

export const redactObservabilityText = (value: string): string =>
  secretPatterns.reduce((sanitized, pattern) => sanitized.replace(pattern, "[REDACTED]"), value);

/** Redacts free text but fails closed when sensitive material is placed in an identity/body field. */
export const redactObservabilityValue = (value: unknown, trail: string[] = []): unknown => {
  if (typeof value === "string") return redactObservabilityText(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => redactObservabilityValue(item, [...trail, String(index)]));
  }
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenBodyKeys.has(key) || forbiddenSecretKeys.has(key)) {
      throw new Error(
        `OBSERVABILITY_REDACTION_FAILED:forbidden field ${[...trail, key].join(".")}`,
      );
    }
    const redacted = redactObservabilityValue(child, [...trail, key]);
    if (
      typeof child === "string" &&
      typeof redacted === "string" &&
      secretBearingIdentityKeys.has(key) &&
      child !== redacted
    ) {
      throw new Error(`OBSERVABILITY_REDACTION_FAILED:identity field ${[...trail, key].join(".")}`);
    }
    output[key] = redacted;
  }
  return output;
};

export const sanitizeExecutionEvent = (event: ExecutionEvent): ExecutionEvent => {
  try {
    const parsed = executionEventSchema.parse(redactObservabilityValue(event));
    if (parsed.schemaVersion !== "observability-event-v1") return parsed;
    const canonical = observabilityEventSchema.parse(parsed);
    const expectedEventHash = hashObservabilityEvent(canonical);
    if (canonical.eventHash !== expectedEventHash) {
      throw new Error(`OBSERVABILITY_EVENT_HASH_MISMATCH:${canonical.eventId}`);
    }
    return canonical;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("OBSERVABILITY_REDACTION_FAILED:") ||
        error.message.startsWith("OBSERVABILITY_EVENT_HASH_MISMATCH:"))
    ) {
      throw error;
    }
    throw new Error(
      `OBSERVABILITY_REDACTION_FAILED:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
};

export const appendExecutionEvent = (filePath: string, rawEvent: ExecutionEvent): void => {
  const event = sanitizeExecutionEvent(rawEvent);
  if (event.schemaVersion === "observability-event-v1") {
    const expectedEventId = stableEventId(event.executionId, event.eventType);
    if (event.eventId !== expectedEventId) {
      throw new Error(`EVENT_LOG_TAMPERED:${event.eventId}`);
    }
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  if (fs.existsSync(filePath)) {
    const existingLines = fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.length > 0);
    for (const line of existingLines) {
      let existing: ExecutionEvent;
      try {
        existing = executionEventSchema.parse(JSON.parse(line) as unknown);
      } catch (error) {
        throw new Error(
          `EVENT_LOG_EXISTING_INVALID:${error instanceof Error ? error.message : String(error)}`,
          {cause: error},
        );
      }
      if (existing.eventId !== event.eventId) continue;
      if (stableJson(existing) === stableJson(event)) return;
      throw new Error(`EVENT_LOG_DUPLICATE_CONFLICT:${event.eventId}`);
    }
  }
  const serialized = JSON.stringify(event);
  fs.appendFileSync(filePath, `${serialized}\n`, {encoding: "utf8", flag: "a"});
};

export type ExecutionEventSink = (event: ExecutionEvent) => void;

export const createExecutionEventSink = (input: {
  repoRoot: string;
  episodeId: string;
}): ExecutionEventSink => {
  const filePath = path.resolve(input.repoRoot, EXECUTION_LOG_PATH(input.episodeId));
  const relative = path.relative(input.repoRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("execution log path must stay inside the repository");
  }
  return (event) => appendExecutionEvent(filePath, event);
};

export const hashArtifactInputs = (
  artifacts: ReadonlyArray<ExecutionEvent["inputArtifacts"][number]>,
): string =>
  crypto
    .createHash("sha256")
    .update(
      stableJson(
        [...artifacts]
          .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
          .map(({artifactId, revision, sha256}) => ({artifactId, revision, sha256})),
      ),
    )
    .digest("hex");

export const stableEventId = (
  executionId: string,
  eventType: ExecutionEvent["eventType"],
): string => crypto.createHash("sha256").update(`${executionId}:${eventType}`).digest("hex");

export const hashObservabilityEvent = (event: ExecutionEvent): string => {
  const withoutHash = {...event};
  Reflect.deleteProperty(withoutHash, "eventHash");
  return crypto.createHash("sha256").update(stableJson(withoutHash), "utf8").digest("hex");
};

export class ExecutionLogIntegrityError extends Error {
  readonly code:
    | "EVENT_LOG_MISSING"
    | "EVENT_LOG_EMPTY"
    | "EVENT_LOG_INVALID"
    | "EVENT_LOG_REORDERED"
    | "EVENT_LOG_DUPLICATE"
    | "EVENT_LOG_DUPLICATE_CONFLICT"
    | "EVENT_LOG_TAMPERED"
    | "EVENT_LOG_STATE_MISMATCH"
    | "EVENT_LOG_REDACTION_FAILED";

  constructor(code: ExecutionLogIntegrityError["code"], message: string) {
    super(`[${code}] ${message}`);
    this.name = "ExecutionLogIntegrityError";
    this.code = code;
  }
}

export type ExecutionLogView = {
  executionId: string;
  episodeId: string;
  attempt: number;
  eventIds: string[];
  status: ExecutionEvent["status"];
  startedAt: string;
  endedAt: string | null;
  outputArtifacts: ExecutionEvent["outputArtifacts"];
};

const terminalEventTypes = new Set<ExecutionEvent["eventType"]>([
  "execution.completed",
  "execution.failed",
  "execution.skipped",
  "execution.recovered",
]);

const standaloneControlEventTypes = new Set<ExecutionEvent["eventType"]>([
  "retry.scheduled",
  "repair.started",
  "repair.completed",
  "unfreeze.requested",
  "unfreeze.approved",
  "unfreeze.rejected",
  "human-decision.recorded",
  "approval.blocked",
  "observability.degraded",
]);

const eventLogLines = (events: readonly ExecutionEvent[]): string =>
  events.map((event) => stableJson(event)).join("\n") + (events.length > 0 ? "\n" : "");

export const hashExecutionEvents = (events: readonly ExecutionEvent[]): string =>
  crypto.createHash("sha256").update(eventLogLines(events), "utf8").digest("hex");

const parseExecutionLog = (filePath: string): ExecutionEvent[] => {
  if (!fs.existsSync(filePath)) {
    throw new ExecutionLogIntegrityError("EVENT_LOG_MISSING", filePath);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const rawLines = raw.split(/\r?\n/u);
  if (rawLines.at(-1) === "") rawLines.pop();
  if (rawLines.length === 0) {
    throw new ExecutionLogIntegrityError("EVENT_LOG_EMPTY", filePath);
  }
  const events: ExecutionEvent[] = [];
  for (const [index, line] of rawLines.entries()) {
    if (!line.trim()) {
      throw new ExecutionLogIntegrityError("EVENT_LOG_INVALID", `blank line at ${index + 1}`);
    }
    try {
      events.push(executionEventSchema.parse(JSON.parse(line) as unknown));
    } catch (error) {
      throw new ExecutionLogIntegrityError(
        "EVENT_LOG_INVALID",
        `line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return events;
};

const validateExecutionLogOrder = (
  events: readonly ExecutionEvent[],
  episodeId?: string,
  allowIncompleteLifecycles = false,
): void => {
  const seen = new Set<string>();
  const perExecution = new Map<
    string,
    {started: boolean; failed: boolean; terminal: boolean; lastOccurredAt: number}
  >();
  let previousOccurredAt = Number.NEGATIVE_INFINITY;

  for (const [index, event] of events.entries()) {
    if (episodeId && event.episodeId !== episodeId) {
      throw new ExecutionLogIntegrityError(
        "EVENT_LOG_INVALID",
        `episode mismatch at line ${index + 1}: ${event.episodeId}`,
      );
    }
    if (seen.has(event.eventId)) {
      throw new ExecutionLogIntegrityError("EVENT_LOG_DUPLICATE", event.eventId);
    }
    seen.add(event.eventId);
    if (stableEventId(event.executionId, event.eventType) !== event.eventId) {
      throw new ExecutionLogIntegrityError("EVENT_LOG_TAMPERED", event.eventId);
    }
    const occurredAt = Date.parse(event.occurredAt);
    if (
      !Number.isFinite(occurredAt) ||
      (occurredAt < previousOccurredAt && event.eventType !== "human-decision.recorded")
    ) {
      throw new ExecutionLogIntegrityError(
        "EVENT_LOG_REORDERED",
        `line ${index + 1} is earlier than the preceding event`,
      );
    }
    previousOccurredAt = Math.max(previousOccurredAt, occurredAt);

    const current = perExecution.get(event.executionId) ?? {
      started: false,
      failed: false,
      terminal: false,
      lastOccurredAt: Number.NEGATIVE_INFINITY,
    };
    if (occurredAt < current.lastOccurredAt) {
      throw new ExecutionLogIntegrityError(
        "EVENT_LOG_REORDERED",
        `execution ${event.executionId} is out of order`,
      );
    }
    current.lastOccurredAt = occurredAt;
    if (standaloneControlEventTypes.has(event.eventType)) {
      // Control records may refer to a completed attempt or to a run-level operation. They are
      // still ordered and hash-bound, but do not create a second lifecycle for the execution.
      continue;
    }
    if (event.eventType === "execution.started") {
      if (current.started || current.terminal) {
        throw new ExecutionLogIntegrityError(
          "EVENT_LOG_REORDERED",
          `execution ${event.executionId} has a duplicate start`,
        );
      }
      current.started = true;
    } else {
      if (!current.started) {
        throw new ExecutionLogIntegrityError(
          "EVENT_LOG_REORDERED",
          `execution ${event.executionId} has an event before execution.started`,
        );
      }
      if (current.terminal) {
        throw new ExecutionLogIntegrityError(
          "EVENT_LOG_REORDERED",
          `execution ${event.executionId} has an event after its terminal event`,
        );
      }
      if (event.eventType === "execution.recovered" && !current.failed) {
        throw new ExecutionLogIntegrityError(
          "EVENT_LOG_INVALID",
          `execution ${event.executionId} recovered without a failure`,
        );
      }
    }
    if (event.eventType === "execution.failed") current.failed = true;
    if (terminalEventTypes.has(event.eventType)) current.terminal = true;
    perExecution.set(event.executionId, current);
  }

  for (const [executionId, execution] of perExecution) {
    if (!execution.started || !execution.terminal) {
      if (allowIncompleteLifecycles && execution.started && !execution.terminal) continue;
      throw new ExecutionLogIntegrityError(
        "EVENT_LOG_INVALID",
        `execution ${executionId} has no complete lifecycle`,
      );
    }
  }
};

export const readExecutionEventLog = (filePath: string): ExecutionEvent[] => {
  const events = parseExecutionLog(filePath);
  validateExecutionLogOrder(events);
  return events;
};

/**
 * Reads an append-only log while a stage may be between execution.started and
 * its terminal event. Hash, schema, ordering, and duplicate checks stay strict;
 * only an incomplete lifecycle is tolerated for allocating a higher attempt.
 */
export const readExecutionEventLogForAttemptAllocation = (
  filePath: string,
): ExecutionEvent[] => {
  const events = parseExecutionLog(filePath);
  validateExecutionLogOrder(events, undefined, true);
  return events;
};

export const verifyExecutionEventLog = (input: {
  filePath: string;
  expectedSha256: string;
  episodeId?: string;
}): {events: ExecutionEvent[]; sha256: string} => {
  const events = parseExecutionLog(input.filePath);
  validateExecutionLogOrder(events, input.episodeId);
  const sha256 = hashExecutionEvents(events);
  if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256) || sha256 !== input.expectedSha256) {
    throw new ExecutionLogIntegrityError(
      "EVENT_LOG_TAMPERED",
      `event log digest mismatch for ${input.filePath}`,
    );
  }
  return {events, sha256};
};

export const rebuildExecutionView = (events: readonly ExecutionEvent[]): ExecutionLogView[] => {
  validateExecutionLogOrder(events);
  const views = new Map<string, ExecutionLogView>();
  for (const event of events) {
    const existing = views.get(event.executionId);
    if (!existing) {
      views.set(event.executionId, {
        executionId: event.executionId,
        episodeId: event.episodeId,
        attempt: event.attempt,
        eventIds: [event.eventId],
        status: event.status,
        startedAt: event.timing.startedAt,
        endedAt: event.timing.endedAt,
        outputArtifacts: [...event.outputArtifacts],
      });
      continue;
    }
    existing.eventIds.push(event.eventId);
    existing.status = event.status;
    existing.endedAt = event.timing.endedAt;
    existing.outputArtifacts = [...event.outputArtifacts];
  }
  return [...views.values()].sort((left, right) =>
    left.executionId.localeCompare(right.executionId),
  );
};

export const assertExecutionLogMatchesState = (input: {
  events: readonly ExecutionEvent[];
  state: ProductionState;
}): void => {
  const byId = new Map(input.events.map((event) => [event.eventId, event]));
  if (input.events.length !== input.state.events.length) {
    throw new ExecutionLogIntegrityError(
      "EVENT_LOG_STATE_MISMATCH",
      `verified log has ${input.events.length} events but checkpoint has ${input.state.events.length} summaries`,
    );
  }
  for (const summary of input.state.events) {
    const event = byId.get(summary.eventId);
    if (!event || event.executionId !== summary.executionId || event.status !== summary.status) {
      throw new ExecutionLogIntegrityError(
        "EVENT_LOG_STATE_MISMATCH",
        `state event summary ${summary.eventId} is not present in the verified log`,
      );
    }
  }
};
