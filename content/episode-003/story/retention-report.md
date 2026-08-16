<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "be058fc23f45374cb53666204cd081ac2f45f6508fccb565eb1bb7588feaa06e",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "64e6e38c685154d7c83cc17d5017be812d6c10f0bbb5c9cfc6988618fe7f1e28",
  "round": 1,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 23,
    "midVideoEngagement": 21,
    "endingSatisfaction": 24
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "第 0 帧直接给出已发送任务与已打开网页，动作和结果无需产品背景。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "动作、规模、云电脑定义和团队选择问题在二十秒内连续成立。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "云电脑内部件如果做成静态卡片会掉速，但浏览器、文件和命令行保持同屏动作。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "数百万用户收回到同一条仍在打开网页的任务，开场动作获得新含义。"
    }
  },
  "total": 92,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-retention-sandbox-motion",
      "timeRange": "0:20-0:34",
      "severity": "low",
      "whyViewerStops": "执行引擎段如果只剩三张功能标签，会短暂像说明书。",
      "evidence": "这一窗口要把选择落到云电脑内部运动，前后都是具体动作。",
      "requestedChange": "渲染时保留浏览器滚动、文件落下和命令行光标。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Manus Retention Critic Report

评审对象：`story/final-script.md` 与 `story/visual-plan.md`
结论：**92 / 100，PASS**

## First 3 seconds

第 0 帧同时给出已发送任务和已打开网页，三秒只说一个完成结果。划走风险低。

## First 30 seconds

规模、云电脑和“为什么要自己干活”在二十秒内接上。三十秒前已经进入团队选择。划走风险低。

## Mid-video engagement

中段解释隔离云电脑和桌面批准。桌面真实页面能拉回注意力；云电脑内部必须保持运动。风险中等，但未到 high。

## Ending satisfaction

结尾先给出数百万用户的公司口径，再回到开场同一条还在执行的任务。没有 CTA，也没有未来质疑。

本报告只批准进入生产。真实成片仍需 Delivery Critic。
