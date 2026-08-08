import {createHash} from "node:crypto";
import {
  criticNames,
  type CriticIssue,
  type CriticName,
  type CriticResult,
} from "./schemas/critic-output";
import {
  defaultRevisionBudgetLimits,
  humanEscalationSchema,
  revisionAttemptSchema,
  revisionBudgetKinds,
  revisionBudgetLimitsSchema,
  revisionLedgerSchema,
  type RevisionAttempt,
  type RevisionBudget,
  type RevisionBudgetKind,
  type RevisionBudgetLimits,
  type RevisionLedger,
  type RevisionHumanEscalation,
} from "./schemas/revision-ledger";
import {
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactIndex,
  type ArtifactRef,
} from "./schemas/artifact";

export type RevisionEvaluations =
  readonly CriticResult[] | Partial<Readonly<Record<CriticName, CriticResult>>>;

export type RevisionIssue = Pick<
  CriticIssue,
  "id" | "severity" | "status" | "affectedArtifact" | "category"
> &
  Partial<Pick<CriticIssue, "evidence" | "constraintsNotToBreak">>;

export type ProtectedConstraint = {
  id: string;
  artifactRefs: readonly ArtifactRef[];
  candidateEvidence?: readonly ArtifactRef[];
};

export type RegressionKind = "hard" | "score" | "drift";

export type RegressionFinding = {
  id: string;
  kind: RegressionKind;
  code:
    | "pass-to-reject"
    | "candidate-gate-reject"
    | "new-blocker"
    | "new-high-issue"
    | "reopened-issue"
    | "issue-severity-increase"
    | "floor-crossed"
    | "binary-dimension-failed"
    | "gate-threshold-failed"
    | "reviewed-artifact-stale"
    | "incomplete-evaluation"
    | "protected-constraint-missing"
    | "dimension-drop"
    | "total-drop"
    | "small-score-drift";
  critic?: CriticName;
  issueIds: string[];
  details: string;
};

export type RegressionReport = {
  comparable: boolean;
  incomparableCritics: CriticName[];
  hard: RegressionFinding[];
  score: RegressionFinding[];
  drift: RegressionFinding[];
  findings: RegressionFinding[];
  rejected: boolean;
};

export type NoProgressReport = {
  detected: boolean;
  artifactHashesEqual: boolean;
  targetedIssueUnchanged: boolean;
  reasons: Array<"artifact-hashes-unchanged" | "targeted-issue-unchanged">;
};

export type RevisionIssueState = {
  id: string;
  status: "open" | "resolved" | "waived" | "wontfix" | "escalated";
  locator?: string;
};

export type RevisionHistoryEntry =
  | string
  | readonly ArtifactRef[]
  | {
      signature?: string;
      artifactRefs?: readonly ArtifactRef[];
      issues?: readonly RevisionIssueState[];
      route?: string | null;
    };

export type OscillationReport = {
  detected: boolean;
  action: "none" | "warn" | "escalate";
  retainBest: boolean;
  signatures: string[];
  oscillationIds: string[];
  reasons: Array<"hash-cycle" | "issue-cycle" | "route-cycle">;
};

export type RevisionComparisonInput = {
  before: readonly ArtifactRef[];
  candidate: readonly ArtifactRef[];
  beforeEvaluations?: RevisionEvaluations;
  candidateEvaluations?: RevisionEvaluations;
  beforeIssues?: readonly RevisionIssue[];
  candidateIssues?: readonly RevisionIssue[];
  targetIssueIds?: readonly string[];
  protectedConstraints?: readonly ProtectedConstraint[];
  currentArtifacts?: readonly ArtifactRef[];
};

export type EvaluationDimensionSelector = {
  critic: CriticName;
  dimensionId: string;
  maxDrop?: number;
};

export type RevisionSelectionInput = Omit<RevisionComparisonInput, "before"> & {
  /** The current best. `before` is accepted as the comparison-oriented alias. */
  best?: readonly ArtifactRef[];
  before?: readonly ArtifactRef[];
  currentBest?: readonly ArtifactRef[];
  /** Defaults to the ADR-003 baseline of 0.5 points. */
  targetGain?: number;
  targetedDimensions?: readonly (string | EvaluationDimensionSelector)[];
  targetedDimensionIds?: readonly string[];
  protectedDimensions?: readonly (string | EvaluationDimensionSelector)[];
  protectedDimensionIds?: readonly string[];
  protectedEvaluationDimensions?: readonly (string | EvaluationDimensionSelector)[];
};

export type BestSelectionReason =
  | "selected"
  | "rubric-incomparable"
  | "target-issue-open"
  | "candidate-gate-failed"
  | "hard-regression"
  | "protected-dimension-regression"
  | "no-meaningful-improvement"
  | "not-pareto-dominant";

export type BestSelectionResult = {
  decision: "selected" | "retained" | "incomparable";
  status: "selected" | "rejected" | "incomparable";
  reason: BestSelectionReason;
  selected: boolean;
  promoted: boolean;
  best: ArtifactRef[];
  selectedBest: ArtifactRef[];
  candidate: ArtifactRef[];
  comparable: boolean;
  targetIssueClosed: boolean;
  candidateGatePasses: boolean;
  noHardRegression: boolean;
  protectedDimensionsPreserved: boolean;
  meaningfulImprovement: boolean;
  paretoDominates: boolean;
  regression: RegressionReport;
  incomparableCritics: CriticName[];
  targetIssueIds: string[];
  protectedDimensionRegressions: string[];
};

export type RevisionAssessmentInput = RevisionComparisonInput & {
  history?: readonly RevisionHistoryEntry[];
  ledger?: RevisionLedger;
  budgetKind?: RevisionBudgetKind;
  validAttempt?: boolean;
  budgetLimits?: RevisionBudgetLimits;
};

export type RevisionAssessment = {
  regression: RegressionReport;
  noProgress: NoProgressReport;
  oscillation: OscillationReport;
  disposition: "candidate-eligible" | "rejected" | "quarantined" | "human-required";
  retainBest: boolean;
  requiresHuman: boolean;
  budgetExhausted: boolean;
};

export type RevisionBaselineInput = {
  inputArtifacts?: readonly Pick<ArtifactRef, "artifactId" | "sha256">[];
  promptRefs?: readonly {
    id: string;
    version: string;
    sha256: string;
  }[];
  rubricVersions?: readonly string[] | Readonly<Record<string, string>>;
  constraints?: readonly string[];
};

export type RevisionBudgetCheck = {
  kind: RevisionBudgetKind;
  allowed: boolean;
  used: number;
  maximum: number;
  remaining: number;
  reason?: "budget-exhausted";
};

export type BestRestorationReport = {
  historical: true;
  restorable: boolean;
  staleArtifactIds: string[];
};

export type RevisionStrategyLevel = 0 | 1 | 2 | 3 | 4;

export const strategyLadder = {
  L0: {
    level: 0,
    name: "original-prompt",
    description: "原 prompt 加结构化 issue 指令",
  },
  L1: {
    level: 1,
    name: "stronger-model",
    description: "更强模型或更高推理预算",
  },
  L2: {
    level: 2,
    name: "narrow-locator",
    description: "把改写范围收窄到 issue locator 命中的片段",
  },
  L3: {
    level: 3,
    name: "best-of-three",
    description: "生成三个候选并进行确定性比较",
  },
  L4: {
    level: 4,
    name: "human-escalation",
    description: "停止自动修订并交给人工",
  },
} as const;

const budgetField: Record<RevisionBudgetKind, keyof RevisionBudget> = {
  oral: "oralRoundsUsed",
  creative: "creativeRoundsUsed",
  delivery: "deliveryRoundsUsed",
};

const budgetMaximumField: Record<RevisionBudgetKind, keyof RevisionBudgetLimits> = {
  oral: "maxOralRounds",
  creative: "maxCreativeRounds",
  delivery: "maxDeliveryRounds",
};

const round = (value: number): number => Number(value.toFixed(6));

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }
    return item;
  }) ?? "";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const parsedRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] =>
  refs.map((ref) => artifactRefSchema.parse(ref));

const artifactFingerprint = (refs: readonly ArtifactRef[]): string =>
  stableJson(
    [...refs]
      .map((ref) => ({artifactId: ref.artifactId, sha256: ref.sha256}))
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
  );

const artifactHashMapsEqual = (
  before: readonly ArtifactRef[],
  candidate: readonly ArtifactRef[],
): boolean => {
  const left = new Map(before.map((ref) => [ref.artifactId, ref.sha256]));
  const right = new Map(candidate.map((ref) => [ref.artifactId, ref.sha256]));
  if (left.size !== right.size) return false;
  for (const [artifactId, hash] of left) {
    if (right.get(artifactId) !== hash) return false;
  }
  return true;
};

const issueLocator = (issue: RevisionIssue): string => {
  const locator = issue.affectedArtifact.locator;
  return `${issue.affectedArtifact.artifactId}:${locator.kind}:${locator.value}`;
};

const issueKey = (issue: RevisionIssue): string => `${issue.id}:${issueLocator(issue)}`;

const issueMap = (issues: readonly RevisionIssue[]): Map<string, RevisionIssue> =>
  new Map(issues.map((issue) => [issueKey(issue), issue]));

const issuesById = (issues: readonly RevisionIssue[]): Map<string, RevisionIssue> => {
  const result = new Map<string, RevisionIssue>();
  for (const issue of issues) {
    if (!result.has(issue.id)) result.set(issue.id, issue);
  }
  return result;
};

const activeIssue = (issue: RevisionIssue | undefined): boolean =>
  issue?.status === "open" && issue.severity !== "info";

const issueArraysFrom = (evaluations: RevisionEvaluations | undefined): RevisionIssue[] => {
  if (!evaluations) return [];
  const values = Array.isArray(evaluations)
    ? evaluations
    : Object.values(evaluations).filter((value): value is CriticResult => value !== undefined);
  return values.flatMap((result) => result.issues as RevisionIssue[]);
};

const evaluationMap = (
  evaluations: RevisionEvaluations | undefined,
): Map<CriticName, CriticResult> => {
  if (!evaluations) return new Map();
  const values = Array.isArray(evaluations)
    ? evaluations
    : Object.values(evaluations).filter((value): value is CriticResult => value !== undefined);
  const result = new Map<CriticName, CriticResult>();
  for (const evaluation of values) {
    if (result.has(evaluation.critic)) {
      throw new Error(`REVISION_DUPLICATE_CRITIC:${evaluation.critic}`);
    }
    result.set(evaluation.critic, evaluation);
  }
  return result;
};

const finding = (input: Omit<RegressionFinding, "id">): RegressionFinding => ({
  ...input,
  id: ["regression", input.kind, input.code, input.critic ?? "workflow", ...input.issueIds].join(
    ":",
  ),
});

const pushUnique = (items: RegressionFinding[], value: RegressionFinding): void => {
  if (!items.some((item) => item.id === value.id)) items.push(value);
};

const scoreRegressionThreshold = (critic: CriticName): number | undefined => {
  switch (critic) {
    case "oral-judge":
      return 1;
    case "audience-critic":
      return 2;
    case "retention-critic":
      return 3;
    case "fact-guardian":
    case "delivery-critic":
      return undefined;
  }
};

const totalRegressionThreshold = (critic: CriticName): number | undefined => {
  switch (critic) {
    case "audience-critic":
      return 3;
    case "retention-critic":
      return 4;
    default:
      return undefined;
  }
};

const dimensionMap = (
  result: CriticResult,
): Map<string, CriticResult["evaluation"]["dimensions"][number]> =>
  new Map(result.evaluation.dimensions.map((dimension) => [dimension.id, dimension]));

const sameRubric = (before: CriticResult, candidate: CriticResult): boolean =>
  before.rubricVersion === candidate.rubricVersion &&
  before.evaluation.threshold === candidate.evaluation.threshold;

const evaluateDimensionRegression = (
  critic: CriticName,
  before: CriticResult,
  candidate: CriticResult,
  hard: RegressionFinding[],
  score: RegressionFinding[],
  drift: RegressionFinding[],
): void => {
  if (!sameRubric(before, candidate)) return;
  const beforeDimensions = dimensionMap(before);
  const candidateDimensions = dimensionMap(candidate);
  const threshold = scoreRegressionThreshold(critic);

  for (const [id, prior] of beforeDimensions) {
    const next = candidateDimensions.get(id);
    if (!next) {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "incomplete-evaluation",
          critic,
          issueIds: [],
          details: `candidate evaluation is missing dimension ${id}`,
        }),
      );
      continue;
    }

    const floor = candidate.evaluation.dimensionFloors[id];
    const priorFloor = before.evaluation.dimensionFloors[id];
    if (floor !== undefined && prior.score >= (priorFloor ?? floor) && next.score < floor) {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "floor-crossed",
          critic,
          issueIds: [],
          details: `${critic}.${id} fell below floor ${floor}`,
        }),
      );
    }

    const drop = prior.score - next.score;
    if (drop <= 0) continue;
    if (critic === "fact-guardian" || critic === "delivery-critic") {
      if (next.score < (floor ?? 1) && prior.score >= (priorFloor ?? floor ?? 1)) {
        pushUnique(
          hard,
          finding({
            kind: "hard",
            code: "binary-dimension-failed",
            critic,
            issueIds: [],
            details: `${critic}.${id} changed from pass to fail`,
          }),
        );
      }
      continue;
    }

    if (threshold !== undefined && drop >= threshold) {
      pushUnique(
        score,
        finding({
          kind: "score",
          code: "dimension-drop",
          critic,
          issueIds: [],
          details: `${critic}.${id} dropped by ${round(drop)} points`,
        }),
      );
    } else {
      pushUnique(
        drift,
        finding({
          kind: "drift",
          code: "small-score-drift",
          critic,
          issueIds: [],
          details: `${critic}.${id} drifted down by ${round(drop)} points`,
        }),
      );
    }
  }

  const totalThreshold = totalRegressionThreshold(critic);
  const totalDrop = before.evaluation.normalizedTotal - candidate.evaluation.normalizedTotal;
  if (totalThreshold !== undefined && totalDrop >= totalThreshold) {
    pushUnique(
      score,
      finding({
        kind: "score",
        code: "total-drop",
        critic,
        issueIds: [],
        details: `${critic} normalized total dropped by ${round(totalDrop)} points`,
      }),
    );
  } else if (totalDrop > 0) {
    pushUnique(
      drift,
      finding({
        kind: "drift",
        code: "small-score-drift",
        critic,
        issueIds: [],
        details: `${critic} normalized total drifted down by ${round(totalDrop)} points`,
      }),
    );
  }
};

const checkIssueRegressions = (
  beforeIssues: readonly RevisionIssue[],
  candidateIssues: readonly RevisionIssue[],
  hard: RegressionFinding[],
): void => {
  const priorByKey = issueMap(beforeIssues);
  const priorById = issuesById(beforeIssues);

  for (const candidate of candidateIssues) {
    if (!activeIssue(candidate)) continue;
    const prior = priorByKey.get(issueKey(candidate));
    if (prior?.status === "resolved" || prior?.status === "waived") {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "reopened-issue",
          issueIds: [candidate.id],
          details: `issue ${candidate.id} reopened at the same locator`,
        }),
      );
      continue;
    }

    const priorBySameId = priorById.get(candidate.id);
    if (!priorBySameId) {
      if (candidate.severity === "blocker") {
        pushUnique(
          hard,
          finding({
            kind: "hard",
            code: "new-blocker",
            issueIds: [candidate.id],
            details: `candidate introduced blocker ${candidate.id}`,
          }),
        );
      } else if (candidate.severity === "high") {
        pushUnique(
          hard,
          finding({
            kind: "hard",
            code: "new-high-issue",
            issueIds: [candidate.id],
            details: `candidate introduced high issue ${candidate.id}`,
          }),
        );
      }
      continue;
    }

    const severityRank: Record<RevisionIssue["severity"], number> = {
      info: 0,
      low: 1,
      medium: 2,
      high: 3,
      blocker: 4,
    };
    if (severityRank[candidate.severity] > severityRank[priorBySameId.severity]) {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: candidate.severity === "blocker" ? "new-blocker" : "issue-severity-increase",
          issueIds: [candidate.id],
          details: `issue ${candidate.id} severity increased to ${candidate.severity}`,
        }),
      );
    }
  }
};

const checkReviewedArtifacts = (
  evaluations: Map<CriticName, CriticResult>,
  currentArtifacts: readonly ArtifactRef[] | undefined,
  hard: RegressionFinding[],
): void => {
  if (!currentArtifacts) return;
  const current = new Map(currentArtifacts.map((ref) => [ref.artifactId, ref]));
  for (const [critic, result] of evaluations) {
    for (const reviewed of result.reviewedArtifacts) {
      const selected = current.get(reviewed.artifactId);
      if (
        !selected ||
        selected.sha256 !== reviewed.sha256 ||
        selected.revision !== reviewed.revision
      ) {
        pushUnique(
          hard,
          finding({
            kind: "hard",
            code: "reviewed-artifact-stale",
            critic,
            issueIds: [],
            details: `${critic} reviewed a stale or unknown artifact ${reviewed.artifactId}`,
          }),
        );
      }
    }
  }
};

const checkProtectedConstraints = (
  constraints: readonly ProtectedConstraint[] | undefined,
  hard: RegressionFinding[],
): void => {
  for (const constraint of constraints ?? []) {
    const required = new Map(constraint.artifactRefs.map((ref) => [ref.artifactId, ref]));
    const evidence = new Map(
      (constraint.candidateEvidence ?? []).map((ref) => [ref.artifactId, ref]),
    );
    const missing = [...required].some(([artifactId]) => {
      const evidenceRef = evidence.get(artifactId);
      return !evidenceRef;
    });
    if (missing) {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "protected-constraint-missing",
          issueIds: [constraint.id],
          details: `candidate did not provide evidence for protected constraint ${constraint.id}`,
        }),
      );
    }
  }
};

export const detectRegression = (input: RevisionComparisonInput): RegressionReport => {
  const beforeEvaluations = evaluationMap(input.beforeEvaluations);
  const candidateEvaluations = evaluationMap(input.candidateEvaluations);
  const incomparableCritics: CriticName[] = [];
  const hard: RegressionFinding[] = [];
  const score: RegressionFinding[] = [];
  const drift: RegressionFinding[] = [];

  for (const critic of criticNames) {
    const before = beforeEvaluations.get(critic);
    const candidate = candidateEvaluations.get(critic);
    if (!before || !candidate) continue;
    if (!sameRubric(before, candidate)) {
      incomparableCritics.push(critic);
      continue;
    }

    if (before.verdict === "PASS" && candidate.verdict === "REJECT") {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "pass-to-reject",
          critic,
          issueIds: candidate.issues.filter(activeIssue).map((issue) => issue.id),
          details: `${critic} changed from PASS to REJECT`,
        }),
      );
    }
    if (candidate.verdict === "REJECT") {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "candidate-gate-reject",
          critic,
          issueIds: candidate.issues.filter(activeIssue).map((issue) => issue.id),
          details: `${critic} candidate gate is REJECT`,
        }),
      );
    }
    if (before.evaluation.passedThresholds && !candidate.evaluation.passedThresholds) {
      pushUnique(
        hard,
        finding({
          kind: "hard",
          code: "gate-threshold-failed",
          critic,
          issueIds: [],
          details: `${critic} no longer satisfies its threshold or dimension floors`,
        }),
      );
    }
    evaluateDimensionRegression(critic, before, candidate, hard, score, drift);
  }

  const beforeIssues = input.beforeIssues ?? issueArraysFrom(input.beforeEvaluations);
  const candidateIssues = input.candidateIssues ?? issueArraysFrom(input.candidateEvaluations);
  checkIssueRegressions(beforeIssues, candidateIssues, hard);
  checkReviewedArtifacts(candidateEvaluations, input.currentArtifacts, hard);
  checkProtectedConstraints(input.protectedConstraints, hard);

  const findings = [...hard, ...score, ...drift];
  return {
    comparable: incomparableCritics.length === 0,
    incomparableCritics,
    hard,
    score,
    drift,
    findings,
    rejected: hard.length > 0 || score.length > 0,
  };
};

type SelectionDimension = {
  critic: CriticName;
  dimensionId: string;
  score: number;
};

const selectionDimensionKey = (
  dimension: Pick<SelectionDimension, "critic" | "dimensionId">,
): string => `${dimension.critic}:${dimension.dimensionId}`;

const selectionDimensions = (
  evaluations: Map<CriticName, CriticResult>,
): Map<string, SelectionDimension> => {
  const dimensions = new Map<string, SelectionDimension>();
  for (const [critic, result] of evaluations) {
    for (const dimension of result.evaluation.dimensions) {
      const value = {critic, dimensionId: dimension.id, score: dimension.score};
      dimensions.set(selectionDimensionKey(value), value);
    }
  }
  return dimensions;
};

const selectionSelectorMatches = (
  selector: string | EvaluationDimensionSelector,
  dimension: SelectionDimension,
): boolean => {
  if (typeof selector === "string") {
    return selector.includes(":")
      ? selector === selectionDimensionKey(dimension)
      : selector === dimension.dimensionId;
  }
  return selector.critic === dimension.critic && selector.dimensionId === dimension.dimensionId;
};

const selectionSelectorDrop = (selector: string | EvaluationDimensionSelector): number => {
  if (typeof selector === "string") return 0;
  const maxDrop = selector.maxDrop ?? 0;
  if (!Number.isFinite(maxDrop) || maxDrop < 0) {
    throw new Error("REVISION_PROTECTED_DIMENSION_DROP_INVALID");
  }
  return maxDrop;
};

const selectionSelectorsFor = (
  selectors: readonly (string | EvaluationDimensionSelector)[] | undefined,
  dimensions: Iterable<SelectionDimension>,
): {keys: Map<string, number>; unmatched: boolean} => {
  const entries = [...dimensions];
  const keys = new Map<string, number>();
  let matched = 0;
  for (const selector of selectors ?? []) {
    const matches = entries.filter((dimension) => selectionSelectorMatches(selector, dimension));
    if (matches.length === 0) continue;
    matched += matches.length;
    const maxDrop = selectionSelectorDrop(selector);
    for (const dimension of matches) {
      const key = selectionDimensionKey(dimension);
      const current = keys.get(key);
      keys.set(key, current === undefined ? maxDrop : Math.min(current, maxDrop));
    }
  }
  return {
    keys,
    unmatched: (selectors?.length ?? 0) > 0 && matched === 0,
  };
};

const sameCriticSet = (
  before: Map<CriticName, CriticResult>,
  candidate: Map<CriticName, CriticResult>,
): boolean =>
  before.size === candidate.size && [...before.keys()].every((critic) => candidate.has(critic));

const candidatePassesSelectionGates = (evaluations: Map<CriticName, CriticResult>): boolean => {
  if (evaluations.size === 0) return false;
  return [...evaluations.values()].every((result) => {
    const floorsPass = result.evaluation.dimensions.every(
      (dimension) => dimension.score >= (result.evaluation.dimensionFloors[dimension.id] ?? 0),
    );
    const hasBlocker =
      result.blockers.length > 0 ||
      result.issues.some((issue) => issue.status === "open" && issue.severity === "blocker");
    return (
      result.verdict === "PASS" && result.evaluation.passedThresholds && floorsPass && !hasBlocker
    );
  });
};

const targetIssueIsClosed = (
  targetIssueIds: readonly string[],
  candidateIssues: readonly RevisionIssue[],
): boolean => {
  const candidateById = new Map<string, RevisionIssue[]>();
  for (const issue of candidateIssues) {
    const values = candidateById.get(issue.id) ?? [];
    values.push(issue);
    candidateById.set(issue.id, values);
  }
  return targetIssueIds.every((issueId) =>
    (candidateById.get(issueId) ?? []).every((issue) => !activeIssue(issue)),
  );
};

/**
 * Selects a candidate with ADR-003's Pareto rule.
 *
 * `evaluation.normalizedTotal` is intentionally never read here. It remains a reporting
 * value; automatic promotion is based on per-dimension comparisons only.
 */
export const selectBest = (input: RevisionSelectionInput): BestSelectionResult => {
  const beforeInput = input.before ?? input.best ?? input.currentBest;
  if (!beforeInput) throw new Error("REVISION_BEST_MISSING");

  const before = parsedRefs(beforeInput);
  const candidate = parsedRefs(input.candidate);
  const targetGain = input.targetGain ?? 0.5;
  if (!Number.isFinite(targetGain) || targetGain < 0) {
    throw new Error("REVISION_TARGET_GAIN_INVALID");
  }

  const beforeEvaluations = evaluationMap(input.beforeEvaluations);
  const candidateEvaluations = evaluationMap(input.candidateEvaluations);
  const beforeIssues = input.beforeIssues ?? issueArraysFrom(input.beforeEvaluations);
  const candidateIssues = input.candidateIssues ?? issueArraysFrom(input.candidateEvaluations);
  const regression = detectRegression({
    before,
    candidate,
    beforeEvaluations: input.beforeEvaluations,
    candidateEvaluations: input.candidateEvaluations,
    beforeIssues,
    candidateIssues,
    targetIssueIds: input.targetIssueIds,
    protectedConstraints: input.protectedConstraints,
    currentArtifacts: input.currentArtifacts,
  });

  const sameCritics = sameCriticSet(beforeEvaluations, candidateEvaluations);
  const rubricComparable =
    beforeEvaluations.size > 0 &&
    sameCritics &&
    [...beforeEvaluations].every(([critic, beforeResult]) => {
      const candidateResult = candidateEvaluations.get(critic);
      return candidateResult !== undefined && sameRubric(beforeResult, candidateResult);
    });
  const comparable = rubricComparable && regression.comparable;

  const incomparableCriticSet = new Set(regression.incomparableCritics);
  for (const critic of criticNames) {
    if (beforeEvaluations.has(critic) !== candidateEvaluations.has(critic)) {
      incomparableCriticSet.add(critic);
    }
  }
  const incomparableCritics = criticNames.filter((critic) => incomparableCriticSet.has(critic));

  const targetIssueIds = [
    ...new Set(
      input.targetIssueIds ??
        beforeIssues.filter((issue) => activeIssue(issue)).map((issue) => issue.id),
    ),
  ];
  const targetIssueClosed = targetIssueIsClosed(targetIssueIds, candidateIssues);
  const candidateGatePasses = candidatePassesSelectionGates(candidateEvaluations);
  const noHardRegression = regression.hard.length === 0;

  const beforeDimensions = selectionDimensions(beforeEvaluations);
  const candidateDimensions = selectionDimensions(candidateEvaluations);
  const comparableDimensionPairs = [...beforeDimensions].map(([key, beforeDimension]) => ({
    key,
    before: beforeDimension,
    candidate: candidateDimensions.get(key),
  }));
  const paretoHasAllDimensions = comparableDimensionPairs.every(
    ({candidate: candidateDimension}) => candidateDimension !== undefined,
  );
  const paretoNoDimensionDrop = comparableDimensionPairs.every(
    ({before: beforeDimension, candidate: candidateDimension}) =>
      candidateDimension !== undefined && candidateDimension.score >= beforeDimension.score,
  );
  const paretoHasStrictImprovement = comparableDimensionPairs.some(
    ({before: beforeDimension, candidate: candidateDimension}) =>
      candidateDimension !== undefined && candidateDimension.score > beforeDimension.score,
  );
  const paretoDominates =
    comparable &&
    comparableDimensionPairs.length > 0 &&
    paretoHasAllDimensions &&
    paretoNoDimensionDrop &&
    paretoHasStrictImprovement;

  const targetedSelectors = input.targetedDimensions ?? input.targetedDimensionIds;
  const targetDimensions =
    targetedSelectors === undefined
      ? [...beforeDimensions.values()]
      : [...beforeDimensions.values()].filter((dimension) =>
          targetedSelectors.some((selector) => selectionSelectorMatches(selector, dimension)),
        );
  const meaningfulImprovement = targetDimensions.some((beforeDimension) => {
    const candidateDimension = candidateDimensions.get(selectionDimensionKey(beforeDimension));
    return (
      candidateDimension !== undefined &&
      candidateDimension.score > beforeDimension.score &&
      candidateDimension.score - beforeDimension.score >= targetGain
    );
  });

  const configuredProtectedSelectors =
    input.protectedEvaluationDimensions ?? input.protectedDimensions ?? input.protectedDimensionIds;
  const protectedSelection = selectionSelectorsFor(
    configuredProtectedSelectors,
    beforeDimensions.values(),
  );
  const protectedDimensionKeys =
    configuredProtectedSelectors === undefined
      ? new Map([...beforeDimensions.keys()].map((key) => [key, 0]))
      : protectedSelection.keys;
  const protectedDimensionRegressions: string[] = [];
  for (const [key, maxDrop] of protectedDimensionKeys) {
    const beforeDimension = beforeDimensions.get(key);
    const candidateDimension = candidateDimensions.get(key);
    if (!beforeDimension || !candidateDimension) {
      protectedDimensionRegressions.push(key);
      continue;
    }
    if (beforeDimension.score - candidateDimension.score > maxDrop) {
      protectedDimensionRegressions.push(key);
    }
  }
  const protectedDimensionsPreserved =
    !protectedSelection.unmatched && protectedDimensionRegressions.length === 0;

  const reasons: BestSelectionReason[] = [];
  if (!comparable) reasons.push("rubric-incomparable");
  if (!targetIssueClosed) reasons.push("target-issue-open");
  if (!candidateGatePasses) reasons.push("candidate-gate-failed");
  if (!noHardRegression) reasons.push("hard-regression");
  if (!protectedDimensionsPreserved) reasons.push("protected-dimension-regression");
  if (!meaningfulImprovement) reasons.push("no-meaningful-improvement");
  if (!paretoDominates) reasons.push("not-pareto-dominant");

  const selected =
    comparable &&
    targetIssueClosed &&
    candidateGatePasses &&
    noHardRegression &&
    protectedDimensionsPreserved &&
    meaningfulImprovement &&
    paretoDominates;
  const best = selected ? candidate : before;
  const status = selected ? "selected" : comparable ? "rejected" : "incomparable";

  return {
    decision: selected ? "selected" : comparable ? "retained" : "incomparable",
    status,
    reason: selected ? "selected" : (reasons[0] ?? "not-pareto-dominant"),
    selected,
    promoted: selected,
    best,
    selectedBest: best,
    candidate,
    comparable,
    targetIssueClosed,
    candidateGatePasses,
    noHardRegression,
    protectedDimensionsPreserved,
    meaningfulImprovement,
    paretoDominates,
    regression,
    incomparableCritics,
    targetIssueIds,
    protectedDimensionRegressions,
  };
};

const issueFingerprint = (issue: RevisionIssue): string =>
  stableJson({
    id: issue.id,
    status: issue.status,
    severity: issue.severity,
    category: issue.category,
    affectedArtifact: issue.affectedArtifact,
    evidence: issue.evidence,
  });

export const detectNoProgress = (input: {
  before: readonly ArtifactRef[];
  candidate: readonly ArtifactRef[];
  beforeIssues?: readonly RevisionIssue[];
  candidateIssues?: readonly RevisionIssue[];
  targetIssueIds?: readonly string[];
}): NoProgressReport => {
  const artifactHashesEqual = artifactHashMapsEqual(input.before, input.candidate);
  const beforeIssues = input.beforeIssues ?? [];
  const candidateIssues = input.candidateIssues ?? [];
  const targetIds = new Set(
    input.targetIssueIds ??
      beforeIssues.filter((issue) => activeIssue(issue)).map((issue) => issue.id),
  );
  const priorById = new Map(beforeIssues.map((issue) => [issue.id, issue]));
  const candidateById = new Map(candidateIssues.map((issue) => [issue.id, issue]));
  const targetedIssueUnchanged = [...targetIds].some((issueId) => {
    const before = priorById.get(issueId);
    const candidate = candidateById.get(issueId);
    return Boolean(
      before &&
      candidate &&
      activeIssue(before) &&
      activeIssue(candidate) &&
      issueFingerprint(before) === issueFingerprint(candidate),
    );
  });
  const reasons: NoProgressReport["reasons"] = [];
  if (artifactHashesEqual) reasons.push("artifact-hashes-unchanged");
  if (targetedIssueUnchanged) reasons.push("targeted-issue-unchanged");
  return {
    detected: reasons.length > 0,
    artifactHashesEqual,
    targetedIssueUnchanged,
    reasons,
  };
};

const historyObject = (
  entry: RevisionHistoryEntry,
): Exclude<RevisionHistoryEntry, string | readonly ArtifactRef[]> | undefined => {
  if (typeof entry === "string" || Array.isArray(entry)) return undefined;
  return entry as Exclude<RevisionHistoryEntry, string | readonly ArtifactRef[]>;
};

const historySignature = (entry: RevisionHistoryEntry): string => {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) return artifactFingerprint(entry);
  const objectEntry = historyObject(entry);
  if (objectEntry?.signature !== undefined) return objectEntry.signature;
  return artifactFingerprint(objectEntry?.artifactRefs ?? []);
};

const historyIssues = (history: readonly RevisionHistoryEntry[]): RevisionIssueState[] =>
  history.flatMap((entry) => historyObject(entry)?.issues ?? []);

const historyRoutes = (history: readonly RevisionHistoryEntry[]): string[] =>
  history.flatMap((entry) => {
    const objectEntry = historyObject(entry);
    if (objectEntry?.route === undefined || objectEntry.route === null) return [];
    return [objectEntry.route];
  });

const hasOpenResolvedOpen = (states: readonly RevisionIssueState[]): boolean => {
  const grouped = new Map<string, RevisionIssueState[]>();
  for (const state of states) {
    const key = `${state.id}:${state.locator ?? ""}`;
    const values = grouped.get(key) ?? [];
    values.push(state);
    grouped.set(key, values);
  }
  for (const values of grouped.values()) {
    for (let index = 2; index < values.length; index += 1) {
      const first = values[index - 2];
      const middle = values[index - 1];
      const last = values[index];
      if (first?.status === "open" && middle?.status !== "open" && last?.status === "open") {
        return true;
      }
    }
  }
  return false;
};

const repeatedSignatures = (values: readonly string[]): number => {
  let count = 0;
  for (let index = 2; index < values.length; index += 1) {
    const current = values[index];
    if (current === undefined) continue;
    const previous = values[index - 2];
    if (previous !== undefined && current === previous && values[index - 1] !== current) {
      count += 1;
      continue;
    }
    if (values.slice(0, index - 1).includes(current)) count += 1;
  }
  return count;
};

export const detectOscillation = (
  input: readonly RevisionHistoryEntry[] | {history: readonly RevisionHistoryEntry[]},
): OscillationReport => {
  const history = "history" in input ? input.history : input;
  const signatures = history.map(historySignature);
  const ids: string[] = [];
  const reasons: OscillationReport["reasons"] = [];

  if (repeatedSignatures(signatures) > 0) {
    ids.push("oscillation-hash-cycle");
    reasons.push("hash-cycle");
  }
  if (hasOpenResolvedOpen(historyIssues(history))) {
    ids.push("oscillation-issue-cycle");
    reasons.push("issue-cycle");
  }
  if (repeatedSignatures(historyRoutes(history)) > 0) {
    ids.push("oscillation-route-cycle");
    reasons.push("route-cycle");
  }

  const detected = ids.length > 0;
  const alternatingHashCycle =
    signatures.length >= 4 &&
    signatures.at(-1) === signatures.at(-3) &&
    signatures.at(-2) === signatures.at(-4) &&
    signatures.at(-1) !== signatures.at(-2);
  const action = !detected ? "none" : ids.length >= 2 || alternatingHashCycle ? "escalate" : "warn";
  return {
    detected,
    action,
    retainBest: detected,
    signatures,
    oscillationIds: ids,
    reasons,
  };
};

export const detectLedgerOscillation = (ledger: RevisionLedger): OscillationReport => {
  const history: RevisionHistoryEntry[] = [];
  for (const attempt of ledger.attempts) {
    if (attempt.before.length > 0) history.push(attempt.before);
    history.push(attempt.candidate);
  }
  return detectOscillation(history);
};

export const assessBestRestoration = (input: {
  best: readonly ArtifactRef[];
  artifactIndex?: ArtifactIndex;
  currentArtifacts?: readonly ArtifactRef[];
  dependencies?: Readonly<Record<string, readonly ArtifactDependency[]>>;
}): BestRestorationReport => {
  const best = parsedRefs(input.best);
  const stale = new Set<string>();
  const current = new Map((input.currentArtifacts ?? []).map((ref) => [ref.artifactId, ref]));

  for (const bestRef of best) {
    if (input.artifactIndex) {
      const record = input.artifactIndex.artifacts.find(
        (candidate) =>
          candidate.ref.artifactId === bestRef.artifactId &&
          candidate.ref.revision === bestRef.revision &&
          candidate.ref.sha256 === bestRef.sha256,
      );
      if (!record) {
        stale.add(bestRef.artifactId);
        continue;
      }
      for (const dependency of record.dependencies) {
        const selected = input.artifactIndex.selected[dependency.artifactId];
        if (!selected || selected.sha256 !== dependency.sha256) stale.add(bestRef.artifactId);
      }
    } else if (input.currentArtifacts) {
      const currentRef = current.get(bestRef.artifactId);
      if (
        !currentRef ||
        currentRef.sha256 !== bestRef.sha256 ||
        currentRef.revision !== bestRef.revision
      ) {
        stale.add(bestRef.artifactId);
      }
    }

    for (const dependency of input.dependencies?.[bestRef.artifactId] ?? []) {
      const currentDependency = current.get(dependency.artifactId);
      if (!currentDependency || currentDependency.sha256 !== dependency.sha256) {
        stale.add(bestRef.artifactId);
      }
    }
  }

  return {
    historical: true,
    restorable: stale.size === 0,
    staleArtifactIds: [...stale].sort(),
  };
};

export const canRestoreBest = (input: Parameters<typeof assessBestRestoration>[0]): boolean =>
  assessBestRestoration(input).restorable;

export const computeRevisionBaselineId = (input: RevisionBaselineInput): string => {
  const artifacts = [...(input.inputArtifacts ?? [])]
    .map((artifact) => ({artifactId: artifact.artifactId, sha256: artifact.sha256}))
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const promptRefs = [...(input.promptRefs ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const rubricVersions = Array.isArray(input.rubricVersions)
    ? [...input.rubricVersions].sort()
    : Object.fromEntries(
        Object.entries(input.rubricVersions ?? {}).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
  const constraints = [...(input.constraints ?? [])].sort();
  return sha256(stableJson({artifacts, constraints, promptRefs, rubricVersions}));
};

export const createRevisionLedger = (input: {
  episodeId: string;
  baselineId?: string;
  baseline?: RevisionBaselineInput;
  approvalEpoch?: number;
  budgets?: Partial<RevisionBudget>;
  selected?: Readonly<Record<string, ArtifactRef>>;
  best?: Readonly<Record<string, ArtifactRef>>;
}): RevisionLedger => {
  const selected = Object.fromEntries(
    Object.entries(input.selected ?? {}).map(([key, ref]) => [key, artifactRefSchema.parse(ref)]),
  );
  const best = Object.fromEntries(
    Object.entries(input.best ?? selected).map(([key, ref]) => [key, artifactRefSchema.parse(ref)]),
  );
  const baselineId =
    input.baselineId ??
    computeRevisionBaselineId({
      ...(input.baseline ?? {}),
      inputArtifacts:
        input.baseline?.inputArtifacts ??
        Object.values(selected).map(({artifactId, sha256}) => ({artifactId, sha256})),
    });
  return revisionLedgerSchema.parse({
    schemaVersion: "revision-ledger-v1",
    episodeId: input.episodeId,
    approvalEpoch: input.approvalEpoch ?? 0,
    baselineId,
    budgets: {
      oralRoundsUsed: input.budgets?.oralRoundsUsed ?? 0,
      creativeRoundsUsed: input.budgets?.creativeRoundsUsed ?? 0,
      deliveryRoundsUsed: input.budgets?.deliveryRoundsUsed ?? 0,
    },
    selected,
    best,
    attempts: [],
  });
};

export const checkRevisionBudget = (
  ledgerOrBudget: RevisionLedger | RevisionBudget,
  kind: RevisionBudgetKind,
  limits: RevisionBudgetLimits = defaultRevisionBudgetLimits,
): RevisionBudgetCheck => {
  const parsedLimits = revisionBudgetLimitsSchema.parse(limits);
  const budget = "schemaVersion" in ledgerOrBudget ? ledgerOrBudget.budgets : ledgerOrBudget;
  const field = budgetField[kind];
  const maximum = parsedLimits[budgetMaximumField[kind]];
  if (typeof maximum !== "number") throw new Error(`REVISION_BUDGET_LIMIT_MISSING:${kind}`);
  const used = budget[field];
  const remaining = Math.max(0, maximum - used);
  return {
    kind,
    allowed: used < maximum,
    used,
    maximum,
    remaining,
    ...(used >= maximum ? {reason: "budget-exhausted" as const} : {}),
  };
};

export const canDispatchRevision = (
  ledgerOrBudget: RevisionLedger | RevisionBudget,
  kind: RevisionBudgetKind,
  limits: RevisionBudgetLimits = defaultRevisionBudgetLimits,
): boolean => checkRevisionBudget(ledgerOrBudget, kind, limits).allowed;

export const remainingRevisionBudget = (
  ledgerOrBudget: RevisionLedger | RevisionBudget,
  kind: RevisionBudgetKind,
  limits: RevisionBudgetLimits = defaultRevisionBudgetLimits,
): number => checkRevisionBudget(ledgerOrBudget, kind, limits).remaining;

export const consumeRevisionBudget = (
  budget: RevisionBudget,
  kind: RevisionBudgetKind,
  limits: RevisionBudgetLimits = defaultRevisionBudgetLimits,
  amount = 1,
): RevisionBudget => {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("REVISION_BUDGET_AMOUNT_INVALID");
  const check = checkRevisionBudget(budget, kind, limits);
  if (amount > check.remaining) throw new Error(`REVISION_BUDGET_EXHAUSTED:${kind}`);
  return {
    ...budget,
    [budgetField[kind]]: check.used + amount,
  } as RevisionBudget;
};

export const inferRevisionBudgetKind = (input: {
  ownerAgent?: string;
  issueCategories?: readonly string[];
}): RevisionBudgetKind => {
  if (
    input.ownerAgent === "oral-rewriter" ||
    input.ownerAgent === "oral-judge" ||
    (input.issueCategories ?? []).some((category) => category.startsWith("oral."))
  ) {
    return "oral";
  }
  if (
    input.ownerAgent === "production-executor" ||
    input.ownerAgent === "delivery-critic" ||
    (input.issueCategories ?? []).some((category) => category.startsWith("delivery."))
  ) {
    return "delivery";
  }
  return "creative";
};

export const strategyForRejectionCount = (validRejections: number): RevisionStrategyLevel => {
  if (!Number.isInteger(validRejections) || validRejections < 0) {
    throw new Error("REVISION_REJECTION_COUNT_INVALID");
  }
  return Math.min(4, validRejections) as RevisionStrategyLevel;
};

export const strategyForNextDispatch = (
  validRejections: number,
  kind: RevisionBudgetKind = "creative",
  limits: RevisionBudgetLimits = defaultRevisionBudgetLimits,
): RevisionStrategyLevel => {
  const next = strategyForRejectionCount(validRejections);
  const maximum = limits[budgetMaximumField[kind]];
  if (typeof maximum !== "number") throw new Error(`REVISION_BUDGET_LIMIT_MISSING:${kind}`);
  return validRejections >= maximum ? 4 : next;
};

export const strategyForAttempt = (attemptNumber: number): RevisionStrategyLevel => {
  if (!Number.isInteger(attemptNumber) || attemptNumber <= 0) {
    throw new Error("REVISION_ATTEMPT_NUMBER_INVALID");
  }
  return Math.min(3, attemptNumber - 1) as RevisionStrategyLevel;
};

export const assessRevision = (input: RevisionAssessmentInput): RevisionAssessment => {
  const before = parsedRefs(input.before);
  const candidate = parsedRefs(input.candidate);
  const beforeIssues = input.beforeIssues ?? issueArraysFrom(input.beforeEvaluations);
  const candidateIssues = input.candidateIssues ?? issueArraysFrom(input.candidateEvaluations);
  const validAttempt = input.validAttempt ?? true;
  const regression = detectRegression({
    ...input,
    before,
    candidate,
    beforeIssues,
    candidateIssues,
  });
  const noProgress = detectNoProgress({
    before,
    candidate,
    beforeIssues,
    candidateIssues,
    targetIssueIds: input.targetIssueIds,
  });
  const oscillation = input.history
    ? detectOscillation(input.history)
    : {
        detected: false,
        action: "none" as const,
        retainBest: false,
        signatures: [],
        oscillationIds: [],
        reasons: [],
      };

  if (!validAttempt) {
    return {
      regression,
      noProgress,
      oscillation,
      disposition: "quarantined",
      retainBest: true,
      requiresHuman: false,
      budgetExhausted: false,
    };
  }

  const kind = input.budgetKind ?? "creative";
  const limits = input.budgetLimits ?? defaultRevisionBudgetLimits;
  const budgetExhausted = input.ledger ? !canDispatchRevision(input.ledger, kind, limits) : false;
  const requiresHuman = oscillation.action === "escalate" || budgetExhausted;
  const rejected = regression.rejected || noProgress.detected || oscillation.detected;
  return {
    regression,
    noProgress,
    oscillation,
    disposition: requiresHuman ? "human-required" : rejected ? "rejected" : "candidate-eligible",
    retainBest: rejected || requiresHuman,
    requiresHuman,
    budgetExhausted,
  };
};

type RevisionAttemptOptions = {
  attempt?: RevisionAttempt;
  budgetKind?: RevisionBudgetKind;
  valid?: boolean;
  consumesBudget?: boolean;
  budgetLimits?: RevisionBudgetLimits;
};

export type RecordRevisionAttemptInput =
  RevisionAttemptOptions | (RevisionAttempt & Omit<RevisionAttemptOptions, "attempt">);

const attemptFromInput = (input: RecordRevisionAttemptInput): RevisionAttempt => {
  if ("attempt" in input && input.attempt) return revisionAttemptSchema.parse(input.attempt);
  const attempt = {...input} as Record<string, unknown>;
  delete attempt.attempt;
  delete attempt.budgetKind;
  delete attempt.valid;
  delete attempt.consumesBudget;
  delete attempt.budgetLimits;
  return revisionAttemptSchema.parse(attempt);
};

const selectedMapWith = (
  current: Readonly<Record<string, ArtifactRef>>,
  refs: readonly ArtifactRef[],
): Record<string, ArtifactRef> => ({
  ...current,
  ...Object.fromEntries(refs.map((ref) => [ref.artifactId, ref])),
});

export const recordRevisionAttempt = (
  ledger: RevisionLedger,
  input: RecordRevisionAttemptInput,
): RevisionLedger => {
  const current = revisionLedgerSchema.parse(ledger);
  const attempt = attemptFromInput(input);
  if (current.attempts.some((item) => item.revisionId === attempt.revisionId)) {
    throw new Error(`REVISION_DUPLICATE_ID:${attempt.revisionId}`);
  }

  const valid = input.valid ?? attempt.disposition !== "quarantined";
  const budgetKind = input.budgetKind ?? inferRevisionBudgetKind({ownerAgent: attempt.ownerAgent});
  const consumesBudget =
    input.consumesBudget ??
    (valid && (attempt.disposition === "rejected" || attempt.disposition === "selected"));
  let budgets = current.budgets;
  if (consumesBudget) {
    budgets = consumeRevisionBudget(
      budgets,
      budgetKind,
      input.budgetLimits ?? defaultRevisionBudgetLimits,
    );
  }

  const selected =
    attempt.disposition === "selected"
      ? selectedMapWith(current.selected, attempt.candidate)
      : current.selected;
  const best =
    attempt.disposition === "selected"
      ? selectedMapWith(current.best, attempt.candidate)
      : current.best;
  return revisionLedgerSchema.parse({
    ...current,
    budgets,
    selected,
    best,
    attempts: [...current.attempts, attempt],
  });
};

export const createHumanEscalation = (input: {
  episodeId: string;
  reason: RevisionHumanEscalation["reason"];
  openIssueIds: readonly string[];
  selectedBestRefs: readonly ArtifactRef[];
  rejectedCandidateRefs: readonly ArtifactRef[];
  decisionNeeded: string;
  forbiddenAutomaticActions: readonly string[];
}): RevisionHumanEscalation =>
  humanEscalationSchema.parse({
    schemaVersion: "human-escalation-v1",
    ...input,
    openIssueIds: [...input.openIssueIds],
    selectedBestRefs: parsedRefs(input.selectedBestRefs),
    rejectedCandidateRefs: parsedRefs(input.rejectedCandidateRefs),
    forbiddenAutomaticActions: [...input.forbiddenAutomaticActions],
  });

export const revisionBudgetKindValues = revisionBudgetKinds;
