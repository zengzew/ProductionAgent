<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "adb28b33dec9843dc195e14ac5a896d790f53656fd3a1138fb31a055e469c533",
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
      "prediction": "第 0 帧同屏显示消息和周三 15:00 的日历结果，‘发句话，把会议改到下午三点’直接说出用户动作和结果。"
    },
    "first30Seconds": {
      "dropOffRisk": "medium",
      "prediction": "十秒内完成联系人 AI 心智模型，二十秒留下用户为何愿意交出更多日常小事的问题；口语自然，但 0:10-0:20 仍同时承载来源数字、早期形态和核心问题。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "0:31-1:25 的用户反馈、内测请求、主动授权动作和 Recipe 分享按人的动作推进，说明书感下降；0:58-1:25 的能力密度仍需连续画面承接。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "1:25 的公开节点用不用排候补的用户动作表达，随后回收工作台、内测需求和 Recipe，最终停回同一日历结果。"
    }
  },
  "total": 88,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "medium",
      "whyViewerStops": "观众仍要在十秒内识别一亿条消息的来源与口径、理解早期邮件工作台，并记住继续观看问题；自然的句子没有减少这三项认知任务。",
      "evidence": "当前旁白连续给 Cognition 数字、早期产品形态和核心问题；视觉计划安排消息聚合、工作台收起和问题出现三个动作。",
      "requestedChange": "渲染时严格按数字聚合、工作台收起、问题停住的顺序一次只保留一个视觉焦点，并给最后的问题足够静止阅读时间。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-mid-capability-density",
      "timeRange": "0:58-1:25",
      "severity": "medium",
      "whyViewerStops": "主动提醒、授权、读邮件、改日历、草拟回复、核对和 Recipe 分享连续出现，若画面逐项列卡片，仍会让故事退回产品说明。",
      "evidence": "`seg-007` 和 `seg-008` 的口语顺序更清楚，但仍连续覆盖两组产品机制；视觉方案提出一条授权动作和联系人之间的链接传递。",
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

# Poke v2 Retention Critic Report · Natural Chinese Fix Rebind

评审对象：`story/final-script.md`、`story/caption-plan.json` 与 `story/visual-plan.md`

结论：**88 / 100，PASS**

## Rebind lineage

上一份 REJECT 报告已原样归档到 `story/reviews/retention-round-01-natural-chinese-reject.md`，归档 SHA-256 为 `9b31b0af7e51b00583ef8a42a20766dee7794ff73333a5a722005685e084f80e`，绑定的定稿和视觉方案 SHA-256 分别为 `ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff` 与 `13df944b762fb16abbebeb09ae5a8c632da4b8c0649a64494bcadee4356e6f5a`。当前定稿、字幕规划和视觉方案 SHA-256 分别为 `2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5`、`b4f77711ad84c79e291d7dede579c74ea15d2946bb1220c689876ea390a1dee6` 与 `adb28b33dec9843dc195e14ac5a896d790f53656fd3a1138fb31a055e469c533`。

上一份 REJECT 的原因是上游事实范围，而不是三个 viewer-exit risk。当前只删除“向所有人”，镜头结构和留存风险均未改变；因此保留同一 `round: 1`，不伪造已解决的 viewer-exit feedback，也不把一处事实范围修复记成新留存创意轮。

## First 3 seconds

**24 / 25，drop-off risk: low。** 第 0 帧同时给消息和更新后的日历，旁白直接说用户动作和结果，零背景观众不需要先认识 Poke。

## First 30 seconds

**21 / 25，drop-off risk: medium。** 前 10 秒建立联系人入口和能力，20 秒提出用户为何交出更多日常小事。`0:10–0:20` 仍同时承载数字、早期工作台和核心问题，需要按顺序展示。

## Mid-video engagement

**21 / 25，drop-off risk: medium。** 用户反馈、内测请求、主动授权和 Recipe 分享都按具体动作推进。`0:58–1:25` 仍需用连续操作避免功能卡堆叠。

## Ending satisfaction

**22 / 25，drop-off risk: low。** `seg-009` 删除受众范围后，日期、取消候补和 Recipe 同日开放仍完成原来的公开节点任务；结尾继续回到开场日历，没有结构断裂或 CTA。

## Viewer exit diagnosis

最可能划走窗口仍是 `0:10–0:20`，其次是 `0:58–1:25`。三个既有风险保持原严重度和执行要求；`seg-009` 的一词删除不会新增字幕负担或改变镜头时长。

## PASS 依据

- 四项均高于 15 分，总分 88，高于 80 分门槛。
- Fact Guardian blocker 已消除，当前没有事实或留存 blocker。
- 修订没有改变场景、时段、信息揭示顺序、结尾回收或视觉计划。
- 字幕 cue 同步删除“向所有人”，仍保留完整语义单元。

Retention Critic 批准当前脚本和视觉计划的预期留存。真实 TTS、字幕时间、镜头执行和 MP4 仍需交付门禁验证。
