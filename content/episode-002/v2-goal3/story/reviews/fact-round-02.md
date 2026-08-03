<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c44c1b7c5c645050797935c85c26c7f7d876e752765ce563dd9540d3a192584f",
  "checkedSegments": 12,
  "checkedNarrationUnits": 32,
  "blockers": [
    "[research-analyst] seg-006 的旁白和视觉方案称地图能显示“还要多久”，但 claim-roost-004 只支持查看飞行路线，claim-roost-003 只支持距离和鸟速决定到达时间；Claim Ledger 没有明文支持界面显示剩余时间。",
    "[research-analyst] research/timeline.json 的 event-roost-004 仍把 claim-roost-009 的“伊丽莎白时代英语”写成“古英语”，研究时间线与 Claim Ledger 冲突。",
    "[story-director] story-bible.md、three-act-structure.md、director-brief.md 和 viral-strategy.md 仍多处使用“古英语”；three-act-structure.md、director-brief.md 和 viral-strategy.md 还把 Claim 未支持的“鸟舍”当作故事机制，当前故事决策谱系未随 Round 2 修订同步。",
    "[script-writer] story/final-script.md 的 seg-007 visualIntent 仍写“鸟舍与小游戏入口再出现”，与 claim-roost-004 及已改正的 visual-plan.md 不一致，可能让后续物化重新引入无 Claim 支持的产品画面。"
  ],
  "verdict": "REJECT",
  "returnTo": "research-analyst"
}
-->

# Roost v2 Fact Guardian Report

核查对象：`story/final-script.md`  
前置 Audience Critic：92 / 100，PASS  
核查范围：12 段，32 个 narration units，以及当前 Claim Ledger、sources、timeline、
story lineage 与 visual plan  
结论：**REJECT，首要退回 Research Analyst**

## 逐句核查结果

| 检查               | 结果        | 说明                                                                                                              |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Claim 存在与可播性 | PASS        | 32 个旁白单元引用的 Claim 均存在且 `allowedInNarration: true`。                                                   |
| 人物与产品动作     | PASS        | 创始人、朋友、体验者、母亲帖子与虚拟鸟动作没有新增身份、动机或生活细节。                                          |
| 日期与指标         | PASS        | 4 月 28 日公开、三日一万到十万、7 月 7 日二十五万用户与十万活跃对话、7 月 10 日三十万注册用户保持各自日期和口径。 |
| 来源身份           | PASS        | 创始人口径、独立体验、官方功能与 ANSA 媒体转述在结构化字段和同期画面中可区分。                                    |
| 增长因果           | PASS        | Threads 帖子与三日增长只写时间相邻；零付费获客没有归因给帖子或具体功能。                                          |
| 数字换算           | PASS        | 没有把用户、活跃对话、订阅、收入、留存或盈利互相换算。                                                            |
| 送达界面能力       | **BLOCKER** | seg-006 断言地图能看见“还要多久”，但当前 Claim 只明确路线和决定到达时间的机制，没有明确剩余时间 UI。              |
| 研究时间线         | **BLOCKER** | event-roost-004 把“伊丽莎白时代英语”写成含义不同的“古英语”。                                                      |
| 故事谱系           | **BLOCKER** | Story Bible、三幕结构、Director Brief 与 Viral Strategy 仍沿用错误语言名称；部分文件仍写无 Claim 支持的“鸟舍”。   |
| 最终稿视觉意图     | **BLOCKER** | final-script seg-007 仍写“鸟舍”；当前 visual-plan 已改成收集、训练和小游戏，两个 source-of-truth 字段互相冲突。   |
| 权限与商业边界     | PASS        | 轮换商店、支持者订阅、城市级位置、close friends 与 Pen Pals 双确认均在 Claim 边界内，没有宣称风险消失或推算收入。 |
| 结尾边界           | PASS        | 三十万明确是阶段注册用户，结尾停在鸟继续飞向朋友，没有回答留存、盈利或赛道胜负。                                  |

## Round 1 修订效果

Round 1 的两个**旁白** blocker 已解决：seg-003、008 使用准确的“伊丽莎白时代的英语”，
seg-007 narration 也已删除“回鸟舍”。但修订只同步到了最终旁白和 Visual Plan 的主体段落，
没有完整传播到 research timeline、Story Bible、三幕结构、Director Brief、Viral Strategy
与 final-script 的 `visualIntent`。因此不能把 Oral PASS 等同于完整事实谱系 PASS。

## Routed blockers

1. **research-analyst（首要）**：先判断公开来源是否明确支持 UI 显示剩余时间。支持则新增或
   修正 Claim；不支持则将该表述从旁白与视觉方案删除。同时把 timeline 中的“古英语”
   更正为“伊丽莎白时代英语”。
2. **story-director**：研究层修正后，同步 Story Bible、三幕结构、Director Brief 和
   Viral Strategy；删除“鸟舍”，或仅在新增 Claim 明确支持时保留。
3. **script-writer**：让 final-script seg-007 的 `visualIntent` 与 Claim 及当前
   visual-plan 一致，并按研究层对“剩余时间”的裁决更新 seg-006。

上游产物发生实际字节变化后，必须重新计算哈希并从 Oral Judge 开始。Fact Guardian
不直接修改研究、故事、脚本或视觉方案。
