<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "三个奥赛金牌程序员把 AI 做成能自己写代码、跑命令、上网查资料的队友，市场最后给了它什么价？",
  "audiencePromise": "你会看见一个能自己干活、被工程师审查的 AI 软件工程师，从 2024 年首发演示到 2026 年奔驰合作与 25 亿美元估值，它是怎么一步步被市场定价的。",
  "sourcedAnswer": "Devin 在 2024-03-12 以自带浏览器、代码编辑器、终端的自主演示建立产品心智（claim-devin-001/002/003/004）；2024-12 GA 时以 500 美元/月团队版进入企业（claim-devin-005）；2025-04 推出 20 美元/月个人版与并行 Devin（claim-devin-005/006）；2026-04 与奔驰合作把 20 万行 COBOL 现代化从预计 8 个月压到 8 天（claim-devin-007）；2026-05 以 25 亿美元 pre-money 估值融资超 10 亿美元，并披露公司 89% 自有代码由 Devin 提交（claim-devin-008/016）。",
  "factBoundary": "不宣称成功率或无人监督；不写 SWE-bench 分数；不把 500 美元写成个人套餐降价；不补心理低谷或危机；不写独立测试争议；不猜增长归因。",
  "emotionalArc": [
    {
      "beatId": "hook-result",
      "viewerState": "好奇：这个 AI 真的在自己写代码、跑命令？",
      "storyMove": "用官方演示里 Devin 打开网页、改文件、执行命令的可见步骤建立反常结果",
      "targetRange": "0–10 秒",
      "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"]
    },
    {
      "beatId": "founder-need",
      "viewerState": "理解：这是奥赛金牌程序员想教 AI 做复杂决策",
      "storyMove": "用 Scott Wu 的奥赛背景与需求口述连接产品形态",
      "targetRange": "10–25 秒",
      "claimIds": ["claim-devin-012", "claim-devin-013"]
    },
    {
      "beatId": "distribution-shift",
      "viewerState": "看见：从 500 美元团队版到 20 美元个人版，并行 Devin 出现",
      "storyMove": "用定价与并行能力展示产品如何被更多人使用",
      "targetRange": "25–45 秒",
      "claimIds": ["claim-devin-005", "claim-devin-006"]
    },
    {
      "beatId": "enterprise-proof",
      "viewerState": "相信：奔驰 20 万行 COBOL 从 8 个月压到 8 天",
      "storyMove": "用客户案例证明产品在企业级任务中的可验证变化",
      "targetRange": "45–55 秒",
      "claimIds": ["claim-devin-007"]
    },
    {
      "beatId": "market-price",
      "viewerState": "确认：市场给了 25 亿美元估值，公司 89% 代码由 Devin 提交",
      "storyMove": "用融资与自用代码数据给出市场定价",
      "targetRange": "55–65 秒",
      "claimIds": ["claim-devin-008", "claim-devin-016"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin 自带浏览器、代码编辑器、终端，能自主执行任务并让工程师审查",
      "withheldAnswer": "它怎么被市场接受并定价",
      "purpose": "用反常结果建立产品心智，让观众追问需求与获客"
    },
    {
      "order": 2,
      "reveal": "三位 IOI 金牌创始人认为奥赛背景让教 AI 做复杂编程决策更有优势",
      "withheldAnswer": "产品如何从演示走向真实使用",
      "purpose": "用创始人选择连接产品形态，回答为什么是他们做这件事"
    },
    {
      "order": 3,
      "reveal": "2024-12 GA 团队版 500 美元/月；2025-04 个人版 20 美元/月起，支持并行 Devin",
      "withheldAnswer": "企业级任务是否真的能用",
      "purpose": "用定价与并行能力展示产品如何被更多人使用"
    },
    {
      "order": 4,
      "reveal": "奔驰合作：20 万行 COBOL 现代化从预计 8 个月压到 8 天",
      "withheldAnswer": "市场给了什么价",
      "purpose": "用客户案例证明产品在企业级任务中的可验证变化"
    },
    {
      "order": 5,
      "reveal": "2026-05 以 25 亿美元 pre-money 估值融资超 10 亿美元；公司 89% 自有代码由 Devin 提交",
      "withheldAnswer": "无",
      "purpose": "用融资与自用代码数据给出市场定价，完成故事闭环"
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief — Episode 004: Devin

## 先回答 15 问

1. **全片唯一要回答的问题**：三个奥赛金牌程序员把 AI 做成能自己写代码、跑命令、上网查资料的队友，市场最后给了它什么价？
2. **有来源的答案**：Devin 2024-03-12 首发演示自带浏览器/编辑器/终端（claim-devin-001/003/004）；2024-12 GA 团队版 500 美元/月（claim-devin-005）；2025-04 个人版 20 美元/月起 + 并行 Devin（claim-devin-005/006）；2026-04 奔驰合作 20 万行 COBOL 从预计 8 个月压到 8 天（claim-devin-007）；2026-05 融资超 10 亿美元、25 亿美元 pre-money 估值（claim-devin-016）；公司 89% 自有代码由 Devin 提交（claim-devin-008）。
3. **不能回答的关键问题**：idea 来源有 Scott Wu 口述（claim-devin-013）；冷启动靠官方演示视频 122 万+ 播放（claim-devin-015）；收入/融资/估值均有来源。**无空项**。
4. **可观察动作**：Cognition 发布 Devin（2024-03-12）；GA 定价 500 美元/月（2024-12-10）；发布 Devin 2.0 与 20 美元个人版（2025-04-03）；宣布奔驰合作（2026-04-27）；融资 10 亿美元（2026-05-27）。不虚构主角心理。
5. **产品张力**：旧行为（工程师自己写代码、跑命令、查资料）→ 新行为（Devin 自主执行，工程师审查结果）。张力来自任务交给 AI 并审查，不是功能列表。
6. **转折区间**：2025-04-03 Devin 2.0 发布，个人版 20 美元/月起 + 并行 Devin（claim-devin-005/006）。这是获客与定价选择，不是版本清单。
7. **Why Now 证据**：Scott Wu 口述奥赛背景让教 AI 做复杂编程决策更有优势（claim-devin-013）；2024-03 发布前后 Founders Fund 2100 万美元种子轮（claim-devin-014）。证据有限，不扩展为时代趋势。
8. **只证明规模不证明原因的数据**：官方演示播放量 122 万+（claim-devin-015）证明被看见，不换算转化；PR 合并率 34%→67%（claim-devin-011）不进入旁白。
9. **结尾停在**：2026-05-27 融资超 10 亿美元、25 亿美元 pre-money 估值（claim-devin-016）；同日披露公司 89% 自有代码由 Devin 提交（claim-devin-008）。这是有 Claim 支持的资本市场证据与产品状态。
10. **零背景观众前 20 秒描述**：这是一个能自己打开网页、写代码、跑命令的 AI 软件工程师，工程师把任务交给它并审查结果。
11. **每个功能接住的前置问题**：自带浏览器/编辑器/终端 → 解决"AI 只能输出代码不能自己干活"；并行 Devin → 解决"一个 AI 不够用"；20 美元个人版 → 解决"500 美元团队版太贵"。
12. **第一帧**：官方演示里 Devin 正在打开网页、修改文件、执行命令的实时画面（claim-devin-004）。已经发生的结果，不是动作即将开始。
13. **强事实 + 同期证据**：Devin 自带浏览器/编辑器/终端（claim-devin-001）→ 官方演示视频画面；奔驰 20 万行 COBOL 从预计 8 个月压到 8 天（claim-devin-007）→ 官方博客与客户访谈视频。
14. **链条**：需求（奥赛背景教 AI 做复杂决策，claim-devin-013）→ 产品动作（自带浏览器/编辑器/终端自主执行，claim-devin-001/003）→ 获客/分发（2024-12 GA 500 美元团队版 → 2025-04 20 美元个人版 + 并行 Devin，claim-devin-005/006）→ 资本市场证据（2026-05 融资 10 亿美元、25 亿美元估值，claim-devin-016）。
15. **可纠正的误解**：观众可能以为 500 美元是个人套餐降到 20 美元。来源明确：500 美元是 2024-12 GA 团队版价格，20 美元是 2025-04 个人版起价（claim-devin-005 注释）。不制造反转，只在定价段落明确口径。

## Story Thesis

> This product promises engineers a teammate that can independently complete tasks for you to review.
>
> The evidence shows that promise through a sandboxed compute environment with its own browser, code editor, and shell, visible in official demos from 2024-03-12 onward.

## 编辑政策执行

- **优先结构**：看得见的产品结果（官方演示自主执行）→ 创始人亲口说过的需求（Scott Wu 奥赛背景）→ 冷启动/获客（官方演示 122 万+ 播放 → GA 500 美元团队版 → 20 美元个人版）→ 资本市场定价（25 亿美元估值 + 89% 自用代码）。
- **用户动作先于公司历史**：先展示 Devin 正在打开网页、改文件、跑命令，再交代创始人背景与融资。
- **因果标注**：需求 → 产品形态（causal，claim-devin-013）；产品形态 → 演示被看见（sequence-only，claim-devin-015 不换算转化）；定价选择 → 更多人使用（sequence-only，无直接归因）；客户案例 → 融资估值（sequence-only，不写因果）。
- **转折**：2025-04-03 Devin 2.0 个人版 20 美元/月 + 并行 Devin（claim-devin-005/006）。这是获客与定价选择，不补危机。
- **结尾**：停在 2026-05-27 融资 10 亿美元、25 亿美元估值（claim-devin-016）与公司 89% 自用代码（claim-devin-008）。不回看开场。

## 结构目标

- **时长**：60 秒 ±20 秒（40–80 秒区间）
- **节奏**：0–10 秒 Hook（反常结果）→ 10–25 秒创始人需求 → 25–45 秒定价与并行 → 45–55 秒奔驰案例 → 55–65 秒融资与自用代码
- **产品动作上限**：3 个（自主执行、并行 Devin、COBOL 现代化）
- **真实产品画面**：官方演示视频（claim-devin-002）用于前 20 秒产品定义；奔驰客户访谈视频（claim-devin-011）用于 45–55 秒企业级证据
- **认知修正**：1 处（500 美元是团队版不是个人版降价）

## 事实边界

- 不宣称成功率或无人监督
- 不写 SWE-bench 分数
- 不把 500 美元写成个人套餐降价
- 不补心理低谷或危机
- 不写独立测试争议
- 不猜增长归因
- 不用时代趋势填补 Why Now

## Verdict

**READY** — 无 blocker，研究包可执行。