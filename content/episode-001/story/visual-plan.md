<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "d56ce759e7e0ebb6a21fe1e49fd8ddbe3af715bf7e836a5825572f23af2a5b28",
  "plannedSegments": 6,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Poke Visual Plan

## Visual system

1080×1920 竖屏围绕一条连续的“消息 → 日历”动作组织。已发送消息、日历卡、联系人和
来源标签是重复视觉语汇；每次回看都增加团队选择、用户用途或公开证据。合成操作持续标
“功能演示”，真实页面保留来源标签。

## Asset summary

使用已登记的 Poke Release Notes 与 Cognition 公告截图。联系人、邮件、日历、Recipe、
Beta 请求和消息规模使用 Claim 支持的程序化图形，关键证据位于字幕上方安全区。

## seg-001

- Narrative purpose: 先给完成结果，让零背景观众立即看懂 AI 做了日历动作。
- Viewer state in: 不认识 Poke，也不知道视频主题。
- Viewer state out: 看懂一句消息已经改动日历。
- New information: 消息入口可以触发日历动作。
- Scene structure: 第 0 帧已发送消息与已更新日历同屏，随后确认标记轻微放大后停止。
- Visual evidence: 持续标“功能演示”，能力来源小字同期出现。
- Animation ideas: 不淡入核心对象，只让确认圆点和连接线动一次。
- Asset requirements: 程序化消息与日历卡，无新增外部素材。
- Pacing: 三秒只读一个动作结果。
- Render target: hook-calendar-action
- Claim IDs: claim-poke-011

## seg-002

- Narrative purpose: 把个人动作放大成公开规模，并留下入口问题。
- Viewer state in: 已理解一句消息改日历。
- Viewer state out: 知道约三个月有一亿多条消息，且统计口径不是用户数。
- New information: Cognition 披露的消息规模与联系人入口问题。
- Scene structure: 开场消息复制成消息流，再聚合为“1 亿+”；最后停在联系人列表问句。
- Visual evidence: Cognition 标签与“消息数，不是用户数”同期可读。
- Animation ideas: 数字只做一次聚合，问句出现时停止新增元素。
- Asset requirements: 程序化消息流与数字卡。
- Pacing: 七秒完成尺度变化并提出核心问题。
- Render target: hook-metric-cost
- Claim IDs: claim-poke-010, claim-poke-015

## seg-003

- Narrative purpose: 用具体能力回答为什么选择联系人入口。
- Viewer state in: 知道动作和规模，不知道入口承载什么能力。
- Viewer state out: 能复述 Poke 可读邮件、改日历并主动联系。
- New information: 联系人入口与三项可见能力。
- Scene structure: 联系人卡连接邮件、日历和主动提醒，工作台轮廓退到背景。
- Visual evidence: 官方能力来源标签固定在安全区。
- Animation ideas: 三条能力连接依次点亮，最后停在联系人卡。
- Asset requirements: 程序化联系人、邮件、日历和提醒节点。
- Pacing: 十秒只完成产品定义，不新增历史信息。
- Render target: decision-messaging
- Claim IDs: claim-poke-010, claim-poke-011

## seg-004

- Narrative purpose: 让团队选择和用户用途在同一段连续发生。
- Viewer state in: 已看见入口价值，尚未知道它怎样离开邮件场景。
- Viewer state out: 理解用户拒绝新界面，内测请求把用途推向日常任务。
- New information: 早期邮件客户端方向、界面反馈、吃药提醒、天气和球赛。
- Scene structure: 邮件工作台因反馈收起，三条内测请求随后穿过邮箱边界。
- Visual evidence: 创始人口述标签与“示例重现”同期可读。
- Animation ideas: 请求以不同节奏穿过同一边界，不虚构人物身份。
- Asset requirements: 程序化邮件工作台与三张请求卡。
- Pacing: 十四秒完成团队动作到用户动作的切换。
- Render target: beta-user-pull
- Claim IDs: claim-poke-006, claim-poke-008

## seg-005

- Narrative purpose: 把入口选择落到可分享配置和公开节点。
- Viewer state in: 已理解团队和用户为何需要消息入口。
- Viewer state out: 看见 Recipe 如何分享设置，并知道账户仍需授权。
- New information: Recipe 链接、授权边界与 2026 年 3 月 19 日开放。
- Scene structure: 工作台退出后留下联系人，Recipe 卡传给下一位用户，再切真实 Release Notes。
- Visual evidence: 真实页面截图、日期、来源标签和授权边界可读。
- Animation ideas: 只动画链接传递，真实页面保持稳定。
- Asset requirements: 已登记 Release Notes 截图与程序化 Recipe 卡。
- Pacing: 十四秒完成产品价值到公开证据的硬切。
- Render target: recipe-release
- Claim IDs: claim-poke-004, claim-poke-006, claim-poke-010, claim-poke-012

## seg-006

- Narrative purpose: 回收消息规模并兑现开场的具体动作。
- Viewer state in: 已知道入口选择、用户用途和公开配置。
- Viewer state out: 能复述入口变化，最后看到同一句消息完成日历动作。
- New information: 一亿消息回到联系人入口的含义；不新增事实。
- Scene structure: 消息规模收拢到联系人，最后回到已更新日历并停止新增元素。
- Visual evidence: Cognition 口径保留，日历动作持续标“功能演示”。
- Animation ideas: 复用开场轨迹，最后两秒只保留完成状态。
- Asset requirements: 复用程序化联系人、消息、数字卡和日历卡。
- Pacing: 十二秒完成回收，不用风险或未来问题收尾。
- Render target: ending-known-edge
- Claim IDs: claim-poke-010, claim-poke-011, claim-poke-015
