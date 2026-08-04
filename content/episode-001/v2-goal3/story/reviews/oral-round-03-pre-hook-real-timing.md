<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae",
  "round": 3,
  "scores": {
    "chineseNaturalness": 5,
    "spokenDelivery": 4,
    "informationFidelity": 5
  },
  "minimumScore": 4,
  "styleSamples": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Oral Judge Report · Natural Chinese Fix Rebind

评审对象：`story/script-draft.md`、`story/final-script.md`、`story/caption-plan.json` 与 `style/voice-guide.md`

结论：**PASS**

## Rebind lineage

上一份 REJECT 报告已原样归档到 `story/reviews/oral-round-03-natural-chinese-reject.md`，归档 SHA-256 为 `333c3fd6b145cab5a9e6020fb652e5f55bac59558311ea71cacf48f9ac160d51`，绑定的定稿 SHA-256 为 `ff77fd4ad2a0c39cd825577c591129669ead8d0a030f3faff0e4246c91faaaff`。当前输入哈希如下：

- 定稿：`2fed0279c85123f44a512ab7c15d2ad3c1ab107fdf204930b6d07ecdd3f30bc5`
- 信息初稿：`6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae`
- 字幕规划：`b4f77711ad84c79e291d7dede579c74ea15d2946bb1220c689876ea390a1dee6`
- Voice guide：`ec56c6cf3382636843275c6f28dd1aa4191ae4128ca89eecb8eacbd9d612af62`

修订只把 `seg-009` 第二句从“Recipe 也在同一天向所有人开放”改成“Recipe 也在同一天开放”。Section、时段、Claim、Scene、前后句和其余旁白均未改变。这是同一第三轮自然中文稿的 blocker 修复重绑定，不构成第四轮创意改写。

## 评分

| 维度       |  得分 | 证据与扣分                                                                                                                       |
| ---------- | ----: | -------------------------------------------------------------------------------------------------------------------------------- |
| 中文自然度 | 5 / 5 | “用户说得很直接”“内测用户”“本人确认授权”“不用再排候补”等说法具体、顺口，没有研究档案词或阶段状态直译。                           |
| 口播节奏   | 4 / 5 | 长短句和停顿比信息稿自然；`seg-003` 在 10 秒内仍要处理数字、早期形态和核心问题，真实 TTS 仍需读回确认。                          |
| 信息保真   | 5 / 5 | 删除“向所有人”后，`seg-009` 只保留日期、Poke 取消候补和 Recipe 同日推出；人物、动作、数字、因果、权限和产品状态均与 Claim 一致。 |

## Blocker closure

`claim-poke-004` 的“同步推出 Poke Recipes”可以支持不带受众范围的“Recipe 也在同一天开放”。当前句子只把同日推出改成自然口语，没有再声明所有人、所有账户或无条件可用。信息初稿的“Recipe 同时开放”、画面文案的“Recipe 同时开放”和当前旁白语义一致。

## 其余指定表达

- “访谈里”去掉后，创始人口述身份仍保留在 Source identity 和 Narration unit 中。
- “Beta 用户”改成“内测用户”，没有改变 `claim-poke-008` 的 beta period。
- Recipe 授权改成“需要连接自己的账户时，再由他亲自确认”，保留条件和本人授权。
- “一般可用状态”改成“已经不用再排候补”，直接表达 `claim-poke-004` 对用户的实际变化。

三个维度均达到门槛，没有 blocker。当前没有人工 approved 完整样稿，因此 `styleSamples` 为空。真实 TTS 时长仍由交付门禁读回。
