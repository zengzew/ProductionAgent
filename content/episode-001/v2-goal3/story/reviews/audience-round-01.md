<!-- critic-gate
{
  "rubricVersion": "product-story-v4",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "a54d142116ed87c22ff603890b48f2e247287e6c20b00bb308edd0dca5e72dc2",
  "round": 1,
  "scores": {
    "hook": 13,
    "conflict": 13,
    "humanElement": 8,
    "productClarity": 14,
    "growthLogic": 11,
    "technologyExplanation": 12,
    "naturalChinese": 13
  },
  "hookBreakdown": {
    "zeroBackgroundComprehension": 8,
    "continuationQuestion": 5
  },
  "total": 84,
  "threshold": 85,
  "viewerExitRisks": [
    {
      "id": "feedback-poke-metric-caveat",
      "timeRange": "1:25-1:38",
      "severity": "high",
      "whyViewerStops": "一亿条消息已经在前二十秒出现，这里再次报数后又念出数据口径，观众得到的是重复证据和编辑审计，没有获得新的用户动作或产品后果。",
      "evidence": "旁白先重复“Poke 上的消息超过一亿条”，随后直接说“它只代表消息规模”。项目规则要求数据口径留在画面小字，Audience Critic 也把口播数据口径列为硬拒绝。",
      "requestedChange": "删除旁白中的数据口径评述，把“消息数，不是用户数”等边界保留在来源小字；让这一段只增加一个可见的新动作或直接更快回到结尾。",
      "returnTo": "script-writer"
    },
    {
      "id": "feedback-poke-hook-stakes",
      "timeRange": "0:10-0:20",
      "severity": "medium",
      "whyViewerStops": "观众已经看到产品能改日历，但二十秒留下的问题主要是团队为什么收起工作台，仍偏陌生公司的产品沿革，和观众是否愿意使用或信任它的关系不够直接。",
      "evidence": "Hook 结尾问“团队为什么把它收起来，用户又怎么把 Poke 带出了邮箱”，其中用户动作有悬念，但第一问仍是内部方向变化。",
      "requestedChange": "保留团队选择，同时把继续观看的问题落到用户为何愿意把更多日常任务交给这个联系人，避免只追问产品转型。",
      "returnTo": "story-director"
    },
    {
      "id": "feedback-poke-recipe-bridge",
      "timeRange": "1:12-1:25",
      "severity": "low",
      "whyViewerStops": "Recipe 从个人使用直接切到分享，虽能解释功能，却没有先出现一个必须把用法交给别人的具体需求，短暂接近功能目录。",
      "evidence": "上一段停在主动提醒、授权和核对，下一句直接说“一套用法还能交给别人”，缺少前一位用户为什么要分享的动作桥梁。",
      "requestedChange": "用现有 Claim 支持的分享动作把上一位用户与下一位用户连起来，或压缩 Recipe 说明，避免增加无来源的增长因果。",
      "returnTo": "script-writer"
    }
  ],
  "blockers": [
    "1:25-1:38 的旁白“它只代表消息规模”把数据口径审计念给观众，命中 Audience Critic 硬拒绝；该边界应留在画面小字。"
  ],
  "verdict": "REJECT",
  "rewriteRequired": true,
  "returnTo": "script-writer"
}
-->

# Poke v2 Audience Critic Report

评审对象：`story/final-script.md`

结论：**84 / 100，REJECT**

## 评分

| 维度                   |    得分 | 证据与问题                                                                                                                                          |
| ---------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hook                   | 13 / 15 | 第 0 帧已有发送结果与更新后的日历，3～10 秒完成“联系人列表里的 AI”定义。20 秒的问题包含真实用户动作，但仍有一半停在团队为何转型，观众利害不够直接。 |
| Conflict               | 13 / 15 | 抄时间、挪日程、补提醒与“别再学新界面”形成清楚张力，且没有虚构危机。后段没有继续放大这项选择带来的用户后果。                                        |
| Human element          |  8 / 10 | 团队删除工作台、访谈用户拒绝新界面、Beta 用户提出生活请求，均有可观察动作。人物只能保持群体身份，情绪与选择的细节有限。                             |
| Product clarity        | 14 / 15 | 消息入口、主动提醒、授权执行和 Recipe 都能用普通话复述；Recipe 与前一段需求的连接略弱。                                                             |
| Growth logic           | 11 / 15 | 一般开放、Recipe 分享和消息规模被严格分开，没有偷写增长因果，这是优点；但一亿条消息重复两次，后一次没有带来新的采用机制证据。                       |
| Technology explanation | 12 / 15 | 只讲影响体验和权限的消息入口、服务连接与主动动作，没有猜内部模型。多个能力连续出现时仍稍像功能说明。                                                |
| Natural Chinese        | 13 / 15 | 大部分旁白简短自然。“它只代表消息规模”“同一个联系人入口承载了这些往来”转回研究报告口吻。                                                            |

## Hook 检查

- **零背景可懂 8 / 8**：拿掉 Poke 名字，首帧仍是“一句话已经让日历改到三点”的具体结果；产品在 10 秒内被定义为联系人列表里的 AI。
- **继续观看的问题 5 / 7**：用户如何把产品带出邮箱有使用悬念，但“团队为什么收起工作台”更像公司沿革，尚未完全落到观众是否愿意交出更多日常任务。
- 强事实首次出现时均有同期证据计划：功能演示带标签，一亿条消息带 Cognition 来源标签。

## 故事链检查

主链“旧流程要来回搬运 → 用户拒绝新界面 → 团队转向消息入口 → Beta 用户提出更多请求 → 产品主动执行 → Recipe 可分享 → 阶段消息规模”基本成立。它没有把 Recipe 或开放节点写成增长原因，也没有用消息数换算用户、留存或收入。

问题出现在最后 25 秒。Recipe 尚未由一个具体分享需求接住，随后又重复 Hook 已经给过的一亿条消息，并把数据口径直接念进旁白。此时信息推进从产品故事退回研究报告，导致总分未过 85 分，且命中硬拒绝。

## 最小修改清单

1. `script-writer` 删除 `1:25–1:38` 的口播数据口径评述，把必要边界留在画面小字。
2. 该窗口不要再次完整解释 Hook 已给过的消息规模；增加一个有 Claim 支持的用户动作，或缩短后直接回到日历结果。
3. 将“到收购前约三个月”改为不会误读成时间点的统计窗口说法。
4. 若修改 Hook 问题，让它同时保留团队选择和观众为什么愿意把日常任务交给联系人的利害关系。

脚本实质修改后，必须生成新 SHA-256，并重新经过 Oral Judge、Audience Critic；当前版本不得进入 Fact Guardian、TTS 或渲染。
