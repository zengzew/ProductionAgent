<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "93b003ef17c77b413c10298c0d884e9f1fdd56cd36ee54d100ddad116121f9e2",
  "checkedSegments": 10,
  "checkedNarrationUnits": 30,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Fact Guardian Report · Real Hook Timing Rebind

核查对象：`story/final-script.md`、`story/caption-plan.json`、`research/facts.json` 与 `story/visual-plan.md`

核查范围：10 段，30 个 Narration units

结论：**PASS**

## Rebind lineage

压缩前 PASS 报告已原样归档到 `story/reviews/fact-round-03-pre-hook-real-timing.md`，归档 SHA-256 为 `283788ccbda5300f95d5f6b725c8e773fa9078a09c8e4cf349018df343c0ef46`，绑定的定稿 SHA-256 为 `2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5`。当前输入哈希如下：

- 定稿：`93b003ef17c77b413c10298c0d884e9f1fdd56cd36ee54d100ddad116121f9e2`
- 字幕规划：`21d9f0c6d24815ea942eaa70e331d5237bbfc09450274ddc86a72c893dc853d3`
- Claim Ledger：`73dca2b9526a198969c9c93db936788728b241406dbb420e643d1bea6026e63a`
- 视觉方案：`26e7f511e1301f6311a33cd1f7c67b5e5b82b30ad05890b731df155636248e0b`

Facts 未改。本次重新核查 `seg-003` 的三个 narration units，并确认其余 27 个 units、Claim IDs、来源身份和事实边界未改变。

## `seg-003` 核查

| Narration unit                                                       | Claim                   | 结果 | 说明                                                                                                       |
| -------------------------------------------------------------------- | ----------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| “Cognition 披露，收购前约三个月，用户和 Poke 来回发了一亿多条消息。” | `claim-poke-015`        | PASS | 保留收购方归因、approximately three months、用户与 Poke 交换消息和 `>100000000`；“一亿多条”明确大于一亿。  |
| “可它一开始，只是邮件工作台。”                                       | `claim-poke-006`        | PASS | 保留以邮件为中心的早期产品方向；`seg-005` 仍明确补出邮件客户端和自动化，没有把“只是”扩成后台能力排他结论。 |
| “用户为什么愿意把日常小事也交给它？”                                 | `claim-poke-006`, `008` | PASS | 仍是基于方向变化和内测用户请求提出的编辑问题，没有把先后写成采用因果。                                     |

## 边界检查

- “一亿多条消息”不是模糊成约一亿，也没有向下包含一亿；它与“超过一亿条”的数量关系一致。
- 统计期仍是约三个月，旁白没有换算用户、留存、收入、人均强度或成功任务。
- Caption cue 保留 Cognition、Poke、“一亿多条消息”和完整问题，没有通过字幕新增或删除事实。
- Visual plan gate 已绑定当前定稿，仍要求 Cognition 标签和“消息数，不是用户数”同期可读。
- Section、Scene、Claim、信息顺序和 20 秒后的故事结构没有变化。

30 个 narration units 全部通过。Fact Guardian 对当前定稿给出 PASS，不要求改 facts 或故事结构。
