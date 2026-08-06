import {z} from "zod";
import {agentNameSchema} from "./schemas/agent";
import {artifactRefSchema, type ArtifactRef} from "./schemas/artifact";

export const PRODUCTION_STATE_SCHEMA_VERSION = "production-state-v1" as const;

export const productionPhases = [
  "init",
  "research",
  "story",
  "viral",
  "script",
  "oral",
  "visual",
  "content_eval",
  "content_revision",
  "content_approval",
  "frozen",
  "production",
  "delivery_eval",
  "production_revision",
  "unfreeze_review",
  "final_approval",
  "published",
  "halted",
] as const;

export const productionPhaseSchema = z.enum(productionPhases);

const controlledDecisionSchema = z.object({
  code: z.string().min(1),
  summary: z.string().refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
    message: "decision summary must not exceed 500 UTF-8 bytes",
  }),
});

const evaluationSummarySchema = z.object({
  evaluationId: z.string().min(1),
  resultRef: artifactRefSchema,
  gate: z.enum(["pass", "warn", "fail"]),
  blockerCount: z.number().int().nonnegative(),
  issueIds: z.array(z.string().min(1)),
});

const issueSummarySchema = z.object({
  issueId: z.string().min(1),
  issueRef: artifactRefSchema,
  status: z.enum(["open", "assigned", "resolved", "wontfix", "escalated"]),
  owner: z.string().min(1),
});

const revisionSummarySchema = z.object({
  revisionId: z.string().min(1),
  artifactRef: artifactRefSchema,
});

const eventSummarySchema = z.object({
  eventId: z.string().min(1),
  executionId: z.string().min(1),
  status: z.string().min(1),
});

const budgetSchema = z.object({
  maxRoundsContent: z.number().int().nonnegative(),
  maxRoundsProduction: z.number().int().nonnegative(),
  maxRoundsPerOwner: z.number().int().nonnegative(),
  maxUnfreeze: z.number().int().nonnegative(),
  maxCostUsd: z.number().nonnegative(),
  maxWallclockSeconds: z.number().int().nonnegative(),
  spentCostUsd: z.number().nonnegative(),
  spentWallclockSeconds: z.number().int().nonnegative(),
  roundsUsed: z.record(z.string(), z.number().int().nonnegative()),
  unfreezeUsed: z.number().int().nonnegative(),
});

const approvalSummarySchema = z.object({
  decisionRef: artifactRefSchema,
  status: z.enum(["pending", "approved", "rejected"]),
});

export const productionStateSchema = z.object({
  schemaVersion: z.literal(PRODUCTION_STATE_SCHEMA_VERSION),
  episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
  runId: z.string().min(1),
  phase: productionPhaseSchema,
  round: z.number().int().nonnegative(),
  artifacts: z.record(z.string(), artifactRefSchema),
  best: z.record(z.string(), artifactRefSchema),
  evaluations: z.array(evaluationSummarySchema),
  issues: z.record(z.string(), issueSummarySchema),
  gates: z.record(z.string(), z.enum(["pass", "warn", "fail"])),
  revisionLog: z.array(revisionSummarySchema),
  events: z.array(eventSummarySchema),
  budget: budgetSchema,
  approvals: z.record(z.string(), approvalSummarySchema),
  contentManifestRef: artifactRefSchema.optional(),
  strategyLevel: z.number().int().min(0).max(4),
  completedAgents: z.array(agentNameSchema),
  attempts: z.record(z.string(), z.number().int().nonnegative()),
  decisions: z.record(z.string(), controlledDecisionSchema),
  haltReason: z.string().max(500).optional(),
});

export type ProductionState = z.infer<typeof productionStateSchema>;
export type ProductionStateUpdate = Partial<ProductionState>;

const forbiddenBodyKeys = new Set([
  "body",
  "content",
  "narration",
  "transcript",
  "captions",
  "claimLedger",
  "sourcePassage",
]);

export const assertReferenceOnlyState = (value: unknown): ProductionState => {
  const state = productionStateSchema.parse(value);

  const scan = (current: unknown, trail: string[]): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => scan(item, [...trail, String(index)]));
      return;
    }
    if (!current || typeof current !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenBodyKeys.has(key)) {
        throw new Error(
          `ProductionState contains forbidden artifact body field: ${[...trail, key].join(".")}`,
        );
      }
      scan(child, [...trail, key]);
    }
  };

  scan(value, []);
  return state;
};

export const createInitialProductionState = (input: {
  episodeId: string;
  runId: string;
  artifacts?: Record<string, ArtifactRef>;
}): ProductionState =>
  assertReferenceOnlyState({
    schemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
    episodeId: input.episodeId,
    runId: input.runId,
    phase: "init",
    round: 0,
    artifacts: input.artifacts ?? {},
    best: {},
    evaluations: [],
    issues: {},
    gates: {},
    revisionLog: [],
    events: [],
    budget: {
      maxRoundsContent: 0,
      maxRoundsProduction: 0,
      maxRoundsPerOwner: 0,
      maxUnfreeze: 0,
      maxCostUsd: 0,
      maxWallclockSeconds: 0,
      spentCostUsd: 0,
      spentWallclockSeconds: 0,
      roundsUsed: {},
      unfreezeUsed: 0,
    },
    approvals: {},
    strategyLevel: 0,
    completedAgents: [],
    attempts: {},
    decisions: {},
  });

export {
  appendDedupeBy,
  firstWriteImmutable,
  mergeArtifactRefs,
  mergeBudget,
  mergeCompletedAgents,
  mergeEvaluationSummaries,
  mergeEventSummaries,
  mergeMax,
  mergeNumberMap,
  mergeOptionalArtifactRef,
  mergeOptionalImmutable,
  mergePhase,
  mergeRevisionSummaries,
  mergeStrictRecord,
  pickBest,
  upsertIssues,
} from "./reducers";
