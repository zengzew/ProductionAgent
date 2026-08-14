import {z} from "zod";

export const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);

const runtimePartSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint === 0 || codePoint === 10 || codePoint === 13;
      }),
    {
    message: "runtime identity parts must not contain control characters",
    },
  );

export const runtimeIdentitySchema = z
  .object({
    episodeId: episodeIdSchema,
    runId: runtimePartSchema,
    threadId: runtimePartSchema,
    traceId: runtimePartSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.threadId.includes(value.episodeId)) {
      context.addIssue({
        code: "custom",
        path: ["threadId"],
        message: "threadId must explicitly contain episodeId",
      });
    }
    if (!value.traceId.includes(value.episodeId)) {
      context.addIssue({
        code: "custom",
        path: ["traceId"],
        message: "traceId must explicitly contain episodeId",
      });
    }
  });

export type RuntimeIdentity = z.infer<typeof runtimeIdentitySchema>;

export const createRuntimeIdentity = (input: {
  episodeId: string;
  runId: string;
  threadId?: string;
  traceId?: string;
}): RuntimeIdentity =>
  runtimeIdentitySchema.parse({
    episodeId: input.episodeId,
    runId: input.runId,
    threadId: input.threadId ?? input.episodeId,
    traceId: input.traceId ?? `${input.episodeId}:run:${input.runId}`,
  });

export const assertRuntimeIdentityMatches = (
  expected: RuntimeIdentity,
  actual: Partial<RuntimeIdentity> & {episodeId?: string},
): void => {
  if (actual.episodeId !== undefined && actual.episodeId !== expected.episodeId) {
    throw new Error(`RUNTIME_EPISODE_MISMATCH:${actual.episodeId}:${expected.episodeId}`);
  }
  if (actual.runId !== undefined && actual.runId !== expected.runId) {
    throw new Error(`RUNTIME_RUN_MISMATCH:${actual.runId}:${expected.runId}`);
  }
  if (actual.threadId !== undefined && actual.threadId !== expected.threadId) {
    throw new Error(`RUNTIME_THREAD_MISMATCH:${actual.threadId}:${expected.threadId}`);
  }
  if (actual.traceId !== undefined && actual.traceId !== expected.traceId) {
    throw new Error(`RUNTIME_TRACE_MISMATCH:${actual.traceId}:${expected.traceId}`);
  }
};
