import fs from "node:fs";
import path from "node:path";
import {
  assetSchema,
  captionPlanSchema,
  claimSchema,
  scriptSchema,
  timelineSchema,
} from "../src/schemas/episode";
import {episodeRoot, readJson, repoRoot} from "../src/lib/project";
import {captionPartsFromPlan, fitCaptionPartsToDuration, visibleLength} from "../src/lib/captions";

const claims = readJson<unknown[]>(path.join(episodeRoot, "research/facts.json")).map((claim) =>
  claimSchema.parse(claim),
);
const script = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
const captionPlan = captionPlanSchema.parse(
  readJson<unknown>(path.join(episodeRoot, "story/caption-plan.json")),
);
const captionPlanBySegment = new Map(
  captionPlan.segments.map((segment) => [segment.segmentId, segment.cues]),
);
const assets = readJson<unknown[]>(path.join(episodeRoot, "production/asset-manifest.json")).map(
  (asset) => assetSchema.parse(asset),
);
const errors: string[] = [];
const claimMap = new Map(claims.map((claim) => [claim.id, claim]));

if (
  captionPlanBySegment.size !== captionPlan.segments.length ||
  captionPlanBySegment.size !== script.segments.length
) {
  errors.push("字幕规划必须与脚本段落一一对应，且 segmentId 不得重复");
}
for (const segment of script.segments) {
  const plannedCues = captionPlanBySegment.get(segment.id);
  if (!plannedCues) {
    errors.push(`字幕规划缺少段落：${segment.id}`);
    continue;
  }
  try {
    captionPartsFromPlan(segment.narration, plannedCues);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

for (const segment of script.segments) {
  for (const claimId of segment.claimIds) {
    const claim = claimMap.get(claimId);
    if (!claim) {
      errors.push(`${segment.id} 引用了不存在的 claim ${claimId}`);
      continue;
    }
    if (!claim.allowedInNarration || claim.confidence === "low") {
      errors.push(`${segment.id} 引用了不可进入旁白的 claim ${claimId}`);
    }
    if (claim.sourceIds.length === 0) {
      errors.push(`${claimId} 没有来源`);
    }
  }
}

const hook = script.segments.filter((segment) => segment.section === "hook");
const hookSeconds = hook.reduce((total, segment) => total + segment.targetSeconds, 0);
const hookNarration = hook.map((segment) => segment.narration).join(" ");
if (hookSeconds !== 20) errors.push(`Hook 目标时长应为 20 秒，当前 ${hookSeconds}`);
const firstHook = hook.at(0);
const firstHookText = `${firstHook?.narration ?? ""} ${firstHook?.onScreenText.join(" ") ?? ""}`;
if (!firstHook || firstHook.targetSeconds > 3) {
  errors.push("Hook 第一段必须在 3 秒内给出零背景可懂的核心动作");
}
if (!/提醒|打开|复制|发送|回复|读取|安排|查询|问|邮件|日历/u.test(firstHookText)) {
  errors.push("Hook 第一屏缺少陌生观众能立即理解的具体动作");
}
if (
  /^(?:Cognition|Poke|[\p{Script=Han}A-Za-z0-9·.&-]{2,30}(?:公司)?)(?:说|表示|宣布|披露|称|回忆)/u.test(
    firstHook?.narration ?? "",
  )
) {
  errors.push("Hook 第一段不得以陌生公司或产品名加来源归因起头");
}
if (!/[？?]/u.test(hookNarration)) errors.push("Hook 缺少未解决问题");

const sourceNarration = fs
  .readFileSync(path.join(episodeRoot, "story/narration.txt"), "utf8")
  .split(/\n+/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .join("\n");
const scriptNarration = script.segments.map((segment) => segment.narration).join("\n");
if (sourceNarration !== scriptNarration) {
  errors.push("narration.txt 与 script.json 旁白不一致");
}

const bannedNarrationPatterns = [
  {label: "不是……而是……", pattern: /不是[^。！？\n]{0,40}而是/u},
  {label: "研究过程口播", pattern: /公开资料|资料(没有|未)(给出|披露|说明)|能确认的只有/u},
  {
    label: "数据口径或缺口旁白",
    pattern: /这个口径|口径没有|没有拆分|看不出|回答不了|无法回答/u,
  },
  {label: "元评论", pattern: /听上去[^。！？\n]{0,20}技术|说白了/u},
];
for (const {label, pattern} of bannedNarrationPatterns) {
  if (pattern.test(scriptNarration)) {
    errors.push(`旁白命中禁用写法：${label}`);
  }
}

const spokenAttributions =
  scriptNarration.match(
    /(?:[\p{Script=Han}A-Za-z0-9·.&-]{1,30})(?:说|表示|宣布|披露|称|回忆)(?=[，。！？])/gu,
  ) ?? [];
if (spokenAttributions.length > 2) {
  errors.push(`旁白显式来源归因超过 2 次：${spokenAttributions.join("、")}`);
}

for (const asset of assets) {
  if (asset.usedInRender && !asset.approved) {
    errors.push(`渲染使用了未批准素材 ${asset.id}`);
  }
  if (asset.usedInRender && !fs.existsSync(path.join(repoRoot, asset.path))) {
    errors.push(`渲染素材不存在 ${asset.path}`);
  }
  for (const claimId of asset.claimIds) {
    if (!claimMap.has(claimId)) errors.push(`${asset.id} 引用了不存在的 claim ${claimId}`);
  }
}

const timelinePath = path.join(episodeRoot, "production/timeline.json");
if (fs.existsSync(timelinePath)) {
  const timeline = timelineSchema.parse(readJson<unknown>(timelinePath));
  const timelineMatchesScript =
    timeline.scenes.length === script.segments.length &&
    timeline.scenes.every(
      (scene, index) =>
        scene.id === script.segments[index]?.id &&
        scene.narration === script.segments[index]?.narration,
    );
  if (timelineMatchesScript) {
    if (timeline.totalSeconds < 180 || timeline.totalSeconds > 300) {
      errors.push(`视频时长必须在 180–300 秒，当前 ${timeline.totalSeconds.toFixed(3)} 秒`);
    }
    const actualHookEnd = Math.max(
      ...timeline.scenes
        .filter((scene) => scene.section === "hook")
        .map((scene) => scene.endSeconds),
    );
    if (!Number.isFinite(actualHookEnd) || actualHookEnd > 20) {
      errors.push(`Hook 真实音频必须在 20 秒内结束，当前 ${actualHookEnd.toFixed(3)} 秒`);
    }
  }
  const captionPath = path.join(repoRoot, "src/poke-captions.generated.json");
  if (timelineMatchesScript && fs.existsSync(captionPath)) {
    const captions = readJson<Array<{sceneId: string; text: string}>>(captionPath);
    const captionsByScene = new Map<string, string[]>();
    for (const caption of captions) {
      captionsByScene.set(caption.sceneId, [
        ...(captionsByScene.get(caption.sceneId) ?? []),
        caption.text,
      ]);
      for (const line of caption.text.split("\n")) {
        if (visibleLength(line) > 16) errors.push(`字幕超过 16 字：${line}`);
        if (/[。！？；：，、,.!?;:]$/u.test(line)) {
          errors.push(`字幕末尾不应保留标点：${line}`);
        }
      }
    }
    for (const segment of script.segments) {
      const timelineScene = timeline.scenes.find((scene) => scene.id === segment.id);
      const plannedCues = captionPlanBySegment.get(segment.id) ?? [];
      const expected = fitCaptionPartsToDuration(
        captionPartsFromPlan(segment.narration, plannedCues),
        timelineScene?.audioDurationSeconds ?? 0,
      ).map((part) => part.text);
      const actual = captionsByScene.get(segment.id) ?? [];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(`${segment.id} 字幕未按词边界算法重新生成`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `content validation passed: ${script.segments.length} segments, ${assets.length} assets, hook=${hookSeconds}s`,
);
