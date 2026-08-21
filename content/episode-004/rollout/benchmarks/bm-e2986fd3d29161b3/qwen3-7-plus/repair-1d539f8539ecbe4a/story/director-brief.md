<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "Devin 抓住了哪个需求，怎么让第一批人用起来，市场后来给了它什么价？",
  "audiencePromise": "看到一个能自己打开浏览器、写代码、跑命令的 AI 软件工程师，从官方演示到奔驰 20 万行代码改造，再到 25 亿美元估值的市场定价。",
  "sourcedAnswer": "需求：把工程任务交给一个能自主执行并产出可审查结果的队友（claim-devin-009）。冷启动：2024-03-12 官方演示视频公开，展示自带浏览器、代码编辑器与终端的自主执行（claim-devin-001、claim-devin-002、claim-devin-015）。市场定价：2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）。",
  "factBoundary": "不宣称成功率或无人监督；不把 SWE-bench 分数换算为真实任务成功率；不把 500 美元写成个人套餐降价到 20 美元（500 美元为 2024-12 GA 团队版，20 美元为 2025-04 个人版起价）；不补写创始人心理或顿悟；不把第三方测试争议纳入主线。",
  "emotionalArc": [
    {
      "beatId": "hook-result",
      "viewerState": "好奇：这个界面里正在发生什么？",
      "storyMove": "展示 Devin 在自带浏览器、代码编辑器与终端里自主执行任务的真实画面。",
      "targetRange": "0–10s",
      "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"]
    },
    {
      "beatId": "need-and-founder",
      "viewerState": "理解：这是给工程师的队友，不是代码补全。",
      "storyMove": "用创始人对需求的口述与 IOI 金牌背景解释为什么做这件事。",
      "targetRange": "10–25s",
      "claimIds": ["claim-devin-009", "claim-devin-012", "claim-devin-013"]
    },
    {
      "beatId": "distribution-shift",
      "viewerState": "看到门槛变化：从团队版 500 美元到个人 20 美元，并支持并行 Devin。",
      "storyMove": "用 2024-12 GA 与 2025-04 2.0 的价格与能力对比呈现获客门槛下降。",
      "targetRange": "25–45s",
      "claimIds": ["claim-devin-005", "claim-devin-006"]
    },
    {
      "beatId": "enterprise-proof",
      "viewerState": "相信它能处理大规模真实任务。",
      "storyMove": "奔驰 20 万行 COBOL 改造从预计 8 个月缩短到 8 天。",
      "targetRange": "45–55s",
      "claimIds": ["claim-devin-007"]
    },
    {
      "beatId": "market-price",
      "viewerState": "知道市场如何定价。",
      "storyMove": "2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元。",
      "targetRange": "55–65s",
      "claimIds": ["claim-devin-016"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin 在自带浏览器、代码编辑器与终端里自主执行任务的可见画面。",
      "withheldAnswer": "这是给谁用的、解决了什么需求？",
      "purpose": "用反常结果建立好奇心，让观众追问产品定义。"
    },
    {
      "order": 2,
      "reveal": "创始人把 Devin 定位为能独立完成任务、交给工程师审查的队友；IOI 金牌背景。",
      "withheldAnswer": "它怎么被第一批人用起来？",
      "purpose": "回答需求与能力选择，建立产品心智模型。"
    },
    {
      "order": 3,
      "reveal": "2024-12 GA 团队版 500 美元/月 → 2025-04 个人版 20 美元/月起，并支持并行 Devin。",
      "withheldAnswer": "它能在多大规模上被验证？",
      "purpose": "展示获客门槛下降与能力扩展。"
    },
    {
      "order": 4,
      "reveal": "奔驰 20 万行 COBOL 改造从预计 8 个月缩短到 8 天。",
      "withheldAnswer": "市场给了它什么价？",
      "purpose": "用企业级案例证明真实任务承载力。"
    },
    {
      "order": 5,
      "reveal": "2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元。",
      "withheldAnswer": "无",
      "purpose": "用资本市场证据收束全片。"
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief — Episode 004: Devin

## 10 个先回答

1. 全片唯一要回答的问题：Devin 抓住了哪个需求，怎么让第一批人用起来，市场后来给了它什么价？
2. 有来源的答案：需求是“把工程任务交给能独立执行并产出可审查结果的队友”（claim-devin-009）；冷启动靠 2024-03-12 官方演示视频公开（claim-devin-015）；市场定价为 2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）。
3. 关键缺口：没有独立第三方成功率评测进入主线；获客转化数据缺失，只能用价格门槛变化与官方案例替代。
4. 可观察动作的主体：Cognition 团队发布产品与演示；Devin 在官方视频中打开浏览器、写代码、执行命令；奔驰作为客户部署。
5. 产品张力：旧行为是工程师逐步手动写代码、查资料、跑命令；新行为是把任务交给 Devin，它自主执行并产出可审查的 pull request。
6. 转折区间：2024-12 GA 团队版 500 美元/月 → 2025-04 2.0 个人版 20 美元/月起并支持并行 Devin（claim-devin-005、claim-devin-006）。
7. Why Now 证据：创始人 IOI 金牌背景与对“教 AI 做复杂编程决策”的口述（claim-devin-012、claim-devin-013）；不扩展到时代趋势。
8. 只能证明规模的数据：官方演示播放量 122 万+（claim-devin-015）证明被看见，不换算转化。
9. 结尾停在：2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）。
10. 零背景观众前 20 秒一句话：一个能自己打开浏览器、写代码、跑命令的 AI 软件工程师。
11. 保留概念接住的问题：自带浏览器/编辑器/终端（claim-devin-003）接住“它怎么干活”；并行 Devin（claim-devin-006）接住“能同时做多少”；奔驰案例（claim-devin-007）接住“能处理多大任务”。
12. 第一帧已经改变：Devin 在自带界面里正在执行任务，观众看见结果而非即将开始。
13. 强事实同期证据：官方演示视频画面（claim-devin-001、claim-devin-003、claim-devin-004）；奔驰案例有官方博客与客户访谈视频（claim-devin-007）。
14. 链条：需求（队友式自主执行）→ 产品动作（自带环境的自主执行与并行）→ 获客/分发（GA 团队版到个人版降价）→ 资本市场证据（25 亿美元估值融资）。
15. 可纠正的误解：观众可能把“AI 软件工程师”理解为代码补全；用“自带浏览器、代码编辑器与终端的自主执行”画面纠正。

## Story Thesis

This product promises an autonomous software engineering teammate that independently completes tasks for engineers to review.

The evidence shows that promise through official demo videos of sandboxed execution, a price and parallel-capability shift that lowers access, and an enterprise case with Mercedes-Benz plus a $2.5B pre-money valuation.

## 编辑政策执行

- 优先结构：看得见的产品结果 → 创始人需求口述 → 获客门槛变化 → 资本市场定价。
- 相邻段落因果标注：需求 → 产品动作（causal，claim-devin-009 支持）；产品动作 → 价格与并行（sequence-only，资料未证明因果）；并行/降价 → 奔驰案例（sequence-only）；奔驰案例 → 融资估值（sequence-only）。
- 转折带来新判断：从团队版高价到个人版低价与并行能力，改变获客门槛与使用尺度。
- 结尾停在有 Claim 的资本市场证据，不回看开场。
