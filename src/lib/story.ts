import {z} from "zod";

const narrationModeSchema = z.enum([
  "company",
  "founder",
  "independently-verified",
  "editorial-analysis",
  "demonstration",
]);

export const criticGateSchema = z.object({
  rubricVersion: z.literal("product-story-v3"),
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
  blockers: z.array(z.string()),
  verdict: z.enum(["PASS", "REJECT"]),
  rewriteRequired: z.boolean(),
});

export const oralReviewGateSchema = z.object({
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
  const blocks = markdown.split(/(?=^## seg-\d+\s*$)/gmu).slice(1);
  if (blocks.length === 0) throw new Error("final-script contains no segment blocks");

  return blocks.map((block) => {
    const id = block.match(/^## (seg-\d+)\s*$/mu)?.[1];
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
