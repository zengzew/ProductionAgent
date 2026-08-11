import {z} from "zod";
import ownershipJson from "../../config/ownership.json";
import {
  agentOwnerSchema,
  agentOwners,
  issueCategories,
  issueCategorySchema,
  routeTargetSchema,
  type CriticIssue,
} from "./schemas/critic-output";
import {stableJson} from "./stable-json";

const severityValues = ["info", "low", "medium", "high", "blocker"] as const;
const issueStatusValues = ["open", "resolved", "waived", "wontfix", "escalated"] as const;
const provenanceSourceSchema = z.literal("artifact-producer");

const staticOwnershipRuleSchema = z
  .object({
    owner: agentOwnerSchema,
    routeTarget: routeTargetSchema,
    restartAt: z.string().min(1),
  })
  .strict();

const provenanceOwnershipRuleSchema = z
  .object({
    ownerSource: provenanceSourceSchema,
    routeTargetSource: provenanceSourceSchema,
    restartAtSource: provenanceSourceSchema,
  })
  .strict();

const ownershipRuleSchema = z.union([staticOwnershipRuleSchema, provenanceOwnershipRuleSchema]);

export const ownershipConfigSchema = z
  .object({
    schemaVersion: z.literal("ownership-v1"),
    policyVersion: z.literal("routing-policy-v1"),
    restartOrder: z.array(z.string().min(1)).min(1),
    contractOrder: z.array(z.string().min(1)).min(1),
    categories: z.record(z.string().min(1), ownershipRuleSchema),
  })
  .strict();

export type AgentOwner = z.infer<typeof agentOwnerSchema>;
export type RouteTarget = z.infer<typeof routeTargetSchema>;
export type IssueCategory = z.infer<typeof issueCategorySchema>;
export type IssueSeverity = (typeof severityValues)[number];
export type IssueStatus = (typeof issueStatusValues)[number];

export type StaticOwnershipRule = z.infer<typeof staticOwnershipRuleSchema>;
export type ProvenanceOwnershipRule = z.infer<typeof provenanceOwnershipRuleSchema>;
export type OwnershipRule = StaticOwnershipRule | ProvenanceOwnershipRule;
export type OwnershipConfig = z.infer<typeof ownershipConfigSchema>;

export const defaultOwnershipConfig: OwnershipConfig = ownershipConfigSchema.parse(ownershipJson);

export type ArtifactProvenance = {
  producer?: string;
  ownerAgent?: string;
  routeTarget?: string;
  restartAt?: string;
  stage?: string;
};

export type ProvenanceValue = string | ArtifactProvenance;
export type ProvenanceIndex = Readonly<
  Record<string, ProvenanceValue | readonly ProvenanceValue[] | undefined>
>;

type RoutingArtifact = CriticIssue["affectedArtifact"] & {
  producer?: string;
  provenance?: ProvenanceValue | readonly ProvenanceValue[];
};

export type RoutingIssue = Omit<
  Pick<CriticIssue, "id" | "affectedArtifact">,
  "affectedArtifact"
> & {
  category: string;
  severity: string;
  status: string;
  affectedArtifact: RoutingArtifact;
  ownerAgent?: unknown;
  routeTarget?: unknown;
  suggestedCorrection?: unknown;
  provenance?: ProvenanceValue | readonly ProvenanceValue[];
};

export type RoutingBudget = {
  remaining?: number;
  remainingRounds?: number;
  revisionBudgetRemaining?: number;
  maxRoundsPerOwner?: number;
  roundsUsed?: Readonly<Record<string, number>>;
  maxRoundsContent?: number;
  maxRoundsProduction?: number;
  maxCostUsd?: number;
  spentCostUsd?: number;
  remainingCostUsd?: number;
  maxWallclockSeconds?: number;
  spentWallclockSeconds?: number;
  remainingWallclockSeconds?: number;
};

export type PrimaryRoute = {
  ownerAgent: AgentOwner;
  routeTarget: RouteTarget;
  restartAt: string;
  reasonCode: IssueCategory;
  issueIds: string[];
};

export type HumanEscalationReason =
  | "budget-exhausted"
  | "oscillation"
  | "constraint-conflict"
  | "unknown-provenance"
  | "ambiguous-provenance"
  | "unknown-category";

export type HumanEscalation = {
  action: "escalate";
  kind: "human-escalation";
  route: null;
  routeTarget: "human-editor";
  reason: HumanEscalationReason;
  reasonCode: HumanEscalationReason;
  issueIds: string[];
};

export type RouteSelection = PrimaryRoute | HumanEscalation | null;

export type SelectPrimaryRouteInput = {
  issues: readonly RoutingIssue[];
  budget?: RoutingBudget | number;
  config?: RoutingConfig;
  provenance?: ProvenanceIndex;
};

export type RoutingConfig = OwnershipConfig;

type ResolvedRoute = {
  issue: RoutingIssue;
  ownerAgent: AgentOwner;
  routeTarget: RouteTarget;
  restartAt: string;
  operational: boolean;
};

type ProvenanceResolution =
  {kind: "resolved"; value: ArtifactProvenance} | {kind: "unknown"} | {kind: "ambiguous"};

const severityRank: Record<IssueSeverity, number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const isSeverity = (value: string): value is IssueSeverity =>
  (severityValues as readonly string[]).includes(value);

const isIssueStatus = (value: string): value is IssueStatus =>
  (issueStatusValues as readonly string[]).includes(value);

const isStaticRule = (rule: OwnershipRule): rule is StaticOwnershipRule => "owner" in rule;

const isProvenanceRule = (rule: OwnershipRule): rule is ProvenanceOwnershipRule =>
  "ownerSource" in rule;

const compareIssues = (left: RoutingIssue, right: RoutingIssue): number => {
  const leftSeverity = isSeverity(left.severity)
    ? severityRank[left.severity]
    : severityValues.length;
  const rightSeverity = isSeverity(right.severity)
    ? severityRank[right.severity]
    : severityValues.length;
  return (
    leftSeverity - rightSeverity ||
    left.category.localeCompare(right.category) ||
    left.id.localeCompare(right.id)
  );
};

const sortedIssues = (issues: readonly RoutingIssue[]): RoutingIssue[] =>
  [...issues].sort(compareIssues);

const validatedOwnershipConfigs = new WeakMap<OwnershipConfig, string>();

const validateOwnershipConfig = (config: OwnershipConfig): void => {
  const fingerprint = stableJson(config);
  if (validatedOwnershipConfigs.get(config) === fingerprint) return;
  const parsed = ownershipConfigSchema.parse(config);
  const knownCategories = new Set(issueCategories);
  const configuredCategories = Object.keys(parsed.categories);
  if (
    configuredCategories.length !== knownCategories.size ||
    configuredCategories.some((category) => !knownCategories.has(category as IssueCategory))
  ) {
    throw new Error("ROUTING_CONFIG_CATEGORY_COVERAGE");
  }
  if (configuredCategories.some((category) => !parsed.categories[category])) {
    throw new Error("ROUTING_CONFIG_CATEGORY_MISSING");
  }
  if (new Set(parsed.restartOrder).size !== parsed.restartOrder.length) {
    throw new Error("ROUTING_CONFIG_DUPLICATE_RESTART_ORDER");
  }
  validatedOwnershipConfigs.set(config, fingerprint);
};

const issueArtifactId = (issue: RoutingIssue): string | undefined =>
  issue.affectedArtifact?.artifactId;

const asProvenanceValue = (value: unknown): ProvenanceValue | undefined => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    ["producer", "ownerAgent", "routeTarget", "restartAt", "stage"].every(
      (key) => record[key] === undefined || typeof record[key] === "string",
    )
  ) {
    return {
      producer: typeof record.producer === "string" ? record.producer : undefined,
      ownerAgent: typeof record.ownerAgent === "string" ? record.ownerAgent : undefined,
      routeTarget: typeof record.routeTarget === "string" ? record.routeTarget : undefined,
      restartAt: typeof record.restartAt === "string" ? record.restartAt : undefined,
      stage: typeof record.stage === "string" ? record.stage : undefined,
    };
  }
  return undefined;
};

const provenanceCandidates = (value: unknown): ProvenanceValue[] | undefined => {
  if (Array.isArray(value)) {
    const candidates = value.map(asProvenanceValue);
    return candidates.every((candidate): candidate is ProvenanceValue => candidate !== undefined)
      ? candidates
      : undefined;
  }
  const candidate = asProvenanceValue(value);
  return candidate === undefined ? undefined : [candidate];
};

const provenanceRecordKey = (value: ProvenanceValue): string => {
  const record = typeof value === "string" ? {producer: value} : value;
  return stableJson(record);
};

const combineProvenance = (candidates: readonly ProvenanceValue[]): ProvenanceResolution => {
  if (candidates.length === 0) return {kind: "unknown"};
  if (candidates.length !== 1) {
    const unique = new Set(candidates.map(provenanceRecordKey));
    if (unique.size !== 1) return {kind: "ambiguous"};
  }
  const candidate = candidates[0];
  if (candidate === undefined) return {kind: "unknown"};
  return {
    kind: "resolved",
    value: typeof candidate === "string" ? {producer: candidate} : candidate,
  };
};

const resolveProvenance = (
  issue: RoutingIssue,
  provenance: ProvenanceIndex | undefined,
): ProvenanceResolution => {
  const issueRecord = issue;
  const localValues: unknown[] = [];
  if (issueRecord.provenance !== undefined) localValues.push(issueRecord.provenance);
  if (issueRecord.affectedArtifact?.producer !== undefined) {
    localValues.push(issueRecord.affectedArtifact.producer);
  }
  if (issueRecord.affectedArtifact?.provenance !== undefined) {
    localValues.push(issueRecord.affectedArtifact.provenance);
  }

  const indexedValues: unknown[] = [];
  if (provenance) {
    const artifactId = issueArtifactId(issue);
    const values = [provenance[issue.id], artifactId ? provenance[artifactId] : undefined];
    indexedValues.push(
      ...values.filter((value): value is NonNullable<typeof value> => value !== undefined),
    );
  }

  const candidates = [...localValues, ...indexedValues].flatMap(
    (value) => provenanceCandidates(value) ?? [],
  );
  return combineProvenance(candidates);
};

const routeTargetValues = new Set<string>([...routeTargetSchema.options]);
const ownerValues = new Set<string>(agentOwners);
const productionTargets = new Set(["captions", "timeline", "tts", "render"]);

const producerRoute = (
  provenance: ArtifactProvenance,
):
  | {ownerAgent: AgentOwner; routeTarget: RouteTarget; restartAt: string}
  | {kind: "unknown"}
  | {kind: "ambiguous"} => {
  const producer = provenance.producer?.trim();
  const explicitOwner = provenance.ownerAgent?.trim();
  const explicitTarget = (provenance.routeTarget ?? provenance.stage)?.trim();
  const explicitRestart = provenance.restartAt?.trim();
  if (!producer && !explicitOwner) return {kind: "unknown"};

  const producerParts = producer?.split(":") ?? [];
  const producerTail = producerParts.at(-1);
  const producerOwner =
    producer && ownerValues.has(producer)
      ? producer
      : producerTail && ownerValues.has(producerTail)
        ? producerTail
        : undefined;
  const producerTarget =
    producer && productionTargets.has(producer)
      ? producer
      : producerTail && productionTargets.has(producerTail)
        ? producerTail
        : undefined;
  const ownerName =
    explicitOwner ?? producerOwner ?? (producerTarget ? "production-executor" : undefined);
  if (!ownerName || !ownerValues.has(ownerName)) return {kind: "unknown"};
  const ownerAgent = ownerName as AgentOwner;

  const targetName = explicitTarget ?? producerTarget ?? ownerAgent;
  if (!targetName || !routeTargetValues.has(targetName)) return {kind: "unknown"};
  const routeTarget = targetName as RouteTarget;
  if (
    ownerAgent === "production-executor" &&
    routeTarget !== "production-executor" &&
    !productionTargets.has(routeTarget)
  ) {
    return {kind: "ambiguous"};
  }
  if (ownerAgent !== "production-executor" && routeTarget !== ownerAgent) {
    return {kind: "ambiguous"};
  }

  const derivedOwner = producerTarget ? "production-executor" : producerOwner;
  if (explicitOwner && derivedOwner && explicitOwner !== derivedOwner) return {kind: "ambiguous"};
  if (explicitTarget && producerTarget && explicitTarget !== producerTarget)
    return {kind: "ambiguous"};

  const restartAt = explicitRestart ?? routeTarget;
  if (!restartAt) return {kind: "unknown"};
  return {ownerAgent, routeTarget, restartAt};
};

const budgetValues = (budget: RoutingBudget | number | undefined): RoutingBudget =>
  typeof budget === "number" ? {remaining: budget} : (budget ?? {});

const hasNonPositive = (values: readonly (number | undefined)[]): boolean =>
  values.some((value) => value !== undefined && value <= 0);

const globalBudgetExhausted = (budget: RoutingBudget): boolean =>
  hasNonPositive([
    budget.remaining,
    budget.remainingRounds,
    budget.revisionBudgetRemaining,
    budget.remainingCostUsd,
    budget.remainingWallclockSeconds,
  ]) ||
  (budget.maxCostUsd !== undefined && (budget.spentCostUsd ?? 0) >= budget.maxCostUsd) ||
  (budget.maxWallclockSeconds !== undefined &&
    (budget.spentWallclockSeconds ?? 0) >= budget.maxWallclockSeconds);

const sumRounds = (roundsUsed: Readonly<Record<string, number>> | undefined): number =>
  Object.values(roundsUsed ?? {}).reduce((total, value) => total + value, 0);

const ownerBudgetExhausted = (budget: RoutingBudget, owner: AgentOwner): boolean => {
  const roundsUsed = budget.roundsUsed ?? {};
  if (
    budget.maxRoundsPerOwner !== undefined &&
    (roundsUsed[owner] ?? 0) >= budget.maxRoundsPerOwner
  ) {
    return true;
  }
  if (owner === "production-executor") {
    return (
      budget.maxRoundsProduction !== undefined &&
      (roundsUsed.production ?? roundsUsed[owner] ?? 0) >= budget.maxRoundsProduction
    );
  }
  return (
    budget.maxRoundsContent !== undefined &&
    (roundsUsed.content ?? sumRounds(roundsUsed)) >= budget.maxRoundsContent
  );
};

const rankOf = (value: string, order: readonly string[]): number => {
  const rank = order.indexOf(value);
  return rank === -1 ? order.length : rank;
};

const escalation = (
  reason: HumanEscalationReason,
  issueIds: readonly string[],
): HumanEscalation => ({
  action: "escalate",
  kind: "human-escalation",
  route: null,
  routeTarget: "human-editor",
  reason,
  reasonCode: reason,
  issueIds: [...issueIds],
});

const activeIssues = (issues: readonly RoutingIssue[]): RoutingIssue[] =>
  sortedIssues(
    issues.filter((issue) => {
      const status = typeof issue.status === "string" ? issue.status : "open";
      const severity = typeof issue.severity === "string" ? issue.severity : "low";
      return isIssueStatus(status) && status === "open" && severity !== "info";
    }),
  );

const normalizeInput = (
  issuesOrInput: readonly RoutingIssue[] | SelectPrimaryRouteInput,
  budgetArg?: RoutingBudget | number,
  configArg?: RoutingConfig,
  provenanceArg?: ProvenanceIndex,
): SelectPrimaryRouteInput => {
  if ("issues" in issuesOrInput) {
    return issuesOrInput;
  }
  return {
    issues: issuesOrInput as readonly RoutingIssue[],
    budget: budgetArg,
    config: configArg,
    provenance: provenanceArg,
  };
};

export function selectPrimaryRoute(input: SelectPrimaryRouteInput): RouteSelection;
export function selectPrimaryRoute(
  issues: readonly RoutingIssue[],
  budget?: RoutingBudget | number,
  config?: RoutingConfig,
  provenance?: ProvenanceIndex,
): RouteSelection;
export function selectPrimaryRoute(
  issuesOrInput: readonly RoutingIssue[] | SelectPrimaryRouteInput,
  budgetArg?: RoutingBudget | number,
  configArg?: RoutingConfig,
  provenanceArg?: ProvenanceIndex,
): RouteSelection {
  const input = normalizeInput(issuesOrInput, budgetArg, configArg, provenanceArg);
  const config = input.config ?? defaultOwnershipConfig;
  validateOwnershipConfig(config);
  const issues = activeIssues(input.issues);
  if (issues.length === 0) return null;

  const budget = budgetValues(input.budget);
  if (globalBudgetExhausted(budget)) {
    return escalation(
      "budget-exhausted",
      issues.map((issue) => issue.id),
    );
  }

  const resolved: ResolvedRoute[] = [];
  for (const issue of issues) {
    const rule = config.categories[issue.category];
    if (!rule)
      return escalation(
        "unknown-category",
        issues.map((item) => item.id),
      );
    if (isProvenanceRule(rule)) {
      const provenance = resolveProvenance(issue, input.provenance);
      if (provenance.kind === "unknown") {
        return escalation(
          "unknown-provenance",
          issues.map((item) => item.id),
        );
      }
      if (provenance.kind === "ambiguous") {
        return escalation(
          "ambiguous-provenance",
          issues.map((item) => item.id),
        );
      }
      const route = producerRoute(provenance.value);
      if ("kind" in route) {
        return escalation(
          route.kind === "ambiguous" ? "ambiguous-provenance" : "unknown-provenance",
          issues.map((item) => item.id),
        );
      }
      resolved.push({...route, issue, operational: true});
      continue;
    }
    if (!isStaticRule(rule)) {
      return escalation(
        "unknown-category",
        issues.map((item) => item.id),
      );
    }
    resolved.push({
      ownerAgent: rule.owner,
      routeTarget: rule.routeTarget,
      restartAt: rule.restartAt,
      issue,
      operational: false,
    });
  }

  const contractRoutes = resolved.filter((route) => route.operational);
  const candidates = contractRoutes.length > 0 ? contractRoutes : resolved;
  const sortedCandidates = [...candidates].sort(
    (left, right) =>
      rankOf(left.restartAt, left.operational ? config.contractOrder : config.restartOrder) -
        rankOf(right.restartAt, right.operational ? config.contractOrder : config.restartOrder) ||
      compareIssues(left.issue, right.issue),
  );
  const selected = sortedCandidates[0];
  if (!selected) return null;
  if (ownerBudgetExhausted(budget, selected.ownerAgent)) {
    return escalation(
      "budget-exhausted",
      issues.map((issue) => issue.id),
    );
  }

  const batch = sortedCandidates
    .filter(
      (route) => route.ownerAgent === selected.ownerAgent && route.restartAt === selected.restartAt,
    )
    .sort((left, right) => compareIssues(left.issue, right.issue));
  const reasonIssue = batch[0];
  if (!reasonIssue) return null;
  return {
    ownerAgent: selected.ownerAgent,
    routeTarget: selected.routeTarget,
    restartAt: selected.restartAt,
    reasonCode: reasonIssue.issue.category as IssueCategory,
    issueIds: batch.map((route) => route.issue.id),
  };
}
