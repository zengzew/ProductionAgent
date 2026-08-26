<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "e5cca868c761da205bd039a5159d97b8cac41bcfc2234a482b260fcb27dc4fc4",
  "checkedSegments": 5,
  "checkedNarrationUnits": 16,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Fact Check Report — episode-006

## 评审对象

- 文件：`story/final-script.md`
- SHA-256：`e5cca868c761da205bd039a5159d97b8cac41bcfc2234a482b260fcb27dc4fc4`
- 前置条件：`story/critic-report.md` 已给出 PASS（总分 87，无 blocker）

## 统计

- 检查段落数：5（seg-001 至 seg-005）
- 检查旁白单元数：16
- Blocker 数：0

## 逐段核查

### seg-001（hook）

| 旁白单元 | Claim ID | 来源身份 | 核查结果 |
|---|---|---|---|
| 有个开发者，把 AI 画 Logo 的过程发上网。 | claim-rikyu-006 | 开发者 X 帖素材或"功能演示"动画 | PASS：与 Claim 一致，描述发布行为；视觉意图标注"功能演示"动画，未断言内部构造过程。 |
| 这条帖子，五百万次展示。 | claim-rikyu-007 | ITmedia | PASS：指标为 X 帖子展示次数，来源为独立媒体，未换算为用户数。 |
| 发布后一天，超过一万人使用。 | claim-rikyu-009 | 创始人公开披露，经 ITmedia | PASS：明确标注为创始人披露口径，未建立与五百万展示的转化率。 |

**段级检查**：
- 未把时间相邻事件写成因果。
- 未把展示次数换算成用户、留存或收入。
- 未猜测创始人动机或增长归因。
- 视觉意图引用相同 Claim 支持的演示画面，未用无关素材制造"眼见为实"错觉。

### seg-002（product-model）

| 旁白单元 | Claim ID | 来源身份 | 核查结果 |
|---|---|---|---|
| 发这条演示的，是开发者铃木海星。 | claim-rikyu-006 | 开发者 X 帖素材 | PASS：发布者身份与 Claim 一致。 |
| 他做的 AI 设计服务，叫 Rikyū。 | claim-rikyu-001 | Rikyū 官网与条款、ITmedia | PASS：产品定义由官网、条款与独立媒体交叉核对。 |
| 你说需求，它生成 Logo、网页、社交和印刷设计。 | claim-rikyu-001 | Rikyū 官网与条款、ITmedia | PASS：与产品定义一致。 |
| 官网说，无需设计技能，也不用反复猜。 | claim-rikyu-002 | Rikyū 官网 | PASS：明确标注为公司口径，未宣称实际用户都不需要设计能力。 |

**段级检查**：
- 公司披露身份说清（"官网说"）。
- 未把公司自述升级成独立事实。
- 视觉意图引用官网截图，标注访问日期，与 Claim 支持的真实页面一致。

### seg-003（cold-start-contrast）

| 旁白单元 | Claim ID | 来源身份 | 核查结果 |
|---|---|---|---|
| 但上线首日，Rikyū 只有七名用户。 | claim-rikyu-005 | 创始人公开回顾（经公开索引） | PASS：明确标注为创始人回顾，日期精确到 2026 年 7 月附近。 |
| 一个首日七人的服务，怎么在发布后一天，就有一万人来用？ | claim-rikyu-005, claim-rikyu-009 | 编辑判断 | PASS：问题形式，未给出因果归因；两个数字均有 Claim 支持。 |

**段级检查**：
- 未猜测创始人动机或失败原因。
- 未把消息数换算成用户、留存或收入。
- 认知修正未制造稻草人。

### seg-004（turning-point）

| 旁白单元 | Claim ID | 来源身份 | 核查结果 |
|---|---|---|---|
| 8 月 10 日，开发者发布了一个功能：AI 用圆、直线和网格，把 Logo 的设计过程一步步画出来。 | claim-rikyu-006 | 开发者 X 帖、ITmedia | PASS：描述产品呈现的设计过程，未断言内部按几何规则构造。 |
| 发布后一天内，超过一万人使用 Rikyū。 | claim-rikyu-009 | 创始人公开披露，经 ITmedia | PASS：明确标注为创始人披露口径。 |
| 8 月 12 日，他公开确认了这个数字。 | claim-rikyu-009 | 创始人公开披露，经 ITmedia | PASS：日期与 Claim 一致。 |
| ITmedia 随后记录：功能帖展示超五百万次。 | claim-rikyu-007 | ITmedia | PASS：独立媒体观察，指标为展示次数。 |
| 用户分享自己生成的 Logo，说过程有趣，体验也打磨过。 | claim-rikyu-008 | ITmedia | PASS：与独立媒体观察一致，未宣称总体满意度。 |

**段级检查**：
- 发布、一万人使用、五百万展示、用户分享之间只标 sequence-only，未建立因果关系或转化率。
- 功能演示与真实产品画面区分（视觉意图标注"若为程序化动画，角落标'功能演示'"）。
- 未把展示次数换算成用户、留存或收入。

### seg-005（payoff）

| 旁白单元 | Claim ID | 来源身份 | 核查结果 |
|---|---|---|---|
| 今天，Rikyū 免费计划给两千初始积分。 | claim-rikyu-010 | Rikyū 官网与条款、ITmedia | PASS：公开定价，与 Claim 一致。 |
| 商用和 SVG 导出，从每月五美元起。 | claim-rikyu-010 | Rikyū 官网与条款、ITmedia | PASS：公开定价，与 Claim 一致。 |
| 它也能接上 Claude、Codex，从你已经在用的 AI 里直接发起设计。 | claim-rikyu-003 | Rikyū 官网与条款、ITmedia | PASS：MCP 连接由官网、条款与 ITmedia 共同验证；只解释用户体验变化，未推断内部架构。 |
| 从免费积分到每月五美元，就是 Rikyū 今天公开的定价。 | claim-rikyu-010 | Rikyū 官网与条款、ITmedia | PASS：明确标注为公开定价，未换算为收入、融资或估值。 |

**段级检查**：
- 结尾停在有 Claim 支持的具体事实（产品状态、定价），未把数字换算成利润、留存或长期优势。
- 未用问题质疑产品未来。
- 未回看开场不是结尾必要条件。
- 视觉意图引用官网计划卡与 MCP 连接关系图，与 Claim 支持的真实页面一致。

## 全局检查

| 检查项 | 结果 |
|---|---|
| 每个 narration unit 绑定存在且允许播出的 Claim ID | PASS |
| 文案与 Claim 原始含义、日期、指标定义和来源身份一致 | PASS |
| 公司披露、创始人口述、独立报道身份说清 | PASS |
| 未把时间相邻事件写成因果 | PASS |
| 未把消息数换算成用户、留存、收入、人均强度、成功任务或基础设施负载 | PASS |
| 未猜测创始人动机、未披露技术、增长归因、市场验证或护城河 | PASS |
| 功能演示、流程示意和真实产品画面区分 | PASS |
| 技术只解释证据支持的用户体验、权限、成本或分发变化 | PASS |
| 正面推广口吻受 Claim 支持，未把公司自述升级成独立事实或承诺效果 | PASS |
| 风险、争议和数据缺口未扩写成无来源的负面判断 | PASS |
| 结尾停在有 Claim 支持的具体事实或标明口径的数字 | PASS |
| 高强度措辞与 Claim 原始强度和来源身份一致 | PASS（无"全部、唯一、彻底、精确到、致命、最疯狂、改变了"等措辞） |
| 认知修正纠正真实存在的误解，未制造稻草人 | PASS |
| 强事实对应的 visualIntent 引用相同 Claim 支持的实拍、真实页面或图形 | PASS |

## Blockers

无。

## 结论

**PASS**

脚本可在已有证据边界内播出。所有旁白单元绑定存在且允许播出的 Claim ID，文案与 Claim 原始含义、日期、指标定义和来源身份一致。公司披露、创始人口述、独立报道身份说清。未把时间相邻事件写成因果，未把消息数换算成用户、留存或收入。结尾停在有 Claim 支持的具体事实（产品状态、定价），未换算为利润、留存或长期优势。

故事状态：`story-approved`