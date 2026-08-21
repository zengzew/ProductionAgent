<!-- director-brief-gate
{ "rubricVersion": "director-brief-v1", "reviewedFiles": { "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee", "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d", "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8" }, "coreStoryQuestion": "三位 IOI 金牌程序员抓住了哪个需求，怎么让第一批人用起来，市场后来给了它什么价？", "audiencePromise": "看见一个能自己打开浏览器、写代码、跑命令的 AI 软件工程师，从演示视频到奔驰 20 万行代码改造，再到 25 亿美元估值的市场定价。", "sourcedAnswer": "需求：把工程任务交给可审查的 AI 队友（claim-devin-009）；冷启动：2024-03-12 官方演示视频被看见（claim-devin-015）；产品动作：自带浏览器、编辑器、终端的自主执行（claim-devin-001/003/004），2025-04-03 推出 20 美元/月个人套餐与并行 Devin（claim-devin-005/006）；市场定价：2026-04-27 奔驰 8 个月→8 天（claim-devin-007），2026-05-27 以 25 亿美元 pre 估值融资超 10 亿美元（claim-devin-016）。", "factBoundary": "不得进入旁白：claim-devin-010（SWE-bench 13.86%）、claim-devin-011（PR 合并率 34%→67%）。不得把 500 美元/月与 20 美元/月写成同一套餐降价（claim-devin-005 notes）。不宣称成功率、不补写心理低谷或危机。", "emotionalArc": [ { "beatId": "beat-01", "viewerState": "好奇：这个 AI 到底在干什么？", "storyMove": "先让观众看见 Devin 在自带界面里打开网页、改文件、跑命令的已发生结果。", "targetRange": "0–20s", "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"] }, { "beatId": "beat-02", "viewerState": "理解：这是给工程师的队友，不是代码补全。", "storyMove": "用创始人背景与任务交接机制说明需求与产品定位。", "targetRange": "20–40s", "claimIds": ["claim-devin-012", "claim-devin-013", "claim-devin-009"] }, { "beatId": "beat-03", "viewerState": "看见规模化：从团队版到个人版，从单任务到并行。", "storyMove": "用 2025-04-03 的定价与并行 Devin 展示获客门槛下降与产品尺度变化。", "targetRange": "40–55s", "claimIds": ["claim-devin-005", "claim-devin-006"] }, { "beatId": "beat-04", "viewerState": "确认价值：大企业真的在用。", "storyMove": "用奔驰 COBOL 改造案例给出可核验的产品结果。", "targetRange": "55–70s", "claimIds": ["claim-devin-007"] }, { "beatId": "beat-05", "viewerState": "市场定价：资本给出答案。", "storyMove": "停在 25 亿美元估值与超 10 亿美元融资，作为结尾的资本市场证据。", "targetRange": "70–80s", "claimIds": ["claim-devin-016", "claim-devin-015"] } ], "revealOrder": [ { "order": 1, "reveal": "Devin 在自带浏览器、编辑器、终端里自主执行任务的可见画面。", "withheldAnswer": "它到底能做什么、给谁用。", "purpose": "用已发生的结果建立产品心智模型，让观众追问需求。" }, { "order": 2, "reveal": "创始人 IOI 金牌背景与把任务交给 AI 队友审查的产品定位。", "withheldAnswer": "市场怎么接受、规模多大。", "purpose": "回答需求来源与产品形态，建立工程师与 AI 队友的协作关系。" }, { "order": 3, "reveal": "2025-04-03 个人套餐 20 美元/月起与并行 Devin。", "withheldAnswer": "大企业是否真的采用。", "purpose": "展示获客门槛下降与产品尺度变化，推进到企业级验证。" }, { "order": 4, "reveal": "奔驰 20 万行 COBOL 改造从预计 8 个月缩短到 8 天。", "withheldAnswer": "资本市场怎么定价。", "purpose": "用可核验的大企业案例证明产品价值。" }, { "order": 5, "reveal": "2026-05-27 以 25 亿美元 pre 估值融资超 10 亿美元。", "withheldAnswer": "无，作为结尾答案。", "purpose": "用资本市场证据收束全片，给出市场定价。" } ], "blockers": [], "verdict": "READY", "returnTo": "none" }
-->

# Director Brief — Episode 004: Devin

## 先回答 15 问

1. **全片唯一问题**：三位 IOI 金牌程序员抓住了哪个需求，怎么让第一批人用起来，市场后来给了它什么价？
2. **有来源的答案**：需求（claim-devin-009 把任务交给可审查的 AI 队友）、冷启动（claim-devin-015 官方演示视频 122 万+播放）、产品动作（claim-devin-001/003/004 自带浏览器/编辑器/终端的自主执行）、定价变化（claim-devin-005 团队版 500 美元/月 → 个人版 20 美元/月起）、并行能力（claim-devin-006）、大企业合作（claim-devin-007 奔驰 8 个月→8 天）、资本市场定价（claim-devin-016 25 亿美元 pre 估值融资超 10 亿美元）。
3. **不能回答的关键问题**：idea 来源只有创始人对奥赛背景的口述（claim-devin-013），没有更早的灵感故事；收入数据缺失，只有融资与估值。
4. **可观察动作的主角**：Cognition 三位创始人（claim-devin-012）、Devin 产品本身（claim-devin-001/003/004）、奔驰作为客户（claim-devin-007）。
5. **产品张力**：旧行为（工程师自己写代码、查资料、跑命令）vs 新行为（把任务交给 Devin，它自己打开浏览器、改文件、跑终端，工程师只审查结果）。
6. **转折区间**：2025-04-03 Devin 2.0 发布，个人套餐 20 美元/月起 + 并行 Devin（claim-devin-005/006），获客门槛从团队版 500 美元/月降到个人可及。
7. **Why Now 证据**：创始人奥赛背景（claim-devin-012/013）解释能力选择；2024-03-12 演示视频被看见（claim-devin-015）解释冷启动。没有更多宏观趋势证据，不补写。
8. **只证明规模不证明原因的数据**：官方演示播放量 122 万+（claim-devin-015）只证明被看见，不换算转化；89% 自有代码由 Devin 提交（claim-devin-008）只证明自用强度，不证明产品质量。
9. **结尾停在**：2026-05-27 以 25 亿美元 pre 估值融资超 10 亿美元（claim-devin-016），作为资本市场定价证据。
10. **零背景观众前 20 秒一句话描述**：这是一个能自己打开浏览器、写代码、跑命令的 AI 软件工程师。
11. **每个专有名词接住的前置问题**："沙箱计算环境"接住"它在哪里工作"；"并行 Devin"接住"能同时做多少事"；"COBOL 现代化"接住"大企业真的在用吗"。
12. **第一帧已经改变**：Devin 正在自带界面里打开网页、修改文件、执行命令的已发生结果（claim-devin-001/003/004）。
13. **强事实 + 同期证据**：Devin 自主执行画面（claim-devin-001/003/004）由官方演示视频直接证明；奔驰 8 个月→8 天（claim-devin-007）由官方博客与客户访谈视频交叉证明。
14. **链条**：需求（工程师审查 AI 队友）→ 产品动作（自带浏览器/编辑器/终端自主执行）→ 获客（2024-03-12 演示视频被看见 → 2025-04-03 个人套餐 20 美元/月起）→ 资本市场证据（2026-05-27 25 亿美元估值）。
15. **可纠正的误解**：观众可能以为 Devin 只是代码补全工具；用 claim-devin-001/003/004 的自主执行画面纠正为"能独立完成任务的 AI 队友"。

## Story Thesis

> This product promises engineers an AI teammate that independently completes tasks for review.
>
> The evidence shows that promise through visible autonomous execution in a sandboxed IDE, a price drop from $500/team to $20/person, and Mercedes-Benz cutting an 8-month COBOL modernization to 8 days.

## 编辑政策执行

- 优先结构：看得见的产品结果 → 创始人需求 → 冷启动/获客 → 资本市场定价。
- 先安排用户能看懂的输入、操作、反馈：Devin 接受任务 → 打开浏览器/编辑器/终端 → 输出可审查结果。
- 相邻信息因果标注：需求 → 产品动作（causal，claim-devin-009/001）；产品动作 → 演示视频被看见（sequence-only，claim-devin-001/015）；演示视频 → 定价下降（sequence-only，claim-devin-015/005）；定价下降 → 奔驰采用（sequence-only，claim-devin-005/007）；奔驰采用 → 融资估值（sequence-only，claim-devin-007/016）。
- 转折带来新判断：2025-04-03 定价与并行能力让产品从团队工具变成个人可及。
- 结尾停在资本市场证据：25 亿美元 pre 估值融资超 10 亿美元（claim-devin-016）。

## 结构目标

- 时长：60 秒 ±20 秒（目标 40–80 秒区间）。
- 最多三个产品动作：① 自带浏览器/编辑器/终端自主执行（claim-devin-001/003/004）；② 并行 Devin（claim-devin-006）；③ 奔驰 COBOL 改造（claim-devin-007）。
- 每 20–40 秒新动作/证据/问题推进：0–20s 产品动作，20–40s 需求与定位，40–55s 定价与并行，55–70s 奔驰案例，70–80s 融资估值。
- 强事实同期证据：官方演示视频画面（claim-devin-001/003/004）、奔驰官方博客与客户访谈视频（claim-devin-007）。
- 真实产品画面：官方演示视频（claim-devin-001/003/004）用于前 20 秒产品定义；官方教程视频（claim-devin-006）用于 40–55s 并行 Devin 说明。
- seen-action-not-described-action：每个产品动作规划摄像机看见的步骤（接受任务 → 打开浏览器 → 修改文件 → 执行命令 → 输出结果）。

## 事实边界

- 不得进入旁白：claim-devin-010（SWE-bench 13.86%）、claim-devin-011（PR 合并率 34%→67%）。
- 不得把 500 美元/月与 20 美元/月写成同一套餐降价（claim-devin-005 notes）。
- 不宣称成功率、不补写心理低谷或危机、不用行业趋势填补 Why Now。
