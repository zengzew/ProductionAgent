export const hookCandidateFields = [
  "首帧结果：",
  "同期证据：",
  "递进台阶：",
  "自然误解：",
] as const;

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
