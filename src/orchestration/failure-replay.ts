import {z} from "zod";

export const failureClasses = [
  "transient-api",
  "rate-limit",
  "authentication",
  "invalid-output",
  "stale-input",
  "tooling",
  "checkpoint",
  "unknown",
] as const;

export const failureClassSchema = z.enum(failureClasses);

export const failureDescriptorSchema = z
  .object({
    code: z.string().min(1),
    class: failureClassSchema,
    retryable: z.boolean(),
    message: z.string().min(1),
    retryAfterMs: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();

export type FailureClass = z.infer<typeof failureClassSchema>;
export type FailureDescriptor = z.infer<typeof failureDescriptorSchema>;

export const MAX_RETRY_DELAY_MS = 60_000 as const;

export const boundedRetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().positive(),
    baseDelayMs: z.number().int().nonnegative(),
    maxDelayMs: z.number().int().nonnegative().max(MAX_RETRY_DELAY_MS),
    maxContractRepairs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.baseDelayMs > value.maxDelayMs) {
      context.addIssue({
        code: "custom",
        path: ["baseDelayMs"],
        message: "baseDelayMs must not exceed maxDelayMs",
      });
    }
  });

export type BoundedRetryPolicy = z.infer<typeof boundedRetryPolicySchema>;

export const defaultBoundedRetryPolicy = boundedRetryPolicySchema.parse({
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: MAX_RETRY_DELAY_MS,
  maxContractRepairs: 1,
});

export const resolveBoundedRetryPolicy = (
  policy: Partial<BoundedRetryPolicy> = {},
): BoundedRetryPolicy => boundedRetryPolicySchema.parse({...defaultBoundedRetryPolicy, ...policy});

export type FailureClock = {
  now: () => string;
  sleep: (milliseconds: number) => Promise<void>;
};

export type FakeClock = FailureClock & {
  advance: (milliseconds: number) => void;
  readonly delays: readonly number[];
};

export const createFakeClock = (startAt = "2026-08-14T00:00:00.000Z"): FakeClock => {
  let current = Date.parse(startAt);
  if (!Number.isFinite(current)) throw new Error("FAKE_CLOCK_START_INVALID");
  const delays: number[] = [];
  return {
    now: () => new Date(current).toISOString(),
    sleep: async (milliseconds) => {
      if (!Number.isInteger(milliseconds) || milliseconds < 0) {
        throw new Error("FAKE_CLOCK_DELAY_INVALID");
      }
      delays.push(milliseconds);
      current += milliseconds;
    },
    advance: (milliseconds) => {
      if (!Number.isInteger(milliseconds) || milliseconds < 0) {
        throw new Error("FAKE_CLOCK_ADVANCE_INVALID");
      }
      current += milliseconds;
    },
    delays,
  };
};

export class FailureSignal extends Error {
  readonly failure: FailureDescriptor;

  constructor(failure: FailureDescriptor) {
    const parsed = failureDescriptorSchema.parse(failure);
    super(parsed.message);
    this.name = "FailureSignal";
    this.failure = parsed;
  }
}

export class InjectedFailure extends FailureSignal {
  readonly point: FailureInjectionPoint;

  constructor(point: FailureInjectionPoint, failure: FailureDescriptor) {
    super(failure);
    this.name = "InjectedFailure";
    this.point = point;
  }
}

export const failureInjectionPoints = [
  "provider",
  "stage",
  "contract",
  "artifact",
  "checkpoint-before",
  "checkpoint-after",
  "event-log",
] as const;

export const failureInjectionPointSchema = z.enum(failureInjectionPoints);
export type FailureInjectionPoint = z.infer<typeof failureInjectionPointSchema>;

export type FailureInjectionSpec = {
  point: FailureInjectionPoint;
  failure: FailureDescriptor;
  times?: number;
};

/** Deterministic, call-counted failures for tests and local recovery simulations. */
export class DeterministicFailureInjector {
  private readonly remaining: Map<FailureInjectionPoint, number>;
  private readonly failures: Map<FailureInjectionPoint, FailureDescriptor>;
  private readonly callCounts = new Map<FailureInjectionPoint, number>();

  constructor(specs: readonly FailureInjectionSpec[]) {
    this.remaining = new Map();
    this.failures = new Map();
    for (const spec of specs) {
      const point = failureInjectionPointSchema.parse(spec.point);
      const times = spec.times ?? 1;
      if (!Number.isInteger(times) || times <= 0)
        throw new Error("FAILURE_INJECTION_TIMES_INVALID");
      if (this.remaining.has(point)) throw new Error(`FAILURE_INJECTION_DUPLICATE:${point}`);
      this.remaining.set(point, times);
      this.failures.set(point, failureDescriptorSchema.parse(spec.failure));
    }
  }

  hit(point: FailureInjectionPoint): void {
    const parsedPoint = failureInjectionPointSchema.parse(point);
    this.callCounts.set(parsedPoint, (this.callCounts.get(parsedPoint) ?? 0) + 1);
    const remaining = this.remaining.get(parsedPoint) ?? 0;
    if (remaining <= 0) return;
    this.remaining.set(parsedPoint, remaining - 1);
    const failure = this.failures.get(parsedPoint);
    if (!failure) throw new Error(`FAILURE_INJECTION_NOT_CONFIGURED:${parsedPoint}`);
    throw new InjectedFailure(parsedPoint, failure);
  }

  calls(point: FailureInjectionPoint): number {
    return this.callCounts.get(point) ?? 0;
  }

  remainingFailures(point: FailureInjectionPoint): number {
    return this.remaining.get(point) ?? 0;
  }
}

const descriptorFromUnknown = (error: unknown): FailureDescriptor => {
  if (error instanceof FailureSignal) return error.failure;
  if (error instanceof z.ZodError) {
    return {
      code: "CONTRACT_SCHEMA_INVALID",
      class: "invalid-output",
      retryable: false,
      message: error.message,
      retryAfterMs: null,
    };
  }
  return {
    code: "UNCLASSIFIED_FAILURE",
    class: "unknown",
    retryable: false,
    message: error instanceof Error ? error.message : String(error),
    retryAfterMs: null,
  };
};

export const retryDelayMilliseconds = (input: {
  failure: FailureDescriptor;
  failedAttempt: number;
  policy: BoundedRetryPolicy;
}): number => {
  const exponential = input.policy.baseDelayMs * 2 ** Math.max(0, input.failedAttempt - 1);
  const requested = input.failure.retryAfterMs ?? exponential;
  return Math.min(MAX_RETRY_DELAY_MS, input.policy.maxDelayMs, requested);
};

export type DeclaredProvider<T> = {
  name: string;
  run: () => T | Promise<T>;
};

export type ProviderFallbackSuccess<T> = {
  status: "SUCCEEDED";
  provider: string;
  value: T;
  failures: Array<{provider: string; failure: FailureDescriptor}>;
};

export type ProviderFallbackFailure = {
  status: "FAILED";
  failure: FailureDescriptor;
  failures: Array<{provider: string; failure: FailureDescriptor}>;
};

export type ProviderFallbackResult<T> = ProviderFallbackSuccess<T> | ProviderFallbackFailure;

/**
 * Attempts only the explicitly declared providers. Authentication, stale-input, contract, and
 * artifact failures stop the chain; a caller may opt into a narrow transient/rate-limit fallback.
 */
export const runDeclaredProviderFallback = async <T>(input: {
  providers: readonly DeclaredProvider<T>[];
  fallbackOn?: readonly FailureClass[];
}): Promise<ProviderFallbackResult<T>> => {
  if (input.providers.length === 0) throw new Error("PROVIDER_FALLBACK_CHAIN_EMPTY");
  const fallbackOn = new Set<FailureClass>(input.fallbackOn ?? ["transient-api", "rate-limit"]);
  const failures: Array<{provider: string; failure: FailureDescriptor}> = [];
  for (const provider of input.providers) {
    try {
      return {status: "SUCCEEDED", provider: provider.name, value: await provider.run(), failures};
    } catch (error) {
      const failure = descriptorFromUnknown(error);
      failures.push({provider: provider.name, failure});
      if (!fallbackOn.has(failure.class)) {
        return {status: "FAILED", failure, failures};
      }
    }
  }
  const last = failures.at(-1);
  if (!last) throw new Error("PROVIDER_FALLBACK_CHAIN_EMPTY");
  return {status: "FAILED", failure: last.failure, failures};
};

export type BoundedRetrySuccess<T> = {
  status: "SUCCEEDED";
  value: T;
  attempts: number;
  contractRepairs: number;
  delaysMs: number[];
};

export type BoundedRetryFailure = {
  status: "FAILED";
  failure: FailureDescriptor;
  attempts: number;
  contractRepairs: number;
  delaysMs: number[];
  quarantined: boolean;
};

export type BoundedRetryResult<T> = BoundedRetrySuccess<T> | BoundedRetryFailure;

/**
 * Runs a deterministic operation with an explicit total-attempt cap. Contract failures get a
 * separate, independently bounded repair allowance; authentication and stale-input failures are
 * never retried even when a malformed stub marks them retryable.
 */
export const runBoundedRetry = async <T>(input: {
  operation: (attempt: number) => T | Promise<T>;
  policy?: Partial<BoundedRetryPolicy>;
  clock?: FailureClock;
  repairContract?: (input: {
    attempt: number;
    repairNumber: number;
    failure: FailureDescriptor;
  }) => void | Promise<void>;
  onFailure?: (input: {
    attempt: number;
    failure: FailureDescriptor;
    delayMs: number;
  }) => void | Promise<void>;
}): Promise<BoundedRetryResult<T>> => {
  const policy = resolveBoundedRetryPolicy(input.policy);
  let attempts = 0;
  let contractRepairs = 0;
  const delaysMs: number[] = [];

  while (attempts < policy.maxAttempts) {
    attempts += 1;
    try {
      return {
        status: "SUCCEEDED",
        value: await input.operation(attempts),
        attempts,
        contractRepairs,
        delaysMs,
      };
    } catch (error) {
      const failure = descriptorFromUnknown(error);
      const isContractFailure = failure.class === "invalid-output";
      if (
        isContractFailure &&
        input.repairContract &&
        contractRepairs < policy.maxContractRepairs
      ) {
        contractRepairs += 1;
        try {
          await input.repairContract({attempt: attempts, repairNumber: contractRepairs, failure});
        } catch (repairError) {
          const repairFailure = descriptorFromUnknown(repairError);
          return {
            status: "FAILED",
            failure: repairFailure,
            attempts,
            contractRepairs,
            delaysMs,
            quarantined: true,
          };
        }
        continue;
      }

      const retryable =
        failure.retryable &&
        failure.class !== "authentication" &&
        failure.class !== "stale-input" &&
        !isContractFailure;
      const shouldRetry = retryable && attempts < policy.maxAttempts;
      const delayMs = shouldRetry
        ? retryDelayMilliseconds({failure, failedAttempt: attempts, policy})
        : 0;
      await input.onFailure?.({attempt: attempts, failure, delayMs});
      if (shouldRetry) {
        delaysMs.push(delayMs);
        if (input.clock) await input.clock.sleep(delayMs);
        continue;
      }
      return {
        status: "FAILED",
        failure,
        attempts,
        contractRepairs,
        delaysMs,
        quarantined: isContractFailure,
      };
    }
  }

  throw new Error("RETRY_LOOP_INTERNAL_ERROR");
};
