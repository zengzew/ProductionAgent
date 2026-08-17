# Suno Final Script

状态：`story-approved`
选中 Hook：`lyrics-to-song`
目标时长：60 秒
生产说明：任何旁白调整都必须重新生成 TTS、字幕、时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-suno-001`
- Source identity: 官网与维基交叉核对
- On-screen text: `发送一句歌词` / `生成带人声的歌` / `功能演示`
- Scene: `hook-lyrics-to-song`
- Visual intent: 输入框写入歌词，随后生成按钮点亮，带人声的歌曲波形出现，持续标“功能演示”。
- Pace switch: 无淡入，先给完成后的作品。
- Fact boundary: 不冒充真实用户个案，不承诺音质。

### Narration

输入一句歌词，它给你一首带人声的歌。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 输入一句歌词，它给你一首带人声的歌。 | demonstration | claim-suno-001 | 官方能力说明；标功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:11`
- Target seconds: `8`
- Claim IDs: `claim-suno-002`, `claim-suno-003`, `claim-suno-011`
- Source identity: 维基与创始人访谈
- On-screen text: `会写代码的音乐人` / `九成在创作` / `创始人口径`
- Scene: `hook-founder-need`
- Visual intent: 真实创作者做歌的画面上，叠出音乐人创始人和九成创作进度条。
- Pace switch: 从作品切到需求。
- Fact boundary: 九成是创始人访谈口径，不写成独立审计。

### Narration

创始人是会写代码的音乐人。平台上九成活跃用户在创作，不是收听。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 创始人是会写代码的音乐人。 | independently-verified | claim-suno-002, claim-suno-003 | 创立团队与创始人身份 |
| 平台上九成活跃用户在创作，不是收听。 | founder | claim-suno-011 | 创始人访谈口径 |

## seg-003

- Section: `hook`
- Time range: `0:11–0:20`
- Target seconds: `9`
- Claim IDs: `claim-suno-017`, `claim-suno-018`
- Source identity: Sequoia 创始人播客
- On-screen text: `先做听懂声音` / `早期 12.5 秒` / `市场后来给了它什么价？`
- Scene: `hook-early-limit`
- Visual intent: 短波形试了两次对不上歌词，随后问题落下。
- Pace switch: 用早期限制打开市场定价问题。
- Fact boundary: 不补写顿悟，只保留创始人说过的早期限制。

### Narration

一开始他们觉得做出好歌太难，先做听懂声音。早期只能做出十几秒、还不听词的小段。市场后来给了它什么价？

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 一开始他们觉得做出好歌太难，先做听懂声音。 | founder | claim-suno-017 | 创始人播客 |
| 早期只能做出十几秒、还不听词的小段。 | founder | claim-suno-018 | 创始人播客 |
| 市场后来给了它什么价？ | editorial-analysis | claim-suno-017 | 由早期限制提出问题 |

## seg-004

- Section: `choice`
- Time range: `0:20–0:34`
- Target seconds: `14`
- Claim IDs: `claim-suno-019`
- Source identity: Sequoia 创始人播客
- On-screen text: `Discord 机器人` / `学 Midjourney` / `看有没有人玩`
- Scene: `choice-discord-cold-start`
- Visual intent: Discord 机器人消息一条条冒出来，有人开始点生成，标创始人访谈口径。
- Pace switch: 从限制切到冷启动动作。
- Fact boundary: 不把 Discord 写成增长必然性，只写创始人说过的确认时刻。

### Narration

他们学 Midjourney，先在 Discord 放了个机器人，看有没有人玩。结果很多人真的玩起来。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 他们学 Midjourney，先在 Discord 放了个机器人，看有没有人玩。 | founder | claim-suno-019 | 创始人播客 |
| 结果很多人真的玩起来。 | founder | claim-suno-019 | 创始人播客 |

## seg-005

- Section: `body`
- Time range: `0:34–0:46`
- Target seconds: `12`
- Claim IDs: `claim-suno-005`, `claim-suno-006`
- Source identity: 维基
- On-screen text: `正式开放` / `微软 Copilot` / `免费四分钟`
- Scene: `body-open-copilot`
- Visual intent: Copilot 入口和免费四分钟按钮依次点亮，不做成日期清单。
- Pace switch: 冷启动切到更大的获客动作。
- Fact boundary: 只介绍公开节点，不写成功率。

### Narration

后来正式开放，还进了微软 Copilot。免费用户也能生成四分钟的歌。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 后来正式开放，还进了微软 Copilot。 | independently-verified | claim-suno-005 | 官方日期与微软合作 |
| 免费用户也能生成四分钟的歌。 | independently-verified | claim-suno-006 | V3 官方节点 |

## seg-006

- Section: `ending-payoff`
- Time range: `0:46–1:00`
- Target seconds: `14`
- Claim IDs: `claim-suno-008`, `claim-suno-009`, `claim-suno-010`
- Source identity: 华尔街见闻与 36氪
- On-screen text: `付费 200 万` / `ARR 1 亿 → 3 亿` / `融资 3.75 亿` / `估值 24.5 亿` / `公司/媒体口径`
- Scene: `ending-market-price`
- Visual intent: 付费、ARR、融资和估值四个数字依次落下，来源条同期出现，停在估值上。
- Pace switch: 不追加新机制，用资本市场证据回答开场。
- Fact boundary: 不换算利润或留存，不写成必然成功。

### Narration

现在付费用户三个月翻倍到两百万。年化收入四个月从 1 亿美元到 3 亿美元，累计融资约 3.75 亿美元，估值约 24.5 亿美元。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 现在付费用户三个月翻倍到两百万。 | company | claim-suno-008 | 公司/媒体披露 |
| 年化收入四个月从 1 亿美元到 3 亿美元， | company | claim-suno-009 | 公司/媒体披露 |
| 累计融资约 3.75 亿美元，估值约 24.5 亿美元。 | company | claim-suno-010 | 36氪 |
