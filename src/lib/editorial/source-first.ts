import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {episodeConfigSchema, factSchema} from "../../schemas/episode";
import {REFERENCE_HOOK_MAX_SECONDS} from "../../schemas/reference-story";
import {
  assertEpisodeMatchesProductionContract,
  assertScriptTargetSecondsMatchContract,
  productionContract,
} from "../episode/production-contract";
import {parseFactCheckGate, parseFinalScript, parseVisualPlanGate} from "./story";
import {parseVisualPlanSections, parseVisualPlanV3Sections} from "./story-quality";

/**
 * Shared story contract for the reference-driven manual workflow and the
 * earlier Source-First trial. Existing legacy episodes and the separate
 * LangGraph content path retain their own workflow version.
 */
export const SOURCE_FIRST_WORKFLOW_SCHEMA_VERSION = "source-first-workflow-v1" as const;

export const sourceFirstCreativeRoles = [
  "spine-extractor",
  "narrative-adapter",
  "script-editor",
] as const;

export const sourceFirstSupportingRoles = [
  "research-analyst",
  "fact-guardian",
  "visual-director",
  "delivery-critic",
] as const;

export const sourceFirstWorkflowRoles = [
  ...sourceFirstCreativeRoles,
  ...sourceFirstSupportingRoles,
] as const;

export const sourceFirstRoleSchema = z.enum(sourceFirstWorkflowRoles);
export const sourceFirstCreativeRoleSchema = z.enum(sourceFirstCreativeRoles);

export const SOURCE_FIRST_STORY_FILES = [
  "story/story-spine.md",
  "story/script-draft.md",
  "story/final-script.md",
  "story/critic-report.md",
  "story/fact-check-report.md",
  "story/visual-plan.md",
] as const;

const sourceFirstWorkflowStageSchema = z.object({
  id: sourceFirstRoleSchema,
  owner: sourceFirstRoleSchema,
  status: z.enum(["complete", "pending", "rejected"]),
  artifacts: z.array(z.string().min(1)),
  decision: z.string().min(1),
});

const sourceFirstWorkflowDecisionSchema = z.object({
  id: z.string().regex(/^decision-[a-z0-9-]+$/u),
  owner: sourceFirstRoleSchema,
  decision: z.string().min(1),
  rationale: z.string().min(1),
  artifact: z.string().min(1),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)),
});

/**
 * A small content control document, carried by the existing workflow.json
 * boundary. Supporting roles are optional while a hand-run story trial is
 * in-progress; approved statuses still require the existing review owners.
 */
export const sourceFirstWorkflowSchema = z
  .object({
    schemaVersion: z.literal(SOURCE_FIRST_WORKFLOW_SCHEMA_VERSION),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    coreStoryQuestion: z.string().min(1),
    currentStatus: z.enum(["in-progress", "story-approved", "delivery-approved"]),
    stages: z.array(sourceFirstWorkflowStageSchema).min(sourceFirstCreativeRoles.length).max(7),
    decisions: z.array(sourceFirstWorkflowDecisionSchema).default([]),
  })
  .passthrough();

export type SourceFirstWorkflow = z.infer<typeof sourceFirstWorkflowSchema>;

export const isSourceFirstWorkflowData = (
  value: unknown,
): value is {schemaVersion: typeof SOURCE_FIRST_WORKFLOW_SCHEMA_VERSION} =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (value as {schemaVersion?: unknown}).schemaVersion === SOURCE_FIRST_WORKFLOW_SCHEMA_VERSION;

export const storySpineArtifactId = (episodeId: string): string => `${episodeId}:story:story-spine`;

export const storySpineArtifactPath = (episodeId: string): string =>
  `content/${episodeId}/story/story-spine.md`;

export type SourceFirstWorkflowValidationInput = {
  workflow: SourceFirstWorkflow;
  episodeId: string;
  resolveArtifact: (relativePath: string) => string;
};

/**
 * Validate only the small control-plane contract. Creative quality belongs in
 * the Script Editor's report and the later Episode-008 comparison, not here.
 */
export const validateSourceFirstWorkflow = ({
  workflow,
  episodeId,
  resolveArtifact,
}: SourceFirstWorkflowValidationInput): string[] => {
  const errors: string[] = [];
  if (workflow.episodeId !== episodeId) {
    errors.push(`workflow episodeId 应为 ${episodeId}，当前 ${workflow.episodeId}`);
  }

  const stageIds = workflow.stages.map((stage) => stage.id);
  const duplicateStageIds = stageIds.filter((id, index) => stageIds.indexOf(id) !== index);
  if (duplicateStageIds.length > 0) {
    errors.push(
      `Source-First workflow stages 不得重复：${[...new Set(duplicateStageIds)].join("、")}`,
    );
  }
  const creativeStageIds = stageIds.filter((id) =>
    (sourceFirstCreativeRoles as readonly string[]).includes(id),
  );
  if (
    creativeStageIds.length !== sourceFirstCreativeRoles.length ||
    sourceFirstCreativeRoles.some((role, index) => creativeStageIds[index] !== role)
  ) {
    errors.push(
      `Source-First workflow 必须按顺序包含 ${sourceFirstCreativeRoles.join(" → ")} 三个创作角色`,
    );
  }

  for (const stage of workflow.stages) {
    if (stage.owner !== stage.id) errors.push(`${stage.id} 的 owner 必须是同名负责角色`);
    if (stage.status === "complete" && stage.artifacts.length === 0) {
      errors.push(`${stage.id} 已完成但没有交付 artifact`);
    }
    for (const artifact of stage.artifacts) {
      if (stage.status === "complete" && !fs.existsSync(resolveArtifact(artifact))) {
        errors.push(`${stage.id} 的 artifact 不存在：${artifact}`);
      }
    }
  }

  if (workflow.currentStatus !== "in-progress") {
    for (const role of sourceFirstCreativeRoles) {
      const stage = workflow.stages.find((candidate) => candidate.id === role);
      if (stage?.status !== "complete") {
        errors.push(`${workflow.currentStatus} 要求 ${role} 为 complete`);
      }
    }
  }
  const supportRequirements: readonly (readonly [string, string])[] = [
    ["fact-guardian", "story-approved"],
    ["visual-director", "story-approved"],
    ["delivery-critic", "delivery-approved"],
  ];
  for (const [role, requiredStatus] of supportRequirements) {
    if (
      workflow.currentStatus !== requiredStatus &&
      workflow.currentStatus !== "delivery-approved"
    ) {
      continue;
    }
    const stage = workflow.stages.find((candidate) => candidate.id === role);
    if (!stage) {
      errors.push(`${workflow.currentStatus} 缺少 ${role} stage`);
    } else if (stage.status !== "complete") {
      errors.push(`${workflow.currentStatus} 要求 ${role} 为 complete`);
    }
  }

  for (const decision of workflow.decisions) {
    if (!fs.existsSync(resolveArtifact(decision.artifact))) {
      errors.push(`${decision.id} 的决策 artifact 不存在：${decision.artifact}`);
    }
    for (const claimId of decision.claimIds) {
      if (!/^claim-[a-z0-9-]+$/u.test(claimId)) {
        errors.push(`${decision.id} 包含无效 Claim ID：${claimId}`);
      }
    }
  }
  return errors;
};

export const sourceBeatSchema = z.object({
  id: z.string().regex(/^(?:B|beat-)\d{2,}$/iu),
  sourceLocation: z.string().min(1),
  change: z.string().min(1),
  relation: z.string().min(1),
  necessaryPremiseAndClaims: z.string().min(1),
});

export type SourceBeat = z.infer<typeof sourceBeatSchema>;

export type StorySpine = {
  title: string;
  narrator: string;
  locator: string;
  published: string;
  storyQuestion: string;
  beats: SourceBeat[];
};

const cleanCell = (value: string): string => value.trim().replace(/^`(.*)`$/u, "$1");

const sectionBody = (markdown: string, headings: readonly string[], label: string): string => {
  const headingPattern = new RegExp(`^## (?:${headings.join("|")})\\s*$`, "mu");
  const heading = headingPattern.exec(markdown);
  if (!heading) throw new Error(`story-spine.md 缺少 ${label}`);
  const contentStart = heading.index + heading[0].length;
  const remainder = markdown.slice(contentStart);
  const nextHeading = /^## /mu.exec(remainder);
  const body = remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
  if (!body) throw new Error(`story-spine.md 缺少 ${label}`);
  return body;
};

const fieldFromSection = (section: string, labels: readonly string[], label: string): string => {
  for (const candidate of labels) {
    const match = section.match(new RegExp(`^- ${candidate}:\\s*(.+)$`, "mu"));
    if (match?.[1]?.trim()) return cleanCell(match[1]);
  }
  throw new Error(`story-spine.md Source 缺少 ${label}`);
};

const tableRows = (section: string): string[][] => {
  const rows = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (rows.length < 3) throw new Error("story-spine.md Source beats 缺少可解析表格");
  return rows
    .filter((line, index) => index !== 1 && !/^\|(?:\s*:?-+:?\s*\|)+\s*$/u.test(line))
    .map((line) => line.slice(1, -1).split("|").map(cleanCell));
};

const columnIndex = (
  headers: readonly string[],
  labels: readonly string[],
  fallback: number,
): number => {
  const index = headers.findIndex((header) => labels.some((label) => header.includes(label)));
  return index >= 0 ? index : fallback;
};

/**
 * Parse the small, human-readable Story Spine table. This checks identity,
 * order and handoff fields only; it does not score the quality of a story.
 */
export const parseStorySpine = (markdown: string): StorySpine => {
  const source = sectionBody(markdown, ["Source", "主来源"], "Source / 主来源");
  const storyQuestion = sectionBody(
    markdown,
    ["Story question", "故事问题"],
    "Story question / 故事问题",
  )
    .replace(/^<!--[^]*?-->\s*/u, "")
    .trim();
  const beats = tableRows(
    sectionBody(markdown, ["Source beats", "原文拍点", "Source-spine"], "Source beats / 原文拍点"),
  );
  const headers = beats[0] ?? [];
  if (headers.length < 5) throw new Error("story-spine.md Source beats 表格至少需要五列");

  const indexes = {
    id: columnIndex(headers, ["Beat", "拍点"], 0),
    sourceLocation: columnIndex(headers, ["Source location", "源文位置", "定位"], 1),
    change: columnIndex(headers, ["What changes", "变化", "动作"], 2),
    relation: columnIndex(headers, ["Relation", "承接", "关系"], 3),
    necessaryPremiseAndClaims: columnIndex(
      headers,
      ["Necessary premise", "不可删除前提", "Claim", "事实"],
      4,
    ),
  };

  const parsedBeats = beats.slice(1).map((row) => {
    const beat = sourceBeatSchema.parse({
      id: row[indexes.id],
      sourceLocation: row[indexes.sourceLocation],
      change: row[indexes.change],
      relation: row[indexes.relation],
      necessaryPremiseAndClaims: row[indexes.necessaryPremiseAndClaims],
    });
    return beat;
  });
  if (parsedBeats.length === 0) throw new Error("story-spine.md 至少需要一个原文拍点");
  const ids = new Set<string>();
  let previousNumber = 0;
  for (const beat of parsedBeats) {
    if (ids.has(beat.id)) throw new Error(`story-spine.md 拍点重复：${beat.id}`);
    ids.add(beat.id);
    const numericPart = Number(beat.id.match(/\d+$/u)?.[0]);
    if (!Number.isFinite(numericPart) || numericPart <= previousNumber) {
      throw new Error("story-spine.md 拍点必须按原文揭示顺序递增");
    }
    previousNumber = numericPart;
  }

  return {
    title: fieldFromSection(source, ["Title", "标题"], "Title / 标题"),
    narrator: fieldFromSection(
      source,
      ["Speaker", "Narrator", "讲述者", "作者"],
      "Speaker / 讲述者",
    ),
    locator: fieldFromSection(source, ["URL", "Locator", "链接", "来源"], "URL / 定位"),
    published: fieldFromSection(
      source,
      ["Published", "发布时间", "发布日期"],
      "Published / 发布时间",
    ),
    storyQuestion,
    beats: parsedBeats,
  };
};

const sha256 = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const readText = (filePath: string): string => fs.readFileSync(filePath, "utf8");

export type SourceFirstValidationInput = {
  episodeId: string;
  episodeRoot: string;
};

const pushFileErrors = (errors: string[], root: string): boolean => {
  let missing = false;
  for (const relativePath of SOURCE_FIRST_STORY_FILES) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      errors.push(`缺少 Source-First 产物：${relativePath}`);
      missing = true;
    }
  }
  return missing;
};

/**
 * Validate the Source-First content contract while deliberately leaving
 * continuity, momentum, payoff, genericity and AI-texture as editorial notes.
 * Existing fact, visual and production contracts remain the only hard checks.
 */
export const validateSourceFirstStory = ({
  episodeId,
  episodeRoot,
}: SourceFirstValidationInput): string[] => {
  const errors: string[] = [];
  const storyRoot = path.join(episodeRoot, "story");
  if (pushFileErrors(errors, episodeRoot)) return errors;

  let episodeConfig: ReturnType<typeof episodeConfigSchema.parse>;
  try {
    episodeConfig = episodeConfigSchema.parse(
      JSON.parse(readText(path.join(episodeRoot, "episode.config.json"))) as unknown,
    );
    assertEpisodeMatchesProductionContract(episodeConfig);
    if (episodeConfig.id !== episodeId) {
      errors.push(`episode.config.json id 应为 ${episodeId}，当前 ${episodeConfig.id}`);
    }
  } catch (error) {
    errors.push(
      `episode.config.json 无效：${error instanceof Error ? error.message : String(error)}`,
    );
    return errors;
  }

  let facts: ReturnType<typeof factSchema.parse>[];
  try {
    const rawFacts = JSON.parse(readText(path.join(episodeRoot, "research/facts.json"))) as unknown;
    if (!Array.isArray(rawFacts)) throw new Error("facts.json 必须是数组");
    facts = rawFacts.map((fact) => factSchema.parse(fact));
  } catch (error) {
    errors.push(`facts.json 无效：${error instanceof Error ? error.message : String(error)}`);
    return errors;
  }
  const factMap = new Map(facts.map((fact) => [fact.id, fact]));

  try {
    parseStorySpine(readText(path.join(storyRoot, "story-spine.md")));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const readStory = (file: string): string => readText(path.join(storyRoot, file));
  let segments: ReturnType<typeof parseFinalScript>;
  try {
    segments = parseFinalScript(readStory("final-script.md"));
  } catch (error) {
    errors.push(`final-script.md 无效：${error instanceof Error ? error.message : String(error)}`);
    return errors;
  }
  const finalScriptMarkdown = readStory("final-script.md");
  const finalScriptHash = sha256(finalScriptMarkdown);
  const ids = new Set<string>();
  let totalTargetSeconds = 0;
  let hookTargetSeconds = 0;
  for (const segment of segments) {
    if (ids.has(segment.id)) errors.push(`final-script segment id 重复：${segment.id}`);
    ids.add(segment.id);
    totalTargetSeconds += segment.targetSeconds;
    if (segment.section === "hook") hookTargetSeconds += segment.targetSeconds;
    if (segment.claimIds.length === 0) errors.push(`${segment.id} 没有 Claim IDs`);
    for (const claimId of segment.claimIds) {
      const fact = factMap.get(claimId);
      if (!fact) errors.push(`${segment.id} 引用了不存在的 fact ${claimId}`);
      else if (!fact.allowedInNarration || fact.confidence === "low") {
        errors.push(`${segment.id} 引用了不可进入旁白的 fact ${claimId}`);
      }
    }
    if (segment.narrationUnits.length === 0) errors.push(`${segment.id} 没有逐句 Narration units`);
    const joinedUnits = segment.narrationUnits
      .map((unit) => unit.text)
      .join("")
      .replace(/\s+/gu, "");
    if (joinedUnits !== segment.narration.replace(/\s+/gu, "")) {
      errors.push(`${segment.id} 的 Narration units 与旁白不一致`);
    }
    for (const unit of segment.narrationUnits) {
      if (unit.claimIds.length === 0) errors.push(`${segment.id} 有旁白句未绑定 Claim ID`);
      for (const claimId of unit.claimIds) {
        if (!segment.claimIds.includes(claimId)) {
          errors.push(`${segment.id} 的逐句 Claim ${claimId} 未列入段落 Claim IDs`);
        }
        const fact = factMap.get(claimId);
        if (!fact) continue;
        if (!fact.allowedInNarration || fact.confidence === "low") {
          errors.push(`${segment.id} 的逐句 Claim ${claimId} 不可进入旁白`);
        }
      }
    }
  }

  if (episodeConfig.production.referenceStory) {
    if (hookTargetSeconds <= 0 || hookTargetSeconds > REFERENCE_HOOK_MAX_SECONDS) {
      errors.push(`Reference Hook 目标时长必须大于 0 且不超过 ${REFERENCE_HOOK_MAX_SECONDS} 秒`);
    }
    for (const claimId of episodeConfig.production.referenceStory.claimIds) {
      const fact = factMap.get(claimId);
      if (!fact?.allowedInNarration || fact.confidence === "low") {
        errors.push(`常驻标题引用了不可使用的 Claim：${claimId}`);
      }
    }
  } else if (hookTargetSeconds !== productionContract.hook.targetSeconds) {
    errors.push(
      `Hook 目标时长应为 ${productionContract.hook.targetSeconds} 秒，当前 ${hookTargetSeconds}`,
    );
  }
  try {
    assertScriptTargetSecondsMatchContract(totalTargetSeconds);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const factCheck = parseFactCheckGate(readStory("fact-check-report.md"));
    if (factCheck.verdict !== "PASS") errors.push("Fact Guardian 尚未 PASS");
    if (episodeConfig.production.referenceStory) {
      const titleHash = sha256(JSON.stringify(episodeConfig.production.referenceStory));
      const reviewedTitleHash = readStory("fact-check-report.md").match(
        /^- Reference title SHA-256: ([a-f0-9]{64})$/mu,
      )?.[1];
      if (reviewedTitleHash !== titleHash) errors.push("Fact Guardian 未核对当前常驻标题版本");
    }
    if (factCheck.reviewedSha256 !== finalScriptHash) {
      errors.push("Fact Guardian reviewedSha256 与 final-script.md 不一致");
    }
    if (factCheck.checkedSegments !== segments.length) {
      errors.push(
        `Fact Guardian checkedSegments 应为 ${segments.length}，当前 ${factCheck.checkedSegments}`,
      );
    }
    const narrationUnitCount = segments.reduce(
      (count, segment) => count + segment.narrationUnits.length,
      0,
    );
    if (factCheck.checkedNarrationUnits !== narrationUnitCount) {
      errors.push(
        `Fact Guardian checkedNarrationUnits 应为 ${narrationUnitCount}，当前 ${factCheck.checkedNarrationUnits}`,
      );
    }
    const shouldPass = factCheck.blockers.length === 0 && factCheck.returnTo === "none";
    if ((factCheck.verdict === "PASS") !== shouldPass) {
      errors.push("Fact Guardian verdict 与 blockers 或 returnTo 不一致");
    }
  } catch (error) {
    errors.push(
      `fact-check-report.md 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const visualPlanMarkdown = readStory("visual-plan.md");
    const visualPlan = parseVisualPlanGate(visualPlanMarkdown);
    if (visualPlan.verdict !== "READY") errors.push("Visual Director 尚未 READY");
    if (episodeConfig.production.referenceStory) {
      const basic = parseVisualPlanSections(visualPlanMarkdown);
      const visual = parseVisualPlanV3Sections(visualPlanMarkdown);
      if (visualPlan.rubricVersion !== "visual-plan-v3")
        errors.push("Reference 视觉方案必须使用 v3");
      for (const parsed of [basic, visual]) {
        if (
          parsed.sections.map((section) => section.id).join() !==
          segments.map((segment) => segment.id).join()
        ) {
          errors.push("Reference 视觉方案必须按顺序覆盖全部旁白段落");
        }
        for (const missing of parsed.missing)
          errors.push(`${missing.segmentId} 缺少 ${missing.field}`);
      }
      for (const [index, section] of basic.sections.entries()) {
        const segment = segments[index];
        if (segment && section.fields["Render target"] !== segment.scene) {
          errors.push(`${segment.id} 的视觉 Render target 与脚本不一致`);
        }
        for (const claim of segment?.claimIds ?? []) {
          if (!section.fields["Claim IDs"]?.split(/[,，、\s]+/u).includes(claim)) {
            errors.push(`${section.id} 的视觉方案缺少 ${claim}`);
          }
        }
      }
    }
    if (visualPlan.reviewedSha256 !== finalScriptHash) {
      errors.push("Visual Director reviewedSha256 与 final-script.md 不一致");
    }
    if (visualPlan.plannedSegments !== segments.length) {
      errors.push(
        `Visual Director plannedSegments 应为 ${segments.length}，当前 ${visualPlan.plannedSegments}`,
      );
    }
    const shouldBeReady =
      visualPlan.plannedSegments === segments.length &&
      visualPlan.unresolvedAssets.length === 0 &&
      visualPlan.returnTo === "none";
    if ((visualPlan.verdict === "READY") !== shouldBeReady) {
      errors.push("Visual Director verdict 与段落数、素材缺口或 returnTo 不一致");
    }
  } catch (error) {
    errors.push(`visual-plan.md 无效：${error instanceof Error ? error.message : String(error)}`);
  }

  const criticReport = readStory("critic-report.md").trim();
  if (criticReport.length === 0) errors.push("critic-report.md 不能为空");
  const draft = readStory("script-draft.md").trim();
  if (draft.length === 0) errors.push("script-draft.md 不能为空");

  return errors;
};
