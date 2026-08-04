<!-- critic-gate
{
  "rubricVersion": "product-story-v4",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff",
  "round": 3,
  "scores": {
    "hook": 15,
    "conflict": 13,
    "humanElement": 8,
    "productClarity": 14,
    "growthLogic": 13,
    "technologyExplanation": 12,
    "naturalChinese": 15
  },
  "hookBreakdown": {
    "zeroBackgroundComprehension": 8,
    "continuationQuestion": 7
  },
  "total": 90,
  "threshold": 85,
  "viewerExitRisks": [
    {
      "id": "feedback-poke-recipe-bridge",
      "timeRange": "1:12-1:25",
      "severity": "low",
      "whyViewerStops": "Recipe 从个人使用直接切到分享，虽然现在说法更自然，仍没有先出现一个必须把用法交给别人的具体需求，存在短暂功能说明感。",
      "evidence": "上一段停在主动提醒、授权和核对，下一段直接说‘一套用法也能发给别人’；视觉计划用联系人之间的链接传递保持动作连续。",
      "requestedChange": "渲染时保留联系人之间连续传递 Recipe 链接的动作，避免做成功能卡或增长曲线；不要为补桥新增无来源动机。",
      "returnTo": "visual-director"
    }
  ],
  "blockers": [
    "seg-009 的‘Recipe 也在同一天向所有人开放’超出 claim-poke-004 明确支持的‘同步推出 Poke Recipes’，违反事实优先规则。"
  ],
  "verdict": "REJECT",
  "rewriteRequired": true,
  "returnTo": "oral-rewriter"
}
-->

# Poke v2 Audience Critic Report · Natural Chinese Rebind

评审对象：`story/final-script.md`、`story/caption-plan.json` 与 `story/visual-plan.md`

结论：**90 / 100，但因事实 blocker 判定 REJECT**

## Rebind lineage

改写前 canonical 报告已原样归档到 `story/reviews/audience-round-03-pre-natural-chinese.md`，归档 SHA-256 为 `fd8e3e427d0bda857ceb0621f3b9bf563330fd68b903026dc9104240f668e9b5`。当前定稿、字幕规划和视觉方案 SHA-256 分别为 `ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff`、`f608df5f24b9b2e3e002ec7703ea7f36ec8c36397b4f63f2179839f9be0dcb14` 与 `13df944b762fb16abbebeb09ae5a8c632da4b8c0649a64494bcadee4356e6f5a`。

故事的 Section、时间范围、信息揭示顺序、Claim IDs、Scene 和结尾回收没有变化。自然中文改写让陌生观众更容易跟住动作，质量分达到门槛；但事实优先于分数，`seg-009` 的范围扩张使当前版本不能批准。

## 评分

| 维度                   |    得分 | 证据与问题                                                                                             |
| ---------------------- | ------: | ------------------------------------------------------------------------------------------------------ |
| Hook                   | 15 / 15 | 首帧先给日历结果，10 秒建立联系人 AI 心智模型，20 秒提出用户为何愿意交出更多日常小事。                 |
| Conflict               | 13 / 15 | 邮件改期的重复搬运，对上用户不想学习新界面；冲突来自真实使用动作，没有被写成危机。                     |
| Human element          |  8 / 10 | “用户说得很直接”“内测用户”比研究标签更接近人，但来源仍不足以支持具体人物个案。                         |
| Product clarity        | 14 / 15 | 联系人入口、主动提醒、授权执行、Recipe 分享和取消候补都能被复述。                                      |
| Growth logic           | 13 / 15 | 一亿消息、Recipe 与公开节点没有被写成增长因果；`seg-009` 的开放对象范围需要按 Fact Guardian 意见收回。 |
| Technology explanation | 12 / 15 | 只解释用户能看到的入口、连接和授权，没有猜内部实现。                                                   |
| Natural Chinese        | 15 / 15 | 研究档案词、英文阶段词和重复主语被自然动作取代，句间有真实对象感，且没有伪口语口头禅。                 |

## 指定表达的观众效果

- “用户说得很直接”保留了人的声音，去掉“访谈里”这个研究过程标签。
- “内测用户”比 Beta 用户更快建立身份，不改变时间范围。
- Recipe 授权改成朋友先看配置、需要连接账户时本人再确认，动作顺序清楚。
- “不用再排候补”比“一般可用状态”更能说明这一天对观众意味着什么。
- `seg-009` 仍位于原来的公开节点，没有变成年表或新增支线；“向所有人”是事实范围问题，不是故事结构变化。

## Blocker

高于 85 分不能覆盖 unsupported claim。`claim-poke-004` 只支持同日推出 Recipes，没有单独支持“Recipes 向所有人开放”。Audience Critic 退回 oral-rewriter 修正这一句的范围；不要求重写故事、Hook 或其他自然中文段落。
