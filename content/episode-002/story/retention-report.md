<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "493e0866a5759009876654a93c53e676442d8a2b1fd8765317ea74eb5bc561cd",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "42a2642e12108ccefe532723b1b246e1a83f4bc020f38dafceff3084285212fb",
  "round": 1,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 23,
    "midVideoEngagement": 22,
    "endingSatisfaction": 23
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "消息已经发出却要三天后到达，结果明确且反常识。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "真实页面迅速解释送达规则，产品定义与期待问题在二十秒内成立。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "机制和等待体验连续展开，需要用地图长镜头、短暂静音和纸张消息卡维持变化。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "数据回答阶段性接受度，最后回到同一只飞向朋友的鸟，开场承诺得到兑现。"
    }
  },
  "total": 92,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-roost-map-window",
      "timeRange": "0:56-1:32",
      "severity": "medium",
      "whyViewerStops": "连续机制解释可能让等待变成功能列表。",
      "evidence": "鸟速、地图、鸟舍和小游戏集中在同一窗口。",
      "requestedChange": "渲染保留地图长镜头、用户离开手机和短暂静音。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Roost Social Retention Report

评审对象：`story/final-script.md` 与 `story/visual-plan.md`

结论：**92 / 100，PASS**

## First 3 seconds

划走风险：**low**。第一帧已经显示消息发出、鸟离开和三天倒计时。动作不依赖产品名，
“已经发出却还要等三天”自然形成反常识结果。功能演示标签不会遮挡核心动作。

## First 30 seconds

划走风险：**low**。3～10 秒用真实 App Store 页面纠正网络故障误解，10～20 秒完成
慢速通讯 App 的心智模型、阶段性增长和唯一问题。20 秒后画面主动放慢，让观众真正
感到等待，信息节奏与产品体验一致。

## Mid-video engagement

划走风险：**medium**。56～92 秒连续解释鸟速、地图、鸟舍和等待体验，是最可能被
误剪成功能说明的窗口。视觉方案用一段完整地图解释、用户离开手机、短暂静音和纸张
消息卡形成三个明显变化。92 秒后真实使用故事与增长证据重新抬高信息密度。

## Ending satisfaction

划走风险：**low**。位置权限增加一个新的产品选择，结尾再用注册用户和活跃对话回答
“是否有人愿意尝试”。最后不追加 CTA，也不质疑未来，而是回到开场仍在飞向朋友的
同一只鸟，满足结果、机制、接受度和回看四层兑现。

## Highest-risk window

56～92 秒。制作阶段必须保留地图长镜头、用户离开手机和短暂静音；如果压成连续的
功能卡，预计中段留存会明显下降，应退回 Visual Director。
