# Lovable — Episode-008 信息初稿

状态：`draft-ready`

选中 Hook：`记下心情，刷新还在。`

## seg-001

- Section: `hook`
- Time range: `0:00-0:03`
- Target seconds: `3`
- Claim IDs: `claim-lovable-001, claim-lovable-004`
- Source identity: src-lovable-demo
- On-screen text: `记下心情 / 刷新还在`
- Scene: 保存后刷新
- Visual intent: 条目被提交 → 列表出现结果 → 刷新后条目仍在。
- Pace switch: 短句配合保存与刷新快切
- Fact boundary: 官方演示片段；不冒充本人自建测试。

### Narration

记录心情后刷新页面，数据仍然保留。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 记录心情后刷新页面，数据仍然保留。 | company | claim-lovable-001, claim-lovable-004 | src-lovable-demo |

## seg-002

- Section: `hook`
- Time range: `0:03-0:13`
- Target seconds: `10`
- Claim IDs: `claim-lovable-001, claim-lovable-002, claim-lovable-004`
- Source identity: src-lovable-demo；src-lovable-founder
- On-screen text: `Lovable / 用聊天做应用`
- Scene: 工具与用户需求
- Visual intent: 缩放回官方编辑器 → 展示同一个情绪网页的页面和条目。
- Pace switch: 用新的动作或来源推进，不重复上段信息
- Fact boundary: 产品动作来自公司演示；用户需求来自创始人口述。

### Narration

这个情绪记录网页展示了 Lovable 通过聊天制作应用的能力，服务于有想法但缺乏编程能力的人。团队如何找到最初愿意试用的用户？

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 这个情绪记录网页展示了 Lovable 通过聊天制作应用的能力，服务于有想法但缺乏编程能力的人。团队如何找到最初愿意试用的用户？ | company | claim-lovable-001, claim-lovable-002, claim-lovable-004 | src-lovable-demo；src-lovable-founder |

## seg-003

- Section: `hook`
- Time range: `0:13-0:20`
- Target seconds: `7`
- Claim IDs: `claim-lovable-002, claim-lovable-003`
- Source identity: src-lovable-founder
- On-screen text: `Anton Osika / 周末原型`
- Scene: 创始人原型
- Visual intent: 创始人照片出现 → 周末原型名称与来源短注出现，不伪造早期界面。
- Pace switch: 用新的动作或来源推进，不重复上段信息
- Fact boundary: 一个周末指原型，非完整商业产品。

### Narration

安东回顾，编程阻碍了有想法的人制作软件，因此他在一个周末制作了 GPT-Engineer 命令行原型。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 安东回顾，编程阻碍了有想法的人制作软件，因此他在一个周末制作了 GPT-Engineer 命令行原型。 | founder | claim-lovable-002, claim-lovable-003 | src-lovable-founder |

## seg-004

- Section: `mechanism`
- Time range: `0:20-0:30`
- Target seconds: `10`
- Claim IDs: `claim-lovable-004`
- Source identity: src-lovable-demo
- On-screen text: `登录 / 保存记录`
- Scene: 从页面到可用数据
- Visual intent: 登录操作完成 → 输入记录并提交 → 列表刷新保留数据；不展示测试账号信息。
- Pace switch: 用新的动作或来源推进，不重复上段信息
- Fact boundary: 只描述官方示例和已展示能力；不声称免调试。

### Narration

用户需要可以实际使用的应用。官方演示中，团队为心情应用接入登录功能和数据存储，提交的记录保留在数据库中。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 用户需要可以实际使用的应用。官方演示中，团队为心情应用接入登录功能和数据存储，提交的记录保留在数据库中。 | company | claim-lovable-004 | src-lovable-demo |

## seg-005

- Section: `distribution`
- Time range: `0:30-0:44`
- Target seconds: `14`
- Claim IDs: `claim-lovable-005`
- Source identity: src-lovable-gtm
- On-screen text: `发布演示 / 参与社区 / 合作推广`
- Scene: 让潜在用户看见
- Visual intent: 发布材料短注进入 → 切回可用产品操作，渠道名称以简短叠层出现。
- Pace switch: 用新的动作或来源推进，不重复上段信息
- Fact boundary: 渠道动作有团队复盘；没有量化转化率，不能说某渠道单独导致后续 ARR。

### Narration

团队准备演示视频，在 Product Hunt 发布，在 X 上参与相关社区讨论，并与 Supabase 联合推广，向潜在用户展示产品能力。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 团队准备演示视频，在 Product Hunt 发布，在 X 上参与相关社区讨论，并与 Supabase 联合推广，向潜在用户展示产品能力。 | company | claim-lovable-005 | src-lovable-gtm |

## seg-006

- Section: `payoff`
- Time range: `0:44-0:55`
- Target seconds: `11`
- Claim IDs: `claim-lovable-007`
- Source identity: src-lovable-arr
- On-screen text: `2025 年 7 月 / $100M ARR / 公司口径`
- Scene: 历史商业结果
- Visual intent: 当前产品画面淡出 → 有日期的官方 ARR 公告出现，中文指标定义高亮。
- Pace switch: 用新的动作或来源推进，不重复上段信息
- Fact boundary: ARR 是公司历史自报年化经常性收入，不等于利润和过去一年收款。

### Narration

2025 年 7 月 23 日，公司宣布 ARR，也就是年化经常性收入，达到一亿美元。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| --- | --- | --- | --- |
| 2025 年 7 月 23 日，公司宣布 ARR，也就是年化经常性收入，达到一亿美元。 | company | claim-lovable-007 | src-lovable-arr |
