import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {factSchema} from "../src/schemas/episode";
import {parseCriticGate, parseFactCheckGate, parseFinalScript} from "../src/lib/story";
import {episodeRoot, readJson} from "../src/lib/project";

const storyRoot = path.join(episodeRoot, "story");
const requiredFiles = [
  "story-bible.md",
  "story-angle.md",
  "three-act-structure.md",
  "hook-candidates.md",
  "final-script.md",
  "critic-report.md",
  "fact-check-report.md",
];
const errors: string[] = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(storyRoot, file))) {
    errors.push(`缺少 Story Pipeline 产物：story/${file}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const readStory = (file: string): string => fs.readFileSync(path.join(storyRoot, file), "utf8");
const facts = readJson<unknown[]>(path.join(episodeRoot, "research/facts.json")).map((fact) =>
  factSchema.parse(fact),
);
const factMap = new Map(facts.map((fact) => [fact.id, fact]));
const finalScriptMarkdown = readStory("final-script.md");
const segments = parseFinalScript(finalScriptMarkdown);

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
  "hook-candidates.md": ["具体动作：", "矛盾：", "开放问题：", "硬拒绝检查："],
};

for (const [file, tokens] of Object.entries(requiredStoryTokens)) {
  const markdown = readStory(file);
  for (const token of tokens) {
    if (!markdown.includes(token)) errors.push(`story/${file} 缺少结构：${token}`);
  }
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

if (hookTargetSeconds !== 20) {
  errors.push(`Hook 目标时长应为 20 秒，当前 ${hookTargetSeconds}`);
}
if (totalTargetSeconds < 180 || totalTargetSeconds > 300) {
  errors.push(`Final script 目标时长必须在 180–300 秒，当前 ${totalTargetSeconds}`);
}

const narration = segments.map((segment) => segment.narration).join("\n");
const bannedNarrationPatterns = [
  {
    label: "研究报告口吻",
    pattern: /根据公开资料显示|公开信息没有透露|值得注意的是|从技术角度来看|该产品采用了/u,
  },
  {label: "研究过程口播", pattern: /公开资料|资料(没有|未)(给出|披露|说明)|能确认的只有/u},
  {
    label: "数据口径或缺口旁白",
    pattern: /这个口径|口径没有|没有拆分|看不出|回答不了|无法回答/u,
  },
  {label: "元评论", pattern: /听上去[^。！？\n]{0,20}技术|说白了/u},
  {label: "模板收束", pattern: /总而言之|不可否认|让我们拭目以待/u},
  {label: "工整反转", pattern: /不是[^。！？\n]{0,50}而是|并非[^。！？\n]{0,50}而是/u},
  {
    label: "工整并列",
    pattern: /这不仅是[^。！？\n]{0,50}更是|既有[^。！？\n]{0,50}又有|不仅[^。！？\n]{0,50}而且/u,
  },
  {label: "抽象增长词", pattern: /点火事件|增长引擎|价值闭环|生态位/u},
  {label: "广告词", pattern: /沉浸式|极致|史诗级|震撼|完美融合/u},
  {label: "破折号", pattern: /—/u},
];
for (const {label, pattern} of bannedNarrationPatterns) {
  if (pattern.test(narration)) errors.push(`final-script 旁白命中禁用写法：${label}`);
}

const spokenAttributions =
  narration.match(
    /(?:[\p{Script=Han}A-Za-z0-9·.&-]{1,30})(?:说|表示|宣布|披露|称|回忆)(?=[，。！？])/gu,
  ) ?? [];
if (spokenAttributions.length > 2) {
  errors.push(`final-script 旁白显式来源归因超过 2 次：${spokenAttributions.join("、")}`);
}

const finalSegment = segments.at(-1);
if (!finalSegment || !/会不会回来|成本|多少钱|是否继续|还会不会/u.test(finalSegment.narration)) {
  errors.push("结尾没有停在具体动作或仍待验证的实际问题");
}
if (/时代|趋势|未来必然|重新定义|改变世界/u.test(finalSegment?.narration ?? "")) {
  errors.push("结尾出现越过证据的主题升华");
}

const criticMarkdown = readStory("critic-report.md");
const critic = parseCriticGate(criticMarkdown);
const actualHash = crypto.createHash("sha256").update(finalScriptMarkdown).digest("hex");
if (critic.reviewedSha256 !== actualHash) {
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
if ((critic.verdict === "PASS") !== shouldPass) {
  errors.push("Critic verdict 与分数或 blocker 不一致");
}
if (critic.rewriteRequired === shouldPass) {
  errors.push("Critic rewriteRequired 与 verdict 不一致");
}

const factCheck = parseFactCheckGate(readStory("fact-check-report.md"));
if (factCheck.reviewedSha256 !== actualHash) {
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

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `story validation passed: ${segments.length} segments, target=${totalTargetSeconds}s, hook=${hookTargetSeconds}s, critic=${critic.total}, fact=${factCheck.verdict}`,
);
