import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {ROLE_MODEL_POLICY_VERSION} from "../../config/agent-model-policy";
import {MODEL_BENCHMARK_CONTRACT_VERSION} from "../../config/role-model-benchmark";
import {benchmarkResultSchema, type BenchmarkResult} from "../../schemas/role-model-benchmark";
import {
  emptyRoleModelReviewScores,
  roleModelBlindRevealSchema,
  roleModelBlindReviewPackageSchema,
  roleModelPromotionDecisionSchema,
  roleModelPromotionRecommendationSchema,
  roleModelReviewDimensions,
  type RoleModelBlindReveal,
  type RoleModelBlindReviewPackage,
  type RoleModelPromotionDecision,
  type RoleModelPromotionRecommendation,
} from "../../schemas/role-model-review";
import {stableJson} from "../../stable-json";
import {benchmarkRootPath} from "./role-model-benchmark";

const sha256Bytes = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  if (path.isAbsolute(repositoryPath) || repositoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error(`review path escapes repository: ${repositoryPath}`);
  }
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`review path escapes repository: ${repositoryPath}`);
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

const readJson = (repoRoot: string, repositoryPath: string): unknown =>
  JSON.parse(fs.readFileSync(resolveRepositoryPath(repoRoot, repositoryPath), "utf8")) as unknown;

export const hashRepositoryFile = (repoRoot: string, repositoryPath: string): string =>
  sha256Bytes(fs.readFileSync(resolveRepositoryPath(repoRoot, repositoryPath)));

export const benchmarkResultPath = (episodeId: string, benchmarkId: string): string =>
  `${benchmarkRootPath(episodeId, benchmarkId)}/benchmark-result.json`;

export const reviewPackagePath = (episodeId: string, benchmarkId: string): string =>
  `${benchmarkRootPath(episodeId, benchmarkId)}/review/blind-review.json`;

export const reviewRevealPath = (episodeId: string, benchmarkId: string): string =>
  `${benchmarkRootPath(episodeId, benchmarkId)}/review/reveal.json`;

export const promotionDecisionPath = (episodeId: string, benchmarkId: string): string =>
  `${benchmarkRootPath(episodeId, benchmarkId)}/review/decision.json`;

export const promotionRecommendationPath = (episodeId: string, benchmarkId: string): string =>
  `${benchmarkRootPath(episodeId, benchmarkId)}/review/recommendation.json`;

const candidateLabels = (count: number): string[] =>
  Array.from({length: count}, (_, index) => {
    if (index >= 26) throw new Error("blind review supports at most 26 candidates");
    return String.fromCharCode(65 + index);
  });

/** Brand-independent, stable permutation for one benchmark-result hash. */
export const assignBlindLabels = (
  candidateIds: readonly string[],
  seed: string,
): Array<{label: string; candidateId: string}> => {
  const labels = candidateLabels(candidateIds.length);
  const ranked = [...new Set(candidateIds)].sort((left, right) =>
    sha256Bytes(`${seed}:${left}`).localeCompare(sha256Bytes(`${seed}:${right}`)),
  );
  return ranked.map((candidateId, index) => ({
    label: labels[index] ?? "A",
    candidateId,
  }));
};

const leakTokensFor = (result: BenchmarkResult): string[] => {
  const tokens = new Set<string>();
  for (const candidate of result.candidates) {
    tokens.add(candidate.candidateId);
    tokens.add(candidate.provider);
    tokens.add(candidate.model);
    tokens.add(candidate.identity);
    for (const artifact of candidate.outputArtifacts) {
      tokens.add(artifact.path);
      tokens.add(artifact.producer);
    }
  }
  return [...tokens].filter((token) => token.length >= 3);
};

export const assertBlindReviewHidesProviders = (
  review: RoleModelBlindReviewPackage,
  result: BenchmarkResult,
): void => {
  const serialized = stableJson(review).toLowerCase();
  for (const token of leakTokensFor(result)) {
    if (serialized.includes(token.toLowerCase())) {
      throw new Error(`blind review leaked provider metadata: ${token}`);
    }
  }
  for (const forbidden of [
    "endpoint",
    "apikey",
    "provider",
    "openai",
    "deepseek",
    "grok",
    "x.ai",
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`blind review leaked provider metadata: ${forbidden}`);
    }
  }
};

const readCandidateOutput = (
  repoRoot: string,
  result: BenchmarkResult,
  candidateId: string,
): string => {
  const candidate = result.candidates.find((item) => item.candidateId === candidateId);
  const outputPath = candidate?.outputArtifacts[0]?.path;
  if (!outputPath) return "";
  const absolute = resolveRepositoryPath(repoRoot, outputPath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
};

export const loadBenchmarkResult = (
  repoRoot: string,
  episodeId: string,
  benchmarkId: string,
): {result: BenchmarkResult; hash: string; path: string} => {
  const relative = benchmarkResultPath(episodeId, benchmarkId);
  const hash = hashRepositoryFile(repoRoot, relative);
  const result = benchmarkResultSchema.parse(readJson(repoRoot, relative));
  if (result.benchmarkId !== benchmarkId || result.episodeId !== episodeId) {
    throw new Error("BENCHMARK_RESULT_IDENTITY_MISMATCH");
  }
  return {result, hash, path: relative};
};

export const buildBlindReviewPackage = (input: {
  repoRoot: string;
  episodeId: string;
  benchmarkId: string;
}): {
  review: RoleModelBlindReviewPackage;
  reveal: RoleModelBlindReveal;
  reviewPath: string;
  revealPath: string;
} => {
  const {result, hash} = loadBenchmarkResult(input.repoRoot, input.episodeId, input.benchmarkId);
  const mapping = assignBlindLabels(result.candidateIds, `${result.benchmarkId}:${hash}`);
  const reviewId = `review-${hash.slice(0, 16)}`;
  const review = roleModelBlindReviewPackageSchema.parse({
    schemaVersion: "role-model-blind-review-v1",
    reviewId,
    benchmarkId: result.benchmarkId,
    episodeId: result.episodeId,
    role: result.agentName,
    policyVersion: ROLE_MODEL_POLICY_VERSION,
    benchmarkContract: MODEL_BENCHMARK_CONTRACT_VERSION,
    benchmarkResultHash: hash,
    rubric: {
      scale: {min: 1, max: 5},
      dimensions: [...roleModelReviewDimensions],
    },
    candidates: mapping.map((entry) => {
      const candidate = result.candidates.find((item) => item.candidateId === entry.candidateId);
      if (!candidate) throw new Error(`missing candidate: ${entry.candidateId}`);
      return {
        label: entry.label,
        output: readCandidateOutput(input.repoRoot, result, entry.candidateId),
        schemaValid: candidate.schemaValid,
        validatorResult: {
          status: candidate.hardValidators.status,
          failures: candidate.hardValidators.failures,
        },
        claimCoverage: candidate.factualContract.claimCoverage,
        unsupportedClaimCount: candidate.factualContract.unsupportedClaimCount,
        unsupportedClaimIds: candidate.factualContract.unsupportedClaimIds,
        outputLength: candidate.outputLength,
        scores: emptyRoleModelReviewScores(),
        blockers: [],
        comment: "",
      };
    }),
    autoFilled: false,
    humanScoresRequired: true,
  });
  assertBlindReviewHidesProviders(review, result);
  const reveal = roleModelBlindRevealSchema.parse({
    schemaVersion: "role-model-blind-reveal-v1",
    reviewId,
    benchmarkId: result.benchmarkId,
    episodeId: result.episodeId,
    role: result.agentName,
    benchmarkResultHash: hash,
    mapping,
  });
  const reviewPath = reviewPackagePath(result.episodeId, result.benchmarkId);
  const revealPath = reviewRevealPath(result.episodeId, result.benchmarkId);
  writeJsonAtomically(input.repoRoot, reviewPath, review);
  writeJsonAtomically(input.repoRoot, revealPath, reveal);
  return {review, reveal, reviewPath, revealPath};
};

export const recordRoleModelPromotionDecision = (input: {
  repoRoot: string;
  episodeId: string;
  benchmarkId: string;
  reviewer: string;
  decision: RoleModelPromotionDecision["decision"];
  selectedCandidate?: string | null;
  reason: string;
  createdAt?: string;
}): {
  decision: RoleModelPromotionDecision;
  recommendation: RoleModelPromotionRecommendation | null;
  decisionPath: string;
} => {
  const {result, hash} = loadBenchmarkResult(input.repoRoot, input.episodeId, input.benchmarkId);
  const reviewPath = reviewPackagePath(result.episodeId, result.benchmarkId);
  const revealPath = reviewRevealPath(result.episodeId, result.benchmarkId);
  const review = roleModelBlindReviewPackageSchema.parse(readJson(input.repoRoot, reviewPath));
  const reveal = roleModelBlindRevealSchema.parse(readJson(input.repoRoot, revealPath));
  if (review.benchmarkResultHash !== hash || reveal.benchmarkResultHash !== hash) {
    throw new Error("BENCHMARK_RESULT_TAMPERED");
  }
  const selectedLabel = input.selectedCandidate ?? null;
  const resolved =
    selectedLabel === null
      ? null
      : (reveal.mapping.find((entry) => entry.label === selectedLabel)?.candidateId ?? null);
  if (input.decision === "promote" && (!selectedLabel || !resolved)) {
    throw new Error("promote requires a selected blind candidate label");
  }
  const decision = roleModelPromotionDecisionSchema.parse({
    schemaVersion: "role-model-promotion-decision-v1",
    kind: "human-decision",
    decisionId: `decision-${hash.slice(0, 12)}-${input.decision}`,
    benchmarkId: result.benchmarkId,
    role: result.agentName,
    reviewer: input.reviewer,
    decision: input.decision,
    selectedCandidate: input.decision === "promote" ? selectedLabel : null,
    resolvedCandidateId: input.decision === "promote" ? resolved : null,
    reason: input.reason,
    benchmarkResultHash: hash,
    reviewPackageHash: hashRepositoryFile(input.repoRoot, reviewPath),
    revealHash: hashRepositoryFile(input.repoRoot, revealPath),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  const decisionPath = promotionDecisionPath(result.episodeId, result.benchmarkId);
  writeJsonAtomically(input.repoRoot, decisionPath, decision);
  if (
    decision.decision !== "promote" ||
    !decision.selectedCandidate ||
    !decision.resolvedCandidateId
  ) {
    return {decision, recommendation: null, decisionPath};
  }
  const recommendation = roleModelPromotionRecommendationSchema.parse({
    schemaVersion: "role-model-promotion-recommendation-v1",
    applied: false,
    benchmarkId: result.benchmarkId,
    role: result.agentName,
    selectedCandidate: decision.selectedCandidate,
    resolvedCandidateId: decision.resolvedCandidateId,
    decisionId: decision.decisionId,
    benchmarkResultHash: hash,
    requiresExplicitApply: true,
  });
  writeJsonAtomically(
    input.repoRoot,
    promotionRecommendationPath(result.episodeId, result.benchmarkId),
    recommendation,
  );
  return {decision, recommendation, decisionPath};
};
