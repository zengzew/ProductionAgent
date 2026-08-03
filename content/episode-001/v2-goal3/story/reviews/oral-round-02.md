<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "b3a8b26d3b2cb1e82d6ece3b6d215854fbc37ae5a68bfb0e31eafff891383cc8",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "6585fa6a8e18d0d247d779e58341581caf7efd06b925f419c47953301ddd9aae",
  "round": 2,
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

# Poke v2 Oral Judge Report · Round 2

评审对象：`story/script-draft.md` 与 `story/final-script.md`

结论：**PASS**

## 评分

| 维度       |  得分 | 证据与扣分                                                                                                                                             |
| ---------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 中文自然度 | 4 / 5 | “抄时间、挪日程、再补提醒”“用户又把哪些日常任务交给了这个联系人”等说法具体、有对象感。`seg-003` 的消息规模归因仍稍有研究稿语气，但没有形成成段翻译腔。 |
| 口播节奏   | 4 / 5 | 首句 3 秒完成一个结果，中段长短句错开，Recipe 首次出现时立即用普通话解释。少数 13～14 秒段落信息较满，但标点允许自然换气。                             |
| 信息保真   | 4 / 5 | 当前初稿与定稿对团队选择、Beta 请求、消息口径、一般可用节点、授权和人工核对保持一致，没有新增人物、增长因果或成功率。                                  |

## Round 2 改写核对

- `seg-003` 的继续观看问题已同时写入当前初稿和定稿：从公司内部转型问题改成“用户又把哪些日常任务交给了这个联系人”，没有新增 Claim 外的任务。
- `seg-009` 的当前初稿和定稿都删除了重复消息规模及口播数据口径，改为候补名单取消、Recipe 开放和一般可用状态，均由 `claim-poke-004` 支持。
- `seg-001` 至 `seg-002` 保留功能演示、消息入口和日历能力；没有把演示写成真实用户成功案例。
- `seg-004` 至 `seg-006` 保留任务碎片、访谈反馈和三类 Beta 请求，没有虚构具体受访者、会议或单点顿悟。
- `seg-007` 保留主动消息、授权能力与用户核对责任。“少一次来回切换”是对前文任务碎片和消息入口的口语概括；其 narration-unit Claim 绑定由 Fact Guardian 独立核查。
- `seg-008` 与 `seg-010` 保留 Recipe 授权边界，并停在功能演示中的日历状态，不使用未来质疑或互动 CTA。

## Blocker 检查

- 没有成段英文句序、产品说明书式并列、密集反问或伪口语口头禅。
- Poke 与 Recipe 首次出现时都有普通话心智模型。
- 没有改变数字、日期、来源身份、因果、授权边界或指标定义。
- 边界没有压过产品价值，最后一句不是问题。
- `style/approved/` 当前没有人工批准的完整样稿，因此 `styleSamples` 为空。

Oral Judge 仅批准当前哈希的口播自然度与整稿信息保真，不替代 Audience Critic 和逐单元 Fact Guardian。
