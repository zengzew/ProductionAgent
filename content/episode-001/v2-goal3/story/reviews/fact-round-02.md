<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "b3a8b26d3b2cb1e82d6ece3b6d215854fbc37ae5a68bfb0e31eafff891383cc8",
  "checkedSegments": 10,
  "checkedNarrationUnits": 27,
  "blockers": [
    "seg-007 的旁白单元“少一次来回切换，结果也要自己核对。”只绑定 claim-poke-024；该 Claim 只支持输出可能错误和用户核对责任，不支持“少一次来回切换”这一产品收益。"
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

# Poke v2 Fact Guardian Report · Round 2

核查对象：`story/final-script.md`

核查范围：10 段，27 个 Narration units

结论：**REJECT**

## Blocker

`seg-007` 把“少一次来回切换”和“结果也要自己核对”放在同一个 narration unit，却只绑定 `claim-poke-024`。该 Claim 的证据边界是输出可能错误、用户需对日程或业务决定负责；它不能证明减少跨应用切换这一产品收益。

“少一次来回切换”可以在研究包的任务碎片和消息入口 Claim 中找到依据，但当前 narration unit 没有绑定这些 Claim。该收益由定稿改写加入，初稿对应句只有“真实账户中的结果仍由用户核对”，因此首要退回角色是 `oral-rewriter`。

最小修订：拆开便利与核对责任，分别绑定支持其完整含义的 Claim；或者删除未正确绑定的收益从句。修改后必须重新生成脚本哈希，并依次重跑 Oral Judge、Audience Critic 和 Fact Guardian。

## 逐段事实核查

| 段落      | 结果   | 说明                                                                                                        |
| --------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `seg-001` | PASS   | 日历改到周三下午三点明确标为功能演示，`claim-poke-011` 支持安排会议能力，没有冒充真实用户个案。             |
| `seg-002` | PASS   | 已有消息入口、读邮件、改日历和主动提醒由 `claim-poke-010`、`011` 支持，没有排除其他设置界面。               |
| `seg-003` | PASS   | 一亿条保留 Cognition 归因和约三个月窗口，画面明确写“消息数，不是用户数”；没有换算采用、留存或收入。         |
| `seg-004` | PASS   | 抄时间、挪日程和重新核对是标明的流程示意，未包装成独立用户调查。                                            |
| `seg-005` | PASS   | 邮件产品起点、访谈反馈和消息入口方向变化保持创始人口述与官方能力的不同身份，没有虚构会议或单点顿悟。        |
| `seg-006` | PASS   | 服药提醒、天气和球赛均来自 `claim-poke-008`；该 Claim 支持这些请求影响产品方向。                            |
| `seg-007` | REJECT | 主动消息、授权动作和人工核对各有依据，但最后一个 narration unit 的收益从句与所绑 Claim 不匹配。             |
| `seg-008` | PASS   | Recipe 的背景设定、开场白、服务连接、分享和账户授权边界均由 `claim-poke-012` 支持，没有写成无条件一键完成。 |
| `seg-009` | PASS   | 2026-03-19、候补名单取消、Recipe 开放和一般可用状态均与 `claim-poke-004` 一致；没有宣布增长因果。           |
| `seg-010` | PASS   | 结尾只回收团队选择、Beta 请求、Recipe 分享和功能演示日历状态，没有越过数据回答留存、盈利或长期优势。        |

## 其他边界检查

- 27 个 narration units 均至少绑定一个存在且允许播出的 Claim；blocker 是 `seg-007` 的完整语义没有被其所列 Claim 覆盖。
- 公司说明、创始人口述、Cognition 披露、服务条款与编辑分析在元数据和同期画面中保持区分。
- 没有把时间相邻事件写成 Recipes 或一般开放造成消息规模。
- 没有猜内部模型路由、agent orchestration、增长原因、市场验证或执行成功率。
- 功能演示、流程示意与真实 Release Notes 页面均有明确标签；强事实的 `visualIntent` 使用相同 Claim 支持的证据。
- 结尾停在有 Claim 支持且标为功能演示的日历状态，没有未来质疑或互动 CTA。

当前 `final-script.md` 顶部的 `story-approved` 状态不能覆盖本报告的 Fact Guardian REJECT；在 blocker 解决前不得进入后续制作。
