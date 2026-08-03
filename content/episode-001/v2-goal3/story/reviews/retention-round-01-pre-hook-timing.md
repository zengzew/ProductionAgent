<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "7f8a9824cee4a7049167c358b8cf57c1181aad2d481cb8c35d698a3242208f06",
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
      "prediction": "第 0 帧已经同屏显示发出的消息和改到周三 15:00 的日历结果，三秒只解释一个改变后的状态；零背景观众不需要先认识 Poke。"
    },
    "first30Seconds": {
      "dropOffRisk": "medium",
      "prediction": "十秒内完成联系人 AI 心智模型，二十秒留下用户会交出哪些日常任务的问题，随后进入抄时间、挪日程和补提醒；0:10-0:20 的来源数字、早期形态和问题仍有短时理解负荷。"
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
      "whyViewerStops": "观众要在十秒内识别一亿条消息的来源与口径、理解早期邮件工作台，并记住继续观看问题；若三个视觉层同时运动，数字会压过人的选择。",
      "evidence": "旁白连续给 Cognition 数字、早期产品形态和问题；视觉计划安排消息聚合、工作台收起和问题出现三个动作。",
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

# Poke v2 Retention Critic Report · Compliance Rebind

评审对象：`story/final-script.md` 与 `story/visual-plan.md`

结论：**87 / 100，PASS**

## Compliance rebind

Prelabel 报告 `story/reviews/retention-round-01-prelabel.md` 的 SHA-256 是 `5ba4a4d3a526ec8c101a4e5bc94703e69a1d31ca385fae031dcb961725623590`，绑定的定稿和视觉方案 SHA-256 分别是 `445b139db670f1b30f97a7a6a3a47b701b0e3cb98dd665bd32fb771090bce7cc` 与 `aef4811f6d330a7574384b72895b809146fcc5ebcd43d0e42232277899da70b1`。当前两者分别是 `c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e` 与 `7f8a9824cee4a7049167c358b8cf57c1181aad2d481cb8c35d698a3242208f06`。

变化只给 `0:20–0:31` 的合成流程补充“功能演示”标签，没有改变旁白、镜头结构、时长或节奏。它降低误认风险，但不足以改变四个窗口的留存预测或分数。

Prelabel Retention 是同一轮 PASS，不是更早的 REJECT；因此本次仍使用 `round: 1`，不能在机器门中伪造 `previousReview` 或 `resolvedFeedback`。

## First 3 seconds

**24 / 25，drop-off risk: low。** 第 0 帧同屏显示已发送消息和更新后的日历，无淡入核心结果。零背景观众不需要先认识 Poke，也能看懂一句话已经改变日程。

## First 30 seconds

**21 / 25，drop-off risk: medium。** 10 秒内完成联系人 AI 心智模型，20 秒留下与使用有关的问题，30 秒前进入具体麻烦。`0:10–0:20` 同时承载数字、早期形态和问题，仍是最可能的早期划走点。`seg-004` 新标签只增加证据透明度，不增加认知负担。

## Mid-video engagement

**20 / 25，drop-off risk: medium。** `0:31–1:25` 每 13～14 秒新增团队选择、Beta 请求、主动授权动作或 Recipe 分享，没有 20～40 秒的信息停滞。`0:58–1:25` 能力较密，实际画面必须保持连续动作，避免卡片轮播。

## Ending satisfaction

**22 / 25，drop-off risk: low。** `1:25` 用真实 Release Notes 给出最后的新状态，`1:38` 起回收工作台、Beta 请求和 Recipe，最终回到同一日历结果。结尾没有未来质疑、功能总结或 CTA。

## Viewer exit diagnosis

最可能划走窗口仍是 `0:10–0:20`，其次是 `0:58–1:25`。三个风险均已有时间、原因、当前证据、可验证的视觉要求和责任角色；没有 high risk 或 blocker。

## PASS 依据

- 四项均高于 15 分，总分 87，高于 80 分门槛。
- 新增标签不改变任何窗口的故事推进、口播密度或镜头数量。
- 功能演示身份更清楚，没有引入新的字幕负担或来源口播。
- 结尾继续兑现开场动作。

Retention Critic 只批准脚本和视觉计划的预期留存。真实 TTS、字幕、镜头执行和 MP4 仍需交付门禁验证。
