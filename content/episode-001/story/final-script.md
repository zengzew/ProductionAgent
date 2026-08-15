# Poke Final Script

状态：`story-approved`
选中 Hook：`calendar-already-changed`
目标时长：60 秒
生产说明：任何旁白调整都必须重新生成 TTS、字幕、时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `发给一个联系人` / `周三会议改到下午三点` / `日历已更新` / `功能演示`
- Scene: `hook-calendar-action`
- Visual intent: 第 0 帧同时出现已发送消息与已更新日历，持续标“功能演示”；随后只做一次轻微确认动效。
- Pace switch: 无淡入，先给完成结果。
- Fact boundary: 不冒充真实用户个案，不宣称执行成功率。

### Narration

发一句话，日历已经改好了。

### Narration units

| Text                       | Mode          | Claim IDs      | Attribution              |
| -------------------------- | ------------- | -------------- | ------------------------- |
| 发一句话，日历已经改好了。 | demonstration | claim-poke-011 | 官方能力说明；标功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-poke-010`, `claim-poke-015`
- Source identity: Cognition 披露 + 官方入口说明
- On-screen text: `约三个月` / `1 亿+ 条消息` / `消息数，不是用户数` / `为什么放进联系人列表？`
- Scene: `hook-metric-cost`
- Visual intent: 开场消息扩展成一亿数字，来源标签和“消息数，不是用户数”同时出现，最后停在联系人入口问题。
- Pace switch: 从一个完成动作快速拉到公开规模，再留下唯一问题。
- Fact boundary: 消息数不是用户、留存、收入或成功任务数。

### Narration

Cognition 披露，约三个月，一亿多条消息。为什么放进联系人列表？

### Narration units

| Text                                  | Mode               | Claim IDs                      | Attribution           |
| ------------------------------------- | ------------------ | ------------------------------ | --------------------- |
| Cognition 披露，约三个月，一亿多条消息。 | company            | claim-poke-015                 | Cognition 披露       |
| 为什么放进联系人列表？                | editorial-analysis | claim-poke-010, claim-poke-015 | 由入口与规模提出问题 |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-poke-010`, `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `联系人列表里的 AI` / `读邮件` / `改日历` / `主动来找你`
- Scene: `decision-messaging`
- Visual intent: 联系人卡连接邮件、日历和主动提醒，工作台轮廓退到背景，只保留入口选择。
- Pace switch: 用具体能力回答入口问题。
- Fact boundary: 不宣称 Poke 没有网页或其他设置界面。

### Narration

Poke 把 AI 放进联系人列表：能读邮件、改日历，还会主动找你。

### Narration units

| Text                                     | Mode    | Claim IDs                      | Attribution       |
| ---------------------------------------- | ------- | ------------------------------ | ----------------- |
| Poke 把 AI 放进联系人列表：能读邮件、改日历， | company | claim-poke-010, claim-poke-011 | 官方入口与能力说明 |
| 还会主动找你。                           | company | claim-poke-010                 | 官方主动消息说明   |

## seg-004

- Section: `user-pull`
- Time range: `0:20–0:34`
- Target seconds: `14`
- Claim IDs: `claim-poke-006`, `claim-poke-008`
- Source identity: 创始人口述
- On-screen text: `早期：邮件客户端` / `别再让我学新界面` / `提醒吃药` / `天气` / `球赛`
- Scene: `beta-user-pull`
- Visual intent: 邮件工作台因用户反馈收起，三条 Beta 请求随后穿过邮箱边界，画面扩到日常任务。
- Pace switch: 团队选择立刻切到用户动作。
- Fact boundary: 不虚构用户身份、场景、任务比例或独立留存结论。

### Narration

团队最早想做邮件客户端；用户却说，别再让我学一套界面。内测用户又让它提醒吃药、查天气、报球赛。

### Narration units

| Text                                               | Mode    | Claim IDs                      | Attribution   |
| -------------------------------------------------- | ------- | ------------------------------ | ------------- |
| 团队最早想做邮件客户端；用户却说，别再让我学一套界面。 | founder | claim-poke-006                 | 创始人口述     |
| 内测用户又让它提醒吃药、查天气、报球赛。               | founder | claim-poke-008                 | 创始人口述     |

## seg-005

- Section: `sharing`
- Time range: `0:34–0:48`
- Target seconds: `14`
- Claim IDs: `claim-poke-004`, `claim-poke-006`, `claim-poke-010`, `claim-poke-012`
- Source identity: 创始人口述 + 官方入口说明 + Poke Release Notes + 产品文档
- On-screen text: `工作台收起` / `联系人留下` / `Recipe：把设置做成链接` / `账户仍需授权` / `2026.03.19 全面开放`
- Scene: `recipe-release`
- Visual intent: 工作台退出后只留下联系人，再把 Recipe 设置卡传给下一位用户，最后硬切真实 Release Notes。
- Pace switch: 用户动作进入可分享配置，再用真实页面确认公开节点。
- Fact boundary: 不写成无条件一键完成，不宣称 Recipe 造成增长。

### Narration

所以，工作台收起了，消息入口留下来。Recipe 把背景和服务做成链接，账户仍要自己授权。2026 年 3 月 19 日，候补名单取消，Recipe 开放。

### Narration units

| Text                                              | Mode               | Claim IDs                      | Attribution        |
| ------------------------------------------------- | ------------------ | ------------------------------ | ------------------ |
| 所以，工作台收起了，消息入口留下来。             | editorial-analysis | claim-poke-006, claim-poke-010 | 只表达来源支持的方向变化 |
| Recipe 把背景和服务做成链接，账户仍要自己授权。    | company            | claim-poke-012                 | 官方产品文档       |
| 2026 年 3 月 19 日，候补名单取消，Recipe 开放。    | company            | claim-poke-004                 | 官方 Release Notes |

## seg-006

- Section: `ending-payoff`
- Time range: `0:48–1:00`
- Target seconds: `12`
- Claim IDs: `claim-poke-010`, `claim-poke-011`, `claim-poke-015`
- Source identity: 官方能力说明 + Cognition 披露
- On-screen text: `约三个月` / `1 亿+ 条消息` / `联系人入口` / `日历已更新` / `功能演示`
- Scene: `ending-known-edge`
- Visual intent: 一亿消息收拢到联系人入口，最后回到开场的已更新日历并持续标“功能演示”。
- Pace switch: 不追加新事实，用同一个动作回答产品选择。
- Fact boundary: 消息规模不写成用户或留存；结尾停在来源支持的功能演示。

### Narration

到收购前约三个月，往来超过一亿条消息。入口变了，动作没变：发一句话，日历已经改好了。

### Narration units

| Text                                  | Mode          | Claim IDs                      | Attribution              |
| ------------------------------------- | ------------- | ------------------------------ | ------------------------- |
| 到收购前约三个月，往来超过一亿条消息。 | company       | claim-poke-015                 | 画面标 Cognition 口径     |
| 入口变了，动作没变：发一句话，日历已经改好了。 | demonstration | claim-poke-010, claim-poke-011 | 官方能力说明；标功能演示 |
