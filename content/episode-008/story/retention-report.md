<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "59b6e8fe0b52f7a245b82fc26f64123dd58070405c6424fdb83eb9aa2c80e9c3",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "67246b65e612d80e29f3e1bf1dd00f21af29062fb126703bedfe19b408a17978",
  "round": 1,
  "scores": {
    "first3Seconds": 21,
    "first30Seconds": 21,
    "midVideoEngagement": 20,
    "endingSatisfaction": 20
  },
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "low",
      "prediction": "seg-001 首帧已有记录，约 1 秒刷新、2 秒恢复同条目，可以与旁白同步证明保存。零背景观众仍需辨认英文 UI 中同一行，主要风险是记录裁切和停留可读性。"
    },
    "first30Seconds": {
      "dropOffRisk": "low",
      "prediction": "seg-002 用真实输入与发送建立聊天做应用的模型，实际使用的问题在 13 秒前出现；seg-004 在 20–30 秒给登录、保存和数据库对应行。中间 7 秒人物照片暂时打断操作连续性，但带来原型和需求的新信息。"
    },
    "midVideo": {
      "dropOffRisk": "low",
      "prediction": "20–30 秒从页面转向数据库，30–44 秒转向三个有来源的触达渠道，证据形态和信息职责均变化。三个英文原文焦点在 14 秒内出现，若中文摘意与原文同时过密，可能使不熟悉平台的人失去兴趣。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "实际使用的问题已经由登录和数据库记录回答，结尾用有日期、公司口径的一亿美元 ARR 给商业结果。11 秒主要解释同一数字，最后几秒新信息较少，但日期、指标和来源使结果可理解，没有未来质疑或泛化 CTA。"
    }
  },
  "total": 82,
  "threshold": 80,
  "viewerExitRisks": [
    {
      "id": "feedback-lovable-retention-001",
      "timeRange": "0:00-0:03 / seg-001",
      "severity": "low",
      "whyViewerStops": "观众若未能认出刷新前后是同一条心情记录，会只看到普通列表和短白帧，无法感知结果。",
      "evidence": "visual-plan seg-001 已指定 save local16–20、分数10与备注同一行、无首帧淡入及约2秒记录恢复；源片可行性由原片读回与Fact Guardian支撑，当前尚非竖屏成片读回。",
      "requestedChange": "执行既有焦点裁切时始终保留分数和备注的对应关系，首帧显示记录并在前三秒完成刷新回读；成片按手机尺寸核验，若看不清则调整该裁切及停留。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-lovable-retention-002",
      "timeRange": "0:13-0:20 / seg-003",
      "severity": "low",
      "whyViewerStops": "观众正在等待应用实际可用的答案，7秒静态人物段可能短暂削弱继续看操作的动力。",
      "evidence": "脚本此段仍讲编程门槛和周末原型；visual-plan 按0秒照片、2.5秒需求、5秒原型逐层呈现，20秒回到实际登录操作。",
      "requestedChange": "保持现有7秒上限和每层新增信息，TTS对齐时避免照片尾部空等，按既定顺序迅速回到seg-004登录动作。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-lovable-retention-003",
      "timeRange": "0:30-0:44 / seg-005",
      "severity": "low",
      "whyViewerStops": "较长英文原文与中文旁白同时进入，可能让渠道证据变成阅读负担。",
      "evidence": "visual-plan已明确Product Hunt、X、Supabase真实复盘裁切，0/6/9秒切换不同动作，12秒并列收束；具体渠道已落实，风险剩在渲染时的可读性而非事实缺口。",
      "requestedChange": "按现有方案只保留渠道名及对应动作的短原文焦点，每一镜中文摘意简短，字幕不得遮挡渠道名；不得靠缩小整页字体塞入更多文字。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-lovable-retention-004",
      "timeRange": "0:44-0:55 / seg-006",
      "severity": "low",
      "whyViewerStops": "同一收入数字停留11秒，观众理解指标后可能提前离开。",
      "evidence": "visual-plan依次显示日期标题、金额、年化经常性收入定义及公司口径，至少有阅读职责变化；没有新增第二个数字、因果或CTA。",
      "requestedChange": "保持日期与公司口径可见，按真实旁白依次切换三个阅读焦点；旁白结束后直接收束，避免同一数字额外静停。",
      "returnTo": "visual-director"
    }
  ],
  "resolvedFeedback": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Episode-008 留存方案评审

第 1 轮 PASS，82/100，无 high 风险或 blocker。评审的是当前脚本与视觉计划，不是播放数据或最终成片。已读取 final-script、viral-strategy、visual-plan，以及 Oral Judge 第 3 轮、Audience Critic 第 2 轮和 Fact Guardian 的 PASS 报告；三份报告都绑定同一当前脚本。未参与上游写稿，本会话此前承担口播评审，本次按 Retention 独立维度重新判断。

## First 3 seconds

21/25，low。seg-001 的真实保存记录→刷新→同一条目恢复有明确源片及镜头时点，不是首页或纯字卡。动作证据能同期出现；零背景理解仍依赖英文 UI 中对应行的可读裁切，所以不进入 23–25 档。

## First 30 seconds

21/25，low。seg-002 的输入 Just add login、发送和反馈建立产品动作，旁白只说聊天开始做应用，没有假称该次指令生成整站。13 秒前提出实际使用的问题，20–30 秒以登录和对应数据库记录回答；7 秒人物回顾有新信息，但会暂时打断操作期待。seg-004 的原片窗口已细化为 login local0–3、save local8–14 与37–40.8，继续承担登录、页面记录、数据库对应行三项既有职责，未改变本轮判断。

## Mid-video engagement

20/25，low。seg-004 的数据库新证据给开场保存结果增加解释，之后真实团队复盘提供三个具体触达动作，不是重复刷新。证据形态由操作切人物、操作、复盘，满足每 20–40 秒推进。14 秒渠道原文的阅读负担仍是最可能的中段划走点。

## Ending satisfaction

20/25，low。前文已经回答页面怎样用起来，seg-006 用2025年7月公司自报 ARR 补上有来源的商业结果。指标与利润、收款区分清楚，不把渠道动作说成增长原因。11秒围绕同一指标，信息增量偏薄，但不是未兑现或泛化收尾。

上述分数均使用 rubric 的 20–22 档：核心推进成立，仍有具体 low 观察；未因计划存在、镜头多或三个上游 PASS 而给满分。四个预测划走点均已写入 viewerExitRisks，含位置、证据、执行要求和责任角色。没有要求重写脚本，也不把已有素材尚待渲染当作缺失素材。

Audience 的 feedback-lovable-audience-003 在当前 visual-plan seg-005 已落实为 Product Hunt、X、Supabase 的真实复盘材料和明确镜头焦点；其渠道身份问题在计划层面关闭。本轮是首次 Retention 评审，没有上一轮 Retention REJECT，因此 previousReview 不适用，resolvedFeedback 为空。workflow 的角色记录由编排者同步，本角色只写本报告。

seen-action-not-described-action 检查通过：seg-001、002、004 均指定真实输入、发送、登录、保存、刷新或数据库动作，不用落地页代替；照片明确不是原型开发现场，渠道原文明确是团队复盘而非伪造发布操作。登录和保存来自不同界面迭代，计划中的“2024 官方演示节选”及明确转场必须在成片保留，以免观众误解为一次连续操作。

本次以 Visual Director 的原片读回和 Fact Guardian 的证据判断可实施性，未冒称亲自重播三段原片、试听 TTS 或看过最终渲染。已有本地评估准入不等于外部发布批准。下一阶段仍须核验真实 TTS/MP4 时长、手机尺寸可读性、同一记录对应、字幕安全区和实际镜头停顿；这些交付检查不被 82 分替代。

本轮生产细化复核：seg-003 至006 的 Visual event 已将名词简写明确为出现、高亮或切到等动作，与既有镜头职责一致。seg-004 精确窗口保留页面新记录与数据库分数字段的展示，属于现有证据的选段细化；本报告绑定当前视觉方案 SHA-256，round=1、82分、四项 low 风险和 PASS 均保持不变。
