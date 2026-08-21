<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "Devin 如何把‘写代码’变成‘派任务’，并让市场为这种新工作方式定价？",
  "audiencePromise": "你会看到一个产品如何把工程师从‘写代码的人’变成‘审查代码的人’，以及市场如何为这种变化给出价格。",
  "sourcedAnswer": "Devin 通过自带浏览器、代码编辑器和终端的沙箱环境，把任务变成可审查的 pull request（claim-devin-001, claim-devin-003, claim-devin-009）；2025 年 4 月把价格从团队版 500 美元/月降到个人版 20 美元/月起（claim-devin-005）；2026 年 5 月以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）。",
  "factBoundary": "不进入 SWE-bench 分数（claim-devin-010）、PR 合并率（claim-devin-011）、独立测试结果、模型架构或训练数据。",
  "emotionalArc": [
    {
      "beatId": "beat-01",
      "viewerState": "好奇：这个产品到底在干什么？",
      "storyMove": "展示 Devin 接受任务后自主打开浏览器、写代码、运行命令的完整过程",
      "targetRange": "0-20s",
      "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"]
    },
    {
      "beatId": "beat-02",
      "viewerState": "理解：这不是代码助手，是任务执行者",
      "storyMove": "揭示创始人的需求定义：让工程师审查结果，而不是自己写代码",
      "targetRange": "20-40s",
      "claimIds": ["claim-devin-009", "claim-devin-012", "claim-devin-013"]
    },
    {
      "beatId": "beat-03",
      "viewerState": "追问：这种工作方式值多少钱？",
      "storyMove": "展示价格变化：从团队版 500 美元/月到个人版 20 美元/月起",
      "targetRange": "40-55s",
      "claimIds": ["claim-devin-005"]
    },
    {
      "beatId": "beat-04",
      "viewerState": "确认：市场给了答案",
      "storyMove": "用融资估值和奔驰案例给出市场定价证据",
      "targetRange": "55-70s",
      "claimIds": ["claim-devin-007", "claim-devin-016"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin 自带浏览器、代码编辑器和终端，能自主执行任务",
      "withheldAnswer": "它解决的是谁的什么问题？",
      "purpose": "用可见的产品动作建立心智模型"
    },
    {
      "order": 2,
      "reveal": "创始人定义：工程师把任务交给 Devin 并审查结果",
      "withheldAnswer": "这种工作方式值多少钱？",
      "purpose": "把产品动作连接到需求定义"
    },
    {
      "order": 3,
      "reveal": "价格从团队版 500 美元/月降到个人版 20 美元/月起",
      "withheldAnswer": "市场如何定价这种变化？",
      "purpose": "用价格变化展示获客门槛降低"
    },
    {
      "order": 4,
      "reveal": "25 亿美元估值融资 + 奔驰 8 个月→8 天案例",
      "withheldAnswer": "无",
      "purpose": "用资本市场证据和客户结果给出市场定价"
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief: Episode 004 - Devin

## 核心问题

Devin 如何把'写代码'变成'派任务'，并让市场为这种新工作方式定价？

## 观众承诺

你会看到一个产品如何把工程师从'写代码的人'变成'审查代码的人'，以及市场如何为这种变化给出价格。

## 有来源的答案

- **产品动作**：Devin 通过自带浏览器、代码编辑器和终端的沙箱环境，把任务变成可审查的 pull request（claim-devin-001, claim-devin-003, claim-devin-009）
- **需求定义**：创始人明确说'工程师把任务交给 Devin 并审查结果'（claim-devin-009）
- **价格变化**：2025 年 4 月把价格从团队版 500 美元/月降到个人版 20 美元/月起（claim-devin-005）
- **市场定价**：2026 年 5 月以 25 亿美元 pre-money 估值融资超 10 亿美元（claim-devin-016）

## 事实边界

- **不进入**：SWE-bench 分数（claim-devin-010）、PR 合并率（claim-devin-011）、独立测试结果、模型架构或训练数据
- **不宣称**：成功率、无人监督、产品质量

## 情感弧线

| Beat | 时间 | 观众状态 | 故事动作 | Claim IDs |
|------|------|----------|----------|-----------|
| beat-01 | 0-20s | 好奇：这个产品到底在干什么？ | 展示 Devin 接受任务后自主打开浏览器、写代码、运行命令的完整过程 | claim-devin-001, claim-devin-003, claim-devin-004 |
| beat-02 | 20-40s | 理解：这不是代码助手，是任务执行者 | 揭示创始人的需求定义：让工程师审查结果，而不是自己写代码 | claim-devin-009, claim-devin-012, claim-devin-013 |
| beat-03 | 40-55s | 追问：这种工作方式值多少钱？ | 展示价格变化：从团队版 500 美元/月到个人版 20 美元/月起 | claim-devin-005 |
| beat-04 | 55-70s | 确认：市场给了答案 | 用融资估值和奔驰案例给出市场定价证据 | claim-devin-007, claim-devin-016 |

## 揭示顺序

1. **Devin 自带浏览器、代码编辑器和终端，能自主执行任务**
   - 暂缓答案：它解决的是谁的什么问题？
   - 作用：用可见的产品动作建立心智模型

2. **创始人定义：工程师把任务交给 Devin 并审查结果**
   - 暂缓答案：这种工作方式值多少钱？
   - 作用：把产品动作连接到需求定义

3. **价格从团队版 500 美元/月降到个人版 20 美元/月起**
   - 暂缓答案：市场如何定价这种变化？
   - 作用：用价格变化展示获客门槛降低

4. **25 亿美元估值融资 + 奔驰 8 个月→8 天案例**
   - 暂缓答案：无
   - 作用：用资本市场证据和客户结果给出市场定价

## 状态

- **Blockers**: 无
- **Verdict**: READY
- **Return To**: none
