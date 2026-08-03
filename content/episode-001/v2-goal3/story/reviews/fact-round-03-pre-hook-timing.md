<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e",
  "checkedSegments": 10,
  "checkedNarrationUnits": 27,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke v2 Fact Guardian Report · Round 3 Compliance Rebind

核查对象：`story/final-script.md`

核查范围：10 段，27 个 Narration units

结论：**PASS**

## Compliance rebind

Prelabel 报告 `story/reviews/fact-round-03-prelabel.md` 的 SHA-256 是 `c9eb7303727715f2d2a713827d7054d9b94fcc19c7724ece39a53c46a91d8278`，评审的定稿 SHA-256 是 `445b139db670f1b30f97a7a6a3a47b701b0e3cb98dd665bd32fb771090bce7cc`。当前定稿 SHA-256 是 `c251863e8e5f6c41f281074b5997b0032be429662990ac5be5ee8bcc047ced3e`。

当前视觉方案 SHA-256 是 `7f8a9824cee4a7049167c358b8cf57c1181aad2d481cb8c35d698a3242208f06`，其 gate 绑定当前定稿。唯一实质差异是 `seg-004` 的 `Visual intent` 明确标“功能演示”；这与该段两个 demonstration narration units、流程示意边界和 `claim-poke-007` 一致，降低了合成画面被误认成真实用户个案的风险。

## 逐段核查

| 段落      | 结果 | 说明                                                                                |
| --------- | ---- | ----------------------------------------------------------------------------------- |
| `seg-001` | PASS | 日历改期标为功能演示，`claim-poke-011` 支持安排会议能力。                           |
| `seg-002` | PASS | 消息入口、读邮件、改日历和主动提醒由 `claim-poke-010`、`011` 支持。                 |
| `seg-003` | PASS | 一亿条保留 Cognition 归因和约三个月窗口，不换算用户、留存或收入。                   |
| `seg-004` | PASS | 抄时间、挪日程和重新核对仍是流程示意，且当前 `Visual intent` 明确要求标“功能演示”。 |
| `seg-005` | PASS | 邮件产品起点、访谈反馈和消息入口变化保持来源身份区分。                              |
| `seg-006` | PASS | 服药提醒、天气和球赛来自 `claim-poke-008`。                                         |
| `seg-007` | PASS | 主动消息、授权动作和核对责任分别由 `claim-poke-010`、`011`、`024` 完整支持。        |
| `seg-008` | PASS | Recipe 的配置、分享和账户授权边界由 `claim-poke-012` 支持。                         |
| `seg-009` | PASS | 日期、候补名单取消、Recipe 开放和一般可用状态与 `claim-poke-004` 一致。             |
| `seg-010` | PASS | 结尾只回收已验证动作，没有回答长期结果。                                            |

## 边界检查

- 27 个 narration units 的文字和 Claim 绑定均未改变，仍完整覆盖语义。
- 公司说明、创始人口述、Cognition 披露、条款、演示和编辑分析保持区分。
- 新标签不新增事实、人物、因果或效果承诺。
- 功能演示、流程示意与真实 Release Notes 页面现在均有明确区分。
- 结尾保持有 Claim 支持的产品动作，没有未来质疑或互动 CTA。

Fact Guardian 对当前哈希给出 PASS。该结论不替代留存或成片交付门禁。
