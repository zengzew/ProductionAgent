# Poke v2 Final Script

状态：oral-v2-pilot-candidate
选中 Hook：`calendar-at-three`
目标时长：110 秒
生产说明：本稿只用于独立 `oral-review-v2` 与人工盲听，不替代已交付的 canonical 稿。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `周三会议改到下午三点` / `日历已更新` / `功能演示`
- Scene: `hook-calendar-action`
- Visual intent: 第 0 帧同时出现已发送消息和周三 15:00 的日历结果，持续标“功能演示”。
- Pace switch: 无淡入，先给改变后的状态。
- Fact boundary: 不冒充真实用户个案，不宣称执行成功率。

### Narration

给它发句话，日历上的会议就挪到了周三下午三点。

### Narration units

| Text                                           | Mode          | Claim IDs      | Attribution              |
| ---------------------------------------------- | ------------- | -------------- | ------------------------ |
| 给它发句话，日历上的会议就挪到了周三下午三点。 | demonstration | claim-poke-011 | 官方能力说明；标功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-poke-010`, `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `不用再学一套工作台` / `联系人列表里的 AI` / `读邮件 · 改日历 · 主动提醒`
- Scene: `hook-core-question`
- Visual intent: 联系人卡连接邮件、日历和提醒，功能均由官方能力 Claim 同期支持。
- Pace switch: 从单一结果展开产品心智模型。
- Fact boundary: 不宣称 Poke 没有网页或设置界面。

### Narration

这个 AI 助手叫 Poke，就在你的联系人里。邮件它能读，日历它能改，时间到了还会主动提醒你。

### Narration units

| Text                                             | Mode    | Claim IDs                      | Attribution      |
| ------------------------------------------------ | ------- | ------------------------------ | ---------------- |
| 这个 AI 助手叫 Poke，就在你的联系人里。          | company | claim-poke-010                 | 官方消息入口说明 |
| 邮件它能读，日历它能改，时间到了还会主动提醒你。 | company | claim-poke-010, claim-poke-011 | 官方能力说明     |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-poke-006`, `claim-poke-008`, `claim-poke-015`
- Source identity: Cognition 披露 + 创始人口述
- On-screen text: `约三个月 · 1 亿+ 条消息` / `最初却是一套邮件工作台` / `用户接着交给它什么？`
- Scene: `hook-metric-cost`
- Visual intent: 消息规模与来源标签出现后，工作台轮廓收起，问题停在团队选择和用户动作。
- Pace switch: 从产品定义拉到规模，再收回人的选择。
- Fact boundary: 消息数不是用户、留存、收入或成功任务；不写增长归因。

### Narration

收购前大约三个月，Cognition 说，用户和 Poke 已经发了一亿多条消息。可它最早做的，只是一套邮件工作台。后来，人们怎么会连日常小事也找它？

### Narration units

| Text                                                               | Mode               | Claim IDs                      | Attribution                    |
| ------------------------------------------------------------------ | ------------------ | ------------------------------ | ------------------------------ |
| 收购前大约三个月，Cognition 说，用户和 Poke 已经发了一亿多条消息。 | company            | claim-poke-015                 | Cognition 披露                 |
| 可它最早做的，只是一套邮件工作台。                                 | founder            | claim-poke-006                 | 创始人口述                     |
| 后来，人们怎么会连日常小事也找它？                                 | editorial-analysis | claim-poke-006, claim-poke-008 | 基于方向变化和用户请求提出问题 |

## seg-004

- Section: `problem`
- Time range: `0:20–0:31`
- Target seconds: `11`
- Claim IDs: `claim-poke-007`
- Source identity: 公司与投资方对痛点的概括
- On-screen text: `邮件改期` / `抄时间 · 挪日历 · 补提醒` / `再变一次，还要重新核对`
- Scene: `problem-fragmentation`
- Visual intent: 日期从邮件搬到日历和提醒，原邮件变化后几处同时进入待核对状态，标“功能演示”。
- Pace switch: 从数字切回一个连续的日常动作。
- Fact boundary: 场景是流程示意，不是独立用户个案。

### Narration

邮件里换了会议时间，你得记下新时间，打开日历挪过去，再补上提醒。邮件里要是又改一次，这几处就得跟着查一遍。

### Narration units

| Text                                                             | Mode          | Claim IDs      | Attribution          |
| ---------------------------------------------------------------- | ------------- | -------------- | -------------------- |
| 邮件里换了会议时间，你得记下新时间，打开日历挪过去，再补上提醒。 | demonstration | claim-poke-007 | 流程示意；标功能演示 |
| 邮件里要是又改一次，这几处就得跟着查一遍。                       | demonstration | claim-poke-007 | 流程示意；标功能演示 |

## seg-005

- Section: `decision`
- Time range: `0:31–0:45`
- Target seconds: `14`
- Claim IDs: `claim-poke-006`, `claim-poke-010`
- Source identity: 创始人口述 + 官方入口说明
- On-screen text: `最早：邮件客户端与自动化` / `用户：别再让我学新界面` / `工作台收起 · 联系人留下`
- Scene: `decision-messaging`
- Visual intent: 邮件工作台先占满画面，反馈出现后组件依次退场，只留下联系人。
- Pace switch: 用删除界面的动作回答 Hook。
- Fact boundary: 不虚构访谈人物、会议或单点顿悟。

### Narration

最早，团队做的是邮件客户端和自动化。用户的意思很直接，他们不想再学一套新界面。团队后来把工作台收起来，只留下消息列表里的 Poke。改日程的时候，发句话就可以。

### Narration units

| Text                                              | Mode               | Claim IDs                      | Attribution              |
| ------------------------------------------------- | ------------------ | ------------------------------ | ------------------------ |
| 最早，团队做的是邮件客户端和自动化。              | founder            | claim-poke-006                 | 创始人口述               |
| 用户的意思很直接，他们不想再学一套新界面。        | founder            | claim-poke-006                 | 创始人口述               |
| 团队后来把工作台收起来，只留下消息列表里的 Poke。 | editorial-analysis | claim-poke-006, claim-poke-010 | 只表达来源支持的方向变化 |
| 改日程的时候，发句话就可以。                      | company            | claim-poke-010                 | 官方入口说明             |

## seg-006

- Section: `user-pull`
- Time range: `0:45–0:58`
- Target seconds: `13`
- Claim IDs: `claim-poke-008`
- Source identity: 创始人口述
- On-screen text: `Beta 用户继续往外推` / `提醒吃药 · 天气 · 球赛结果` / `带出邮箱`
- Scene: `beta-user-pull`
- Visual intent: 三类来源支持的请求依次穿过“邮件助手”边界，不重建具体人物。
- Pace switch: 团队选择后立即切到用户动作。
- Fact boundary: 不虚构用户身份、任务比例或独立留存结论。

### Narration

内测用户没有停在邮件上。有人请它提醒吃药，也有人来问天气、查球赛结果。Poke 接到的，渐渐成了更多日常小事。

### Narration units

| Text                                           | Mode               | Claim IDs      | Attribution    |
| ---------------------------------------------- | ------------------ | -------------- | -------------- |
| 内测用户没有停在邮件上。                       | founder            | claim-poke-008 | 创始人口述     |
| 有人请它提醒吃药，也有人来问天气、查球赛结果。 | founder            | claim-poke-008 | 创始人口述     |
| Poke 接到的，渐渐成了更多日常小事。            | editorial-analysis | claim-poke-008 | 不外推采用原因 |

## seg-007

- Section: `product-value`
- Time range: `0:58–1:12`
- Target seconds: `14`
- Claim IDs: `claim-poke-010`, `claim-poke-011`, `claim-poke-024`
- Source identity: 官方能力说明 + 服务条款
- On-screen text: `它还能先开口` / `授权后读邮件 · 改日历 · 草拟回复` / `结果仍要核对`
- Scene: `proactive-permission-risk`
- Visual intent: 主动提醒出现，授权门打开后日历移动并进入可核对状态，合成操作持续标功能演示。
- Pace switch: 从用户请求进入一次完整产品动作。
- Fact boundary: 不宣称发生过真实事故或具体错误率。

### Narration

Poke 不光等你发消息，它也会先来找你。该提醒时提醒，邮件一变就跟进。你授权以后，它能读邮件、改日历，也能替你草拟回复。这些结果需要你最后核对。

### Narration units

| Text                                               | Mode                   | Claim IDs                      | Attribution          |
| -------------------------------------------------- | ---------------------- | ------------------------------ | -------------------- |
| Poke 不光等你发消息，它也会先来找你。              | company                | claim-poke-010                 | 官方主动消息说明     |
| 该提醒时提醒，邮件一变就跟进。                     | company                | claim-poke-010, claim-poke-011 | 官方能力说明         |
| 你授权以后，它能读邮件、改日历，也能替你草拟回复。 | company                | claim-poke-011                 | 官方授权能力说明     |
| 这些结果需要你最后核对。                           | independently-verified | claim-poke-024                 | 服务条款中的用户责任 |

## seg-008

- Section: `sharing`
- Time range: `1:12–1:25`
- Target seconds: `13`
- Claim IDs: `claim-poke-012`
- Source identity: Poke 官方产品文档
- On-screen text: `Recipe：把一套用法做成链接` / `从配好的设置开始` / `账户仍要自己授权`
- Scene: `recipe-release`
- Visual intent: Recipe 设置卡从一个联系人传给另一个，授权边界与官方来源持续可见。
- Pace switch: 从个人使用切到分享动作。
- Fact boundary: 不写成无条件一键完成，不宣称 Recipe 造成增长。

### Narration

如果这套用法想发给朋友，Poke 会把背景设定、开场白和要连接的服务，收进一个 Recipe 链接。朋友打开链接，就能从配好的设置开始。轮到连接个人账户时，再由他自己确认授权。

### Narration units

| Text                                                                                    | Mode    | Claim IDs      | Attribution      |
| --------------------------------------------------------------------------------------- | ------- | -------------- | ---------------- |
| 如果这套用法想发给朋友，Poke 会把背景设定、开场白和要连接的服务，收进一个 Recipe 链接。 | company | claim-poke-012 | 官方 Recipe 说明 |
| 朋友打开链接，就能从配好的设置开始。                                                    | company | claim-poke-012 | 官方产品文档     |
| 轮到连接个人账户时，再由他自己确认授权。                                                | company | claim-poke-012 | 保留授权边界     |

## seg-009

- Section: `evidence`
- Time range: `1:25–1:38`
- Target seconds: `13`
- Claim IDs: `claim-poke-004`
- Source identity: Poke Release Notes
- On-screen text: `2026.03.19 候补名单取消` / `Recipe 同时开放` / `进入一般可用状态`
- Scene: `launch-timeline`
- Visual intent: 硬切真实 Release Notes，用日期、候补名单与 Recipe 状态确认一般可用节点。
- Pace switch: 程序化分享动作切到真实页面和公开状态。
- Fact boundary: 不宣称开放节点或 Recipe 造成消息规模、用户增长或留存。

### Narration

到了 2026 年 3 月 19 日，想用 Poke 已经不用再等候补。Recipe 也在同一天对外开放。

### Narration units

| Text                                                  | Mode    | Claim IDs      | Attribution        |
| ----------------------------------------------------- | ------- | -------------- | ------------------ |
| 到了 2026 年 3 月 19 日，想用 Poke 已经不用再等候补。 | company | claim-poke-004 | Poke Release Notes |
| Recipe 也在同一天对外开放。                           | company | claim-poke-004 | Poke Release Notes |

## seg-010

- Section: `ending-payoff`
- Time range: `1:38–1:50`
- Target seconds: `12`
- Claim IDs: `claim-poke-006`, `claim-poke-008`, `claim-poke-010`, `claim-poke-011`, `claim-poke-012`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `工作台收起` / `用户把它带出邮箱` / `Recipe 交给下一位` / `周三 15:00 · 日历已更新`
- Scene: `ending-known-edge`
- Visual intent: 工作台、Beta 请求和 Recipe 依次收拢到联系人，最后停在开场已更新的日历并标功能演示。
- Pace switch: 回看同一轨迹，不追加新支线。
- Fact boundary: 结尾动作是来源支持的功能演示，不宣称增长因果。

### Narration

现在再看开头那条改期消息。团队把工作台收起来，内测用户又带来提醒、天气和球赛这些需求。Recipe 让一套用法还能接着传给别人。回到联系人里发一句话，日历上的会议已经在周三下午三点了。

### Narration units

| Text                                                         | Mode               | Claim IDs                      | Attribution              |
| ------------------------------------------------------------ | ------------------ | ------------------------------ | ------------------------ |
| 现在再看开头那条改期消息。                                   | editorial-analysis | claim-poke-011                 | 回看同一动作             |
| 团队把工作台收起来，内测用户又带来提醒、天气和球赛这些需求。 | editorial-analysis | claim-poke-006, claim-poke-008 | 回答团队选择和用户动作   |
| Recipe 让一套用法还能接着传给别人。                          | editorial-analysis | claim-poke-012                 | 回答分享动作             |
| 回到联系人里发一句话，日历上的会议已经在周三下午三点了。     | demonstration      | claim-poke-010, claim-poke-011 | 官方能力说明；标功能演示 |
