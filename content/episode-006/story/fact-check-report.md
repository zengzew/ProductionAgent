<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "9da397d3458768eb625c5c49101bced42f20a7013500b3cf02197edc9f23bbc8",
  "checkedSegments": 7,
  "checkedNarrationUnits": 12,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Fact Check Report — episode-006（Rikyū）

## 总体判断

最终脚本通过事实核查，verdict 为 PASS。全片 7 个段落、12 个 narration unit 均绑定存在且允许播出的 Claim ID，文案与 Claim 原始含义、日期、指标定义和来源身份一致。未将时间相邻事件写成因果，未将消息数换算成用户、留存、收入或人均强度，未猜测创始人动机、未披露技术、增长归因或护城河。功能演示与真实产品画面已区分，技术只解释证据支持的用户体验、权限和分发变化。正面推广口吻受 Claim 支持，未把公司自述升级成独立事实或承诺效果。风险、争议和数据缺口未扩写成无来源的负面判断。结尾停在有 Claim 支持的具体产品状态与用户动作，未把数字换算成利润、留存或长期优势，也未用问题质疑产品未来。高强度措辞未出现，认知修正未制造稻草人。强事实对应的 visualIntent 引用了相同 Claim 支持的实拍或真实页面，未用无关素材制造“眼见为实”的错觉。

## 逐段核查

### seg-001（hook）

- **Narration unit 1**：`claim-rikyu-006`，来源 `src-rikyu-founder-x-logo` 与 ITmedia 交叉核对。
- **核查**：文案“几何网格旁，出现了一张成品 Logo”准确描述官方 X 帖中四张图的并置动作（大猩猩/狮子几何网格 + 成品 Logo），未断言网格代表模型内部构造。visualIntent 明确引用官方 X 帖原始四图，并在右上角标注“公开演示，不代表内部算法”，与 `claim-rikyu-012` 的准确性边界一致。未读日期，未升级强度。
- **结论**：PASS。

### seg-002（product）

- **Narration unit 1**：`claim-rikyu-001`，来源 `src-rikyu-site`、`src-rikyu-terms`、`src-rikyu-itmedia`。
- **核查**：文案“Rikyū 是个人提供的 AI 设计服务：想自己做品牌的人，描述需求，就能拿到 Logo、网页、社交和印刷成品”与 Claim 完全一致。条款确认提供者为铃木海星（个人），官网确认输出类型。visualIntent 引用官网 Waypause、Elias、Lowbell 三个项目组的真实成品，来源标签“官网 rikyu.ai”同帧。
- **Narration unit 2**：`claim-rikyu-002`，来源 `src-rikyu-site`。
- **核查**：文案“官网说，不用会设计，也不用反复猜”用“官网说”明确来源身份，未宣称实际用户都不需要设计能力。与 Claim 的 `reportingType: company-reported` 一致。
- **结论**：PASS。

### seg-003（entry）

- **Narration unit 1**：`claim-rikyu-003`，来源 `src-rikyu-site`、`src-rikyu-terms`。
- **核查**：文案“直接说需求就行；也能把 Claude、Codex 接进来，从那边发起设计”准确反映 MCP 连接功能，未解释 MCP 协议实现，未宣称任何外部 AI 均可连接成功。visualIntent 标注“功能演示”，与 `technology.md` 的“不进入旁白的实现推断”一致。
- **Narration unit 2**：`claim-rikyu-003`，来源同上。
- **核查**：文案“这样一个小工具，怎么让陌生用户愿意试一次？”是编辑判断的疑问桥，后文有明确答案（演示传播带来用户增长），未猜测创始人动机或增长归因。
- **结论**：PASS。

### seg-004（turning-point）

- **Narration unit 1**：`claim-rikyu-005`，来源 `src-rikyu-founder-feed`。
- **核查**：文案“开发者自己回顾，上线首日只有 7 个用户”用“开发者自己回顾”点明来源身份，与 Claim 的 `reportingType: founder-reported` 一致。未补写作原因或动机，未与后续规模建立因果。
- **Narration unit 2**：`claim-rikyu-006`，来源 `src-rikyu-founder-x-logo`、`src-rikyu-itmedia`。
- **核查**：文案“随后，他把几何 Logo 的演示发到 X”用“随后”表示时间先后，未使用“因为、所以、于是、结果”等因果连接词。visualIntent 引用官方 X 帖原始四图，来源标签“官方 X 帖”同帧。
- **结论**：PASS。

### seg-005（scale）

- **Narration unit 1**：`claim-rikyu-009`，来源 `src-rikyu-itmedia`。
- **核查**：文案“演示公开后的一天里，有超过一万人使用它”准确反映开发者披露的单日使用人数，未换算为转化率、留存或收入。visualIntent 用程序化对比呈现“首日 7 用户”与“发布后一天 10,000+”，来源标签“开发者披露 / ITmedia 报道”与数字同帧，未将 500 万展示与 1 万使用相除。
- **结论**：PASS。

### seg-006（reach）

- **Narration unit 1**：`claim-rikyu-007`，来源 `src-rikyu-itmedia`。
- **核查**：文案“那一条公开演示帖，展示次数超过五百万”与 ITmedia 报道口径一致，未与 1 万用户相除为正式转化率。visualIntent 引用 ITmedia 标题卡与 X 帖子展示次数大字，来源标签“ITmedia 报道”全程同帧。
- **Narration unit 2**：`claim-rikyu-008`，来源 `src-rikyu-itmedia`。
- **核查**：文案“也有人分享自己生成的 Logo”准确反映独立媒体观察到的分享行为，不代表总体满意度或采用原因。visualIntent 叠加用户分享的生成 Logo 图形反馈（可视化示意），未用无关素材制造“眼见为实”的错觉。
- **结论**：PASS。

### seg-007（pricing）

- **Narration unit 1**：`claim-rikyu-006`，来源 `src-rikyu-founder-x-logo`、`src-rikyu-itmedia`。
- **核查**：文案“它就是 Rikyū 的公开演示”指代前文几何 Logo 功能，在连续口播中不构成理解障碍。
- **Narration unit 2**：`claim-rikyu-010`，来源 `src-rikyu-site`、`src-rikyu-itmedia`。
- **核查**：文案“现在想开始，官网给 2000 免费积分，每月 5 美元起，就能导出 SVG 并商用”准确反映公开定价与功能开放范围，未推断收入、融资或估值。visualIntent 引用官网价格页真实画面，来源标签“官网 rikyu.ai”与价格同帧。结尾停在有 Claim 支持的具体产品状态与用户动作，未把数字换算成利润、留存或长期优势，也未用问题质疑产品未来。
- **结论**：PASS。

## 硬拒绝检查

- **缺来源、来源冲突或 Claim Ledger 错误**：无。所有 narration unit 均绑定存在且允许播出的 Claim ID。
- **故事角度依赖不受支持的前提**：无。故事角度依赖“低起点→公开演示→规模反馈→当前定价”的可验证链，全部有 Claim 支持。
- **初稿的信息选择或 Claim 绑定错误**：无。信息选择与 Claim 绑定准确。
- **口播改写改变了 Claim 含义、来源身份或事实边界**：无。口播准确转述 Claim，来源身份清晰。
- **把时间相邻事件写成因果**：无。seg-004“随后”、seg-005“演示公开后的一天里”均为时间先后，未建立因果。
- **把消息数换算成用户、留存、收入、人均强度、成功任务或基础设施负载**：无。500 万展示与 1 万使用未相除，未换算为转化率或留存。
- **猜测创始人动机、未披露技术、增长归因或护城河**：无。未补写 idea 来源或增长原因。
- **功能演示、流程示意和真实产品画面未区分**：无。seg-003 标注“功能演示”，seg-002 与 seg-007 引用官网真实页面。
- **技术解释超出证据支持的用户体验、权限、成本或分发变化**：无。MCP 只解释分发变化，未解释协议实现。
- **正面推广口吻不受 Claim 支持**：无。所有正面描述均有 Claim 支持。
- **风险、争议和数据缺口扩写成无来源的负面判断**：无。未扩写隐私风险或未来不确定性。
- **结尾停在无 Claim 支持的数字或质疑产品未来**：无。结尾停在 `claim-rikyu-010` 支持的当前产品状态。
- **高强度措辞与 Claim 原始强度不一致**：无。未出现“全部、唯一、彻底、精确到、致命、最疯狂、改变了”等高强度措辞。
- **认知修正制造稻草人**：无。未制造认知修正。
- **强事实对应的 visualIntent 引用无关素材**：无。所有 visualIntent 引用相同 Claim 支持的实拍或真实页面。

## 结论

全片 7 个段落、12 个 narration unit 均通过事实核查，无 blocker，verdict 为 PASS，returnTo 为 none。故事状态可更新为 `story-approved`。