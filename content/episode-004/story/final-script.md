# Devin Final Script

状态：`story-approved`
选中 Hook：`task-delegated-browser-open`
目标时长：60 秒
生产说明：任何旁白调整都必须重新生成 TTS、字幕、时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-devin-001`
- Source identity: 官方演示视频与官方博客
- On-screen text: `任务已交出去` / `它自己打开浏览器` / `功能演示`
- Scene: `hook-delegated-open`
- Visual intent: 第 0 帧官方演示画面已在进行中：任务已输入，Devin 随后开始规划并打开自带浏览器执行，持续标“功能演示”。
- Pace switch: 无淡入，先给执行中的结果。
- Fact boundary: 不冒充真实用户个案，不宣称执行成功率。

### Narration

任务交出去，它自己打开浏览器，开始干活。

### Narration units

| Text                                     | Mode           | Claim IDs       | Attribution          |
| ---------------------------------------- | -------------- | --------------- | -------------------- |
| 任务交出去，它自己打开浏览器，开始干活。 | demonstration  | claim-devin-001 | 官方演示；标功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-devin-002`
- Source identity: 官方博客与官方视频
- On-screen text: `2024.03.12 发布` / `第一个 AI 软件工程师·官方称` / `为什么写代码要它自己开浏览器？`
- Scene: `hook-identity-question`
- Visual intent: 官方演示里 Scott Wu 的发布口播收成标题卡，随后“第一个 AI 软件工程师·官方称”落下，再留下唯一问题。
- Pace switch: 从一个执行动作快速拉到发布身份，再留下唯一问题。
- Fact boundary: “第一个”是官方自我定位，不是第三方认证。

### Narration

2024 年 3 月，Cognition 发布 Devin，称它是第一个 AI 软件工程师。为什么写代码要它自己开浏览器？

### Narration units

| Text                                                         | Mode               | Claim IDs       | Attribution        |
| ------------------------------------------------------------ | ------------------ | --------------- | ------------------ |
| 2024 年 3 月，Cognition 发布 Devin，称它是第一个 AI 软件工程师。 | company            | claim-devin-002 | 官方发布与视频     |
| 为什么写代码要它自己开浏览器？                               | editorial-analysis | claim-devin-002 | 由产品形态提出问题 |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-devin-003`, `claim-devin-004`
- Source identity: 官方博客、官方演示与官方教程
- On-screen text: `自带浏览器` / `编辑器` / `终端` / `先列计划，再执行`
- Scene: `hook-toolchain-visible`
- Visual intent: 官方演示里 Devin 的计划列表、浏览器、编辑器与终端依次进入画面，随后每一步操作持续可见，标“功能演示”。
- Pace switch: 用具体能力回答产品是什么。
- Fact boundary: 不宣称无人监督，不写成功率。

### Narration

它有浏览器、编辑器和终端，先列计划，再一步步执行，每一步都看得见。

### Narration units

| Text                               | Mode                   | Claim IDs                       | Attribution        |
| ---------------------------------- | ---------------------- | ------------------------------- | ------------------ |
| 它有浏览器、编辑器和终端，         | independently-verified | claim-devin-003                 | 官方工具链说明     |
| 先列计划，再一步步执行，           | independently-verified | claim-devin-003, claim-devin-004 | 官方演示可见步骤 |
| 每一步都看得见。                   | independently-verified | claim-devin-004                 | 官方演示可见过程   |

## seg-004

- Section: `choice`
- Time range: `0:20–0:34`
- Target seconds: `14`
- Claim IDs: `claim-devin-005`, `claim-devin-006`
- Source identity: 官方博客与 VentureBeat
- On-screen text: `Devin 2.0` / `500 → 20 美元` / `公司披露` / `多个 Devin 并行干`
- Scene: `choice-price-parallel`
- Visual intent: 官方演示收成价格对比卡，随后“20 美元”落下，多个平行 Devin 的执行画面铺开，标“功能演示”。
- Pace switch: 从问题切到团队选择。
- Fact boundary: 价格与并行是公司披露口径，不换算用户数或收入。

### Narration

团队做了一个选择：Devin 2.0 把价格从每月 500 美元降到 20 美元，一个任务可以同时开多个 Devin 并行干。

### Narration units

| Text                                                         | Mode    | Claim IDs                       | Attribution    |
| ------------------------------------------------------------ | ------- | ------------------------------- | -------------- |
| 团队做了一个选择：Devin 2.0 把价格从每月 500 美元降到 20 美元， | company | claim-devin-005                 | 公司披露与媒体 |
| 一个任务可以同时开多个 Devin 并行干。                         | company | claim-devin-006                 | 公司披露       |

## seg-005

- Section: `body`
- Time range: `0:34–0:48`
- Target seconds: `14`
- Claim IDs: `claim-devin-007`, `claim-devin-008`
- Source identity: 官方博客与官方客户访谈视频
- On-screen text: `奔驰案例` / `20 万行 COBOL` / `8 个月 → 8 天` / `官方口径` / `公司自报：89%`
- Scene: `body-acceptance-evidence`
- Visual intent: 官方客户访谈画面收成案例卡，随后 20 万行 COBOL 与 8 天数字落下，再切到 89% 自用代码卡。
- Pace switch: 自主执行切到企业与自用证据。
- Fact boundary: 奔驰案例与 89% 都是公司口径，不换算成功率。

### Narration

奔驰把 20 万行老代码的改造，从预计 8 个月压到 8 天。Cognition 说，公司 89% 的代码现在由 Devin 提交。

### Narration units

| Text                                                         | Mode    | Claim IDs       | Attribution      |
| ------------------------------------------------------------ | ------- | --------------- | ---------------- |
| 奔驰把 20 万行老代码的改造，从预计 8 个月压到 8 天。         | company | claim-devin-007 | 官方案例         |
| Cognition 说，公司 89% 的代码现在由 Devin 提交。             | company | claim-devin-008 | 公司披露         |

## seg-006

- Section: `ending-payoff`
- Time range: `0:48–1:00`
- Target seconds: `12`
- Claim IDs: `claim-devin-009`, `claim-devin-001`
- Source identity: 官方博客与官方演示
- On-screen text: `工程师负责派活和验收` / `功能演示` / `任务还在跑`
- Scene: `ending-still-running`
- Visual intent: 官方定位卡落下后，回到开场同一条仍在执行的任务画面：它还在自己的浏览器里往下做，持续标“功能演示”。
- Pace switch: 不追加新机制，用同一个执行动作回答开场。
- Fact boundary: 派活与验收是官方定位；结尾停在来源支持的执行动作。

### Narration

现在，工程师把任务交给它，负责检查结果。开头那个任务，还在它自己的浏览器里往下做。

### Narration units

| Text                                                         | Mode           | Claim IDs                       | Attribution            |
| ------------------------------------------------------------ | -------------- | ------------------------------- | ---------------------- |
| 现在，工程师把任务交给它，负责检查结果。                     | company        | claim-devin-009                 | 官方定位               |
| 开头那个任务，还在它自己的浏览器里往下做。                   | demonstration  | claim-devin-001                 | 回到官方演示；标功能演示 |
