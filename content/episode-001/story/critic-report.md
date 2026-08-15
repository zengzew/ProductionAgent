<!-- critic-gate
{
  "rubricVersion": "product-story-v4",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "d56ce759e7e0ebb6a21fe1e49fd8ddbe3af715bf7e836a5825572f23af2a5b28",
  "round": 1,
  "scores": {
    "hook": 15,
    "conflict": 14,
    "humanElement": 9,
    "productClarity": 15,
    "growthLogic": 14,
    "technologyExplanation": 13,
    "naturalChinese": 15
  },
  "hookBreakdown": {
    "zeroBackgroundComprehension": 8,
    "continuationQuestion": 7
  },
  "total": 95,
  "threshold": 85,
  "viewerExitRisks": [
    {
      "id": "feedback-audience-cost-window",
      "timeRange": "1:48-2:01",
      "severity": "low",
      "whyViewerStops": "持续运行的解释如果变成静态架构图，会短暂脱离用户动作。",
      "evidence": "这一段是全片唯一连续技术说明，前后都是具体产品状态。",
      "requestedChange": "保留一条用户消息，让邮件与航班状态在同屏持续变化。",
      "returnTo": "visual-director"
    }
  ],
  "blockers": [],
  "verdict": "PASS",
  "rewriteRequired": false,
  "returnTo": "none"
}
-->

# Poke Audience Critic Report

结论：**95 / 100，PASS**

## Hook

第 0 帧计划展示已发送消息与已更新日历。十秒内出现一亿多条消息，二十秒内完成产品
定义，并留下团队选择与内测用户动作的唯一问题。

## Viewer exit diagnosis

最可能的轻微划走点是 0:34～0:48。旁白从团队选择切到 Recipe，如果画面只列设置字段，
会像产品说明。Visual Director 必须让联系人、链接传递和真实 Release Notes 连续出现；
这条风险不阻断脚本。

## 评分摘要

故事从完成动作进入规模，再回答联系人入口的能力、团队选择、内测用户用途和 Recipe。
消息规模承接同一入口，没有形成孤立功能目录。结尾用已更新日历兑现开场，产品价值位于
风险之前，也位于结尾。

## 硬拒绝检查

- 开场不依赖产品名，核心动作在第 0 帧成立。
- 强事实都有同期证据计划。
- 一亿消息不换算用户、留存或采用原因。
- 成本与收购之间不写因果。
- 结尾不质疑未来，不使用互动 CTA。
