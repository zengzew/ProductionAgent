<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5",
  "checkedSegments": 10,
  "checkedNarrationUnits": 30,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Fact Guardian Report · Natural Chinese Fix Rebind

核查对象：`story/final-script.md`、`story/caption-plan.json`、`research/facts.json`、`research/sources.json` 与 `story/visual-plan.md`

核查范围：10 段，30 个 Narration units

结论：**PASS**

## Rebind lineage

上一份 REJECT 报告已原样归档到 `story/reviews/fact-round-03-natural-chinese-reject.md`，归档 SHA-256 为 `84e1950fa696c925e0028203827cbceb9d9def806bf3c108b058befaa28c33a7`，绑定的定稿 SHA-256 为 `ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff`。当前输入哈希如下：

- 定稿：`2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5`
- 字幕规划：`b4f77711ad84c79e291d7dede579c74ea15d2946bb1220c689876ea390a1dee6`
- Claim Ledger：`73dca2b9526a198969c9c93db936788728b241406dbb420e643d1bea6026e63a`
- Sources：`e6d7df31372285b966e8556384898b75b864437328966e7939369a9d2d29e0de`
- 视觉方案：`adb28b33dec9843dc195e14ac5a896d790f53656fd3a1138fb31a055e469c533`

Facts 和 sources 未改。本次只重新核查 `seg-009` 第二个 narration unit，并确认其余 29 个 units、Claim IDs 和来源身份没有变化。

## Blocker closure

| Narration unit            | Claim            | 结果 | 说明                                                                                                                          |
| ------------------------- | ---------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| “Recipe 也在同一天开放。” | `claim-poke-004` | PASS | Claim 明确写“同步推出 Poke Recipes”。当前句只表达同日发布，不再附加“向所有人”的受众范围，也不声明无条件、无授权或无账户限制。 |

同段第一句“想用 Poke，已经不用再排候补”继续由 `claim-poke-004` 的取消 bouncer、waitlist 和进入一般可用状态直接支持。两句合起来仍只是原公开节点的口语压缩，没有新增日期、事件、因果或产品结构。

## 其余指定改写

- `seg-005` 删除“访谈里”，没有删除创始人口述身份或用户反馈内容。
- `seg-006` 用“内测用户”对应 beta period，没有扩大用户范围。
- `seg-008` 用条件式本人确认授权，保持 `claim-poke-012` 的授权边界。
- 一亿消息、主动动作、结果核对、Recipe 配置和结尾演示继续保持原 Claim 绑定。
- 字幕 cue 与旁白逐字对应，视觉方案 gate 已绑定当前定稿。

30 个 narration units 全部通过。Fact Guardian 对当前定稿给出 PASS，不要求改 facts、故事结构或视觉方案。
