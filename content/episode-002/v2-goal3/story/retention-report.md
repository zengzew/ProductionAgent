<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "b583b5e45b12e370775e065cd8c17255752fe8a7c1ac9a92b53e7cc1d5d7bbac",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "1cb4a3eaae9b16acc4657af71db3fb8f3bf7863be1f70dc0a1dcd8511126776f",
  "round": 1,
  "scores": {
    "first3Seconds": 24,
    "first30Seconds": 22,
    "midVideoEngagement": 19,
    "endingSatisfaction": 22
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "第 0 帧已经给出消息发送、鸟离开起点和三天后到达的改变状态；陌生观众无需认识 Roost 也能理解反常识结果。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "真实 TTS 在 9.144 秒前完成鸟速、距离和地图的产品定义，在 17.868 秒前给用户行为、阶段数字与唯一问题，随后于 29.976 秒前补人的回复压力和单一体验，继续观看理由成立。"
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
  "total": 87,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-roost-retention-hook-density",
      "timeRange": "0:09-0:18",
      "severity": "low",
      "whyViewerStops": "约九秒内同时出现伊丽莎白时代英语、一万到十万和核心问题，若三层信息同时上屏，零背景观众会先读数字而错过用户行为。",
      "evidence": "seg-003 的真实 TTS 为 8.544 秒，同时承担人类行为、阶段结果和好奇缺口；Visual Plan 已安排纸张卡先出现、数字后半进入，但执行仍需保持先后。",
      "requestedChange": "渲染时严格按用户行为、数字、核心问题的顺序出现，每次只保留一个视觉主层级，并让创始人口径标签随数字同期出现。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-roost-retention-repeat-growth",
      "timeRange": "1:04-1:22",
      "severity": "low",
      "whyViewerStops": "伊丽莎白时代英语和一万到十万已在 Hook 出现；若完整用户故事复用相同卡片和数字动效，观众会判断这一段没有新增信息。",
      "evidence": "seg-008 的真实增量是母亲、女儿与朋友的关系以及等待形成通信仪式，Visual Plan 允许先呈现纸张卡、后呈现帖子和数字。",
      "requestedChange": "让人物关系和通信仪式成为这一段的主画面，数字只在结尾短暂回收；不要复用 0:10-0:20 的构图、镜头顺序或数字动效。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-roost-retention-feature-tail",
      "timeRange": "1:30-1:52",
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
结论：**87 / 100，PASS**

这是 Episode 002 v2 的第一轮创意 Retention Critic。当前复核只补齐 Final Script 与
Visual Plan 的段落级 Claim 聚合，并收短 seg-002、003 以适配真实 TTS Hook；故事问题、
视觉意图和揭示顺序没有改变，因此不计作新的创意修订轮次，也没有把既有 PASS 伪装成
上一轮 REJECT。
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

- Score: **22 / 25**
- Drop-off risk: **low**
- Prediction: 真实 TTS 在 9.144 秒前完成“虚拟鸟按距离和鸟速送信、地图显示位置”的心智
  模型，在 17.868 秒前给伊丽莎白时代英语用户行为、阶段数字和唯一问题，再于 29.976 秒前
  把问题接回即时回复压力和单一体验者感受。观众知道产品是什么，也知道继续看是在等
  “为什么等待会有价值”。
- Evidence: App Store 真实页、功能演示、用户故事、创始人口径和独立体验身份均有同期视觉
  计划。没有先讲公司历史，也没有把统计口径当 Hook 门槛。
- Risk control: 0:09～0:18 是本窗口唯一密度风险。Visual Plan 已规定纸张卡先出现、数字后半
  进入；渲染必须保留该顺序，不能让三层信息同屏争抢。

## Mid-video engagement

- Score: **19 / 25**
- Drop-off risk: **medium**
- Prediction: 0:30～1:30 基本每 10～18 秒增加新动作或证据：朋友推动公开、鸟速与距离、
  收集训练、母亲帖子和分口径增长数据。1:30～1:52 连续引入商业与权限信息，是全片最可能
  的划走窗口。
- Evidence: 0:30 的卡片传递、0:41 的连续 FlightMap、0:53 的短暂停顿、1:04 的人物故事和
  1:19 的三张数据卡形成清楚节奏变化；但 seg-010、011 在十七秒内首次出现商店、订阅、
  close friends 与 Pen Pals。
- Judgment: 中段没有 20～40 秒不推进的空档，也没有技术说明书段落。扣分来自 Hook 信息在
  1:04 的重复误读风险，以及尾段功能密度。两项都可由当前 Visual Plan 的层级与连续视觉
  锚点控制，不要求改写已通过事实门的脚本。

## Ending satisfaction

- Score: **22 / 25**
- Drop-off risk: **low**
- Prediction: 1:52 后先给 7 月 10 日三十万注册用户，再让数据退出，最后回到开场那只
  鸟继续飞向朋友。重复画面因中段的创始人选择、用户仪式和阶段结果获得了新含义。
- Evidence: 结尾明确保留 ANSA 日期与注册口径，不把注册用户写成留存、盈利或赛道规模；
  最后一句是具体产品动作，没有问题、升华或互动 CTA。
- Judgment: 结尾兑现“等待如何成为可见体验”，并停在正面可验证状态。扣分来自“改变一条
  消息的送达感”略抽象，最终满意度依赖数据卡及时退场并给飞鸟留出完整四秒。

## Most likely exit point

最可能的划走窗口是 **1:30～1:52**。它不是事实或结构 blocker，但如果商店、订阅、位置、
close friends 和 Pen Pals 各自做成一张说明卡，前面建立的人物故事会突然变成产品目录。
责任角色是 `visual-director`：沿用同一只鸟完成选择与距离权限的连续动作，不增加新信息。

## Lineage check

- Oral Round 1 的语言名称与“鸟舍”问题，已在 Round 2 口播中修复。
- Fact Round 2 的剩余时间 UI、timeline、story lineage 与 visualIntent 冲突，已在 Round 3
  由实际哈希变化关闭。
- 当前 Canonical Oral、Audience、Fact 均绑定 final SHA-256
  `b583b5e45b12e370775e065cd8c17255752fe8a7c1ac9a92b53e7cc1d5d7bbac`。
- 当前 Retention gate 绑定 Visual Plan SHA-256
  `1cb4a3eaae9b16acc4657af71db3fb8f3bf7863be1f70dc0a1dcd8511126776f`。
- Visual Plan 内容未随 Hook 压缩改变；其 `visual-plan-gate.reviewedSha256` 已机械重绑到
  当前 Final Script，不改变本次独立留存判断。

## Caption plan observation

Caption Plan SHA-256 为 `0ea5543751b94f142a8afec28f0cd49ee10980781b72350b076d5121a98ed495`，
文本完整重组后与旁白一致。独立评审指出的“Roost 让虚拟鸟按 / 距离和鸟速”跨 cue 断点已
改为同一 cue 内换行；字幕仍需重新生成，并由 Delivery Critic 读回最终 SRT。

Retention PASS 只表示当前脚本与视觉计划在四个预测窗口达到门槛。真实 TTS、字幕、竖屏
可读性和 MP4 留存代理仍需后续制作与 Delivery Critic 验证。
