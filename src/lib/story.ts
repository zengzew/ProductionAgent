import {z} from "zod";

const narrationModeSchema = z.enum([
  "company",
  "founder",
  "independently-verified",
  "editorial-analysis",
  "demonstration",
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const routedRoleSchema = z.enum([
  "research-analyst",
  "story-director",
  "viral-director",
  "script-writer",
  "oral-rewriter",
  "visual-director",
]);

const viewerExitRiskSchema = z.object({
  id: z.string().regex(/^feedback-[a-z0-9-]+$/u),
  timeRange: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "blocker"]),
  whyViewerStops: z.string().min(1),
  evidence: z.string().min(1),
  requestedChange: z.string().min(1),
  returnTo: routedRoleSchema,
});

export const directorBriefGateSchema = z.object({
  rubricVersion: z.literal("director-brief-v1"),
  reviewedFiles: z.object({
    factsSha256: sha256Schema,
    sourcesSha256: sha256Schema,
    timelineSha256: sha256Schema,
  }),
  coreStoryQuestion: z.string().min(1),
  audiencePromise: z.string().min(1),
  sourcedAnswer: z.string().min(1),
  factBoundary: z.string().min(1),
  emotionalArc: z
    .array(
      z.object({
        beatId: z.string().regex(/^beat-[0-9]{2}$/u),
        viewerState: z.string().min(1),
        storyMove: z.string().min(1),
        targetRange: z.string().min(1),
        claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).min(1),
      }),
    )
    .min(3),
  revealOrder: z
    .array(
      z.object({
        order: z.number().int().positive(),
        reveal: z.string().min(1),
        withheldAnswer: z.string().min(1),
        purpose: z.string().min(1),
      }),
    )
    .min(3),
  blockers: z.array(z.string()),
  verdict: z.enum(["READY", "REVISE"]),
  returnTo: z.enum(["none", "research-analyst", "story-director"]),
});

export const viralStrategyGateSchema = z.object({
  rubricVersion: z.literal("viral-strategy-v2"),
  reviewedFiles: z.object({
    storyBibleSha256: sha256Schema,
    storyAngleSha256: sha256Schema,
    threeActStructureSha256: sha256Schema,
    hookCandidatesSha256: sha256Schema,
    directorBriefSha256: sha256Schema,
  }),
  selectedHookHeading: z.string().min(1),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).min(1),
  scores: z.object({
    openingHook: z.number().min(0).max(5),
    curiosityGap: z.number().min(0).max(5),
    emotionalTension: z.number().min(0).max(5),
    informationRevealOrder: z.number().min(0).max(5),
    endingPayoff: z.number().min(0).max(5),
  }),
  total: z.number().min(0).max(25),
  threshold: z.literal(20),
  blockers: z.array(z.string()),
  verdict: z.enum(["READY", "REVISE"]),
  returnTo: z.enum(["none", "research-analyst", "story-director", "viral-director"]),
});

export const visualPlanGateSchema = z.object({
  rubricVersion: z.literal("visual-plan-v2"),
  reviewedFile: z.literal("story/final-script.md"),
  reviewedSha256: sha256Schema,
  plannedSegments: z.number().int().positive(),
  unresolvedAssets: z.array(z.string()),
  verdict: z.enum(["READY", "REVISE"]),
  returnTo: z.enum([
    "none",
    "research-analyst",
    "story-director",
    "script-writer",
    "visual-director",
  ]),
});

const retentionWindowSchema = z.object({
  dropOffRisk: z.enum(["low", "medium", "high"]),
  prediction: z.string().min(1),
});

const resolvedFeedbackSchema = z.object({
  feedbackId: z.string().regex(/^feedback-[a-z0-9-]+$/u),
  owner: routedRoleSchema,
  change: z.string().min(1),
  artifacts: z
    .array(
      z.object({
        beforeFile: z.string().min(1),
        beforeSha256: sha256Schema,
        afterFile: z.string().min(1),
        afterSha256: sha256Schema,
      }),
    )
    .min(1),
});

export const retentionGateSchema = z.object({
  rubricVersion: z.literal("retention-critic-v2"),
  reviewedFile: z.literal("story/final-script.md"),
  reviewedSha256: sha256Schema,
  visualPlanFile: z.literal("story/visual-plan.md"),
  visualPlanSha256: sha256Schema,
  round: z.number().int().positive(),
  scores: z.object({
    first3Seconds: z.number().min(0).max(25),
    first30Seconds: z.number().min(0).max(25),
    midVideoEngagement: z.number().min(0).max(25),
    endingSatisfaction: z.number().min(0).max(25),
  }),
  windows: z.object({
    first3Seconds: retentionWindowSchema,
    first30Seconds: retentionWindowSchema,
    midVideo: retentionWindowSchema,
    ending: retentionWindowSchema,
  }),
  total: z.number().min(0).max(100),
  threshold: z.literal(80),
  viewerExitRisks: z.array(viewerExitRiskSchema),
  previousReview: z
    .object({
      reportFile: z.string().min(1),
      reportSha256: sha256Schema,
    })
    .optional(),
  resolvedFeedback: z.array(resolvedFeedbackSchema),
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  returnTo: z.enum([
    "none",
    "viral-director",
    "story-director",
    "script-writer",
    "oral-rewriter",
    "visual-director",
  ]),
});

export const criticGateSchema = z.object({
  rubricVersion: z.literal("product-story-v4"),
  reviewedFile: z.literal("story/final-script.md"),
  reviewedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  round: z.number().int().positive(),
  scores: z.object({
    hook: z.number().min(0).max(15),
    conflict: z.number().min(0).max(15),
    humanElement: z.number().min(0).max(10),
    productClarity: z.number().min(0).max(15),
    growthLogic: z.number().min(0).max(15),
    technologyExplanation: z.number().min(0).max(15),
    naturalChinese: z.number().min(0).max(15),
  }),
  hookBreakdown: z.object({
    zeroBackgroundComprehension: z.number().min(0).max(8),
    continuationQuestion: z.number().min(0).max(7),
  }),
  total: z.number().min(0).max(100),
  threshold: z.literal(85),
  viewerExitRisks: z.array(viewerExitRiskSchema),
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  rewriteRequired: z.boolean(),
  returnTo: z.enum(["none", "story-director", "script-writer", "oral-rewriter"]),
});

export const oralReviewV1GateSchema = z.object({
  rubricVersion: z.literal("oral-review-v1"),
  reviewedFile: z.literal("story/final-script.md"),
  reviewedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceDraftFile: z.literal("story/script-draft.md"),
  sourceDraftSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  round: z.number().int().min(1).max(3),
  scores: z.object({
    chineseNaturalness: z.number().min(0).max(5),
    spokenDelivery: z.number().min(0).max(5),
    informationFidelity: z.number().min(0).max(5),
  }),
  minimumScore: z.literal(4),
  styleSamples: z.array(z.string()),
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  returnTo: z.enum(["none", "oral-rewriter", "script-writer", "human-editor"]),
});

const oralReviewEvidenceSchema = z.object({
  locator: z.string().min(1),
  observation: z.string().min(1),
});

const oralReviewCheckSchema = z.object({
  result: z.enum(["PASS", "FAIL"]),
  evidence: z.array(oralReviewEvidenceSchema).min(1),
});

export const oralReviewV2GateSchema = z.object({
  rubricVersion: z.literal("oral-review-v2"),
  promptVersion: z.literal("oral-judge-v2"),
  reviewedFile: z.literal("story/final-script.md"),
  reviewedSha256: sha256Schema,
  sourceDraftFile: z.literal("story/script-draft.md"),
  sourceDraftSha256: sha256Schema,
  round: z.number().int().min(1).max(3),
  scores: z.object({
    chineseNaturalness: z.number().min(0).max(5),
    spokenDelivery: z.number().min(0).max(5),
    informationFidelity: z.number().min(0).max(5),
  }),
  minimumScore: z.literal(4),
  checks: z.object({
    translatedSyntax: oralReviewCheckSchema,
    sourceAttributionLanguage: oralReviewCheckSchema,
    productStageLanguage: oralReviewCheckSchema,
    turnDirection: oralReviewCheckSchema,
    sentenceCadence: oralReviewCheckSchema,
    spokenBreath: oralReviewCheckSchema,
    informationFidelity: oralReviewCheckSchema,
  }),
  styleSamples: z.array(z.string()),
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  returnTo: z.enum(["none", "oral-rewriter", "script-writer", "human-editor"]),
});

export const oralReviewGateSchema = z.discriminatedUnion("rubricVersion", [
  oralReviewV1GateSchema,
  oralReviewV2GateSchema,
]);

type OralReviewGate = z.infer<typeof oralReviewGateSchema>;

export const findOralReviewDecisionErrors = (oralReview: OralReviewGate): string[] => {
  const decisionErrors: string[] = [];
  const scoresPass = Object.values(oralReview.scores).every(
    (score) => score >= oralReview.minimumScore,
  );
  const failedChecks =
    oralReview.rubricVersion === "oral-review-v2"
      ? Object.entries(oralReview.checks)
          .filter(([, check]) => check.result === "FAIL")
          .map(([check]) => check)
      : [];
  const checksPass = failedChecks.length === 0;
  const shouldPass =
    scoresPass && checksPass && oralReview.blockers.length === 0 && oralReview.returnTo === "none";

  if ((oralReview.verdict === "PASS") !== shouldPass) {
    decisionErrors.push("Oral Judge verdict 与分数、checks、blockers 或 returnTo 不一致");
  }
  if (oralReview.rubricVersion === "oral-review-v2") {
    if (!scoresPass && checksPass) {
      decisionErrors.push("Oral Judge v2 低于门槛的分数必须对应至少一项失败检查");
    }
    if (failedChecks.length > 0 && oralReview.blockers.length === 0) {
      decisionErrors.push(`Oral Judge v2 失败检查缺少 blocker：${failedChecks.join("、")}`);
    }
  }
  if (oralReview.verdict === "REJECT" && oralReview.returnTo === "none") {
    decisionErrors.push("Oral Judge REJECT 必须声明返工角色");
  }
  if (
    oralReview.round === 3 &&
    oralReview.verdict === "REJECT" &&
    oralReview.returnTo !== "human-editor"
  ) {
    decisionErrors.push("Oral Judge 第三轮 REJECT 必须交给 human-editor");
  }

  return decisionErrors;
};

export const factCheckGateSchema = z.object({
  rubricVersion: z.literal("fact-guardian-v1"),
  reviewedFile: z.literal("story/final-script.md"),
  reviewedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  checkedSegments: z.number().int().positive(),
  checkedNarrationUnits: z.number().int().positive(),
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  returnTo: z.enum([
    "none",
    "research-analyst",
    "story-director",
    "script-writer",
    "oral-rewriter",
  ]),
});

export type NarrationUnit = {
  text: string;
  mode: z.infer<typeof narrationModeSchema>;
  claimIds: string[];
  attribution: string;
};

export type FinalScriptSegment = {
  id: string;
  section: string;
  timeRange: string;
  targetSeconds: number;
  claimIds: string[];
  sourceIdentity: string;
  onScreenText: string;
  scene: string;
  visualIntent: string;
  paceSwitch: string;
  factBoundary: string;
  narration: string;
  narrationUnits: NarrationUnit[];
};

const readField = (block: string, label: string): string => {
  const match = block.match(new RegExp(`^- ${label}: (.+)$`, "mu"));
  if (!match?.[1]) throw new Error(`final-script segment missing field: ${label}`);
  return match[1].trim().replace(/^`|`$/gu, "");
};

const parseClaimIds = (value: string): string[] =>
  [...value.matchAll(/`(claim-[^`]+)`/gu)].map((match) => match[1] as string);

const parseNarrationUnits = (block: string): NarrationUnit[] => {
  const table = block.match(/### Narration units\n\n([\s\S]+)$/u)?.[1];
  if (!table) throw new Error("final-script segment missing Narration units table");

  return table
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|[\s-]+\|/u.test(line))
    .slice(1)
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length !== 4) throw new Error(`invalid Narration units row: ${line}`);
      const [text, modeRaw, claimIdsRaw, attribution] = cells as [string, string, string, string];
      return {
        text,
        mode: narrationModeSchema.parse(modeRaw),
        claimIds: claimIdsRaw
          .split(",")
          .map((claimId) => claimId.trim())
          .filter(Boolean),
        attribution,
      };
    });
};

export const parseFinalScript = (markdown: string): FinalScriptSegment[] => {
  const blocks = markdown.split(/(?=^## seg-[a-z0-9-]+\s*$)/gmu).slice(1);
  if (blocks.length === 0) throw new Error("final-script contains no segment blocks");

  return blocks.map((block) => {
    const id = block.match(/^## (seg-[a-z0-9-]+)\s*$/mu)?.[1];
    const narration = block
      .match(/### Narration\n\n([\s\S]*?)\n\n### Narration units/u)?.[1]
      ?.trim();
    if (!id || !narration) throw new Error("final-script segment is missing id or narration");

    const targetSecondsRaw = readField(block, "Target seconds").replaceAll("`", "");
    const targetSeconds = Number(targetSecondsRaw);
    if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
      throw new Error(`${id} has invalid Target seconds`);
    }

    return {
      id,
      section: readField(block, "Section"),
      timeRange: readField(block, "Time range"),
      targetSeconds,
      claimIds: parseClaimIds(block.match(/^- Claim IDs: (.+)$/mu)?.[1] ?? ""),
      sourceIdentity: readField(block, "Source identity"),
      onScreenText: readField(block, "On-screen text"),
      scene: readField(block, "Scene"),
      visualIntent: readField(block, "Visual intent"),
      paceSwitch: readField(block, "Pace switch"),
      factBoundary: readField(block, "Fact boundary"),
      narration,
      narrationUnits: parseNarrationUnits(block),
    };
  });
};

export const parseCriticGate = (markdown: string): z.infer<typeof criticGateSchema> => {
  const raw = markdown.match(/<!-- critic-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("critic-report.md is missing critic-gate metadata");
  return criticGateSchema.parse(JSON.parse(raw));
};

export const parseOralReviewGate = (markdown: string): z.infer<typeof oralReviewGateSchema> => {
  const raw = markdown.match(/<!-- oral-review-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("oral-review.md is missing oral-review-gate metadata");
  return oralReviewGateSchema.parse(JSON.parse(raw));
};

export const parseFactCheckGate = (markdown: string): z.infer<typeof factCheckGateSchema> => {
  const raw = markdown.match(/<!-- fact-check-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("fact-check-report.md is missing fact-check-gate metadata");
  return factCheckGateSchema.parse(JSON.parse(raw));
};

export const parseDirectorBriefGate = (
  markdown: string,
): z.infer<typeof directorBriefGateSchema> => {
  const raw = markdown.match(/<!-- director-brief-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("director-brief.md is missing director-brief-gate metadata");
  return directorBriefGateSchema.parse(JSON.parse(raw));
};

export const parseViralStrategyGate = (
  markdown: string,
): z.infer<typeof viralStrategyGateSchema> => {
  const raw = markdown.match(/<!-- viral-strategy-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("viral-strategy.md is missing viral-strategy-gate metadata");
  return viralStrategyGateSchema.parse(JSON.parse(raw));
};

export const parseVisualPlanGate = (markdown: string): z.infer<typeof visualPlanGateSchema> => {
  const raw = markdown.match(/<!-- visual-plan-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("visual-plan.md is missing visual-plan-gate metadata");
  return visualPlanGateSchema.parse(JSON.parse(raw));
};

export const parseRetentionGate = (markdown: string): z.infer<typeof retentionGateSchema> => {
  const raw = markdown.match(/<!-- retention-gate\n([\s\S]*?)\n-->/u)?.[1];
  if (!raw) throw new Error("retention-report.md is missing retention-gate metadata");
  return retentionGateSchema.parse(JSON.parse(raw));
};
