import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertArtifactRefBytes, buildArtifactRef} from "../../artifact-registry";
import {ROLE_MODEL_POLICY_VERSION} from "../../config/agent-model-policy";
import {
  assertBenchmarkRoleAllowed,
  loadRoleModelBenchmarkConfig,
  resolveBenchmarkCandidates,
  sanitizeBenchmarkSlug,
  type BenchmarkCandidatePolicy,
  type RoleModelBenchmarkConfig,
} from "../../config/role-model-benchmark";
import type {AgentExecutionRequest, AgentName} from "../../schemas/agent";
import type {ArtifactRef} from "../../schemas/artifact";
import {
  benchmarkCandidateResultSchema,
  benchmarkInputManifestSchema,
  benchmarkResultSchema,
  type BenchmarkCandidateResult,
  type BenchmarkDownstreamCritic,
  type BenchmarkHumanReview,
  type BenchmarkInputManifest,
  type BenchmarkPairwiseComparison,
  type BenchmarkResult,
} from "../../schemas/role-model-benchmark";
import {stableJson} from "../../stable-json";
import {
  emptyHostedChatUsage,
  redactHostedSecrets,
  type HostedChatJsonFn,
  type HostedChatProvider,
} from "../providers/hosted-chat";
import {reasoningConfigSchema, type ReasoningConfig} from "../../config/reasoning";
import {createHostedAgentBackend, type HostedAgentCallRecord} from "../adapters/hosted-agent";
import {skippedDownstreamCritic} from "./script-writer-evaluate";
import {evaluateRoleBenchmarkOutput, type RoleBenchmarkEvaluation} from "./role-aware-evaluate";
import {getRoleModelContract, roleContractIsExecutable} from "./role-contract";

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`benchmark path escapes repository: ${repositoryPath}`);
  }
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`benchmark path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

const writeJsonAtomically = (repoRoot: string, repositoryPath: string, value: unknown): void => {
  const absolutePath = resolveRepositoryPath(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${stableJson(value)}\n`);
  fs.renameSync(temporaryPath, absolutePath);
};

const readRepositoryFile = (repoRoot: string, repositoryPath: string): string =>
  fs.readFileSync(resolveRepositoryPath(repoRoot, repositoryPath), "utf8");

export const benchmarkRootPath = (episodeId: string, benchmarkId: string): string =>
  `content/${episodeId}/rollout/benchmarks/${benchmarkId}`;

export const benchmarkCandidateDir = (
  episodeId: string,
  benchmarkId: string,
  candidateId: string,
): string => `${benchmarkRootPath(episodeId, benchmarkId)}/${sanitizeBenchmarkSlug(candidateId)}`;

export const hashRepairContext = (input: {appendix?: string; repairRound?: number} = {}): string =>
  sha256(
    stableJson({
      appendix: input.appendix ?? "",
      repairRound: input.repairRound ?? 0,
    }),
  );

export const EMPTY_REPAIR_CONTEXT_HASH = hashRepairContext();

export const benchmarkOutputVariant = (repairContextHash: string): string =>
  repairContextHash === EMPTY_REPAIR_CONTEXT_HASH
    ? "base"
    : `repair-${repairContextHash.slice(0, 16)}`;

export const relocateBenchmarkOutputPath = (
  episodeId: string,
  benchmarkId: string,
  candidateId: string,
  declaredPath: string,
  repairContextHash: string = EMPTY_REPAIR_CONTEXT_HASH,
): string => {
  const prefix = `content/${episodeId}/`;
  const relative = declaredPath.startsWith(prefix)
    ? declaredPath.slice(prefix.length)
    : declaredPath;
  return `${benchmarkCandidateDir(episodeId, benchmarkId, candidateId)}/${benchmarkOutputVariant(repairContextHash)}/${relative}`;
};

export const hashBenchmarkInput = (input: {
  episodeId: string;
  agentName: AgentName;
  revisionRound: number;
  policyVersion: string;
  promptRef: ArtifactRef;
  inputArtifacts: readonly ArtifactRef[];
  upstreamGateRefs: readonly ArtifactRef[];
  expectedOutputs: AgentExecutionRequest["expectedOutputs"];
}): string =>
  sha256(
    stableJson({
      episodeId: input.episodeId,
      agentName: input.agentName,
      revisionRound: input.revisionRound,
      policyVersion: input.policyVersion,
      prompt: {
        path: input.promptRef.path,
        sha256: input.promptRef.sha256,
        schemaVersion: input.promptRef.schemaVersion,
      },
      inputs: [...input.inputArtifacts]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          path: artifact.path,
          sha256: artifact.sha256,
          schemaVersion: artifact.schemaVersion,
        })),
      gates: [...input.upstreamGateRefs]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          path: artifact.path,
          sha256: artifact.sha256,
          schemaVersion: artifact.schemaVersion,
        })),
      expectedOutputs: [...input.expectedOutputs].sort((left, right) =>
        left.artifactId.localeCompare(right.artifactId),
      ),
    }),
  );

export const hashBenchmarkIdentity = (input: {
  inputHash: string;
  agentName: AgentName;
  provider: string;
  model: string;
  promptVersion: string;
  reasoning?: ReasoningConfig;
  repairContextHash?: string;
  roleContractVersion?: string;
}): string =>
  sha256(
    stableJson({
      inputHash: input.inputHash,
      agentName: input.agentName,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      reasoning: reasoningConfigSchema.parse(input.reasoning ?? {profile: "none"}),
      repairContextHash: input.repairContextHash ?? EMPTY_REPAIR_CONTEXT_HASH,
      roleContractVersion: input.roleContractVersion ?? "role-contract-v1",
    }),
  );

export const deriveCandidateOutcome = (input: {
  hostedStatus: "SUCCEEDED" | "FAILED";
  schemaValid: boolean;
  hardValidatorStatus: "PASS" | "FAIL";
  repairRound: number;
}): "PASS" | "PASS_AFTER_REPAIR" | "FAIL" => {
  const passed =
    input.hostedStatus === "SUCCEEDED" && input.schemaValid && input.hardValidatorStatus === "PASS";
  if (!passed) return "FAIL";
  return input.repairRound > 0 ? "PASS_AFTER_REPAIR" : "PASS";
};

export const formatBenchmarkOutcome = (input: {
  outcome: "PASS" | "PASS_AFTER_REPAIR" | "FAIL";
  repairRound: number;
}): string =>
  input.outcome === "PASS_AFTER_REPAIR"
    ? `PASS_AFTER_REPAIR(round=${input.repairRound})`
    : input.outcome;

export const assertFrozenBenchmarkInputs = (
  repoRoot: string,
  manifest: BenchmarkInputManifest,
): void => {
  const refs = [manifest.promptRef, ...manifest.inputArtifacts, ...manifest.upstreamGateRefs];
  for (const ref of refs) {
    if (ref.episodeId !== manifest.episodeId) {
      throw new Error(`BENCHMARK_INPUT_TAMPERED:${ref.artifactId}`);
    }
    try {
      assertArtifactRefBytes(repoRoot, ref);
    } catch {
      throw new Error(`BENCHMARK_INPUT_TAMPERED:${ref.artifactId}`);
    }
  }
  for (const ref of manifest.canonicalOutputRefs) {
    try {
      assertArtifactRefBytes(repoRoot, ref);
    } catch {
      throw new Error(`BENCHMARK_CANONICAL_TAMPERED:${ref.artifactId}`);
    }
  }
};

const factsJsonFromInputs = (repoRoot: string, inputs: readonly ArtifactRef[]): string => {
  const facts = inputs.find((artifact) => artifact.path.endsWith("/research/facts.json"));
  if (!facts) throw new Error("benchmark request is missing research/facts.json");
  return readRepositoryFile(repoRoot, facts.path);
};

export const evaluatePromotionEligibility = (input: {
  schemaValid: boolean;
  expectedOutputsComplete: boolean;
  hardValidatorStatus: "PASS" | "FAIL";
  unsupportedClaimCount: number;
  canonicalUnsupportedClaimCount: number;
  newBlockerCount: number;
  canonicalUnchanged: boolean;
  repairRound?: number;
}): {eligible: boolean; reasons: string[]} => {
  const reasons: string[] = [];
  if (!input.schemaValid) reasons.push("schema-invalid");
  if (!input.expectedOutputsComplete) reasons.push("expected-outputs-incomplete");
  if (input.hardValidatorStatus !== "PASS") reasons.push("hard-validator-failed");
  if (input.unsupportedClaimCount > input.canonicalUnsupportedClaimCount) {
    reasons.push("unsupported-factual-regression");
  }
  if (input.newBlockerCount > 0) reasons.push("new-blocker");
  if (!input.canonicalUnchanged) reasons.push("canonical-contract-changed");
  if ((input.repairRound ?? 0) > 0) reasons.push("repaired-payload");
  return {eligible: reasons.length === 0, reasons};
};

const pairwiseComparisons = (
  candidates: readonly BenchmarkCandidateResult[],
): BenchmarkPairwiseComparison[] => {
  const ordered = [...candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
  const pairs: BenchmarkPairwiseComparison[] = [];
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex];
      const right = ordered[rightIndex];
      if (!left || !right) continue;
      if (left.repairContextHash !== right.repairContextHash) continue;
      const leftHashes = new Map(left.outputHashes.map((item) => [item.artifactId, item.sha256]));
      const changedArtifactIds = right.outputHashes
        .filter((item) => leftHashes.get(item.artifactId) !== item.sha256)
        .map((item) => item.artifactId)
        .sort();
      pairs.push({
        leftCandidateId: left.candidateId,
        rightCandidateId: right.candidateId,
        structuralDiff: {
          byteEqual:
            changedArtifactIds.length === 0 &&
            left.outputHashes.length === right.outputHashes.length,
          outputLengthDelta: right.outputLength - left.outputLength,
          changedArtifactIds,
        },
        validatorFailures: {
          left: left.hardValidators.failures,
          right: right.hardValidators.failures,
        },
        claimCoverage: {
          left: left.factualContract.claimCoverage,
          right: right.factualContract.claimCoverage,
        },
        unsupportedClaimCount: {
          left: left.factualContract.unsupportedClaimCount,
          right: right.factualContract.unsupportedClaimCount,
        },
        outputLength: {left: left.outputLength, right: right.outputLength},
        downstreamCritic: {left: left.downstreamCritic, right: right.downstreamCritic},
        latencyMs: {left: left.latencyMs, right: right.latencyMs},
        tokens: {left: left.usage, right: right.usage},
      });
    }
  }
  return pairs;
};

export const assembleBenchmarkResult = (input: {
  manifest: BenchmarkInputManifest;
  candidates: readonly BenchmarkCandidateResult[];
  humanReview?: BenchmarkHumanReview;
}): BenchmarkResult => {
  const ordered = [...input.candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
  return benchmarkResultSchema.parse({
    schemaVersion: "model-benchmark-v1",
    kind: "result",
    benchmarkId: input.manifest.benchmarkId,
    inputHash: input.manifest.inputHash,
    episodeId: input.manifest.episodeId,
    agentName: input.manifest.agentName,
    policyVersion: ROLE_MODEL_POLICY_VERSION,
    candidateIds: ordered.map((candidate) => candidate.candidateId),
    candidates: ordered,
    pairwise: pairwiseComparisons(ordered),
    eligibleCandidateIds: ordered
      .filter((candidate) => candidate.promotionEligible && candidate.outcome === "PASS")
      .map((candidate) => candidate.candidateId),
    automaticPromotion: false,
    promotionRequires: "explicit-config-or-human-decision",
    canonicalUnchanged: true,
    humanReview: input.humanReview ?? {
      notes: null,
      preferredCandidateId: null,
      decisionId: null,
    },
  });
};

export const mergeBenchmarkResults = (
  base: BenchmarkResult,
  patch: BenchmarkResult,
  manifest: BenchmarkInputManifest,
): BenchmarkResult => {
  const merged = new Map(base.candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const candidate of patch.candidates) {
    merged.set(candidate.candidateId, candidate);
  }
  return assembleBenchmarkResult({
    manifest,
    candidates: [...merged.values()],
    humanReview: patch.humanReview,
  });
};

export const writeBenchmarkAggregate = (
  repoRoot: string,
  episodeId: string,
  benchmarkId: string,
  result: BenchmarkResult,
): void => {
  writeJsonAtomically(
    repoRoot,
    `${benchmarkRootPath(episodeId, benchmarkId)}/benchmark-result.json`,
    result,
  );
  writeJsonAtomically(
    repoRoot,
    `${benchmarkRootPath(episodeId, benchmarkId)}/benchmark-comparison.json`,
    {schemaVersion: "model-benchmark-v1", kind: "comparison", pairwise: result.pairwise},
  );
};

export type BenchmarkProgressEvent = {
  phase: "start" | "complete" | "failed";
  candidateId: string;
  model: string;
  status?: "SUCCEEDED" | "FAILED";
  cacheHit?: boolean;
  error?: string;
};

export const formatBenchmarkProgress = (event: BenchmarkProgressEvent): string => {
  if (event.phase === "start") {
    return `[benchmark] start candidate=${event.candidateId} model=${event.model}`;
  }
  if (event.phase === "failed") {
    return `[benchmark] failed candidate=${event.candidateId} model=${event.model} error=${event.error ?? ""}`;
  }
  const cacheHit = event.cacheHit ? " cacheHit=true" : "";
  return `[benchmark] complete candidate=${event.candidateId} model=${event.model} status=${event.status ?? "SUCCEEDED"}${cacheHit}`;
};

export type RoleModelBenchmarkOptions = {
  repoRoot: string;
  request: AgentExecutionRequest;
  modelSet?: string;
  candidateIds?: readonly string[];
  config?: RoleModelBenchmarkConfig;
  env?: NodeJS.ProcessEnv;
  apiKeyForCandidate?: (candidateId: string, apiKeyEnv: string) => string | undefined;
  provider?: HostedChatProvider;
  chat?: HostedChatJsonFn;
  createdAt?: () => string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onProgress?: (event: BenchmarkProgressEvent) => void;
  userMessageAppendix?: string;
  repairRound?: number;
  runDownstreamCritic?: (input: {
    candidateId: string;
    markdown: string;
    outputArtifacts: readonly ArtifactRef[];
  }) => BenchmarkDownstreamCritic | Promise<BenchmarkDownstreamCritic>;
  humanReview?: BenchmarkHumanReview;
};

export const candidateCachePath = (
  episodeId: string,
  benchmarkId: string,
  identity: string,
): string => `${benchmarkRootPath(episodeId, benchmarkId)}/cache/${identity}.json`;

export const forgetCachedBenchmarkCandidate = (
  repoRoot: string,
  episodeId: string,
  benchmarkId: string,
  identity: string,
): void => {
  const relative = candidateCachePath(episodeId, benchmarkId, identity);
  const absolute = resolveRepositoryPath(repoRoot, relative);
  if (fs.existsSync(absolute)) fs.rmSync(absolute);
};

const readCachedCandidate = (
  repoRoot: string,
  cachePath: string,
): BenchmarkCandidateResult | undefined => {
  const absolute = path.resolve(repoRoot, cachePath);
  if (!fs.existsSync(absolute)) return undefined;
  try {
    const parsed = benchmarkCandidateResultSchema.parse(
      JSON.parse(fs.readFileSync(absolute, "utf8")) as unknown,
    );
    if (parsed.status !== "SUCCEEDED") return undefined;
    for (const artifact of parsed.outputArtifacts) {
      assertArtifactRefBytes(repoRoot, artifact);
    }
    return parsed;
  } catch {
    return undefined;
  }
};

const runOneCandidate = async (input: {
  options: RoleModelBenchmarkOptions;
  request: AgentExecutionRequest;
  manifest: BenchmarkInputManifest;
  candidateId: string;
  policy: BenchmarkCandidatePolicy;
  factsJson: string;
  canonicalEvaluation: RoleBenchmarkEvaluation;
}): Promise<BenchmarkCandidateResult> => {
  const {options, request, manifest, candidateId, policy} = input;
  const repairRound = options.repairRound ?? 0;
  const repairContextHash = hashRepairContext({
    appendix: options.userMessageAppendix ?? "",
    repairRound,
  });
  const identity = hashBenchmarkIdentity({
    inputHash: manifest.inputHash,
    agentName: request.agentName,
    provider: policy.provider,
    model: policy.model,
    reasoning: policy.reasoning,
    promptVersion: `${request.promptRef.schemaVersion}:${request.promptRef.sha256}`,
    repairContextHash,
    roleContractVersion: getRoleModelContract(request.agentName).cacheIdentityVersion,
  });
  assertFrozenBenchmarkInputs(options.repoRoot, manifest);
  const cachePath = candidateCachePath(request.episodeId, manifest.benchmarkId, identity);
  const emitProgress = (event: BenchmarkProgressEvent): void => {
    (options.onProgress ?? ((item) => console.log(formatBenchmarkProgress(item))))(event);
  };
  const cached = readCachedCandidate(options.repoRoot, cachePath);
  if (cached) {
    const hit = {...cached, cacheHit: true, identity};
    emitProgress({
      phase: "complete",
      candidateId,
      model: policy.model,
      status: hit.status,
      cacheHit: true,
    });
    return hit;
  }

  emitProgress({phase: "start", candidateId, model: policy.model});

  const hostedCalls: HostedAgentCallRecord[] = [];
  const apiKey =
    options.apiKeyForCandidate?.(candidateId, policy.apiKeyEnv) ??
    (options.env ?? process.env)[policy.apiKeyEnv];
  const describeFailure = (detail: string): string =>
    redactHostedSecrets(`candidate=${candidateId} model=${policy.model} ${detail}`, [apiKey]);
  const backend = createHostedAgentBackend({
    repoRoot: options.repoRoot,
    policy: {
      ...policy,
      mode: "hosted-llm",
      fallbackMode: "none",
    },
    env: options.env,
    apiKey,
    provider: options.provider,
    chat: options.chat,
    createdAt: options.createdAt,
    now: options.now,
    sleep: options.sleep,
    producerFor: () => `hosted-benchmark:${sanitizeBenchmarkSlug(candidateId)}`,
    relocateOutputPath: (declaredPath) =>
      relocateBenchmarkOutputPath(
        request.episodeId,
        manifest.benchmarkId,
        candidateId,
        declaredPath,
        repairContextHash,
      ),
    userMessageAppendix: options.userMessageAppendix,
    onCall: (record) => hostedCalls.push(record),
  });

  let outputArtifacts: ArtifactRef[] = [];
  let failureDetail: string | null = null;
  let status: "SUCCEEDED" | "FAILED" = "FAILED";
  try {
    const result = await backend(request);
    outputArtifacts = [...result.outputArtifacts];
    status = result.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
    if (result.status !== "SUCCEEDED") {
      failureDetail = describeFailure(result.failure?.detail ?? result.decision.summary);
    }
  } catch (error) {
    failureDetail = describeFailure(errorMessage(error));
  }

  if (status === "SUCCEEDED") {
    emitProgress({phase: "complete", candidateId, model: policy.model, status});
  } else {
    emitProgress({
      phase: "failed",
      candidateId,
      model: policy.model,
      status,
      error: failureDetail ?? "unknown error",
    });
  }

  const telemetry = hostedCalls.at(-1);
  const evaluation = evaluateRoleBenchmarkOutput({
    repoRoot: options.repoRoot,
    request,
    outputArtifacts,
    status,
    factsJson: input.factsJson,
  });
  const expectedOutputsComplete =
    outputArtifacts.length === request.expectedOutputs.length &&
    request.expectedOutputs.every((expected) =>
      outputArtifacts.some((artifact) => artifact.artifactId === expected.artifactId),
    );
  const downstreamCritic = options.runDownstreamCritic
    ? await options.runDownstreamCritic({
        candidateId,
        markdown:
          outputArtifacts[0] && fs.existsSync(path.join(options.repoRoot, outputArtifacts[0].path))
            ? readRepositoryFile(options.repoRoot, outputArtifacts[0].path)
            : "",
        outputArtifacts,
      })
    : skippedDownstreamCritic();
  const hardValidatorStatus = evaluation.hardFailures.length === 0 ? "PASS" : "FAIL";
  const newBlockerCount = downstreamCritic.blockerCount;
  const schemaValid = evaluation.schemaValid && status === "SUCCEEDED";
  const outcome = deriveCandidateOutcome({
    hostedStatus: status,
    schemaValid,
    hardValidatorStatus,
    repairRound,
  });
  const eligibility = evaluatePromotionEligibility({
    schemaValid,
    expectedOutputsComplete,
    hardValidatorStatus,
    unsupportedClaimCount: evaluation.unsupportedClaimIds.length,
    canonicalUnsupportedClaimCount: input.canonicalEvaluation.unsupportedClaimIds.length,
    newBlockerCount,
    canonicalUnchanged: true,
    repairRound,
  });

  const record = benchmarkCandidateResultSchema.parse({
    schemaVersion: "model-benchmark-v1",
    kind: "candidate",
    benchmarkId: manifest.benchmarkId,
    identity,
    candidateId,
    provider: policy.provider,
    model: policy.model,
    reasoningProfile: telemetry?.reasoningProfile ?? policy.reasoning.profile,
    cacheHit: false,
    status,
    outcome,
    repairRound,
    repairContextHash,
    schemaValid,
    expectedOutputsComplete,
    hardValidators: {
      status: hardValidatorStatus,
      failures: evaluation.hardFailures,
    },
    factualContract: {
      status: evaluation.unsupportedClaimIds.length === 0 ? "PASS" : "FAIL",
      claimIds: evaluation.claimIds,
      unsupportedClaimIds: evaluation.unsupportedClaimIds,
      unsupportedClaimCount: evaluation.unsupportedClaimIds.length,
      claimCoverage: evaluation.claimCoverage,
    },
    downstreamCritic,
    latencyMs: telemetry?.latencyMs ?? 0,
    attempt: request.attempt,
    retryCount: telemetry?.retryCount ?? 0,
    usage: telemetry?.usage ?? emptyHostedChatUsage(),
    outputArtifacts,
    outputHashes: outputArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      sha256: artifact.sha256,
    })),
    outputLength: evaluation.outputLength,
    failureDetail,
    promotionEligible: eligibility.eligible,
    ineligibilityReasons: eligibility.reasons,
  });
  if (record.status === "SUCCEEDED") {
    writeJsonAtomically(options.repoRoot, cachePath, record);
  }
  writeJsonAtomically(
    options.repoRoot,
    `${benchmarkCandidateDir(request.episodeId, manifest.benchmarkId, candidateId)}/candidate-result.json`,
    record,
  );
  return record;
};

export const buildBenchmarkInputManifest = (input: {
  repoRoot: string;
  request: AgentExecutionRequest;
  createdAt?: () => string;
}): BenchmarkInputManifest => {
  assertArtifactRefBytes(input.repoRoot, input.request.promptRef);
  for (const artifact of input.request.inputArtifacts) {
    assertArtifactRefBytes(input.repoRoot, artifact);
  }
  for (const artifact of input.request.upstreamGateRefs) {
    assertArtifactRefBytes(input.repoRoot, artifact);
  }
  const canonicalOutputRefs = input.request.expectedOutputs.flatMap((output) => {
    const absolute = path.resolve(input.repoRoot, output.path);
    if (!fs.existsSync(absolute)) return [];
    return [
      buildArtifactRef({
        repoRoot: input.repoRoot,
        artifactId: output.artifactId,
        episodeId: input.request.episodeId,
        path: output.path,
        mediaType: output.path.endsWith(".json") ? "application/json" : "text/markdown",
        schemaVersion: output.schemaVersion,
        producer: "canonical",
        createdAt: input.createdAt?.(),
      }),
    ];
  });
  const inputHash = hashBenchmarkInput({
    episodeId: input.request.episodeId,
    agentName: input.request.agentName,
    revisionRound: input.request.revisionRound,
    policyVersion: ROLE_MODEL_POLICY_VERSION,
    promptRef: input.request.promptRef,
    inputArtifacts: input.request.inputArtifacts,
    upstreamGateRefs: input.request.upstreamGateRefs,
    expectedOutputs: input.request.expectedOutputs,
  });
  return benchmarkInputManifestSchema.parse({
    schemaVersion: "model-benchmark-v1",
    kind: "input",
    benchmarkId: `bm-${inputHash.slice(0, 16)}`,
    inputHash,
    episodeId: input.request.episodeId,
    agentName: input.request.agentName,
    policyVersion: ROLE_MODEL_POLICY_VERSION,
    revisionRound: input.request.revisionRound,
    promptRef: input.request.promptRef,
    inputArtifacts: [...input.request.inputArtifacts],
    upstreamGateRefs: [...input.request.upstreamGateRefs],
    expectedOutputs: [...input.request.expectedOutputs],
    canonicalOutputRefs,
  });
};

export const runRoleModelBenchmark = async (
  options: RoleModelBenchmarkOptions,
): Promise<{manifest: BenchmarkInputManifest; result: BenchmarkResult}> => {
  const config = options.config ?? loadRoleModelBenchmarkConfig({repoRoot: options.repoRoot});
  assertBenchmarkRoleAllowed(options.request.agentName, config);
  if (!roleContractIsExecutable(options.request.agentName)) {
    const contract = getRoleModelContract(options.request.agentName);
    throw new Error(
      `benchmark capability contract is not configured for ${options.request.agentName}: ${contract.capabilities.join(",")}`,
    );
  }
  const candidates = options.candidateIds
    ? options.candidateIds.map((id) => {
        const policy = config.candidates[id];
        if (!policy) throw new Error(`unknown benchmark candidate: ${id}`);
        return {id, policy};
      })
    : resolveBenchmarkCandidates(options.modelSet ?? config.defaultModelSet, config);

  const sharedRequest: AgentExecutionRequest = {
    ...options.request,
    executionId: options.request.executionId,
    attempt: options.request.attempt,
  };
  const manifest = buildBenchmarkInputManifest({
    repoRoot: options.repoRoot,
    request: sharedRequest,
    createdAt: options.createdAt,
  });
  writeJsonAtomically(
    options.repoRoot,
    `${benchmarkRootPath(sharedRequest.episodeId, manifest.benchmarkId)}/benchmark-input.json`,
    manifest,
  );

  const factsJson = factsJsonFromInputs(options.repoRoot, sharedRequest.inputArtifacts);
  const canonicalEvaluation = evaluateRoleBenchmarkOutput({
    repoRoot: options.repoRoot,
    request: sharedRequest,
    outputArtifacts: manifest.canonicalOutputRefs,
    status: "SUCCEEDED",
    factsJson,
  });

  const results: BenchmarkCandidateResult[] = [];
  for (const candidate of candidates) {
    assertFrozenBenchmarkInputs(options.repoRoot, manifest);
    results.push(
      await runOneCandidate({
        options,
        request: sharedRequest,
        manifest,
        candidateId: candidate.id,
        policy: candidate.policy,
        factsJson,
        canonicalEvaluation,
      }),
    );
    assertFrozenBenchmarkInputs(options.repoRoot, manifest);
  }

  const result = assembleBenchmarkResult({
    manifest,
    candidates: results,
    humanReview: options.humanReview,
  });
  writeBenchmarkAggregate(options.repoRoot, sharedRequest.episodeId, manifest.benchmarkId, result);
  return {manifest, result};
};
