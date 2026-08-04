<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c986e3c8f4fdc7d0bdf5436f0b62563e34622697960670c08a27daf138709648",
  "checkedSegments": 12,
  "checkedNarrationUnits": 43,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Roost v2 Fact Guardian Report · Round 3

核查范围：当前 `story/final-script.md` 的 12 段、43 个 narration units、Claim Ledger、sources、research timeline、script draft、caption plan 与 visual plan。前置 Audience Critic 对当前 SHA 给出 93/100 PASS。上一份 canonical PASS 已原样归档为 `story/reviews/fact-round-03-pre-caption-delivery-fix.md`，SHA-256 `e9b53902faada9ae3eae7939ff660ad97c966d133bad63b0d875a75a77befe71`。

结论：**PASS**。本次拆句和中文化没有改变事实、来源身份、时序、因果、指标或授权边界。

## 逐项核查

| 检查               | 结果 | 证据                                                                                                                                               |
| ------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim 存在与可播性 | PASS | 43 个旁白单元均绑定段落内存在且允许播出的 Claim；无低置信 Claim 进入旁白。                                                                         |
| 人物与来源身份     | PASS | Mendelsohn 与朋友仍是创始人口述；WhistleOut 作者仍是单一独立体验；TechCrunch 母亲帖子与增长数字保持创始人口径；ANSA 三十万保持媒体转述的注册用户。 |
| 日期与指标         | PASS | 4 月 28 日公开、帖子后三日一万到十万、7 月 7 日用户与活跃对话、7 月 10 日注册用户均保持日期和定义。                                                |
| 因果               | PASS | “概念视频火了以后”受 `claim-roost-005` 支持；帖子与增长只写“出现后的三天里”，没有宣布帖子是唯一原因。                                              |
| 产品机制           | PASS | 距离、现实鸟速、地图路线、收集训练和小游戏仍分别落在 `claim-roost-003/004`。                                                                       |
| 商业边界           | PASS | 轮换商店和支持者订阅只描述用户动作，不换算价格、收入、转化、利润或现金流。                                                                         |
| 权限边界           | PASS | 城市级位置、用户主动选择的特定 close friends、Pen Pals 双方同意均保持公司原始口径。                                                                |
| 结尾边界           | PASS | 三十万仍明确是阶段注册用户；结尾停在飞鸟动作，不推断留存、盈利、市场规模或长期增长。                                                               |

## 指定改写保真

- **seg-004 / seg-007：** `claim-roost-008` 只支持一名 WhistleOut 作者。脚本先说“有位作者试用 Roost 后说”，同段用“他”，后段用“那位作者”，三处指向同一人；没有变成“用户们”或总体体验。
- **seg-005：** 业余项目、概念视频走红、做出应用、原本不公开、朋友鼓励上架分别拆句，但仍来自 `claim-roost-005/006`。省略宾语的“他本来没打算公开”由上一句应用承接，没有新增创始人动机。
- **seg-008：** “他们”紧邻“女儿和朋友”，语义仍是这两类人通信；母亲只是 Threads 帖子的讲述者。拆成短句没有新增第二篇帖子或第二组用户。
- **seg-009：** 用户与活跃对话分别成句，准确保留不同指标；“一分钱都没花”只对应创始人披露的广告和付费获客支出为零。
- **seg-010：** 收集训练绑定 `claim-roost-004`，轮换商店与支持者订阅绑定 `claim-roost-013`，拆句后 Claim 归属更清楚。
- **seg-012：** 地图与鸟的机制总结仍由 `claim-roost-003/004` 支持；“改变了消息送达时的感觉”没有升级成留存、疗效或普遍心理结果。

## `亲密好友` 判断

`亲密好友` 在这里是 `close friends` 的自然中文表达，不是新的事实或产品分类。当前句子保留了三个关键限定：由用户主动选择、只针对特定对象、只有这些对象能看到精确位置。visual plan 仍写 `close friends`，Claim Ledger 也保留官方术语，因此审计时仍可回到原始产品设置。没有证据表明系统自动判断关系亲密度，脚本也没有这样说。

当前 PASS 只批准现有证据边界内的故事，不等于 Delivery 或真实留存批准。交给 Visual/Retention 门禁。
