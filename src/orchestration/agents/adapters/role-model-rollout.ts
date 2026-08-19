import fs from "node:fs";
import path from "node:path";
import {assertArtifactRefBytes} from "../../artifact-registry";
import {
  resolveEffectiveRoleModelPolicy,
  type AgentModelPolicyFile,
  type ResolvedRoleModelPolicy,
  type RoleModelPolicyPatch,
} from "../../config/agent-model-policy";
import type {AgentExecutionRequest, AgentExecutionResult, AgentName} from "../../schemas/agent";
import type {ArtifactRef} from "../../schemas/artifact";
import {
  roleModelExecutionRecordSchema,
  roleModelShadowComparisonSchema,
  type RoleModelExecutionRecord,
  type RoleModelShadowComparison,
} from "../../schemas/role-model-rollout";
import {stableJson} from "../../stable-json";
import {
  emptyHostedChatUsage,
  type HostedChatJsonFn,
  type HostedChatProvider,
} from "../providers/hosted-chat";
import {createAgentRunner, type AgentBackend, type AgentRunner} from "../run-agent";
import {createHostedAgentBackend, type HostedAgentCallRecord} from "./hosted-agent";
import {createManualFileAdapter} from "./manual-file";

export type RoleModelRolloutAdapterOptions = {
  repoRoot: string;
  policies?: AgentModelPolicyFile;
  runOverrides?: Partial<Record<AgentName, RoleModelPolicyPatch>>;
  env?: NodeJS.ProcessEnv;
  apiKey?: string;
  provider?: HostedChatProvider;
  chat?: HostedChatJsonFn;
  onCall?: (record: RoleModelExecutionRecord) => void;
  createdAt?: () => string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  previousArtifacts?: Readonly<Record<string, ArtifactRef>>;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const sanitizeExecutionId = (executionId: string): string =>
  executionId.replace(/[^a-z0-9-]+/giu, "-").replace(/^-+|-+$/gu, "") || "execution";

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`hosted-agent path escapes repository: ${repositoryPath}`);
  }
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`hosted-agent path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

const writeRepositoryFileAtomically = (
  repoRoot: string,
  repositoryPath: string,
  content: string,
): void => {
  const absolutePath = resolveRepositoryPath(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, absolutePath);
};

export const shadowOutputPath = (
  episodeId: string,
  agentName: AgentName,
  canonicalPath: string,
): string => {
  const prefix = `content/${episodeId}/`;
  const relative = canonicalPath.startsWith(prefix)
    ? canonicalPath.slice(prefix.length)
    : canonicalPath;
  return `content/${episodeId}/rollout/shadow/${agentName}/${relative}`;
};

export const shadowArtifactId = (
  episodeId: string,
  agentName: AgentName,
  canonicalArtifactId: string,
): string => {
  const leaf = canonicalArtifactId.split(":")[2] ?? "output";
  return `${episodeId}:shadow:${agentName}-${leaf}`;
};

const executionRecordPath = (
  episodeId: string,
  agentName: AgentName,
  executionId: string,
): string =>
  `content/${episodeId}/rollout/executions/${agentName}-${sanitizeExecutionId(executionId)}.json`;

const comparisonPath = (episodeId: string, agentName: AgentName, executionId: string): string =>
  `content/${episodeId}/rollout/comparisons/${agentName}-${sanitizeExecutionId(executionId)}.json`;

const writeExecutionRecord = (
  repoRoot: string,
  record: RoleModelExecutionRecord,
): RoleModelExecutionRecord => {
  const parsed = roleModelExecutionRecordSchema.parse(record);
  writeRepositoryFileAtomically(
    repoRoot,
    executionRecordPath(parsed.episodeId, parsed.agentName, parsed.executionId),
    `${stableJson(parsed)}\n`,
  );
  return parsed;
};

const writeComparison = (
  repoRoot: string,
  comparison: RoleModelShadowComparison,
): RoleModelShadowComparison => {
  const parsed = roleModelShadowComparisonSchema.parse(comparison);
  writeRepositoryFileAtomically(
    repoRoot,
    comparisonPath(parsed.episodeId, parsed.role, parsed.executionId),
    `${stableJson(parsed)}\n`,
  );
  return parsed;
};

const remapToShadow = (request: AgentExecutionRequest): AgentExecutionRequest => ({
  ...request,
  expectedOutputs: request.expectedOutputs.map((output) => ({
    artifactId: shadowArtifactId(request.episodeId, request.agentName, output.artifactId),
    path: shadowOutputPath(request.episodeId, request.agentName, output.path),
    schemaVersion: output.schemaVersion,
  })),
});

const structuralValidator = (
  repoRoot: string,
  refs: readonly ArtifactRef[],
): RoleModelShadowComparison["validatorResult"] => {
  if (refs.length === 0) {
    return {status: "failed", detail: "shadow produced no candidate artifacts"};
  }
  for (const ref of refs) {
    try {
      assertArtifactRefBytes(repoRoot, ref);
      if (ref.path.endsWith(".json")) {
        JSON.parse(fs.readFileSync(resolveRepositoryPath(repoRoot, ref.path), "utf8"));
      }
    } catch (error) {
      return {status: "failed", detail: errorMessage(error)};
    }
  }
  return {status: "passed", detail: "shadow candidate bytes and schema shape validated"};
};

const buildComparison = (input: {
  request: AgentExecutionRequest;
  policy: ResolvedRoleModelPolicy;
  manualRefs: readonly ArtifactRef[];
  shadowRefs: readonly ArtifactRef[];
  schemaValidity: "valid" | "invalid";
  validatorResult: RoleModelShadowComparison["validatorResult"];
}): RoleModelShadowComparison => {
  const changedArtifactIds: string[] = [];
  const byCanonicalId = new Map(input.manualRefs.map((ref) => [ref.artifactId, ref]));
  for (const expected of input.request.expectedOutputs) {
    const manual = byCanonicalId.get(expected.artifactId);
    const shadowId = shadowArtifactId(
      input.request.episodeId,
      input.request.agentName,
      expected.artifactId,
    );
    const shadow = input.shadowRefs.find((ref) => ref.artifactId === shadowId);
    if (!manual || !shadow || manual.sha256 !== shadow.sha256) {
      changedArtifactIds.push(expected.artifactId);
    }
  }
  return roleModelShadowComparisonSchema.parse({
    schemaVersion: "role-model-shadow-comparison-v1",
    policyVersion: input.policy.policyVersion,
    episodeId: input.request.episodeId,
    executionId: input.request.executionId,
    role: input.request.agentName,
    provider: input.policy.provider,
    model: input.policy.model,
    manualOutputRef: input.manualRefs[0] ?? null,
    shadowOutputRef: input.shadowRefs[0] ?? null,
    manualOutputRefs: [...input.manualRefs],
    shadowOutputRefs: [...input.shadowRefs],
    schemaValidity: input.schemaValidity,
    validatorResult: input.validatorResult,
    criticGateResult: {
      status: "not-evaluated",
      detail: "shadow output is not admitted to critic or gate evaluation",
    },
    diffSummary: {
      canonicalUnchanged: true,
      byteEqual:
        changedArtifactIds.length === 0 && input.shadowRefs.length === input.manualRefs.length,
      changedArtifactIds,
      shadowIsSourceOfTruth: false,
    },
    shadowIsSourceOfTruth: false,
  });
};

const assertCanonicalUnchanged = (repoRoot: string, refs: readonly ArtifactRef[]): void => {
  for (const ref of refs) assertArtifactRefBytes(repoRoot, ref);
};

export const createRoleModelRolloutBackend = (
  options: RoleModelRolloutAdapterOptions,
): AgentBackend => {
  const manualRunner = createManualFileAdapter({
    repoRoot: options.repoRoot,
    previousArtifacts: options.previousArtifacts,
    createdAt: options.createdAt,
  });

  return async (request: AgentExecutionRequest): Promise<AgentExecutionResult> => {
    const startedAt = options.now?.() ?? Date.now();
    let policy: ResolvedRoleModelPolicy | undefined;
    let usage = emptyHostedChatUsage();
    let retryCount = 0;
    let fallbackUsed = false;
    let outputArtifacts: ArtifactRef[] = [];
    let status: RoleModelExecutionRecord["status"] = "FAILED";
    let result: AgentExecutionResult | undefined;

    const recordCall = (): void => {
      if (!policy) return;
      const record = writeExecutionRecord(options.repoRoot, {
        schemaVersion: "role-model-execution-v1",
        policyVersion: policy.policyVersion,
        agentName: request.agentName,
        mode: policy.mode,
        fallbackMode: policy.fallbackMode,
        fallbackUsed,
        provider: policy.provider,
        model: policy.model,
        episodeId: request.episodeId,
        executionId: request.executionId,
        attempt: request.attempt,
        latencyMs: Math.max(0, (options.now?.() ?? Date.now()) - startedAt),
        status,
        promptRef: request.promptRef,
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts,
        usage,
        retryCount,
      });
      options.onCall?.(record);
    };

    try {
      policy = resolveEffectiveRoleModelPolicy({
        agentName: request.agentName,
        episodeId: request.episodeId,
        runOverride: options.runOverrides?.[request.agentName],
        config: options.policies,
      });

      if (policy.mode === "manual") {
        result = await manualRunner(request);
        outputArtifacts = [...result.outputArtifacts];
        status = result.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
        return result;
      }

      const hostedCall: HostedAgentCallRecord[] = [];
      const hostedBackend = createHostedAgentBackend({
        repoRoot: options.repoRoot,
        policy: {...policy, mode: "hosted-llm"},
        env: options.env,
        apiKey: options.apiKey,
        provider: options.provider,
        chat: options.chat,
        createdAt: options.createdAt,
        now: options.now,
        sleep: options.sleep,
        onCall: (record) => hostedCall.push(record),
      });

      const adoptHostedTelemetry = (): void => {
        const last = hostedCall.at(-1);
        if (!last) return;
        usage = last.usage;
        retryCount = last.retryCount;
      };

      if (policy.mode === "shadow") {
        const canonical = await manualRunner(request);
        outputArtifacts = [...canonical.outputArtifacts];
        if (canonical.status !== "SUCCEEDED") {
          status = "FAILED";
          return canonical;
        }
        let shadowRefs: ArtifactRef[] = [];
        let schemaValidity: "valid" | "invalid" = "invalid";
        let validatorResult: RoleModelShadowComparison["validatorResult"] = {
          status: "failed",
          detail: "shadow model was not evaluated",
        };
        try {
          const shadowResult = await hostedBackend(remapToShadow(request));
          adoptHostedTelemetry();
          shadowRefs = [...shadowResult.outputArtifacts];
          schemaValidity = "valid";
          validatorResult = structuralValidator(options.repoRoot, shadowRefs);
        } catch (error) {
          adoptHostedTelemetry();
          validatorResult = {status: "failed", detail: errorMessage(error)};
        }
        assertCanonicalUnchanged(options.repoRoot, canonical.outputArtifacts);
        writeComparison(
          options.repoRoot,
          buildComparison({
            request,
            policy,
            manualRefs: canonical.outputArtifacts,
            shadowRefs,
            schemaValidity,
            validatorResult,
          }),
        );
        status = "SUCCEEDED";
        return {
          ...canonical,
          decision: {
            code: "SHADOW_CANONICAL_UNCHANGED",
            summary: `shadow comparison recorded; canonical ${request.agentName} outputs unchanged`,
          },
        };
      }

      try {
        result = await hostedBackend(request);
        adoptHostedTelemetry();
        outputArtifacts = [...result.outputArtifacts];
        status = result.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
        return result;
      } catch (error) {
        adoptHostedTelemetry();
        if (policy.fallbackMode !== "manual") {
          throw error;
        }
        fallbackUsed = true;
        result = await manualRunner(request);
        outputArtifacts = [...result.outputArtifacts];
        status = result.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
        return {
          ...result,
          decision: {
            code: "HOSTED_AGENT_FALLBACK_MANUAL",
            summary: `hosted-llm failed; explicit manual fallback used (${errorMessage(error)})`,
          },
        };
      }
    } finally {
      try {
        recordCall();
      } catch {
        // Recording must never grant a pass. The primary result or thrown error stands.
      }
    }
  };
};

export const createRoleModelRolloutAdapter = (
  options: RoleModelRolloutAdapterOptions,
): AgentRunner => createAgentRunner(createRoleModelRolloutBackend(options));
