import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  compileProductionGraph,
  type FoundationNode,
  type LocalCheckpointer,
  type ProductionGraphDestination,
} from "../lg-compat";
import {
  createDeterministicToolAdapter,
  productionStageInputSetHash,
  productionStageOrder,
  type DeterministicToolAdapterOptions,
  type ProductionStageAdapter,
} from "../agents/adapters/deterministic-tool";
import {
  assertProductionStart,
  createProductionStageNode,
  productionStageInputArtifacts,
} from "../production";
import {
  DEFAULT_PRODUCTION_REPAIR_ROUNDS,
  productionRepairRouteSchema,
  productionRepairStateSchema,
  type ProductionIssue,
  type ProductionRepairRoute,
  type ProductionStageName,
} from "../schemas/production";
import type {ArtifactRef} from "../schemas/artifact";
import {markStaleTransitively, readArtifactIndex} from "../artifact-registry";
import {
  selectPrimaryRoute,
  type PrimaryRoute,
  type RouteSelection,
  type RoutingIssue,
} from "../routing";
import {assertReferenceOnlyState, type ProductionState, type ProductionStateUpdate} from "../state";

export type ProductionSubgraphOptions = {
  repoRoot: string;
  checkpointer: LocalCheckpointer;
  adapter?: ProductionStageAdapter;
  adapterOptions?: Omit<DeterministicToolAdapterOptions, "repoRoot">;
  maxRepairRounds?: number;
};

export type ProductionSubgraphRunInput = ProductionSubgraphOptions & {
  state: ProductionState;
  config?: {configurable: {thread_id: string}};
};

const boundedSummary = (value: string, maxBytes = 500): string => {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let output = value;
  while (Buffer.byteLength(output, "utf8") > maxBytes - 3) output = output.slice(0, -1);
  return `${output}...`;
};

const sha256 = (bytes: Buffer): string => crypto.createHash("sha256").update(bytes).digest("hex");

const currentRefMatches = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const bytes = fs.readFileSync(path.resolve(repoRoot, ref.path));
    return bytes.byteLength === ref.sizeBytes && sha256(bytes) === ref.sha256;
  } catch {
    return false;
  }
};

const checkpointIsReusable = (
  repoRoot: string,
  state: ProductionState,
  stage: ProductionStageName,
): boolean => {
  const checkpoint = state.productionStages[stage];
  if (!checkpoint || (checkpoint.status !== "SUCCEEDED" && checkpoint.status !== "SKIPPED")) {
    return false;
  }
  const inputs = productionStageInputArtifacts(state, stage);
  if (checkpoint.inputSetHash !== productionStageInputSetHash(stage, inputs)) return false;
  return (
    currentRefMatches(repoRoot, state.contentManifestRef!) &&
    inputs.every((ref) => currentRefMatches(repoRoot, ref)) &&
    checkpoint.outputArtifacts.every((ref) => currentRefMatches(repoRoot, ref))
  );
};

const firstNonReusableStage = (
  repoRoot: string,
  state: ProductionState,
): ProductionStageName | undefined =>
  productionStageOrder.find((stage) => !checkpointIsReusable(repoRoot, state, stage));

const stageIndex = (stage: ProductionStageName): number => productionStageOrder.indexOf(stage);

const repairClosure = (restartAt: ProductionStageName): readonly ProductionStageName[] =>
  productionStageOrder.slice(stageIndex(restartAt));

const authorizedArtifactsForRepair = (
  state: ProductionState,
  restartAt: ProductionStageName,
  affectedArtifactIds: readonly string[],
): string[] => {
  const ids = new Set(affectedArtifactIds);
  for (const stage of repairClosure(restartAt)) {
    for (const artifact of state.productionStages[stage]?.outputArtifacts ?? []) {
      ids.add(artifact.artifactId);
    }
  }
  if (repairClosure(restartAt).includes("validate:delivery")) {
    ids.add(`${state.episodeId}:production:receipt-validate-delivery`);
  }
  return [...ids].sort();
};

const predictedStaleArtifacts = (
  repoRoot: string,
  episodeId: string,
  changedArtifactIds: readonly string[],
): string[] => {
  const registryPath = path.resolve(repoRoot, `content/${episodeId}/artifact-index.json`);
  if (!fs.existsSync(registryPath)) return [];
  try {
    const before = readArtifactIndex(registryPath);
    const after = markStaleTransitively(before, changedArtifactIds);
    const changed = new Set(changedArtifactIds);
    return after.artifacts
      .filter((record) => {
        if (changed.has(record.ref.artifactId) || record.state !== "stale") return false;
        const previous = before.artifacts.find(
          (candidate) =>
            candidate.ref.artifactId === record.ref.artifactId &&
            candidate.ref.revision === record.ref.revision &&
            candidate.ref.sha256 === record.ref.sha256,
        );
        return previous?.state === "selected";
      })
      .map((record) => record.ref.artifactId)
      .sort();
  } catch {
    return [];
  }
};

const issueSummary = (issue: ProductionIssue): ProductionState["productionIssues"][string] => ({
  issueId: issue.issueId,
  issueRef: issue.issueRef,
  status: issue.status,
  owner: issue.ownerAgent,
  category: issue.category,
  severity: issue.severity,
  routeTarget: issue.routeTarget,
  restartAt: issue.restartAt,
  affectedArtifactId: issue.affectedArtifact.artifactId,
  affectedArtifactSha256: issue.affectedArtifact.sha256,
  locator: issue.locator,
  summary: issue.summary,
});

const deliveryIssues = (state: ProductionState): ProductionIssue[] => {
  const checkpoint = state.productionStages["validate:delivery"];
  return (checkpoint?.issues ?? []).filter((issue) => issue.status === "open");
};

const routingIssue = (issue: ProductionIssue): RoutingIssue => ({
  id: issue.issueId,
  category: issue.category,
  severity: issue.severity,
  status: issue.status,
  affectedArtifact: {
    artifactId: issue.affectedArtifact.artifactId,
    path: issue.affectedArtifact.path,
    sha256: issue.affectedArtifact.sha256,
    locator: issue.locator,
    producer: issue.affectedArtifact.producer,
  },
  ownerAgent: issue.ownerAgent,
  routeTarget: issue.routeTarget,
});

const restartStageForTarget = (target: string): ProductionStageName | undefined => {
  if (target === "captions" || target === "timeline") return "timeline";
  if (target === "tts") return "tts";
  if (target === "render") return "render:smoke";
  return undefined;
};

const productionRoute = (selection: RouteSelection): ProductionRepairRoute | undefined => {
  if (!selection || !("ownerAgent" in selection)) return undefined;
  if (selection.ownerAgent !== "production-executor") return undefined;
  const restartAt = restartStageForTarget(selection.routeTarget);
  if (!restartAt) return undefined;
  return productionRepairRouteSchema.parse({
    ownerAgent: selection.ownerAgent,
    routeTarget: selection.routeTarget,
    restartAt,
    reasonCode: selection.reasonCode,
    issueIds: selection.issueIds,
  });
};

const isPrimaryRoute = (selection: RouteSelection): selection is PrimaryRoute =>
  Boolean(selection && "ownerAgent" in selection);

const routeReason = (selection: RouteSelection): string =>
  selection && "reason" in selection ? selection.reason : "no-deterministic-production-owner";

const stageDestination = (stage: ProductionStageName): ProductionGraphDestination => {
  const next = productionStageOrder[stageIndex(stage) + 1];
  return next ?? "production_ready";
};

const changedOutputArtifactIds = (
  request: Parameters<ProductionStageAdapter>[0],
  result: Awaited<ReturnType<ProductionStageAdapter>>,
): string[] => {
  const previous = new Map(
    request.previousArtifacts.map((artifact) => [artifact.artifactId, artifact]),
  );
  return result.outputArtifacts
    .filter((artifact) => {
      const previousArtifact = previous.get(artifact.artifactId);
      return (
        !previousArtifact ||
        previousArtifact.revision !== artifact.revision ||
        previousArtifact.sha256 !== artifact.sha256 ||
        previousArtifact.path !== artifact.path
      );
    })
    .map((artifact) => artifact.artifactId)
    .sort();
};

const guardedAdapter =
  (adapter: ProductionStageAdapter): ProductionStageAdapter =>
  async (request) => {
    const result = await adapter(request);
    if (request.authorizedArtifactIds) {
      const authorized = new Set(request.authorizedArtifactIds);
      const unauthorized = changedOutputArtifactIds(request, result).filter(
        (artifactId) => !authorized.has(artifactId),
      );
      if (unauthorized.length > 0)
        return {
          ...result,
          status: "FAILED",
          outputArtifacts: [],
          issues: [],
          decision: {
            code: "PRODUCTION_UNAUTHORIZED_ARTIFACT",
            summary: boundedSummary(
              `repair attempted to change unauthorized artifact(s): ${unauthorized.join(",")}`,
            ),
          },
          failure: {
            code: "PRODUCTION_UNAUTHORIZED_ARTIFACT",
            retryable: false,
            detail: boundedSummary(`unauthorized artifact(s): ${unauthorized.join(",")}`),
          },
        };
    }
    return result;
  };

export const createProductionSubgraph = (input: ProductionSubgraphOptions) => {
  const adapter = guardedAdapter(
    input.adapter ??
      createDeterministicToolAdapter({
        repoRoot: input.repoRoot,
        ...input.adapterOptions,
      }),
  );
  const maxRepairRounds = input.maxRepairRounds ?? DEFAULT_PRODUCTION_REPAIR_ROUNDS;

  const initialize: FoundationNode = (state) => {
    assertReferenceOnlyState(state);
    assertProductionStart(state);
    const currentRepair = productionRepairStateSchema.parse(state.productionRepair);
    if (
      currentRepair.maxRounds === maxRepairRounds ||
      currentRepair.status !== "idle" ||
      currentRepair.round !== 0
    ) {
      return {};
    }
    return {
      productionRepair: {
        ...currentRepair,
        maxRounds: maxRepairRounds,
      },
    };
  };

  const chooseStart = (state: ProductionState): ProductionGraphDestination => {
    if (
      state.productionRepair.status === "production-ready" ||
      state.phase === "production_ready"
    ) {
      return firstNonReusableStage(input.repoRoot, state) ?? "production_ready";
    }
    if (state.productionRepair.status === "human-escalation") return "production_human_escalation";
    if (state.productionRepair.status === "repairing" && state.productionRepair.route) {
      return state.productionRepair.route.restartAt;
    }
    const deliveryCheckpoint = state.productionStages["validate:delivery"];
    if (deliveryCheckpoint?.status === "FAILED" && deliveryCheckpoint.issues.length > 0) {
      return "production_repair_router";
    }
    if (state.phase === "halted") return "production_human_escalation";
    return firstNonReusableStage(input.repoRoot, state) ?? "production_ready";
  };

  const stageNodes = Object.fromEntries(
    productionStageOrder.map((stage) => [
      stage,
      createProductionStageNode({
        stage,
        adapter,
        authorizedArtifactIds: (state) =>
          state.productionRepair.status === "repairing"
            ? state.productionRepair.authorizedArtifactIds
            : undefined,
        forceRerun: (state) =>
          state.productionRepair.status === "repairing" &&
          state.productionRepair.forceRerunStage === stage,
      }),
    ]),
  ) as Record<ProductionStageName, FoundationNode>;

  const repairRouter: FoundationNode = (state) => {
    const issues = deliveryIssues(state);
    const repair = productionRepairStateSchema.parse(state.productionRepair);
    const summaries = Object.fromEntries(
      issues.map((issue) => [issue.issueId, issueSummary(issue)]),
    );
    const escalate = (reason: string): ProductionStateUpdate => ({
      phase: "halted",
      productionRepair: {
        ...repair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds: issues.map((issue) => issue.issueId).sort(),
        decision: {
          code: "PRODUCTION_HUMAN_ESCALATION",
          summary: boundedSummary(`production repair stopped: ${reason}`),
        },
      },
      productionIssues: Object.fromEntries(
        issues.map((issue) => [issue.issueId, {...issueSummary(issue), status: "escalated"}]),
      ),
      gates: {delivery: "fail"},
      haltReason: boundedSummary(`production-human-escalation:${reason}`),
    });

    if (issues.length === 0) return escalate("delivery issue is missing");
    if (repair.round >= repair.maxRounds) return escalate("budget-exhausted");

    const routeIssues = issues.map(routingIssue);
    const selection = selectPrimaryRoute({
      issues: routeIssues,
      budget: {
        remainingRounds: repair.maxRounds - repair.round,
        maxRoundsProduction: repair.maxRounds,
        roundsUsed: {production: repair.round},
      },
    });
    const route = productionRoute(selection);
    if (!route || !isPrimaryRoute(selection)) return escalate(routeReason(selection));

    const changedIds = issues.map((issue) => issue.affectedArtifact.artifactId);
    const authorizedArtifactIds = authorizedArtifactsForRepair(state, route.restartAt, changedIds);
    const staleArtifactIds = predictedStaleArtifacts(input.repoRoot, state.episodeId, changedIds);
    const nextRepair = productionRepairStateSchema.parse({
      status: "repairing",
      round: repair.round + 1,
      maxRounds: repair.maxRounds,
      route,
      forceRerunStage: route.restartAt,
      issueIds: route.issueIds,
      authorizedArtifactIds,
      staleArtifactIds,
      decision: {
        code: "PRODUCTION_REPAIR_ROUTED",
        summary: boundedSummary(
          `${route.ownerAgent}/${route.routeTarget} will rerun from ${route.restartAt}`,
        ),
      },
    });
    return {
      phase: "production_revision",
      productionRepair: nextRepair,
      productionIssues: summaries,
      budget: {
        ...state.budget,
        roundsUsed: {
          ...state.budget.roundsUsed,
          production: repair.round + 1,
          "production-executor": repair.round + 1,
        },
      },
    };
  };

  const afterRepairRoute = (state: ProductionState): ProductionGraphDestination => {
    if (state.productionRepair.status === "human-escalation") return "production_human_escalation";
    if (state.productionRepair.status === "production-ready") return "production_ready";
    return state.productionRepair.route?.restartAt ?? "production_human_escalation";
  };

  const afterStage = (
    state: ProductionState,
    stage: ProductionStageName,
  ): ProductionGraphDestination => {
    const checkpoint = state.productionStages[stage];
    if (!checkpoint) return "production_human_escalation";
    if (checkpoint.status === "FAILED") {
      return stage === "validate:delivery" && checkpoint.issues.length > 0
        ? "production_repair_router"
        : "production_human_escalation";
    }
    if (stage === "validate:delivery") return "production_ready";
    return stageDestination(stage);
  };

  const productionReady: FoundationNode = (state) => {
    if (
      state.phase === "production_ready" &&
      state.productionRepair.status === "production-ready" &&
      Object.values(state.productionIssues).every((issue) => issue.status !== "open")
    ) {
      return {};
    }
    const issueIds = Object.values(state.productionIssues)
      .filter((issue) => issue.status === "open")
      .map((issue) => issue.issueId)
      .sort();
    return {
      phase: "production_ready",
      gates: {production: "pass", delivery: "pass"},
      productionIssues: Object.fromEntries(
        Object.values(state.productionIssues)
          .filter((issue) => issue.status === "open")
          .map((issue) => [issue.issueId, {...issue, status: "resolved"}]),
      ),
      productionRepair: productionRepairStateSchema.parse({
        ...state.productionRepair,
        status: "production-ready",
        route: null,
        forceRerunStage: null,
        issueIds,
        decision: {
          code: "PRODUCTION_READY",
          summary: "delivery evaluation passed; production is ready",
        },
      }),
    };
  };

  const humanEscalation: FoundationNode = (state) => {
    const issueIds = Object.values(state.productionIssues)
      .filter((issue) => issue.status === "open")
      .map((issue) => issue.issueId)
      .sort();
    const repair = productionRepairStateSchema.parse(state.productionRepair);
    const finalIssueIds =
      repair.status === "human-escalation"
        ? repair.issueIds
        : issueIds.length > 0
          ? issueIds
          : repair.issueIds;
    const update: ProductionStateUpdate = {
      phase: "halted",
      productionRepair: {
        ...repair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds: finalIssueIds,
        decision: {
          code: "PRODUCTION_HUMAN_ESCALATION",
          summary: boundedSummary(
            repair.decision.summary || "production requires human escalation",
          ),
        },
      },
      productionIssues: Object.fromEntries(
        Object.values(state.productionIssues)
          .filter((issue) => issue.status === "open")
          .map((issue) => [issue.issueId, {...issue, status: "escalated"}]),
      ),
      gates: {delivery: "fail"},
    };
    if (!state.haltReason) {
      update.haltReason = boundedSummary(`production-human-escalation:${repair.decision.summary}`);
    }
    return update;
  };

  return compileProductionGraph({
    initialize,
    stageNodes,
    repairRouter,
    productionReady,
    humanEscalation,
    chooseStart,
    afterStage,
    afterRepairRoute,
    checkpointer: input.checkpointer,
  });
};

export const createLangGraphProductionSubgraph = createProductionSubgraph;

export const runProductionSubgraph = async (input: ProductionSubgraphRunInput) => {
  const graph = createProductionSubgraph(input);
  return graph.invoke(input.state, input.config ?? {configurable: {thread_id: input.state.runId}});
};
