<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c986e3c8f4fdc7d0bdf5436f0b62563e34622697960670c08a27daf138709648",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "b9ec7338208e7f0a3d6e2aa65f868f83d9ea016cc7da9b223270677ebab8fcef",
  "round": 1,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 23,
    "midVideoEngagement": 20,
    "endingSatisfaction": 23
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "第 0 帧给出消息已发送、鸟离开起点和三天后到达；零背景观众无需认识 Roost 也能理解反常识结果。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "前十秒完成距离、鸟速和地图的产品定义，二十秒前给用户行为、阶段数字与唯一问题，随后由同一名试用作者的感受承接产品价值。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "三十到九十秒持续增加项目起点、送达机制、用户仪式和阶段数据；九十秒后连续进入商店、订阅、位置和 Pen Pals，最容易短暂变成功能清单。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "三十万注册用户作为阶段结果后退出，结尾回到开场同一只鸟继续飞向朋友，兑现等待可见的承诺。"
    }
  },
  "total": 90,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-roost-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "low",
      "whyViewerStops": "十秒内同时出现伊丽莎白时代英语、一万到十万和核心问题；若三层信息同时上屏，观众可能先读数字而错过用户行为。",
      "evidence": "seg-003 同时承担人类行为、阶段结果和好奇缺口；visual plan 已规定纸张卡先出现、数字后半进入。",
      "requestedChange": "渲染时严格按用户行为、数字、核心问题的顺序出现，每次只保留一个视觉主层级。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-roost-retention-repeat-growth",
      "timeRange": "1:04-1:19",
      "severity": "low",
      "whyViewerStops": "伊丽莎白时代英语和一万到十万已在 Hook 出现，若完整用户故事复用相同构图，观众会判断没有新增信息。",
      "evidence": "seg-008 的增量是母亲、女儿与朋友的关系以及通信仪式；visual plan 允许人物先出现、数字最后回收。",
      "requestedChange": "让人物关系与通信仪式成为主画面，数字只在段末短暂出现，不复用 Hook 动效。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-roost-retention-feature-tail",
      "timeRange": "1:29-1:46",
      "severity": "medium",
      "whyViewerStops": "商店、订阅、位置、亲密好友与 Pen Pals 连续首次出现，观众可能把故事误判为功能目录。",
      "evidence": "seg-010 与 seg-011 的作用分别是鸟的选择方式和距离所需权限；visual plan 已用同一只鸟作为连续锚点。",
      "requestedChange": "沿用同一只鸟从选择进入距离权限，订阅与 Pen Pals 各只保留一个可见动作，不增加说明卡。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Roost v2 Retention Critic Report

评审对象：当前 `story/final-script.md` 与 `story/visual-plan.md`。前置 Oral 5/5/5 PASS、Audience 93/100 PASS、Fact PASS。上一份 canonical PASS 已原样归档为 `story/reviews/retention-round-01-pre-caption-delivery-fix.md`，SHA-256 `d6199a2194d5553e87a35f66b17097ceebcaee77a82b80df848ec2af304000e3`。

结论：**90 / 100，PASS**。故事结构和视觉揭示顺序未改变，因此仍记录为第一轮创意 Retention Critic；这次只复核口语拆句与字幕语义修复。

## First 3 seconds

- Score: **24 / 25**
- Drop-off risk: **low**
- 第 0 帧显示消息已发送、鸟已离开起点和三天后到达。开场不依赖产品名或夸张措辞；实际竖屏可读性仍由 Delivery 复核。

## First 30 seconds

- Score: **23 / 25**
- Drop-off risk: **low**
- 3～10 秒完成产品心智模型；10～20 秒给伊丽莎白时代英语、阶段数字和唯一问题；20～30 秒用“有位作者”限定单一体验，再用自然短句解释等待价值。继续观看理由成立。

## Mid-video engagement

- Score: **20 / 25**
- Drop-off risk: **medium**
- 0:30～1:29 每 10～15 秒增加朋友推动公开、鸟速与距离、收集训练、母亲帖子或分口径数据。拆句提高了口播可跟随性，但 1:29～1:46 的商店、订阅、位置与 Pen Pals 仍是最可能划走窗口。

## Ending satisfaction

- Score: **23 / 25**
- Drop-off risk: **low**
- 结尾先给 7 月 10 日三十万注册用户，再让数据退出并回到开场那只鸟。地图、鸟与等待拆成独立短句后更容易听清，最后仍停在可验证动作。

## 字幕规划复核

当前 caption plan SHA-256 为 `217e0bb8ff4cf6701742c91032d55c47abaebaa3bc428c9bdbbe84ea1635e875`。此前 Delivery 指出的两类语义问题已在规划层修复：

- “只有你选中的亲密好友 / 才能看到精确位置”现在位于同一 cue 的两行内，权限主语、对象与谓语同时可见。
- “到 7 月 10 日 / 注册用户到了三十万”与“开头那只鸟 / 还在地图上朝朋友飞”分别保留完整句界，没有把上一句结尾和下一句主语合并。

这只证明当前脚本、caption plan 和 visual plan 的规划边界改善；真实 TTS、SRT 与新 MP4 仍需 Delivery Critic 另行验证。

## 最可能划走位置

最可能的窗口仍是 **1:29～1:46**。它不是事实或结构 blocker，但若把商店、订阅、位置、亲密好友和 Pen Pals 分别做成说明卡，人物故事会突然变成产品目录。责任角色仍是 `visual-director`，按现有 visual plan 沿用同一只鸟，不新增信息。
