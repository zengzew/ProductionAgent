<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "a36308ea20bc833d7c53e0924ce9429e42df4daa1138477cf04e1b70718300d2",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "0bd3ed5e9cdbc6a3e89192cbb654765ebe6fbcd8b5edd0344d6954953b47cdfd",
  "round": 1,
  "scores": {
    "chineseNaturalness": 4,
    "spokenDelivery": 4,
    "informationFidelity": 3
  },
  "minimumScore": 4,
  "styleSamples": [],
  "blockers": [
    "seg-003 将初稿与 claim-roost-009 的“伊丽莎白时代英语”改成“古英语”，改变了用户故事中的历史语言事实。",
    "seg-007 把初稿画面提示中的“鸟舍”写入口播，但 claim-roost-004 只支持收集、训练不同速度的鸟和小游戏，没有支持名为鸟舍的产品位置或入口。"
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

# Roost v2 Oral Judge Report

评审对象：`story/script-draft.md` 与 `story/final-script.md`  
结论：**REJECT，退回 Oral Rewriter**

## 评分

| 维度       |  得分 | 证据                                                                                                                                 |
| ---------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------ |
| 中文自然度 | 4 / 5 | 大部分句子以“消息出发、鸟在飞、朋友催上架、用户等消息”等可见动作为主，长短句有变化；但“改变一条消息的送达感”仍略抽象。               |
| 口播节奏   | 4 / 5 | 前三秒直接给结果，段内停顿基本自然，没有连续排比、密集反问或硬广告口号；英文专名均有相邻动作解释。                                   |
| 信息保真   | 3 / 5 | 数字、日期、增长时序、创始人口径和单一体验边界大体保留，但 seg-003 改变历史语言名称，seg-007 又把 Claim 未承载的“鸟舍”写成产品事实。 |

## 逐句核对结论

- `seg-001` 至 `seg-002`：三天送达明确标为功能演示；距离、鸟速和地图路线保持
  claim-roost-003、004 的含义。
- `seg-003`：初稿和 claim-roost-009 都是“伊丽莎白时代英语”。定稿缩成“古英语”会
  指向不同的历史语言阶段，不能作为口语化同义替换。
- `seg-004` 至 `seg-006`：创始人动机、单一体验者感受、朋友推动公开、发布日期和
  送达规则均保留来源身份，没有把时间先后写成因果。
- `seg-007`：收集、训练鸟和小游戏受 claim-roost-004 支持；“回鸟舍”作为具体产品
  位置没有对应 Claim。即使初稿把它列在画面提示中，进入事实旁白后仍需 Claim 支撑。
- `seg-008` 至 `seg-012`：一万到十万、二十五万用户、十万多个活跃对话、零付费获客
  和三十万注册用户保持不同口径，没有换算留存、收入或增长归因；结尾停在鸟继续飞向
  朋友的产品动作，没有未来质疑或互动 CTA。
- 全片显式来源归因已压缩为“一位独立体验者”和“TechCrunch 记录”两处；其余来源
  身份留在结构化字段与画面计划，符合当前口播上限。
- `style/approved/` 没有人工批准的成稿样本，因此 `styleSamples` 为空。

## 最小修改清单

1. 把 seg-003 的“古英语”恢复为“伊丽莎白时代的英语”，不要扩大或改写用户故事。
2. 从 seg-007 口播删除“回鸟舍”，直接说“可以收集、训练不同的鸟，或者玩一局小游戏”；
   除非 Claim Ledger 先明确支持“鸟舍”这一产品位置。

修改后必须重新计算 `story/final-script.md` 的 SHA-256，并从 Oral Judge 重新开始。当前
REJECT 下不得启动 Audience Critic 或 Fact Guardian。
