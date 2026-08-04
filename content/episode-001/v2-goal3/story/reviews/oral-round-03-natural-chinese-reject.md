<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae",
  "round": 3,
  "scores": {
    "chineseNaturalness": 5,
    "spokenDelivery": 4,
    "informationFidelity": 3
  },
  "minimumScore": 4,
  "styleSamples": [],
  "blockers": [
    "seg-009 把 claim-poke-004 的‘同步推出 Poke Recipes’改成‘Recipe 也在同一天向所有人开放’，新增了 Claim 未单独支持的开放对象范围。"
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

# Poke v2 Oral Judge Report · Natural Chinese Rebind

评审对象：`story/script-draft.md`、`story/final-script.md`、`story/caption-plan.json` 与 `style/voice-guide.md`

结论：**REJECT**

## Rebind lineage

改写前 canonical 报告已原样归档到 `story/reviews/oral-round-03-pre-natural-chinese.md`，归档 SHA-256 为 `ea48a233597cd6762062ff0e5f02531d081e2f0a7f09493ac916ab1fdb661d3e`。当前输入哈希如下：

- 定稿：`ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff`
- 信息初稿：`6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae`
- 字幕规划：`f608df5f24b9b2e3e002ec7703ea7f36ec8c36397b4f63f2179839f9be0dcb14`
- Voice guide：`ec56c6cf3382636843275c6f28dd1aa4191ae4128ca89eecb8eacbd9d612af62`

本次复审只判断口语改写是否自然且保真。Section、时段、Claim IDs、Scene 和整体故事顺序没有变化，因此继续记作同一第三轮的自然中文重绑定，不虚构第四轮创意修订。

## 评分

| 维度       |  得分 | 证据与扣分                                                                                                                       |
| ---------- | ----: | -------------------------------------------------------------------------------------------------------------------------------- |
| 中文自然度 | 5 / 5 | 可见动作、第二人称和真实停顿明显增加；“访谈里”“Beta 用户”“一般可用状态”等研究或产品阶段词已换成观众会说的话。                    |
| 口播节奏   | 4 / 5 | 长短句错开，`seg-004`、`007`、`008` 的动作顺序更适合朗读；`seg-003` 在 10 秒内仍要完成数字、旧形态和问题，需真实 TTS 读回确认。  |
| 信息保真   | 3 / 5 | 大多数改写保持 Claim 边界，但 `seg-009` 把“同步推出 Recipes”扩大为“Recipes 向所有人开放”，超出 `claim-poke-004` 单独允许的陈述。 |

## 指定表达复核

- “访谈里”已改成“用户说得很直接”。来源身份仍在 Source identity 和 Narration unit 中，旁白删掉的是研究过程，不是人物或证据。
- “Beta 用户”已改成“内测用户”。`claim-poke-008` 明确对应 beta period，中文身份没有扩大用户范围。
- “自己的账户仍要自己授权”已改成“需要连接自己的账户时，再由他亲自确认授权”。条件关系和本人授权边界都保留，且消除了生硬的重复主语。
- “一般可用状态”已改成“想用 Poke，已经不用再排候补”。这部分由 `claim-poke-004` 直接支持，也符合 voice guide 对产品状态的处理。
- `seg-009` 仍是同一日期、同一公开节点和同一 Release Notes 镜头，结构没有变化；问题只出在第二句新增“向所有人”的范围。

## Blocker

`claim-poke-004` 写的是 Poke 取消 bouncer 和 waitlist、进入一般可用状态，并同步推出 Poke Recipes。它没有单独声明 Recipes 面向“所有人”。信息初稿也只写“Recipe 同时开放”。因此当前定稿第二句不是单纯压缩表达，而是增加了开放对象，信息保真低于 4 / 5。

Oral Judge 退回 oral-rewriter。只需在不改变日期、段落结构和 Claim 的前提下消除这个范围扩张；其余自然中文改写不构成 blocker。当前没有人工 approved 完整样稿，因此 `styleSamples` 为空。
