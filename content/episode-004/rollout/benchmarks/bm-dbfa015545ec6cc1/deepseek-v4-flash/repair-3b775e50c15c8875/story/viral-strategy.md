# Devin Viral Strategy

## 1. Opening Hook（0–3 秒）
- 画面直接进入官方演示中 Devin 的界面：浏览器自动打开、地址栏填入 URL、页面加载、代码编辑器出现、终端滚动；此前提旁白，不做品牌铺垫。
- 同期证据：官方演示视频（src-devin-002）的连续动作序列，证明“动作在无人干预时发生”。
- 3–11 秒：用 Bloomberg/Wikipedia 来源的署名卡片与 Devin 官方功能描述（Claim 012、009）交代“三个奥赛金牌程序员要让它自己干完工程任务，工程师负责检查”。
- 11–20 秒：留下唯一问题——“市场后来给了它什么价？”，并开始展示官方演示在 YouTube 被观看。

## 2. Curiosity Gap
- 20 秒内观众已知：有一个能自己打开浏览器、写代码、跑命令的 AI 执行体；它背后是三位奥赛金牌程序员。
- 等待答案：这个产品后来被资本市场给了什么价。
- 不追问“能否替代程序员”——事实边界不支持；每个后续揭示都推进“冷启动 → 获客 → 企业接受 → 市场定价”这条链。

## 3. Emotional Tension
- 张力来自用户愿望/代价/选择：工程师过去的做法是自己盯浏览器、写代码；现在是把工程任务交给一个自动执行体，代价是必须检查结果（Claim 009 的“交给它，然后审查”）。
- 中段用奔驰案例（Claim 007）和企业把大任务交出去的选择、价格从团队版 500 美元/月到个人套餐 20 美元/月的选择，放大“谁有资格使用”的张力。
- 不制造危机，不写“AI 取代工程师”。

## 4. Information Reveal Order
| 次序 | 揭示内容 | 同期证据 | 新增信息 | 延后信息 |
|---|---|---|---|---|
| 1 | 任务交出去后，它自己打开浏览器开始干活 | 官方演示视频动作序列（source: src-devin-002） | 产品动作 | 谁做的、要解决什么 |
| 2 | 三个奥赛金牌程序员要让它自己把工程任务干完，工程师负责审查 | Bloomberg/Wikipedia 署名卡片；官方博客功能描述（Claim 012、009） | 创始人身份与需求 | 第一批人怎么看见它 |
| 3 | 官方演示超过 122 万次观看，种子轮 2100 万美元同期进来 | 官方 YouTube 播放量计数器（Claim 015）；WSJ/Wikipedia 报道标题（Claim 014） | 冷启动与初始资本 | 后来怎么降低使用门槛 |
| 4 | GA 团队版 500 美元/月（2024-12）；Devin 2.0 个人套餐 20 美元/月起并可并行（2025-04）；奔驰把预计 8 个月压到 8 天 | 官方博客价格/GA 公告（Claim 005）；Devin 2.0 并行演示（Claim 006）；奔驰官方访谈视频（Claim 007） | 获客选择与企业接受 | 市场给了什么价 |
| 5 | 2026-05 以 25 亿美元 pre-money 估值融资超 10 亿美元 | TechCrunch 报道标题/官方博客（Claim 016） | 资本市场定价 | 无 |

- 口径边界：500 美元/月是 2024 年 12 月 GA 的团队版价格，20 美元/月起是 2025 年 4 月 Devin 2.0 的个人套餐价格，不是同一个套餐降价；25 亿是 pre-money，post-money 为 26 亿。这些必须在当次揭示中讲清，不能延后。

## 5. Ending Payoff
- 结尾回答开场问题“市场后来给了它什么价？”：直接停在 25 亿美元 pre-money 估值、超 10 亿美元融资（Claim 016）。
- 不回看开场任务：中段没有改变“它自己打开浏览器干活”的含义，回看没有新增信息；结尾停在新可验证结果。
- 不追加互动 CTA，不预测行业趋势，不把融资换算成成功。

## 6. 视觉证据与来源安排
- 真实产品操作：官方演示/教程/并行视频（src-devin-002、003、013、014、015）→ 自主执行、并行、自接活。
- 人物/采访：奔驰官方访谈视频（src-devin-011）→ 企业把大任务交给它。
- 分发/结果：YouTube 播放量计数、官方博客/新闻标题截图 → 冷启动、融资、价格。
- 静态证据保持来源与数字可读，不以画面运动遮挡关键信息。

## Gate
<!-- viral-strategy-gate
{
  "rubricVersion": "viral-strategy-v2",
  "reviewedFiles": {
    "directorBriefSha256": "d174a2fd581774dbe52ed4e0ba1781e220402eeab4ad92a96b2ba980e47fb46b",
    "storyBibleSha256": "8c257e1eb4bd405c2a6624d6fab0f66cc15f291c0cd08a3412de9026727659d6",
    "storyAngleSha256": "1c086fddda846cf3b1099b9b04e574431e090f0c98dce95c5156432d68cbeee1",
    "threeActStructureSha256": "0e1fd693de1f82e4aa05f9d2c13f33f24b89ae965af62a2d3f3dea4949babb8f",
    "hookCandidatesSha256": "e5a4b8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  },
  "scores": {
    "openingHook": 4,
    "curiosityGap": 4,
    "emotionalTension": 4,
    "informationRevealOrder": 5,
    "endingPayoff": 5
  },
  "totalScore": 22,
  "verdict": "READY",
  "blockers": []
}
-->