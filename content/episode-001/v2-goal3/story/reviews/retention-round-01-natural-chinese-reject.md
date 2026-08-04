<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "13df944b762fb16abbebeb09ae5a8c632da4b8c0649a64494bcadee4356e6f5a",
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
      "prediction": "十秒内完成联系人 AI 心智模型，二十秒留下用户为何愿意交出更多日常小事的问题；口语更自然，但 0:10-0:20 仍同时承载来源数字、早期形态和核心问题。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "0:31-1:25 的用户反馈、内测请求、主动授权动作和 Recipe 分享现在按人的动作推进，说明书感下降；0:58-1:25 的能力密度仍需连续画面承接。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "1:25 的公开节点改成不用排候补的用户动作，随后回收工作台、内测需求和 Recipe，最终停回同一日历结果。"
    }
  },
  "total": 88,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "medium",
      "whyViewerStops": "观众仍要在十秒内识别一亿条消息的来源与口径、理解早期邮件工作台，并记住继续观看问题；更自然的句子没有减少这三项认知任务。",
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
      "requestedChange": "只放大日期、候补名单取消和 Recipe 同日推出；读完后立即切回联系人和日历，不增加其他发布事件。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [
    "Fact Guardian 已拒绝 seg-009 的‘Recipe 也在同一天向所有人开放’；在该范围回到 claim-poke-004 支持的表述前，Retention 不能批准进入制作。"
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

# Poke v2 Retention Critic Report · Natural Chinese Rebind

评审对象：`story/final-script.md`、`story/caption-plan.json` 与 `story/visual-plan.md`

结论：**留存评分 88 / 100；因上游事实 blocker，门禁 REJECT**

## Rebind lineage

改写前 canonical 报告已原样归档到 `story/reviews/retention-round-01-pre-natural-chinese.md`，归档 SHA-256 为 `90dc5bf7e9822d0cc18cc423802dbb90e98e8b415ca7ada42119d3561d6d4c4d`。当前定稿、字幕规划和视觉方案 SHA-256 分别为 `ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff`、`f608df5f24b9b2e3e002ec7703ea7f36ec8c36397b4f63f2179839f9be0dcb14` 与 `13df944b762fb16abbebeb09ae5a8c632da4b8c0649a64494bcadee4356e6f5a`。

本次自然中文改写没有改变 10 个场景、时段、Claim IDs、视觉动作或信息揭示顺序。改写前 Retention 是同一轮 PASS，不是更早一轮 REJECT，因此当前仍使用 `round: 1`，不伪造 `previousReview` 或 `resolvedFeedback`。

## First 3 seconds

**24 / 25，drop-off risk: low。** “发句话，把周三的会议改到下午三点”比原来的被动结果更像真实指令，同时保持第 0 帧已经改变的日历。观众不需要先认识 Poke。

## First 30 seconds

**21 / 25，drop-off risk: medium。** 3～10 秒用“时间到了还会提醒你”补出对象感；10～20 秒的消息规模、早期工作台和核心问题都更自然，但认知任务没有减少，仍是最可能的早期划走点。

## Mid-video engagement

**21 / 25，drop-off risk: medium。** “用户说得很直接”“内测用户”“它来提醒”“再由他亲自确认授权”把研究标签和说明书句序改成连续的人与产品动作，中段说明感下降。`0:58–1:25` 仍需靠一条连续画面承接两组能力。

## Ending satisfaction

**22 / 25，drop-off risk: low。** 公开节点改成“已经不用再排候补”，更快说明对用户的实际变化；结尾继续回收工作台、内测需求、Recipe 和开场日历，没有新增支线或 CTA。

## Viewer exit diagnosis

留存层面最可能划走窗口仍是 `0:10–0:20`，其次是 `0:58–1:25`。自然中文改写使中段从 20 提升到 21，但不改变视觉执行要求。`seg-009` 的故事位置、镜头和节奏没有问题；它的阻断原因是事实范围，而不是留存结构。

## REJECT 依据

- 四项分数和总分达到 Retention 门槛，且没有 high drop-off risk。
- 但事实优先级高于留存分数。Fact Guardian 已确认 `claim-poke-004` 不足以单独支持 Recipes “向所有人开放”。
- 在该 narration unit 回到 Claim 支持的范围并重新绑定前，当前脚本不能进入 TTS 或渲染。

Retention Critic 退回 oral-rewriter，仅要求处理 `seg-009` 的事实范围。真实 TTS 时长、字幕时间、镜头执行和 MP4 仍需后续交付门禁验证。
