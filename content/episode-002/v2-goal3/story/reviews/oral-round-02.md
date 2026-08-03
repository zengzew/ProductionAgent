<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c44c1b7c5c645050797935c85c26c7f7d876e752765ce563dd9540d3a192584f",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "0bd3ed5e9cdbc6a3e89192cbb654765ebe6fbcd8b5edd0344d6954953b47cdfd",
  "round": 2,
  "scores": {
    "chineseNaturalness": 4,
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

# Roost v2 Oral Judge Report · Round 2

评审对象：`story/script-draft.md` 与 `story/final-script.md`  
上一轮：`story/reviews/oral-round-01.md`，SHA-256
`c17b8fd991d5c2d9a75342d650a55b3c7edd56506792b8d29470cdcd8158992b`  
结论：**PASS**

## 评分

| 维度       |  得分 | 证据                                                                                                                                             |
| ---------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 中文自然度 | 4 / 5 | 以“消息出发、鸟在飞、朋友催上架、用户等消息”等具体动作为主，没有翻译腔排比、硬广告词或通用 CTA；结尾“送达感”略抽象，但紧接可见的地图与飞鸟动作。 |
| 口播节奏   | 4 / 5 | 前三秒一句给出结果，长短句和停顿有变化；seg-005、008、011 信息较密，但可在各自目标时长内自然分句，不需要连续换气两次。                           |
| 信息保真   | 5 / 5 | 32 个 narration units 的人物、日期、数字、来源身份、时间顺序和指标口径均与初稿及可播 Claim 一致，没有新增增长原因、市场结论或普遍用户效果。      |

## Round 1 blocker 复核

| Round 1 blocker                           | 当前证据                                                                                        | 结论     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| seg-003 把“伊丽莎白时代英语”改成“古英语”  | seg-003 旁白与 on-screen text 均已恢复“伊丽莎白时代的英语”；seg-008 同样使用准确名称。          | RESOLVED |
| seg-007 把无 Claim 支持的“回鸟舍”写入口播 | 当前旁白改为“可以收集、训练不同的鸟，或者玩一局小游戏”，只保留 claim-roost-004 明确支持的动作。 | RESOLVED |

Round 1 的两个口播 blocker 均由实际字节变化解决，不是只修改评审结论。当前定稿哈希与
Round 1 的 `a36308ea…` 不同。

## 逐段保真检查

- seg-001 至 seg-003：三天送达明确是功能演示；伊丽莎白时代英语用户故事与一万到
  十万只写时间相邻，没有制造增长因果。
- seg-004 至 seg-007：创始人动机、单一体验者感受、朋友推动公开和送达机制均保持
  原来源强度；单一体验没有外推为所有用户效果。
- seg-008 至 seg-012：用户、活跃对话、零付费获客和注册用户保持不同口径；商店、
  位置与 Pen Pals 只描述可播功能，没有换算收入、留存或风险消除。
- 旁白显式来源归因保持在两处：“一位独立体验者提到”和“TechCrunch 记录”。其余
  来源身份留在结构化字段和画面计划。
- 结尾回答开场并停在鸟继续飞向朋友的产品动作，没有未来质疑、主题升华或互动 CTA。
- `style/approved/` 没有人工批准的成稿样本，因此 `styleSamples` 为空。

## 下游注意项

`story/final-script.md` 的 seg-007 `visualIntent` 仍出现“鸟舍”，但当前口播已不包含该
词。该结构化视觉残留不构成本轮 Oral blocker，需由 Audience Critic 与 Fact Guardian
结合当前 `visual-plan.md` 和 Claim Ledger 独立判断。
