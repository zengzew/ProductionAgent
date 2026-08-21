<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "三位 IOI 金牌得主做的 AI 软件工程师，第一批人为什么愿意用，市场后来给了什么价格？",
  "audiencePromise": "观众将看到 Devin 如何把一个编程任务变成自主执行并产出一个可审查的结果，以及资本市场如何给这个能力定价。",
  "sourcedAnswer": "三位 IOI 金牌得主（Scott Wu、Steven Hao、Walden Yan）于 2024 年 3 月发布 Devin，定位为自主执行任务的 AI 软件工程师；产品经过 GA 团队定价（500 美元/月）后，于 2025 年 4 月推出个人套餐（20 美元/月起）；公司自身 89% 代码由 Devin 提交奔驰试点把 20 万行 COBOL 改造从预计 8 个月缩短到 8 天；2026 年 5 月以 25 亿美元 pre-money 估值融资超 10 亿美元。",
  "factBoundary": "不得将 SWE-bench 13.86%（claim-devin-010）、PR 合并率与解题速度（claim-devin-011）写入旁白；不得把 500 美元/月与 20 美元/月写成同一套餐降价路径；Mercedes COBOL 案例中的'预计 8 个月'是项目估算，不是实测对比。",
  "emotionalArc": [
    {
      "beatId": "beat-01",
      "viewerState": "好奇/存疑",
      "storyMove": "开场展示 Devin 自主执行一个编程任务的实际画面，提出三位 IOI 金牌得主做 AI 软件工程师的反常前提。",
      "targetRange": "0–15 秒",
      "claimIds": ["claim-devin-001", "claim-devin-002", "claim-devin-003", "claim-devin-004", "claim-devin-012", "claim-devin-013"]
    },
    {
      "beatId": "beat-02",
      "viewerState": "理解/跟进",
      "storyMove": "展示 Devin 接受任务→自主规划→打开浏览器/写代码/执行→提交结果的完整闭环；用 Mercedes COBOL 案例建立企业级任务可信度。",
      "targetRange": "15–40 秒",
      "claimIds": ["claim-devin-007", "claim-devin-009"]
    },
    {
      "beatId": "beat-03",
      "viewerState": "验证/定价",
      "storyMove": "用资本市场定价收尾：公司自身 89% 代码由 Devin 提交 → 25 亿美元 pre-money 估值融资超 10 亿美元。",
      "targetRange": "40–60 秒",
      "claimIds": ["claim-devin-008", "claim-devin-016"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin 在自带界面里自主打开网页、写代码、执行命令——三位 IOI 金牌得主把它定位为 AI 软件工程师。",
      "withheldAnswer": "为什么是这三个创始人；获客方式。",
      "purpose": "建立产品定义与创始团队背景，提供可观察的产品动作。"
    },
    {
      "order": 2,
      "reveal": "Devin 把奔驰 20 万行 COBOL 代码的现代化改造从预计 8 个月缩短到 8 天。",
      "withheldAnswer": "定价与收费方式。",
      "purpose": "用企业级案例证明任务范围，建立可信度。"
    },
    {
      "order": 3,
      "reveal": "公司自身工程师提交的代码中 89% 由 Devin 完成；2026 年 5 月融资超 10 亿美元，估值 25 亿美元 pre-money。",
      "withheldAnswer": "无。",
      "purpose": "用内部自用数据与资本市场定价同时收尾，正面证明产品被真实使用并被市场高价认可。"
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief — Episode 004: Devin / Cognition

## Core Story Question
三位 IOI 金牌得主做的 AI 软件工程师，第一批人为什么愿意用，市场后来给了什么价格？

## Audience Promise
观众将看到 Devin 如何把一个编程任务变成自主执行并产出一个可审查的结果，以及资本市场如何给这个能力定价。

## Sourced Answer
三位 IOI 金牌得主（Scott Wu、Steven Hao、Walden Yan）于 2024 年 3 月发布 Devin，定位为自主执行任务的 AI 软件工程师；产品经过 GA 团队定价（500 美元/月）后，于 2025 年 4 月推出个人套餐（20 美元/月起）；公司自身 89% 代码由 Devin 提交；奔驰试点把 20 万行 COBOL 改造从预计 8 个月缩短到 8 天；2026 年 5 月以 25 亿美元 pre-money 估值融资超 10 亿美元。

## Fact Boundary
- **禁止入旁白**: SWE-bench 13.86%（claim-devin-010）、PR 合并率与解题速度数据（claim-devin-011）
- **禁止价格误导**: 500 美元/月是 2024-12-10 GA 时的团队版价格，20 美元/月是 2025-04-03 Devin 2.0 的个人套餐起价；不得写成同一套餐降价
- **Mercedes 口径边界**: "预计 8 个月"是项目估算，不是实测对比结果
- **"自主"定义**: 指产品形态（任务输入→自主执行→输出结果），不宣称成功率或无人监督

## Emotional Arc

| Beat | Time | Viewer State | Story Move | Key Claims |
|------|------|--------------|------------|------------|
| beat-01 | 0–15s | 好奇/存疑 | 开场展示 Devin 自主执行编程任务的实际画面，提出三位 IOI 金牌得主做 AI 软件工程师的反常前提 | claim-devin-001, 002, 003, 004, 012, 013 |
| beat-02 | 15–40s | 理解/跟进 | 展示任务→自主规划→执行→提交结果的完整闭环；用 Mercedes COBOL 案例建立企业级任务可信度 | claim-devin-007, 009 |
| beat-03 | 40–60s | 验证/定价 | 用资本市场定价收尾：公司自身 89% 代码由 Devin 提交 → 25 亿美元 pre-money 估值融资超 10 亿美元 | claim-devin-008, 016 |

## Reveal Order

1. **0–20s**: Devin 在自带界面里自主打开网页、写代码、执行命令——三位 IOI 金牌得主把它定位为 AI 软件工程师。*暂缓：为什么是这三个创始人；获客方式* → 建立产品定义与创始团队背景，提供可观察的产品动作。

2. **20–40s**: Devin 把奔驰 20 万行 COBOL 代码的现代化改造从预计 8 个月缩短到 8 天。*暂缓：定价与收费方式* → 用企业级案例证明任务范围，建立可信度。

3. **40–60s**: 公司自身工程师提交的代码中 89% 由 Devin 完成；2026 年 5 月融资超 10 亿美元，估值 25 亿美元 pre-money。*无暂缓* → 用内部自用数据与资本市场定价同时收尾，正面证明产品被真实使用并被市场高价认可。

## Product Visual Plan
- **真实截图来源**: 官方演示视频（src-devin-002 首发演示；src-devin-013 Upwork 案例）可逐帧核对 Devin 自带浏览器、终端、代码编辑器界面
- **功能演示**: 需要展示 Devin 接受任务→自主执行→输出结果的完整闭环；如真实素材不足，明确标注"功能演示"
- **Mercedes 案例**: 官方博客（src-devin-006）与官方访谈视频（src-devin-011）可交叉证明 20 万行 COBOL → 8 天数字

## Three Story Angles Considered

### Angle A: "三个金牌程序员造了一个会编程的同事"
强调创始团队背景与产品形态的直接反差。适合从创始人视角出发，但缺少需求→产品→市场定价的完整链条。

### Angle B: "AI 软件工程师值多少钱"
从 Mercedes COBOL 案例的时间压缩切入，引出资本市场定价。问题："值多少钱"预设了价格争议，本集没有足够的竞品对比或用户付费数据支撑。

### Angle C: "它能自主把任务跑完，还把代码交给工程师审查"
从产品可见动作出发，建立"自主 AI 软件工程师"的心智模型，用 Mercedes 案例证明任务范围，最后用资本市场定价验证价值。**选择 Angle C**。

## Story Bible Summary

- **Product**: Devin by Cognition — 自主 AI 软件工程师，自带浏览器、代码编辑器、终端；接受任务后自主规划、执行并提交结果
- **Team**: Scott Wu、Steven Hao、Walden Yan — 三位 IOI 金牌得主
- **Cold Start Signal**: 官方演示视频发布同日获 Founders Fund 2100 万美元种子轮，估值 3.5 亿美元
- **Turning Interval**: 2025-04-03 Devin 2.0（个人套餐 20 美元/月起，支持多 Devin 并行）→ 2026-04-27 Mercedes 案例 → 2026-05-27 融资超 10 亿美元、25 亿美元 pre-money 估值
- **Capital Evidence**: 25 亿美元 pre-money 估值融资超 10 亿美元（TechCrunch/官方同日披露）
- **Internal Adoption**: 公司工程师 89% 代码由 Devin 提交（官方博客 2026-05-27）
- **Ending**: 停在 2026-05-27 融资披露，用"内部自用比例 + 资本市场定价"双重验证产品价值

## Key Open Questions（Not Blockers for This Episode）
- 创始人具体如何发现"需要 AI 做完整软件工程任务"这个需求：Scott Wu 提到奥赛背景让他们把这件事当算法问题解决，但"需求发现"本身缺乏来源支持。本集不补心理，只用创始团队背景建立可信度。
- 冷启动获客具体机制：官方演示视频播放量 122 万+（claim-devin-015）作为可见曝光，但不换算转化率。
- 个人套餐 20 美元/月后的用户增长曲线：growth-data.md 中有融资节点但无用户量数据。

## Verdict
**READY** — 所有叙事决策均可由当前 research package 支持，无 blocker。
