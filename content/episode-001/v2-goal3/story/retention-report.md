<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "93b003ef17c77b413c10298c0d884e9f1fdd56cd36ee54d100ddad116121f9e2",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "26e7f511e1301f6311a33cd1f7c67b5e5b82b30ad05890b731df155636248e0b",
  "round": 1,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 21,
    "midVideoEngagement": 21,
    "endingSatisfaction": 22
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "第 0 帧同屏显示消息和周三 15:00 的日历结果，首句直接说用户动作和结果。"
    },
    "first30Seconds": {
      "dropOffRisk": "medium",
      "prediction": "十秒内完成联系人 AI 心智模型，压缩后的第三段仍保留消息规模、早期形态和核心问题；字数下降，但三项认知任务仍在。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "0:31-1:25 的用户反馈、内测请求、主动授权动作和 Recipe 分享按人的动作推进；0:58-1:25 的能力密度仍需连续画面承接。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "公开节点之后回收工作台、内测需求和 Recipe，最终停回同一日历结果。"
    }
  },
  "total": 88,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "medium",
      "whyViewerStops": "压缩减少了音节，但观众仍要在十秒内识别一亿多条消息的来源与口径、理解早期邮件工作台，并记住继续观看问题。",
      "evidence": "当前旁白仍按 Cognition 数字、早期产品形态和核心问题推进；视觉计划安排消息聚合、工作台收起和问题出现三个动作。",
      "requestedChange": "新 TTS 和渲染必须确认 Hook 在 20 秒内完成；画面继续按数字、工作台、问题的顺序一次只保留一个焦点。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-mid-capability-density",
      "timeRange": "0:58-1:25",
      "severity": "medium",
      "whyViewerStops": "主动提醒、授权、读邮件、改日历、草拟回复、核对和 Recipe 分享连续出现，若画面逐项列卡片，仍会让故事退回产品说明。",
      "evidence": "`seg-007` 和 `seg-008` 连续覆盖两组产品机制；视觉方案提出一条授权动作和联系人之间的链接传递。",
      "requestedChange": "保持提醒、授权、日历移动、核对为一条连续动作；Recipe 只动画链接传给下一位，不额外轮播功能卡或增长图。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-launch-pivot",
      "timeRange": "1:25-1:38",
      "severity": "low",
      "whyViewerStops": "结尾前突然进入日期和 Release Notes，若页面缩得不可读或再扩展时间线，观众会把它当公司编年并提前离开。",
      "evidence": "这一段是全片唯一真实文档镜头，也是从 Recipe 程序图形切到公开状态的最大节奏变化。",
      "requestedChange": "只放大日期、候补名单取消和 Recipe 同日开放；读完后立即切回联系人和日历，不增加其他发布事件。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Retention Critic Report · Real Hook Timing Rebind

评审对象：`story/final-script.md`、`story/caption-plan.json` 与 `story/visual-plan.md`

结论：**88 / 100，PASS**

## Rebind lineage

压缩前 PASS 报告已原样归档到 `story/reviews/retention-round-01-pre-hook-real-timing.md`，归档 SHA-256 为 `65a42272172db0afd60f9362e2ea9383e623dd61af6500a69811407cca3398c1`，绑定的定稿和视觉方案 SHA-256 分别为 `2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5` 与 `adb28b33dec9843dc195e14ac5a896d790f53656fd3a1138fb31a055e469c533`。当前定稿、字幕规划和视觉方案 SHA-256 分别为 `93b003ef17c77b413c10298c0d884e9f1fdd56cd36ee54d100ddad116121f9e2`、`21d9f0c6d24815ea942eaa70e331d5237bbfc09450274ddc86a72c893dc853d3` 与 `26e7f511e1301f6311a33cd1f7c67b5e5b82b30ad05890b731df155636248e0b`。

上一份报告是同一轮 PASS。本次只为真实 Hook 时长压缩 `seg-003`，没有解决或新增 viewer-exit risk，因此继续使用 `round: 1`，不伪造 `previousReview` 或 `resolvedFeedback`。

## First 3 seconds

**24 / 25，drop-off risk: low。** 首帧和首句未改，仍直接给出一句消息和已经更新的日历结果。

## First 30 seconds

**21 / 25，drop-off risk: medium。** `seg-003` 的音节减少，产品规模、早期工作台和核心问题仍完整。但这些认知任务没有减少，真实 Hook 是否小于等于 20 秒必须等新 TTS 读回，不能用目标时长代替。

## Mid-video engagement

**21 / 25，drop-off risk: medium。** 20 秒后的旁白、动作和信息推进未改。用户反馈、内测请求、主动授权与 Recipe 仍按具体动作连接。

## Ending satisfaction

**22 / 25，drop-off risk: low。** 公开节点和结尾未改，仍回到周三下午三点的日历结果，没有新增支线或 CTA。

## Viewer exit diagnosis

最可能划走窗口仍是 `0:10–0:20`，其次是 `0:58–1:25`。压缩改善了可朗读性，但不改变视觉焦点管理和新 TTS 读回要求。

## PASS 依据

- 四项均高于 15 分，总分 88，高于 80 分门槛。
- Hook 保留来源、规模、早期形态和核心问题，没有为了时长删掉故事承诺。
- Caption cue 与旁白同步压缩，视觉方案仍绑定同一 Scene 和 Claim。
- 没有事实、故事或留存 blocker。

Retention Critic 批准当前文字与视觉计划的预期留存。新 TTS、字幕时间线和最终 MP4 必须重建后再走 Delivery Critic。
