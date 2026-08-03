<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "a7529475d4b92dc55110903da2f23e1105aed452194eef2ac4a0fd34a9a2ba29",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae",
  "round": 3,
  "scores": {
    "chineseNaturalness": 4,
    "spokenDelivery": 4,
    "informationFidelity": 4
  },
  "minimumScore": 4,
  "styleSamples": [],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Oral Judge Report · Round 3 Delivery-timing Rebind

评审对象：`story/script-draft.md`、`story/final-script.md` 与 `story/caption-plan.json`

结论：**PASS**

## Delivery-timing rebind

压缩前 canonical 报告已原样归档到 `story/reviews/oral-round-03-pre-hook-timing.md`，归档 SHA-256 为 `f4ad8dc1483b0a2b03e8b99c4f0fe12ad1b3138d123b9ad1f989ed0f84c9a944`，其评审的定稿 SHA-256 为 `c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e`。当前定稿 SHA-256 为 `a7529475d4b92dc55110903da2f23e1105aed452194eef2ac4a0fd34a9a2ba29`，字幕规划 SHA-256 为 `8f76a6d9ee045cb838bd18ddb309436045202c7092df4ad3bcb9ca063d48dab5`，初稿仍为 `6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae`。

本次只压缩 `seg-001`、`seg-002`、`seg-003` 的旁白和对应字幕 cue，把 Hook 分别放入 3、7、10 秒目标窗口。`seg-004` 以后没有旁白变化，核心问题、Claim、视觉意图和结尾均未改。这是同一第三轮通过稿的交付时长重绑定，不是第四轮创意重写。

## 评分

| 维度       |  得分 | 证据与扣分                                                                                         |
| ---------- | ----: | -------------------------------------------------------------------------------------------------- |
| 中文自然度 | 4 / 5 | “发一句话”“就在联系人列表里”直接、口语；“往来超过一亿条”略有压缩感，但画面同期补足“消息”单位。     |
| 口播节奏   | 4 / 5 | 首三秒只说一个结果，3～10 秒用两句建立产品心智模型；10～20 秒仍需连续处理数字、旧形态和核心问题。  |
| 信息保真   | 4 / 5 | 压缩没有新增人物、因果、能力或效果；Cognition 归因、约三个月窗口、邮件工作台起点和核心问题均保留。 |

## Hook 逐句检查

- `seg-001` 先说已经发生的日历变化，没有从产品名起头；一句一个意思，能在三秒内朗读。
- `seg-002` 先交代入口，再说读邮件、改日历和主动提醒；两句主语清楚，没有生硬技术词。
- `seg-003` 保留公司归因、统计窗口和早期形态，再落到“用户为什么愿意交出更多日常任务”的单一问题。
- Hook 字幕 cue 没有在中文词组或英文产品名中间断开，换行只发生在同一 cue 内；内容没有为排版删改事实。

## Blocker 检查

- 没有 press release 式功能堆叠、人工转场、破折号停顿或禁用收束句。
- Poke 在前 10 秒内得到普通话解释，Recipe 的解释与后段旁白保持不变。
- 一亿条没有口播成用户、留存、收入或成功任务。
- 最后一句仍停在功能演示的日历结果，没有 CTA 或未来质疑。
- 当前没有人工 approved 完整样稿，因此 `styleSamples` 为空。

三个维度仍达到 4 / 5 门槛。真实 TTS 是否落在目标时间内仍由音频和交付门禁读回，本报告只批准当前文字、信息和 cue 切分。
