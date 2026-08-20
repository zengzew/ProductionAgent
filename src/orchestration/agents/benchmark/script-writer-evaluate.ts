import {factSchema} from "../../../schemas/episode";
import type {BenchmarkDownstreamCritic} from "../../schemas/role-model-benchmark";

export type ScriptDraftSegment = {
  id: string;
  section: string;
  targetSeconds: number | null;
  claimIds: string[];
  sourceIdentity: string;
  visualIntent: string;
  factBoundary: string;
  narration: string;
};

export type ScriptWriterEvaluation = {
  schemaValid: boolean;
  hardFailures: string[];
  claimIds: string[];
  unsupportedClaimIds: string[];
  claimCoverage: number;
  outputLength: number;
};

const parseClaimIds = (value: string): string[] =>
  [...value.matchAll(/`?(claim-[a-z0-9-]+)`?/gu)].map((match) => match[1] as string);

/** Markers the Script Writer prompt must declare. The parser does not infer aliases. */
export const SCRIPT_DRAFT_REQUIRED_MARKERS = [
  "## seg-",
  "- Section:",
  "- Target seconds:",
  "- Claim IDs:",
  "- Source identity:",
  "- Visual intent:",
  "- Fact boundary:",
  "### Narration",
] as const;

const readField = (block: string, label: string): string => {
  const prefix = `- ${label}: `;
  for (const line of block.split("\n")) {
    if (!line.startsWith(prefix)) continue;
    return line.slice(prefix.length).trim().replace(/^`/u, "").replace(/`$/u, "");
  }
  return "";
};

export const hasDraftReadyStatus = (markdown: string): boolean =>
  /^状态：\s*`?draft-ready`?\s*$/mu.test(markdown);

/** Fail-closed: only `## seg-<id>` headings on their own line are segments. */
export const parseScriptDraftSegments = (markdown: string): ScriptDraftSegment[] => {
  const blocks = markdown.split(/(?=^## seg-[a-z0-9-]+\s*$)/gmu).slice(1);
  return blocks.map((block) => {
    const id = block.match(/^## (seg-[a-z0-9-]+)\s*$/mu)?.[1] ?? "seg-unknown";
    const targetRaw = readField(block, "Target seconds");
    const targetSeconds = targetRaw ? Number(targetRaw) : null;
    const claimLine = block.match(/^- Claim IDs: (.+)$/mu)?.[1] ?? "";
    const narration =
      block.match(/### Narration\n\n([\s\S]*?)(?=\n## |\n### |$)/u)?.[1]?.trim() ?? "";
    return {
      id,
      section: readField(block, "Section"),
      targetSeconds:
        targetSeconds !== null && Number.isFinite(targetSeconds) ? targetSeconds : null,
      claimIds: parseClaimIds(claimLine),
      sourceIdentity: readField(block, "Source identity"),
      visualIntent: readField(block, "Visual intent"),
      factBoundary: readField(block, "Fact boundary"),
      narration,
    };
  });
};

const loadFacts = (
  factsJson: string,
): Map<string, {allowedInNarration: boolean; confidence: string}> => {
  const parsed = JSON.parse(factsJson) as unknown;
  if (!Array.isArray(parsed)) throw new Error("facts.json must be an array");
  return new Map(
    parsed.map((item) => {
      const fact = factSchema.parse(item);
      return [fact.id, {allowedInNarration: fact.allowedInNarration, confidence: fact.confidence}];
    }),
  );
};

export const evaluateScriptWriterDraft = (input: {
  markdown: string;
  factsJson: string;
  ledgerClaimIds?: readonly string[];
}): ScriptWriterEvaluation => {
  const outputLength = Buffer.byteLength(input.markdown, "utf8");
  let segments: ScriptDraftSegment[];
  try {
    segments = parseScriptDraftSegments(input.markdown);
  } catch {
    return {
      schemaValid: false,
      hardFailures: ["script-draft-unparseable"],
      claimIds: [],
      unsupportedClaimIds: [],
      claimCoverage: 0,
      outputLength,
    };
  }
  if (segments.length === 0) {
    return {
      schemaValid: false,
      hardFailures: ["script-draft-missing-segments"],
      claimIds: [],
      unsupportedClaimIds: [],
      claimCoverage: 0,
      outputLength,
    };
  }

  const hardFailures: string[] = [];
  if (!hasDraftReadyStatus(input.markdown)) {
    hardFailures.push("script-draft-not-draft-ready");
  }
  const claimIds = [...new Set(segments.flatMap((segment) => segment.claimIds))].sort();
  let facts: Map<string, {allowedInNarration: boolean; confidence: string}>;
  try {
    facts = loadFacts(input.factsJson);
  } catch {
    return {
      schemaValid: true,
      hardFailures: ["facts-unparseable"],
      claimIds,
      unsupportedClaimIds: claimIds,
      claimCoverage: 0,
      outputLength,
    };
  }

  for (const segment of segments) {
    if (!segment.section) hardFailures.push(`${segment.id}:missing-section`);
    if (segment.claimIds.length === 0) hardFailures.push(`${segment.id}:missing-claim-ids`);
    if (!segment.sourceIdentity) hardFailures.push(`${segment.id}:missing-source-identity`);
    if (!segment.visualIntent) hardFailures.push(`${segment.id}:missing-visual-intent`);
    if (!segment.factBoundary) hardFailures.push(`${segment.id}:missing-fact-boundary`);
    if (!segment.narration) hardFailures.push(`${segment.id}:missing-narration`);
    if (segment.targetSeconds === null || segment.targetSeconds <= 0) {
      hardFailures.push(`${segment.id}:invalid-target-seconds`);
    }
  }

  const unsupportedClaimIds = claimIds.filter((claimId) => {
    const fact = facts.get(claimId);
    return !fact || !fact.allowedInNarration || fact.confidence === "low";
  });
  for (const claimId of unsupportedClaimIds) {
    hardFailures.push(`unsupported-claim:${claimId}`);
  }

  const ledgerClaimIds = [
    ...(input.ledgerClaimIds ??
      [...facts.entries()]
        .filter(([, fact]) => fact.allowedInNarration && fact.confidence !== "low")
        .map(([id]) => id)),
  ].sort();
  const covered = claimIds.filter((claimId) => ledgerClaimIds.includes(claimId)).length;
  const claimCoverage = ledgerClaimIds.length === 0 ? 1 : covered / ledgerClaimIds.length;

  return {
    schemaValid: true,
    hardFailures: [...new Set(hardFailures)].sort(),
    claimIds,
    unsupportedClaimIds,
    claimCoverage,
    outputLength,
  };
};

export const skippedDownstreamCritic = (
  detail = "downstream critic was not run for this benchmark",
): BenchmarkDownstreamCritic => ({
  status: "not-evaluated",
  score: null,
  verdict: null,
  blockerCount: 0,
  detail,
});
