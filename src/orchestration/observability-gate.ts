import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {assertArtifactRefsBytes} from "./artifact-registry";
import {productionStateControlHash} from "./checkpoint-integrity";
import {
  hashExecutionEvents,
  hashObservabilityEvent,
  redactObservabilityText,
  redactObservabilityValue,
  sanitizeExecutionEvent,
  stableEventId,
} from "./observability";
import {
  checkpointReferenceSchema,
  observabilityEventSchema,
  terminalStatusSchema,
  type ExecutionEvent,
  type ObservabilityEvent,
} from "./schemas/execution-event";
import {cacheEventSchema, type CacheEvent} from "./schemas/cache-event";
import {productionStageNames, type ProductionStageName} from "./schemas/production";
import {PRODUCTION_CHECKPOINT_SCHEMA_VERSION} from "./schemas/migrations/versions";
import {stableJson} from "./stable-json";
import type {ArtifactRef} from "./schemas/artifact";
import type {ProductionState} from "./state";

export type {ObservabilityEvent} from "./schemas/execution-event";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const observabilityStatusSchema = z.enum([
  "observability-complete",
  "observability-degraded",
]);

export const observabilityCheckpointSchema = z
  .object({
    checkpointId: z.string().min(1),
    checkpointVersion: z.string().min(1),
    stateSha256: sha256Schema,
    artifactIndexSha256: sha256Schema.nullable(),
    workflowSha256: sha256Schema.nullable(),
    revisionLedgerSha256: sha256Schema.nullable(),
    committedAt: z.string().datetime({offset: true}).optional(),
  })
  .strict();

export type ObservabilityCheckpoint = z.infer<typeof observabilityCheckpointSchema>;

export type ObservabilityArtifactVerifier = (ref: ArtifactRef) => boolean | void;
export type ObservabilityEventSink = (event: ObservabilityEvent) => void;

export type ObservabilityGateInput = {
  episodeId?: string;
  runId?: string;
  state?: ProductionState;
  events?: readonly ExecutionEvent[];
  eventLogPath?: string;
  expectedEventLogSha256?: string;
  cacheEvents?: readonly CacheEvent[];
  cacheEventLogPath?: string;
  expectedCacheEventLogSha256?: string;
  repoRoot?: string;
  artifactVerifier?: ObservabilityArtifactVerifier;
  executedStages?: readonly string[];
  committedCheckpoints?: readonly ObservabilityCheckpoint[];
};

export type ObservabilityGateResult = {
  status: z.infer<typeof observabilityStatusSchema>;
  approvalAllowed: boolean;
  reasons: string[];
  warnings: string[];
  episodeId: string | null;
  runId: string | null;
  eventLogSha256: string | null;
  cacheEventLogSha256: string | null;
  artifactVerification: "bytes" | "custom-verifier" | "reference-only" | "failed";
  events: ObservabilityEvent[];
  cacheEvents: CacheEvent[];
};

export class ObservabilityDegradedError extends Error {
  readonly code = "OBSERVABILITY_DEGRADED" as const;
  readonly result: ObservabilityGateResult;

  constructor(result: ObservabilityGateResult) {
    super(`[OBSERVABILITY_DEGRADED] ${result.reasons.join("; ") || "approval is not auditable"}`);
    this.name = "ObservabilityDegradedError";
    this.result = result;
  }
}

const terminalEventTypes = new Set<ExecutionEvent["eventType"]>([
  "execution.completed",
  "execution.failed",
  "execution.skipped",
  "execution.recovered",
]);

const lifecycleEventTypes = new Set<ExecutionEvent["eventType"]>([
  "execution.started",
  ...terminalEventTypes,
]);

const checkpointEventType = "checkpoint.committed" as const;

const terminalForEvent = (event: ExecutionEvent): z.infer<typeof terminalStatusSchema> | null => {
  if (event.terminalStatus) return event.terminalStatus;
  if (event.eventType === "execution.completed" || event.eventType === "execution.recovered") {
    return "succeeded";
  }
  if (event.eventType === "execution.failed") return "failed";
  if (event.eventType === "execution.skipped") return "skipped";
  return null;
};

const statusForTerminal = (
  status: z.infer<typeof terminalStatusSchema>,
): ExecutionEvent["status"] =>
  status === "succeeded" ? "SUCCEEDED" : status === "failed" ? "FAILED" : "SKIPPED";

const normalizedRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] =>
  [...refs].sort((left, right) =>
    `${left.artifactId}:${left.revision}:${left.sha256}`.localeCompare(
      `${right.artifactId}:${right.revision}:${right.sha256}`,
    ),
  );

const sameRefs = (left: readonly ArtifactRef[], right: readonly ArtifactRef[]): boolean =>
  stableJson(normalizedRefs(left)) === stableJson(normalizedRefs(right));

const uniqueRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] => {
  const values = new Map<string, ArtifactRef>();
  for (const ref of refs) values.set(`${ref.artifactId}:${ref.revision}:${ref.sha256}`, ref);
  return normalizedRefs([...values.values()]);
};

const cacheEventWithoutId = (event: CacheEvent): Omit<CacheEvent, "eventId"> => {
  const withoutId = {...event};
  Reflect.deleteProperty(withoutId, "eventId");
  return withoutId;
};

const hashCacheEvents = (events: readonly CacheEvent[]): string =>
  crypto
    .createHash("sha256")
    .update(
      events.map((event) => stableJson(event)).join("\n") + (events.length > 0 ? "\n" : ""),
      "utf8",
    )
    .digest("hex");

const readJsonLines = <T>(filePath: string, parse: (value: unknown) => T): T[] => {
  if (!fs.existsSync(filePath)) throw new Error(`OBSERVABILITY_LOG_MISSING:${filePath}`);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0) throw new Error(`OBSERVABILITY_LOG_EMPTY:${filePath}`);
  return lines.map((line, index) => {
    if (!line.trim()) throw new Error(`OBSERVABILITY_LOG_INVALID:blank line ${index + 1}`);
    try {
      return parse(JSON.parse(line) as unknown);
    } catch (error) {
      throw new Error(
        `OBSERVABILITY_LOG_INVALID:line ${index + 1}:${error instanceof Error ? error.message : String(error)}`,
        {cause: error},
      );
    }
  });
};

const checkpointForState = (input: {
  state: ProductionState;
  checkpointId?: string;
  checkpointVersion?: string;
  committedAt?: string;
}): ObservabilityCheckpoint =>
  observabilityCheckpointSchema.parse({
    checkpointId:
      input.checkpointId ??
      `${input.state.runId}:checkpoint:${input.state.phase}:${input.state.round}`,
    checkpointVersion: input.checkpointVersion ?? PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    stateSha256: productionStateControlHash(input.state),
    artifactIndexSha256: null,
    workflowSha256: null,
    revisionLedgerSha256: null,
    ...(input.committedAt ? {committedAt: input.committedAt} : {}),
  });

export const createObservabilityCheckpoint = (input: {
  state: ProductionState;
  checkpointId?: string;
  checkpointVersion?: string;
  committedAt?: string;
}): ObservabilityCheckpoint => checkpointForState(input);

const defaultUsage = (executionKind: ExecutionEvent["executionKind"]): ExecutionEvent["usage"] =>
  executionKind === "deterministic-tool"
    ? {
        availability: "not-applicable",
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        cost: {amount: "0", currency: "USD", pricingVersion: "not-applicable"},
      }
    : {
        availability: "unavailable",
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        totalTokens: null,
        cost: {amount: null, currency: null, pricingVersion: null},
      };

const baseEventInput = (input: {
  eventType: ExecutionEvent["eventType"];
  state: ProductionState;
  stage: string;
  executionId: string;
  attempt: number;
  inputArtifacts: readonly ArtifactRef[];
  outputArtifacts?: readonly ArtifactRef[];
  checkpoint: ObservabilityCheckpoint;
  occurredAt?: string;
  startedAt?: string;
  terminalStatus?: z.infer<typeof terminalStatusSchema> | null;
  decisionId?: string;
  nextAttempt?: number;
  decision?: ExecutionEvent["decision"];
  error?: ExecutionEvent["error"];
  usage?: ExecutionEvent["usage"];
  status?: ExecutionEvent["status"];
  executionKind?: ExecutionEvent["executionKind"];
  agentName?: ExecutionEvent["agentName"];
  parentExecutionId?: string | null;
  inputSetHash?: string;
  runnerVersion?: string;
}): ObservabilityEvent => {
  const executionKind = input.executionKind ?? "deterministic-tool";
  const startedAt = input.startedAt ?? input.occurredAt ?? new Date().toISOString();
  const occurredAt = input.occurredAt ?? startedAt;
  const terminalStatus = input.terminalStatus ?? null;
  const timingEndedAt = terminalStatus ? occurredAt : null;
  const event = {
    schemaVersion: "observability-event-v1" as const,
    eventId: stableEventId(input.executionId, input.eventType),
    eventType: input.eventType,
    occurredAt,
    episodeId: input.state.episodeId,
    runId: input.state.runId,
    stage: input.stage,
    traceId: input.state.runId,
    executionId: input.executionId,
    parentExecutionId: input.parentExecutionId ?? null,
    agentName: input.agentName ?? "orchestrator",
    executionKind,
    attempt: input.attempt,
    ...(input.nextAttempt !== undefined ? {nextAttempt: input.nextAttempt} : {}),
    revisionRound: input.state.round,
    approvalEpoch: input.state.approvalEpoch,
    ...(input.decisionId ? {decisionId: input.decisionId} : {}),
    checkpointVersion: input.checkpoint.checkpointVersion,
    inputSetHash: input.inputSetHash ?? hashArtifactInputsForRefs(input.inputArtifacts),
    terminalStatus,
    model: null,
    prompt: null,
    inputArtifacts: [...input.inputArtifacts],
    outputArtifacts: [...(input.outputArtifacts ?? [])],
    usage: input.usage ?? defaultUsage(executionKind),
    timing: {
      startedAt,
      endedAt: timingEndedAt,
      durationMs: terminalStatus ? 0 : null,
      queueMs: null,
      providerMs: null,
    },
    status: input.status ?? (terminalStatus ? statusForTerminal(terminalStatus) : "STARTED"),
    decision: input.decision ?? null,
    error: input.error ?? null,
    checkpoint: {
      checkpointId: input.checkpoint.checkpointId,
      artifactIndexSha256: input.checkpoint.artifactIndexSha256,
      workflowSha256: input.checkpoint.workflowSha256,
      revisionLedgerSha256: input.checkpoint.revisionLedgerSha256,
      stateSha256: input.checkpoint.stateSha256,
    },
    environment: {
      repositoryCommit: null,
      worktreeState: "unknown" as const,
      inputSetHash: input.inputSetHash ?? hashArtifactInputsForRefs(input.inputArtifacts),
      runtime: `node-${process.versions.node}`,
      runnerVersion: input.runnerVersion ?? "observability-v1",
    },
  };
  const redacted = redactObservabilityValue(event) as Record<string, unknown>;
  const eventHash = hashObservabilityEvent(redacted as ExecutionEvent);
  return observabilityEventSchema.parse({...redacted, eventHash});
};

const hashArtifactInputsForRefs = (refs: readonly ArtifactRef[]): string =>
  crypto
    .createHash("sha256")
    .update(
      stableJson(
        normalizedRefs(refs).map(({artifactId, revision, sha256}) => ({
          artifactId,
          revision,
          sha256,
        })),
      ),
      "utf8",
    )
    .digest("hex");

export const createStageStartedEvent = (input: {
  state: ProductionState;
  stage: string;
  executionId: string;
  attempt: number;
  inputArtifacts: readonly ArtifactRef[];
  checkpoint?: ObservabilityCheckpoint;
  occurredAt?: string;
  executionKind?: ExecutionEvent["executionKind"];
  agentName?: ExecutionEvent["agentName"];
  inputSetHash?: string;
}): ObservabilityEvent =>
  baseEventInput({
    ...input,
    eventType: "execution.started",
    checkpoint: input.checkpoint ?? checkpointForState({state: input.state}),
    terminalStatus: null,
  });

export const createStageTerminalEvent = (input: {
  state: ProductionState;
  stage: string;
  executionId: string;
  attempt: number;
  status: z.infer<typeof terminalStatusSchema>;
  inputArtifacts: readonly ArtifactRef[];
  outputArtifacts: readonly ArtifactRef[];
  checkpoint: ObservabilityCheckpoint;
  occurredAt?: string;
  startedAt?: string;
  decision?: ExecutionEvent["decision"];
  error?: ExecutionEvent["error"];
  usage?: ExecutionEvent["usage"];
  executionKind?: ExecutionEvent["executionKind"];
  agentName?: ExecutionEvent["agentName"];
  inputSetHash?: string;
  runnerVersion?: string;
}): ObservabilityEvent => {
  const {status, ...rest} = input;
  return baseEventInput({
    ...rest,
    eventType:
      status === "succeeded"
        ? "execution.completed"
        : status === "failed"
          ? "execution.failed"
          : "execution.skipped",
    terminalStatus: status,
  });
};

export const createCheckpointCommittedEvent = (input: {
  state: ProductionState;
  stage: string;
  executionId: string;
  attempt: number;
  inputArtifacts: readonly ArtifactRef[];
  outputArtifacts: readonly ArtifactRef[];
  checkpoint: ObservabilityCheckpoint;
  status?: "succeeded" | "failed" | "skipped";
  occurredAt?: string;
  inputSetHash?: string;
}): ObservabilityEvent =>
  baseEventInput({
    ...input,
    eventType: checkpointEventType,
    terminalStatus: null,
    // A checkpoint is a control event, not a terminal lifecycle event.
    status: "SUCCEEDED",
    decision: {
      code: "CHECKPOINT_COMMITTED",
      summary: `checkpoint committed for ${input.stage}`,
      rubricVersion: null,
      score: null,
      verdict: null,
      issueIds: [],
      route: null,
      criticResultRef: null,
    },
  });

export const createObservabilityControlEvent = (input: {
  state: ProductionState;
  eventType: Exclude<
    ExecutionEvent["eventType"],
    | "execution.started"
    | "execution.completed"
    | "execution.failed"
    | "execution.skipped"
    | "execution.recovered"
  >;
  stage: string;
  executionId: string;
  attempt?: number;
  nextAttempt?: number;
  decisionId?: string;
  checkpoint?: ObservabilityCheckpoint;
  inputArtifacts?: readonly ArtifactRef[];
  outputArtifacts?: readonly ArtifactRef[];
  occurredAt?: string;
  executionKind?: ExecutionEvent["executionKind"];
  agentName?: ExecutionEvent["agentName"];
  decisionCode?: string;
  decisionSummary?: string;
}): ObservabilityEvent =>
  baseEventInput({
    ...input,
    attempt: input.attempt ?? 1,
    eventType: input.eventType,
    checkpoint: input.checkpoint ?? checkpointForState({state: input.state}),
    inputArtifacts: input.inputArtifacts ?? [],
    outputArtifacts: input.outputArtifacts ?? [],
    executionKind: input.executionKind,
    agentName: input.agentName,
    terminalStatus: null,
    nextAttempt: input.nextAttempt,
    decisionId: input.decisionId,
    decision: {
      code: input.decisionCode ?? input.eventType.replaceAll(".", "_").toUpperCase(),
      summary: input.decisionSummary ?? input.eventType,
      rubricVersion: null,
      score: null,
      verdict: null,
      issueIds: [],
      route: null,
      criticResultRef: null,
    },
  });

const addReason = (reasons: string[], reason: string): void => {
  if (!reasons.includes(reason)) reasons.push(reason);
};

const parseCanonicalEvents = (
  input: ObservabilityGateInput,
  reasons: string[],
): ObservabilityEvent[] => {
  let source: readonly ExecutionEvent[] = input.events ?? [];
  if (input.eventLogPath) {
    try {
      source = readJsonLines(input.eventLogPath, (value) =>
        // The compatibility parser gives a useful bounded error for malformed JSON while the
        // strict parser below enforces the M4-04 fields.
        sanitizeExecutionEvent(value as ExecutionEvent),
      );
    } catch (error) {
      addReason(reasons, error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  const output: ObservabilityEvent[] = [];
  const eventIds = new Set<string>();
  for (const raw of source) {
    let event: ExecutionEvent;
    try {
      event = sanitizeExecutionEvent(raw);
    } catch (error) {
      addReason(reasons, error instanceof Error ? error.message : String(error));
      continue;
    }
    if (eventIds.has(event.eventId)) addReason(reasons, `EVENT_DUPLICATE:${event.eventId}`);
    eventIds.add(event.eventId);
    if (event.schemaVersion !== "observability-event-v1") {
      addReason(reasons, `EVENT_CONTRACT_LEGACY:${event.eventId}`);
      continue;
    }
    try {
      const parsed = observabilityEventSchema.parse(event);
      if (parsed.eventId !== stableEventId(parsed.executionId, parsed.eventType)) {
        addReason(reasons, `EVENT_TAMPERED:${parsed.eventId}`);
      }
      output.push(parsed);
    } catch (error) {
      addReason(
        reasons,
        `EVENT_CONTRACT_INVALID:${event.eventId}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (input.expectedEventLogSha256) {
    const actual = hashExecutionEvents(output);
    if (
      !/^[a-f0-9]{64}$/u.test(input.expectedEventLogSha256) ||
      actual !== input.expectedEventLogSha256
    ) {
      addReason(reasons, "EVENT_LOG_HASH_MISMATCH");
    }
  }
  return output;
};

const parseCacheEvents = (input: ObservabilityGateInput, reasons: string[]): CacheEvent[] => {
  let source: readonly CacheEvent[] = input.cacheEvents ?? [];
  if (input.cacheEventLogPath) {
    try {
      source = readJsonLines(input.cacheEventLogPath, (value) => cacheEventSchema.parse(value));
    } catch (error) {
      addReason(reasons, error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  const output: CacheEvent[] = [];
  const eventIds = new Set<string>();
  for (const raw of source) {
    try {
      const event = cacheEventSchema.parse(raw);
      if (redactObservabilityText(event.reason) !== event.reason) {
        addReason(reasons, `CACHE_EVENT_REDACTION_REQUIRED:${event.eventId}`);
      }
      if (redactObservabilityText(event.logicalItem) !== event.logicalItem) {
        addReason(reasons, `CACHE_EVENT_REDACTION_REQUIRED:${event.eventId}`);
      }
      if (eventIds.has(event.eventId)) addReason(reasons, `CACHE_EVENT_DUPLICATE:${event.eventId}`);
      eventIds.add(event.eventId);
      const expected = crypto
        .createHash("sha256")
        .update(stableJson(cacheEventWithoutId(event)), "utf8")
        .digest("hex");
      if (expected !== event.eventId) addReason(reasons, `CACHE_EVENT_TAMPERED:${event.eventId}`);
      output.push(event);
    } catch (error) {
      addReason(
        reasons,
        `CACHE_EVENT_INVALID:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (input.expectedCacheEventLogSha256) {
    const actual = hashCacheEvents(output);
    if (
      !/^[a-f0-9]{64}$/u.test(input.expectedCacheEventLogSha256) ||
      actual !== input.expectedCacheEventLogSha256
    ) {
      addReason(reasons, "CACHE_EVENT_LOG_HASH_MISMATCH");
    }
  }
  return output;
};

const checkEventIdentity = (
  events: readonly ObservabilityEvent[],
  input: ObservabilityGateInput,
  reasons: string[],
): void => {
  const episodeId = input.episodeId ?? input.state?.episodeId;
  const runId = input.runId ?? input.state?.runId;
  for (const event of events) {
    if (episodeId && event.episodeId !== episodeId)
      addReason(reasons, `EVENT_EPISODE_MISMATCH:${event.eventId}`);
    if (runId && event.runId !== runId) addReason(reasons, `EVENT_RUN_MISMATCH:${event.eventId}`);
    for (const ref of [...event.inputArtifacts, ...event.outputArtifacts]) {
      if (ref.episodeId !== event.episodeId)
        addReason(reasons, `EVENT_ARTIFACT_EPISODE_MISMATCH:${event.eventId}`);
    }
    if (event.environment.inputSetHash !== event.inputSetHash) {
      addReason(reasons, `EVENT_INPUT_HASH_MISMATCH:${event.eventId}`);
    }
  }
};

const checkEventOrder = (events: readonly ObservabilityEvent[], reasons: string[]): void => {
  let previousOccurredAt = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    const occurredAt = Date.parse(event.occurredAt);
    if (occurredAt < previousOccurredAt) {
      addReason(reasons, `EVENT_LOG_REORDERED:${event.eventId}`);
    }
    previousOccurredAt = Math.max(previousOccurredAt, occurredAt);
  }
};

const checkLifecycle = (
  events: readonly ObservabilityEvent[],
  state: ProductionState | undefined,
  input: ObservabilityGateInput,
  reasons: string[],
): void => {
  const lifecycle = new Map<
    string,
    {starts: ObservabilityEvent[]; terminals: ObservabilityEvent[]}
  >();
  const checkpoints = new Map<string, ObservabilityEvent[]>();
  for (const event of events) {
    if (!event.stage) continue;
    const key = `${event.executionId}:${event.stage}:${event.attempt}`;
    if (event.eventType === checkpointEventType) {
      const existing = checkpoints.get(key) ?? [];
      existing.push(event);
      checkpoints.set(key, existing);
      continue;
    }
    if (!lifecycleEventTypes.has(event.eventType)) continue;
    const current = lifecycle.get(key) ?? {starts: [], terminals: []};
    if (event.eventType === "execution.started") current.starts.push(event);
    else current.terminals.push(event);
    lifecycle.set(key, current);
  }

  for (const [key, group] of lifecycle) {
    if (group.starts.length !== 1) addReason(reasons, `STAGE_START_CONFLICT:${key}`);
    if (group.terminals.length !== 1) addReason(reasons, `STAGE_TERMINAL_CONFLICT:${key}`);
    const start = group.starts[0];
    const terminal = group.terminals[0];
    if (!start || !terminal) continue;
    if (Date.parse(start.occurredAt) > Date.parse(terminal.occurredAt)) {
      addReason(reasons, `STAGE_TIMELINE_INVALID:${key}`);
    }
    const terminalStatus = terminalForEvent(terminal);
    if (!terminalStatus || terminal.status !== statusForTerminal(terminalStatus)) {
      addReason(reasons, `STAGE_TERMINAL_STATUS_INVALID:${key}`);
    }
    if (terminal.inputSetHash !== start.inputSetHash)
      addReason(reasons, `STAGE_INPUT_HASH_CONFLICT:${key}`);
    const committed = checkpoints.get(key) ?? [];
    if (committed.length !== 1) {
      addReason(reasons, `STAGE_CHECKPOINT_MISSING_OR_DUPLICATE:${key}`);
      continue;
    }
    const checkpoint = committed[0]!;
    if (
      checkpoint.checkpointVersion !== terminal.checkpointVersion ||
      checkpoint.checkpoint.checkpointId !== terminal.checkpoint.checkpointId ||
      checkpoint.checkpoint.stateSha256 !== terminal.checkpoint.stateSha256 ||
      checkpoint.inputSetHash !== terminal.inputSetHash ||
      !sameRefs(checkpoint.inputArtifacts, terminal.inputArtifacts) ||
      !sameRefs(checkpoint.outputArtifacts, terminal.outputArtifacts)
    ) {
      addReason(reasons, `STAGE_CHECKPOINT_EVENT_CONFLICT:${key}`);
    }
  }

  const stages = new Set<string>([
    ...(input.executedStages ?? []),
    ...events
      .filter(
        (event) =>
          lifecycleEventTypes.has(event.eventType) || event.eventType === checkpointEventType,
      )
      .map((event) => event.stage),
    ...(state ? Object.keys(state.productionStages) : []),
  ]);
  for (const stage of stages) {
    const stageGroups = [...lifecycle.entries()].filter(
      ([, group]) => group.starts[0]?.stage === stage,
    );
    if (stageGroups.length === 0) {
      addReason(reasons, `STAGE_EVENTS_MISSING:${stage}`);
      continue;
    }
    if (state?.productionStages[stage]) {
      const checkpoint = state.productionStages[stage];
      const matching = stageGroups.filter(
        ([, group]) => group.starts[0]?.attempt === checkpoint.attempt,
      );
      const terminal = matching[0]?.[1].terminals[0];
      if (matching.length !== 1 || !terminal) {
        addReason(reasons, `STAGE_COMMITTED_CHECKPOINT_MISSING:${stage}`);
        continue;
      }
      const terminalStatus = terminalForEvent(terminal);
      if (
        terminalStatus !== checkpoint.status.toLowerCase() ||
        terminal.inputSetHash !== checkpoint.inputSetHash ||
        !sameRefs(terminal.outputArtifacts, checkpoint.outputArtifacts)
      ) {
        addReason(reasons, `STAGE_CHECKPOINT_STATE_MISMATCH:${stage}`);
      }
    }
  }

  if (state) {
    const eventIds = new Set(events.map((event) => event.eventId));
    for (const summary of state.events) {
      if (!eventIds.has(summary.eventId))
        addReason(reasons, `STATE_EVENT_MISSING:${summary.eventId}`);
    }
  }
};

const checkRetriesRepairsDecisions = (
  events: readonly ObservabilityEvent[],
  state: ProductionState | undefined,
  reasons: string[],
): void => {
  const attempts = new Map<string, number[]>();
  for (const event of events.filter((candidate) => candidate.eventType === "execution.started")) {
    const values = attempts.get(event.stage) ?? [];
    values.push(event.attempt);
    attempts.set(event.stage, values);
  }
  for (const [stage, values] of attempts) {
    const sorted = [...new Set(values)].sort((left, right) => left - right);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const next = sorted[index]!;
      if (next !== previous + 1)
        addReason(reasons, `RETRY_ATTEMPT_GAP:${stage}:${previous}:${next}`);
      const linked = events.some(
        (event) =>
          event.eventType === "retry.scheduled" &&
          event.stage === stage &&
          event.attempt === previous &&
          event.nextAttempt === next,
      );
      if (!linked) addReason(reasons, `RETRY_EVENT_MISSING:${stage}:${previous}:${next}`);
    }
  }

  const repairRequired = Boolean(
    state &&
    (state.productionRepair.round > 0 ||
      [
        "repairing",
        "unfreeze-review",
        "unfreeze-approved",
        "unfreeze-complete",
        "human-escalation",
      ].includes(state.productionRepair.status)),
  );
  if (repairRequired && !events.some((event) => event.eventType === "repair.started")) {
    addReason(reasons, "REPAIR_EVENT_MISSING");
  }

  const unfreezeRequired = Boolean(state && state.unfreeze.status !== "idle");
  if (unfreezeRequired && !events.some((event) => event.eventType.startsWith("unfreeze."))) {
    addReason(reasons, "UNFREEZE_EVENT_MISSING");
  }

  if (state) {
    for (const decisionId of Object.keys(state.approvals)) {
      if (
        !events.some(
          (event) =>
            event.eventType === "human-decision.recorded" && event.decisionId === decisionId,
        )
      ) {
        addReason(reasons, `HUMAN_DECISION_EVENT_MISSING:${decisionId}`);
      }
    }
  }
};

const checkCache = (
  events: readonly CacheEvent[],
  input: ObservabilityGateInput,
  reasons: string[],
): void => {
  const lookups = new Set(
    events
      .filter((event) => event.eventType === "cache.lookup")
      .map((event) => `${event.executionId}:${event.cacheKey}`),
  );
  for (const [index, event] of events.entries()) {
    if (input.episodeId && event.episodeId !== input.episodeId)
      addReason(reasons, `CACHE_EPISODE_MISMATCH:${event.eventId}`);
    if (input.runId && !event.runId) addReason(reasons, `CACHE_RUN_MISSING:${event.eventId}`);
    if (input.runId && event.runId && event.runId !== input.runId)
      addReason(reasons, `CACHE_RUN_MISMATCH:${event.eventId}`);
    if (
      event.eventType !== "cache.lookup" &&
      !lookups.has(`${event.executionId}:${event.cacheKey}`)
    ) {
      addReason(reasons, `CACHE_LOOKUP_MISSING:${event.eventId}`);
    }
    if (event.eventType !== "cache.lookup") {
      const lookupIndex = events.findIndex(
        (candidate) =>
          candidate.eventType === "cache.lookup" &&
          candidate.executionId === event.executionId &&
          candidate.cacheKey === event.cacheKey,
      );
      if (lookupIndex > index) addReason(reasons, `CACHE_LOOKUP_ORDER_INVALID:${event.eventId}`);
    }
    if (event.eventType === "cache.hit") {
      if (event.cost.amount !== "0") addReason(reasons, `CACHE_HIT_NONZERO_COST:${event.eventId}`);
      if (
        event.usage.totalTokens !== 0 ||
        event.usage.inputTokens !== 0 ||
        event.usage.outputTokens !== 0
      ) {
        addReason(reasons, `CACHE_HIT_NONZERO_USAGE:${event.eventId}`);
      }
    }
  }
};

const verifyArtifacts = (
  input: ObservabilityGateInput,
  events: readonly ObservabilityEvent[],
  reasons: string[],
): ObservabilityGateResult["artifactVerification"] => {
  const refs = uniqueRefs([
    ...events.flatMap((event) => [...event.inputArtifacts, ...event.outputArtifacts]),
    ...(input.state ? Object.values(input.state.artifacts) : []),
  ]);
  try {
    if (input.repoRoot) {
      assertArtifactRefsBytes(input.repoRoot, refs);
      return "bytes";
    }
    if (input.artifactVerifier) {
      for (const ref of refs) {
        if (input.artifactVerifier(ref) === false)
          throw new Error(`ARTIFACT_HASH_UNVERIFIED:${ref.artifactId}`);
      }
      return "custom-verifier";
    }
    if (refs.length > 0) throw new Error("ARTIFACT_VERIFICATION_UNAVAILABLE");
    return "reference-only";
  } catch (error) {
    addReason(reasons, error instanceof Error ? error.message : String(error));
    return "failed";
  }
};

export const evaluateObservabilityCompleteness = (
  input: ObservabilityGateInput,
): ObservabilityGateResult => {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const events = parseCanonicalEvents(input, reasons);
  const cacheEvents = parseCacheEvents(input, reasons);
  const episodeId = input.episodeId ?? input.state?.episodeId ?? events[0]?.episodeId ?? null;
  const runId = input.runId ?? input.state?.runId ?? events[0]?.runId ?? null;

  if (events.length === 0) addReason(reasons, "EVENT_LOG_EMPTY_OR_UNAVAILABLE");
  const scopedInput = {
    ...input,
    ...(episodeId === null ? {} : {episodeId}),
    ...(runId === null ? {} : {runId}),
  };
  checkEventIdentity(events, scopedInput, reasons);
  checkEventOrder(events, reasons);
  checkLifecycle(events, input.state, scopedInput, reasons);
  checkRetriesRepairsDecisions(events, input.state, reasons);
  checkCache(cacheEvents, scopedInput, reasons);

  if (input.committedCheckpoints) {
    for (const value of input.committedCheckpoints) {
      let checkpoint: ObservabilityCheckpoint;
      try {
        checkpoint = observabilityCheckpointSchema.parse(value);
      } catch (error) {
        addReason(
          reasons,
          `COMMITTED_CHECKPOINT_INVALID:${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      const matching = events.filter(
        (event) =>
          event.eventType === checkpointEventType &&
          event.checkpoint.checkpointId === checkpoint.checkpointId &&
          event.checkpointVersion === checkpoint.checkpointVersion,
      );
      if (matching.length !== 1)
        addReason(reasons, `COMMITTED_CHECKPOINT_MISSING:${checkpoint.checkpointId}`);
      else if (matching[0]!.checkpoint.stateSha256 !== checkpoint.stateSha256) {
        addReason(reasons, `COMMITTED_CHECKPOINT_HASH_MISMATCH:${checkpoint.checkpointId}`);
      }
    }
  }

  if (
    input.state?.phase === "published" &&
    !events.some((event) => event.eventType === "human-decision.recorded")
  ) {
    addReason(reasons, "FINAL_APPROVAL_EVENT_MISSING");
  }
  const artifactVerification = verifyArtifacts(input, events, reasons);
  if (artifactVerification === "reference-only") {
    warnings.push("artifact bytes were not checked because no repository or verifier was supplied");
  }
  const status = reasons.length === 0 ? "observability-complete" : "observability-degraded";
  return {
    status,
    approvalAllowed: status === "observability-complete",
    reasons: [...reasons].sort(),
    warnings: [...warnings].sort(),
    episodeId,
    runId,
    eventLogSha256: events.length > 0 ? hashExecutionEvents(events) : null,
    cacheEventLogSha256: cacheEvents.length > 0 ? hashCacheEvents(cacheEvents) : null,
    artifactVerification,
    events,
    cacheEvents,
  };
};

export const observabilityCompletenessGate = evaluateObservabilityCompleteness;
export const runObservabilityCompletenessGate = evaluateObservabilityCompleteness;

export const assertObservabilityComplete = (
  input: ObservabilityGateInput,
): ObservabilityGateResult => {
  const result = evaluateObservabilityCompleteness(input);
  if (!result.approvalAllowed) throw new ObservabilityDegradedError(result);
  return result;
};

export const assertApprovalObservability = assertObservabilityComplete;

const reportRef = (ref: ArtifactRef): string =>
  `${redactObservabilityText(ref.artifactId)}@r${ref.revision} sha256=${ref.sha256} path=${redactObservabilityText(ref.path)}`;

const reportUsage = (events: readonly ObservabilityEvent[]): string[] => {
  const rows = [
    "| execution | stage | availability | tokens | cost |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const event of events.filter((candidate) => candidate.eventType !== "execution.started")) {
    const usage = event.usage;
    const tokens = usage.totalTokens === null ? "unavailable" : String(usage.totalTokens);
    const cost =
      usage.cost.amount === null
        ? "unavailable"
        : `${usage.cost.amount} ${usage.cost.currency ?? ""}`.trim();
    rows.push(
      `| ${redactObservabilityText(event.executionId)} | ${redactObservabilityText(event.stage)} | ${usage.availability} | ${tokens} | ${cost} |`,
    );
  }
  return rows;
};

const reportUsageSummary = (
  events: readonly ObservabilityEvent[],
  cacheEvents: readonly CacheEvent[],
): string[] => {
  const terminal = events.filter((event) => terminalEventTypes.has(event.eventType));
  const realCalls = terminal.filter((event) => terminalForEvent(event) !== "skipped").length;
  const skippedStages = terminal.filter((event) => terminalForEvent(event) === "skipped").length;
  const cacheHits = cacheEvents.filter((event) => event.eventType === "cache.hit").length;
  const cacheMisses = cacheEvents.filter((event) => event.eventType === "cache.miss").length;
  return [
    `- real terminal calls: ${realCalls}`,
    `- skipped stages: ${skippedStages}`,
    `- cache hits: ${cacheHits}`,
    `- cache misses: ${cacheMisses}`,
  ];
};

export type RunReportInput = ObservabilityGateInput & {
  reportPath?: string;
};

export type RunReportResult = ObservabilityGateResult & {
  report: string;
  reportSha256: string;
  reportPath: string | null;
};

export const generateRunReport = (input: RunReportInput): RunReportResult => {
  const result = evaluateObservabilityCompleteness(input);
  try {
    redactObservabilityValue(input.state ? {artifacts: input.state.artifacts} : {});
  } catch (error) {
    throw new Error(
      `OBSERVABILITY_REDACTION_FAILED:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
  const events = result.events;
  const terminalEvents = events
    .filter((event) => terminalEventTypes.has(event.eventType))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const refs = uniqueRefs([
    ...events.flatMap((event) => [...event.inputArtifacts, ...event.outputArtifacts]),
    ...(input.state ? Object.values(input.state.artifacts) : []),
  ]);
  const reportLines = [
    "# run-report",
    "",
    "## Run / episode / schema / checkpoint",
    "",
    `- episodeId: ${result.episodeId ?? "unavailable"}`,
    `- runId: ${result.runId ?? "unavailable"}`,
    `- event schema: observability-event-v1`,
    `- state schema: ${input.state?.schemaVersion ?? "unavailable"}`,
    `- checkpoint schema: ${PRODUCTION_CHECKPOINT_SCHEMA_VERSION}`,
    `- event log sha256: ${result.eventLogSha256 ?? "unavailable"}`,
    `- cache event log sha256: ${result.cacheEventLogSha256 ?? "unavailable"}`,
    `- artifact verification: ${result.artifactVerification}`,
    `- committed checkpoints: ${
      events
        .filter((event) => event.eventType === checkpointEventType)
        .map(
          (event) =>
            `${event.checkpoint.checkpointId}@${event.checkpointVersion} stateSha256=${event.checkpoint.stateSha256}`,
        )
        .join(", ") || "unavailable"
    }`,
    "",
    "## Stage timeline",
    "",
    "| stage | attempt | started | terminal | status | checkpoint |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...terminalEvents.map((event) => {
      const started = events.find(
        (candidate) =>
          candidate.eventType === "execution.started" &&
          candidate.executionId === event.executionId &&
          candidate.attempt === event.attempt &&
          candidate.stage === event.stage,
      );
      return `| ${redactObservabilityText(event.stage)} | ${event.attempt} | ${started?.occurredAt ?? "unavailable"} | ${event.occurredAt} | ${terminalForEvent(event) ?? "unavailable"} | ${event.checkpoint.checkpointId}@${event.checkpointVersion} |`;
    }),
    ...(terminalEvents.length === 0 ? ["| unavailable | - | - | - | - | - |"] : []),
    "",
    "## Artifact revisions / hashes",
    "",
    ...(refs.length > 0 ? refs.map((ref) => `- ${reportRef(ref)}`) : ["- unavailable"]),
    "",
    "## Retries / repairs",
    "",
    ...events
      .filter(
        (event) => event.eventType.startsWith("retry.") || event.eventType.startsWith("repair."),
      )
      .map(
        (event) =>
          `- ${event.occurredAt} ${event.eventType} stage=${redactObservabilityText(event.stage)} attempt=${event.attempt}${event.nextAttempt ? ` nextAttempt=${event.nextAttempt}` : ""}`,
      ),
    ...(events.some(
      (event) => event.eventType.startsWith("retry.") || event.eventType.startsWith("repair."),
    )
      ? []
      : ["- none"]),
    "",
    "## Cache hit / miss",
    "",
    ...(result.cacheEvents.length > 0
      ? result.cacheEvents.map(
          (event) =>
            `- ${event.occurredAt} ${event.eventType} stage=${redactObservabilityText(event.stage)} item=${redactObservabilityText(event.logicalItem)} key=${event.cacheKey} cost=${event.cost.amount}`,
        )
      : ["- none"]),
    "",
    "## HumanDecision / approval epoch",
    "",
    ...events
      .filter(
        (event) =>
          event.eventType === "human-decision.recorded" || event.eventType === "approval.blocked",
      )
      .map(
        (event) =>
          `- ${event.occurredAt} ${event.eventType} decisionId=${redactObservabilityText(event.decisionId ?? "unavailable")} epoch=${event.approvalEpoch}`,
      ),
    ...(input.state
      ? Object.entries(input.state.approvals).map(
          ([decisionId, approval]) =>
            `- state decisionId=${redactObservabilityText(decisionId)} gate=${approval.gate ?? "unavailable"} status=${approval.status} epoch=${approval.approvalEpoch ?? "unavailable"}`,
        )
      : []),
    ...(events.some(
      (event) =>
        event.eventType === "human-decision.recorded" || event.eventType === "approval.blocked",
    ) ||
    (input.state && Object.keys(input.state.approvals).length > 0)
      ? []
      : ["- none"]),
    "",
    "## Usage / cost availability",
    "",
    ...reportUsage(events),
    ...reportUsageSummary(events, result.cacheEvents),
    "",
    "## Failures / escalations",
    "",
    ...events
      .filter(
        (event) =>
          event.eventType === "execution.failed" ||
          event.eventType === "observability.degraded" ||
          event.eventType === "approval.blocked",
      )
      .map(
        (event) =>
          `- ${event.occurredAt} ${event.eventType}: ${redactObservabilityText(event.error?.message ?? event.decision?.summary ?? "unavailable")}`,
      ),
    ...(input.state?.haltReason
      ? [`- state haltReason: ${redactObservabilityText(input.state.haltReason)}`]
      : []),
    ...(events.some(
      (event) =>
        event.eventType === "execution.failed" ||
        event.eventType === "observability.degraded" ||
        event.eventType === "approval.blocked",
    ) || input.state?.haltReason
      ? []
      : ["- none"]),
    "",
    "## Final observability status",
    "",
    `- status: ${result.status}`,
    `- approval allowed: ${result.approvalAllowed ? "yes" : "no"}`,
    `- reasons: ${result.reasons.length > 0 ? result.reasons.map(redactObservabilityText).join("; ") : "none"}`,
    `- warnings: ${result.warnings.length > 0 ? result.warnings.map(redactObservabilityText).join("; ") : "none"}`,
    "",
  ];
  const report = reportLines.join("\n");
  return {
    ...result,
    report,
    reportSha256: crypto.createHash("sha256").update(report, "utf8").digest("hex"),
    reportPath: null,
  };
};

export const buildRunReport = generateRunReport;
export const renderRunReport = (input: RunReportInput): string => generateRunReport(input).report;

export const writeRunReport = (input: RunReportInput & {repoRoot: string}): RunReportResult => {
  const generated = generateRunReport(input);
  const reportPath =
    input.reportPath ??
    `content/${input.episodeId ?? input.state?.episodeId ?? "unknown"}/observability/run-report.md`;
  const absolute = path.resolve(input.repoRoot, reportPath);
  const relative = path.relative(path.resolve(input.repoRoot), absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("RUN_REPORT_PATH_ESCAPES_REPOSITORY");
  }
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  const temporary = `${absolute}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, generated.report, "utf8");
    fs.renameSync(temporary, absolute);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {force: true});
  }
  return {...generated, reportPath};
};

export const supportedObservabilityProductionStages: readonly ProductionStageName[] =
  productionStageNames;

// Keep the checkpoint schema available from the orchestration barrel for callers that only need
// to construct a strict event fixture.
export {checkpointReferenceSchema};
