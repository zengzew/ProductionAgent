<!-- viral-strategy-gate
{
  "rubricVersion": "viral-strategy-v2",
  "reviewedFiles": {
    "storyBibleSha256": "d9098c07a3d6ddd6afaff85a708687e5fe0430d77fc3da4dfef20504fb1fc3c3",
    "storyAngleSha256": "b6579cbb455928f51670f8f2b1883a2174cac46d9ebae21153fc535cc5b2063d",
    "threeActStructureSha256": "46ab3f0a1eea0ef602bac4092f030c26c785474d0a202f1f2ff8170ce6668cfd",
    "hookCandidatesSha256": "5ba374df048c75b357702833021cc9e86651981e15926095822169e3986edfed",
    "directorBriefSha256": "de34c356f567919f5978bb06724309d31f9af18c88d9a02d309cea69bd822ace"
  },
  "selectedHookHeading": "1. 输入一句歌词，就得到一首歌（选中）",
  "claimIds": [
    "claim-suno-001",
    "claim-suno-002",
    "claim-suno-003",
    "claim-suno-011",
    "claim-suno-017",
    "claim-suno-018",
    "claim-suno-019",
    "claim-suno-005",
    "claim-suno-006",
    "claim-suno-008",
    "claim-suno-009",
    "claim-suno-010"
  ],
  "scores": {
    "openingHook": 5,
    "curiosityGap": 5,
    "emotionalTension": 4,
    "informationRevealOrder": 5,
    "endingPayoff": 5
  },
  "total": 24,
  "threshold": 20,
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Suno Viral Strategy

## Opening hook

第 0 帧显示一句歌词变成一首带人声的歌。三秒只说这个动作，持续标“功能演示”。随后落到音乐人要让人来做，再问市场给了它什么价。

## Curiosity gap

二十秒内让观众知道这是给创作者用的，并留下一个可由现有证据回答的问题：市场后来给了它什么价？

## Emotional tension

张力从“听的人多、做的人少”开始。随后出现早期做不长、Discord 冷启动，结尾用收入和估值给出市场定价。

## Information reveal order

| 时间      | 新信息                                   | 暂缓回答     | 证据                    |
| --------- | ---------------------------------------- | ------------ | ----------------------- |
| 0～3 秒   | 一句歌词变成一首带人声的歌               | 谁做的       | `claim-suno-001`        |
| 3～11 秒  | 音乐人创始人，九成用户在创作             | 一开始怎么做 | `claim-suno-011`        |
| 11～20 秒 | 起初太难，早期只有十几秒，并问市场定价   | 第一批人怎么来 | `claim-suno-017`, `018` |
| 中段      | Discord 机器人、开放、Copilot、免费四分钟 | 市场给了什么价 | `claim-suno-019`, `005`, `006` |
| 结尾      | 付费翻倍、ARR 3 亿、融资 3.75 亿、估值 24.5 亿 | 无       | `claim-suno-008` 至 `010` |

## Ending payoff

结尾停在付费、ARR、融资和估值，回答开场“市场后来给了它什么价”。不回看开场那句歌词，不加 CTA。
