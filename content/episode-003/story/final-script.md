# Manus Final Script

状态：`story-approved`
选中 Hook：`task-already-running`
目标时长：60 秒
生产说明：任何旁白调整都必须重新生成 TTS、字幕、时间轴和竖版视频。

## seg-001

- Section: `hook`
- Time range: `0:00–0:03`
- Target seconds: `3`
- Claim IDs: `claim-manus-001`
- Source identity: 官网与媒体交叉核对
- On-screen text: `任务已发出` / `网页已打开` / `功能演示`
- Scene: `hook-task-open`
- Visual intent: 第 0 帧同时出现已发送任务和已经打开的网页，持续标“功能演示”；随后只做一次轻微加载动效。
- Pace switch: 无淡入，先给完成结果。
- Fact boundary: 不冒充真实用户个案，不宣称执行成功率。

### Narration

任务已经发出，它自己打开网页去办。

### Narration units

| Text                               | Mode          | Claim IDs        | Attribution              |
| ---------------------------------- | ------------- | ---------------- | ------------------------ |
| 任务已经发出，它自己打开网页去办。 | demonstration | claim-manus-001  | 官方能力说明；标功能演示 |

## seg-002

- Section: `hook`
- Time range: `0:03–0:10`
- Target seconds: `7`
- Claim IDs: `claim-manus-005`
- Source identity: 公司公告
- On-screen text: `上线以来` / `8000 万+ 台虚拟电脑` / `不是用户数` / `为什么要自己干活？`
- Scene: `hook-metric-question`
- Visual intent: 开场网页扩成虚拟电脑阵列，公司来源和“不是用户数”同时出现，最后停在全片问题。
- Pace switch: 从一个完成动作快速拉到公开规模，再留下唯一问题。
- Fact boundary: 虚拟电脑数不是用户、留存、收入或成功任务数。

### Narration

公司披露，上线以来已经创建超过八千万台虚拟电脑。为什么不聊天，要自己干活？

### Narration units

| Text                                                 | Mode               | Claim IDs       | Attribution      |
| ---------------------------------------------------- | ------------------ | --------------- | ---------------- |
| 公司披露，上线以来已经创建超过八千万台虚拟电脑。     | company            | claim-manus-005 | 公司公告         |
| 为什么不聊天，要自己干活？                           | editorial-analysis | claim-manus-005 | 由规模提出问题   |

## seg-003

- Section: `hook`
- Time range: `0:10–0:20`
- Target seconds: `10`
- Claim IDs: `claim-manus-001`, `claim-manus-002`, `claim-manus-003`
- Source identity: 官网、沙箱说明与媒体交叉核对
- On-screen text: `通用 AI agent` / `云电脑打开网页` / `读写文件` / `关掉页面还能跑`
- Scene: `hook-cloud-model`
- Visual intent: 云电脑轮廓里同时出现浏览器、文件夹和仍在运行的进度条，官网截图建立真实产品入口。
- Pace switch: 用具体能力回答产品是什么。
- Fact boundary: 不宣称 Manus 没有其他入口，不写成功率。

### Narration

Manus 是通用 AI agent。你发出任务，它就在云电脑里打开网页、读写文件。关掉页面，任务还能继续跑。

### Narration units

| Text                                             | Mode                   | Claim IDs                       | Attribution    |
| ------------------------------------------------ | ---------------------- | ------------------------------- | -------------- |
| Manus 是通用 AI agent。                          | independently-verified | claim-manus-001                 | 产品心智模型   |
| 你发出任务，它就在云电脑里打开网页、读写文件。   | independently-verified | claim-manus-002, claim-manus-003 | 云端执行环境  |
| 关掉页面，任务还能继续跑。                       | company                | claim-manus-003                 | 官方沙箱说明   |

## seg-004

- Section: `choice`
- Time range: `0:20–0:34`
- Target seconds: `14`
- Claim IDs: `claim-manus-003`, `claim-manus-004`
- Source identity: 公司产品说明
- On-screen text: `执行引擎` / `一台任务一台云电脑` / `浏览器` / `文件` / `命令行`
- Scene: `choice-action-engine`
- Visual intent: 聊天气泡退到背景，隔离云电脑卡片展开浏览器、文件和命令行。
- Pace switch: 从问题切到团队选择。
- Fact boundary: 执行引擎是公司自我表述，不补写会议或创始人心理。

### Narration

团队要的是执行引擎。每个任务分到一台隔离的云电脑，里面有浏览器、文件和命令行。

### Narration units

| Text                                                         | Mode    | Claim IDs                       | Attribution    |
| ------------------------------------------------------------ | ------- | ------------------------------- | -------------- |
| 团队要的是执行引擎。                                         | company | claim-manus-004                 | 公司产品定位   |
| 每个任务分到一台隔离的云电脑，里面有浏览器、文件和命令行。   | company | claim-manus-003                 | 官方沙箱说明   |

## seg-005

- Section: `desktop`
- Time range: `0:34–0:48`
- Target seconds: `14`
- Claim IDs: `claim-manus-008`, `claim-manus-009`, `claim-manus-010`
- Source identity: 官方博客、桌面页与 CNBC
- On-screen text: `2026.03.16 桌面版` / `整理本地文件` / `执行命令` / `先批准再运行`
- Scene: `desktop-approval`
- Visual intent: 硬切官方桌面页，再叠加本机文件夹和“允许一次”按钮。
- Pace switch: 云电脑切到真实桌面页，再落到批准动作。
- Fact boundary: 只介绍公开控制方式，不宣称消除安全风险，不用官方示例冒充用户故事。

### Narration

2026 年 3 月 16 日，桌面版把它带到你的电脑。它可以整理本地文件、执行命令。每条命令先要你批准。

### Narration units

| Text                                         | Mode                   | Claim IDs       | Attribution      |
| -------------------------------------------- | ---------------------- | --------------- | ---------------- |
| 2026 年 3 月 16 日，桌面版把它带到你的电脑。 | independently-verified | claim-manus-008 | 官方日期与媒体   |
| 它可以整理本地文件、执行命令。               | independently-verified | claim-manus-009 | 桌面能力         |
| 每条命令先要你批准。                         | company                | claim-manus-010 | 官方批准设计     |

## seg-006

- Section: `ending-payoff`
- Time range: `0:48–1:00`
- Target seconds: `12`
- Claim IDs: `claim-manus-007`, `claim-manus-002`, `claim-manus-003`
- Source identity: 公司与 Meta 口径 + 产品机制
- On-screen text: `数百万用户 · 公司口径` / `任务还在跑` / `网页已打开` / `功能演示`
- Scene: `ending-still-working`
- Visual intent: 数百万用户收拢到开场同一条任务，浏览器仍在云电脑里继续加载，持续标“功能演示”。
- Pace switch: 不追加新机制，用同一个执行动作回答开场。
- Fact boundary: 用户规模不写成留存；结尾停在来源支持的执行动作。

### Narration

公司称，全球已有数百万用户把任务交给它。开头那个任务，还在云电脑里自己打开网页往下做。

### Narration units

| Text                                                         | Mode                   | Claim IDs                       | Attribution            |
| ------------------------------------------------------------ | ---------------------- | ------------------------------- | ---------------------- |
| 公司称，全球已有数百万用户把任务交给它。                     | company                | claim-manus-007                 | 公司与收购方口径       |
| 开头那个任务，还在云电脑里自己打开网页往下做。               | independently-verified | claim-manus-002, claim-manus-003 | 回到具体产品动作     |
