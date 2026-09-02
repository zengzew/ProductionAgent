import {z} from "zod";

const evidenceKeys = [
  "protagonist",
  "userNeed",
  "productMechanism",
  "founderDecision",
  "buildFriction",
  "distribution",
  "marketEvent",
  "userBehavior",
  "measurableOutcome",
  "turningPoint",
] as const;

const evidenceKeySchema = z.enum(evidenceKeys);
const supportStatusSchema = z.enum(["supported", "partial", "missing", "not-applicable"]);

const criterionSchema = z.object({
  status: supportStatusSchema,
  sourceIds: z.array(z.string().min(1)),
  notes: z.string().min(1),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url(),
  sourceType: z.enum([
    "founder-interview",
    "founder-post",
    "official",
    "platform",
    "media",
    "social",
    "user",
    "research",
  ]),
  roles: z.array(z.enum(["spine", "verification", "visual"])).min(1),
  firstPerson: z.boolean(),
  transcriptAvailable: z.boolean(),
  supports: z.array(evidenceKeySchema),
  mediaTypes: z.array(
    z.enum([
      "founder-footage",
      "interview-video",
      "product-demo",
      "launch-evidence",
      "result-evidence",
      "user-footage",
      "event-footage",
    ]),
  ),
  discoverable: z.boolean(),
  rightsStatus: z.enum([
    "not-applicable",
    "cleared",
    "evaluation-only",
    "review-required",
    "blocked",
  ]),
  rightsBoundary: z.string().min(1),
});

export const storySourcePreflightSchema = z.object({
  schemaVersion: z.literal("story-source-preflight-v2"),
  candidateId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  product: z.string().min(1),
  asOf: z.iso.date(),
  sourceStrategy: z.enum(["single-spine", "multi-source", "primary-led", "event-led", "user-led"]),
  storyProfiles: z
    .array(
      z.enum([
        "founder-journey",
        "product-mechanism",
        "cold-start-distribution",
        "business-turning-point",
        "market-event",
        "user-behavior",
      ]),
    )
    .min(1),
  universalCriteria: z.object({
    productOrEventClarity: criterionSchema,
    audienceQuestion: criterionSchema.extend({text: z.string().min(1)}),
    storyMotion: criterionSchema,
    factTraceability: criterionSchema,
    realVisualFeasibility: criterionSchema,
    rightsBoundaryRecorded: z.boolean(),
  }),
  sources: z.array(sourceSchema).min(1),
  storyEvidence: z.object({
    protagonist: criterionSchema,
    userNeed: criterionSchema,
    productMechanism: criterionSchema,
    founderDecision: criterionSchema,
    buildFriction: criterionSchema,
    distribution: criterionSchema,
    marketEvent: criterionSchema,
    userBehavior: criterionSchema,
    measurableOutcome: criterionSchema,
    turningPoint: criterionSchema,
  }),
  keyClaims: z.array(
    z.object({
      claim: z.string().min(1),
      sourceIds: z.array(z.string().min(1)).min(1),
      reportingType: z.enum([
        "independently-verified",
        "company-reported",
        "founder-reported",
        "user-reported",
      ]),
      attributionRequired: z.boolean(),
    }),
  ),
  blockers: z.array(z.string().min(1)),
  notes: z.string(),
});

export type StorySourcePreflight = z.infer<typeof storySourcePreflightSchema>;

export type StorySourcePreflightAssessment = {
  scores: {
    universalReadiness: number;
    storyEvidenceBreadth: number;
    sourceCoherence: number;
    claimTraceability: number;
    visualFeasibility: number;
    rightsReadiness: number;
    total: number;
  };
  decision: "ready" | "research-more" | "reject";
  reasons: string[];
};

type StoryEvidenceKey = keyof StorySourcePreflight["storyEvidence"];

const profileRequirements: Record<
  StorySourcePreflight["storyProfiles"][number],
  StoryEvidenceKey[]
> = {
  "founder-journey": ["protagonist", "founderDecision"],
  "product-mechanism": ["productMechanism"],
  "cold-start-distribution": ["distribution"],
  "business-turning-point": ["turningPoint"],
  "market-event": ["marketEvent"],
  "user-behavior": ["userBehavior"],
};

const referencedSourceIds = (input: StorySourcePreflight): string[] => {
  const universal = input.universalCriteria;
  return [
    ...universal.productOrEventClarity.sourceIds,
    ...universal.audienceQuestion.sourceIds,
    ...universal.storyMotion.sourceIds,
    ...universal.factTraceability.sourceIds,
    ...universal.realVisualFeasibility.sourceIds,
    ...Object.values(input.storyEvidence).flatMap((criterion) => criterion.sourceIds),
    ...input.keyClaims.flatMap((claim) => claim.sourceIds),
  ];
};

const strategyScore = (input: StorySourcePreflight): number => {
  const spineSources = input.sources.filter((source) => source.roles.includes("spine"));
  const supportUnion = new Set(spineSources.flatMap((source) => source.supports));
  const hasPrimary = spineSources.some((source) => source.sourceType === "official");
  const hasEventSource = spineSources.some(
    (source) =>
      ["official", "platform", "media"].includes(source.sourceType) &&
      source.supports.some((key) => key === "marketEvent" || key === "turningPoint"),
  );
  const hasUserSource = spineSources.some(
    (source) =>
      ["user", "social"].includes(source.sourceType) && source.supports.includes("userBehavior"),
  );

  const satisfied =
    input.sourceStrategy === "single-spine"
      ? spineSources.some((source) => source.supports.length >= 3)
      : input.sourceStrategy === "multi-source"
        ? spineSources.length >= 2 && supportUnion.size >= 3
        : input.sourceStrategy === "primary-led"
          ? hasPrimary && supportUnion.size >= 2
          : input.sourceStrategy === "event-led"
            ? hasEventSource
            : hasUserSource;
  if (satisfied) return 4;
  if (spineSources.length > 0 && supportUnion.size >= 2) return 2;
  return spineSources.length > 0 ? 1 : 0;
};

export const assessStorySourcePreflight = (
  input: StorySourcePreflight,
): StorySourcePreflightAssessment => {
  const reasons: string[] = [];
  const sourceIds = input.sources.map((source) => source.id);
  const declaredSourceIds = new Set(sourceIds);
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  if (declaredSourceIds.size !== sourceIds.length) reasons.push("source id 必须全局唯一");

  const missingReferences = referencedSourceIds(input).filter(
    (sourceId) => !declaredSourceIds.has(sourceId),
  );
  if (missingReferences.length > 0) {
    reasons.push(`存在未声明的 source id：${[...new Set(missingReferences)].join(", ")}`);
  }

  const criteria = [
    ["产品或事件没有解释清楚", input.universalCriteria.productOrEventClarity],
    ["没有形成零背景观众能理解的问题", input.universalCriteria.audienceQuestion],
    ["没有可验证的行动、变化或冲突来推动故事", input.universalCriteria.storyMotion],
    ["核心事实不可追溯", input.universalCriteria.factTraceability],
    ["没有可行的真实画面来源", input.universalCriteria.realVisualFeasibility],
  ] as const;
  const supportedUniversal = criteria.filter(([, criterion]) => criterion.status === "supported");
  for (const [message, criterion] of criteria) {
    if (criterion.status !== "supported") reasons.push(message);
    if (criterion.status !== "not-applicable" && criterion.sourceIds.length === 0) {
      reasons.push(`${message}：缺少 sourceIds`);
    }
  }
  if (!input.universalCriteria.rightsBoundaryRecorded) reasons.push("尚未记录素材权利边界");

  for (const [key, criterion] of Object.entries(input.storyEvidence) as Array<
    [StoryEvidenceKey, StorySourcePreflight["storyEvidence"][StoryEvidenceKey]]
  >) {
    if (
      criterion.status !== "not-applicable" &&
      !criterion.sourceIds.some((sourceId) => sourceById.get(sourceId)?.supports.includes(key))
    ) {
      reasons.push(`${key} 没有引用声明支持该证据的来源`);
    }
  }

  for (const profile of input.storyProfiles) {
    const missing = profileRequirements[profile].filter(
      (key) => input.storyEvidence[key].status !== "supported",
    );
    if (missing.length > 0) reasons.push(`${profile} 缺少 profile 证据：${missing.join(", ")}`);
  }

  const sourceCoherence = strategyScore(input);
  if (sourceCoherence < 4) reasons.push(`${input.sourceStrategy} 来源策略尚未成立`);

  const visualSources = input.sources.filter(
    (source) =>
      source.roles.includes("visual") &&
      source.discoverable &&
      source.mediaTypes.length > 0 &&
      source.rightsStatus !== "blocked",
  );
  if (
    input.sources.some(
      (source) => source.roles.includes("visual") && source.rightsStatus === "not-applicable",
    )
  ) {
    reasons.push("visual source 不能把 rightsStatus 标成 not-applicable");
  }
  const declaredVisualIds = new Set(visualSources.map((source) => source.id));
  if (
    input.universalCriteria.realVisualFeasibility.status === "supported" &&
    !input.universalCriteria.realVisualFeasibility.sourceIds.some((id) => declaredVisualIds.has(id))
  ) {
    reasons.push("真实画面判断没有引用可发现且未阻断的 visual source");
  }

  const supportedEvidence = Object.values(input.storyEvidence).filter(
    (criterion) => criterion.status === "supported",
  ).length;
  const storyEvidenceBreadth = Math.min(5, supportedEvidence);
  const claimTraceability =
    input.keyClaims.length === 0
      ? 2
      : input.keyClaims.every((claim) =>
            claim.reportingType === "independently-verified"
              ? !claim.attributionRequired
              : claim.attributionRequired,
          )
        ? 3
        : 1;
  if (claimTraceability === 1) reasons.push("关键 Claim 的报告类型与归因要求不一致");

  const visualTypes = new Set(visualSources.flatMap((source) => source.mediaTypes));
  const visualFeasibility = Math.min(3, visualTypes.size);
  const rightsReadiness =
    visualSources.length === 0
      ? 0
      : visualSources.every((source) => source.rightsStatus === "cleared")
        ? 3
        : visualSources.every((source) =>
              ["cleared", "evaluation-only"].includes(source.rightsStatus),
            )
          ? 2
          : 1;
  const universalReadiness = supportedUniversal.length;
  const total =
    universalReadiness +
    storyEvidenceBreadth +
    sourceCoherence +
    claimTraceability +
    visualFeasibility +
    rightsReadiness;

  if (input.blockers.length > 0) reasons.push(...input.blockers);
  const reject = input.blockers.length > 0 || rightsReadiness === 0 || universalReadiness <= 1;
  const decision = reject
    ? "reject"
    : reasons.length === 0 && total >= 13
      ? "ready"
      : "research-more";

  return {
    scores: {
      universalReadiness,
      storyEvidenceBreadth,
      sourceCoherence,
      claimTraceability,
      visualFeasibility,
      rightsReadiness,
      total,
    },
    decision,
    reasons,
  };
};
