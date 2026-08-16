export const hookCandidateFields = [
  "首帧结果：",
  "同期证据：",
  "递进台阶：",
  "自然误解：",
] as const;

export const visualPlanFields = [
  "Narrative purpose",
  "Viewer state in",
  "Viewer state out",
  "New information",
  "Scene structure",
  "Visual evidence",
  "Animation ideas",
  "Asset requirements",
  "Pacing",
  "Render target",
  "Claim IDs",
] as const;

export const visualPlanV3Fields = [
  "Visible action",
  "Evidence type",
  "Focal crop",
  "Visual event",
  "Media preference",
] as const;

export const visualEvidenceTypes = [
  "product-operation",
  "interview",
  "official-ui-crop",
  "data-graphic",
  "news-quote",
  "programmatic-action",
  "still-page",
] as const;

export type VisualEvidenceType = (typeof visualEvidenceTypes)[number];

const actionClaimPattern = /打开|发出|执行|读写|批准|整理|点击|搜索|下载|加载|运行|去办/u;
const visualEventPattern = /点击|缩放|高亮|结果|切到|光标|加载|批准|打开|落下|闪|硬切|推进|出现/u;
const visibleStepPattern = /→|随后|再|然后|接着|同时/u;

export type MissingHookCandidateField = {
  heading: string;
  field: (typeof hookCandidateFields)[number];
};

export const findMissingHookCandidateFields = (markdown: string): MissingHookCandidateField[] => {
  const starts = [...markdown.matchAll(/^## /gmu)].map((match) => match.index ?? 0);
  const missing: MissingHookCandidateField[] = [];

  for (const [position, start] of starts.entries()) {
    const end = starts[position + 1] ?? markdown.length;
    const section = markdown.slice(start, end);
    const heading = section.match(/^## ([^\n]+)/u)?.[1]?.trim() ?? `candidate-${position + 1}`;
    for (const field of hookCandidateFields) {
      if (!section.includes(field)) missing.push({heading, field});
    }
  }

  return missing;
};

export type VisualPlanSection = {
  id: string;
  fields: Record<(typeof visualPlanFields)[number], string>;
};

export type MissingVisualPlanField = {
  segmentId: string;
  field: (typeof visualPlanFields)[number];
};

export const parseVisualPlanSections = (
  markdown: string,
): {sections: VisualPlanSection[]; missing: MissingVisualPlanField[]} => {
  const starts = [...markdown.matchAll(/^## seg-\d+[ \t]*$/gmu)].map((match) => match.index ?? 0);
  const blocks = starts.map((start, index) => markdown.slice(start, starts[index + 1]));
  const sections: VisualPlanSection[] = [];
  const missing: MissingVisualPlanField[] = [];

  for (const block of blocks) {
    const id = block.match(/^## (seg-\d+)\s*$/mu)?.[1];
    if (!id) continue;
    const fields = {} as Record<(typeof visualPlanFields)[number], string>;
    for (const field of visualPlanFields) {
      const value = block.match(new RegExp(`^- ${field}: (.+)$`, "mu"))?.[1]?.trim();
      if (!value) {
        missing.push({segmentId: id, field});
      } else {
        fields[field] = value;
      }
    }
    sections.push({id, fields});
  }

  return {sections, missing};
};

export type VisualPlanV3Section = {
  id: string;
  fields: Record<(typeof visualPlanV3Fields)[number], string>;
};

export type MissingVisualPlanV3Field = {
  segmentId: string;
  field: (typeof visualPlanV3Fields)[number];
};

export const parseVisualPlanV3Sections = (
  markdown: string,
): {sections: VisualPlanV3Section[]; missing: MissingVisualPlanV3Field[]} => {
  const starts = [...markdown.matchAll(/^## seg-\d+[ \t]*$/gmu)].map((match) => match.index ?? 0);
  const blocks = starts.map((start, index) => markdown.slice(start, starts[index + 1]));
  const sections: VisualPlanV3Section[] = [];
  const missing: MissingVisualPlanV3Field[] = [];

  for (const block of blocks) {
    const id = block.match(/^## (seg-\d+)\s*$/mu)?.[1];
    if (!id) continue;
    const fields = {} as Record<(typeof visualPlanV3Fields)[number], string>;
    for (const field of visualPlanV3Fields) {
      const value = block.match(new RegExp(`^- ${field}: (.+)$`, "mu"))?.[1]?.trim();
      if (!value) {
        missing.push({segmentId: id, field});
      } else {
        fields[field] = value;
      }
    }
    sections.push({id, fields});
  }

  return {sections, missing};
};

export const parseEvidenceType = (value: string): VisualEvidenceType | undefined => {
  const token = value.match(/[a-z-]+/u)?.[0];
  return visualEvidenceTypes.find((type) => type === token);
};

export const narrationClaimsVisibleAction = (text: string): boolean => actionClaimPattern.test(text);

export const findSeenActionViolations = (
  sections: VisualPlanV3Section[],
  narrations: ReadonlyMap<string, string>,
): string[] => {
  const violations: string[] = [];
  for (const section of sections) {
    const narration = narrations.get(section.id) ?? "";
    const evidenceType = parseEvidenceType(section.fields["Evidence type"] ?? "");
    if (!evidenceType) {
      violations.push(`${section.id} 的 Evidence type 必须是 ${visualEvidenceTypes.join(" / ")}`);
      continue;
    }
    if (narrationClaimsVisibleAction(narration) && evidenceType === "still-page") {
      violations.push(`${section.id} 旁白包含产品动作，但 Evidence type 仍是 still-page`);
    }
    if (!visualEventPattern.test(section.fields["Visual event"] ?? "")) {
      violations.push(`${section.id} 的 Visual event 必须写出可观察变化，不能只写氛围或空切`);
    }
  }
  const first = sections[0];
  if (first && parseEvidenceType(first.fields["Evidence type"] ?? "") === "still-page") {
    violations.push(`${first.id} Hook 第一段不能用 still-page 证明开场动作`);
  }
  const types = new Set(
    sections
      .map((section) => parseEvidenceType(section.fields["Evidence type"] ?? ""))
      .filter((type): type is VisualEvidenceType => Boolean(type)),
  );
  if (sections.length >= 3 && types.size < 3) {
    violations.push(`全片 Evidence type 至少要有 3 种，当前 ${types.size} 种`);
  }
  for (const [index, section] of sections.entries()) {
    const previous = sections[index - 1];
    if (!previous) continue;
    const currentType = parseEvidenceType(section.fields["Evidence type"] ?? "");
    const previousType = parseEvidenceType(previous.fields["Evidence type"] ?? "");
    const sameCrop = section.fields["Focal crop"] === previous.fields["Focal crop"];
    if (
      currentType &&
      currentType === previousType &&
      sameCrop &&
      (currentType === "still-page" || currentType === "official-ui-crop")
    ) {
      violations.push(
        `${previous.id} 与 ${section.id} 不能用同一焦点的 ${currentType} 连续证明不同段落`,
      );
    }
  }
  return violations;
};

export const findActionVisualIntentViolations = (
  segments: ReadonlyArray<{id: string; narration: string; visualIntent: string}>,
): string[] => {
  const violations: string[] = [];
  for (const segment of segments) {
    if (!narrationClaimsVisibleAction(segment.narration)) continue;
    if (!visibleStepPattern.test(segment.visualIntent)) {
      violations.push(`${segment.id} 的 visualIntent 必须写出至少两步可见变化`);
    }
    if (/官网首页|品牌首页|落地页/u.test(segment.visualIntent) && !visibleStepPattern.test(segment.visualIntent)) {
      violations.push(`${segment.id} 不能只用官网首页代替动作过程`);
    }
  }
  return violations;
};

const genericCtaPattern =
  /(?:你觉得.{0,16}(?:怎么样|如何)|想了解更多|(?:欢迎|记得|别忘了|请)(?:点赞|关注|收藏)|关注我们|评论区(?:告诉我|聊聊|见)|加入(?:我们的|这个).{0,12}(?:群|俱乐部)|把(?:这条|这个)视频转发给)/u;

export const containsGenericCta = (text: string): boolean => genericCtaPattern.test(text);

export const endsWithQuestion = (text: string): boolean => /[？?]\s*$/u.test(text);

type VisualAssetContractInput = {
  type: string;
  usedInRender: boolean;
  sourceUrl: string;
  claimIds: string[];
};

export const findVisualAssetContractViolations = (
  asset: VisualAssetContractInput,
): Array<"sourceUrl" | "claimIds"> => {
  if (!asset.usedInRender || !["screenshot", "recording", "image"].includes(asset.type)) {
    return [];
  }

  return [
    ...(asset.sourceUrl.trim().length === 0 ? (["sourceUrl"] as const) : []),
    ...(asset.claimIds.length === 0 ? (["claimIds"] as const) : []),
  ];
};
