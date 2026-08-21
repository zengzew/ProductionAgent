<!-- director-brief-gate
{
 "rubricVersion": "director-brief-v1",
 "reviewedFiles": {
  "facts.json": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
  "sources.json": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
  "timeline.json": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
 },
 "coreStoryQuestion": "Cognition 的创始人抓住了哪个需求，Devin 靠什么让第一批人看见并相信它，市场后来给了它什么定价？",
 "audiencePromise": "在 60 秒内让零背景观众看懂 Devin 是一个可以看着它干活、把工程任务做完再交给工程师审查的 AI 软件工程师，并知道它发布时的公开演示、后来的价格/并行能力，以及 2026 年资本市场给出的价格。",
 "sourcedAnswer": "Devin 的产品承诺是：接受任务后用自带浏览器、代码编辑器和终端逐步执行，把任务做完交给工程师审查（claim-devin-001/003/009）。创始人背景是三位国际信息学奥赛金牌得主，Scott Wu 称奥赛背景让团队更擅长把教 AI 做复杂编程决策当作算法问题（claim-devin-012/013）。冷启动证据是 2024-03-12 官方发布演示视频，截至 2026-08-16 播放 122 万+ 次（claim-devin-015），GA 后团队版 500 美元/月，Devin 2.0 个人套餐 20 美元/月起并支持平行 Devin（claim-devin-005/006）。市场定价：早期 Founders Fund 种子轮 2100 万美元、估值 3.5 亿美元（claim-devin-014）；2026-05-27 以 25 亿美元 pre-money（26 亿美元 post-money）估值融资超 10 亿美元（claim-devin-016）；奔驰案例显示 20 万行 COBOL 从预计 8 个月缩短到 8 天（claim-devin-007），公司自报 89% 自有代码由 Devin 提交（claim-devin-008）。",
 "factBoundary": "旁白只用 allowedInNarration=true 的 Claim；不进 SWE-bench 13.86%（claim-devin-010）、PR 合并率/速度（claim-devin-011）、独立测试口径；'第一位 AI 软件工程师'是官方自我定位；演示画面是官方演示不是独立评测；500 美元/月是 2024-12-10 GA 团队版价格，20 美元/月是 Devin 2.0 个人套餐起价，不能写成同一套餐降价。",
 "emotionalArc": [
  { "timeRange": "0-20s", "emotion": "好奇：一个能自己干活的 AI 软件工程师长什么样，它真的在工作吗", "claimIds": ["claim-devin-001","claim-devin-003","claim-devin-004","claim-devin-015"] },
  { "timeRange": "20-40s", "emotion": "理解：为什么是这三个奥赛金牌创始人；价格与并行能力如何让产品从团队走向个人", "claimIds": ["claim-devin-012","claim-devin-013","claim-devin-005","claim-devin-006"] },
  { "timeRange": "40-60s", "emotion": "确认与定价：大厂案例与公司自用提升可信度，最终由融资估值给出市场答案", "claimIds": ["claim-devin-007","claim-devin-008","claim-devin-016"] }
 ],
 "revealOrder": [
  { "step": 1, "newInformation": "Devin 接受任务后会用浏览器、代码编辑器、终端自己执行，而且每步可见；官方发布演示视频播放量 122 万+。", "withheldAnswer": "暂时不解释谁做的、为什么现在出现、市场给多少估值。", "function": "先建立可看见的产品心智模型，让观众问出：他解决了谁的什么需求？" },
  { "step": 2, "newInformation": "三位创始人都是 IOI 金牌得主；Scott Wu 说奥赛背景让团队在教 AI 做复杂编程决策上有优势。", "withheldAnswer": "先不给融资和客户案例，保持问题集中在'团队为什么适合做这件事'。", "function": "回答'为什么是这个团队'，把 idea 与能力选择连起来。" },
  { "step": 3, "newInformation": "产品从团队版 500 美元/月扩展到个人套餐 20 美元/月起，并支持平行 Devin 并行处理多个任务。", "withheldAnswer": "暂时不给奔驰与最终估值，让观众先看产品如何进入个人和并行场景。", "function": "展示获客/定价的可见选择，是本片的中心转折区间。" },
  { "step": 4, "newInformation": "奔驰案例：20 万行 COBOL 从预计 8 个月缩短到 8 天；Cognition 自报 89% 自有代码由 Devin 提交。", "withheldAnswer": "把最终资本市场价格留到最后。", "function": "用外部客户与内部自用两个可信度证据回答'除了演示它还做了什么'。" },
  { "step": 5, "newInformation": "2026-05-27 融资超 10 亿美元，25 亿美元 pre-money / 26 亿美元 post-money 估值。", "withheldAnswer": "不再引入新问题。", "function": "以有来源的资本市场证据收束，不回看开场。" }
 ],
 "blockers": [],
 "verdict": "READY",
 "returnTo": "none"
}
-->

# Director Brief — episode-004: Devin / Cognition

## Decision
- Core question: one question only.
- Chosen angle: visible product result -> founder/idea -> pricing cold-start -> capital-market proof.
- Single turning interval: 2025-04-03 Devin 2.0, where team-only $500/month plan is joined by a personal plan from $20/month and parallel Devins.
- Ending: 2026-05-27 financing >$1B at $2.5B pre-money / $2.6B post-money.

## Editorial guardrails
- No narration draft; structure only.
- Use `causal` only when a Claim asserts the relationship; otherwise `sequence-only`.
- No SWE-bench, no PR-merge-rate, no conversion claims, no invented user pain.
- Do not add a 'why now' trend; the as-of state is durability of official material, not a timing claim.
- Real product video is primary evidence before any graphics.
