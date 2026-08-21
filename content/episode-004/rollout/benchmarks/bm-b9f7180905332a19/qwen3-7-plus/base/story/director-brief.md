<!-- director-brief-gate
{ "rubricVersion": "director-brief-v1", "reviewedFiles": { "facts.json": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee", "sources.json": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d", "timeline.json": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8" }, "coreStoryQuestion": "Devin 抓住了程序员哪个具体需求，怎么让第一批人用起来，市场后来给了它什么价？", "audiencePromise": "你会看见一个能自己打开浏览器、写代码、跑命令的 AI 软件工程师，从 2024 年 3 月的一段官方演示，走到 2026 年奔驰 20 万行 COBOL 改造和 25 亿美元估值。", "sourcedAnswer": "需求：把工程任务交给一个能自主执行并返回可审查结果的队友（claim-devin-009）。冷启动：2024-03-12 官方演示视频在 YouTube 公开，截至 2026-08-16 播放 122 万+（claim-devin-015）。市场定价：2024 年 3 月 Founders Fund 2100 万美元种子轮、估值 3.5 亿美元（claim-devin-014）；2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）。", "factBoundary": "不得宣称 Devin 的成功率、无人监督或独立评测结果；不得把 SWE-bench 13.86% 写成真实任务成功率；不得把 500 美元/月写成个人套餐降价到 20 美元（500 是 2024-12 GA 团队版，20 是 2025-04 个人版起价）；不得把 8 个月→8 天写成独立实测对比（项目估算口径）。", "emotionalArc": [ { "range": "0–20s", "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"], "beat": "看见：一个 AI 在自带浏览器、编辑器和终端里一步步完成任务" }, { "range": "20–40s", "claimIds": ["claim-devin-012", "claim-devin-013", "claim-devin-009"], "beat": "理解：三位 IOI 金牌程序员把复杂编程决策拆成可教给 AI 的系统问题，定位成可审查的队友" }, { "range": "40–55s", "claimIds": ["claim-devin-005", "claim-devin-006", "claim-devin-007"], "beat": "放大：从 500 美元/月团队版到 20 美元/月个人版与并行 Devin，再到奔驰 20 万行 COBOL 从预计 8 个月缩短到 8 天" }, { "range": "55–70s", "claimIds": ["claim-devin-008", "claim-devin-016"], "beat": "定价：公司内部 89% 自有代码由 Devin 提交；2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元" } ], "revealOrder": [ { "step": 1, "newInfo": "Devin 在自带浏览器、代码编辑器和终端里自主执行任务的可见动作", "holdBack": "创始人与融资背景", "function": "用可观察的产品动作建立心智模型" }, { "step": 2, "newInfo": "三位 IOI 金牌创始人把复杂编程决策当作可教给 AI 的系统问题，并把 Devin 定位为可审查的队友", "holdBack": "价格与规模化案例", "function": "回答为什么是这群人、为什么是这种产品形态" }, { "step": 3, "newInfo": "2024-12 GA 团队版 500 美元/月 → 2025-04 个人版 20 美元/月起 + 并行 Devin → 2026-04 奔驰 20 万行 COBOL 从预计 8 个月缩短到 8 天", "holdBack": "资本市场定价", "function": "用获客门槛与真实客户案例证明价值放大" }, { "step": 4, "newInfo": "公司内部 89% 自有代码由 Devin 提交；2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元", "holdBack": "无", "function": "用资本市场证据收束市场定价" } ], "blockers": [], "verdict": "READY", "returnTo": "none" }
-->

# Director Brief — Episode 004: Devin

## 1. 先回答 15 个编辑问题

1. **全片唯一要回答的问题**：Devin 抓住了程序员哪个具体需求，怎么让第一批人用起来，市场后来给了它什么价？
2. **有来源的答案**：需求——把任务交给一个能自主执行并返回可审查结果的队友（claim-devin-009）；冷启动——2024-03-12 官方演示视频公开，截至 2026-08-16 播放 122 万+（claim-devin-015）；定价——2024 年 3 月 2100 万美元种子轮、估值 3.5 亿美元（claim-devin-014）；2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）。
3. **仍不能回答的关键问题**：没有独立评测的成功率数据；没有第三方归因的获客转化；没有利润或收入口径。这些缺口不进入旁白。
4. **做了可观察动作的人**：Cognition 团队发布官方演示视频（src-devin-002）；Devin 在演示中打开浏览器、修改文件、执行命令（claim-devin-004）；奔驰在四周试点后部署完整产品套件（claim-devin-007）。
5. **最能帮助观众理解价值的产品张力**：旧行为——工程师逐行写代码、查资料、跑命令；新行为——把任务交给 Devin，它返回可审查的 pull request（claim-devin-009）。张力来自"任务被接走"与"结果被审查"的角色分工，而不是功能清单。
6. **故事改变方向的具体时刻**：2025-04-03 Devin 2.0 把价格门槛从 500 美元/月团队版降到 20 美元/月个人版，并开放并行 Devin（claim-devin-005、claim-devin-006）。这是获客与分发门槛的变化，不是版本发布清单。
7. **Why Now 的证据**：三位创始人是 IOI 金牌（claim-devin-012）；Scott Wu 口述奥赛背景让团队在教 AI 做复杂编程决策上更有优势（claim-devin-013）。证据强度中等，只支撑"这群人能教 AI 做复杂决策"，不支撑"时代趋势"。
8. **只能证明规模、不能证明原因的数据**：官方演示播放 122 万+（claim-devin-015）只证明被看见，不证明转化；PR 合并率 34%→67%（claim-devin-011）只证明公司自报绩效，不证明因果。
9. **结尾应停在**：2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016），并用公司内部 89% 自有代码由 Devin 提交（claim-devin-008）作为产品状态的正面证据。
10. **零背景观众前 20 秒的一句话描述**："这是一个能自己打开浏览器、写代码、跑命令，然后把结果交给你审查的 AI 软件工程师。"
11. **每个保留的功能或专有名词接住的前置问题**：
    - 自带浏览器、代码编辑器、终端 → 接住"它怎么自主执行"
    - 可审查的队友 → 接住"工程师的角色是什么"
    - 并行 Devin → 接住"能不能同时做多个任务"
    - 20 万行 COBOL、8 个月→8 天 → 接住"真实企业用它做了什么"
12. **第一帧能让观众看见什么已经改变**：Devin 在自带界面里打开网页、修改文件、执行命令的实时画面（claim-devin-004），观众第一眼就看见任务正在被完成。
13. **可由真实画面或 Claim 支持的图形同期证明的强事实**：官方演示视频里 Devin 打开浏览器、写代码、跑命令的可见步骤（claim-devin-004、src-devin-002）；奔驰 20 万行 COBOL 从预计 8 个月缩短到 8 天（claim-devin-007）可用程序化图形证明。
14. **需求 → 产品动作 → 获客/分发 → 资本市场证据的链**：需求（把任务交给可审查的队友，claim-devin-009）→ 产品动作（自带浏览器、编辑器、终端自主执行，claim-devin-003）→ 获客/分发（2024-03 官方演示视频 122 万+ 播放，claim-devin-015；2025-04 个人版 20 美元/月起，claim-devin-005）→ 资本市场证据（2026-05-27 25 亿美元 pre-money 估值融资超 10 亿美元，claim-devin-016）。整条链标 `causal`，因为官方博客与媒体来源支持每一步的因果叙述。
15. **观众会自然产生、且来源足以纠正的误解**：观众可能以为 500 美元/月是个人套餐然后降到 20 美元。纠正：500 美元是 2024-12 GA 时的团队版价格，20 美元/月起是 2025-04 Devin 2.0 的个人套餐起价（claim-devin-005、src-devin-005）。

## 2. Story Thesis 比较

- 角度 A：This product promises **an autonomous teammate that completes tasks for you to review** for the user. The evidence shows that promise through **the official demo's visible browser, editor, and terminal actions, the 2025-04 price drop to $20/month with parallel Devins, and the Mercedes-Benz 200,000-line COBOL case**.
- 角度 B：This product promises **to turn complex programming decisions into a teachable system** for the user. The evidence shows that promise through **the three IOI gold-medalist founders' framing, the sandboxed compute environment, and the 89% self-committed code disclosure**.
- 角度 C：This product promises **to cut enterprise modernization timelines** for the user. The evidence shows that promise through **the Mercedes-Benz 8-month-to-8-day claim and the $25B pre-money valuation**.

选择角度 A：它能正面展示产品价值、使用体验和用户动作，张力来自旧行为与新行为的角色分工，而不是功能清单或行业趋势。

## 3. 事实边界

- 不得宣称 Devin 的成功率、无人监督或独立评测结果。
- 不得把 SWE-bench 13.86% 写成真实任务成功率。
- 不得把 500 美元/月写成个人套餐降价到 20 美元。
- 不得把 8 个月→8 天写成独立实测对比（项目估算口径）。
- 不得把 PR 合并率 34%→67% 或解题速度 4 倍写进旁白（仅研究背景）。

## 4. 交接状态

`director-brief-gate` 为 `READY`，无 blocker。四个文件一致地给出同一个问题、同一个转折区间（2025-04-03 Devin 2.0 价格与并行能力）和同一个正面结尾动作（2026-05-27 25 亿美元 pre-money 估值融资超 10 亿美元）。完成状态：`director-ready`。
