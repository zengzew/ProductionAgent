<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "a7529475d4b92dc55110903da2f23e1105aed452194eef2ac4a0fd34a9a2ba29",
  "checkedSegments": 10,
  "checkedNarrationUnits": 27,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Fact Guardian Report · Delivery-timing Rebind

核查对象：`story/final-script.md`、`story/caption-plan.json`、`research/facts.json`、`research/sources.json` 与 `story/visual-plan.md`

核查范围：10 段，27 个 Narration units

结论：**PASS**

## Delivery-timing rebind

压缩前 canonical 报告已原样归档到 `story/reviews/fact-round-03-pre-hook-timing.md`，归档 SHA-256 为 `ef345cd8123258e0cc72a3e06936fa537ebbabd3d66b6329925a9905a5672140`，其评审的定稿 SHA-256 为 `c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e`。当前输入哈希如下：

- 定稿：`a7529475d4b92dc55110903da2f23e1105aed452194eef2ac4a0fd34a9a2ba29`
- 字幕规划：`8f76a6d9ee045cb838bd18ddb309436045202c7092df4ad3bcb9ca063d48dab5`
- Claim Ledger：`73dca2b9526a198969c9c93db936788728b241406dbb420e643d1bea6026e63a`
- Sources：`e6d7df31372285b966e8556384898b75b864437328966e7939369a9d2d29e0de`
- 视觉方案：`7f8a9824cee4a7049167c358b8cf57c1181aad2d481cb8c35d698a3242208f06`

Facts、sources、故事主线和视觉意图未变。本次重新核查压缩后的六个 Hook narration units，并复核其余 21 个 units 的文字和 Claim 绑定未受影响；这属于交付时长重绑定，不另起创意轮次。

## Hook 事实核查

| 段落      | 结果 | 说明                                                                                                                                                                    |
| --------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seg-001` | PASS | “发一句话，周三的会议改到下午三点”仍是明确标注的功能演示；`claim-poke-011` 支持安排会议，不宣称真实成功率。                                                             |
| `seg-002` | PASS | 联系人列表入口与主动消息由 `claim-poke-010` 支持，读邮件与改日历由 `claim-poke-011` 支持；没有写“没有 App”。                                                            |
| `seg-003` | PASS | `claim-poke-015` 支持 Cognition 披露、收购前约三个月和超过一亿条消息；`claim-poke-006` 支持早期邮件工作台。核心问题是由 `006`、`008` 支持的编辑提问，不把先后写成因果。 |

`seg-003` 旁白将单位压成“往来超过一亿条”，但同期画面明确写“约三个月 · 1 亿+ 条消息”并保留 Cognition 来源；没有换算为用户、留存、收入、人均强度或成功任务。字幕 cue 与旁白逐字对应，不自行补写事实。

## 其余段落复核

| 段落      | 结果 | 说明                                                                        |
| --------- | ---- | --------------------------------------------------------------------------- |
| `seg-004` | PASS | 抄时间、挪日程和重新核对是流程示意，`claim-poke-007` 支持多应用碎片化负担。 |
| `seg-005` | PASS | 邮件产品起点、访谈反馈和消息入口变化保持创始人口述与公司说明的身份区分。    |
| `seg-006` | PASS | 服药提醒、天气和球赛来自 `claim-poke-008`，没有重建具体人物。               |
| `seg-007` | PASS | 主动消息、授权动作和核对责任分别由 `claim-poke-010`、`011`、`024` 支持。    |
| `seg-008` | PASS | Recipe 的配置、分享和账户授权边界由 `claim-poke-012` 支持。                 |
| `seg-009` | PASS | 日期、候补名单取消、Recipe 开放和一般可用状态与 `claim-poke-004` 一致。     |
| `seg-010` | PASS | 结尾只回收已核查的团队选择、用户动作和功能演示，没有回答长期结果。          |

## 边界与谱系检查

- 27 个 narration units 都有允许播出的 Claim；公司披露、创始人口述、条款、演示和编辑分析保持区分。
- 功能演示、流程示意与真实 Release Notes 页面没有互相冒充。
- 字幕 cue 没有删词、换词或补词来改变事实，Hook 内没有拆开产品名或中文词组。
- 当前视觉方案内容与 Hook 的 3、7、10 秒结构一致。本报告绑定的是其当前文件哈希；视觉方案自身 gate 仍需由对应角色对当前定稿哈希完成独立重绑定后再跑完整 story validation。
- 没有新增人物、场景、因果、增长归因、效果承诺或素材权利结论。

Fact Guardian 对当前定稿给出 PASS。视觉方案 gate 的谱系重绑定是非事实类后续门禁，不改变本次 27 个 narration units 的事实结论。
