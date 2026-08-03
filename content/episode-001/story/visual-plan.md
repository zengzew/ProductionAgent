<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "b86c56c74ba0a616ed1eb87631a1411cd6d07d20adae7c8c044ed4072a60e620",
  "plannedSegments": 12,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Poke Visual Plan

## Visual system

1080×1920 竖屏围绕一条连续的“消息 → 日历”动作组织。已发送消息、日历卡、联系人和
后台脉冲是重复视觉语汇；每次回看都增加团队选择、用户用途或运行代价。真实页面保留
来源标签，合成操作持续标“功能演示”。

## Asset summary

使用已登记的 Poke Release Notes 与 Cognition 公告截图。邮件、日历、Beta 请求、
Recipe 和调用状态使用 Claim 支持的程序化图形。关键证据位于字幕上方安全区。

## seg-001

- Narrative purpose: 先给完成结果，让零背景观众立即知道 AI 做了真实账户动作。
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

- Narrative purpose: 把个人动作放大成值得继续看的产品尺度。
- Viewer state in: 已理解一句消息改日历。
- Viewer state out: 知道同类往来在约三个月达到一亿多条。
- New information: Cognition 披露的消息规模与统计边界。
- Scene structure: 开场消息复制成消息流，再聚合为“1 亿+”；下方固定来源与口径。
- Visual evidence: Cognition 标签与“消息数，不是用户数”同期可读。
- Animation ideas: 数字只做一次聚合，不使用成本警报。
- Asset requirements: 程序化消息流与数字卡。
- Pacing: 七秒完成尺度变化并停在产品问题。
- Render target: hook-metric-cost
- Claim IDs: claim-poke-015

## seg-003

- Narrative purpose: 建立产品心智模型和全片唯一问题。
- Viewer state in: 知道动作和规模，不知道团队为什么这样设计。
- Viewer state out: 能复述 Poke 是联系人列表里的 AI 助手，并等待入口选择的答案。
- New information: 读邮件、改日历、主动联系与两次方向变化。
- Scene structure: 联系人卡连接三个能力，工作台轮廓收起后问题出现。
- Visual evidence: 官方能力与创始人口述标签分开显示。
- Animation ideas: 三条连接依次点亮，问题出现时停止新增元素。
- Asset requirements: 程序化联系人、能力节点和工作台轮廓。
- Pacing: 前半定义，后半只留一个问题。
- Render target: hook-core-question
- Claim IDs: claim-poke-006, claim-poke-008, claim-poke-010, claim-poke-011

## seg-004

- Narrative purpose: 让观众亲眼看见团队要减少的重复动作。
- Viewer state in: 理解产品能力，尚未感受旧流程负担。
- Viewer state out: 看见一次改期要在三处搬运并重新核对。
- New information: 邮件、日历与待办之间的任务碎片。
- Scene structure: 日期从邮件复制到日历和待办；原邮件变化后，三处出现核对状态。
- Visual evidence: 全程标“流程示意、功能演示”。
- Animation ideas: 一条明确光标路径完成复制、移动和重新核对。
- Asset requirements: 程序化邮件、日历和待办卡。
- Pacing: 从高密度 Hook 切到一个连续动作。
- Render target: problem-fragmentation
- Claim IDs: claim-poke-007

## seg-005

- Narrative purpose: 回答团队为什么收起工作台。
- Viewer state in: 已看见三窗口麻烦。
- Viewer state out: 理解用户拒绝新界面后，联系人入口成为产品选择。
- New information: 早期邮件方向、访谈反馈和入口变化。
- Scene structure: 邮件客户端铺满画面，反馈出现后工具栏逐项退出，只留下联系人。
- Visual evidence: 创始人口述身份与官方入口说明同期显示。
- Animation ideas: 用界面元素退场呈现选择，不重建会议场景。
- Asset requirements: 程序化邮件工作台与联系人卡。
- Pacing: 十五秒完成旧方向、反馈和选择。
- Render target: decision-messaging
- Claim IDs: claim-poke-006, claim-poke-010

## seg-006

- Narrative purpose: 让用户动作继续推动产品边界。
- Viewer state in: 已理解团队把入口移到联系人列表。
- Viewer state out: 看见 Beta 用户把邮件助手用于生活任务。
- New information: 吃药提醒、天气和球赛请求。
- Scene structure: 三条请求穿过“邮件助手”边界，画面构图扩到日常任务。
- Visual evidence: 标创始人口述与“示例重现”。
- Animation ideas: 请求以不同节奏穿过同一边界，不虚构人物。
- Asset requirements: 程序化请求卡。
- Pacing: 每条请求只停留足够读完的时间。
- Render target: beta-user-pull
- Claim IDs: claim-poke-008

## seg-007

- Narrative purpose: 展示联系人入口如何转化为可见产品价值，并简短交代操作责任。
- Viewer state in: 知道用户扩大了用途。
- Viewer state out: 理解主动提醒、授权执行和结果核对。
- New information: Poke 能先开口，授权后能读邮件、改日历、草拟回复。
- Scene structure: 主动提醒出现，授权门打开，日历移动后进入可核对状态。
- Visual evidence: 官方能力、条款来源和“功能演示”同时可见。
- Animation ideas: 成功移动后用中性核对框，不制造事故动效。
- Asset requirements: 程序化提醒、授权面板与日历卡。
- Pacing: 便利占主要时间，责任边界只留最后一拍。
- Render target: proactive-permission-risk
- Claim IDs: claim-poke-010, claim-poke-011, claim-poke-024

## seg-008

- Narrative purpose: 解释一套设置怎样被分享，并用真实页面确认公开节点。
- Viewer state in: 已理解单人使用价值。
- Viewer state out: 看见 Recipe 把配置传给下一位用户，账户仍需授权。
- New information: Recipe 分享机制与 2026 年 3 月 19 日一般可用。
- Scene structure: Recipe 卡完成传递后硬切 Poke Release Notes，日期进入视觉中心。
- Visual evidence: 真实页面截图、来源标签和授权边界可读。
- Animation ideas: 只动画链接传递，真实页面保持稳定。
- Asset requirements: 已登记 Release Notes 截图与程序化 Recipe 卡。
- Pacing: 程序图形与真实证据形成明显切换。
- Render target: recipe-release
- Claim IDs: claim-poke-004, claim-poke-012

## seg-009

- Narrative purpose: 第二次展示消息规模，并为它补上联系人入口的含义。
- Viewer state in: 已知道产品选择、用户用途和分享机制。
- Viewer state out: 理解一亿是消息规模，不能换算用户，但与同一入口的往来相关。
- New information: 规模证据在知道产品机制后获得新含义。
- Scene structure: “1 亿+”从多张消息卡收拢到一个联系人，来源和口径固定在侧边。
- Visual evidence: Cognition 标签与官方入口说明分开显示。
- Animation ideas: 消息卡聚合一次，联系人保持稳定。
- Asset requirements: 程序化消息流和联系人卡。
- Pacing: 不再列 Apple 时间节点，十四秒只完成一次证据回看。
- Render target: growth-cost-counter
- Claim IDs: claim-poke-010, claim-poke-015

## seg-010

- Narrative purpose: 用用户看得见的状态解释便利背后的持续运行。
- Viewer state in: 已理解入口被频繁用于消息往来。
- Viewer state out: 知道一句请求结束后，实时任务可能仍在工作。
- New information: 新邮件触发与航班刷新带来的持续调用。
- Scene structure: 左侧保持一条请求，右侧邮件和航班状态按不同节奏更新。
- Visual evidence: 创始人成本示例标签持续可见，不画未披露金额。
- Animation ideas: 错峰脉冲和状态更新时间，不做伪架构图。
- Asset requirements: Claim 支持的程序化状态卡。
- Pacing: 降低配乐，十三秒保持连续动作。
- Render target: cost-call-chain
- Claim IDs: claim-poke-021

## seg-011

- Narrative purpose: 交代故事结束时产品所处的公开状态。
- Viewer state in: 已理解产品价值与持续运行代价。
- Viewer state out: 知道 Cognition 已收购公司、计划接入基础设施，Poke 当时照常使用。
- New information: 收购公告和公告中的下一步。
- Scene structure: 脉冲画面清空并短静音，再切 Cognition 真实公告与计划卡。
- Visual evidence: 公告日期、收购主体、计划措辞和来源标签可读。
- Animation ideas: 用硬切隔开成本与收购，避免暗示因果。
- Asset requirements: 已登记 Cognition 公告截图。
- Pacing: 全片最大节奏切换，真实页面保持可读停留。
- Render target: acquisition-infrastructure
- Claim IDs: claim-poke-019, claim-poke-022

## seg-012

- Narrative purpose: 回答开场问题，并让同一动作获得团队选择和用户行为的新含义。
- Viewer state in: 已知道产品为何进入消息列表、用户怎样扩大用途。
- Viewer state out: 能复述团队收起工作台、用户带出邮箱、消息落到真实日历。
- New information: 无新事实，只完成工作台、Beta 请求、规模与日历的回收。
- Scene structure: 工作台退场、三条 Beta 请求和一亿数字依次缩入联系人，最后回到已更新日历。
- Visual evidence: Cognition 口径保留，日历动作持续标“功能演示”。
- Animation ideas: 复用开场轨迹，最后两秒停止新增元素。
- Asset requirements: 复用程序化联系人、消息、日历和数字卡。
- Pacing: 十六秒逐步收拢，最后停在完成状态。
- Render target: ending-known-edge
- Claim IDs: claim-poke-006, claim-poke-008, claim-poke-010, claim-poke-011, claim-poke-015
