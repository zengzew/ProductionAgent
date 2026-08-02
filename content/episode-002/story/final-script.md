# Roost Social Final Script

状态：`story-approved`
选中 Hook：`message-flies-for-days`
目标时长：180 秒（3 分钟）
生产说明：任何旁白调整都必须重新生成 TTS、字幕、生产时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-roost-003`
- Source identity: 官网、商店与媒体交叉核对
- On-screen text: `周末见 · 已发送` / `预计三天后到达` / `功能演示`
- Scene: `hook-send-bird`
- Visual intent: 第一帧就是已发送气泡，虚拟鸟已经离开起点，倒计时正在变化；全程
  标注“功能演示”。
- Pace switch: 不解释产品名，先给已经发生的结果。
- Fact boundary: 路线和文案为功能演示，不冒充真实用户通信。

### Narration

这条消息已经发出，三天后才到。

### Narration units

| Text                           | Mode          | Claim IDs       | Attribution        |
| ------------------------------ | ------------- | --------------- | ------------------ |
| 这条消息已经发出，三天后才到。 | demonstration | claim-roost-003 | 产品机制的功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-roost-003`, `claim-roost-008`
- Source identity: 官网、商店与独立体验交叉核对
- On-screen text: `不是网络卡住` / `按距离和鸟速送达` / `发出后不能撤回或加速`
- Scene: `hook-rule-growth`
- Visual intent: App Store 真实页面在“Messages don't send instantly. They fly”应用截图处
  停留；旁边同步出现不可撤回、不可加速的规则卡。
- Pace switch: 从功能演示切到真实应用页面，完成唯一一次认知修正。
- Fact boundary: 商店页面是产品自述；发送约束来自独立体验，不外推所有使用场景。

### Narration

不是网络卡住。Roost 按距离和鸟速送信。发送以后，不能撤回，也不能加速。

### Narration units

| Text                                   | Mode                   | Claim IDs       | Attribution  |
| -------------------------------------- | ---------------------- | --------------- | ------------ |
| 不是网络卡住。Roost 按距离和鸟速送信。 | independently-verified | claim-roost-003 | 官网与商店   |
| 发送以后，不能撤回，也不能加速。       | independently-verified | claim-roost-008 | 独立体验记录 |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-roost-003`, `claim-roost-004`, `claim-roost-009`
- Source identity: 官网、商店与创始人口径
- On-screen text: `慢速通讯 App` / `选一只鸟` / `看它飞到朋友那里` / `为什么有人偏要等？`
- Scene: `hook-core-question`
- Visual intent: 官网真实页面先建立地图送信心智模型；标注“创始人口径”的数字从一万
  升到十万，最后只留下全片问题。
- Pace switch: 数字停住，画面第一次放慢。
- Fact boundary: 三日增长来自创始人口径，不代表留存或总体采用原因。

### Narration

Roost 是慢速通讯 App，聊天变成一段看得见的等待。三天，用户从一万涨到十万。为什么有人偏要等？

### Narration units

| Text                                             | Mode                   | Claim IDs                        | Attribution  |
| ------------------------------------------------ | ---------------------- | -------------------------------- | ------------ |
| Roost 是慢速通讯 App，聊天变成一段看得见的等待。 | independently-verified | claim-roost-003, claim-roost-004 | 产品心智模型 |
| 三天，用户从一万涨到十万。                       | founder                | claim-roost-009                  | 创始人口径   |
| 为什么有人偏要等？                               | editorial-analysis     | claim-roost-003, claim-roost-009 | 全片唯一问题 |

## seg-004

- Section: `problem`
- Time range: `0:20–0:38`
- Target seconds: `18`
- Claim IDs: `claim-roost-007`, `claim-roost-008`
- Source identity: 创始人口述 + 独立体验
- On-screen text: `已读` / `正在输入` / `怎么还没回` / `发送后不能撤回、编辑、加速`
- Scene: `instant-pressure`
- Visual intent: 通知、已读和输入状态高速叠加；发送后画面忽然安静，只剩飞行中的鸟。
- Pace switch: 快切转成长镜头，观众真实等两秒。
- Fact boundary: 压力与期待分别来自创始人和单一体验者，不写成普遍心理效果。

### Narration

普通聊天里，消息刚发出去，已读、正在输入、怎么还没回，马上挤到一起。Roost 做了一个很硬的选择：消息一飞走，不能撤回，不能编辑，鸟也不能加速。TechCrunch 采访里的创始人说，他想给人留一段不用立刻反应的时间。另一位体验者发现，自己开始先想清楚，这句话值不值得派一只鸟。

### Narration units

| Text                                                                     | Mode                   | Claim IDs                        | Attribution            |
| ------------------------------------------------------------------------ | ---------------------- | -------------------------------- | ---------------------- |
| 普通聊天里，消息刚发出去，已读、正在输入、怎么还没回，马上挤到一起。     | editorial-analysis     | claim-roost-007, claim-roost-008 | 将来源描述落到可见动作 |
| Roost 做了一个很硬的选择：消息一飞走，不能撤回，不能编辑，鸟也不能加速。 | independently-verified | claim-roost-008                  | WhistleOut 实测        |
| TechCrunch 采访里的创始人说，他想给人留一段不用立刻反应的时间。          | founder                | claim-roost-007                  | 创始人口述             |
| 另一位体验者发现，自己开始先想清楚，这句话值不值得派一只鸟。             | independently-verified | claim-roost-008                  | 单一媒体体验           |

## seg-005

- Section: `origin`
- Time range: `0:38–0:56`
- Target seconds: `18`
- Claim IDs: `claim-roost-002`, `claim-roost-005`, `claim-roost-006`
- Source identity: 创始人口述 + 发布日期交叉核对
- On-screen text: `2025.05 业余项目` / `朋友先试` / `2026.04.28 公开发布`
- Scene: `origin-friends-publish`
- Visual intent: 一张概念视频卡交到几位朋友手里，朋友的消息推动上架按钮亮起。
- Pace switch: 从用户压力回到产品出现前。
- Fact boundary: 不虚构开发地点、团队会议或朋友原话。

### Narration

它最早没打算做成一门公开生意。2025 年 5 月，Logan Mendelsohn 和朋友把虚拟鸟送信做成业余项目，先发了一段概念视频。后来他做出能用的版本，只给身边人试。朋友玩得很开心，催他把应用送上商店。2026 年 4 月 28 日，Roost 正式公开。

### Narration units

| Text                                                                                                              | Mode                   | Claim IDs                        | Attribution             |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------- | ----------------------- |
| 它最早没打算做成一门公开生意。2025 年 5 月，Logan Mendelsohn 和朋友把虚拟鸟送信做成业余项目，先发了一段概念视频。 | founder                | claim-roost-005                  | 创始人向 GamesBeat 回忆 |
| 后来他做出能用的版本，只给身边人试。朋友玩得很开心，催他把应用送上商店。                                          | founder                | claim-roost-005, claim-roost-006 | 创始人访谈              |
| 2026 年 4 月 28 日，Roost 正式公开。                                                                              | independently-verified | claim-roost-002                  | 平台与媒体交叉核对      |

## seg-006

- Section: `mechanism`
- Time range: `0:56–1:14`
- Target seconds: `18`
- Claim IDs: `claim-roost-003`, `claim-roost-004`
- Source identity: 官网、商店与媒体交叉核对
- On-screen text: `距离 × 物种速度 = 到达时间` / `猎鹰更快` / `蜂鸟更慢` / `乌龟也能送`
- Scene: `distance-speed-map`
- Visual intent: 三条不同速度的路线同时出发，地图上显示剩余时间；鸟舍卡片随路线展开。
- Pace switch: 第一次用程序化地图完整解释机制。
- Fact boundary: 只说明公开规则，不猜后台定位和路线算法。

### Narration

这个点子能撑起一个 App，靠的是三件连在一起的动作。先选信使。猎鹰快，蜂鸟慢，想等更久还能派蜗牛或乌龟。再看距离，同一只鸟，飞到隔壁城市和飞过一片大陆，时间不同。最后，地图把这段等待画出来。鸟飞到哪里，还剩多久，你都能看见。

### Narration units

| Text                                                                                                   | Mode                   | Claim IDs                        | Attribution |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------- | ----------- |
| 这个点子能撑起一个 App，靠的是三件连在一起的动作。先选信使。猎鹰快，蜂鸟慢，想等更久还能派蜗牛或乌龟。 | independently-verified | claim-roost-003, claim-roost-004 | 产品机制    |
| 再看距离，同一只鸟，飞到隔壁城市和飞过一片大陆，时间不同。                                             | independently-verified | claim-roost-003                  | 距离规则    |
| 最后，地图把这段等待画出来。鸟飞到哪里，还剩多久，你都能看见。                                         | independently-verified | claim-roost-004                  | 地图能力    |

## seg-007

- Section: `user-action`
- Time range: `1:14–1:32`
- Target seconds: `18`
- Claim IDs: `claim-roost-004`, `claim-roost-008`
- Source identity: 产品事实 + 独立体验
- On-screen text: `等待变得可看` / `鸟可以收集和训练` / `消息到达前，先去过自己的生活`
- Scene: `waiting-becomes-play`
- Visual intent: 飞行中的鸟缩成地图上的一个点，用户关掉手机；鸟舍里新鸟解锁。
- Pace switch: 保留短暂静音，让等待本身进入成片。
- Fact boundary: 不宣称收集机制造成留存，不把体验者感受写成所有用户。

### Narration

等待因此有了形状。你看到朋友的鸟正穿过海岸线，也能回到鸟舍，训练自己的鸟，或者玩一局小游戏。消息到达之前，应用没有逼你一直守着。WhistleOut 的体验者说，他反而开始期待那只鸟落地。慢在这里不再是空白，它成了一段能看、能聊、还能收集的过程。

### Narration units

| Text                                                                                         | Mode                   | Claim IDs                        | Attribution            |
| -------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------- | ---------------------- |
| 等待因此有了形状。你看到朋友的鸟正穿过海岸线，也能回到鸟舍，训练自己的鸟，或者玩一局小游戏。 | independently-verified | claim-roost-004                  | 产品事实               |
| 消息到达之前，应用没有逼你一直守着。                                                         | editorial-analysis     | claim-roost-008                  | 基于发送约束的体验概括 |
| WhistleOut 的体验者说，他反而开始期待那只鸟落地。                                            | independently-verified | claim-roost-008                  | 单一媒体体验           |
| 慢在这里不再是空白，它成了一段能看、能聊、还能收集的过程。                                   | editorial-analysis     | claim-roost-004, claim-roost-008 | 不外推留存             |

## seg-008

- Section: `turning-point`
- Time range: `1:32–1:50`
- Target seconds: `18`
- Claim IDs: `claim-roost-009`
- Source identity: TechCrunch 报道 + 创始人披露
- On-screen text: `一位母亲在 Threads 分享` / `女儿和朋友用古英语通信` / `10,000 → 100,000` / `3 天`
- Scene: `threads-elizabethan`
- Visual intent: 仿纸张消息卡用古英语问候，Threads 帖子轮廓出现；数字随后快速增长。
- Pace switch: 地图切成纸张与社交帖子，信息密度突然抬高。
- Fact boundary: 不展示孩子身份，不还原未授权头像；帖子与增长只写时序。

### Narration

真正让更多人看见它的，是一段很具体的使用。TechCrunch 报道，一位母亲在 Threads 写，女儿和朋友开始用伊丽莎白时代的英语通信，因为话真的要等鸟送到。帖子传开以后，创始人给出的数字是：三天，用户从一万升到十万。它们时间挨得很近，但一则帖子解释不了全部增长。

### Narration units

| Text                                                                                                                                             | Mode               | Claim IDs       | Attribution                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------- | ------------------------------------ |
| 真正让更多人看见它的，是一段很具体的使用。TechCrunch 报道，一位母亲在 Threads 写，女儿和朋友开始用伊丽莎白时代的英语通信，因为话真的要等鸟送到。 | founder            | claim-roost-009 | 媒体记录帖子，增长信息来自创始人口径 |
| 帖子传开以后，创始人给出的数字是：三天，用户从一万升到十万。                                                                                     | founder            | claim-roost-009 | 创始人披露                           |
| 它们时间挨得很近，但一则帖子解释不了全部增长。                                                                                                   | editorial-analysis | claim-roost-009 | 拒绝单一归因                         |

## seg-009

- Section: `evidence`
- Time range: `1:50–2:08`
- Target seconds: `18`
- Claim IDs: `claim-roost-010`, `claim-roost-011`, `claim-roost-012`, `claim-roost-019`
- Source identity: 创始人向 GamesBeat 与 TechCrunch 披露
- On-screen text: `2026.07.07` / `25 万+ 用户` / `每天 10 万+ 活跃对话` / `付费获客 $0`
- Scene: `growth-evidence`
- Visual intent: 数字按日期落下，活跃对话与用户数使用不同容器；底部始终标创始人口径。
- Pace switch: 全片数据高潮，随后立刻收窄口径。
- Fact boundary: 用户数不是活跃用户、留存或收入；接近三十万是次日创始人口径。

### Narration

到 7 月 7 日，Roost 已超过二十五万用户，每天有十万多个活跃对话，广告和付费获客花了零美元。第二天更新的数字接近三十万。数字能说明它传播得快，却还不能说明这些人过一个月会不会回来。

### Narration units

| Text                                                                                       | Mode               | Claim IDs                        | Attribution                        |
| ------------------------------------------------------------------------------------------ | ------------------ | -------------------------------- | ---------------------------------- |
| 到 7 月 7 日，Roost 已超过二十五万用户，每天有十万多个活跃对话，广告和付费获客花了零美元。 | founder            | claim-roost-010, claim-roost-012 | 画面小字标 GamesBeat 与创始人口径  |
| 第二天更新的数字接近三十万。                                                               | founder            | claim-roost-011                  | 画面小字标 TechCrunch 与创始人口径 |
| 数字能说明它传播得快，却还不能说明这些人过一个月会不会回来。                               | editorial-analysis | claim-roost-019                  | 留存边界                           |

## seg-010

- Section: `business`
- Time range: `2:08–2:26`
- Target seconds: `18`
- Claim IDs: `claim-roost-010`, `claim-roost-013`, `claim-roost-014`, `claim-roost-019`
- Source identity: App Store + 创始人向 GamesBeat 披露
- On-screen text: `卖单只虚拟鸟` / `支持者订阅` / `终身支持 $50` / `已售约 60–70 份`
- Scene: `bird-store`
- Visual intent: 鸟类商品卡轮换，50 美元支持者卡落下；用户规模缩到角落，付费份数保持真实比例。
- Pace switch: 从大用户数字切到小付费数字。
- Fact boundary: 不换算总收入、转化率、利润或现金流。

### Narration

接下来是更小、也更现实的数字。Roost 卖单只虚拟鸟，也卖支持者订阅。7 月 7 日时，五十美元的终身支持档卖了大约六十到七十份。项目没有外部融资，Mendelsohn 还在用业余时间维护。二十五万用户已经挤进鸟舍，愿意长期付钱的人有多少，才刚开始被测试。

### Narration units

| Text                                                               | Mode               | Claim IDs                                         | Attribution                       |
| ------------------------------------------------------------------ | ------------------ | ------------------------------------------------- | --------------------------------- |
| 接下来是更小、也更现实的数字。Roost 卖单只虚拟鸟，也卖支持者订阅。 | founder            | claim-roost-013                                   | 商店与采访                        |
| 7 月 7 日时，五十美元的终身支持档卖了大约六十到七十份。            | founder            | claim-roost-013                                   | 画面小字标 GamesBeat 与创始人口径 |
| 项目没有外部融资，Mendelsohn 还在用业余时间维护。                  | founder            | claim-roost-014                                   | 创始人披露                        |
| 二十五万用户已经挤进鸟舍，愿意长期付钱的人有多少，才刚开始被测试。 | editorial-analysis | claim-roost-010, claim-roost-013, claim-roost-019 | 不换算转化或盈利                  |

## seg-011

- Section: `safety`
- Time range: `2:26–2:43`
- Target seconds: `17`
- Claim IDs: `claim-roost-015`, `claim-roost-016`
- Source identity: 官方政策与创始人采访
- On-screen text: `朋友默认只看城市` / `精确位置需单独开启` / `Pen Pals 按年龄分组` / `照片开放需要审核`
- Scene: `privacy-safety`
- Visual intent: 精确坐标先被模糊成城市圈；陌生人卡按年龄分组，照片按钮停在闸门前。
- Pace switch: 温暖地图转为权限面板，声音收紧。
- Fact boundary: 照片未开放的状态固定到 2026-07-08；不宣称设计消除了风险。

### Narration

鸟要跨城飞，位置就绕不开。Roost 默认只让朋友看到城市，精确位置要单独给 close friends 打开。陌生人 Pen Pals 按年龄段匹配，还会提醒别交出真实联系方式。7 月 8 日的采访里，照片功能仍被挡在外面，要先补内容审核。慢可以降低交流速度，却不会自动解决陌生人和位置的风险。

### Narration units

| Text                                                                                        | Mode               | Claim IDs                        | Attribution      |
| ------------------------------------------------------------------------------------------- | ------------------ | -------------------------------- | ---------------- |
| 鸟要跨城飞，位置就绕不开。Roost 默认只让朋友看到城市，精确位置要单独给 close friends 打开。 | company            | claim-roost-015                  | 官方与创始人描述 |
| 陌生人 Pen Pals 按年龄段匹配，还会提醒别交出真实联系方式。                                  | company            | claim-roost-016                  | 官方与采访       |
| 7 月 8 日的采访里，照片功能仍被挡在外面，要先补内容审核。                                   | company            | claim-roost-016                  | 固定到采访日期   |
| 慢可以降低交流速度，却不会自动解决陌生人和位置的风险。                                      | editorial-analysis | claim-roost-015, claim-roost-016 | 风险边界         |

## seg-012

- Section: `ending`
- Time range: `2:43–3:00`
- Target seconds: `17`
- Claim IDs: `claim-roost-003`, `claim-roost-004`, `claim-roost-011`, `claim-roost-013`, `claim-roost-017`, `claim-roost-018`, `claim-roost-019`
- Source identity: 创始人采访 + 媒体与商店侧证
- On-screen text: `AI 辅助开发` / `AI 鸟图遭投诉` / `艺术家投稿活动` / `下一只鸟，谁来画？`
- Scene: `ai-art-ending`
- Visual intent: 代码行组成一只鸟，用户投诉将羽毛擦掉；空白鸟卡交给艺术家。开场的
  飞行路线再次出现，此时同时带着接近三十万的创始人口径和未填的留存曲线。
- Pace switch: 鸟落地，环境声停止，结尾不升华。
- Fact boundary: 不宣布艺术家活动已完成，不判断 AI 辅助开发的质量，不补写留存结论。

### Narration

增长之后，另一道产品选择摆到面前。Mendelsohn 用 Claude Code 帮自己开发，早期鸟图也由 AI 生成。用户开始投诉：这些鸟能用真钱购买，图却不该一直这样。创始人随后转去办艺术家投稿活动。开头那只鸟又飞回来了：慢送达已经被做成一个可见、可玩的产品规则。到 7 月 8 日，用户数字接近三十万。下一批鸟由谁画，多少人愿意付钱，一个月后还会不会回来？

### Narration units

| Text                                                                                           | Mode                   | Claim IDs                                         | Attribution        |
| ---------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------- | ------------------ |
| 增长之后，另一道产品选择摆到面前。Mendelsohn 用 Claude Code 帮自己开发，早期鸟图也由 AI 生成。 | founder                | claim-roost-017, claim-roost-018                  | 只写时序，不补因果 |
| 用户开始投诉：这些鸟能用真钱购买，图却不该一直这样。                                           | independently-verified | claim-roost-013, claim-roost-018                  | 媒体与商店评价侧证 |
| 创始人随后转去办艺术家投稿活动。                                                               | independently-verified | claim-roost-018                                   | 媒体记录创始人回应 |
| 开头那只鸟又飞回来了：慢送达已经被做成一个可见、可玩的产品规则。                               | editorial-analysis     | claim-roost-003, claim-roost-004                  | 回看产品选择       |
| 到 7 月 8 日，用户数字接近三十万。                                                             | founder                | claim-roost-011                                   | 画面标创始人口径   |
| 下一批鸟由谁画，多少人愿意付钱，一个月后还会不会回来？                                         | editorial-analysis     | claim-roost-013, claim-roost-018, claim-roost-019 | 停在具体待验证问题 |
