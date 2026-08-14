import {z} from "zod";
import {agentNameSchema} from "./schemas/agent";
import {artifactRefSchema, type ArtifactRef} from "./schemas/artifact";
import {artifactLocatorSchema} from "./schemas/critic-output";
import {
  DEFAULT_PRODUCTION_REPAIR_ROUNDS,
  productionRepairStateSchema,
  productionStageCheckpointSchema,
} from "./schemas/production";
import {
  humanDecisionGateSchema,
  humanDecisionKindSchema,
  humanLockedRangeSchema,
  productionAuthorizationSchema,
} from "./schemas/human-decision";
import {unfreezeStateSchema} from "./schemas/unfreeze";
import {PRODUCTION_STATE_SCHEMA_VERSION} from "./schemas/migrations/versions";

export {PRODUCTION_STATE_SCHEMA_VERSION} from "./schemas/migrations/versions";

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
  "production_ready",
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

const productionIssueSummarySchema = z.object({
  issueId: z.string().min(1),
  issueRef: artifactRefSchema,
  status: z.enum(["open", "resolved", "escalated"]),
  owner: z.literal("production-executor"),
  category: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "blocker"]),
  routeTarget: z.enum(["captions", "timeline", "tts", "render"]),
  restartAt: z.string().min(1),
  affectedArtifactId: z.string().min(1),
  affectedArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  locator: artifactLocatorSchema,
  summary: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
      message: "production issue summary must not exceed 500 UTF-8 bytes",
    }),
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
  status: z.enum(["pending", "approved", "rejected", "direct-edit"]),
  gate: humanDecisionGateSchema.optional(),
  decision: humanDecisionKindSchema.optional(),
  approvalEpoch: z.number().int().nonnegative().optional(),
  reason: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
      message: "approval reason must not exceed 500 UTF-8 bytes",
    })
    .optional(),
});

const pendingHumanRouteSchema = z
  .object({
    ownerAgent: z.union([agentNameSchema, z.literal("production-executor")]),
    routeTarget: z.string().min(1),
    restartAt: z.string().min(1),
    issueIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const productionStateSchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_STATE_SCHEMA_VERSION),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    runId: z.string().min(1),
    phase: productionPhaseSchema,
    approvalEpoch: z.number().int().nonnegative().default(0),
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
    productionStages: z.record(z.string(), productionStageCheckpointSchema).default({}),
    productionIssues: z.record(z.string(), productionIssueSummarySchema).default({}),
    lockedRanges: z.array(humanLockedRangeSchema).default([]),
    processedDecisionIds: z.array(z.string().min(1)).default([]),
    productionAuthorization: productionAuthorizationSchema.nullable().default(null),
    pendingHumanRoute: pendingHumanRouteSchema.nullable().default(null),
    unfreeze: unfreezeStateSchema.default({
      status: "idle",
      requestRef: null,
      decisionRef: null,
      humanDecisionRef: null,
      authorizedArtifactIds: [],
      authorizedOwners: [],
      changedArtifactIds: [],
      staleArtifactIds: [],
      validatorRefs: [],
      criticRefs: [],
      resumeAt: null,
      decision: {code: "UNFREEZE_IDLE", summary: "unfreeze flow is idle"},
    }),
    productionRepair: productionRepairStateSchema.default({
      status: "idle",
      round: 0,
      maxRounds: DEFAULT_PRODUCTION_REPAIR_ROUNDS,
      route: null,
      forceRerunStage: null,
      issueIds: [],
      authorizedArtifactIds: [],
      staleArtifactIds: [],
      decision: {code: "PRODUCTION_REPAIR_IDLE", summary: "production repair loop is idle"},
    }),
  })
  .strict();

/** LangGraph stores framework channels beside these production state channels. */
export const productionStateFieldNames = Object.keys(productionStateSchema.shape);

export type ProductionState = z.infer<typeof productionStateSchema>;
export type ProductionStateUpdate = Partial<ProductionState>;
export type ProductionStageSummary = ProductionState["productionStages"][string];
export type ProductionIssueSummary = ProductionState["productionIssues"][string];

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
  return productionStateSchema.parse(value);
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
    approvalEpoch: 0,
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
    productionStages: {},
    productionIssues: {},
    lockedRanges: [],
    processedDecisionIds: [],
    productionAuthorization: null,
    pendingHumanRoute: null,
    unfreeze: {
      status: "idle",
      requestRef: null,
      decisionRef: null,
      humanDecisionRef: null,
      authorizedArtifactIds: [],
      authorizedOwners: [],
      changedArtifactIds: [],
      staleArtifactIds: [],
      validatorRefs: [],
      criticRefs: [],
      resumeAt: null,
      decision: {code: "UNFREEZE_IDLE", summary: "unfreeze flow is idle"},
    },
    productionRepair: {
      status: "idle",
      round: 0,
      maxRounds: DEFAULT_PRODUCTION_REPAIR_ROUNDS,
      route: null,
      forceRerunStage: null,
      issueIds: [],
      authorizedArtifactIds: [],
      staleArtifactIds: [],
      decision: {code: "PRODUCTION_REPAIR_IDLE", summary: "production repair loop is idle"},
    },
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
  mergePendingHumanRoute,
  mergeProcessedDecisionIds,
  mergeProductionAuthorization,
  mergeProductionIssueSummaries,
  mergeProductionRepair,
  mergeRevisionSummaries,
  mergeLockedRanges,
  mergeStrictRecord,
  mergeUnfreezeState,
  pickBest,
  upsertIssues,
} from "./reducers";
