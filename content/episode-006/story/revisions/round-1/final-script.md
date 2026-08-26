# Rikyū 脚本初稿 — episode-006

状态：`story-approved`

## seg-001

- Section: `hook`
- Target seconds: `7`
- Claim IDs: `claim-rikyu-006, claim-rikyu-007, claim-rikyu-009`
- Source identity: 开发者 X 帖素材或“功能演示”动画、ITmedia、创始人公开披露
- Visual intent: 画面正中是 Logo 画布：淡色网格先铺满，一个圆出现并锁定，一条直线穿过圆心，辅助线把圆切分后 Logo 轮廓在对齐中成形；随后右上角浮出证据卡“ITmedia 2026-08-13”，卡内分列“帖子展示 5,000,000+”与“功能发布后一天 10,000+ 人使用（创始人公开披露，经 ITmedia）”。来源标签不遮挡几何元素的出现。
- Fact boundary: 5,000,000+ 是帖子展示次数，10,000+ 是功能发布后一天的创始人披露口径；不把展示当用户数，也不建立转化率；几何步骤是产品呈现的设计过程，不断言内部按几何规则构造。
- Time range: 00:00–00:07

### Narration

有个开发者，把 AI 画 Logo 的过程发上网。

这条帖子，五百万次展示。发布后一天，超过一万人使用。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|---|---|---|---|
| 有个开发者，把 AI 画 Logo 的过程发上网。 | demonstration | claim-rikyu-006 | 开发者 X 帖素材或“功能演示”动画 |
| 这条帖子，五百万次展示。 | independently-verified | claim-rikyu-007 | ITmedia |
| 发布后一天，超过一万人使用。 | founder | claim-rikyu-009 | 创始人公开披露，经 ITmedia |

## seg-002

- Section: `product-model`
- Target seconds: `11`
- Claim IDs: `claim-rikyu-001, claim-rikyu-002`
- Source identity: Rikyū 官网与条款、ITmedia
- Visual intent: 官网截图（标注“Rikyū 官网，2026-08-25 访问”）：光标在自然语言输入框内逐字打出需求，随后生成结果缩略图依次排入画布，缩略图分别带 Logo、网页、社交贴、印刷品标签；屏幕底部升起文字卡“无需设计技能，也不用反复猜测”。
- Fact boundary: 产品定义由官网、条款与独立媒体交叉核对；“无需设计技能，也不用反复猜测”是官网对目标需求的表述，不宣称实际用户都不需要设计能力。
- Time range: 00:07–00:18

### Narration

发这条演示的，是开发者铃木海星。他做的 AI 设计服务，叫 Rikyū。

你说需求，它生成 Logo、网页、社交和印刷设计。官网说，无需设计技能，也不用反复猜。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|---|---|---|---|
| 发这条演示的，是开发者铃木海星。 | founder | claim-rikyu-006 | 开发者 X 帖素材或“功能演示”动画 |
| 他做的 AI 设计服务，叫 Rikyū。 | independently-verified | claim-rikyu-001 | Rikyū 官网与条款、ITmedia |
| 你说需求，它生成 Logo、网页、社交和印刷设计。 | independently-verified | claim-rikyu-001 | Rikyū 官网与条款、ITmedia |
| 官网说，无需设计技能，也不用反复猜。 | company | claim-rikyu-002 | Rikyū 官网 |

## seg-003

- Section: `cold-start-contrast`
- Target seconds: `9`
- Claim IDs: `claim-rikyu-005`
- Source identity: 创始人公开回顾（经公开索引）
- Visual intent: 画面出现对比卡：“2026 年 7 月上线首日：7 名用户（创始人回顾，经公开索引）”，数字 7 计数弹出；随后问题文字卡浮现：“怎么在发布后一天，就有一万人来用？”。
- Fact boundary: 7 名用户是创始人对早期结果的回顾，经第三方公开索引访问，日期精确到 2026 年 7 月附近。
- Time range: 00:18–00:27

### Narration

但上线首日，Rikyū 只有七名用户。

一个首日七人的服务，怎么在发布后一天，就有一万人来用？

### Narration units

| Text | Mode | Claim IDs | Attribution |
|---|---|---|---|
| 但上线首日，Rikyū 只有七名用户。 | founder | claim-rikyu-005 | 创始人公开回顾（经公开索引） |
| 一个首日七人的服务，怎么在发布后一天，就有一万人来用？ | editorial-analysis | claim-rikyu-005, claim-rikyu-009 | 创始人公开回顾（经公开索引）、创始人公开披露 |

## seg-004

- Section: `turning-point`
- Target seconds: `23`
- Claim IDs: `claim-rikyu-006, claim-rikyu-009, claim-rikyu-007, claim-rikyu-008`
- Source identity: 开发者 X 帖或“功能演示”动画、创始人公开披露、ITmedia
- Visual intent: 时间线从 8 月 10 日开始推进：发布卡出现（来源标注“X @kaiseisuzuk，2026-08-10”），几何 Logo 演示短播——圆、直线、网格逐层成形（若为程序化动画，角落标“功能演示”）；随后 8 月 12 日卡出现“发布后一天内，超过一万人使用 Rikyū（创始人公开披露）”；8 月 13 日 ITmedia 报道卡出现，显示用户分享帖缩略图与“帖子展示 5,000,000+”。
- Fact boundary: 发布、一万人使用、五百万展示、用户分享之间只标 sequence-only，不建立因果关系或转化率；几何过程若用程序化动画则标注“功能演示”。
- Time range: 00:27–00:50

### Narration

8 月 10 日，开发者发布了一个功能：AI 用圆、直线和网格，把 Logo 的设计过程一步步画出来。

发布后一天内，超过一万人使用 Rikyū。8 月 12 日，他公开确认了这个数字。

ITmedia 随后记录：功能帖展示超五百万次。用户分享自己生成的 Logo，说过程有趣，体验也打磨过。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|---|---|---|---|
| 8 月 10 日，开发者发布了一个功能：AI 用圆、直线和网格，把 Logo 的设计过程一步步画出来。 | independently-verified | claim-rikyu-006 | 开发者 X 帖、ITmedia |
| 发布后一天内，超过一万人使用 Rikyū。 | founder | claim-rikyu-009 | 创始人公开披露，经 ITmedia |
| 8 月 12 日，他公开确认了这个数字。 | founder | claim-rikyu-009 | 创始人公开披露，经 ITmedia |
| ITmedia 随后记录：功能帖展示超五百万次。 | independently-verified | claim-rikyu-007 | ITmedia |
| 用户分享自己生成的 Logo，说过程有趣，体验也打磨过。 | independently-verified | claim-rikyu-008 | ITmedia |

## seg-005

- Section: `payoff`
- Target seconds: `16`
- Claim IDs: `claim-rikyu-010, claim-rikyu-003`
- Source identity: Rikyū 官网与条款、ITmedia
- Visual intent: 画面左右分栏：左侧 Claude/Codex 对话窗口出现一条设计指令，右侧 Rikyū 面板开始生成一张社交封面（与开场几何 Logo 不同的设计结果）；随后叠出官网计划卡“免费 2,000 初始积分；Basic 每月 5 美元起，商用与 SVG 导出开放（官网，截至 2026-08-25）”，并出现 MCP 连接关系图；结尾停在价格卡上。
- Fact boundary: 定价与功能状态截至 2026-08-25 官网访问日；价格是公开订阅定价，不代表收入、融资或估值；MCP 连接由官网、条款与 ITmedia 共同验证。
- Time range: 00:50–01:06

### Narration

今天，Rikyū 免费计划给两千初始积分。商用和 SVG 导出，从每月五美元起。

它也能接上 Claude、Codex，从你已经在用的 AI 里直接发起设计。

从免费积分到每月五美元，就是 Rikyū 今天公开的定价。

### Narration units

| Text | Mode | Claim IDs | Attribution |
|---|---|---|---|
| 今天，Rikyū 免费计划给两千初始积分。 | independently-verified | claim-rikyu-010 | Rikyū 官网与条款、ITmedia |
| 商用和 SVG 导出，从每月五美元起。 | independently-verified | claim-rikyu-010 | Rikyū 官网与条款、ITmedia |
| 它也能接上 Claude、Codex，从你已经在用的 AI 里直接发起设计。 | independently-verified | claim-rikyu-003 | Rikyū 官网与条款、ITmedia |
| 从免费积分到每月五美元，就是 Rikyū 今天公开的定价。 | independently-verified | claim-rikyu-010 | Rikyū 官网与条款、ITmedia |
