# Poke Final Script

状态：`story-approved`
选中 Hook：`beta-tasks-inside-one-contact`
目标时长：180 秒（3 分钟）
生产说明：旁白、画面文字与 Claim Ledger 已重新绑定。任何旁白调整都必须重新生成 TTS、字幕、生产时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-poke-008`
- Source identity: 创始人口述 Beta 使用
- On-screen text: `提醒吃药` / `问球赛结果` / `出门前看天气`
- Scene: `hook-beta-actions`
- Visual intent: 三条有来源的 Beta 请求从第一帧依次出现；角落小字标“创始人回忆 Beta 使用”，不先展示公司名或消息总数。
- Pace switch: 冷开场，三秒内给出三个普通人能理解的动作。
- Fact boundary: 不虚构用户身份、场景或这些任务的使用占比。

### Narration

提醒吃药，问球赛结果，出门前看天气。

### Narration units

| Text                                 | Mode    | Claim IDs      | Attribution                      |
| ------------------------------------ | ------- | -------------- | -------------------------------- |
| 提醒吃药，问球赛结果，出门前看天气。 | founder | claim-poke-008 | 画面小字标“创始人回忆 Beta 使用” |

## seg-002

- Section: `hook`
- Time range: `0:03–0:11`
- Target seconds: `8`
- Claim IDs: `claim-poke-006`, `claim-poke-008`, `claim-poke-010`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `这些请求原本发给邮件助手` / `后来它住进联系人列表`
- Scene: `hook-direction-change`
- Visual intent: 三条请求落进邮件助手草图，草图随后收进联系人卡；合成联系人界面标“功能演示”。
- Pace switch: 从生活动作切到产品入口变化。
- Fact boundary: 不写精确转向日期，不把合成 UI 当真实用户个案。

### Narration

这些请求原本发给一个邮件助手。后来，它住进了联系人列表。

### Narration units

| Text                           | Mode    | Claim IDs                      | Attribution                   |
| ------------------------------ | ------- | ------------------------------ | ----------------------------- |
| 这些请求原本发给一个邮件助手。 | founder | claim-poke-006, claim-poke-008 | 画面小字标“创始人回忆”        |
| 后来，它住进了联系人列表。     | company | claim-poke-010                 | 官方能力说明；UI 标“功能演示” |

## seg-003

- Section: `hook`
- Time range: `0:11–0:20`
- Target seconds: `9`
- Claim IDs: `claim-poke-010`, `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `Poke 是 AI 助手` / `主要入口不在新 App` / `联系人里的一个名字` / `让它读邮件、改日历？`
- Scene: `hook-question`
- Visual intent: Poke 联系人卡先给出一句定义，再连接邮件与日历授权页，最后停在人工确认框。
- Pace switch: 补齐产品定义，随后让动作停在权限选择上。
- Fact boundary: 不宣称 Poke 没有网页或设置界面；这里只定义主要使用入口。

### Narration

Poke 是个 AI 助手，但它的主要入口不在一个新 App 里。它就是手机联系人里的一个名字。你会让这个联系人读邮件、改日历吗？

### Narration units

| Text                                                 | Mode               | Claim IDs                      | Attribution              |
| ---------------------------------------------------- | ------------------ | ------------------------------ | ------------------------ |
| Poke 是个 AI 助手，但它的主要入口不在一个新 App 里。 | company            | claim-poke-010                 | 官方产品身份与能力说明   |
| 它就是手机联系人里的一个名字。                       | company            | claim-poke-010                 | 只描述主要消息入口       |
| 你会让这个联系人读邮件、改日历吗？                   | editorial-analysis | claim-poke-010, claim-poke-011 | 基于官方能力提出权限问题 |

## seg-004

- Section: `problem-and-definition`
- Time range: `0:20–0:38`
- Target seconds: `18`
- Claim IDs: `claim-poke-007`
- Source identity: 公司和投资方对痛点的概括
- On-screen text: `复制日期` / `打开日历` / `补一条提醒` / `三个窗口搬一个日期`
- Scene: `problem-fragmentation`
- Visual intent: 首帧标“流程示意、功能演示”；光标从邮件复制日期，切到日历，再补一条待办；窗口大小和切换间隔不完全相同。
- Pace switch: 从抽象的权限问题回到人人能看见的屏幕动作。
- Fact boundary: 场景是对来源所述跨应用负担的演示，不是独立用户个案。

### Narration

你收到一封邮件，里面有个会议时间。复制日期，打开日历，粘贴。再打开待办，补一条提醒。邮件里的时间一改，日历和待办还要跟着改。来回切三个窗口，只是为了安顿一个日期。Poke 想解决的，就是这种重复搬运。

### Narration units

| Text                                     | Mode               | Claim IDs      | Attribution              |
| ---------------------------------------- | ------------------ | -------------- | ------------------------ |
| 你收到一封邮件，里面有个会议时间。       | demonstration      | claim-poke-007 | 画面从第一帧标“流程示意” |
| 复制日期，打开日历，粘贴。               | demonstration      | claim-poke-007 | 演示跨应用复制与切换     |
| 再打开待办，补一条提醒。                 | demonstration      | claim-poke-007 | 演示追踪待办的负担       |
| 邮件里的时间一改，日历和待办还要跟着改。 | demonstration      | claim-poke-007 | 演示多处同步负担         |
| 来回切三个窗口，只是为了安顿一个日期。   | editorial-analysis | claim-poke-007 | 不外推为所有人的固定流程 |
| Poke 想解决的，就是这种重复搬运。        | company            | claim-poke-007 | 公司和投资方对痛点的概括 |

## seg-005

- Section: `discovery-and-decision`
- Time range: `0:38–0:55`
- Target seconds: `17`
- Claim IDs: `claim-poke-006`, `claim-poke-010`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `最早：邮件客户端与自动化` / `用户不想再学一套界面` / `于是转向消息对话`
- Scene: `decision-messaging`
- Visual intent: 邮件客户端草图先出现；访谈反馈卡压上来以后，草图收起，只留下消息联系人卡；合成 UI 标“功能演示”。
- Pace switch: 第一次明确给出“发现问题，所以改变入口”的因果。
- Fact boundary: 因果只限于创始人明确讲过的访谈反馈和方向变化，不补会议、日期或单句决定。

### Narration

最早，团队试过从邮件客户端和自动化做起。可访谈里的用户不想再学一套界面。于是团队把重点转向消息里的对话。Poke 收起新的工作台，变成一个联系人。你不用先找功能，直接像发消息一样告诉它要做什么。

### Narration units

| Text                                             | Mode          | Claim IDs                      | Attribution              |
| ------------------------------------------------ | ------------- | ------------------------------ | ------------------------ |
| 最早，团队试过从邮件客户端和自动化做起。         | founder       | claim-poke-006                 | 画面小字标“创始人回忆”   |
| 可访谈里的用户不想再学一套界面。                 | founder       | claim-poke-006                 | 画面小字标“创始人回忆”   |
| 于是团队把重点转向消息里的对话。                 | founder       | claim-poke-006                 | 只保留来源支持的方向变化 |
| Poke 收起新的工作台，变成一个联系人。            | company       | claim-poke-006, claim-poke-010 | 视觉化表达入口变化       |
| 你不用先找功能，直接像发消息一样告诉它要做什么。 | demonstration | claim-poke-010                 | 合成 UI 标“功能演示”     |

## seg-006

- Section: `discovery-and-decision`
- Time range: `0:55–1:12`
- Target seconds: `17`
- Claim IDs: `claim-poke-008`, `claim-poke-010`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `Beta 用户把任务带出邮箱` / `提醒吃药` / `查天气` / `问球赛结果`
- Scene: `beta-user-pull`
- Visual intent: 三条来源中出现过的 Beta 请求以不同长度进入画面；箭头从“邮件助手”转向“更通用、更主动”。
- Pace switch: 团队动作之后立刻接用户动作和第二次方向变化。
- Fact boundary: 不虚构用户姓名、房间、生活细节或任务占比。

### Narration

结果，Beta 用户把它带得更远。有人用它提醒吃药，有人查天气、问球赛结果。这些请求已经越过邮箱。团队又把产品往更通用、更主动的方向推。一个邮件助手，开始接住日常生活里随时冒出来的事。

### Narration units

| Text                                             | Mode               | Claim IDs                      | Attribution                  |
| ------------------------------------------------ | ------------------ | ------------------------------ | ---------------------------- |
| 结果，Beta 用户把它带得更远。                    | founder            | claim-poke-008                 | 画面小字标“创始人回忆”       |
| 有人用它提醒吃药，有人查天气、问球赛结果。       | founder            | claim-poke-008                 | 任务均来自创始人口述         |
| 这些请求已经越过邮箱。                           | editorial-analysis | claim-poke-008                 | 概括任务范围变化             |
| 团队又把产品往更通用、更主动的方向推。           | founder            | claim-poke-008                 | 不写成精确 pivot 日期        |
| 一个邮件助手，开始接住日常生活里随时冒出来的事。 | editorial-analysis | claim-poke-008, claim-poke-010 | 不扩大到来源未提及的任务类型 |

## seg-007

- Section: `solution`
- Time range: `1:12–1:30`
- Target seconds: `18`
- Claim IDs: `claim-poke-008`, `claim-poke-010`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `提醒顺序变了` / `Poke 可以先开口` / `原来的消息窗口`
- Scene: `proactive-message`
- Visual intent: 用户先发有来源的吃药提醒请求；随后在没有新输入时，提醒从联系人列表里出现；合成 UI 从第一帧标“功能演示”。
- Pace switch: 从方向变化切到一个完整的请求与主动提醒回路。
- Fact boundary: 不把演示当真实个案，不推断主动提醒占消息量的比例。

### Narration

改变入口以后，提醒的顺序也变了。你发“明天提醒我吃药”，Poke 把请求留在对话里。时间到了，它可以先开口。邮件该跟进，行程有变化，提醒也会出现在联系人列表。你不用记得打开另一套应用，Poke 会在原来的消息窗口里来找你。

### Narration units

| Text                                                        | Mode               | Claim IDs                      | Attribution                |
| ----------------------------------------------------------- | ------------------ | ------------------------------ | -------------------------- |
| 改变入口以后，提醒的顺序也变了。                            | editorial-analysis | claim-poke-010                 | 概括主动消息带来的体验变化 |
| 你发“明天提醒我吃药”，Poke 把请求留在对话里。               | demonstration      | claim-poke-008, claim-poke-010 | 有来源任务的功能演示       |
| 时间到了，它可以先开口。                                    | company            | claim-poke-010                 | 官方主动消息能力说明       |
| 邮件该跟进，行程有变化，提醒也会出现在联系人列表。          | demonstration      | claim-poke-010                 | 合成 UI 标“功能演示”       |
| 你不用记得打开另一套应用，Poke 会在原来的消息窗口里来找你。 | editorial-analysis | claim-poke-010                 | 不宣称已验证采用原因       |

## seg-008

- Section: `solution`
- Time range: `1:30–1:50`
- Target seconds: `20`
- Claim IDs: `claim-poke-007`, `claim-poke-011`, `claim-poke-024`
- Source identity: 公司痛点概括 + 官方能力说明 + 服务条款
- On-screen text: `先授权` / `读取邮件与日历` / `草拟回复` / `安排会议` / `真实改动会留下`
- Scene: `permission-action-loop`
- Visual intent: 首帧标“功能演示”；授权卡先出现，随后读取邮件里的日期并写入日历；最后停在人工确认框。
- Pace switch: 从主动提醒切到触及真实账户的执行动作。
- Fact boundary: 不宣称执行成功率；条款承认输出可能错误，重要日程和业务决定仍由用户负责。

### Narration

但少开一个界面，还不等于少做那些步骤。Poke 得到授权以后，能读邮件和日历，草拟回复，也能安排会议。你说“把邮件里的时间放进日历”，它就接着往下做。复制、粘贴和切换可以交给它，真实账户里的改动也会留下来。

### Narration units

| Text                                                        | Mode               | Claim IDs                                      | Attribution          |
| ----------------------------------------------------------- | ------------------ | ---------------------------------------------- | -------------------- |
| 但少开一个界面，还不等于少做那些步骤。                      | editorial-analysis | claim-poke-007                                 | 承接跨应用操作负担   |
| Poke 得到授权以后，能读邮件和日历，草拟回复，也能安排会议。 | company            | claim-poke-011                                 | 官方能力说明         |
| 你说“把邮件里的时间放进日历”，它就接着往下做。              | demonstration      | claim-poke-011                                 | 合成 UI 标“功能演示” |
| 复制、粘贴和切换可以交给它，真实账户里的改动也会留下来。    | editorial-analysis | claim-poke-007, claim-poke-011, claim-poke-024 | 不宣称可靠性或成功率 |

## seg-009

- Section: `solution`
- Time range: `1:50–2:09`
- Target seconds: `19`
- Claim IDs: `claim-poke-004`, `claim-poke-012`
- Source identity: Poke 官方 Release Notes + 官方产品文档
- On-screen text: `Recipe 是 Poke 的分享功能` / `背景` / `第一句话` / `所需服务` / `账户仍需授权`
- Scene: `recipe-setup`
- Visual intent: 先展示两个人重复设置同一助手；随后把背景、首条消息和所需服务收进 Recipe 链接；合成 UI 标“功能演示”，画面小字标“2026.03.19 与一般可用同步开放”。
- Pace switch: 先出现新的设置摩擦，再给出 Recipe。
- Fact boundary: 不写成无条件一键完成，不宣称 Recipe 带来增长。

### Narration

那配置能不能分享？能。Poke 有个功能叫 Recipe。你的背景设定、开场白和要连的服务，可以一起打包成一个链接。朋友点开，就能从配好的设置开始。只有账户授权，还得他自己来。

### Narration units

| Text                                                       | Mode               | Claim IDs                      | Attribution                  |
| ---------------------------------------------------------- | ------------------ | ------------------------------ | ---------------------------- |
| 那配置能不能分享？                                         | editorial-analysis | claim-poke-012                 | 由 Recipe 配置项提出设置问题 |
| 能。                                                       | editorial-analysis | claim-poke-012                 | 回答设置可分享               |
| Poke 有个功能叫 Recipe。                                   | company            | claim-poke-004, claim-poke-012 | 首次出现时解释产品归属       |
| 你的背景设定、开场白和要连的服务，可以一起打包成一个链接。 | company            | claim-poke-012                 | 官方产品文档                 |
| 朋友点开，就能从配好的设置开始。                           | demonstration      | claim-poke-012                 | 画面标“功能示意”             |
| 只有账户授权，还得他自己来。                               | company            | claim-poke-012                 | 保留授权边界                 |

## seg-010

- Section: `evidence`
- Time range: `2:09–2:26`
- Target seconds: `17`
- Claim IDs: `claim-poke-004`, `claim-poke-010`, `claim-poke-015`
- Source identity: Poke 官方 Release Notes + Cognition 披露
- On-screen text: `2026.03.19 一般可用` / `收购前约三个月` / `1 亿+ 条消息` / `消息数，不是用户数`
- Scene: `message-metric-boundary`
- Visual intent: 候补名单卡先移走；随后同一个联系人里的请求和回复累积成“1 亿+ 条消息”；统计期与来源留在画面小字。
- Pace switch: 从功能演示切到一次明确的数据停顿。
- Fact boundary: 消息数不能换算成用户、留存、收入、人均强度或成功任务数。

### Narration

开放使用之后，消息开始累积。收购前大约三个月，Cognition 披露，人们与 Poke 往来超过一亿条消息。每次请求和回复，都留在同一个联系人对话里。这个入口最终堆出了一个很大的消息数字。

### Narration units

| Text                                                               | Mode               | Claim IDs                      | Attribution                  |
| ------------------------------------------------------------------ | ------------------ | ------------------------------ | ---------------------------- |
| 开放使用之后，消息开始累积。                                       | editorial-analysis | claim-poke-004, claim-poke-015 | 只连接时间顺序，不写增长归因 |
| 收购前大约三个月，Cognition 披露，人们与 Poke 往来超过一亿条消息。 | company            | claim-poke-015                 | 旁白唯一一次数据来源归因     |
| 每次请求和回复，都留在同一个联系人对话里。                         | editorial-analysis | claim-poke-010                 | 解释消息入口，不推断消息构成 |
| 这个入口最终堆出了一个很大的消息数字。                             | editorial-analysis | claim-poke-015                 | 只描述披露的消息规模         |

## seg-011

- Section: `turning-point`
- Time range: `2:26–2:44`
- Target seconds: `18`
- Claim IDs: `claim-poke-019`, `claim-poke-021`
- Source identity: 创始人口述 + Cognition 收购公告
- On-screen text: `实时任务持续产生推理成本` / `运行昂贵，也很难盈利` / `2026.07.23 Cognition 收购`
- Scene: `cost-then-acquisition`
- Visual intent: 新邮件自动化和航班查询只增加调用次数，不画金额；画面清空一拍后再切 Cognition 收购公告。
- Pace switch: 消息数字转成运行成本；空帧隔开成本与收购，避免制造收购动机。
- Fact boundary: 不把运行昂贵写成 Cognition 收购原因，不宣称收购已经改善成本。

### Narration

创始人举过两个例子。新邮件一到，自动化就跑一遍。查航班，它得一直盯着刷新。任务不结束，模型调用也停不下来。一句很短的请求，背后可能连着一串调用。他说 Poke 跑起来很贵，也很难赚钱。随后，Cognition 收购了开发 Poke 的公司。

### Narration units

| Text                                     | Mode                   | Claim IDs      | Attribution            |
| ---------------------------------------- | ---------------------- | -------------- | ---------------------- |
| 创始人举过两个例子。                     | founder                | claim-poke-021 | 承接创始人成本说明     |
| 新邮件一到，自动化就跑一遍。             | founder                | claim-poke-021 | 不推算单次或总成本     |
| 查航班，它得一直盯着刷新。               | founder                | claim-poke-021 | 不推算刷新频率         |
| 任务不结束，模型调用也停不下来。         | editorial-analysis     | claim-poke-021 | 解释实时任务的持续调用 |
| 一句很短的请求，背后可能连着一串调用。   | editorial-analysis     | claim-poke-021 | 不推算具体调用次数     |
| 他说 Poke 跑起来很贵，也很难赚钱。       | founder                | claim-poke-021 | 旁白唯一一次创始人归因 |
| 随后，Cognition 收购了开发 Poke 的公司。 | independently-verified | claim-poke-019 | 用“随后”保留时间顺序   |

## seg-012

- Section: `boundary-and-ending`
- Time range: `2:44–3:00`
- Target seconds: `16`
- Claim IDs: `claim-poke-007`, `claim-poke-011`, `claim-poke-022`, `claim-poke-024`
- Source identity: Cognition 公告 + 媒体报道 + 官方能力说明 + 服务条款
- On-screen text: `当下继续照常使用` / `计划接入 Cognition 模型与基础设施` / `长期整合仍未确定` / `下一次改错日程`
- Scene: `ending-known-edge`
- Visual intent: Cognition 公告缩到一旁；联系人、邮件和日历回到开场位置；一次日程移动到错误时间，人工确认框停住后结束。
- Pace switch: 收购的不确定性落回观众下一次授权的具体后果。
- Fact boundary: 不宣称 Cognition 已完成整合，不替公开资料回答长期产品去向、留存或可靠性。

### Narration

收购当下，Poke 继续照常使用。Cognition 计划把它接上自己的模型和基础设施。TechCrunch 报道，至少到 2026 年底，产品不会立刻改变。之后会不会完全并入 Cognition，当时仍未确定。对用户来说，眼前的交换没有变：少开几个窗口，换来一个能动真实账户的联系人。下一次它把会议挪错，你还会不会让它继续改日历？

### Narration units

| Text                                                                       | Mode               | Claim IDs                                      | Attribution                |
| -------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- | -------------------------- |
| 收购当下，Poke 继续照常使用。                                              | company            | claim-poke-022                                 | Cognition 公告             |
| Cognition 计划把它接上自己的模型和基础设施。                               | company            | claim-poke-022                                 | 已宣布的后续计划           |
| TechCrunch 报道，至少到 2026 年底，产品不会立刻改变。                      | editorial-analysis | claim-poke-022                                 | 媒体报道的短期边界         |
| 之后会不会完全并入 Cognition，当时仍未确定。                               | editorial-analysis | claim-poke-022                                 | 长期整合仍未确定           |
| 对用户来说，眼前的交换没有变：少开几个窗口，换来一个能动真实账户的联系人。 | editorial-analysis | claim-poke-007, claim-poke-011, claim-poke-024 | 回到便利与权限冲突         |
| 下一次它把会议挪错，你还会不会让它继续改日历？                             | editorial-analysis | claim-poke-011, claim-poke-024                 | 假设性后果；不宣称真实个案 |
