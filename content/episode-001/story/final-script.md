# Poke Final Script

状态：`story-approved`
选中 Hook：`calendar-already-changed`
目标时长：150 秒
生产说明：任何旁白调整都必须重新生成 TTS、字幕、时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `发给一个联系人` / `周三会议改到下午三点` / `日历已更新` / `功能演示`
- Scene: `hook-calendar-action`
- Visual intent: 第 0 帧同时出现已发送消息与已更新日历，持续标“功能演示”；随后只做轻微确认动效。
- Pace switch: 无淡入，先给完成结果。
- Fact boundary: 不冒充真实用户个案，不宣称执行成功率。

### Narration

发一句话，日历已经改好了。

### Narration units

| Text                       | Mode          | Claim IDs      | Attribution              |
| -------------------------- | ------------- | -------------- | ------------------------ |
| 发一句话，日历已经改好了。 | demonstration | claim-poke-011 | 官方能力说明；标功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-poke-015`
- Source identity: Cognition 披露
- On-screen text: `约三个月` / `1 亿+ 条消息` / `消息数，不是用户数`
- Scene: `hook-metric-cost`
- Visual intent: 一亿数字由开场消息扩展开，来源标签与统计口径同时出现，不再用成本警示切断正面结果。
- Pace switch: 从一个完成动作快速拉到公开规模。
- Fact boundary: 消息数不是用户、留存、收入或成功任务数。

### Narration

Cognition 披露，约三个月里，这样的消息超过一亿条。一个小动作，被放大成了一个产品问题。

### Narration units

| Text                                               | Mode               | Claim IDs      | Attribution            |
| -------------------------------------------------- | ------------------ | -------------- | ---------------------- |
| Cognition 披露，约三个月里，这样的消息超过一亿条。 | company            | claim-poke-015 | Cognition 披露         |
| 一个小动作，被放大成了一个产品问题。               | editorial-analysis | claim-poke-015 | 由可见动作进入故事问题 |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-poke-006`, `claim-poke-008`, `claim-poke-010`, `claim-poke-011`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `联系人列表里的 AI` / `读邮件` / `改日历` / `主动来找你` / `为什么收起工作台？`
- Scene: `hook-core-question`
- Visual intent: 联系人连接邮件、日历与主动提醒，最后停在团队选择和 Beta 用户动作的唯一问题。
- Pace switch: 补齐产品心智模型并建立全片问题。
- Fact boundary: 不宣称 Poke 没有网页或其他设置界面，不补采用原因。

### Narration

Poke 是联系人列表里的 AI 助手。它能读邮件、改日历，还会主动找你。团队为什么收起工作台，Beta 用户又怎样把它带出邮箱？

### Narration units

| Text                                                | Mode               | Claim IDs                      | Attribution              |
| --------------------------------------------------- | ------------------ | ------------------------------ | ------------------------ |
| Poke 是联系人列表里的 AI 助手。                     | company            | claim-poke-010                 | 官方消息入口说明         |
| 它能读邮件、改日历，还会主动找你。                  | company            | claim-poke-010, claim-poke-011 | 官方能力说明             |
| 团队为什么收起工作台，Beta 用户又怎样把它带出邮箱？ | editorial-analysis | claim-poke-006, claim-poke-008 | 基于两次方向变化提出问题 |

## seg-004

- Section: `problem`
- Time range: `0:20–0:34`
- Target seconds: `14`
- Claim IDs: `claim-poke-007`
- Source identity: 公司与投资方对痛点的概括
- On-screen text: `会议改期` / `复制时间` / `挪日历` / `补提醒` / `重新核对`
- Scene: `problem-fragmentation`
- Visual intent: 邮件日期依次搬到日历和待办；原邮件变化后，三处同时出现待核对状态并标“流程示意、功能演示”。
- Pace switch: 巨大数字切回熟悉的小麻烦。
- Fact boundary: 场景是流程示意，不是独立用户个案。

### Narration

先看旧办法。会议改期，你要从邮件复制时间，打开日历挪日程，再补一条提醒。邮件又变，三处还得重新核对。

### Narration units

| Text                                                         | Mode               | Claim IDs      | Attribution          |
| ------------------------------------------------------------ | ------------------ | -------------- | -------------------- |
| 先看旧办法。                                                 | editorial-analysis | claim-poke-007 | 进入痛点场景         |
| 会议改期，你要从邮件复制时间，打开日历挪日程，再补一条提醒。 | demonstration      | claim-poke-007 | 流程示意；标功能演示 |
| 邮件又变，三处还得重新核对。                                 | demonstration      | claim-poke-007 | 流程示意；标功能演示 |

## seg-005

- Section: `decision`
- Time range: `0:34–0:49`
- Target seconds: `15`
- Claim IDs: `claim-poke-006`, `claim-poke-010`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `最早：邮件客户端与自动化` / `用户：别再让我学新界面` / `工作台收起` / `联系人留下`
- Scene: `decision-messaging`
- Visual intent: 邮件工作台先占满画面，用户反馈出现后界面组件依次退出，只留下联系人气泡。
- Pace switch: 用视觉删除动作呈现产品选择。
- Fact boundary: 不补写具体访谈人物、会议或单一顿悟时刻。

### Narration

团队最早想做邮件客户端和自动化。访谈里，用户的反馈很直接：别再让我学一套界面。团队随后收起工作台，把 Poke 放进现成的消息列表。需要时，发一句就行。

### Narration units

| Text                                             | Mode               | Claim IDs                      | Attribution              |
| ------------------------------------------------ | ------------------ | ------------------------------ | ------------------------ |
| 团队最早想做邮件客户端和自动化。                 | founder            | claim-poke-006                 | 创始人口述               |
| 访谈里，用户的反馈很直接：别再让我学一套界面。   | founder            | claim-poke-006                 | 创始人口述               |
| 团队随后收起工作台，把 Poke 放进现成的消息列表。 | editorial-analysis | claim-poke-006, claim-poke-010 | 只表达来源支持的方向变化 |
| 需要时，发一句就行。                             | company            | claim-poke-010                 | 官方入口说明             |

## seg-006

- Section: `user-pull`
- Time range: `0:49–1:03`
- Target seconds: `14`
- Claim IDs: `claim-poke-008`
- Source identity: 创始人口述
- On-screen text: `Beta 用户继续往外推` / `提醒吃药` / `天气` / `球赛结果` / `带出邮箱`
- Scene: `beta-user-pull`
- Visual intent: 三条来源支持的请求依次穿过“邮件助手”边界，画面从收件箱扩到日常任务。
- Pace switch: 团队动作后立即切到用户动作。
- Fact boundary: 不虚构用户身份、场景、任务比例或独立留存结论。

### Narration

Beta 用户又把边界推开。有人让它提醒吃药，有人问天气和球赛。原本的邮件助手，被这些真实请求带进了日常任务。

### Narration units

| Text                                           | Mode               | Claim IDs      | Attribution    |
| ---------------------------------------------- | ------------------ | -------------- | -------------- |
| Beta 用户又把边界推开。                        | editorial-analysis | claim-poke-008 | 概括用户动作   |
| 有人让它提醒吃药，有人问天气和球赛。           | founder            | claim-poke-008 | 创始人口述     |
| 原本的邮件助手，被这些真实请求带进了日常任务。 | editorial-analysis | claim-poke-008 | 不外推采用原因 |

## seg-007

- Section: `product-value`
- Time range: `1:03–1:20`
- Target seconds: `17`
- Claim IDs: `claim-poke-010`, `claim-poke-011`, `claim-poke-024`
- Source identity: 官方能力说明 + 服务条款
- On-screen text: `它能先开口` / `授权后读邮件、改日历` / `少切窗口` / `结果仍需核对`
- Scene: `proactive-permission-risk`
- Visual intent: 联系人主动提醒，授权门打开后日历移动并出现核对状态；合成操作持续标“功能演示”。
- Pace switch: 第一次把产品便利与操作责任放在同一镜头。
- Fact boundary: 不宣称发生过真实事故或具体错误率。

### Narration

联系人入口还让 Poke 先开口。时间到了，它提醒；邮件变了，它跟进。授权之后，它能读邮件、改日历、草拟回复。少切窗口的同时，真实账户里的结果也要由用户核对。

### Narration units

| Text                                             | Mode                   | Claim IDs                      | Attribution              |
| ------------------------------------------------ | ---------------------- | ------------------------------ | ------------------------ |
| 联系人入口还让 Poke 先开口。                     | company                | claim-poke-010                 | 官方主动消息说明         |
| 时间到了，它提醒；邮件变了，它跟进。             | company                | claim-poke-010, claim-poke-011 | 官方能力说明             |
| 授权之后，它能读邮件、改日历、草拟回复。         | company                | claim-poke-011                 | 官方授权能力说明         |
| 少切窗口的同时，真实账户里的结果也要由用户核对。 | independently-verified | claim-poke-024                 | 官方条款中的用户核对责任 |

## seg-008

- Section: `sharing`
- Time range: `1:20–1:34`
- Target seconds: `14`
- Claim IDs: `claim-poke-004`, `claim-poke-012`
- Source identity: Poke 官方 Release Notes + 产品文档
- On-screen text: `Recipe：把设置做成链接` / `从配好的设置开始` / `账户仍需授权` / `2026.03.19 全面开放`
- Scene: `recipe-release`
- Visual intent: Recipe 设置卡传给下一位联系人，随后硬切真实 Release Notes 并放大 3 月 19 日。
- Pace switch: 程序化操作切到真实官方页面。
- Fact boundary: 不写成无条件一键完成，不宣称 Recipe 造成增长。

### Narration

Recipe 再把背景、开场白和要连接的服务做成链接。朋友点开，可以从配好的设置开始，账户仍要自己授权。2026 年 3 月 19 日，候补名单取消，Recipe 同时开放。

### Narration units

| Text                                                | Mode    | Claim IDs      | Attribution        |
| --------------------------------------------------- | ------- | -------------- | ------------------ |
| Recipe 再把背景、开场白和要连接的服务做成链接。     | company | claim-poke-012 | 官方产品文档       |
| 朋友点开，可以从配好的设置开始，账户仍要自己授权。  | company | claim-poke-012 | 保留授权边界       |
| 2026 年 3 月 19 日，候补名单取消，Recipe 同时开放。 | company | claim-poke-004 | 官方 Release Notes |

## seg-009

- Section: `evidence`
- Time range: `1:34–1:48`
- Target seconds: `14`
- Claim IDs: `claim-poke-010`, `claim-poke-015`
- Source identity: 官方入口说明 + Cognition 披露
- On-screen text: `约三个月` / `1 亿+ 条消息` / `同一个联系人入口` / `消息规模，不是用户数`
- Scene: `growth-cost-counter`
- Visual intent: 一亿消息第二次出现，但这次收拢到单一联系人入口；统计口径和来源持续可见。
- Pace switch: 重看开场数字，并赋予入口含义。
- Fact boundary: 不宣称公开节点或联系人入口造成该消息规模。

### Narration

公开范围扩大以后，到收购前约三个月，人们与 Poke 往来超过一亿条消息。这个数字只代表消息规模，也让同一个入口承载了多少往来变得可见。

### Narration units

| Text                                                                 | Mode               | Claim IDs                      | Attribution           |
| -------------------------------------------------------------------- | ------------------ | ------------------------------ | --------------------- |
| 公开范围扩大以后，到收购前约三个月，人们与 Poke 往来超过一亿条消息。 | company            | claim-poke-015                 | 画面标 Cognition 口径 |
| 这个数字只代表消息规模，也让同一个入口承载了多少往来变得可见。       | editorial-analysis | claim-poke-010, claim-poke-015 | 不换算用户或采用原因  |

## seg-010

- Section: `tradeoff`
- Time range: `1:48–2:01`
- Target seconds: `13`
- Claim IDs: `claim-poke-021`
- Source identity: 创始人口述
- On-screen text: `新邮件到达：再运行一次` / `航班未落地：继续刷新` / `用户只发一句` / `后台仍在工作`
- Scene: `cost-call-chain`
- Visual intent: 一条用户消息保持不动，邮件监听与航班刷新脉冲继续运行；不画未披露金额或架构。
- Pace switch: 配乐降低，只保留持续脉冲。
- Fact boundary: 不推算调用次数、单位成本、收入或毛利率。

### Narration

这份便利也有代价。新邮件一到，自动化就会再跑；盯航班时，状态还要不断刷新。用户只发一句，后台的模型和工具可能继续工作。

### Narration units

| Text                                                     | Mode               | Claim IDs      | Attribution      |
| -------------------------------------------------------- | ------------------ | -------------- | ---------------- |
| 这份便利也有代价。                                       | editorial-analysis | claim-poke-021 | 引入持续运行取舍 |
| 新邮件一到，自动化就会再跑；盯航班时，状态还要不断刷新。 | founder            | claim-poke-021 | 创始人成本示例   |
| 用户只发一句，后台的模型和工具可能继续工作。             | editorial-analysis | claim-poke-021 | 不推算具体调用量 |

## seg-011

- Section: `current-state`
- Time range: `2:01–2:14`
- Target seconds: `13`
- Claim IDs: `claim-poke-019`, `claim-poke-022`
- Source identity: Cognition 公告 + 媒体交叉核对
- On-screen text: `2026.07.23 Cognition 收购` / `计划接入模型与基础设施` / `Poke 当时照常使用`
- Scene: `acquisition-infrastructure`
- Visual intent: 持续调用画面短暂静音，随后硬切 Cognition 真实公告与下一步计划。
- Pace switch: 用真实页面完成全片最大节奏切换。
- Fact boundary: 不把成本写成收购原因，不宣称基础设施已经接入。

### Narration

2026 年 7 月 23 日，Cognition 宣布收购开发 Poke 的公司。公告里的下一步，是接入自己的模型和基础设施。Poke 当时继续照常使用。

### Narration units

| Text                                                     | Mode                   | Claim IDs      | Attribution            |
| -------------------------------------------------------- | ---------------------- | -------------- | ---------------------- |
| 2026 年 7 月 23 日，Cognition 宣布收购开发 Poke 的公司。 | independently-verified | claim-poke-019 | 官方公告与媒体交叉核对 |
| 公告里的下一步，是接入自己的模型和基础设施。             | company                | claim-poke-022 | Cognition 公告         |
| Poke 当时继续照常使用。                                  | company                | claim-poke-022 | 公告当时产品状态       |

## seg-012

- Section: `ending-payoff`
- Time range: `2:14–2:30`
- Target seconds: `16`
- Claim IDs: `claim-poke-006`, `claim-poke-008`, `claim-poke-010`, `claim-poke-011`, `claim-poke-015`
- Source identity: 创始人口述 + 官方能力说明 + Cognition 披露
- On-screen text: `工作台收起` / `联系人留下` / `用户把它带出邮箱` / `约三个月 1 亿+ 条消息` / `日历已更新` / `功能演示`
- Scene: `ending-known-edge`
- Visual intent: 工作台、Beta 请求和消息规模依次收拢到开场的联系人与日历；最后两秒只保留已完成动作并标“功能演示”。
- Pace switch: 用开场轨迹完成回看，不追加新信息。
- Fact boundary: 消息规模不写成用户或留存；结尾动作是来源支持的功能演示。

### Narration

回到开场。团队收起了新工作台，把 AI 放进联系人列表。Beta 用户再用提醒、天气和球赛把它带出邮箱。到收购前，约三个月的往来超过一亿条。发一句话，日历已经改好了。

### Narration units

| Text                                        | Mode               | Claim IDs                      | Attribution              |
| ------------------------------------------- | ------------------ | ------------------------------ | ------------------------ |
| 回到开场。                                  | editorial-analysis | claim-poke-010                 | 回看同一入口             |
| 团队收起了新工作台，把 AI 放进联系人列表。  | editorial-analysis | claim-poke-006, claim-poke-010 | 回答团队选择             |
| Beta 用户再用提醒、天气和球赛把它带出邮箱。 | founder            | claim-poke-008                 | 创始人口述               |
| 到收购前，约三个月的往来超过一亿条。        | company            | claim-poke-015                 | 画面标 Cognition 口径    |
| 发一句话，日历已经改好了。                  | demonstration      | claim-poke-011                 | 官方能力说明；标功能演示 |
