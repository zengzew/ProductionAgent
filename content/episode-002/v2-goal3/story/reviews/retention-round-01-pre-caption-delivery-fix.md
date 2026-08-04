<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "021b4d4ce74d571a3cbd95e2fa2f142a364c7a359fced1cda92e0072da38dcf8",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "574d1408f54cd43f8b8edbd0bc7a01feda074ff4a63a1c83fd295c47c4008905",
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
      "prediction": "第 0 帧已经给出消息发送、鸟离开起点和三天后到达的改变状态；陌生观众无需认识 Roost 也能理解反常识结果。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "前十秒用自然口语完成鸟速、距离和地图的产品定义，二十秒前给用户行为、阶段数字与唯一问题，二十到三十秒再用一名具体试用作者的感受承接产品价值，继续观看理由成立。"
    },
    "midVideo": {
      "dropOffRisk": "medium",
      "prediction": "三十到九十秒持续增加项目起点、送达机制、用户仪式和阶段数据；九十秒后连续进入商店、订阅、位置与 Pen Pals，最容易短暂变成功能清单。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "三十万注册用户作为阶段结果后退出画面，结尾回到开场同一只鸟继续飞向朋友，兑现了等待可见、回复不必马上发生的承诺。"
    }
  },
  "total": 90,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-roost-retention-hook-density",
      "timeRange": "0:10-0:20",
      "severity": "low",
      "whyViewerStops": "十秒内同时出现伊丽莎白时代英语、一万到十万和核心问题，若三层信息同时上屏，零背景观众会先读数字而错过用户行为。",
      "evidence": "seg-003 的说法更自然，但仍同时承担人类行为、阶段结果和好奇缺口；Visual Plan 已安排纸张卡先出现、数字后半进入，执行仍需保持先后。",
      "requestedChange": "渲染时严格按用户行为、数字、核心问题的顺序出现，每次只保留一个视觉主层级，并让创始人口径标签随数字同期出现。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-roost-retention-repeat-growth",
      "timeRange": "1:04-1:19",
      "severity": "low",
      "whyViewerStops": "伊丽莎白时代英语和一万到十万已在 Hook 出现；若完整用户故事复用相同卡片和数字动效，观众会判断这一段没有新增信息。",
      "evidence": "seg-008 的真实增量是母亲、女儿与朋友的关系以及等待形成通信仪式，Visual Plan 允许先呈现纸张卡、后呈现帖子和数字。",
      "requestedChange": "让人物关系和通信仪式成为这一段的主画面，数字只在结尾短暂回收；不要复用 0:10-0:20 的构图、镜头顺序或数字动效。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-roost-retention-feature-tail",
      "timeRange": "1:29-1:46",
      "severity": "medium",
      "whyViewerStops": "用户故事和增长证据刚完成兑现，商店、订阅、位置与 Pen Pals 在十七秒内连续首次出现，观众可能把后段误判为补功能列表。",
      "evidence": "seg-010 从训练切入轮换商店和支持者订阅，seg-011 紧接城市位置、close friends 与 Pen Pals；它们与主线的连接分别是鸟的选择和距离所需边界。",
      "requestedChange": "用开场同一只鸟作为连续视觉锚点，从选择信使自然过渡到距离权限；订阅与 Pen Pals 各只保留一个可见动作，不增加新卡片、价格细节或解释性字幕。",
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

评审对象：`story/final-script.md` 与 `story/visual-plan.md`  
前置状态：Oral Round 3 PASS、Audience Round 3 92/100 PASS、Fact Round 3 PASS  
元数据补齐前的本轮 PASS：`story/reviews/retention-round-01-preclaims.md`，SHA-256
`c3d004562d7c27afd0170c0b3a74ff878215a27011f89083d0fb29c75db932ad`  
Hook 压缩前的本轮 PASS：`story/reviews/retention-round-01-pre-hook-timing.md`，SHA-256
`36010a6b8af5f9a10d5213eea1f6c0c3c293d8174e5fd3c1daf3909ebeca9318`  
自然中文改写前的本轮 PASS：`story/reviews/retention-round-01-pre-natural-chinese.md`，SHA-256
`c723b48b4e6aa3e42b5057cf6e7092a17238922b9f7a4fbee889be895804d71c`
结论：**90 / 100，PASS**

这是 Episode 002 v2 的第一轮创意 Retention Critic。当前复核只改变自然中文说法和句间
节奏；故事问题、结构、视觉意图与揭示顺序没有改变，因此不计作新的创意修订轮次，也没有
把既有 PASS 伪装成上一轮 REJECT。
`resolvedFeedback` 仍为空，原有三项非 blocker 风险继续保留。

## First 3 seconds

- Score: **24 / 25**
- Drop-off risk: **low**
- Prediction: 第 0 帧同时显示消息已发送、鸟已经离开起点和三天倒计时。观众即使从未听过
  Roost，也能在一句旁白内看懂“已经出发，却要三天后才到”的结果。
- Evidence: seg-001 不以产品名或公司名起头；功能演示标签常驻，鸟从已有位置继续移动，
  首帧不是动作开端或悬空标题。
- Judgment: Hook 靠具体状态与动作成立，不依赖夸张措辞。扣 1 分是因为三天倒计时、已发送
  状态和功能演示标签必须在竖屏第一帧同时可读，实际可读性仍要由渲染验证。

## First 30 seconds

- Score: **23 / 25**
- Drop-off risk: **low**
- Prediction: 3～10 秒用“鸟的速度”“地图上看到飞到哪儿”完成心智模型；10～20 秒给
  伊丽莎白时代英语、阶段数字和唯一问题；20～30 秒再用一名具体作者的试用感受承接即时
  回复压力。观众知道产品是什么，也知道继续看是在等“为什么等待会有价值”。
- Evidence: App Store 真实页、功能演示、用户故事、创始人口径和独立体验身份均有同期视觉
  计划。没有先讲公司历史，也没有把统计口径当 Hook 门槛。
- Risk control: 0:10～0:20 是本窗口唯一密度风险。Visual Plan 已规定纸张卡先出现、数字后半
  进入；渲染必须保留该顺序，不能让三层信息同屏争抢。

## Mid-video engagement

- Score: **20 / 25**
- Drop-off risk: **medium**
- Prediction: 0:30～1:29 基本每 10～15 秒增加新动作或证据：朋友推动公开、鸟速与距离、
  收集训练、母亲帖子和分口径增长数据。1:29～1:46 连续引入商业与权限信息，是全片最可能
  的划走窗口。
- Evidence: 0:30 的卡片传递、0:41 的连续 FlightMap、0:53 的短暂停顿、1:04 的人物故事和
  1:19 的三张数据卡形成清楚节奏变化；但 seg-010、011 在十七秒内首次出现商店、订阅、
  close friends 与 Pen Pals。
- Judgment: 中段没有 20～40 秒不推进的空档，也没有技术说明书段落。扣分来自 Hook 信息在
  1:04 的重复误读风险，以及尾段功能密度。两项都可由当前 Visual Plan 的层级与连续视觉
  锚点控制，不要求改写已通过事实门的脚本。

## Ending satisfaction

- Score: **23 / 25**
- Drop-off risk: **low**
- Prediction: 1:46 后先给 7 月 10 日三十万注册用户，再让数据退出，最后回到开场那只
  鸟继续飞向朋友。重复画面因中段的创始人选择、用户仪式和阶段结果获得了新含义。
- Evidence: 结尾明确保留 ANSA 日期与注册口径，不把注册用户写成留存、盈利或赛道规模；
  最后一句是具体产品动作，没有问题、升华或互动 CTA。
- Judgment: “改变消息送达时的感觉”比旧稿的“送达感”更自然，结尾仍停在正面可验证
  状态。最终满意度仍依赖数据卡及时退场并给飞鸟留出完整四秒。

## Most likely exit point

最可能的划走窗口是 **1:29～1:46**。它不是事实或结构 blocker，但如果商店、订阅、位置、
close friends 和 Pen Pals 各自做成一张说明卡，前面建立的人物故事会突然变成产品目录。
责任角色是 `visual-director`：沿用同一只鸟完成选择与距离权限的连续动作，不增加新信息。

## Lineage check

- Oral Round 1 的语言名称与“鸟舍”问题，已在 Round 2 口播中修复。
- Fact Round 2 的剩余时间 UI、timeline、story lineage 与 visualIntent 冲突，已在 Round 3
  由实际哈希变化关闭。
- 当前 Canonical Oral、Audience、Fact 均绑定 final SHA-256
  `021b4d4ce74d571a3cbd95e2fa2f142a364c7a359fced1cda92e0072da38dcf8`。
- 当前 Retention gate 绑定 Visual Plan SHA-256
  `574d1408f54cd43f8b8edbd0bc7a01feda074ff4a63a1c83fd295c47c4008905`。
- Visual Plan 的 `reviewedSha256` 已绑定当前 Final Script；口播改写没有改变其场景、动作或
  Claim 计划。

## Caption plan observation

Caption Plan SHA-256 为 `7d01e95f3ed5684f79ec5df33fe1c150b9e5542ab12b1662694b7d08ecf1ebe7`，
文本完整重组后与旁白一致。seg-011 仍把“只有你选中的 close friends 才能看到精确位置”
拆成相邻 cues；这不改变脚本与视觉方案的 Retention PASS，但 captions 阶段应按项目语义单元
规则合并，并在真实 TTS 后重新对齐。

Retention PASS 只表示当前脚本与视觉计划在四个预测窗口达到门槛。真实 TTS、字幕、竖屏
可读性和 MP4 留存代理仍需后续制作与 Delivery Critic 验证。
