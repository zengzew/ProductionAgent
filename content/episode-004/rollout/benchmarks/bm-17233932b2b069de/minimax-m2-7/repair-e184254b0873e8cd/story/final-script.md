# Devin 最终口播脚本

状态：`story-approved`
目标时长：60 秒

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-devin-001`
- Source identity: 官方演示视频与官方博客
- On-screen text: `任务已交出去` / `它自己打开浏览器` / `功能演示`
- Scene: `hook-delegated-open`
- Visual intent: 第 0 帧官方演示已在进行中：任务已输入，Devin 随后打开自带浏览器并开始加载目标页，持续标"功能演示"。
- Pace switch: 无淡入，先给执行中的结果。
- Fact boundary: 不冒充真实用户个案，不宣称执行成功率。

### Narration

任务交出去，它自己打开浏览器，开始干活。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|------|------|-----------|-------------|
| 任务交出去，它自己打开浏览器，开始干活。 | independently-verified | claim-devin-001 | 官方演示视频与官方博客 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:11`
- Target seconds: `8`
- Claim IDs: `claim-devin-012`, `claim-devin-009`
- Source identity: 维基、Bloomberg 与官方博客
- On-screen text: `三个奥赛金牌程序员` / `自己把工程任务干完` / `工程师负责检查`
- Scene: `hook-founder-need`
- Visual intent: 官方演示里的人物口播收成三名创始人名字，随后切回它正在改代码、工程师侧等待检查的画面。
- Pace switch: 从动作切到需求。
- Fact boundary: 不补写会议或心理，不把 IOI 写成必然成功原因。

### Narration

三个奥赛金牌程序员做了这个产品。他们要让它自己把工程任务干完，工程师负责检查结果。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|------|------|-----------|-------------|
| 三个奥赛金牌程序员做了这个产品。 | independently-verified | claim-devin-012 | 维基、Bloomberg |
| 他们要让它自己把工程任务干完，工程师负责检查结果。 | company-reported | claim-devin-009 | 官方博客 |

## seg-003

- Section: `hook`
- Time range: `0:11–0:20`
- Target seconds: `9`
- Claim IDs: `claim-devin-015`, `claim-devin-001`
- Source identity: 官方 YouTube 演示
- On-screen text: `官方演示` / `122 万+ 次播放` / `市场后来给了它什么价？` / `功能演示`
- Scene: `hook-demo-question`
- Visual intent: 官方演示播放量数字落下，同时浏览器仍在工作，问题叠在画面上。
- Pace switch: 用冷启动规模打开市场定价问题。
- Fact boundary: 播放量不换算转化或用户数。

### Narration

2024 年 3 月，官方演示发出去，一百多万人看它自己打开浏览器写代码。市场后来给了它什么价？

### Narration units

| Text | Mode | Claim IDs | Attribution |
|------|------|-----------|-------------|
| 2024 年 3 月，官方演示发出去，一百多万人看它自己打开浏览器写代码。 | independently-verified | claim-devin-015, claim-devin-001 | 官方 YouTube 演示 |
| 市场后来给了它什么价？ | editorial-analysis | claim-devin-015 | 官方 YouTube 演示 |

## seg-004

- Section: `choice`
- Time range: `0:20–0:34`
- Target seconds: `14`
- Claim IDs: `claim-devin-014`, `claim-devin-005`, `claim-devin-006`
- Source identity: 维基、官方博客与 VentureBeat
- On-screen text: `种子轮 2100 万美元` / `团队版每月 500 美元` / `个人套餐每月 20 美元起` / `多个 Devin 并行` / `公司披露`
- Scene: `choice-seed-price-parallel`
- Visual intent: 种子轮数字落下后，先出现团队版 500 美元/月，再出现个人套餐 20 美元/月起，多个平行 Devin 的执行画面铺开，标"功能演示"。
- Pace switch: 从围观切到获客门槛。
- Fact boundary: 种子轮与价格都是披露口径，不换算用户数或收入。

### Narration

发布前后，Founders Fund 投了 2100 万美元。2024 年 12 月 GA 时，团队版每月 500 美元；2025 年 4 月 3 日 Devin 2.0 发布时，个人套餐起价每月 20 美元，还能同时开多个 Devin 并行干。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|------|------|-----------|-------------|
| 发布前后，Founders Fund 投了 2100 万美元。 | independently-verified | claim-devin-014 | 维基转述 WSJ |
| 2024 年 12 月 GA 时，团队版每月 500 美元。 | company-reported | claim-devin-005 | 官方博客 |
| 2025 年 4 月 3 日 Devin 2.0 发布时，个人套餐起价每月 20 美元。 | company-reported | claim-devin-005 | 官方博客 |
| 还能同时开多个 Devin 并行干。 | company-reported | claim-devin-006 | 官方博客 |

## seg-005

- Section: `body`
- Time range: `0:34–0:46`
- Target seconds: `12`
- Claim IDs: `claim-devin-007`, `claim-devin-008`
- Source identity: 官方博客与官方客户访谈视频
- On-screen text: `奔驰案例` / `20 万行 COBOL` / `8 个月 → 8 天` / `官方口径`
- Scene: `body-acceptance-evidence`
- Visual intent: 官方客户访谈画面收成案例卡，20 万行与 8 天数字落下。
- Pace switch: 获客门槛切到企业接受。
- Fact boundary: 奔驰案例是公司口径，不换算成功率。

### Narration

奔驰把 20 万行老代码的改造，从预计 8 个月压到 8 天。公司工程师提交的代码里，八成九由 Devin 提交。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|------|------|-----------|-------------|
| 奔驰把 20 万行老代码的改造，从预计 8 个月压到 8 天。 | company-reported | claim-devin-007 | 官方博客 |
| 公司工程师提交的代码里，八成九由 Devin 提交。 | company-reported | claim-devin-008 | 官方博客 |

## seg-006

- Section: `ending-payoff`
- Time range: `0:46–1:00`
- Target seconds: `14`
- Claim IDs: `claim-devin-016`
- Source identity: TechCrunch
- On-screen text: `2026.05` / `估值 25 亿美元` / `融资超 10 亿美元` / `媒体口径`
- Scene: `ending-market-price`
- Visual intent: 估值与融资数字逐个落下，来源条同期出现，停在数字上，不再切回开场任务。
- Pace switch: 不追加新机制，用资本市场证据回答开场。
- Fact boundary: 不换算利润或留存，不写成必然成功。

### Narration

2026 年 5 月，Cognition 以 25 亿美元估值，融资超过 10 亿美元。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|------|------|-----------|-------------|
| 2026 年 5 月，Cognition 以 25 亿美元估值，融资超过 10 亿美元。 | editorial-analysis | claim-devin-016 | TechCrunch |
