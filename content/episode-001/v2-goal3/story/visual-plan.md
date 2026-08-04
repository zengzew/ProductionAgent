<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "93b003ef17c77b413c10298c0d884e9f1fdd56cd36ee54d100ddad116121f9e2",
  "plannedSegments": 10,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Poke v2 Visual Plan

## Visual system

1080×1920 竖屏继续使用现有 Poke 程序化视觉和已登记真实截图。全片围绕“消息 → 日历”
轨迹；工作台、Beta 请求和 Recipe 每次出现都改变这条轨迹的含义。合成操作持续标功能
演示，真实页面保留来源标签，字幕不遮住日历和 Release Notes 日期。

## Asset summary

复用已登记的 Poke 官网、Release Notes、Cognition 公告和代码图形。v2 不新增权利不明
素材；Cognition 公告只用于一亿消息来源，不再讲收购支线。

## seg-001

- Narrative purpose: 让零背景观众先看懂一句消息已经改动日历。
- Viewer state in: 不认识 Poke，也不知道视频主题。
- Viewer state out: 看见消息已发送，会议已停在周三 15:00。
- New information: 消息入口可以触发日历动作。
- Scene structure: 第 0 帧消息与日历同屏，只做一次确认动效。
- Visual evidence: 持续标功能演示和官方能力来源。
- Animation ideas: 不淡入核心结果，连接线点亮一次后停止。
- Asset requirements: 现有程序化消息与日历组件。
- Pacing: 三秒只读一个改变后的状态。
- Render target: hook-calendar-action
- Claim IDs: claim-poke-011

## seg-002

- Narrative purpose: 在七秒内建立联系人 AI 的产品心智模型。
- Viewer state in: 已懂改日历动作，不知道入口与能力。
- Viewer state out: 知道 Poke 位于消息列表并连接邮件、日历和提醒。
- New information: 入口、读取、执行与主动提醒。
- Scene structure: 联系人卡居中，三条能力连接依次点亮。
- Visual evidence: Poke 官方能力标签与功能演示同期。
- Animation ideas: 每条连接只出现一次，避免功能卡轮播。
- Asset requirements: 现有 HookScene 联系人与能力节点。
- Pacing: 前半入口，后半三项能力。
- Render target: hook-core-question
- Claim IDs: claim-poke-010, claim-poke-011

## seg-003

- Narrative purpose: 给阶段尺度并提出团队选择与用户动作问题。
- Viewer state in: 已理解产品，尚不知道为何这样设计。
- Viewer state out: 知道一亿是消息规模，并等待工作台为何退场。
- New information: Cognition 口径与早期邮件工作台。
- Scene structure: 消息聚合成一亿，工作台轮廓随后收起，问题停住。
- Visual evidence: Cognition 标签和“消息数，不是用户数”持续可读。
- Animation ideas: 数字只聚合一次，问题出现后停止新增元素。
- Asset requirements: 现有消息流与工作台程序图形。
- Pacing: 十秒完成尺度、过去方向和问题。
- Render target: hook-metric-cost
- Claim IDs: claim-poke-006, claim-poke-008, claim-poke-015

## seg-004

- Narrative purpose: 让观众看见团队想减少的重复搬运动作。
- Viewer state in: 知道产品选择问题，尚未感到旧流程负担。
- Viewer state out: 看见邮件改期要抄时间、挪日历、补提醒和复核。
- New information: 任务在多个界面之间碎片化。
- Scene structure: 一条光标路径完成搬运，邮件变化后几处同时待核对。
- Visual evidence: 全程标流程示意与功能演示。
- Animation ideas: 连续动作替代静态功能卡。
- Asset requirements: 现有邮件、日历和提醒程序图形。
- Pacing: 十一秒完整走完一次旧流程。
- Render target: problem-fragmentation
- Claim IDs: claim-poke-007

## seg-005

- Narrative purpose: 回答团队为什么主动收起工作台。
- Viewer state in: 已看见多界面麻烦。
- Viewer state out: 理解用户反馈与联系人入口的方向变化。
- New information: 邮件客户端起点、访谈反馈和入口选择。
- Scene structure: 工作台铺满画面，反馈出现后组件退场，只留联系人。
- Visual evidence: 创始人口述与官方入口标签分开显示。
- Animation ideas: 用删除界面表现选择，不重建会议。
- Asset requirements: 现有 OriginScene。
- Pacing: 十四秒完成起点、反馈和选择。
- Render target: decision-messaging
- Claim IDs: claim-poke-006, claim-poke-010

## seg-006

- Narrative purpose: 让 Beta 用户继续推动产品边界。
- Viewer state in: 已理解团队入口选择。
- Viewer state out: 看见服药提醒、天气和球赛把助手带出邮箱。
- New information: 三类有来源的日常请求。
- Scene structure: 请求依次穿过邮件助手边界，构图向日常任务扩展。
- Visual evidence: 创始人口述身份与示例重现标签。
- Animation ideas: 三张请求卡使用不同节奏，不虚构人物。
- Asset requirements: 现有 ValidationScene。
- Pacing: 每张卡只停留到读完。
- Render target: beta-user-pull
- Claim IDs: claim-poke-008

## seg-007

- Narrative purpose: 展示联系人入口的主动价值与授权边界。
- Viewer state in: 已看到用户扩大用途。
- Viewer state out: 理解主动提醒、授权执行和结果核对。
- New information: 先开口、读邮件、改日历、草拟回复与用户责任。
- Scene structure: 提醒出现，授权门打开，日历移动后进入核对状态。
- Visual evidence: 官方能力、服务条款和功能演示同期。
- Animation ideas: 用中性核对框，不制造事故。
- Asset requirements: 现有 ProactivePermissionRiskScene。
- Pacing: 便利占主要时间，责任只留最后一拍。
- Render target: proactive-permission-risk
- Claim IDs: claim-poke-010, claim-poke-011, claim-poke-024

## seg-008

- Narrative purpose: 把个人用法扩展成可分享的设置。
- Viewer state in: 已理解单人使用动作。
- Viewer state out: 看见 Recipe 链接把配置交给下一位，账户仍要授权。
- New information: Recipe 的分享与授权方式。
- Scene structure: 设置卡从一个联系人传给另一个，授权提示跟随。
- Visual evidence: 官方 Recipe 文档身份常驻。
- Animation ideas: 只动画链接传递，不做增长曲线。
- Asset requirements: 现有 RecipeReleaseScene 程序图形。
- Pacing: 十三秒完成配置、传递和授权。
- Render target: recipe-release
- Claim IDs: claim-poke-012

## seg-009

- Narrative purpose: 用真实页面确认候补名单取消与一般可用节点。
- Viewer state in: 已理解团队选择、用户请求和分享机制。
- Viewer state out: 知道候补名单取消、Recipe 开放并进入一般可用状态。
- New information: 产品从等待准入转为一般可用。
- Scene structure: 硬切 Release Notes，放大日期、候补名单和 Recipe 状态。
- Visual evidence: 真实页面来源与日期持续可读。
- Animation ideas: 页面保持稳定，只高亮一次状态变化。
- Asset requirements: 已登记 Release Notes 截图。
- Pacing: 用真实页面形成全片最大节奏切换。
- Render target: launch-timeline
- Claim IDs: claim-poke-004

## seg-010

- Narrative purpose: 回答开场并让同一日历动作获得完整含义。
- Viewer state in: 已知道工作台、Beta 请求、Recipe 与公开状态。
- Viewer state out: 能复述团队删界面、用户扩大用途、用法被分享。
- New information: 无新事实，只完成核心问题回收。
- Scene structure: 工作台、请求和 Recipe 收拢到联系人，最后回到周三 15:00。
- Visual evidence: 日历持续标功能演示，Claim 来源小字保留。
- Animation ideas: 复用开场轨迹，最后两秒停止新增元素。
- Asset requirements: 现有 ConclusionScene。
- Pacing: 十二秒逐步收拢并停在完成状态。
- Render target: ending-known-edge
- Claim IDs: claim-poke-006, claim-poke-008, claim-poke-010, claim-poke-011, claim-poke-012
