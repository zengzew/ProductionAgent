<!-- viral-strategy-gate
{
  "rubricVersion": "viral-strategy-v2",
  "reviewedFiles": {
    "storyBibleSha256": "c13f5d18c5a7c22bd3c463d883f759c1cb33333c865ddaefa16a4b58d9e699ba",
    "storyAngleSha256": "fe9952d337c25f0a839be7411e320b7a48180495cffd8325fe1186d5fc2e9562",
    "threeActStructureSha256": "6ed82e6c863bf8859a2110d497eff5c94b24fb7133203052e114213ee94e5eb6",
    "hookCandidatesSha256": "20d82fb716e32319081f2fd1ea2192afdb9e8a1516100fb9d8531723c5d81113",
    "directorBriefSha256": "f3a73bb6d6d64f255229d8f73b6daee075754f13f646becbd23f5258816eedae"
  },
  "selectedHookHeading": "1. 日历已经改好了（选中）",
  "claimIds": [
    "claim-poke-006",
    "claim-poke-008",
    "claim-poke-010",
    "claim-poke-011",
    "claim-poke-015"
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

# Poke Viral Strategy

## Opening hook

第 0 帧同时显示已发送消息和已更新日历，不使用淡入。三秒内只说“发一句话，日历已经
改好了”，持续标“功能演示”。随后用一亿多条消息放大动作，再补联系人 AI 的产品
定义。

## Curiosity gap

二十秒内让观众知道它能从消息列表读邮件、改日历并主动联系用户。留下一个可由现有
证据回答的问题：团队为什么收起工作台，Beta 用户又怎样把产品带出邮箱？

## Emotional tension

张力从日常愿望开始：少学一套界面、少切几个窗口。随后才出现需要授权真实账户和
持续运行的代价。代价用于说明产品选择，结尾回到产品价值。

## Information reveal order

| 时间      | 新信息                                       | 暂缓回答               | 证据                                                                   |
| --------- | -------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| 0～3 秒   | 消息已经改动日历                             | 这是什么产品           | 功能演示 + `claim-poke-011`                                            |
| 3～10 秒  | 约三个月一亿多条消息                         | 团队为什么选择消息入口 | `claim-poke-015`                                                       |
| 10～20 秒 | 联系人 AI 的心智模型与唯一问题               | 用户接着怎样使用       | `claim-poke-006`, `claim-poke-008`, `claim-poke-010`                   |
| 中段      | 用户拒绝新界面、Beta 请求、授权动作与 Recipe | 公开结果与代价         | 对应 Claim 与真实 Release Notes                                        |
| 后段      | 消息规模、持续运行和收购后当时状态           | 开场动作的新含义       | `claim-poke-015`, `claim-poke-019`, `claim-poke-021`, `claim-poke-022` |

## Ending payoff

结尾依次收回工作台、Beta 请求和一亿多条消息，最后回到开场的同一句请求与已更新
日历。观众已经知道，这个动作来自团队删除界面和用户扩展用途的连续选择。最后一句
停在“发一句话，日历已经改好了”，不追加问题或 CTA。
