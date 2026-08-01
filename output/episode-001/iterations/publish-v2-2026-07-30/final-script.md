# Poke Final Script

状态：`story-approved`
选中 Hook：`one-message-one-hundred-million-cost`
目标时长：180 秒（3 分钟）
生产说明：旁白、画面文字与 Claim Ledger 已重新绑定。任何旁白调整都必须重新生成 TTS、字幕、生产时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-poke-011`
- Source identity: 官方能力说明
- On-screen text: `发给一个联系人` / `把周三会议改到下午三点` / `日历已更新`
- Scene: `hook-calendar-action`
- Visual intent: 第一帧即出现消息气泡与移动中的日历卡，持续标注“功能演示”；动作在三秒内完成。
- Pace switch: 不先解释产品，先让真实账户里的动作发生。
- Fact boundary: 这是官方能力的功能演示，不冒充真实用户个案，不宣称执行成功率。

### Narration

给一个联系人发句话，它就能替你改日历。

### Narration units

| Text                                   | Mode          | Claim IDs      | Attribution                |
| -------------------------------------- | ------------- | -------------- | -------------------------- |
| 给一个联系人发句话，它就能替你改日历。 | demonstration | claim-poke-011 | 官方能力说明；标“功能演示” |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-poke-015`, `claim-poke-021`
- Source identity: Cognition 披露 + 创始人口述
- On-screen text: `约三个月` / `1 亿+ 条消息` / `运行昂贵，也很难赚钱`
- Scene: `hook-metric-cost`
- Visual intent: “1 亿+”占满画面，消息计数仍在增长；随后成本警示从数字中切开，数据口径和来源留在画面小字。
- Pace switch: 三秒动作后立刻给出规模与代价的冲突。
- Fact boundary: 消息数不是用户数、留存、收入或成功任务数；难盈利来自创始人口述。

### Narration

三个月，这样的往来超过一亿条。可创始人说，Poke 跑起来很贵，也很难赚钱。

### Narration units

| Text                                      | Mode    | Claim IDs      | Attribution               |
| ----------------------------------------- | ------- | -------------- | ------------------------- |
| 三个月，这样的往来超过一亿条。            | company | claim-poke-015 | 画面小字标 Cognition 披露 |
| 可创始人说，Poke 跑起来很贵，也很难赚钱。 | founder | claim-poke-021 | 创始人口述                |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-poke-010`, `claim-poke-011`, `claim-poke-021`
- Source identity: 官方能力说明 + 创始人口述
- On-screen text: `住在联系人列表里的 AI` / `读邮件` / `改日历` / `主动来找你` / `为什么越用越贵？`
- Scene: `hook-core-question`
- Visual intent: 联系人卡连接邮件与日历，随后所有连线变成持续调用的脉冲；画面停在全片唯一问题。
- Pace switch: 补齐产品心智模型，并把规模冲突变成待解问题。
- Fact boundary: 不宣称 Poke 没有网页或设置界面；成本问题只由已披露的实时调用支撑。

### Narration

Poke 是联系人列表里的 AI 助手。它能读邮件、动日历，也会主动来找你。为什么这个省掉界面的产品，反而越用越贵？

### Narration units

| Text                                     | Mode               | Claim IDs                      | Attribution              |
| ---------------------------------------- | ------------------ | ------------------------------ | ------------------------ |
| Poke 是联系人列表里的 AI 助手。          | company            | claim-poke-010                 | 官方消息入口说明         |
| 它能读邮件、动日历，也会主动来找你。     | company            | claim-poke-010, claim-poke-011 | 官方能力说明             |
| 为什么这个省掉界面的产品，反而越用越贵？ | editorial-analysis | claim-poke-021                 | 基于实时任务成本提出问题 |

## seg-004

- Section: `problem-and-definition`
- Time range: `0:20–0:38`
- Target seconds: `18`
- Claim IDs: `claim-poke-007`
- Source identity: 公司和投资方对痛点的概括
- On-screen text: `邮件改时间` / `复制` / `挪日历` / `补提醒` / `下一封邮件，再来一遍`
- Scene: `problem-fragmentation`
- Visual intent: 首帧标“流程示意、功能演示”；邮件日期被复制到日历和待办，原邮件变更后，三处同时亮红。
- Pace switch: 从巨大数字切回观众熟悉的一次小麻烦。
- Fact boundary: 场景是对跨应用负担的演示，不是独立用户个案。

### Narration

先看它接住了什么。你收到一封邮件，会议改到周四。你得复制时间，打开日历，挪日程，再去待办里补提醒。下一封邮件一来，又得从头对一遍。团队盯上的，是这些散在三个窗口里的小动作。

### Narration units

| Text                                                                             | Mode               | Claim IDs      | Attribution              |
| -------------------------------------------------------------------------------- | ------------------ | -------------- | ------------------------ |
| 先看它接住了什么。                                                               | editorial-analysis | claim-poke-007 | 承接产品痛点             |
| 你收到一封邮件，会议改到周四。你得复制时间，打开日历，挪日程，再去待办里补提醒。 | demonstration      | claim-poke-007 | 从第一帧标“功能演示”     |
| 下一封邮件一来，又得从头对一遍。                                                 | demonstration      | claim-poke-007 | 演示多处同步负担         |
| 团队盯上的，是这些散在三个窗口里的小动作。                                       | editorial-analysis | claim-poke-007 | 不外推为所有人的固定流程 |

## seg-005

- Section: `discovery-and-decision`
- Time range: `0:38–0:56`
- Target seconds: `18`
- Claim IDs: `claim-poke-006`, `claim-poke-010`
- Source identity: 创始人口述 + 官方能力说明
- On-screen text: `最早：邮件客户端与自动化` / `用户反馈：别再让我学新界面` / `工作台收起` / `联系人留下`
- Scene: `decision-messaging`
- Visual intent: 邮件客户端草图先铺满屏幕，访谈反馈压上来后，所有工具栏向外退场，只留下联系人卡。
- Pace switch: 第一次明确的产品选择，视觉上直接删除界面。
- Fact boundary: 不补会议、精确日期或一句话决定。

### Narration

最早，他们想做一套围着邮箱转的客户端和自动化。访谈里的用户却给了一个很直接的反馈：别再让我学新界面。团队于是把工作台收起来，把 Poke 放进消息列表。功能不再等人去找，用户只需要发一句话。

### Narration units

| Text                                                   | Mode    | Claim IDs                      | Attribution            |
| ------------------------------------------------------ | ------- | ------------------------------ | ---------------------- |
| 最早，他们想做一套围着邮箱转的客户端和自动化。         | founder | claim-poke-006                 | 创始人回忆             |
| 访谈里的用户却给了一个很直接的反馈：别再让我学新界面。 | founder | claim-poke-006                 | 对来源信息的口语化转述 |
| 团队于是把工作台收起来，把 Poke 放进消息列表。         | founder | claim-poke-006, claim-poke-010 | 只描述来源支持的转向   |
| 功能不再等人去找，用户只需要发一句话。                 | company | claim-poke-010                 | 官方消息入口说明       |

## seg-006

- Section: `discovery-and-decision`
- Time range: `0:56–1:13`
- Target seconds: `17`
- Claim IDs: `claim-poke-008`
- Source identity: 创始人口述 Beta 使用
- On-screen text: `用户没有按原计划使用` / `提醒吃药` / `问天气` / `问球赛结果` / `邮件助手被带出邮箱`
- Scene: `beta-user-pull`
- Visual intent: “邮件助手”边界框出现裂口，三条来源中出现过的 Beta 请求穿过边界，画面构图从邮箱扩到生活任务。
- Pace switch: 团队选择之后，立刻给出用户如何再次改写产品。
- Fact boundary: 不虚构用户姓名、场景、使用占比或精确转向日期。

### Narration

真正把方向推远的，是 Beta 用户。他们没只把 Poke 当邮件助手。有人让它提醒吃药，有人问天气和球赛结果。团队原来想替人整理邮箱，用户却在把它当成一个随时能叫到的助手。产品的边界，就这样被真实请求往外拉。

### Narration units

| Text                                                                 | Mode               | Claim IDs      | Attribution          |
| -------------------------------------------------------------------- | ------------------ | -------------- | -------------------- |
| 真正把方向推远的，是 Beta 用户。                                     | founder            | claim-poke-008 | 创始人回忆 Beta 行为 |
| 他们没只把 Poke 当邮件助手。有人让它提醒吃药，有人问天气和球赛结果。 | founder            | claim-poke-008 | 任务均来自创始人口述 |
| 团队原来想替人整理邮箱，用户却在把它当成一个随时能叫到的助手。       | editorial-analysis | claim-poke-008 | 概括任务范围变化     |
| 产品的边界，就这样被真实请求往外拉。                                 | editorial-analysis | claim-poke-008 | 不新增任务类型       |

## seg-007

- Section: `solution-and-risk`
- Time range: `1:13–1:33`
- Target seconds: `20`
- Claim IDs: `claim-poke-010`, `claim-poke-011`, `claim-poke-024`
- Source identity: 官方能力说明 + 服务条款
- On-screen text: `它能先开口` / `授权后可读邮件、改日历` / `少切窗口` / `错误会直接留下`
- Scene: `proactive-permission-risk`
- Visual intent: 联系人先主动发提醒，授权门打开后邮件和日历被连接；一次日历移动先成功，随后同一动作以红色落在错误时间。
- Pace switch: 便利第一次与真实后果同时出现。
- Fact boundary: 不宣称发生过真实事故或具体错误率；错误可能性来自官方条款。

### Narration

入口变成联系人以后，Poke 还能先开口。时间到了，它发来提醒；邮件变了，它跟着追；你授权以后，它可以读邮件、改日历、草拟回复。省下来的，是你来回切窗口的动作。交出去的，是对真实账户的操作权。你少点了几下，它改错一次也会直接留在日历里。

### Narration units

| Text                                                                                                                                                                                                                                    | Mode               | Claim IDs                                      | Attribution                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- | -------------------------- |
| 入口变成联系人以后，Poke 还能先开口。时间到了，它发来提醒；邮件变了，它跟着追；你授权以后，它可以读邮件、改日历、草拟回复。省下来的，是你来回切窗口的动作。交出去的，是对真实账户的操作权。你少点了几下，它改错一次也会直接留在日历里。 | editorial-analysis | claim-poke-010, claim-poke-011, claim-poke-024 | 官方能力与假设后果完整承接 |

## seg-008

- Section: `distribution`
- Time range: `1:33–1:49`
- Target seconds: `16`
- Claim IDs: `claim-poke-004`, `claim-poke-012`
- Source identity: Poke 官方 Release Notes + 官方产品文档
- On-screen text: `Recipe：把设置做成链接` / `朋友从配好的设置开始` / `账户仍需自己授权` / `2026.03.19 候补名单取消`
- Scene: `recipe-release`
- Visual intent: 一张 Recipe 卡被复制并发送给另一个联系人；随后真实 Release Notes 截图切入，3 月 19 日被放大。
- Pace switch: 从单人使用切到可分享设置与公开扩张。
- Fact boundary: 不写成无条件一键完成，不宣称 Recipe 造成增长。

### Narration

还有一个能直接分享的设计。Poke 把背景设定、开场白和要连接的服务，装进 Recipe 链接。朋友点开，就能从配好的设置开始，账户授权仍要自己完成。2026 年 3 月 19 日，候补名单取消，Recipe 同时开放。

### Narration units

| Text                                                      | Mode               | Claim IDs      | Attribution        |
| --------------------------------------------------------- | ------------------ | -------------- | ------------------ |
| 还有一个能直接分享的设计。                                | editorial-analysis | claim-poke-012 | 描述可分享机制     |
| Poke 把背景设定、开场白和要连接的服务，装进 Recipe 链接。 | company            | claim-poke-012 | 官方产品文档       |
| 朋友点开，就能从配好的设置开始，账户授权仍要自己完成。    | company            | claim-poke-012 | 保留授权边界       |
| 2026 年 3 月 19 日，候补名单取消，Recipe 同时开放。       | company            | claim-poke-004 | 官方 Release Notes |

## seg-009

- Section: `evidence`
- Time range: `1:49–2:09`
- Target seconds: `20`
- Claim IDs: `claim-poke-004`, `claim-poke-015`, `claim-poke-017`, `claim-poke-021`
- Source identity: Poke 官方公告 + Cognition 披露 + 创始人口述
- On-screen text: `03.19 全面开放` / `06.04 进入 Apple Messages for Business` / `约三个月 1 亿+ 条消息` / `一次任务，不只一来一回`
- Scene: `growth-cost-counter`
- Visual intent: 三个公开节点以不同节奏落下；“1 亿+”出现后，单条用户消息向后展开成多次请求和工具调用。
- Pace switch: 数据高潮不结束故事，而是打开成本问题。
- Fact boundary: 消息数不是用户数、留存、收入或成功任务数；不宣称公开节点造成增长。

### Narration

三月全面开放，六月又进入 Apple Messages for Business。到收购前，Cognition 披露，约三个月里，人们与 Poke 往来超过一亿条消息。这个数字不是用户数，却把产品的使用方式露了出来：一次任务，可能不只是一来一回。

### Narration units

| Text                                                                           | Mode               | Claim IDs                      | Attribution                 |
| ------------------------------------------------------------------------------ | ------------------ | ------------------------------ | --------------------------- |
| 三月全面开放，六月又进入 Apple Messages for Business。                         | company            | claim-poke-004, claim-poke-017 | 只列公开时间节点            |
| 到收购前，Cognition 披露，约三个月里，人们与 Poke 往来超过一亿条消息。         | company            | claim-poke-015                 | 保留 Cognition 归因与统计期 |
| 这个数字不是用户数，却把产品的使用方式露了出来：一次任务，可能不只是一来一回。 | editorial-analysis | claim-poke-015, claim-poke-021 | 由消息口径进入持续调用      |

## seg-010

- Section: `technology-and-cost`
- Time range: `2:09–2:27`
- Target seconds: `18`
- Claim IDs: `claim-poke-021`
- Source identity: 创始人口述
- On-screen text: `新邮件到达：自动化运行` / `航班未落地：持续刷新` / `一句请求` / `多次模型与工具调用`
- Scene: `cost-call-chain`
- Visual intent: 一条短消息停在左侧，右侧的邮件监听、航班刷新、模型和工具节点反复脉冲；不画金额。
- Pace switch: 由增长数字切到用户看不见的运行过程，音效改成持续低频脉冲。
- Fact boundary: 不推算调用次数、单位成本或毛利率。

### Narration

创始人举过两个例子。新邮件一到，自动化就跑一遍；查航班，它得一直刷新。你只发了一句，模型和工具可能在后台接着调用。任务越实时，调用越停不下来。那个最省事的消息入口，也把推理成本藏到了用户看不见的地方。

### Narration units

| Text                                                                     | Mode               | Claim IDs      | Attribution      |
| ------------------------------------------------------------------------ | ------------------ | -------------- | ---------------- |
| 创始人举过两个例子。新邮件一到，自动化就跑一遍；查航班，它得一直刷新。   | founder            | claim-poke-021 | 创始人成本说明   |
| 你只发了一句，模型和工具可能在后台接着调用。任务越实时，调用越停不下来。 | editorial-analysis | claim-poke-021 | 解释持续推理成本 |
| 那个最省事的消息入口，也把推理成本藏到了用户看不见的地方。               | editorial-analysis | claim-poke-021 | 不推算具体金额   |

## seg-011

- Section: `turning-point`
- Time range: `2:27–2:43`
- Target seconds: `16`
- Claim IDs: `claim-poke-019`, `claim-poke-021`, `claim-poke-022`
- Source identity: 创始人口述 + Cognition 收购公告 + TechCrunch
- On-screen text: `运行昂贵，很难盈利` / `2026.07.23 Cognition 收购` / `计划接入自己的模型与基础设施` / `Poke 暂时照常`
- Scene: `acquisition-infrastructure`
- Visual intent: 成本调用画面突然静音清空，随后整屏切入 Cognition 收购公告；模型与基础设施计划只在公告之后出现。
- Pace switch: 全片最大转折；用空拍隔开成本与收购，避免制造收购动机。
- Fact boundary: 不把难盈利写成收购原因，不宣称整合已经完成或成本已经下降。

### Narration

创始人承认，Poke 运行昂贵，也很难盈利。2026 年 7 月 23 日，Cognition 宣布收购开发 Poke 的公司。它给出的下一步，是让 Poke 接上自己的模型和基础设施。Poke 暂时照常使用，长期会不会完全并入，当时还没定。

### Narration units

| Text                                                     | Mode                   | Claim IDs      | Attribution            |
| -------------------------------------------------------- | ---------------------- | -------------- | ---------------------- |
| 创始人承认，Poke 运行昂贵，也很难盈利。                  | founder                | claim-poke-021 | 创始人口述             |
| 2026 年 7 月 23 日，Cognition 宣布收购开发 Poke 的公司。 | independently-verified | claim-poke-019 | 收购公告与媒体交叉核对 |
| 它给出的下一步，是让 Poke 接上自己的模型和基础设施。     | company                | claim-poke-022 | Cognition 公告         |
| Poke 暂时照常使用，长期会不会完全并入，当时还没定。      | editorial-analysis     | claim-poke-022 | 保留当前与长期边界     |

## seg-012

- Section: `boundary-and-ending`
- Time range: `2:43–3:00`
- Target seconds: `17`
- Claim IDs: `claim-poke-006`, `claim-poke-008`, `claim-poke-010`, `claim-poke-015`, `claim-poke-021`, `claim-poke-024`
- Source identity: 创始人口述 + 官方能力说明 + Cognition 披露 + 服务条款
- On-screen text: `关键选择：让 AI 住进消息列表` / `用户少切一次窗口` / `后台可能多跑很多次` / `下一次改错日程，你还会继续吗？`
- Scene: `ending-known-edge`
- Visual intent: 开场的消息、日历和联系人重新出现；用户的一条消息在前景，后台调用继续延伸，最后日历移到错误时间并停住。
- Pace switch: 回答开场，再把便利、成本和信任压回同一个动作。
- Fact boundary: 不把消息数写成用户、留存或增长归因；错误日程是假设后果，不是真实事故。

### Narration

Poke 当初把工作台收起来，住进了人们每天都看的消息列表。Beta 用户接着把它从邮箱带进生活。到了收购前，Cognition 披露的往来已经超过一亿条消息。可用户少切一次窗口，后台可能要多跑很多次。下一次它把会议挪错，你还会不会继续给它发消息？

### Narration units

| Text                                                    | Mode               | Claim IDs                      | Attribution              |
| ------------------------------------------------------- | ------------------ | ------------------------------ | ------------------------ |
| Poke 当初把工作台收起来，住进了人们每天都看的消息列表。 | editorial-analysis | claim-poke-006, claim-poke-010 | 回答团队的入口选择       |
| Beta 用户接着把它从邮箱带进生活。                       | editorial-analysis | claim-poke-008                 | 承接 Beta 用户行为       |
| 到了收购前，Cognition 披露的往来已经超过一亿条消息。    | company            | claim-poke-015                 | 保留来源与消息口径       |
| 可用户少切一次窗口，后台可能要多跑很多次。              | editorial-analysis | claim-poke-021                 | 回到持续调用成本         |
| 下一次它把会议挪错，你还会不会继续给它发消息？          | editorial-analysis | claim-poke-010, claim-poke-024 | 假设后果；不冒充真实事故 |
