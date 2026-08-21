# Story Bible — Episode 004: Devin / Cognition

## Product Identity

**Devin** — 自主 AI 软件工程师
- 官方定位：第一个 AI 软件工程师（claim-devin-002）
- 核心能力：接受任务 → 自主规划 → 使用自带浏览器、代码编辑器、终端执行 → 输出可审查结果（claim-devin-001, claim-devin-003, claim-devin-004）
- 任务形式：官方把 Devin 定位为"独立完成任务、交给工程师审查的队友"（claim-devin-009）
- 技术边界："自主"指产品形态，不宣称成功率；SWE-bench 13.86%（claim-devin-010）不进旁白

## Team

**Cognition** — 由三位 IOI 金牌得主创立
- Scott Wu、Steven Hao、Walden Yan（claim-devin-012）
- 创始人对需求的表述：奥赛背景让他们把"教 AI 做软件工程师"当算法问题解决（claim-devin-013）
- 创始团队背景是可信度来源，不是叙事主角的戏剧动机

## Cold Start Signal

- 官方演示视频 2024-03-12 上传，截至 2026-08-16 播放量 122 万+（claim-devin-015）
- Founders Fund 2100 万美元种子轮同日到位，估值 3.5 亿美元（claim-devin-014）
- 冷启动靠公开演示被看见；不换算转化率

## Turning Interval

**2024-03-12 → 2026-05-27**

| Date | Event | Story Function | Key Claims |
|------|-------|----------------|------------|
| 2024-03-12 | Devin 发布，官方演示视频首发 | problem / product identity | claim-devin-001, 002, 003 |
| 2024-12-10 | GA，团队版 500 美元/月 | distribution event | claim-devin-005 |
| 2025-04-03 | Devin 2.0，个人套餐 20 美元/月起，支持多 Devin 并行 | turning point | claim-devin-005, 006 |
| 2026-04-27 | Mercedes 合作：20 万行 COBOL，预计 8 个月 → 8 天 | turning point | claim-devin-007 |
| 2026-05-27 | 融资超 10 亿美元，估值 25 亿美元 pre-money；内部 89% 代码由 Devin 提交 | public expansion / validation | claim-devin-008, 016 |

**Mercedes 口径边界**: "预计 8 个月"是项目估算，不是实测对比。

## Capital Evidence（正面结尾）

- 2024-03: Founders Fund 2100 万美元种子轮，估值 3.5 亿美元
- 2026-05-27: 融资超 10 亿美元，25 亿美元 pre-money（26 亿美元 post-money）（claim-devin-016）
- TechCrunch 与官方博客同日披露

## Internal Adoption Evidence

- 2026-05-27 官方博客：公司工程师提交的代码中 89% 由 Devin 提交（claim-devin-008）
- 仅作产品被真实使用的证据，不换算为质量或成功率

## Pricing Evolution

| Date | Tier | Price | Notes |
|------|------|-------|-------|
| 2024-12-10 GA | 团队版 | 500 美元/月，不限席位 | claim-devin-005 |
| 2025-04-03 | 个人套餐 | 20 美元/月起 | claim-devin-005 |

**禁止写法**: 不得将 500 美元/月与 20 美元/月写成同一套餐降价；两者是不同产品层级。

## Product Visual Requirements

- **真实截图**: 官方演示视频（src-devin-002 首发；src-devin-013 Upwork 案例）可逐帧核对 Devin 自带界面
- **Mercedes 证据**: 官方博客（src-devin-006）与官方访谈视频（src-devin-011）可交叉证明 20 万行 COBOL 数字
- **功能演示**: 需展示 Devin 接受任务→自主执行→输出结果的闭环；如素材不足，明确标注"功能演示"

## What Does NOT Enter This Story

- SWE-bench 13.86%（claim-devin-010）：仅作研究背景，不进旁白
- PR 合并率 34%→67%、解题速度 4 倍（claim-devin-011）：仅作研究背景，不进旁白
- 2025-01 独立测试 20 项完成 3 项：第三方批判口径，与官方演示存在争议，本集不进入
- 创始人"需求发现"的具体过程：缺乏来源支持，不补心理

## Story Thesis（For TTS Reference）

> This product promises to autonomously complete software engineering tasks end-to-end, delivering tested, reviewable results to engineers.
>
> The evidence shows that promise through visible execution steps, a Fortune 500 enterprise case, internal adoption data, and a $2.5B pre-money valuation with over $1B raised.

## Structural Reminders

- 本集优先结构：看得见的产品结果 → 创始团队背景 → 企业级验证 → 资本市场定价
- 需求→产品动作→获客→资本市场定价应成为可追踪链；相邻信息只有 Claim 支持因果时才标 `causal`
- 每 20–40 秒必须有新动作、新证据或问题推进
- 结尾优先停在有 Claim 的资本市场证据；回看开场不是默认
- 全片最多三个产品动作
- 零背景观众应在 20 秒内理解：Devin 是一个能自主执行编程任务的 AI
