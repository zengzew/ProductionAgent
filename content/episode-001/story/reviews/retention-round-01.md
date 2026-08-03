<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "ede415f75308a713ce17424ee11a23c757c042ebf4d488931209c8b13d2384f7",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "11fd690607681adb75ee39a5d359be5ac473d4bfda994ef4f497aa7078b6bef4",
  "round": 1,
  "scores": {
    "first3Seconds": 22,
    "first30Seconds": 20,
    "midVideoEngagement": 14,
    "endingSatisfaction": 10
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "medium",
      "prediction": "脚本动作明确，但视觉方案让核心对象从空白中入场，实际首帧可能没有结果。"
    },
    "first30Seconds": {
      "dropOffRisk": "medium",
      "prediction": "规模与成本先建立问题，产品价值很快被负面单位经济框架压住。"
    },
    "midVideo": {
      "dropOffRisk": "high",
      "prediction": "Recipe、公开日期、Apple 渠道、一亿消息和调用链连续出现，后半段像事件清单。"
    },
    "ending": {
      "dropOffRisk": "high",
      "prediction": "开场问为什么越用越贵，结尾没有给出完整产品答案，又用未来信任问题结束。"
    }
  },
  "total": 66,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-payoff",
      "timeRange": "2:43-3:00",
      "severity": "blocker",
      "whyViewerStops": "核心问题没有被具体产品选择完全回答，最后又把观众留在一次假设错误和未来质疑上。",
      "evidence": "结尾最后一句是“你还会不会继续给它发消息”，没有回到团队为何选择联系人入口。",
      "requestedChange": "把全片问题改回有来源支持的产品选择与用户动作，结尾停在同一句消息完成日历动作。",
      "returnTo": "story-director"
    },
    {
      "id": "feedback-retention-repeat",
      "timeRange": "1:33-2:09",
      "severity": "high",
      "whyViewerStops": "Recipe、公开节点、Apple 渠道和一亿消息在短时间连续出现，观众需要记日期，却没有看到新的用户选择。",
      "evidence": "seg-008 与 seg-009 都在说明公开扩张，Apple 节点不能接回核心成本问题。",
      "requestedChange": "删除与核心问题无关的 Apple 节点，压缩公开时间线，让消息规模第二次出现时增加入口含义。",
      "returnTo": "script-writer"
    },
    {
      "id": "feedback-retention-visual-rhythm",
      "timeRange": "0:00-3:00",
      "severity": "high",
      "whyViewerStops": "视觉计划描述了动画，却没有逐段说明观众状态和新增信息，容易用重复白卡片代替故事推进。",
      "evidence": "旧计划没有 Narrative purpose、Viewer state 或 New information 字段；结尾再次使用错误日历。",
      "requestedChange": "为每段定义观众进入与离开状态，首帧直接显示结果，结尾回放完成状态。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [
    "结尾没有兑现核心问题，并以未来信任问题压住产品介绍。",
    "中后段出现高划走风险的公开事件清单。",
    "视觉计划无法证明每个场景都有信息目的。"
  ],
  "verdict": "REJECT",
  "returnTo": "story-director"
}
-->

# Poke Retention Report — Round 01

结论：**66 / 100，REJECT**

## First 3 seconds

旁白动作清楚，但视觉方案允许消息与日历从空白中入场。第一帧没有完成结果时，观众只
看到字幕，首屏承诺落空。

## First 30 seconds

规模和成本冲突足够强，但它把观众带进“为什么难赚钱”，产品价值与用户选择退到后面。

## Mid-video engagement

1:33～2:09 连续解释 Recipe、公开日期、Apple 渠道、一亿消息和调用链。事件很多，
故事问题没有同步推进，预计是最高划走窗口。

## Ending satisfaction

最后停在“你还会不会继续”，没有回答团队为何把产品放进联系人列表，也把正面产品
介绍变成未来质疑。必须退回 Story Director，再经过完整脚本与视觉评审链。
