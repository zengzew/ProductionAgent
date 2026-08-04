<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "a7529475d4b92dc55110903da2f23e1105aed452194eef2ac4a0fd34a9a2ba29",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "cb3ba696715e3c363f9d09c6e1b6cda64e9fce803e95bf0851ef5e8cdacff8df",
  "round": 1,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 21,
    "midVideoEngagement": 20,
    "endingSatisfaction": 22
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "第 0 帧同屏显示发出的消息和改到周三 15:00 的日历结果，三秒旁白只说这一项变化；零背景观众不需要先认识 Poke。"
    },
    "first30Seconds": {
      "dropOffRisk": "medium",
      "prediction": "十秒内完成联系人 AI 心智模型，二十秒留下用户为何愿意交出更多日常任务的问题，随后进入抄时间、挪日程和补提醒；压缩降低了口播负荷，但 0:10-0:20 仍包含来源数字、早期形态和核心问题。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "0:31-1:25 每 13 至 14 秒新增团队选择、Beta 请求、主动授权动作或 Recipe 分享；能力密度和 Recipe 转场仍可能产生短暂说明感。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "1:25 硬切真实 Release Notes 提供最后的新状态，1:38 起回收工作台、Beta 请求和 Recipe，最终停回同一日历结果。"
    }
  },
  "total": 87,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "medium",
      "whyViewerStops": "压缩后的旁白仍要求观众在十秒内识别一亿条消息的来源与口径、理解早期邮件工作台，并记住继续观看问题；若三个视觉层同时运动，数字会压过人的选择。",
      "evidence": "当前旁白连续给 Cognition 数字、早期产品形态和核心问题；视觉计划安排消息聚合、工作台收起和问题出现三个动作。",
      "requestedChange": "渲染时严格按数字聚合、工作台收起、问题停住的顺序一次只保留一个视觉焦点，并给最后的问题至少两秒静止阅读时间。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-mid-capability-density",
      "timeRange": "0:58-1:25",
      "severity": "medium",
      "whyViewerStops": "主动提醒、授权、读邮件、改日历、草拟回复、核对和 Recipe 分享连续出现，若画面逐项列卡片，会让故事退回产品说明。",
      "evidence": "`seg-007` 和 `seg-008` 连续覆盖两组产品机制；视觉方案已提出一条完整授权动作和联系人之间的链接传递。",
      "requestedChange": "保持提醒、授权、日历移动、核对为一条连续动作；Recipe 只动画链接传给下一位，不额外轮播功能卡或增长图。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-launch-pivot",
      "timeRange": "1:25-1:38",
      "severity": "low",
      "whyViewerStops": "结尾前突然进入日期和 Release Notes，若页面缩得不可读或再扩展时间线，观众会把它当公司编年并提前离开。",
      "evidence": "这一段是全片唯一真实文档镜头，也是从 Recipe 程序图形切到公开状态的最大节奏变化。",
      "requestedChange": "只放大日期、候补名单取消和一般可用状态；读完后立即切回联系人和日历，不增加其他发布事件。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Retention Critic Report · Delivery-timing Rebind

评审对象：`story/final-script.md`、`story/caption-plan.json` 与 `story/visual-plan.md`

结论：**87 / 100，PASS**

## Delivery-timing rebind

压缩前 canonical 报告已原样归档到 `story/reviews/retention-round-01-pre-hook-timing.md`，归档 SHA-256 为 `bbaa1cd84b5a42825aa341d51ef7bf568ef189a31c76d97bd7bdc0e440ad0c01`，其评审的定稿 SHA-256 为 `c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e`。当前定稿、字幕规划和视觉方案 SHA-256 分别为 `a7529475d4b92dc55110903da2f23e1105aed452194eef2ac4a0fd34a9a2ba29`、`8f76a6d9ee045cb838bd18ddb309436045202c7092df4ad3bcb9ca063d48dab5` 与 `cb3ba696715e3c363f9d09c6e1b6cda64e9fce803e95bf0851ef5e8cdacff8df`。

本次只把前三段旁白压入原有 3、7、10 秒视觉窗口；镜头结构、20 秒后的旁白、风险边界和结尾没有变化。压缩降低了早期口播负荷，但没有删除 `0:10–0:20` 的三项认知任务，因此保守保留原分数和风险等级。

压缩前 Retention 是同一轮 PASS，不是更早的 REJECT；本次仍使用 `round: 1`，不伪造 `previousReview` 或 `resolvedFeedback`，也不将交付时长重绑定记成新的创意修订轮。

## First 3 seconds

**24 / 25，drop-off risk: low。** 第 0 帧同屏显示消息和更新后的日历，旁白只说“发一句话，周三的会议改到下午三点”。没有公司名、背景或动作开端挡在结果前面，零背景观众能直接看懂改变后的状态。

## First 30 seconds

**21 / 25，drop-off risk: medium。** 3～10 秒用两句完成联系人入口、读邮件、改日历和主动提醒的心智模型；10～20 秒给 Cognition 数字、早期工作台和“为什么愿意交出更多日常任务”的问题；20 秒后立即进入抄时间、挪日程和补提醒。口播更短，但数字、过去形态和问题仍要按顺序展示，不能同时运动。

## Mid-video engagement

**20 / 25，drop-off risk: medium。** `0:31–1:25` 每 13～14 秒新增团队选择、Beta 请求、主动授权动作或 Recipe 分享，没有 20～40 秒的信息停滞。`0:58–1:25` 连续讲两组机制，实际画面必须维持一条动作链，避免退回卡片式功能说明。

## Ending satisfaction

**22 / 25，drop-off risk: low。** `1:25` 用真实 Release Notes 给出一般可用的新状态，`1:38` 起回收工作台、Beta 请求和 Recipe，最后回到周三 15:00 的日历结果。结尾兑现开场，没有功能总结、未来质疑或 CTA。

## Viewer exit diagnosis

最可能划走窗口仍是 `0:10–0:20`，其次是 `0:58–1:25`。三个风险都有时间、严重度、观众离开原因、当前证据、要求发生的具体变化和责任角色；没有 high risk 或 blocker。Hook 压缩解决的是实际口播时长，不代表可以放松视觉焦点管理。

## PASS 依据

- 四项均高于 15 分，总分 87，高于 80 分门槛。
- Hook 保留首帧结果、产品心智模型和继续观看问题，压缩没有造成故事断裂。
- 字幕 cue 保留完整语义单元，未在英文产品名或中文词组中间断开。
- 20 秒后的信息推进和结尾回收未改，没有新增留存风险。

Retention Critic 只批准当前脚本、字幕规划和视觉方案的预期留存。视觉方案自身 gate 仍需对应角色绑定当前定稿；真实 TTS、字幕时间、镜头执行和 MP4 仍需交付门禁验证。
