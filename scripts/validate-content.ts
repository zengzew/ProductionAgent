import fs from "node:fs";
import path from "node:path";
import {assetSchema, episodeConfigSchema, factSchema} from "../src/schemas/episode";
import {episodeId, episodeRoot, repoRoot} from "../src/lib/episode/paths";
import {captionPartsFromPlan, visibleLength} from "../src/lib/delivery/captions";
import {
  containsGenericCta,
  findVisualAssetContractViolations,
} from "../src/lib/editorial/story-quality";
import {findTextRuleViolations, loadEditorialTextRules} from "../src/lib/editorial/text-rules";
import {
  assertEpisodeMatchesProductionContract,
  assertTimelineMatchesProductionContract,
  containsConfiguredHookAction,
  productionContract,
  startsWithConfiguredAttribution,
} from "../src/lib/episode/production-contract";
import {
  assertTimelineMatchesEpisode,
  generatedCaptionsPath,
  publicCaptionsRepositoryPath,
  publicTimelineRepositoryPath,
} from "../src/lib/episode/render-contract";
import {captionPlanMismatchIds, validateCaptionPlanCoverage} from "./lib/caption-artifacts";
import {
  finishValidation,
  installCliErrorHandlers,
  jsonValuesEqual,
  readCaptionPlan,
  readGeneratedCaptions,
  readJsonFile,
  readScript,
  readTimeline,
  ValidationErrors,
} from "./lib/validation";

installCliErrorHandlers();

const claims = readJsonFile<unknown[]>(path.join(episodeRoot, "research/facts.json")).map((claim) =>
  factSchema.parse(claim),
);
const episodeConfig = episodeConfigSchema.parse(
  readJsonFile<unknown>(path.join(episodeRoot, "episode.config.json")),
);
assertEpisodeMatchesProductionContract(episodeConfig);
const editorialTextRules = loadEditorialTextRules();
const script = readScript(path.join(episodeRoot, "story/script.json"));
const captionPlan = readCaptionPlan(path.join(episodeRoot, "story/caption-plan.json"));
const captionPlanBySegment = new Map(
  captionPlan.segments.map((segment) => [segment.segmentId, segment.cues]),
);
const assets = readJsonFile<unknown[]>(
  path.join(episodeRoot, "production/asset-manifest.json"),
).map((asset) => assetSchema.parse(asset));
const errors = new ValidationErrors();
const claimMap = new Map(claims.map((claim) => [claim.id, claim]));

errors.push(...validateCaptionPlanCoverage(script, captionPlan));
for (const segment of script.segments) {
  const plannedCues = captionPlanBySegment.get(segment.id);
  if (!plannedCues) {
    errors.push(`字幕规划缺少段落：${segment.id}`);
    continue;
  }
  errors.capture(() => {
    captionPartsFromPlan(
      segment.narration,
      plannedCues,
      productionContract.captions.maximumLineCharacters,
    );
  });
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
if (hookSeconds !== productionContract.hook.targetSeconds) {
  errors.push(`Hook 目标时长应为 ${productionContract.hook.targetSeconds} 秒，当前 ${hookSeconds}`);
}
const firstHook = hook.at(0);
const firstHookText = `${firstHook?.narration ?? ""} ${firstHook?.onScreenText.join(" ") ?? ""}`;
if (!firstHook || firstHook.targetSeconds > productionContract.hook.firstSegmentMaximumSeconds) {
  errors.push(
    `Hook 第一段必须在 ${productionContract.hook.firstSegmentMaximumSeconds} 秒内给出零背景可懂的核心动作`,
  );
}
if (!containsConfiguredHookAction(firstHookText)) {
  errors.push("Hook 第一屏缺少陌生观众能立即理解的具体动作");
}
if (startsWithConfiguredAttribution(firstHook?.narration ?? "", episodeConfig)) {
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

for (const violation of findTextRuleViolations(
  scriptNarration,
  editorialTextRules,
  "content",
  episodeId,
)) {
  errors.push(`旁白命中禁用写法：${violation.label}`);
}

const spokenAttributions =
  scriptNarration.match(
    /(?:[\p{Script=Han}A-Za-z0-9·.&-]{1,30})(?:说|表示|宣布|披露|称|回忆)(?=[，。！？])/gu,
  ) ?? [];
if (spokenAttributions.length > 2) {
  errors.push(`旁白显式来源归因超过 2 次：${spokenAttributions.join("、")}`);
}

const finalSegment = script.segments.at(-1);
if (containsGenericCta(finalSegment?.narration ?? "")) {
  errors.push("结尾使用通用互动 CTA，没有停在具体事实、产品状态或用户动作");
}

for (const asset of assets) {
  if (asset.usedInRender && !asset.approved) {
    errors.push(`渲染使用了未批准素材 ${asset.id}`);
  }
  if (asset.usedInRender && !fs.existsSync(path.join(repoRoot, asset.path))) {
    errors.push(`渲染素材不存在 ${asset.path}`);
  }
  for (const violation of findVisualAssetContractViolations(asset)) {
    errors.push(
      violation === "sourceUrl"
        ? `真实视觉素材 ${asset.id} 缺少可追溯 sourceUrl`
        : `真实视觉素材 ${asset.id} 没有绑定 Claim ID`,
    );
  }
  for (const claimId of asset.claimIds) {
    if (!claimMap.has(claimId)) errors.push(`${asset.id} 引用了不存在的 claim ${claimId}`);
  }
}

const timelinePath = path.join(episodeRoot, "production/timeline.json");
if (!fs.existsSync(timelinePath)) {
  errors.push(`缺少当前 episode 的生产时间轴：${timelinePath}`);
} else {
  const timeline = readTimeline(timelinePath);
  errors.capture(() => {
    assertTimelineMatchesEpisode(timeline, episodeId);
    assertTimelineMatchesProductionContract(timeline);
  });
  const timelineMatchesScript =
    timeline.scenes.length === script.segments.length &&
    timeline.scenes.every(
      (scene, index) =>
        scene.id === script.segments[index]?.id &&
        scene.narration === script.segments[index]?.narration,
    );
  if (timelineMatchesScript) {
    const minimumDuration = productionContract.delivery.minimumSeconds;
    const maximumDuration = productionContract.delivery.hardMaximumSeconds;
    if (timeline.totalSeconds < minimumDuration) {
      errors.push(
        `视频时长不得低于 ${minimumDuration} 秒，当前 ${timeline.totalSeconds.toFixed(3)} 秒`,
      );
    }
    if (timeline.totalSeconds > maximumDuration) {
      errors.push(
        `视频时长不得超过 ${maximumDuration} 秒，当前 ${timeline.totalSeconds.toFixed(3)} 秒`,
      );
    }
    const actualHookEnd = Math.max(
      ...timeline.scenes
        .filter((scene) => scene.section === "hook")
        .map((scene) => scene.endSeconds),
    );
    if (!Number.isFinite(actualHookEnd) || actualHookEnd > productionContract.hook.targetSeconds) {
      errors.push(
        `Hook 真实音频必须在 ${productionContract.hook.targetSeconds} 秒内结束，当前 ${actualHookEnd.toFixed(3)} 秒`,
      );
    }
  }
  const publicTimelineFile = path.join(repoRoot, publicTimelineRepositoryPath(episodeId));
  const captionPath = path.join(repoRoot, generatedCaptionsPath(episodeId));
  const publicCaptionPath = path.join(repoRoot, publicCaptionsRepositoryPath(episodeId));
  if (!fs.existsSync(publicTimelineFile)) {
    errors.push(`缺少 Remotion 运行时时间轴副本：${publicTimelineFile}`);
  } else if (!jsonValuesEqual(readTimeline(publicTimelineFile), timeline)) {
    errors.push(`public 时间轴不是当前 production/timeline.json 的同一版本：${publicTimelineFile}`);
  }
  if (!fs.existsSync(captionPath)) {
    errors.push(`缺少当前 episode 的生成字幕：${captionPath}`);
  } else {
    const captions = readGeneratedCaptions(captionPath);
    if (!fs.existsSync(publicCaptionPath)) {
      errors.push(`缺少 Remotion 运行时字幕副本：${publicCaptionPath}`);
    } else if (!jsonValuesEqual(readGeneratedCaptions(publicCaptionPath), captions)) {
      errors.push(`public 字幕不是当前 captions.generated.json 的同一版本：${publicCaptionPath}`);
    }
    if (timelineMatchesScript) {
      for (const caption of captions) {
        for (const line of caption.text.split("\n")) {
          if (visibleLength(line) > productionContract.captions.maximumLineCharacters) {
            errors.push(
              `字幕超过 ${productionContract.captions.maximumLineCharacters} 字：${line}`,
            );
          }
          if (/[。！？；：，、,.!?;:]$/u.test(line)) {
            errors.push(`字幕末尾不应保留标点：${line}`);
          }
        }
      }
      const captionMismatchIds = captionPlanMismatchIds({
        script,
        captionPlan,
        timeline,
        generatedCaptions: captions,
        maximumLineCharacters: productionContract.captions.maximumLineCharacters,
        microCueThresholdSeconds: productionContract.captions.microCueThresholdSeconds,
      });
      for (const segmentId of captionMismatchIds) {
        errors.push(`${segmentId} 字幕未按词边界算法重新生成`);
      }
    }
  }
}

finishValidation(
  errors,
  `content validation passed: ${script.segments.length} segments, ${assets.length} assets, hook=${hookSeconds}s`,
);
