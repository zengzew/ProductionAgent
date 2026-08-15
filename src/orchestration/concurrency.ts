import crypto from "node:crypto";
import {AsyncLocalStorage} from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import concurrencyFile from "../../config/concurrency.json";
import {createRuntimeIdentity, episodeIdSchema, type RuntimeIdentity} from "./identity";
import {stableJson} from "./stable-json";

const admissionSchema = z.enum(["wait", "reject"]);

export const concurrencyConfigSchema = z
  .object({
    schemaVersion: z.literal("concurrency-config-v1"),
    global: z
      .object({
        maxConcurrentRuns: z.number().int().positive(),
        admission: admissionSchema,
        pollIntervalMs: z.number().int().positive(),
        waitTimeoutMs: z.number().int().positive(),
      })
      .strict(),
    episodeLock: z
      .object({
        admission: admissionSchema,
        staleAfterMs: z.number().int().positive(),
        heartbeatIntervalMs: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.episodeLock.heartbeatIntervalMs >= value.episodeLock.staleAfterMs) {
      context.addIssue({
        code: "custom",
        path: ["episodeLock", "heartbeatIntervalMs"],
        message: "heartbeatIntervalMs must be smaller than staleAfterMs",
      });
    }
  });

export type ConcurrencyConfig = z.infer<typeof concurrencyConfigSchema>;

export const defaultConcurrencyConfig = concurrencyConfigSchema.parse(concurrencyFile);

type ControlledOrchestrationContext = {
  repoRoot: string;
  identity: RuntimeIdentity;
  config: ConcurrencyConfig;
  slot: LeaseHandle;
  episode: LeaseHandle;
};

const controlledOrchestrationContext = new AsyncLocalStorage<ControlledOrchestrationContext>();

const sameRuntimeIdentity = (left: RuntimeIdentity, right: RuntimeIdentity): boolean =>
  left.episodeId === right.episodeId &&
  left.runId === right.runId &&
  left.threadId === right.threadId &&
  left.traceId === right.traceId;

const positiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`CONCURRENCY_CONFIG_INTEGER_INVALID:${value}`);
  }
  return parsed;
};

export const resolveConcurrencyConfig = (
  input: {
    config?: Partial<ConcurrencyConfig> & {
      global?: Partial<ConcurrencyConfig["global"]>;
      episodeLock?: Partial<ConcurrencyConfig["episodeLock"]>;
    };
    env?: NodeJS.ProcessEnv;
  } = {},
): ConcurrencyConfig => {
  const env = input.env ?? process.env;
  const configured = input.config ?? {};
  return concurrencyConfigSchema.parse({
    ...defaultConcurrencyConfig,
    ...configured,
    global: {
      ...defaultConcurrencyConfig.global,
      ...configured.global,
      ...(env.ORCHESTRATION_MAX_CONCURRENT_RUNS
        ? {maxConcurrentRuns: positiveInteger(env.ORCHESTRATION_MAX_CONCURRENT_RUNS, 1)}
        : {}),
      ...(env.ORCHESTRATION_CONCURRENCY_ADMISSION
        ? {admission: env.ORCHESTRATION_CONCURRENCY_ADMISSION}
        : {}),
      ...(env.ORCHESTRATION_CONCURRENCY_POLL_MS
        ? {pollIntervalMs: positiveInteger(env.ORCHESTRATION_CONCURRENCY_POLL_MS, 1)}
        : {}),
      ...(env.ORCHESTRATION_CONCURRENCY_WAIT_TIMEOUT_MS
        ? {waitTimeoutMs: positiveInteger(env.ORCHESTRATION_CONCURRENCY_WAIT_TIMEOUT_MS, 1)}
        : {}),
    },
    episodeLock: {
      ...defaultConcurrencyConfig.episodeLock,
      ...configured.episodeLock,
      ...(env.ORCHESTRATION_EPISODE_LOCK_ADMISSION
        ? {admission: env.ORCHESTRATION_EPISODE_LOCK_ADMISSION}
        : {}),
      ...(env.ORCHESTRATION_LOCK_STALE_MS
        ? {staleAfterMs: positiveInteger(env.ORCHESTRATION_LOCK_STALE_MS, 1)}
        : {}),
      ...(env.ORCHESTRATION_LOCK_HEARTBEAT_MS
        ? {heartbeatIntervalMs: positiveInteger(env.ORCHESTRATION_LOCK_HEARTBEAT_MS, 1)}
        : {}),
    },
  });
};

const concurrencyEventTypeSchema = z.enum([
  "lock.acquired",
  "lock.released",
  "lock.contention",
  "lock.stale-recovery",
  "concurrency.queued",
  "concurrency.admitted",
  "concurrency.rejected",
]);

const leaseOwnerSchema = z
  .object({
    episodeId: episodeIdSchema,
    runId: z.string().min(1),
    acquiredAt: z.string().datetime({offset: true}),
  })
  .strict();

export const concurrencyEventSchema = z
  .object({
    schemaVersion: z.literal("orchestration-concurrency-event-v1"),
    eventId: z.string().regex(/^[a-f0-9]{64}$/u),
    eventType: concurrencyEventTypeSchema,
    occurredAt: z.string().datetime({offset: true}),
    episodeId: episodeIdSchema,
    runId: z.string().min(1),
    threadId: z.string().min(1),
    traceId: z.string().min(1),
    executionId: z.string().min(1),
    status: z.enum(["succeeded", "waiting", "failed", "recovered"]),
    queueMs: z.number().int().nonnegative().nullable(),
    reason: z.string().min(1).max(500),
    lockOwner: leaseOwnerSchema.optional(),
    recoveredOwner: leaseOwnerSchema.optional(),
    slotId: z.string().min(1).optional(),
    concurrencyLimit: z.number().int().positive().optional(),
    activeCount: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.lockOwner && value.lockOwner.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["lockOwner"],
        message: "lock owner episode mismatch",
      });
    }
    if (value.recoveredOwner && value.recoveredOwner.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["recoveredOwner"],
        message: "recovered owner episode mismatch",
      });
    }
  });

export type ConcurrencyEvent = z.infer<typeof concurrencyEventSchema>;
export type ConcurrencyEventSink = (event: ConcurrencyEvent) => void;

const redactedReason = (value: string): string => {
  const output = value
    .replace(/Bearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(
      /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*[:=]\s*[^\s,;]+/giu,
      "[REDACTED]",
    );
  return output.length <= 500 ? output : `${output.slice(0, 497)}...`;
};

const eventIdFor = (event: Omit<ConcurrencyEvent, "eventId">): string =>
  crypto.createHash("sha256").update(stableJson(event), "utf8").digest("hex");

export const createConcurrencyEvent = (input: {
  eventType: ConcurrencyEvent["eventType"];
  identity: RuntimeIdentity;
  executionId?: string;
  status: ConcurrencyEvent["status"];
  reason: string;
  queueMs?: number | null;
  lockOwner?: ConcurrencyEvent["lockOwner"];
  recoveredOwner?: ConcurrencyEvent["recoveredOwner"];
  slotId?: string;
  concurrencyLimit?: number;
  activeCount?: number;
  occurredAt?: string;
}): ConcurrencyEvent => {
  const withoutId = {
    schemaVersion: "orchestration-concurrency-event-v1" as const,
    eventType: input.eventType,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    episodeId: input.identity.episodeId,
    runId: input.identity.runId,
    threadId: input.identity.threadId,
    traceId: input.identity.traceId,
    executionId: input.executionId ?? `${input.identity.runId}:orchestration-concurrency`,
    status: input.status,
    queueMs: input.queueMs ?? null,
    reason: redactedReason(input.reason),
    ...(input.lockOwner ? {lockOwner: input.lockOwner} : {}),
    ...(input.recoveredOwner ? {recoveredOwner: input.recoveredOwner} : {}),
    ...(input.slotId ? {slotId: input.slotId} : {}),
    ...(input.concurrencyLimit !== undefined ? {concurrencyLimit: input.concurrencyLimit} : {}),
    ...(input.activeCount !== undefined ? {activeCount: input.activeCount} : {}),
  } satisfies Omit<ConcurrencyEvent, "eventId">;
  return concurrencyEventSchema.parse({...withoutId, eventId: eventIdFor(withoutId)});
};

const eventPathFor = (repoRoot: string, episodeId: string): string => {
  const root = path.resolve(repoRoot);
  const filePath = path.resolve(
    root,
    `content/${episodeId}/observability/concurrency-events.jsonl`,
  );
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("CONCURRENCY_EVENT_PATH_ESCAPES_REPOSITORY");
  }
  return filePath;
};

export const appendConcurrencyEvent = (filePath: string, rawEvent: ConcurrencyEvent): void => {
  const event = concurrencyEventSchema.parse(rawEvent);
  const withoutId = {...event};
  Reflect.deleteProperty(withoutId, "eventId");
  if (eventIdFor(withoutId) !== event.eventId)
    throw new Error(`CONCURRENCY_EVENT_TAMPERED:${event.eventId}`);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean)) {
      const existing = concurrencyEventSchema.parse(JSON.parse(line) as unknown);
      if (existing.eventId !== event.eventId) continue;
      if (stableJson(existing) === stableJson(event)) return;
      throw new Error(`CONCURRENCY_EVENT_DUPLICATE_CONFLICT:${event.eventId}`);
    }
  }
  fs.appendFileSync(filePath, `${stableJson(event)}\n`, "utf8");
};

export const createConcurrencyEventSink =
  (input: {repoRoot: string; episodeId?: string}): ConcurrencyEventSink =>
  (event) => {
    if (input.episodeId && input.episodeId !== event.episodeId) {
      throw new Error(`CONCURRENCY_EVENT_EPISODE_MISMATCH:${event.episodeId}:${input.episodeId}`);
    }
    appendConcurrencyEvent(eventPathFor(input.repoRoot, event.episodeId), event);
  };

export const readConcurrencyEvents = (filePath: string): ConcurrencyEvent[] => {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => concurrencyEventSchema.parse(JSON.parse(line) as unknown));
};

export const concurrencyEventPath = eventPathFor;

const leaseRecordSchema = z
  .object({
    schemaVersion: z.literal("orchestration-lease-v1"),
    episodeId: episodeIdSchema,
    runId: z.string().min(1),
    threadId: z.string().min(1),
    traceId: z.string().min(1),
    acquiredAt: z.string().datetime({offset: true}),
    heartbeatAt: z.string().datetime({offset: true}),
    ownerPid: z.number().int().positive(),
    token: z.string().regex(/^[a-f0-9]{32}$/u),
    slotId: z.string().min(1).optional(),
  })
  .strict();

type LeaseRecord = z.infer<typeof leaseRecordSchema>;

export type LeaseHandle = {
  readonly identity: RuntimeIdentity;
  readonly acquiredAt: string;
  readonly path: string;
  readonly slotId?: string;
  heartbeat: () => Promise<void>;
  release: () => Promise<void>;
};

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const releaseMutexFile = (descriptor: number, mutexPath: string): void => {
  fs.closeSync(descriptor);
  try {
    fs.unlinkSync(mutexPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const ownerFromRecord = (record: LeaseRecord): ConcurrencyEvent["lockOwner"] => ({
  episodeId: record.episodeId,
  runId: record.runId,
  acquiredAt: record.acquiredAt,
});

const ownerIsAlive = (pid: number): boolean => {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const staleLease = (input: {
  record?: LeaseRecord;
  filePath: string;
  nowMs: number;
  staleAfterMs: number;
}): boolean => {
  if (!input.record) {
    try {
      return input.nowMs - fs.statSync(input.filePath).mtimeMs > input.staleAfterMs;
    } catch {
      return false;
    }
  }
  const heartbeatMs = Date.parse(input.record.heartbeatAt);
  return (
    input.nowMs - Math.max(heartbeatMs, Date.parse(input.record.acquiredAt)) > input.staleAfterMs &&
    !ownerIsAlive(input.record.ownerPid)
  );
};

const readLease = (filePath: string): LeaseRecord | undefined => {
  try {
    return leaseRecordSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  } catch {
    return undefined;
  }
};

const writeNewLease = (filePath: string, record: LeaseRecord): boolean => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  let descriptor: number;
  try {
    descriptor = fs.openSync(filePath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, `${stableJson(record)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return true;
};

const replaceLease = (filePath: string, expectedToken: string, record: LeaseRecord): void => {
  const current = readLease(filePath);
  if (!current || current.token !== expectedToken) throw new Error("ORCHESTRATION_LEASE_LOST");
  const temporary = `${filePath}.${process.pid}.${record.token}.tmp`;
  fs.writeFileSync(temporary, `${stableJson(record)}\n`, {encoding: "utf8", mode: 0o600});
  try {
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {force: true});
  }
};

const releaseLease = (filePath: string, token: string): void => {
  const current = readLease(filePath);
  if (!current || current.token !== token) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

type LeaseManagerOptions = {
  repoRoot: string;
  config?: ConcurrencyConfig;
  eventSink?: ConcurrencyEventSink;
  now?: () => number;
  pid?: number;
};

abstract class BaseLeaseManager {
  protected readonly root: string;
  protected readonly config: ConcurrencyConfig;
  protected readonly eventSink: ConcurrencyEventSink;
  protected readonly now: () => number;
  protected readonly pid: number;

  protected constructor(input: LeaseManagerOptions) {
    this.root = path.resolve(input.repoRoot);
    this.config = input.config ?? defaultConcurrencyConfig;
    this.eventSink = input.eventSink ?? (() => undefined);
    this.now = input.now ?? (() => Date.now());
    this.pid = input.pid ?? process.pid;
  }

  protected emit(input: Parameters<typeof createConcurrencyEvent>[0]): void {
    this.eventSink(createConcurrencyEvent(input));
  }

  protected makeRecord(identity: RuntimeIdentity, slotId?: string): LeaseRecord {
    const now = new Date(this.now()).toISOString();
    return leaseRecordSchema.parse({
      schemaVersion: "orchestration-lease-v1",
      ...identity,
      acquiredAt: now,
      heartbeatAt: now,
      ownerPid: this.pid,
      token: crypto.randomBytes(16).toString("hex"),
      ...(slotId ? {slotId} : {}),
    });
  }

  protected createHandle(record: LeaseRecord, filePath: string): LeaseHandle {
    let released = false;
    return {
      identity: createRuntimeIdentity(record),
      acquiredAt: record.acquiredAt,
      path: filePath,
      ...(record.slotId ? {slotId: record.slotId} : {}),
      heartbeat: async () => {
        if (released) return;
        const heartbeatAt = new Date(this.now()).toISOString();
        replaceLease(filePath, record.token, {...record, heartbeatAt});
        record.heartbeatAt = heartbeatAt;
      },
      release: async () => {
        if (released) return;
        released = true;
        releaseLease(filePath, record.token);
      },
    };
  }

  protected async waitForLease(input: {
    identity: RuntimeIdentity;
    filePath: string;
    create: () => LeaseRecord;
    description: string;
    admission: "wait" | "reject";
    eventType: "lock" | "concurrency";
    slotId?: string;
    limit?: number;
    activeCount?: number;
  }): Promise<LeaseHandle> {
    const started = this.now();
    let queued = false;
    while (true) {
      const record = input.create();
      if (writeNewLease(input.filePath, record)) {
        const queueMs = this.now() - started;
        this.emit({
          eventType: input.eventType === "lock" ? "lock.acquired" : "concurrency.admitted",
          identity: input.identity,
          status: "succeeded",
          reason: `${input.description} admitted`,
          queueMs,
          ...(input.slotId ? {slotId: input.slotId} : {}),
          ...(input.limit !== undefined ? {concurrencyLimit: input.limit} : {}),
          ...(input.activeCount !== undefined ? {activeCount: input.activeCount} : {}),
          ...(input.eventType === "lock" ? {lockOwner: ownerFromRecord(record)} : {}),
        });
        return this.createHandle(record, input.filePath);
      }

      const current = readLease(input.filePath);
      if (
        staleLease({
          record: current,
          filePath: input.filePath,
          nowMs: this.now(),
          staleAfterMs: this.config.episodeLock.staleAfterMs,
        })
      ) {
        const recoveredOwner = current ? ownerFromRecord(current) : undefined;
        const before = current?.token;
        const latest = readLease(input.filePath);
        if ((!before || latest?.token === before) && fs.existsSync(input.filePath)) {
          try {
            fs.unlinkSync(input.filePath);
            this.emit({
              eventType: "lock.stale-recovery",
              identity: input.identity,
              status: "recovered",
              reason: `${input.description} stale lease recovered`,
              queueMs: this.now() - started,
              ...(recoveredOwner ? {recoveredOwner} : {}),
              ...(input.slotId ? {slotId: input.slotId} : {}),
            });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          continue;
        }
      }

      if (!queued) {
        queued = true;
        this.emit({
          eventType: input.eventType === "lock" ? "lock.contention" : "concurrency.queued",
          identity: input.identity,
          status: "waiting",
          reason: `${input.description} is held`,
          queueMs: 0,
          ...(input.slotId ? {slotId: input.slotId} : {}),
          ...(input.limit !== undefined ? {concurrencyLimit: input.limit} : {}),
          ...(input.activeCount !== undefined ? {activeCount: input.activeCount} : {}),
          ...(input.eventType === "lock" && current ? {lockOwner: ownerFromRecord(current)} : {}),
        });
      }
      if (input.admission === "reject") {
        this.emit({
          eventType: input.eventType === "lock" ? "lock.contention" : "concurrency.rejected",
          identity: input.identity,
          status: "failed",
          reason: `${input.description} rejected while held`,
          queueMs: this.now() - started,
          ...(input.slotId ? {slotId: input.slotId} : {}),
          ...(input.limit !== undefined ? {concurrencyLimit: input.limit} : {}),
          ...(input.activeCount !== undefined ? {activeCount: input.activeCount} : {}),
          ...(input.eventType === "lock" && current ? {lockOwner: ownerFromRecord(current)} : {}),
        });
        throw new Error(
          input.eventType === "lock" ? "EPISODE_LOCK_HELD" : "CONCURRENCY_LIMIT_REACHED",
        );
      }
      if (this.now() - started >= this.config.global.waitTimeoutMs) {
        this.emit({
          eventType: input.eventType === "lock" ? "lock.contention" : "concurrency.rejected",
          identity: input.identity,
          status: "failed",
          reason: `${input.description} wait timeout`,
          queueMs: this.now() - started,
          ...(input.slotId ? {slotId: input.slotId} : {}),
          ...(input.limit !== undefined ? {concurrencyLimit: input.limit} : {}),
          ...(input.activeCount !== undefined ? {activeCount: input.activeCount} : {}),
        });
        throw new Error(
          input.eventType === "lock" ? "EPISODE_LOCK_WAIT_TIMEOUT" : "CONCURRENCY_WAIT_TIMEOUT",
        );
      }
      await sleep(this.config.global.pollIntervalMs);
    }
  }
}

export const episodeLockPath = (repoRoot: string, episodeId: string): string => {
  const parsedEpisodeId = episodeIdSchema.parse(episodeId);
  return path.resolve(repoRoot, ".orchestration", "locks", `${parsedEpisodeId}.json`);
};

export const readEpisodeLock = (repoRoot: string, episodeId: string): LeaseRecord | undefined =>
  readLease(episodeLockPath(repoRoot, episodeId));

export class EpisodeLockManager extends BaseLeaseManager {
  constructor(input: LeaseManagerOptions) {
    super(input);
  }

  acquire(identity: RuntimeIdentity): Promise<LeaseHandle> {
    const filePath = episodeLockPath(this.root, identity.episodeId);
    return this.waitForLease({
      identity,
      filePath,
      create: () => this.makeRecord(identity),
      description: `episode ${identity.episodeId}`,
      admission: this.config.episodeLock.admission,
      eventType: "lock",
    });
  }
}

export const concurrencySlotPath = (repoRoot: string, slotId: string): string =>
  path.resolve(repoRoot, ".orchestration", "concurrency", `${slotId}.json`);

export class GlobalConcurrencyController extends BaseLeaseManager {
  constructor(input: LeaseManagerOptions) {
    super(input);
  }

  async acquire(identity: RuntimeIdentity): Promise<LeaseHandle> {
    const started = this.now();
    let queued = false;
    while (true) {
      for (let index = 0; index < this.config.global.maxConcurrentRuns; index += 1) {
        const slotId = `slot-${index}`;
        const filePath = concurrencySlotPath(this.root, slotId);
        const record = this.makeRecord(identity, slotId);
        if (writeNewLease(filePath, record)) {
          this.emit({
            eventType: "concurrency.admitted",
            identity,
            status: "succeeded",
            reason: `global concurrency slot ${slotId} admitted`,
            queueMs: this.now() - started,
            slotId,
            concurrencyLimit: this.config.global.maxConcurrentRuns,
            activeCount: this.activeSlotCount(),
          });
          return this.createHandle(record, filePath);
        }
        const current = readLease(filePath);
        if (
          staleLease({
            record: current,
            filePath,
            nowMs: this.now(),
            staleAfterMs: this.config.episodeLock.staleAfterMs,
          })
        ) {
          const before = current?.token;
          const latest = readLease(filePath);
          if ((!before || latest?.token === before) && fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              this.emit({
                eventType: "lock.stale-recovery",
                identity,
                status: "recovered",
                reason: `global concurrency slot ${slotId} stale lease recovered`,
                queueMs: this.now() - started,
                slotId,
                concurrencyLimit: this.config.global.maxConcurrentRuns,
                ...(current ? {recoveredOwner: ownerFromRecord(current)} : {}),
              });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
          }
        }
      }
      if (!queued) {
        queued = true;
        this.emit({
          eventType: "concurrency.queued",
          identity,
          status: "waiting",
          reason: "global concurrency cap is full",
          queueMs: 0,
          concurrencyLimit: this.config.global.maxConcurrentRuns,
          activeCount: this.activeSlotCount(),
        });
      }
      if (this.config.global.admission === "reject") {
        this.emit({
          eventType: "concurrency.rejected",
          identity,
          status: "failed",
          reason: "global concurrency cap is full",
          queueMs: this.now() - started,
          concurrencyLimit: this.config.global.maxConcurrentRuns,
          activeCount: this.activeSlotCount(),
        });
        throw new Error("CONCURRENCY_LIMIT_REACHED");
      }
      if (this.now() - started >= this.config.global.waitTimeoutMs) {
        this.emit({
          eventType: "concurrency.rejected",
          identity,
          status: "failed",
          reason: "global concurrency wait timeout",
          queueMs: this.now() - started,
          concurrencyLimit: this.config.global.maxConcurrentRuns,
          activeCount: this.activeSlotCount(),
        });
        throw new Error("CONCURRENCY_WAIT_TIMEOUT");
      }
      await sleep(this.config.global.pollIntervalMs);
    }
  }

  activeSlotCount(): number {
    let count = 0;
    for (let index = 0; index < this.config.global.maxConcurrentRuns; index += 1) {
      if (fs.existsSync(concurrencySlotPath(this.root, `slot-${index}`))) count += 1;
    }
    return count;
  }
}

export const withControlledOrchestrationRun = async <T>(input: {
  repoRoot: string;
  identity: RuntimeIdentity;
  config?: ConcurrencyConfig;
  eventSink?: ConcurrencyEventSink;
  run: () => Promise<T> | T;
}): Promise<T> => {
  const repoRoot = path.resolve(input.repoRoot);
  const config = input.config ?? defaultConcurrencyConfig;
  const active = controlledOrchestrationContext.getStore();
  if (
    active &&
    active.repoRoot === repoRoot &&
    sameRuntimeIdentity(active.identity, input.identity)
  ) {
    // Foundation graphs commonly compose a production graph or pipeline as a node. The
    // outermost run owns the global slot, episode lease, heartbeat and release; nested
    // composition must not acquire the same episode lease again.
    return await input.run();
  }
  const eventSink = input.eventSink ?? createConcurrencyEventSink({repoRoot: input.repoRoot});
  const global = new GlobalConcurrencyController({
    repoRoot,
    config,
    eventSink,
  });
  const episode = new EpisodeLockManager({
    repoRoot,
    config,
    eventSink,
  });
  const slot = await global.acquire(input.identity);
  let lock: LeaseHandle | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    lock = await episode.acquire(input.identity);
    heartbeat = setInterval(() => {
      void Promise.all([slot.heartbeat(), lock!.heartbeat()]).catch(() => undefined);
    }, config.episodeLock.heartbeatIntervalMs);
    heartbeat.unref?.();
    return await controlledOrchestrationContext.run(
      {repoRoot, identity: input.identity, config, slot, episode: lock},
      input.run,
    );
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await lock?.release();
    await slot.release();
    if (lock) {
      eventSink(
        createConcurrencyEvent({
          eventType: "lock.released",
          identity: input.identity,
          status: "succeeded",
          reason: "episode lock released",
          lockOwner: {
            episodeId: input.identity.episodeId,
            runId: input.identity.runId,
            acquiredAt: lock.acquiredAt,
          },
        }),
      );
    }
  }
};

export const withOptimisticFileCasSync = <T>(input: {
  root: string;
  key: string;
  run: () => T;
}): T => {
  const mutexKey = crypto.createHash("sha256").update(input.key, "utf8").digest("hex");
  const mutexPath = path.resolve(input.root, ".orchestration", "cas", `${mutexKey}.lock`);
  fs.mkdirSync(path.dirname(mutexPath), {recursive: true});
  let descriptor: number;
  try {
    descriptor = fs.openSync(mutexPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("OPTIMISTIC_CONCURRENCY_MUTEX_BUSY", {cause: error});
    }
    throw error;
  }
  let value: T;
  try {
    fs.writeFileSync(descriptor, `${process.pid}\n`, "utf8");
    value = input.run();
  } catch (error) {
    try {
      releaseMutexFile(descriptor, mutexPath);
    } catch (cleanupError) {
      throw new Error("OPTIMISTIC_CONCURRENCY_MUTEX_CLEANUP_FAILED", {cause: cleanupError});
    }
    throw error;
  }
  releaseMutexFile(descriptor, mutexPath);
  return value;
};

export const withOptimisticFileCas = async <T>(input: {
  root: string;
  key: string;
  run: () => Promise<T> | T;
}): Promise<T> => {
  const mutexKey = crypto.createHash("sha256").update(input.key, "utf8").digest("hex");
  const mutexPath = path.resolve(input.root, ".orchestration", "cas", `${mutexKey}.lock`);
  fs.mkdirSync(path.dirname(mutexPath), {recursive: true});
  let descriptor: number;
  try {
    descriptor = fs.openSync(mutexPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("OPTIMISTIC_CONCURRENCY_MUTEX_BUSY", {cause: error});
    }
    throw error;
  }
  let value: T;
  try {
    fs.writeFileSync(descriptor, `${process.pid}\n`, "utf8");
    value = await input.run();
  } catch (error) {
    try {
      releaseMutexFile(descriptor, mutexPath);
    } catch (cleanupError) {
      throw new Error("OPTIMISTIC_CONCURRENCY_MUTEX_CLEANUP_FAILED", {cause: cleanupError});
    }
    throw error;
  }
  releaseMutexFile(descriptor, mutexPath);
  return value;
};

export const assertRuntimeIdentityForConcurrency = (identity: RuntimeIdentity): RuntimeIdentity =>
  createRuntimeIdentity(identity);
