import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {executionEventSchema, type ExecutionEvent} from "./schemas/execution-event";
import {stableJson} from "./stable-json";

export const EXECUTION_LOG_PATH = (episodeId: string): string =>
  `content/${episodeId}/observability/executions.jsonl`;

const secretPatterns = [
  /\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{12,}\b/giu,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/giu,
  /\b(?:authorization|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/giu,
];

const sanitizeText = (value: string): string =>
  secretPatterns.reduce((sanitized, pattern) => sanitized.replace(pattern, "[REDACTED]"), value);

export const sanitizeExecutionEvent = (event: ExecutionEvent): ExecutionEvent =>
  executionEventSchema.parse({
    ...event,
    error: event.error ? {...event.error, message: sanitizeText(event.error.message)} : null,
  });

export const appendExecutionEvent = (filePath: string, rawEvent: ExecutionEvent): void => {
  const event = sanitizeExecutionEvent(rawEvent);
  const serialized = JSON.stringify(event);
  if (
    /"(?:body|content|narration|transcript|captions|claimLedger|sourcePassage)"\s*:/u.test(
      serialized,
    )
  ) {
    throw new Error("execution event contains a forbidden artifact body field");
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
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

export const hashArtifactInputs = (artifacts: ExecutionEvent["inputArtifacts"]): string =>
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
