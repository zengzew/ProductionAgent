<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff",
  "checkedSegments": 10,
  "checkedNarrationUnits": 30,
  "blockers": [
    "seg-009 的第二个 narration unit 声称‘Recipe 也在同一天向所有人开放’，而 claim-poke-004 只明确支持同日推出 Poke Recipes，没有单独支持‘向所有人’这一开放范围。"
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

# Poke v2 Fact Guardian Report · Natural Chinese Rebind

核查对象：`story/final-script.md`、`story/caption-plan.json`、`research/facts.json`、`research/sources.json` 与 `story/visual-plan.md`

核查范围：10 段，30 个 Narration units

结论：**REJECT**

## Rebind lineage

改写前 canonical 报告已原样归档到 `story/reviews/fact-round-03-pre-natural-chinese.md`，归档 SHA-256 为 `a2e82a8490c0c4210f40022d3465d9e82205c8606ffaf89ad63ce7ba3e69d349`。当前输入哈希如下：

- 定稿：`ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff`
- 字幕规划：`f608df5f24b9b2e3e002ec7703ea7f36ec8c36397b4f63f2179839f9be0dcb14`
- Claim Ledger：`73dca2b9526a198969c9c93db936788728b241406dbb420e643d1bea6026e63a`
- Sources：`e6d7df31372285b966e8556384898b75b864437328966e7939369a9d2d29e0de`
- 视觉方案：`13df944b762fb16abbebeb09ae5a8c632da4b8c0649a64494bcadee4356e6f5a`

Facts 和 sources 未改。当前定稿将部分长句拆成更多 narration units，因此本次逐条核查的是 30 个 units，而不是上一版的 27 个。

## 指定改写核查

| 位置      | 结果   | 说明                                                                                                                                                                     |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seg-005` | PASS   | “访谈里”改成“用户说得很直接”，没有删除创始人口述身份；`claim-poke-006` 支持用户不想学习新界面和团队后续方向变化。                                                        |
| `seg-006` | PASS   | “Beta 用户”改成“内测用户”，与 `claim-poke-008` 的 beta period 等义，没有扩大成所有用户。                                                                                 |
| `seg-008` | PASS   | “需要连接自己的账户时，再由他亲自确认授权”保留条件和本人授权；没有把 `claim-poke-012` 的“仍可能需要授权”写成无条件一键完成。                                             |
| `seg-009` | REJECT | “想用 Poke，已经不用再排候补”由 `claim-poke-004` 直接支持；但“Recipe 也在同一天向所有人开放”把 Claim 的“同步推出 Poke Recipes”扩大成所有人可用，Claim 未单独支持该范围。 |

## `seg-009` 结构与语义

段落仍保持原来的 `evidence` section、`1:25–1:38` 时段、`claim-poke-004`、`launch-timeline` Scene、Release Notes 视觉证据和公开节点叙事任务。它确实只是压缩了句数，没有改变故事结构，也没有新增日期、增长因果或产品事件。

但事实门禁按 narration unit 判断。“同步推出”证明同日发生了 Recipe 发布，不自动等于“向所有人开放”。Poke 的一般可用状态也不能在 Claim 没有明确附着到 Recipes 时替第二句补出受众范围。该范围扩张必须回到 oral-rewriter；不得通过编辑推断或画面小字补救。

## 其余边界

- 其余 29 个 narration units 都有允许播出的 Claim，人物、动作、数字、日期、因果和授权边界未越界。
- 一亿条继续保留 Cognition 归因、约三个月窗口和“消息”单位，没有换算用户或留存。
- `seg-007` 用“不过”明确连接代理便利与用户核对责任，`claim-poke-024` 单独支持后一句。
- 字幕 cue 与当前旁白的字词一致，没有通过字幕新增或删除事实。
- 视觉方案 gate 已绑定当前定稿，镜头结构没有替旁白制造额外推断。

Fact Guardian 退回 oral-rewriter。只处理 `seg-009` 第二句的开放范围即可；当前资料不要求改 facts，也不支持为了保留“向所有人”去反向扩大 Claim。
