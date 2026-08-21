# director-brief.md

## director-brief-gate

```json
{
  "facts.json_sha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
  "sources.json_sha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
  "timeline.json_sha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8",
  "verdict": "READY",
  "returnTo": null,
  "blockers": []
}
```

## coreStoryQuestion

三个 IOI 金牌程序员做了一个能自己打开浏览器、写代码、跑命令的 AI 软件工程师，他们怎么让第一批人相信它真能干活，市场后来给了它什么价？

## audiencePromise

观众将在 60 秒内看到：一个反常的产品结果（AI 真的在屏幕里自己干活）→ 创始人如何定义这个需求 → 冷启动靠什么被看见 → 从 500 美元团队版到 20 美元个人版再到奔驰案例，市场如何一步步给它定价。

## sourcedAnswer

- 需求与产品动作：Scott Wu 称奥赛背景让团队在教 AI 做复杂编程决策上更有优势（claim-devin-013）；Devin 自带浏览器、代码编辑器、终端，接受任务后自主执行（claim-devin-001, claim-devin-003）。
- 冷启动/获客：2024-03-12 官方演示视频发布，截至 2026-08-16 播放量超 122 万次（claim-devin-015）。
- 市场定价：2024 年初 Founders Fund 2100 万美元种子轮、估值 3.5 亿美元（claim-devin-014）；2024-12 GA 团队版 500 美元/月（claim-devin-005）；2025-04 Devin 2.0 个人版起价 20 美元/月（claim-devin-005）；2026-04 奔驰案例 8 个月→8 天（claim-devin-007）；2026-05 融资超 10 亿美元、估值 25 亿美元 pre（claim-devin-016）。

## factBoundary

- 不得宣称 Devin 的成功率、无人监督或取代程序员。
- 不得把 500 美元写成个人套餐降价前的价格；500 美元是 2024-12 GA 团队版，20 美元是 2025-04 个人版起价。
- 不得把 SWE-bench 13.86% 或 PR 合并率 34%→67% 当作真实任务成功率。
- 不得虚构创始人心理低谷、危机或顿悟。
- 不得把高盛试点、独立测试争议等未进入 facts.json 的材料写入旁白。

## emotionalArc

- 0–10s（claim-devin-001, claim-devin-003, claim-devin-004）：好奇——屏幕里真的有个 AI 在自己干活。
- 10–30s（claim-devin-012, claim-devin-013, claim-devin-015）：理解——三个奥赛金牌做这件事，靠一条演示视频被看见。
- 30–50s（claim-devin-005, claim-devin-006, claim-devin-007）：相信——从 500 美元团队版到 20 美元个人版，再到奔驰 8 个月→8 天。
- 50–60s（claim-devin-016, claim-devin-008）：定价——25 亿美元估值，公司 89% 代码由 Devin 提交。

## revealOrder

1. 0–10s：新增——Devin 在屏幕里自己打开浏览器、写代码、跑命令的可见动作（claim-devin-001, claim-devin-003, claim-devin-004）。暂缓答案：谁做的、为什么能做成。作用：建立产品心智模型，让观众追问“它解决了谁的什么需求”。
2. 10–20s：新增——三个 IOI 金牌创始人（claim-devin-012）与 Scott Wu 对需求的口述（claim-devin-013）；冷启动靠官方演示视频 122 万播放（claim-devin-015）。暂缓答案：市场怎么给它定价。作用：回答“谁做的、怎么被看见”。
3. 20–40s：新增——2024-12 GA 团队版 500 美元/月（claim-devin-005）；2025-04 Devin 2.0 个人版 20 美元/月起、支持平行 Devin（claim-devin-005, claim-devin-006）。作用：展示从企业优先到个人可用的尺度变化。
4. 40–55s：新增——2026-04 奔驰案例 20 万行 COBOL、8 个月→8 天（claim-devin-007）。作用：给出大客户验证的产品结果。
5. 55–60s：新增——2026-05 融资超 10 亿美元、估值 25 亿美元 pre（claim-devin-016）；公司 89% 代码由 Devin 提交（claim-devin-008）。作用：用资本市场证据和公司自用数据收束。

## blockers

无。

## verdict

READY

## returnTo

null