import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  assertArtifactRefBytes,
  buildArtifactRef,
  emptyArtifactIndex,
  readArtifactIndex,
} from "./artifact-registry";
import {
  checkpointConfig,
  createConfiguredCheckpoint,
  initializeCheckpointBackend,
  restoreVerifiedCheckpoint,
  resumeCheckpoint,
  closeCheckpointBackend,
  type RuntimeCheckpointConfig,
} from "./checkpoint";
import {selectOrchestrator, type OrchestratorMode} from "./entry";
import {createCodexCapabilityAdapter} from "./agents/adapters/codex-capability";
import {
  createRoleModelRolloutAdapter,
  type RoleModelRolloutAdapterOptions,
} from "./agents/adapters/role-model-rollout";
import {
  createRoleBackedContentLoopNodes,
  type ContentRoleRequestBuilder,
  roleForContractOutputPath,
} from "./agents/adapters/content-loop";
import type {AgentRunner} from "./agents/run-agent";
import {agentNames, type AgentExecutionRequest, type AgentName} from "./schemas/agent";
import {artifactRefSchema, type ArtifactIndex, type ArtifactRef} from "./schemas/artifact";
import {
  getRoleModelContract,
  loadRoleModelContractFile,
  roleContractArtifactKind,
  roleContractGateArtifactId,
  roleContractInputArtifactId,
  roleContractLeafId,
  roleContractOutputArtifactId,
  roleContractPromptPath,
  resolveRoleContractPath,
  type RoleModelContractFile,
} from "./agents/benchmark/role-contract";
import {
  codexCapabilityAgentNames,
  loadAgentModelPolicyFile,
  type AgentModelPolicyFile,
} from "./config/agent-model-policy";
import {
  createExecutionEventSink,
  EXECUTION_LOG_PATH,
  readExecutionEventLog,
  redactObservabilityValue,
} from "./observability";
import {createFoundationGraph} from "./graph/main-graph";
import {
  createProductionSubgraph,
  type MediaLifecycleOptions,
  type ProductionSubgraphOptions,
  type ProductionUnfreezeOptions,
} from "./graph/production-subgraph";
import type {ContentLoopNodes} from "./graph/content-subgraph";
import {
  createInitialProductionState,
  assertReferenceOnlyState,
  type ProductionState,
} from "./state";
import {assertArtifactRefBytes as assertArtifactBytes} from "./artifact-registry";
import {
  productionStageNames,
  productionStageSchema,
  type ProductionStageName,
} from "./schemas/production";
import type {
  DeterministicToolAdapterOptions,
  ProductionStageAdapter,
} from "./agents/adapters/deterministic-tool";
import type {ConcurrencyConfig} from "./concurrency";
import type {CacheEvent} from "./schemas/cache-event";
import {cacheEventSchema} from "./schemas/cache-event";
import {stableJson} from "./stable-json";
import {pauseForExternalCapability, type FoundationNode} from "./lg-compat";
import {
  unfreezeAuthorizationSchema,
  unfreezeContentGateResultSchema,
  unfreezeEditSchema,
} from "./schemas/unfreeze";
import {readMediaSourceManifest} from "../media/manifest";

export type ProductionEntrypointOptions = {
  repoRoot: string;
  episodeId: string;
  runId?: string;
  checkpointer?: import("./lg-compat").LocalCheckpointer;
  databasePath?: string;
  env?: NodeJS.ProcessEnv;
  policies?: AgentModelPolicyFile;
  contracts?: RoleModelContractFile;
  runAgent?: AgentRunner;
  contentLoopNodes?: ContentLoopNodes;
  artifactIndex?: ArtifactIndex;
  productionAdapter?: ProductionStageAdapter;
  productionAdapterOptions?: Omit<DeterministicToolAdapterOptions, "repoRoot">;
  maxProductionRepairRounds?: number;
  mediaLifecycle?: boolean;
  media?: Omit<MediaLifecycleOptions, "repoRoot" | "episodeId">;
  unfreeze?: ProductionUnfreezeOptions;
  concurrency?: ConcurrencyConfig;
  now?: () => string;
  createdAt?: () => string;
  eventSink?: (event: import("./schemas/execution-event").ObservabilityEvent) => void;
  eventLogPath?: string;
  reportPath?: string;
  cacheEventLogPath?: string;
  runnerVersion?: string;
};

export type LangGraphEntrypointRuntime = {
  graph: ReturnType<typeof createFoundationGraph>;
  state: ProductionState;
  config: RuntimeCheckpointConfig;
  productionConfig: RuntimeCheckpointConfig;
  checkpointer: import("./lg-compat").LocalCheckpointer;
  readProductionState: () => Promise<ProductionState | undefined>;
  close: () => Promise<void>;
};

export type OrchestrationHandoff = {
  schemaVersion: "orchestration-handoff-v1";
  gate: string;
  episodeId: string;
  runId: string;
  threadId: string;
  approvalEpoch: number;
  artifactRefs: ArtifactRef[];
  resumeCommand: string;
  nextAction: string;
  decisionFile: string;
  handoffPath: string;
  payload: Record<string, unknown>;
};

export type OrchestratorRunResult = {
  mode: OrchestratorMode;
  status: "manual-handoff" | "paused" | "completed" | "halted";
  episodeId: string;
  runId?: string;
  threadId?: string;
  state?: ProductionState;
  handoff?: OrchestrationHandoff;
  nextAction?: string;
};

export type ProductionEntrypointRunOptions = ProductionEntrypointOptions & {
  resume?: boolean;
  approvalFile?: string;
  capabilityResultFile?: string;
  resumeValue?: unknown;
};

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, repositoryPath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`ORCHESTRATOR_PATH_ESCAPES_REPOSITORY:${repositoryPath}`);
  }
  return absolute;
};

const repositoryPath = (repoRoot: string, value: string): string => {
  if (path.isAbsolute(value)) return resolveRepositoryPath(repoRoot, value);
  return resolveRepositoryPath(repoRoot, value);
};

const readCacheEvents = (filePath: string): CacheEvent[] => {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => cacheEventSchema.parse(JSON.parse(line) as unknown));
};

const defaultRunId = (): string =>
  `run-${new Date()
    .toISOString()
    .replace(/[^0-9]/gu, "")
    .slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;

const existingRefForPath = (
  repoRoot: string,
  refs: Readonly<Record<string, ArtifactRef>>,
  repositoryPath: string,
): ArtifactRef | undefined => {
  const candidates = Object.values(refs)
    .filter((ref) => ref.path === repositoryPath)
    .sort(
      (left, right) =>
        right.revision - left.revision || left.artifactId.localeCompare(right.artifactId),
    );
  const ref = candidates[0];
  if (ref) assertArtifactBytes(repoRoot, ref);
  return ref;
};

const mediaTypeFor = (repositoryPath: string): string => {
  if (repositoryPath.endsWith(".json")) return "application/json";
  if (repositoryPath.endsWith(".mp4")) return "video/mp4";
  if (repositoryPath.endsWith(".srt")) return "text/plain";
  return "text/markdown";
};

const bindRequestRef = (input: {
  repoRoot: string;
  refs: Readonly<Record<string, ArtifactRef>>;
  episodeId: string;
  repositoryPath: string;
  artifactId: string;
  schemaVersion: string;
  producer: string;
  createdAt: string;
}): ArtifactRef =>
  existingRefForPath(input.repoRoot, input.refs, input.repositoryPath) ??
  buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.repositoryPath,
    mediaType: mediaTypeFor(input.repositoryPath),
    schemaVersion: input.schemaVersion,
    producer: input.producer,
    createdAt: input.createdAt,
  });

const buildRoleRequest = (input: {
  repoRoot: string;
  contracts: RoleModelContractFile;
  refs: Readonly<Record<string, ArtifactRef>>;
  episodeId: string;
  role: AgentName;
  runId: string;
  attempt: number;
  revisionRound: number;
  executionId: string;
  revisionBudgetRemaining: number;
  createdAt: string;
}): AgentExecutionRequest => {
  const contract = getRoleModelContract(input.role, input.contracts);
  const promptPath = roleContractPromptPath(input.repoRoot, input.role, input.episodeId);
  const inputPaths = contract.allowedFrozenInputs.map((value) =>
    resolveRoleContractPath(input.episodeId, value),
  );
  const gatePaths = contract.upstreamGatePaths.map((value) =>
    resolveRoleContractPath(input.episodeId, value),
  );
  const outputContracts = contract.expectedOutputs.map((output) => ({
    ...output,
    path: resolveRoleContractPath(input.episodeId, output.path),
  }));
  const promptRef = bindRequestRef({
    repoRoot: input.repoRoot,
    refs: input.refs,
    episodeId: input.episodeId,
    repositoryPath: promptPath,
    artifactId: `${input.episodeId}:prompt:${roleContractLeafId(promptPath)}`,
    schemaVersion: "prompt-v1",
    producer: "role-contract",
    createdAt: input.createdAt,
  });
  const inputArtifacts = inputPaths.map((repositoryPathValue) =>
    bindRequestRef({
      repoRoot: input.repoRoot,
      refs: input.refs,
      episodeId: input.episodeId,
      repositoryPath: repositoryPathValue,
      artifactId: roleContractInputArtifactId(input.episodeId, repositoryPathValue),
      schemaVersion: `${roleContractArtifactKind(repositoryPathValue)}-v1`,
      producer: "role-contract",
      createdAt: input.createdAt,
    }),
  );
  const upstreamGateRefs = gatePaths.map((repositoryPathValue) =>
    bindRequestRef({
      repoRoot: input.repoRoot,
      refs: input.refs,
      episodeId: input.episodeId,
      repositoryPath: repositoryPathValue,
      artifactId: roleContractGateArtifactId(input.episodeId, repositoryPathValue),
      schemaVersion: "gate-v1",
      producer: "role-contract",
      createdAt: input.createdAt,
    }),
  );
  return {
    contractVersion: "agent-execution-v1",
    executionId: input.executionId,
    episodeId: input.episodeId,
    agentName: input.role,
    attempt: input.attempt,
    revisionRound: input.revisionRound,
    promptRef,
    inputArtifacts,
    expectedOutputs: outputContracts.map((output) => ({
      artifactId: roleContractOutputArtifactId(input.episodeId, input.role, output.path),
      path: output.path,
      schemaVersion: output.schemaVersion,
    })),
    upstreamGateRefs,
    revisionBudgetRemaining: input.revisionBudgetRemaining,
  };
};

const loadEpisodeArtifactIndex = (repoRoot: string, episodeId: string): ArtifactIndex => {
  const filePath = repositoryPath(repoRoot, `content/${episodeId}/artifact-index.json`);
  return fs.existsSync(filePath) ? readArtifactIndex(filePath) : emptyArtifactIndex(episodeId);
};

const episodeControlRef = (input: {
  repoRoot: string;
  episodeId: string;
  createdAt: string;
}): ArtifactRef =>
  buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: `${input.episodeId}:control:episode-config`,
    episodeId: input.episodeId,
    path: `content/${input.episodeId}/episode.config.json`,
    mediaType: "application/json",
    schemaVersion: "episode-config-v1",
    producer: "orchestrator:episode-config",
    createdAt: input.createdAt,
  });

const roleOutputRefsCurrent = (
  repoRoot: string,
  state: ProductionState,
  contracts: RoleModelContractFile,
): void => {
  for (const role of state.completedAgents) {
    const contract = getRoleModelContract(role, contracts);
    for (const output of contract.expectedOutputs) {
      const outputPath = resolveRoleContractPath(state.episodeId, output.path);
      const artifactId = roleContractOutputArtifactId(state.episodeId, role, outputPath);
      const ref = state.artifacts[artifactId];
      if (!ref) throw new Error(`ORCHESTRATOR_COMPLETED_OUTPUT_REF_MISSING:${role}:${artifactId}`);
      if (ref.path !== outputPath) {
        throw new Error(`ORCHESTRATOR_COMPLETED_OUTPUT_PATH_MISMATCH:${role}:${artifactId}`);
      }
      assertArtifactRefBytes(repoRoot, ref);
    }
  }
};

const externalCapabilityError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:API_KEY|HOSTED_AGENT|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|capability)/iu.test(
    message,
  );
};

const unresolvedExternalCapabilityError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("EXTERNAL_CAPABILITY_UNRESOLVED:");
};

const createRoleAgentRunner = (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  previousArtifacts: Record<string, ArtifactRef>;
  policies: AgentModelPolicyFile;
  env: NodeJS.ProcessEnv;
  createdAt: () => string;
  runAgent?: AgentRunner;
}): AgentRunner => {
  const delegated =
    input.runAgent ??
    (() => {
      const capability = createCodexCapabilityAdapter({
        repoRoot: input.repoRoot,
        previousArtifacts: input.previousArtifacts,
        createdAt: input.createdAt,
      });
      const rollout = createRoleModelRolloutAdapter({
        repoRoot: input.repoRoot,
        policies: input.policies,
        env: input.env,
        previousArtifacts: input.previousArtifacts,
        createdAt: input.createdAt,
      } satisfies RoleModelRolloutAdapterOptions);
      return async (request: AgentExecutionRequest) =>
        (codexCapabilityAgentNames as readonly string[]).includes(request.agentName)
          ? capability(request)
          : rollout(request);
    })();

  const run = async (request: AgentExecutionRequest): Promise<Awaited<ReturnType<AgentRunner>>> => {
    try {
      return await delegated(request);
    } catch (error) {
      if (!externalCapabilityError(error)) throw error;
      pauseForExternalCapability({
        gate: "external-capability",
        capability: `agent:${request.agentName}`,
        episodeId: request.episodeId,
        runId: input.runId,
        approvalEpoch: 0,
        artifactRefs: [request.promptRef, ...request.inputArtifacts, ...request.upstreamGateRefs],
        expectedOutputPaths: request.expectedOutputs.map((output) => output.path),
        resumeCommand: `ORCHESTRATOR=langgraph pnpm orchestrate --episode ${input.episodeId} --run ${input.runId} --resume`,
        nextAction: `Resolve the ${request.agentName} capability and place all declared output files in the repository, then resume.`,
      });
      return delegated(request);
    }
  };

  return async (request) => {
    let result = await run(request);
    if (result.status === "FAILED" && result.failure?.code === "MANUAL_OUTPUT_MISSING") {
      pauseForExternalCapability({
        gate: "external-capability",
        capability: `agent:${request.agentName}`,
        episodeId: request.episodeId,
        runId: input.runId,
        approvalEpoch: 0,
        artifactRefs: [request.promptRef, ...request.inputArtifacts, ...request.upstreamGateRefs],
        expectedOutputPaths: request.expectedOutputs.map((output) => output.path),
        resumeCommand: `ORCHESTRATOR=langgraph pnpm orchestrate --episode ${input.episodeId} --run ${input.runId} --resume`,
        nextAction: `Place the missing declared output files in the repository, then resume this run.`,
      });
      result = await run(request);
      if (result.status === "FAILED" && result.failure?.code === "MANUAL_OUTPUT_MISSING") {
        throw new Error(`EXTERNAL_CAPABILITY_UNRESOLVED:agent:${request.agentName}`);
      }
    }
    if (result.status === "SUCCEEDED") {
      for (const ref of result.outputArtifacts) input.previousArtifacts[ref.artifactId] = ref;
    }
    return result;
  };
};

const handoffRoot = (repoRoot: string, episodeId: string): string =>
  repositoryPath(repoRoot, `.orchestration/handoffs/${episodeId}`);

const pathToken = (value: string): string => encodeURIComponent(value);

const handoffPathFor = (repoRoot: string, episodeId: string, runId: string): string =>
  path.join(handoffRoot(repoRoot, episodeId), `${pathToken(runId)}.json`);

const decisionPathFor = (repoRoot: string, episodeId: string, runId: string): string =>
  `.orchestration/handoffs/${episodeId}/${pathToken(runId)}.decision.json`;

const writeJsonAtomically = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${stableJson(value)}\n`, "utf8");
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {force: true});
  }
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const interruptPayloads = (value: unknown): Record<string, unknown>[] => {
  const record = asRecord(value);
  const raw = record?.__interrupt__;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const interrupt = asRecord(item);
    const payload = asRecord(interrupt?.value);
    return payload ? [payload] : [];
  });
};

const snapshotInterruptPayloads = (snapshot: unknown): Record<string, unknown>[] => {
  const record = asRecord(snapshot);
  const tasks = record?.tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.flatMap((task) => {
    const taskRecord = asRecord(task);
    const interrupts = taskRecord?.interrupts;
    if (!Array.isArray(interrupts)) return [];
    return interrupts.flatMap((item) => {
      const payload = asRecord(asRecord(item)?.value);
      return payload ? [payload] : [];
    });
  });
};

const stateFromSnapshot = (snapshot: unknown): ProductionState | undefined => {
  const values = asRecord(asRecord(snapshot)?.values);
  if (!values) return undefined;
  return assertReferenceOnlyState(values);
};

const stateFromSnapshotIfPresent = (snapshot: unknown): ProductionState | undefined => {
  const values = asRecord(asRecord(snapshot)?.values);
  if (
    !values ||
    typeof values.schemaVersion !== "string" ||
    typeof values.episodeId !== "string" ||
    typeof values.runId !== "string"
  ) {
    return undefined;
  }
  return stateFromSnapshot(snapshot);
};

type NestedProductionError = Error & {productionState?: ProductionState};

const nestedProductionStateFromError = (error: unknown): ProductionState | undefined =>
  error instanceof Error ? (error as NestedProductionError).productionState : undefined;

const artifactRefsFromPayload = (
  payload: Record<string, unknown>,
  state: ProductionState,
): ArtifactRef[] => {
  if (Array.isArray(payload.artifactRefs)) {
    const refs = payload.artifactRefs.flatMap((ref) => {
      const parsed = artifactRefSchema.safeParse(ref);
      return parsed.success ? [parsed.data] : [];
    });
    if (refs.length > 0) return refs;
  }
  return Object.values(state.artifacts).sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );
};

const createHandoff = (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  payload: Record<string, unknown>;
  state: ProductionState;
}): OrchestrationHandoff => {
  const gate = typeof input.payload.gate === "string" ? input.payload.gate : "external-capability";
  const approvalEpoch =
    typeof input.payload.approvalEpoch === "number"
      ? input.payload.approvalEpoch
      : input.state.approvalEpoch;
  const decisionFile = decisionPathFor(input.repoRoot, input.episodeId, input.runId);
  const baseResume = `ORCHESTRATOR=langgraph pnpm orchestrate --episode ${input.episodeId} --run ${input.runId} --resume`;
  const resumeCommand =
    gate === "external-capability" ? baseResume : `${baseResume} --approval-file ${decisionFile}`;
  const nextAction =
    typeof input.payload.nextAction === "string"
      ? input.payload.nextAction
      : gate === "external-capability"
        ? "Complete the external capability handoff, verify the declared files, and resume."
        : "Review the listed artifact refs, write a formal HumanDecision JSON file, and resume.";
  const handoffPath = handoffPathFor(input.repoRoot, input.episodeId, input.runId);
  const safePayload = redactObservabilityValue(input.payload) as Record<string, unknown>;
  const handoff: OrchestrationHandoff = {
    schemaVersion: "orchestration-handoff-v1",
    gate,
    episodeId: input.episodeId,
    runId: input.runId,
    threadId: input.episodeId,
    approvalEpoch,
    artifactRefs: artifactRefsFromPayload(safePayload, input.state),
    resumeCommand,
    nextAction,
    decisionFile,
    handoffPath,
    payload: safePayload,
  };
  writeJsonAtomically(handoffPath, handoff);
  return handoff;
};

const readHandoff = (
  repoRoot: string,
  episodeId: string,
  runId: string,
): OrchestrationHandoff | undefined => {
  const filePath = handoffPathFor(repoRoot, episodeId, runId);
  if (!fs.existsSync(filePath)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const record = asRecord(parsed);
  if (!record || record.runId !== runId || record.episodeId !== episodeId) {
    throw new Error("ORCHESTRATION_HANDOFF_IDENTITY_MISMATCH");
  }
  return parsed as OrchestrationHandoff;
};

const externalUnfreezePlanSchema = z
  .object({
    schemaVersion: z.literal("unfreeze-plan-v1"),
    authorizedEdits: z.array(unfreezeAuthorizationSchema).min(1),
    restartAt: productionStageSchema,
  })
  .strict();

const externalUnfreezeFilePath = (episodeId: string, runId: string, name: string): string =>
  `.orchestration/handoffs/${episodeId}/${pathToken(runId)}.${pathToken(name)}.json`;

const readExternalJson = (repoRoot: string, repositoryPathValue: string): unknown | undefined => {
  const absolutePath = repositoryPath(repoRoot, repositoryPathValue);
  if (!fs.existsSync(absolutePath)) return undefined;
  return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
};

const pauseForExternalFile = (input: {
  capability: string;
  episodeId: string;
  runId: string;
  approvalEpoch: number;
  artifactRefs: readonly ArtifactRef[];
  expectedOutputPath: string;
  nextAction: string;
}): never => {
  const resumeCommand = `ORCHESTRATOR=langgraph pnpm orchestrate --episode ${input.episodeId} --run ${input.runId} --resume`;
  pauseForExternalCapability({
    gate: "external-capability",
    capability: input.capability,
    episodeId: input.episodeId,
    runId: input.runId,
    approvalEpoch: input.approvalEpoch,
    artifactRefs: [...input.artifactRefs],
    expectedOutputPath: input.expectedOutputPath,
    resumeCommand,
    nextAction: input.nextAction,
  });
  throw new Error(`EXTERNAL_CAPABILITY_UNRESOLVED:${input.capability}`);
};

const createExternalUnfreezeOptions = (input: {repoRoot: string}): ProductionUnfreezeOptions => {
  const baseRefs = (inputRefs: readonly ArtifactRef[]): ArtifactRef[] => {
    const unique = new Map<string, ArtifactRef>();
    for (const ref of inputRefs) unique.set(`${ref.artifactId}:${ref.revision}:${ref.sha256}`, ref);
    return [...unique.values()].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId),
    );
  };

  return {
    plan: async ({state, issues, contentManifestRef}) => {
      const expectedOutputPath = externalUnfreezeFilePath(
        state.episodeId,
        state.runId,
        "unfreeze-plan",
      );
      const raw = readExternalJson(input.repoRoot, expectedOutputPath);
      if (raw === undefined) {
        return pauseForExternalFile({
          capability: "unfreeze-planner",
          episodeId: state.episodeId,
          runId: state.runId,
          approvalEpoch: state.approvalEpoch,
          artifactRefs: baseRefs([
            contentManifestRef,
            ...issues.flatMap((issue) => [issue.issueRef, issue.affectedArtifact]),
          ]),
          expectedOutputPath,
          nextAction: `Prepare a scoped unfreeze-plan-v1 JSON file at ${expectedOutputPath} with only authorized frozen content refs and a restartAt stage, then resume.`,
        });
      }
      const parsed = externalUnfreezePlanSchema.parse(raw);
      return {authorizedEdits: parsed.authorizedEdits, restartAt: parsed.restartAt};
    },
    edit: async ({state, request}) => {
      const expectedOutputPath = externalUnfreezeFilePath(
        state.episodeId,
        state.runId,
        `${request.requestId}.unfreeze-edits`,
      );
      const raw = readExternalJson(input.repoRoot, expectedOutputPath);
      if (raw === undefined) {
        return pauseForExternalFile({
          capability: "unfreeze-editor",
          episodeId: state.episodeId,
          runId: state.runId,
          approvalEpoch: state.approvalEpoch,
          artifactRefs: baseRefs([
            request.contentManifestRef,
            ...request.authorizedEdits.map((authorization) => authorization.artifactRef),
          ]),
          expectedOutputPath,
          nextAction: `Apply only the approved unfreeze scope and place an array of unfreeze-edit-v1 objects at ${expectedOutputPath}, then resume.`,
        });
      }
      return z.array(unfreezeEditSchema).min(1).parse(raw);
    },
    validate: async ({state, request, changedArtifactRefs}) => {
      const expectedOutputPath = externalUnfreezeFilePath(
        state.episodeId,
        state.runId,
        `${request.requestId}.unfreeze-content-gate`,
      );
      const raw = readExternalJson(input.repoRoot, expectedOutputPath);
      if (raw === undefined) {
        return pauseForExternalFile({
          capability: "unfreeze-content-validation",
          episodeId: state.episodeId,
          runId: state.runId,
          approvalEpoch: state.approvalEpoch,
          artifactRefs: baseRefs([
            request.contentManifestRef,
            ...changedArtifactRefs,
            ...request.authorizedEdits.map((authorization) => authorization.artifactRef),
          ]),
          expectedOutputPath,
          nextAction: `Run the existing content validators and critics against the scoped edits, then place the structured unfreeze-content-gate result at ${expectedOutputPath} and resume.`,
        });
      }
      return unfreezeContentGateResultSchema.parse(raw);
    },
  };
};

const makeProductionObservability = (input: {
  options: ProductionEntrypointOptions;
  eventSink: (event: import("./schemas/execution-event").ObservabilityEvent) => void;
  eventLogPath: string;
  cacheEventLogPath: string;
  now: () => string;
}) => ({
  eventSink: input.eventSink,
  now: input.now,
  checkpointVersion: "production-checkpoint-v2",
  runnerVersion: input.options.runnerVersion ?? "langgraph-production-entrypoint-v1",
  eventLogPath: input.eventLogPath,
  cacheEventLogPath: input.cacheEventLogPath,
});

export const createLangGraphEntrypoint = (
  input: ProductionEntrypointOptions & {state: ProductionState; runId: string},
): LangGraphEntrypointRuntime => {
  const repoRoot = path.resolve(input.repoRoot);
  const now = input.now ?? (() => new Date().toISOString());
  const createdAt = input.createdAt ?? now;
  const contracts = input.contracts ?? loadRoleModelContractFile({repoRoot});
  const policies = input.policies ?? loadAgentModelPolicyFile({repoRoot});
  const previousArtifacts: Record<string, ArtifactRef> = {...input.state.artifacts};
  const checkpointer =
    input.checkpointer ??
    createConfiguredCheckpoint({
      repoRoot,
      databasePath: input.databasePath,
      env: input.env,
    });
  const config = checkpointConfig({
    episodeId: input.episodeId,
    runId: input.runId,
    threadId: input.episodeId,
    traceId: `${input.episodeId}:run:${input.runId}`,
  });
  const productionConfig: RuntimeCheckpointConfig = {
    configurable: {...config.configurable, checkpoint_ns: "production"},
  };
  const eventLogPath =
    input.eventLogPath ?? path.resolve(repoRoot, EXECUTION_LOG_PATH(input.episodeId));
  const cacheEventLogPath =
    input.cacheEventLogPath ??
    path.resolve(repoRoot, `content/${input.episodeId}/observability/cache-events.jsonl`);
  const eventSink =
    input.eventSink ?? createExecutionEventSink({repoRoot, episodeId: input.episodeId});
  const productionObservability = makeProductionObservability({
    options: input,
    eventSink,
    eventLogPath,
    cacheEventLogPath,
    now,
  });
  const observability = {...productionObservability, cacheEventLogPath: undefined};
  const unfreeze =
    input.unfreeze ??
    createExternalUnfreezeOptions({
      repoRoot,
    });
  const mediaManifestAvailable = (() => {
    try {
      readMediaSourceManifest(repoRoot, input.episodeId);
      return true;
    } catch {
      return false;
    }
  })();
  const runAgent = createRoleAgentRunner({
    repoRoot,
    episodeId: input.episodeId,
    runId: input.runId,
    previousArtifacts,
    policies,
    env: input.env ?? process.env,
    createdAt,
    runAgent: input.runAgent,
  });
  const requestForState = ({
    state,
    role,
    attempt,
    executionId,
  }: {
    state: ProductionState;
    role: AgentName;
    attempt: number;
    executionId: string;
  }): AgentExecutionRequest =>
    buildRoleRequest({
      repoRoot,
      contracts,
      refs: state.artifacts,
      episodeId: state.episodeId,
      role,
      runId: state.runId,
      attempt,
      revisionRound: state.round,
      executionId,
      revisionBudgetRemaining: Math.max(0, state.budget.maxRoundsContent - state.round),
      createdAt: createdAt(),
    });
  const requestForContext = ({
    context,
    role,
    attempt,
    executionId,
  }: Parameters<ContentRoleRequestBuilder>[0]): AgentExecutionRequest =>
    buildRoleRequest({
      repoRoot,
      contracts,
      refs: context.artifacts,
      episodeId: context.episodeId,
      role,
      runId: context.runId,
      attempt,
      revisionRound: context.round,
      executionId,
      revisionBudgetRemaining: 0,
      createdAt: createdAt(),
    });
  const roleForOutputPathFromContracts = (repositoryPathValue: string): AgentName | undefined =>
    agentNames.find((role) =>
      getRoleModelContract(role, contracts).expectedOutputs.some(
        (output) => resolveRoleContractPath(input.episodeId, output.path) === repositoryPathValue,
      ),
    ) ?? roleForContractOutputPath(input.episodeId, repositoryPathValue);
  const contentLoopNodes =
    input.contentLoopNodes ??
    createRoleBackedContentLoopNodes({
      repoRoot,
      runAgent,
      requestFor: requestForContext,
      roleForOutputPath: roleForOutputPathFromContracts,
    });
  const productionOptions: ProductionSubgraphOptions = {
    repoRoot,
    checkpointer,
    ...(input.productionAdapter ? {adapter: input.productionAdapter} : {}),
    ...(input.productionAdapterOptions ? {adapterOptions: input.productionAdapterOptions} : {}),
    ...(input.maxProductionRepairRounds !== undefined
      ? {maxRepairRounds: input.maxProductionRepairRounds}
      : {}),
    requireFormalApproval: true,
    observability: productionObservability,
    unfreeze,
    concurrency: input.concurrency,
    media: {
      ...(input.media ?? {}),
      repoRoot,
      episodeId: input.episodeId,
      enabled:
        input.mediaLifecycle ?? mediaManifestAvailable,
      env: input.env ?? process.env,
    },
  };
  const productionGraph = createProductionSubgraph(productionOptions);
  const production: FoundationNode = async (state) => {
    let result: unknown;
    try {
      result = await productionGraph.invoke(state, productionConfig);
    } catch (error) {
      const nestedSnapshot = await productionGraph.getState(productionConfig);
      const nestedState = stateFromSnapshot(nestedSnapshot);
      if (nestedState && error instanceof Error) {
        (error as NestedProductionError).productionState = nestedState;
      }
      throw error;
    }
    // A nested graph can pause before its parent node returns. Read the
    // nested checkpoint so completed media stages remain visible in the
    // parent state across the external capability boundary.
    const nestedSnapshot = await productionGraph.getState(productionConfig);
    return stateFromSnapshot(nestedSnapshot) ?? (result as ProductionState);
  };
  const graph = createFoundationGraph({
    runAgent,
    checkpointer,
    repoRoot,
    requireFormalHumanDecision: true,
    humanDecision: {repoRoot, now},
    contentLoop: {
      nodes: contentLoopNodes,
      artifactIndex: input.artifactIndex ?? loadEpisodeArtifactIndex(repoRoot, input.episodeId),
    },
    observability: {
      ...observability,
      events: () => readExecutionEventLog(eventLogPath),
      repoRoot,
      reportPath: input.reportPath ?? `content/${input.episodeId}/observability/run-report.md`,
      cacheEvents: () => readCacheEvents(cacheEventLogPath),
    },
    agentRequestFor: ({state, agentName, attempt, defaults}) =>
      requestForState({
        state,
        role: agentName,
        attempt,
        executionId: defaults.executionId,
      }),
    production,
    afterProduction: (state) =>
      state.completedAgents.includes("delivery-critic") ||
      state.mediaStages["delivery-critic"]?.status === "SUCCEEDED"
        ? "final_approval"
        : "execute_agent",
    concurrency: input.concurrency,
  });
  return {
    graph,
    state: input.state,
    config,
    productionConfig,
    checkpointer,
    readProductionState: async () => {
      const nestedSnapshot = await productionGraph.getState(productionConfig);
      const nestedState = stateFromSnapshotIfPresent(nestedSnapshot);
      if (!nestedState) return undefined;
      return Object.keys(nestedState.productionStages).length > 0 ||
        Object.keys(nestedState.mediaStages).length > 0
        ? nestedState
        : undefined;
    },
    close: async () => {
      if (!input.checkpointer) await closeCheckpointBackend(checkpointer);
    },
  };
};

const manualHandoff = (episodeId: string): OrchestratorRunResult => ({
  mode: "manual",
  status: "manual-handoff",
  episodeId,
  nextAction:
    "Manual orchestrator selected. Continue the existing stage-specific manual commands documented in README.md; no LangGraph checkpoint or approval is created.",
});

export const runLangGraphEpisode = async (
  input: ProductionEntrypointRunOptions,
): Promise<OrchestratorRunResult> => {
  const repoRoot = path.resolve(input.repoRoot);
  const now = input.now ?? (() => new Date().toISOString());
  const createdAt = input.createdAt ?? now;
  const checkpointer =
    input.checkpointer ??
    createConfiguredCheckpoint({
      repoRoot,
      databasePath: input.databasePath,
      env: input.env,
    });
  const ownsCheckpointer = !input.checkpointer;
  let runId = input.runId;
  let state: ProductionState;
  try {
    await initializeCheckpointBackend(checkpointer);
    const lookupConfig = checkpointConfig(input.episodeId);
    if (input.resume) {
      const restored = await restoreVerifiedCheckpoint({
        checkpointer,
        config: lookupConfig,
      });
      state = restored.state;
      runId = state.runId;
      if (input.runId && input.runId !== runId) {
        throw new Error(`ORCHESTRATOR_RUN_MISMATCH:${input.runId}:${runId}`);
      }
      const identityBound = checkpointConfig({
        episodeId: state.episodeId,
        runId,
        threadId: lookupConfig.configurable.thread_id,
        traceId: `${state.episodeId}:run:${runId}`,
      });
      state = (
        await restoreVerifiedCheckpoint({
          checkpointer,
          config: identityBound,
        })
      ).state;
      roleOutputRefsCurrent(
        repoRoot,
        state,
        input.contracts ?? loadRoleModelContractFile({repoRoot}),
      );
    } else {
      const existing = await checkpointer.getTuple(lookupConfig);
      if (existing) {
        throw new Error("ORCHESTRATOR_CHECKPOINT_EXISTS_USE_RESUME");
      }
      runId = runId ?? defaultRunId();
      const controlRef = episodeControlRef({
        repoRoot,
        episodeId: input.episodeId,
        createdAt: createdAt(),
      });
      state = createInitialProductionState({
        episodeId: input.episodeId,
        runId,
        artifacts: {episodeConfig: controlRef},
      });
    }

    const runtime = createLangGraphEntrypoint({...input, repoRoot, state, runId});
    try {
      let resumeValue = input.resumeValue;
      if (input.resume && resumeValue === undefined && input.approvalFile) {
        const approvalPath = repositoryPath(repoRoot, input.approvalFile);
        resumeValue = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as unknown;
      }
      if (input.resume && resumeValue === undefined && input.capabilityResultFile) {
        const capabilityPath = repositoryPath(repoRoot, input.capabilityResultFile);
        resumeValue = JSON.parse(fs.readFileSync(capabilityPath, "utf8")) as unknown;
      }
      if (input.resume && resumeValue === undefined) {
        const previousHandoff = readHandoff(repoRoot, input.episodeId, runId);
        if (previousHandoff && previousHandoff.gate !== "external-capability") {
          return {
            mode: "langgraph",
            status: "paused",
            episodeId: input.episodeId,
            runId,
            threadId: input.episodeId,
            state,
            handoff: previousHandoff,
            nextAction: previousHandoff.nextAction,
          };
        }
        if (previousHandoff?.gate === "external-capability") {
          resumeValue = {kind: "external-capability-resolved"};
        }
      }

      const result = input.resume
        ? await runtime.graph.invoke(resumeCheckpoint(resumeValue), runtime.config)
        : await runtime.graph.invoke(state, runtime.config);
      const snapshot = await runtime.graph.getState(runtime.config);
      const outerState = stateFromSnapshot(snapshot);
      const nestedState = await runtime.readProductionState();
      const pause = interruptPayloads(result)[0] ?? snapshotInterruptPayloads(snapshot)[0];
      // A nested production pause owns the newest media checkpoints. Once the
      // parent has advanced to a human gate, its state also contains the
      // parent-only delivery completion and must remain authoritative.
      const latestState =
        (pause?.gate === "external-capability"
          ? nestedState ?? outerState
          : outerState ?? nestedState) ?? assertReferenceOnlyState(result);
      if (pause) {
        const handoff = createHandoff({
          repoRoot,
          episodeId: input.episodeId,
          runId,
          payload: pause,
          state: latestState,
        });
        return {
          mode: "langgraph",
          status: "paused",
          episodeId: input.episodeId,
          runId,
          threadId: input.episodeId,
          state: latestState,
          handoff,
          nextAction: handoff.nextAction,
        };
      }
      return {
        mode: "langgraph",
        status: latestState.phase === "published" ? "completed" : "halted",
        episodeId: input.episodeId,
        runId,
        threadId: input.episodeId,
        state: latestState,
        nextAction:
          latestState.phase === "published"
            ? "Final approval recorded; no external publication was performed."
            : latestState.haltReason,
      };
    } catch (error) {
      if (input.resume && unresolvedExternalCapabilityError(error)) {
        const previousHandoff = readHandoff(repoRoot, input.episodeId, runId);
        if (previousHandoff?.gate === "external-capability") {
          const nestedState = nestedProductionStateFromError(error) ?? (await runtime.readProductionState());
          return {
            mode: "langgraph",
            status: "paused",
            episodeId: input.episodeId,
            runId,
            threadId: input.episodeId,
            state: nestedState ?? state,
            handoff: previousHandoff,
            nextAction: previousHandoff.nextAction,
          };
        }
      }
      throw error;
    } finally {
      await runtime.close();
    }
  } finally {
    if (ownsCheckpointer) await closeCheckpointBackend(checkpointer);
  }
};

export const runEpisodeOrchestrator = async (
  input: ProductionEntrypointRunOptions,
): Promise<OrchestratorRunResult> => {
  const mode = selectOrchestrator(input.env?.ORCHESTRATOR ?? process.env.ORCHESTRATOR);
  if (mode === "manual") return manualHandoff(input.episodeId);
  return runLangGraphEpisode(input);
};

export type ParsedOrchestrateArgs = {
  episodeId: string;
  resume: boolean;
  approvalFile?: string;
  capabilityResultFile?: string;
  runId?: string;
  repoRoot: string;
  databasePath?: string;
};

export const parseOrchestrateArgs = (
  args: readonly string[],
  defaults: {repoRoot: string},
): ParsedOrchestrateArgs | {help: true} => {
  let episodeId: string | undefined;
  let approvalFile: string | undefined;
  let capabilityResultFile: string | undefined;
  let runId: string | undefined;
  let repoRoot = defaults.repoRoot;
  let databasePath: string | undefined;
  let resume = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return {help: true};
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    const next = args[index + 1];
    if (arg === "--episode" && next) {
      episodeId = next;
      index += 1;
      continue;
    }
    if (arg === "--approval-file" && next) {
      approvalFile = next;
      index += 1;
      continue;
    }
    if ((arg === "--capability-result" || arg === "--capability-result-file") && next) {
      capabilityResultFile = next;
      index += 1;
      continue;
    }
    if ((arg === "--run" || arg === "--run-id") && next) {
      runId = next;
      index += 1;
      continue;
    }
    if (arg === "--repo-root" && next) {
      repoRoot = next;
      index += 1;
      continue;
    }
    if (arg === "--database-path" && next) {
      databasePath = next;
      index += 1;
      continue;
    }
    throw new Error(`ORCHESTRATOR_UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!episodeId) throw new Error("ORCHESTRATOR_EPISODE_REQUIRED:use --episode episode-004");
  if (approvalFile && capabilityResultFile) {
    throw new Error("ORCHESTRATOR_RESUME_INPUTS_ARE_MUTUALLY_EXCLUSIVE");
  }
  return {episodeId, resume, approvalFile, capabilityResultFile, runId, repoRoot, databasePath};
};

export const productionStageStatusSummary = (
  state: ProductionState,
): Record<ProductionStageName, string> =>
  Object.fromEntries(
    productionStageNames.map((stage) => [
      stage,
      state.productionStages[stage]?.status ?? "PENDING",
    ]),
  ) as Record<ProductionStageName, string>;
