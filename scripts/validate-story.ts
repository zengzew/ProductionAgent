import fs from "node:fs";
import path from "node:path";
import {episodeConfigSchema, factSchema} from "../src/schemas/episode";
import {
  findOralReviewDecisionErrors,
  parseCriticGate,
  parseDirectorBriefGate,
  parseFactCheckGate,
  parseFinalScript,
  parseOralReviewGate,
  parseRetentionGate,
  parseViralStrategyGate,
  parseVisualPlanGate,
} from "../src/lib/story";
import {
  containsGenericCta,
  endsWithQuestion,
  findMissingHookCandidateFields,
  parseVisualPlanSections,
} from "../src/lib/story-quality";
import {episodeId, episodeRoot, repoRoot} from "../src/lib/project";
import {findTextRuleViolations, loadEditorialTextRules} from "../src/lib/editorial-text-rules";
import {
  assertEpisodeMatchesProductionContract,
  assertScriptTargetSecondsMatchContract,
  productionContract,
} from "../src/lib/production-contract";
import {
  fatal,
  finishValidation,
  installCliErrorHandlers,
  readJsonFile,
  sha256,
  ValidationErrors,
} from "./lib/validation";

installCliErrorHandlers();

const storyRoot = path.join(episodeRoot, "story");
const requiredFiles = [
  "story-bible.md",
  "story-angle.md",
  "three-act-structure.md",
  "director-brief.md",
  "hook-candidates.md",
  "viral-strategy.md",
  "script-draft.md",
  "final-script.md",
  "oral-review.md",
  "critic-report.md",
  "fact-check-report.md",
  "visual-plan.md",
  "retention-report.md",
];
const errors = new ValidationErrors();
const episodeConfig = episodeConfigSchema.parse(
  readJsonFile<unknown>(path.join(episodeRoot, "episode.config.json")),
);
assertEpisodeMatchesProductionContract(episodeConfig);
const editorialTextRules = loadEditorialTextRules();

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(storyRoot, file))) {
    errors.push(`缺少 Story Pipeline 产物：story/${file}`);
  }
}

if (errors.length > 0) fatal(errors);

const readStory = (file: string): string => fs.readFileSync(path.join(storyRoot, file), "utf8");
const facts = readJsonFile<unknown[]>(path.join(episodeRoot, "research/facts.json")).map((fact) =>
  factSchema.parse(fact),
);
const factMap = new Map(facts.map((fact) => [fact.id, fact]));
const finalScriptMarkdown = readStory("final-script.md");
const segments = parseFinalScript(finalScriptMarkdown);
const finalScriptHash = sha256(finalScriptMarkdown);
const scriptDraftMarkdown = readStory("script-draft.md");
const scriptDraftHash = sha256(scriptDraftMarkdown);

const requiredStoryTokens: Record<string, string[]> = {
  "story-bible.md": [
    "## 全片唯一问题",
    "## 目前有来源的答案",
    "## 不能回答的边界",
    "## Story Thesis",
    "## Main Conflict",
    "## Turning Interval",
    "## 九个核心问题",
    "## Why Now",
    "## 优势能否持续",
  ],
  "story-angle.md": ["## 选择结果", "## 候选一", "## 候选二", "## 候选三"],
  "three-act-structure.md": ["## Act I", "## Act II", "## Act III", "## 节奏检查"],
  "director-brief.md": [
    "## Core story question",
    "## Audience promise",
    "## Emotional arc",
    "## Reveal order",
    "## Fact boundary",
  ],
  "hook-candidates.md": ["具体动作：", "矛盾：", "开放问题：", "硬拒绝检查："],
  "viral-strategy.md": [
    "## Opening hook",
    "## Curiosity gap",
    "## Emotional tension",
    "## Information reveal order",
    "## Ending payoff",
  ],
  "visual-plan.md": ["## Visual system", "## Asset summary"],
  "retention-report.md": [
    "## First 3 seconds",
    "## First 30 seconds",
    "## Mid-video engagement",
    "## Ending satisfaction",
  ],
};

for (const [file, tokens] of Object.entries(requiredStoryTokens)) {
  const markdown = readStory(file);
  for (const token of tokens) {
    if (!markdown.includes(token)) errors.push(`story/${file} 缺少结构：${token}`);
  }
}

for (const {heading, field} of findMissingHookCandidateFields(readStory("hook-candidates.md"))) {
  errors.push(`story/hook-candidates.md 的 ${heading} 缺少结构：${field}`);
}

const directorBrief = parseDirectorBriefGate(readStory("director-brief.md"));
const directorInputHashes = {
  factsSha256: sha256(fs.readFileSync(path.join(episodeRoot, "research/facts.json"), "utf8")),
  sourcesSha256: sha256(fs.readFileSync(path.join(episodeRoot, "research/sources.json"), "utf8")),
  timelineSha256: sha256(fs.readFileSync(path.join(episodeRoot, "research/timeline.json"), "utf8")),
};
for (const [file, expectedHash] of Object.entries(directorInputHashes)) {
  const recordedHash = directorBrief.reviewedFiles[file as keyof typeof directorInputHashes];
  if (recordedHash !== expectedHash) {
    errors.push(`Story Director ${file} 与当前研究输入不一致`);
  }
}
for (const beat of directorBrief.emotionalArc) {
  for (const claimId of beat.claimIds) {
    const fact = factMap.get(claimId);
    if (!fact) {
      errors.push(`Story Director 情绪弧引用了不存在的 fact ${claimId}`);
    } else if (!fact.allowedInNarration || fact.confidence === "low") {
      errors.push(`Story Director 情绪弧引用了不可进入故事的 fact ${claimId}`);
    }
  }
}
const revealOrders = directorBrief.revealOrder.map((beat) => beat.order);
if (JSON.stringify(revealOrders) !== JSON.stringify(revealOrders.map((_, index) => index + 1))) {
  errors.push("Story Director revealOrder 必须从 1 连续递增");
}
const directorShouldBeReady =
  directorBrief.blockers.length === 0 && directorBrief.returnTo === "none";
if ((directorBrief.verdict === "READY") !== directorShouldBeReady) {
  errors.push("Story Director verdict 与 blockers 或 returnTo 不一致");
}

const viralStrategyMarkdown = readStory("viral-strategy.md");
const viralStrategy = parseViralStrategyGate(viralStrategyMarkdown);
const viralInputHashes = {
  storyBibleSha256: sha256(readStory("story-bible.md")),
  storyAngleSha256: sha256(readStory("story-angle.md")),
  threeActStructureSha256: sha256(readStory("three-act-structure.md")),
  hookCandidatesSha256: sha256(readStory("hook-candidates.md")),
  directorBriefSha256: sha256(readStory("director-brief.md")),
};
for (const [file, expectedHash] of Object.entries(viralInputHashes)) {
  const recordedHash = viralStrategy.reviewedFiles[file as keyof typeof viralInputHashes];
  if (recordedHash !== expectedHash) {
    errors.push(`Viral Director ${file} 与当前故事输入不一致`);
  }
}
const hookHeadings = [...readStory("hook-candidates.md").matchAll(/^## (.+)$/gmu)].map((match) =>
  match[1]?.trim(),
);
if (!hookHeadings.includes(viralStrategy.selectedHookHeading)) {
  errors.push(`Viral Director selectedHookHeading 不存在：${viralStrategy.selectedHookHeading}`);
}
for (const claimId of viralStrategy.claimIds) {
  const fact = factMap.get(claimId);
  if (!fact) {
    errors.push(`Viral Director 引用了不存在的 fact ${claimId}`);
  } else if (!fact.allowedInNarration || fact.confidence === "low") {
    errors.push(`Viral Director 引用了不可进入注意力策略的 fact ${claimId}`);
  }
}
const viralScoreTotal = Object.values(viralStrategy.scores).reduce(
  (total, score) => total + score,
  0,
);
if (viralStrategy.total !== viralScoreTotal) {
  errors.push(`Viral Director 总分计算错误：声明 ${viralStrategy.total}，实际 ${viralScoreTotal}`);
}
const viralShouldBeReady =
  viralStrategy.total >= viralStrategy.threshold &&
  Object.values(viralStrategy.scores).every((score) => score >= 3) &&
  viralStrategy.blockers.length === 0 &&
  viralStrategy.returnTo === "none";
if ((viralStrategy.verdict === "READY") !== viralShouldBeReady) {
  errors.push("Viral Director verdict 与分数、blockers 或 returnTo 不一致");
}
if (viralStrategy.verdict === "REVISE" && viralStrategy.returnTo === "none") {
  errors.push("Viral Director REVISE 必须指定 returnTo");
}

const ids = new Set<string>();
let totalTargetSeconds = 0;
let hookTargetSeconds = 0;
for (const segment of segments) {
  if (ids.has(segment.id)) errors.push(`final-script segment id 重复：${segment.id}`);
  ids.add(segment.id);
  totalTargetSeconds += segment.targetSeconds;
  if (segment.section === "hook") hookTargetSeconds += segment.targetSeconds;

  if (segment.claimIds.length === 0) errors.push(`${segment.id} 没有 Claim IDs`);
  const segmentClaimIds = new Set(segment.claimIds);
  for (const claimId of segment.claimIds) {
    const fact = factMap.get(claimId);
    if (!fact) {
      errors.push(`${segment.id} 引用了不存在的 fact ${claimId}`);
    } else if (!fact.allowedInNarration || fact.confidence === "low") {
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
      if (!segmentClaimIds.has(claimId)) {
        errors.push(`${segment.id} 的逐句 Claim ${claimId} 未列入段落 Claim IDs`);
      }
      const fact = factMap.get(claimId);
      if (!fact) continue;
      if (!fact.allowedInNarration || fact.confidence === "low") {
        errors.push(`${segment.id} 的逐句 Claim ${claimId} 不可进入旁白`);
      }
    }

    if (
      unit.mode === "founder" &&
      !unit.claimIds.some((claimId) => factMap.get(claimId)?.reportingType === "founder-reported")
    ) {
      errors.push(`${segment.id} 的 founder 句没有 founder-reported fact`);
    }
    if (
      unit.mode === "company" &&
      !unit.claimIds.some((claimId) => factMap.get(claimId)?.reportingType === "company-reported")
    ) {
      errors.push(`${segment.id} 的 company 句没有 company-reported fact`);
    }
    if (
      unit.mode === "independently-verified" &&
      !unit.claimIds.some(
        (claimId) => factMap.get(claimId)?.reportingType === "independently-verified",
      )
    ) {
      errors.push(`${segment.id} 的 independently-verified 句没有独立事实`);
    }
    if (
      unit.mode === "demonstration" &&
      !`${segment.onScreenText} ${segment.visualIntent}`.includes("功能演示")
    ) {
      errors.push(`${segment.id} 的演示句没有从画面标注“功能演示”`);
    }
  }
}

if (hookTargetSeconds !== productionContract.hook.targetSeconds) {
  errors.push(
    `Hook 目标时长应为 ${productionContract.hook.targetSeconds} 秒，当前 ${hookTargetSeconds}`,
  );
}
errors.capture(() => assertScriptTargetSecondsMatchContract(totalTargetSeconds));

const narration = segments.map((segment) => segment.narration).join("\n");
for (const violation of findTextRuleViolations(narration, editorialTextRules, "story", episodeId)) {
  errors.push(`final-script 旁白命中禁用写法：${violation.label}`);
}

const spokenAttributions =
  narration.match(
    /(?:[\p{Script=Han}A-Za-z0-9·.&-]{1,30})(?:说|表示|宣布|披露|称|回忆)(?=[，。！？])/gu,
  ) ?? [];
if (spokenAttributions.length > 2) {
  errors.push(`final-script 旁白显式来源归因超过 2 次：${spokenAttributions.join("、")}`);
}

const oralReview = parseOralReviewGate(readStory("oral-review.md"));
if (oralReview.reviewedSha256 !== finalScriptHash) {
  errors.push("Oral Judge reviewedSha256 与 final-script.md 不一致");
}
if (oralReview.sourceDraftSha256 !== scriptDraftHash) {
  errors.push("Oral Judge sourceDraftSha256 与 script-draft.md 不一致");
}
for (const [dimension, score] of Object.entries(oralReview.scores)) {
  if (score < oralReview.minimumScore) {
    errors.push(`Oral Judge 维度 ${dimension} 低于 ${oralReview.minimumScore}/5 门槛`);
  }
}
for (const styleSample of oralReview.styleSamples) {
  if (!styleSample.startsWith("style/approved/") || styleSample.endsWith("/README.md")) {
    errors.push(`Oral Judge styleSamples 不是 approved 样稿：${styleSample}`);
    continue;
  }
  if (!fs.existsSync(path.join(repoRoot, styleSample))) {
    errors.push(`Oral Judge styleSamples 不存在：${styleSample}`);
  }
}
errors.push(...findOralReviewDecisionErrors(oralReview));

const finalSegment = segments.at(-1);
const finalNarrationUnit = finalSegment?.narrationUnits.at(-1);
const endsWithConcreteClaim =
  finalNarrationUnit !== undefined &&
  finalNarrationUnit.mode !== "editorial-analysis" &&
  finalNarrationUnit.claimIds.length > 0;
if (!finalSegment || !endsWithConcreteClaim) {
  errors.push("结尾必须停在有 Claim 支持的具体事实、产品状态或用户动作");
}
if (/时代|趋势|未来必然|重新定义|改变世界/u.test(finalSegment?.narration ?? "")) {
  errors.push("结尾出现越过证据的主题升华");
}
if (endsWithQuestion(finalSegment?.narration ?? "")) {
  errors.push("结尾不得用问题或对产品未来的质疑收尾");
}
if (containsGenericCta(finalSegment?.narration ?? "")) {
  errors.push("结尾使用通用互动 CTA，没有停在具体事实、产品状态或用户动作");
}

const criticMarkdown = readStory("critic-report.md");
const critic = parseCriticGate(criticMarkdown);
if (critic.reviewedSha256 !== finalScriptHash) {
  errors.push("Critic reviewedSha256 与 final-script.md 不一致");
}
const calculatedTotal = Object.values(critic.scores).reduce((sum, score) => sum + score, 0);
if (critic.total !== calculatedTotal) {
  errors.push(`Critic 总分计算错误：声明 ${critic.total}，实际 ${calculatedTotal}`);
}
const calculatedHook =
  critic.hookBreakdown.zeroBackgroundComprehension + critic.hookBreakdown.continuationQuestion;
if (critic.scores.hook !== calculatedHook) {
  errors.push(`Critic Hook 分数应为拆分项之和 ${calculatedHook}，当前 ${critic.scores.hook}`);
}
const minimums = {
  hook: 9,
  conflict: 9,
  humanElement: 6,
  productClarity: 9,
  growthLogic: 9,
  technologyExplanation: 9,
  naturalChinese: 9,
};
for (const [dimension, minimum] of Object.entries(minimums)) {
  const score = critic.scores[dimension as keyof typeof critic.scores];
  if (score < minimum) errors.push(`Critic 维度 ${dimension} 低于 60% 硬门槛`);
}
const shouldPass = critic.total >= critic.threshold && critic.blockers.length === 0;
const criticHasHighExitRisk = critic.viewerExitRisks.some(
  (risk) => risk.severity === "high" || risk.severity === "blocker",
);
if (criticHasHighExitRisk && critic.blockers.length === 0) {
  errors.push("Audience Critic 标记 high/blocker 划走风险时必须记录 blocker");
}
if (critic.verdict === "REJECT" && critic.viewerExitRisks.length === 0) {
  errors.push("Audience Critic REJECT 必须写明观众为何会划走以及退回角色");
}
if ((critic.verdict === "PASS") !== shouldPass) {
  errors.push("Critic verdict 与分数或 blocker 不一致");
}
if (critic.rewriteRequired === shouldPass) {
  errors.push("Critic rewriteRequired 与 verdict 不一致");
}
if ((critic.verdict === "PASS") !== (critic.returnTo === "none")) {
  errors.push("Audience Critic returnTo 与 verdict 不一致");
}

const factCheck = parseFactCheckGate(readStory("fact-check-report.md"));
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
const factCheckShouldPass = factCheck.blockers.length === 0 && factCheck.returnTo === "none";
if ((factCheck.verdict === "PASS") !== factCheckShouldPass) {
  errors.push("Fact Guardian verdict 与 blockers 或 returnTo 不一致");
}

const visualPlanMarkdown = readStory("visual-plan.md");
const visualPlanHash = sha256(visualPlanMarkdown);
const visualPlan = parseVisualPlanGate(visualPlanMarkdown);
if (visualPlan.reviewedSha256 !== finalScriptHash) {
  errors.push("Visual Director reviewedSha256 与 final-script.md 不一致");
}
if (visualPlan.plannedSegments !== segments.length) {
  errors.push(
    `Visual Director plannedSegments 应为 ${segments.length}，当前 ${visualPlan.plannedSegments}`,
  );
}
const {sections: visualSections, missing: missingVisualFields} =
  parseVisualPlanSections(visualPlanMarkdown);
for (const {segmentId, field} of missingVisualFields) {
  errors.push(`Visual Director ${segmentId} 缺少字段：${field}`);
}
const visualIds = visualSections.map((section) => section.id);
const expectedVisualIds = segments.map((segment) => segment.id);
if (JSON.stringify(visualIds) !== JSON.stringify(expectedVisualIds)) {
  errors.push("Visual Director 段落必须与 final-script.md 一一对应且顺序一致");
}
for (const [index, visualSection] of visualSections.entries()) {
  const segment = segments[index];
  if (!segment || visualSection.id !== segment.id) continue;
  const visualClaimIds = [
    ...new Set(visualSection.fields["Claim IDs"]?.match(/claim-[a-z0-9-]+/gu) ?? []),
  ].sort();
  const segmentClaimIds = [...segment.claimIds].sort();
  if (JSON.stringify(visualClaimIds) !== JSON.stringify(segmentClaimIds)) {
    errors.push(`${segment.id} 的视觉 Claim IDs 必须完整覆盖旁白段落 Claim IDs`);
  }
  if (visualSection.fields["Render target"] !== segment.scene) {
    errors.push(`${segment.id} 的 Render target 必须与 final-script Scene 一致`);
  }
}
const visualShouldBeReady =
  visualPlan.plannedSegments === segments.length &&
  visualPlan.unresolvedAssets.length === 0 &&
  visualPlan.returnTo === "none" &&
  missingVisualFields.length === 0 &&
  JSON.stringify(visualIds) === JSON.stringify(expectedVisualIds);
if ((visualPlan.verdict === "READY") !== visualShouldBeReady) {
  errors.push("Visual Director verdict 与段落覆盖、素材缺口或 returnTo 不一致");
}
if (visualPlan.verdict === "REVISE" && visualPlan.returnTo === "none") {
  errors.push("Visual Director REVISE 必须指定 returnTo");
}

const retention = parseRetentionGate(readStory("retention-report.md"));
if (retention.reviewedSha256 !== finalScriptHash) {
  errors.push("Retention Critic reviewedSha256 与 final-script.md 不一致");
}
if (retention.visualPlanSha256 !== visualPlanHash) {
  errors.push("Retention Critic visualPlanSha256 与 visual-plan.md 不一致");
}
const retentionTotal = Object.values(retention.scores).reduce((total, score) => total + score, 0);
if (retention.total !== retentionTotal) {
  errors.push(`Retention Critic 总分计算错误：声明 ${retention.total}，实际 ${retentionTotal}`);
}
const hasHighRiskWindow = Object.values(retention.windows).some(
  (window) => window.dropOffRisk === "high",
);
const hasHighRetentionFeedback = retention.viewerExitRisks.some(
  (risk) => risk.severity === "high" || risk.severity === "blocker",
);
if ((hasHighRiskWindow || hasHighRetentionFeedback) && retention.blockers.length === 0) {
  errors.push("Retention Critic 标记 high risk 时必须记录 blocker");
}
if (retention.verdict === "REJECT" && retention.viewerExitRisks.length === 0) {
  errors.push("Retention Critic REJECT 必须给出可执行的观众流失诊断");
}

const hashPath = (relativeFile: string): string | undefined => {
  const absoluteFile = path.join(repoRoot, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    errors.push(`Retention Critic 引用的修订证据不存在：${relativeFile}`);
    return undefined;
  }
  return sha256(fs.readFileSync(absoluteFile, "utf8"));
};
if (retention.previousReview) {
  const previousHash = hashPath(retention.previousReview.reportFile);
  if (previousHash !== retention.previousReview.reportSha256) {
    errors.push("Retention Critic previousReview SHA-256 不一致");
  } else {
    const previousMarkdown = fs.readFileSync(
      path.join(repoRoot, retention.previousReview.reportFile),
      "utf8",
    );
    const previousGate = parseRetentionGate(previousMarkdown);
    if (previousGate.verdict !== "REJECT" || previousGate.round >= retention.round) {
      errors.push("Retention Critic previousReview 必须是更早一轮的 REJECT");
    }
    const resolvedIds = new Set(retention.resolvedFeedback.map((item) => item.feedbackId));
    for (const risk of previousGate.viewerExitRisks) {
      if (!resolvedIds.has(risk.id)) {
        errors.push(`Retention Critic 未闭环上一轮反馈：${risk.id}`);
      }
    }
  }
} else if (retention.round > 1) {
  errors.push("Retention Critic 第 2 轮及以后必须绑定 previousReview");
}
for (const resolution of retention.resolvedFeedback) {
  for (const artifact of resolution.artifacts) {
    const beforeHash = hashPath(artifact.beforeFile);
    const afterHash = hashPath(artifact.afterFile);
    if (beforeHash !== artifact.beforeSha256) {
      errors.push(`Retention Critic ${resolution.feedbackId} 的 beforeSha256 不一致`);
    }
    if (afterHash !== artifact.afterSha256) {
      errors.push(`Retention Critic ${resolution.feedbackId} 的 afterSha256 不一致`);
    }
    if (artifact.beforeSha256 === artifact.afterSha256) {
      errors.push(`Retention Critic ${resolution.feedbackId} 没有产生实际产物变更`);
    }
  }
}
const retentionShouldPass =
  retention.total >= retention.threshold &&
  Object.values(retention.scores).every((score) => score >= 15) &&
  retention.blockers.length === 0 &&
  retention.returnTo === "none";
if ((retention.verdict === "PASS") !== retentionShouldPass) {
  errors.push("Retention Critic verdict 与分数、blockers 或 returnTo 不一致");
}
if (retention.verdict === "REJECT" && retention.returnTo === "none") {
  errors.push("Retention Critic REJECT 必须指定 returnTo");
}

finishValidation(
  errors,
  `story validation passed: ${segments.length} segments, target=${totalTargetSeconds}s, hook=${hookTargetSeconds}s, viral=${viralStrategy.total}, oral=${oralReview.verdict}, critic=${critic.total}, fact=${factCheck.verdict}, visual=${visualPlan.verdict}, retention=${retention.total}`,
);
