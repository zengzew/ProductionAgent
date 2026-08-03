<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "b86c56c74ba0a616ed1eb87631a1411cd6d07d20adae7c8c044ed4072a60e620",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "d95f645318ace0c3edcac7b1f27c4ee03de7023cf406ddfea0736a09fc5c7658",
  "round": 2,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 23,
    "midVideoEngagement": 22,
    "endingSatisfaction": 24
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "第 0 帧直接给出已发送消息与已更新日历，动作和结果无需产品背景。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "动作、规模、产品定义和团队选择问题在二十秒内连续成立。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "持续运行仍是最抽象的一段，但用户消息、邮件和航班状态保持同屏动作。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "工作台、Beta 请求和消息规模依次回收，最后停在同一个完成后的日历状态。"
    }
  },
  "total": 93,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-tech-window",
      "timeRange": "1:48-2:01",
      "severity": "low",
      "whyViewerStops": "持续运行仍是全片最接近技术解释的窗口。",
      "evidence": "这一段不再承担结尾，但如果状态卡停止变化，仍可能像说明书。",
      "requestedChange": "渲染时保持一条用户消息和两个实时状态持续变化。",
      "returnTo": "visual-director"
    }
  ],
  "previousReview": {
    "reportFile": "content/episode-001/story/reviews/retention-round-01.md",
    "reportSha256": "d2f3511b66261b766cfb843c7f8e16540749033e86a63e0f3cdee5be2e4c29c1"
  },
  "resolvedFeedback": [
    {
      "feedbackId": "feedback-retention-payoff",
      "owner": "story-director",
      "change": "核心问题从成本与未来质疑改为团队入口选择和 Beta 用户动作，结尾改成完成后的日历状态。",
      "artifacts": [
        {
          "beforeFile": "output/episode-001/iterations/publish-v2-2026-07-30/final-script.md",
          "beforeSha256": "ede415f75308a713ce17424ee11a23c757c042ebf4d488931209c8b13d2384f7",
          "afterFile": "content/episode-001/story/final-script.md",
          "afterSha256": "b86c56c74ba0a616ed1eb87631a1411cd6d07d20adae7c8c044ed4072a60e620"
        }
      ]
    },
    {
      "feedbackId": "feedback-retention-repeat",
      "owner": "script-writer",
      "change": "删除 Apple 节点和重复编年，把消息规模第二次出现改为解释联系人入口。",
      "artifacts": [
        {
          "beforeFile": "output/episode-001/iterations/publish-v2-2026-07-30/final-script.md",
          "beforeSha256": "ede415f75308a713ce17424ee11a23c757c042ebf4d488931209c8b13d2384f7",
          "afterFile": "content/episode-001/story/final-script.md",
          "afterSha256": "b86c56c74ba0a616ed1eb87631a1411cd6d07d20adae7c8c044ed4072a60e620"
        }
      ]
    },
    {
      "feedbackId": "feedback-retention-visual-rhythm",
      "owner": "visual-director",
      "change": "每段新增叙事目的、观众状态、新信息和渲染目标；首帧与结尾都改为完成状态。",
      "artifacts": [
        {
          "beforeFile": "content/episode-001/story/reviews/retention-round-01-visual-snapshot.md",
          "beforeSha256": "f073561ef6cd14b5fedfe52ebad656ee2f4cbdfafca176f967314351b6d2bfce",
          "afterFile": "content/episode-001/story/visual-plan.md",
          "afterSha256": "d95f645318ace0c3edcac7b1f27c4ee03de7023cf406ddfea0736a09fc5c7658"
        }
      ]
    }
  ],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke Retention Report — Round 02

结论：**93 / 100，PASS**

## First 3 seconds

第 0 帧已经显示消息发出和日历更新，随后只做确认动效。观众不需要认识 Poke，也不必
等动画结束才知道发生了什么。

## First 30 seconds

动作、规模、产品定义和唯一问题形成连续递进。二十秒后立即进入邮件、日历和待办的
具体麻烦，没有先讲公司历史。

## Mid-video engagement

旧版 1:33～2:09 的公开事件清单已被压缩。Recipe 用真实 Release Notes 形成一次硬切，
一亿消息第二次出现时增加联系人入口含义。持续运行是唯一 medium 风险窗口，已指定
同屏状态变化。

## Ending satisfaction

工作台退场、Beta 请求和消息规模依次回收，最后回到开场的已更新日历。结尾回答团队
做了什么选择、用户接着做了什么，不追加风险问题、未来质疑或 CTA。

## Revision routing closed

Round 01 的三个 blocker 已分别退回 Story Director、Script Writer 和 Visual Director。
最终稿变更后重新经过 Oral Judge、Audience Critic、Fact Guardian、Visual Director
和本轮 Retention Critic。
