import {z} from "zod";
import {
  criticResultSchema,
  type CriticIssue,
  type CriticName,
  type CriticResult,
  type EvaluationResult,
} from "./schemas/critic-output";
import {stableJson} from "./stable-json";
import {productionContract} from "../lib/episode/production-contract";

type RubricDimension = {id: string; maxScore: number; weight: number; floor: number};
type Rubric = {version: string; threshold: number; dimensions: readonly RubricDimension[]};

const rubric = (
  version: string,
  threshold: number,
  dimensions: readonly RubricDimension[],
): Rubric => ({version, threshold, dimensions});

export const criticRubrics: Readonly<Record<CriticName, Rubric>> = {
  "oral-judge": rubric("oral-review-v2", 80, [
    {id: "chineseNaturalness", maxScore: 5, weight: 1 / 3, floor: 4},
    {id: "spokenDelivery", maxScore: 5, weight: 1 / 3, floor: 4},
    {id: "informationFidelity", maxScore: 5, weight: 1 / 3, floor: 4},
  ]),
  "audience-critic": rubric("product-story-v4", 85, [
    {id: "hook", maxScore: 15, weight: 0.15, floor: 9},
    {id: "conflict", maxScore: 15, weight: 0.15, floor: 9},
    {id: "humanElement", maxScore: 10, weight: 0.1, floor: 6},
    {id: "productClarity", maxScore: 15, weight: 0.15, floor: 9},
    {id: "growthLogic", maxScore: 15, weight: 0.15, floor: 9},
    {id: "technologyExplanation", maxScore: 15, weight: 0.15, floor: 9},
    {id: "naturalChinese", maxScore: 15, weight: 0.15, floor: 9},
  ]),
  "fact-guardian": rubric("fact-guardian-v1", 100, [
    {id: "claimCoverage", maxScore: 1, weight: 0.25, floor: 1},
    {id: "semanticFidelity", maxScore: 1, weight: 0.25, floor: 1},
    {id: "sourceIdentityAttribution", maxScore: 1, weight: 0.15, floor: 1},
    {id: "metricAndTimeScope", maxScore: 1, weight: 0.15, floor: 1},
    {id: "causalityInferenceBoundary", maxScore: 1, weight: 0.1, floor: 1},
    {id: "visualTruthBoundary", maxScore: 1, weight: 0.1, floor: 1},
  ]),
  "retention-critic": rubric("retention-critic-v2", 80, [
    {id: "first3Seconds", maxScore: 25, weight: 0.25, floor: 15},
    {id: "first30Seconds", maxScore: 25, weight: 0.25, floor: 15},
    {id: "midVideoEngagement", maxScore: 25, weight: 0.25, floor: 15},
    {id: "endingSatisfaction", maxScore: 25, weight: 0.25, floor: 15},
  ]),
  "compliance-critic": rubric("compliance-critic-v1", 100, [
    {id: "platformPolicy", maxScore: 1, weight: 0.4, floor: 1},
    {id: "advertisingLanguage", maxScore: 1, weight: 0.35, floor: 1},
    {id: "brandSafety", maxScore: 1, weight: 0.25, floor: 1},
  ]),
  "delivery-critic": rubric("delivery-critic-v1", 100, [
    {id: "artifactIntegrity", maxScore: 1, weight: 0.15, floor: 1},
    {id: "durationAndVerticalFormat", maxScore: 1, weight: 0.15, floor: 1},
    {id: "captionIntegrityAndTiming", maxScore: 1, weight: 0.2, floor: 1},
    {id: "audioIntelligibilityAndSync", maxScore: 1, weight: 0.15, floor: 1},
    {id: "firstFrameComprehension", maxScore: 1, weight: 0.1, floor: 1},
    {id: "evidenceRightsReadability", maxScore: 1, weight: 0.2, floor: 1},
    {id: "renderContinuitySafeArea", maxScore: 1, weight: 0.05, floor: 1},
  ]),
};

const scoreInputSchema = z.array(
  z.object({
    id: z.string().min(1),
    score: z.number().nonnegative(),
    evidenceIssueIds: z.array(z.string().min(1)),
  }),
);

export type CriticScoreInput = z.input<typeof scoreInputSchema>[number];

const blockingIssueIds = (critic: CriticName, issues: readonly CriticIssue[]): string[] =>
  issues
    .filter((issue) => {
      if (issue.status !== "open") return false;
      if (
        critic === "fact-guardian" ||
        critic === "compliance-critic" ||
        critic === "delivery-critic"
      ) {
        return true;
      }
      if (critic === "audience-critic" || critic === "retention-critic") {
        return issue.severity === "high" || issue.severity === "blocker";
      }
      return issue.severity === "blocker";
    })
    .map((issue) => issue.id)
    .sort();

const allowedIssuePrefixes: Readonly<Record<CriticName, readonly string[]>> = {
  "oral-judge": ["contract.", "oral.", "script.fact-accuracy", "script.claim-binding"],
  "audience-critic": ["contract.", "story.", "attention.", "script.", "oral.", "visual."],
  "fact-guardian": [
    "contract.",
    "research.",
    "story.unsupported-premise",
    "script.claim-binding",
    "script.fact-accuracy",
    "visual.evidence",
    "visual.asset-rights",
  ],
  "retention-critic": ["contract.", "retention.", "attention.", "story.", "visual."],
  "compliance-critic": ["contract.", "compliance."],
  "delivery-critic": ["contract.", "delivery."],
};

const categoryAllowed = (critic: CriticName, category: string): boolean =>
  allowedIssuePrefixes[critic].some((prefix) =>
    prefix.endsWith(".") ? category.startsWith(prefix) : category === prefix,
  );

const round = (value: number): number => Number(value.toFixed(6));

export const recomputeCriticEvaluation = (input: {
  critic: CriticName;
  rubricVersion: string;
  dimensions: readonly CriticScoreInput[];
  issues: readonly CriticIssue[];
}): {evaluation: EvaluationResult; blockers: string[]; verdict: "PASS" | "REJECT"} => {
  const definition = criticRubrics[input.critic];
  if (input.rubricVersion !== definition.version) {
    throw new Error(`RUBRIC_VERSION_MISMATCH:${input.critic}`);
  }
  const dimensions = scoreInputSchema.parse(input.dimensions);
  const byId = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  if (byId.size !== dimensions.length) throw new Error("RUBRIC_DUPLICATE_DIMENSION");
  const expectedIds = new Set(definition.dimensions.map((dimension) => dimension.id));
  if (dimensions.some((dimension) => !expectedIds.has(dimension.id))) {
    throw new Error("RUBRIC_UNKNOWN_DIMENSION");
  }
  if (definition.dimensions.some((dimension) => !byId.has(dimension.id))) {
    throw new Error("RUBRIC_MISSING_DIMENSION");
  }

  const computedDimensions = definition.dimensions.map((fixed) => {
    const supplied = byId.get(fixed.id)!;
    if (supplied.score > fixed.maxScore) throw new Error(`RUBRIC_SCORE_OUT_OF_RANGE:${fixed.id}`);
    return {...supplied, maxScore: fixed.maxScore, weight: fixed.weight};
  });
  const rawTotal = round(computedDimensions.reduce((sum, dimension) => sum + dimension.score, 0));
  const normalizedTotal = round(
    computedDimensions.reduce(
      (sum, dimension) => sum + (dimension.score / dimension.maxScore) * dimension.weight,
      0,
    ) * 100,
  );
  const dimensionFloors = Object.fromEntries(
    definition.dimensions.map((dimension) => [dimension.id, dimension.floor]),
  );
  const floorsPass = computedDimensions.every(
    (dimension) => dimension.score >= dimensionFloors[dimension.id]!,
  );
  const blockers = blockingIssueIds(input.critic, input.issues);
  const correctionRequired = input.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.severity !== "info" &&
      !(
        (input.critic === "audience-critic" || input.critic === "retention-critic") &&
        issue.severity === "low"
      ),
  );
  const passedThresholds =
    normalizedTotal >= definition.threshold && floorsPass && blockers.length === 0;
  return {
    evaluation: {
      dimensions: computedDimensions,
      rawTotal,
      normalizedTotal,
      threshold: definition.threshold,
      dimensionFloors,
      passedThresholds,
    },
    blockers,
    verdict: passedThresholds && !correctionRequired ? "PASS" : "REJECT",
  };
};

/** Parses a model/agent result, then rejects any model-authored arithmetic or gate drift. */
export const validateCriticResult = (raw: unknown): CriticResult => {
  const result = criticResultSchema.parse(raw);
  if (result.issues.some((issue) => !categoryAllowed(result.critic, issue.category))) {
    throw new Error("CRITIC_CATEGORY_NOT_ALLOWED");
  }
  const recomputed = recomputeCriticEvaluation({
    critic: result.critic,
    rubricVersion: result.rubricVersion,
    dimensions: result.evaluation.dimensions,
    issues: result.issues,
  });
  if (stableJson(result.evaluation) !== stableJson(recomputed.evaluation)) {
    throw new Error("CRITIC_EVALUATION_MISMATCH");
  }
  if (stableJson([...result.blockers].sort()) !== stableJson(recomputed.blockers)) {
    throw new Error("CRITIC_BLOCKERS_MISMATCH");
  }
  if (result.verdict !== recomputed.verdict) throw new Error("CRITIC_VERDICT_MISMATCH");
  if (result.verdict === "PASS" && (result.primaryRoute !== null || result.returnTo !== "none")) {
    throw new Error("CRITIC_PASS_ROUTE_MISMATCH");
  }
  if (result.verdict === "REJECT" && result.issues.every((issue) => issue.status !== "open")) {
    throw new Error("CRITIC_REJECT_REQUIRES_OPEN_ISSUE");
  }
  if (result.verdict === "REJECT" && (result.primaryRoute === null || result.returnTo === "none")) {
    throw new Error("CRITIC_REJECT_REQUIRES_ROUTE");
  }
  return result;
};

export const recomputeAudienceHook = (input: {
  zeroBackgroundComprehension: number;
  continuationQuestion: number;
}): number => {
  if (
    input.zeroBackgroundComprehension < 0 ||
    input.zeroBackgroundComprehension > 8 ||
    input.continuationQuestion < 0 ||
    input.continuationQuestion > 7
  ) {
    throw new Error("RUBRIC_AUDIENCE_HOOK_OUT_OF_RANGE");
  }
  return input.zeroBackgroundComprehension + input.continuationQuestion;
};

export const recomputeDeliveryHardRules = (input: {
  durationSeconds: number;
  microCueRatio: number;
  captionWordBreaks?: number;
  englishWordBreaks?: number;
}): {passed: boolean; failures: string[]} => {
  const failures = [
    ...(!Number.isFinite(input.durationSeconds) ||
    input.durationSeconds < productionContract.delivery.minimumSeconds ||
    input.durationSeconds > productionContract.delivery.hardMaximumSeconds
      ? ["delivery.duration-render"]
      : []),
    ...(input.microCueRatio > productionContract.captions.microCueRatioLimit
      ? ["delivery.caption-timing"]
      : []),
    ...((input.captionWordBreaks ?? 0) > 0 || (input.englishWordBreaks ?? 0) > 0
      ? ["delivery.caption-split"]
      : []),
  ];
  return {passed: failures.length === 0, failures};
};

export const legacyReturnTo = (critic: CriticName, routeTarget: string | null): string => {
  if (routeTarget === null) return "none";
  if (critic === "audience-critic" && routeTarget === "viral-director") return "story-director";
  return routeTarget;
};

/** Adds the common envelope without changing or reinterpreting the legacy gate fields. */
export const addCriticEnvelope = <Legacy extends Record<string, unknown>>(
  legacyGate: Legacy,
  envelope: CriticResult,
): Legacy & CriticResult => {
  for (const field of ["rubricVersion", "round", "verdict", "returnTo"] as const) {
    if (legacyGate[field] !== envelope[field]) {
      throw new Error(`LEGACY_FIELD_MISMATCH:${field}`);
    }
  }
  return {...legacyGate, ...validateCriticResult(envelope)};
};

export const assertNoEvaluationDrift = (previous: CriticResult, current: CriticResult): void => {
  const previousHashes = previous.reviewedArtifacts.map((item) => item.sha256).sort();
  const currentHashes = current.reviewedArtifacts.map((item) => item.sha256).sort();
  if (
    previous.critic !== current.critic ||
    previous.rubricVersion !== current.rubricVersion ||
    stableJson(previousHashes) !== stableJson(currentHashes)
  ) {
    return;
  }
  const priorSeverities = Object.fromEntries(
    previous.issues.map((item) => [item.id, item.severity]),
  );
  const severityDrift = current.issues.some(
    (item) => priorSeverities[item.id] && priorSeverities[item.id] !== item.severity,
  );
  const priorScores = previous.evaluation.dimensions.map(({id, score}) => ({id, score}));
  const currentScores = current.evaluation.dimensions.map(({id, score}) => ({id, score}));
  if (severityDrift || stableJson(priorScores) !== stableJson(currentScores)) {
    throw new Error("CRITIC_EVALUATION_DRIFT");
  }
};
