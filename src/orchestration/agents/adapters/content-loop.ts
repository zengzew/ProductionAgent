import fs from "node:fs";
import path from "node:path";
import {assertArtifactRefBytes} from "../../artifact-registry";
import {recomputeCriticEvaluation, validateCriticResult} from "../../evaluation";
import {
  parseCriticGate,
  parseFactCheckGate,
  parseRetentionGate,
} from "../../../lib/editorial/story";
import {pauseForExternalCapability} from "../../lg-compat";
import type {AgentExecutionRequest, AgentName} from "../../schemas/agent";
import type {AgentRunner} from "../run-agent";
import type {ArtifactRef} from "../../schemas/artifact";
import type {CriticResult} from "../../schemas/critic-output";
import {
  type ContentArtifactProducer,
  type ContentArtifactRevision,
  type ContentCriticExecution,
  type ContentCriticName,
  type ContentCriticRunner,
  type ContentLoopNodes,
  type ContentNodeContext,
  type DownstreamRefreshRunner,
  type OwnerRevisionRunner,
} from "../../graph/content-subgraph";
import {createVisualSlotDirector} from "./visual-director";
import {agentNames} from "../../schemas/agent";
import {roleContractOutputPaths} from "../benchmark/role-contract";

export type ContentRoleRequestBuilder = (input: {
  context: ContentNodeContext;
  role: AgentName;
  attempt: number;
  executionId: string;
}) => AgentExecutionRequest;

export type RoleBackedContentLoopOptions = {
  repoRoot: string;
  runAgent: AgentRunner;
  requestFor: ContentRoleRequestBuilder;
  roleForOutputPath?: (repositoryPath: string) => AgentName | undefined;
};

type LegacyCriticName = ContentCriticName;

const recordValue = (value: unknown, field: string): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CONTENT_LEGACY_GATE_FIELD_MISSING:${field}`);
  }
  const child = (value as Record<string, unknown>)[field];
  if (child === undefined) throw new Error(`CONTENT_LEGACY_GATE_FIELD_MISSING:${field}`);
  return child;
};

const stringValue = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw new Error(`CONTENT_LEGACY_GATE_FIELD_INVALID:${field}`);
  return value;
};

const stringArrayValue = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`CONTENT_LEGACY_GATE_FIELD_INVALID:${field}`);
  }
  return [...value] as string[];
};

const dimensionsFromScores = (
  value: unknown,
): {id: string; score: number; evidenceIssueIds: string[]}[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CONTENT_LEGACY_GATE_SCORES_MISSING");
  }
  return Object.entries(value as Record<string, unknown>).map(([id, score]) => {
    if (typeof score !== "number") throw new Error(`CONTENT_LEGACY_GATE_SCORE_INVALID:${id}`);
    return {id, score, evidenceIssueIds: []};
  });
};

const reviewedRefFor = (
  repoRoot: string,
  context: ContentNodeContext,
  repositoryPath: string,
): ArtifactRef => {
  const ref = Object.values(context.artifacts)
    .filter((candidate) => candidate.path === repositoryPath)
    .sort(
      (left, right) =>
        right.revision - left.revision || left.artifactId.localeCompare(right.artifactId),
    )[0];
  if (!ref) throw new Error(`CONTENT_REVIEWED_ARTIFACT_MISSING:${repositoryPath}`);
  assertArtifactRefBytes(repoRoot, ref);
  return ref;
};

const readArtifactText = (repoRoot: string, ref: ArtifactRef): string => {
  assertArtifactRefBytes(repoRoot, ref);
  return fs.readFileSync(path.resolve(repoRoot, ref.path), "utf8");
};

const mediaCapabilityError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /MEDIA_(?:SELECT|RETRIEVAL|VERIFICATION)|media (?:inspection|verification)/iu.test(
    message,
  );
};

const singleOutput = (outputs: readonly ArtifactRef[], role: AgentName): ArtifactRef => {
  if (outputs.length !== 1 || !outputs[0]) {
    throw new Error(`CONTENT_ROLE_OUTPUT_CARDINALITY:${role}:${outputs.length}`);
  }
  return outputs[0];
};

const successfulOutput = async (
  options: RoleBackedContentLoopOptions,
  context: ContentNodeContext,
  role: AgentName,
  executionId: string,
): Promise<ArtifactRef[]> => {
  const result = await options.runAgent(
    options.requestFor({
      context,
      role,
      attempt: Math.max(1, context.round + 1),
      executionId,
    }),
  );
  if (result.status !== "SUCCEEDED") {
    throw new Error(`CONTENT_ROLE_AGENT_${result.status}:${role}`);
  }
  return [...result.outputArtifacts];
};

const buildLegacyPassResult = (input: {
  context: ContentNodeContext;
  critic: LegacyCriticName;
  resultRef: ArtifactRef;
  rubricVersion: string;
  round: number;
  reviewedArtifacts: readonly ArtifactRef[];
  dimensions: readonly {id: string; score: number; evidenceIssueIds: string[]}[];
  verdict: string;
  blockers: readonly string[];
  returnTo: string;
}): ContentCriticExecution => {
  if (!(["PASS", "READY"] as readonly string[]).includes(input.verdict)) {
    throw new Error(`CONTENT_LEGACY_GATE_REQUIRES_STRUCTURED_ISSUES:${input.critic}`);
  }
  if (input.blockers.length > 0 || input.returnTo !== "none") {
    throw new Error(`CONTENT_LEGACY_GATE_REQUIRES_STRUCTURED_ISSUES:${input.critic}`);
  }
  const recomputed = recomputeCriticEvaluation({
    critic: input.critic,
    rubricVersion: input.rubricVersion,
    dimensions: input.dimensions,
    issues: [],
  });
  const result: CriticResult = validateCriticResult({
    schemaVersion: "critic-output-v1",
    episodeId: input.context.episodeId,
    executionId: `${input.context.runId}:content-loop:${input.critic}:r${input.round}`,
    critic: input.critic,
    round: Math.max(1, input.round),
    rubricVersion: input.rubricVersion,
    reviewedArtifacts: [...input.reviewedArtifacts],
    evaluation: recomputed.evaluation,
    issues: [],
    blockers: [],
    verdict: recomputed.verdict,
    primaryRoute: null,
    returnTo: "none",
  });
  return {result, resultRef: input.resultRef};
};

const roleCritic =
  (input: {
    options: RoleBackedContentLoopOptions;
    role: LegacyCriticName;
    parse: (markdown: string) => Record<string, unknown>;
    reviewedPathTemplates: readonly string[];
    dimensions: (gate: Record<string, unknown>) => readonly {
      id: string;
      score: number;
      evidenceIssueIds: string[];
    }[];
  }): ContentCriticRunner =>
  async (context) => {
    const resultRefs = await successfulOutput(
      input.options,
      context,
      input.role,
      `${context.runId}:content-loop:${input.role}:r${context.round}`,
    );
    const resultRef = singleOutput(resultRefs, input.role);
    const gate = input.parse(readArtifactText(input.options.repoRoot, resultRef));
    const reviewedArtifacts = input.reviewedPathTemplates.map((template) =>
      reviewedRefFor(
        input.options.repoRoot,
        context,
        template.replaceAll("<episodeId>", context.episodeId),
      ),
    );
    return buildLegacyPassResult({
      context,
      critic: input.role,
      resultRef,
      rubricVersion: stringValue(recordValue(gate, "rubricVersion"), "rubricVersion"),
      round: typeof gate.round === "number" ? gate.round : context.round + 1,
      reviewedArtifacts,
      dimensions: input.dimensions(gate),
      verdict: stringValue(recordValue(gate, "verdict"), "verdict"),
      blockers: stringArrayValue(recordValue(gate, "blockers"), "blockers"),
      returnTo: stringValue(recordValue(gate, "returnTo"), "returnTo"),
    });
  };

const revisionRunner =
  (options: RoleBackedContentLoopOptions): OwnerRevisionRunner =>
  async (request) => {
    if (request.ownerAgent === "production-executor") {
      throw new Error("CONTENT_PRODUCTION_OWNER_REVISION_UNSUPPORTED");
    }
    const output = await successfulOutput(
      options,
      request.context,
      request.ownerAgent,
      `${request.context.runId}:content-revision:${request.ownerAgent}:r${request.context.round}`,
    );
    const authorized = new Set(request.authorizedArtifactIds);
    return {
      revisions: output
        .filter((ref) => authorized.has(ref.artifactId))
        .map((ref) => ({ref}) satisfies ContentArtifactRevision),
      usage: {costUsd: 0, wallclockSeconds: 0},
    };
  };

const downstreamRefresh =
  (options: RoleBackedContentLoopOptions): DownstreamRefreshRunner =>
  async (request) => {
    const refsByRole = new Map<AgentName, Set<string>>();
    for (const stale of request.staleArtifacts) {
      const role = options.roleForOutputPath?.(stale.ref.path);
      if (!role) throw new Error(`CONTENT_DOWNSTREAM_OWNER_UNKNOWN:${stale.ref.path}`);
      const refs = refsByRole.get(role) ?? new Set<string>();
      refs.add(stale.ref.artifactId);
      refsByRole.set(role, refs);
    }
    const refreshed: ContentArtifactRevision[] = [];
    for (const [role, artifactIds] of [...refsByRole.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const output = await successfulOutput(
        options,
        request.context,
        role,
        `${request.context.runId}:content-refresh:${role}:r${request.round}`,
      );
      refreshed.push(
        ...output.filter((ref) => artifactIds.has(ref.artifactId)).map((ref) => ({ref})),
      );
    }
    return refreshed;
  };

export const createRoleBackedContentLoopNodes = (
  input: RoleBackedContentLoopOptions,
): ContentLoopNodes => {
  const visualDirector: ContentArtifactProducer = async (context) => {
    const visualOutput = await successfulOutput(
      input,
      context,
      "visual-director",
      `${context.runId}:content-loop:visual-director:r${context.round}`,
    );
    let slotOutput;
    try {
      slotOutput = await createVisualSlotDirector({
        repoRoot: input.repoRoot,
        episodeId: context.episodeId,
        runId: context.runId,
        traceId: `${context.episodeId}:run:${context.runId}`,
      })(context);
    } catch (error) {
      if (!mediaCapabilityError(error)) throw error;
      pauseForExternalCapability({
        gate: "external-capability",
        capability: "media-inspection",
        episodeId: context.episodeId,
        runId: context.runId,
        approvalEpoch: context.approvalEpoch ?? 0,
        artifactRefs: Object.values(context.artifacts).sort((left, right) =>
          left.artifactId.localeCompare(right.artifactId),
        ),
        expectedOutputPaths: [
          `content/${context.episodeId}/media/verifications/`,
          `content/${context.episodeId}/artifact-index.json`,
        ],
        resumeCommand: `ORCHESTRATOR=langgraph pnpm orchestrate --episode ${context.episodeId} --resume`,
        nextAction:
          "Resolve the media retrieval/verification and registry handoff, inspect the selected media, then resume.",
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("EXTERNAL_CAPABILITY_UNRESOLVED:media-inspection", {cause: error});
    }
    const slots =
      slotOutput === undefined ? [] : Array.isArray(slotOutput) ? [...slotOutput] : [slotOutput];
    return [...visualOutput.map((ref) => ({ref})), ...slots];
  };

  const critics: Record<ContentCriticName, ContentCriticRunner> = {
    "audience-critic": roleCritic({
      options: input,
      role: "audience-critic",
      parse: (markdown) => parseCriticGate(markdown) as unknown as Record<string, unknown>,
      reviewedPathTemplates: ["content/<episodeId>/story/final-script.md"],
      dimensions: (gate) => dimensionsFromScores(recordValue(gate, "scores")),
    }),
    "fact-guardian": roleCritic({
      options: input,
      role: "fact-guardian",
      parse: (markdown) => parseFactCheckGate(markdown) as unknown as Record<string, unknown>,
      reviewedPathTemplates: ["content/<episodeId>/story/final-script.md"],
      dimensions: () =>
        [
          "claimCoverage",
          "semanticFidelity",
          "sourceIdentityAttribution",
          "metricAndTimeScope",
          "causalityInferenceBoundary",
          "visualTruthBoundary",
        ].map((id) => ({id, score: 1, evidenceIssueIds: []})),
    }),
    "retention-critic": roleCritic({
      options: input,
      role: "retention-critic",
      parse: (markdown) => parseRetentionGate(markdown) as unknown as Record<string, unknown>,
      reviewedPathTemplates: [
        "content/<episodeId>/story/final-script.md",
        "content/<episodeId>/story/visual-plan.md",
      ],
      dimensions: (gate) => dimensionsFromScores(recordValue(gate, "scores")),
    }),
  };

  return {
    visualDirector,
    critics,
    reviseOwner: revisionRunner(input),
    downstreamRefresh: downstreamRefresh(input),
  };
};

export const roleForContractOutputPath = (
  episodeId: string,
  repositoryPath: string,
): AgentName | undefined =>
  agentNames.find((role) =>
    roleContractOutputPaths(role, episodeId).some((output) => output.path === repositoryPath),
  );
