import fs from "node:fs";
import path from "node:path";
import {
  loadAgentModelPolicyFile,
  isHostedLlmEligibleAgent,
  writeAgentModelPolicyFile,
  type AgentModelPolicyFile,
} from "../../config/agent-model-policy";
import {loadRoleModelBenchmarkConfig} from "../../config/role-model-benchmark";
import {benchmarkResultSchema} from "../../schemas/role-model-benchmark";
import {
  roleModelBlindRevealSchema,
  roleModelBlindReviewPackageSchema,
  roleModelPromotionDecisionSchema,
  type RoleModelPromotionDecision,
} from "../../schemas/role-model-review";
import {
  benchmarkResultPath,
  assertPromotionReviewCohort,
  hashRepositoryFile,
  promotionRecommendationPath,
  reviewPackagePath,
  reviewRevealPath,
} from "./role-model-review";

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`promotion path escapes repository: ${repositoryPath}`);
  }
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`promotion path escapes repository: ${repositoryPath}`);
  }
  return absolutePath;
};

const readJson = (repoRoot: string, repositoryPath: string): unknown =>
  JSON.parse(fs.readFileSync(resolveRepositoryPath(repoRoot, repositoryPath), "utf8")) as unknown;

export const loadPromotionDecision = (
  repoRoot: string,
  decisionPath: string,
): RoleModelPromotionDecision =>
  roleModelPromotionDecisionSchema.parse(readJson(repoRoot, decisionPath));

export type ApplyRoleModelPromotionResult = {
  applied: boolean;
  reason: string;
  policyBefore: AgentModelPolicyFile;
  policyAfter: AgentModelPolicyFile;
  decision: RoleModelPromotionDecision;
};

export const applyRoleModelPromotion = (input: {
  repoRoot: string;
  decisionPath: string;
  apply?: boolean;
}): ApplyRoleModelPromotionResult => {
  const relativeDecision = (
    path.isAbsolute(input.decisionPath)
      ? path.relative(input.repoRoot, input.decisionPath)
      : input.decisionPath
  )
    .split(path.sep)
    .join("/");
  const decision = loadPromotionDecision(input.repoRoot, relativeDecision);
  const episodeIdMatch = /content\/(episode-[a-z0-9-]+)\//u.exec(relativeDecision);
  const episodeId = episodeIdMatch?.[1];
  if (!episodeId) {
    throw new Error("promotion decision must live under content/<episode>/");
  }

  const resultRelative = benchmarkResultPath(episodeId, decision.benchmarkId);
  const resultHash = hashRepositoryFile(input.repoRoot, resultRelative);
  if (resultHash !== decision.benchmarkResultHash) {
    throw new Error("BENCHMARK_RESULT_TAMPERED");
  }
  const result = benchmarkResultSchema.parse(readJson(input.repoRoot, resultRelative));
  const reviewHash = hashRepositoryFile(
    input.repoRoot,
    reviewPackagePath(episodeId, decision.benchmarkId),
  );
  const revealHash = hashRepositoryFile(
    input.repoRoot,
    reviewRevealPath(episodeId, decision.benchmarkId),
  );
  if (reviewHash !== decision.reviewPackageHash || revealHash !== decision.revealHash) {
    throw new Error("REVIEW_PACKAGE_TAMPERED");
  }
  const review = roleModelBlindReviewPackageSchema.parse(
    readJson(input.repoRoot, reviewPackagePath(episodeId, decision.benchmarkId)),
  );
  const reveal = roleModelBlindRevealSchema.parse(
    readJson(input.repoRoot, reviewRevealPath(episodeId, decision.benchmarkId)),
  );

  const policyBefore = loadAgentModelPolicyFile({repoRoot: input.repoRoot});
  if (decision.decision !== "promote") {
    return {
      applied: false,
      reason: `${decision.decision} changes nothing`,
      policyBefore,
      policyAfter: policyBefore,
      decision,
    };
  }
  assertPromotionReviewCohort({review, reveal, result});
  if (!decision.resolvedCandidateId || !decision.selectedCandidate) {
    throw new Error("promote requires a selected candidate");
  }
  const candidate = result.candidates.find(
    (item) => item.candidateId === decision.resolvedCandidateId,
  );
  if (!candidate) throw new Error(`unknown selected candidate: ${decision.resolvedCandidateId}`);
  if (!candidate.promotionEligible) {
    throw new Error(`ineligible candidate cannot promote: ${decision.resolvedCandidateId}`);
  }
  if (result.agentName !== decision.role) {
    throw new Error("promotion role does not match benchmark");
  }
  if (!isHostedLlmEligibleAgent(decision.role)) {
    throw new Error(`${decision.role} is Codex capability-gated and cannot be model-promoted`);
  }

  if (!input.apply) {
    return {
      applied: false,
      reason: "promotion requires explicit --apply",
      policyBefore,
      policyAfter: policyBefore,
      decision,
    };
  }

  const benchmarkConfig = loadRoleModelBenchmarkConfig({repoRoot: input.repoRoot});
  const candidatePolicy = benchmarkConfig.candidates[decision.resolvedCandidateId];
  if (!candidatePolicy) {
    throw new Error(`benchmark config is missing candidate ${decision.resolvedCandidateId}`);
  }
  const current = policyBefore.roles[decision.role];
  const policyAfter = {
    ...policyBefore,
    roles: {
      ...policyBefore.roles,
      [decision.role]: {
        ...current,
        provider: candidatePolicy.provider,
        endpoint: candidatePolicy.endpoint,
        model: candidatePolicy.model,
        reasoning: candidatePolicy.reasoning,
        temperature: candidatePolicy.temperature,
        apiKeyEnv: candidatePolicy.apiKeyEnv,
        allowedOrigins: [...candidatePolicy.allowedOrigins],
        timeoutMs: candidatePolicy.timeoutMs,
        maxRetries: candidatePolicy.maxRetries,
      },
    },
  };
  writeAgentModelPolicyFile(input.repoRoot, policyAfter);
  return {
    applied: true,
    reason: `updated ${decision.role} model fields from ${decision.resolvedCandidateId}; mode unchanged`,
    policyBefore,
    policyAfter: loadAgentModelPolicyFile({repoRoot: input.repoRoot}),
    decision,
  };
};

export const recommendationExists = (
  repoRoot: string,
  episodeId: string,
  benchmarkId: string,
): boolean =>
  fs.existsSync(path.resolve(repoRoot, promotionRecommendationPath(episodeId, benchmarkId)));
