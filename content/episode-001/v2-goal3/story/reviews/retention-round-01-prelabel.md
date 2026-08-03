<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "445b139db670f1b30f97a7a6a3a47b701b0e3cb98dd665bd32fb771090bce7cc",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "aef4811f6d330a7574384b72895b809146fcc5ebcd43d0e42232277899da70b1",
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
      "prediction": "十秒内完成联系人 AI 心智模型，二十秒留下用户会交出哪些日常任务的问题，随后立刻进入抄时间、挪日程和补提醒；但 0:10-0:20 同时承载来源数字、早期产品形态和问题，存在短时理解负荷。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "0:31-1:25 每 13 至 14 秒新增团队选择、Beta 请求、主动授权动作或 Recipe 分享，信息持续推进；0:58 后连续解释多项能力，Recipe 又缺少具体分享动机，仍可能短暂呈现功能说明感。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "1:25 硬切真实 Release Notes 提供最后一项新状态，1:38 起回收工作台、Beta 请求和 Recipe，最终停回同一日历结果；没有新支线、未来质疑或互动 CTA。"
    }
  },
  "total": 87,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "medium",
      "whyViewerStops": "观众要在十秒内识别一亿条消息的来源与口径、理解早期邮件工作台，并记住新的继续观看问题；若三个视觉层同时运动，数字会压过人的选择。",
      "evidence": "旁白连续给 Cognition 数字、早期产品形态和问题；视觉计划也安排消息聚合、工作台收起和问题出现三个动作。",
      "requestedChange": "渲染时严格按数字聚合、工作台收起、问题停住的顺序一次只保留一个视觉焦点，并给最后的问题至少两秒静止阅读时间；来源标签持续可读。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-mid-capability-density",
      "timeRange": "0:58-1:25",
      "severity": "medium",
      "whyViewerStops": "主动提醒、邮件跟进、授权、读邮件、改日历、草拟回复、人工核对和 Recipe 分享连续出现，若画面逐项列卡片，会让故事退回产品说明。",
      "evidence": "`seg-007` 和 `seg-008` 连续覆盖两组产品机制；当前视觉方案已提出一条完整授权动作和联系人之间的链接传递，但实际留存依赖这些动作保持连续。",
      "requestedChange": "把 `seg-007` 保持为提醒出现、授权门打开、日历移动、进入核对的一条连续动作；`seg-008` 只动画 Recipe 链接传给下一位，不额外轮播功能卡或增长图。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-retention-launch-pivot",
      "timeRange": "1:25-1:38",
      "severity": "low",
      "whyViewerStops": "结尾前突然进入日期和 Release Notes，若页面缩得不可读或再扩展时间线，观众会把它当公司编年并提前离开。",
      "evidence": "这一段是全片唯一真实文档镜头，也是从 Recipe 程序图形切到公开状态的最大节奏变化。",
      "requestedChange": "只放大日期、候补名单取消和一般可用状态，保持页面稳定且来源可读；读完后立即切回联系人和日历，不增加其他发布事件。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Retention Critic Report

评审对象：`story/final-script.md` 与 `story/visual-plan.md`

结论：**87 / 100，PASS**

## Gate lineage

这是该 v2 的第一轮 Retention Critic，因此 gate 使用 `round: 1`，没有更早的 Retention REJECT 可绑定，`resolvedFeedback` 为空。

上游创意评审经历了三轮：Round 1 定稿 SHA-256 为 `a54d142116ed87c22ff603890b48f2e247287e6c20b00bb308edd0dca5e72dc2`，Round 2 为 `b3a8b26d3b2cb1e82d6ece3b6d215854fbc37ae5a68bfb0e31eafff891383cc8`，当前 Round 3 为 `445b139db670f1b30f97a7a6a3a47b701b0e3cb98dd665bd32fb771090bce7cc`。Hook 利害关系、口播数据口径和 `seg-007` Claim 绑定均已有实质修改，但它们不是 Retention 的历史反馈，不能写入机器门的 `resolvedFeedback`。

当前视觉方案 SHA-256 为 `aef4811f6d330a7574384b72895b809146fcc5ebcd43d0e42232277899da70b1`，其 gate 绑定同一当前定稿。当前 Oral、Audience 与 Fact 报告也都绑定 `445b139…` 并给出 PASS。

## 四个窗口

| 窗口                 |    得分 | 风险   | 预测                                                                                                            |
| -------------------- | ------: | ------ | --------------------------------------------------------------------------------------------------------------- |
| First 3 seconds      | 24 / 25 | low    | 第一帧就是已发送消息与已更新日历，无淡入核心结果。动作、对象和改变后的状态对零背景观众成立。                    |
| First 30 seconds     | 21 / 25 | medium | 10 秒完成产品定义，20 秒留下与使用有关的问题，30 秒前展示具体麻烦。主要风险是 10～20 秒的数字、历史和问题过密。 |
| Mid-video engagement | 20 / 25 | medium | 每 13～14 秒都有团队选择、用户请求、授权动作或分享动作。58～85 秒能力较密，必须靠连续动作避免功能卡感。         |
| Ending satisfaction  | 22 / 25 | low    | 真实 Release Notes 给出最后的新状态，随后回到同一个联系人和日历结果；开场承诺得到兑现。                         |

## 最可能的划走点

最可能发生在 `0:10–0:20`。这个窗口必须同时交代 Cognition 的一亿条消息、早期邮件工作台和“用户接着交给它什么”的问题。脚本顺序成立，但视觉如果并行动画三层信息，陌生观众会先看到大数字，却来不及理解人的选择。当前视觉方案已经规定依次聚合、收起和停住；实际渲染必须保留这个单焦点顺序。

第二个风险窗口是 `0:58–1:25`。产品动作本身都与主线相关，但两段连续出现多项能力和 Recipe。这里不需要新增戏剧冲突，只需把能力收进一条授权后的完整动作，再把链接明确传给下一位。

## PASS 依据

- 四项均高于 15 分，总分 87，高于 80 分门槛。
- 没有 high risk 或 blocker；三个风险都有具体时间、现有证据、可验证的视觉要求和责任角色。
- 0～58 秒持续推进结果、产品定义、问题、旧流程、团队选择和 Beta 请求，没有 20～40 秒的信息停滞。
- 58～85 秒从个人动作转到分享，85 秒切真实文档，98 秒回到开场动作，节奏切换与故事推进一致。
- 结尾不总结功能清单、不宣布市场胜负，也不使用互动 CTA。

Retention Critic 仅批准脚本和视觉计划的预期留存。真实 TTS 节奏、字幕可读性、镜头执行和最终 MP4 仍需后续交付门禁验证。
