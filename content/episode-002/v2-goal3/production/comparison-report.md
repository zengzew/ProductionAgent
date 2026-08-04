<!-- comparison-gate
{
  "rubricVersion": "director-comparison-v1",
  "method": "editorial-retention-proxy",
  "baselineVideo": "output/episode-002/vertical_9x16.mp4",
  "baselineVideoSha256": "3edbabc411fc70042c8fec54ab0098765b0ffee09586c25605bba7cd6fb96854",
  "directorVideo": "output/episode-002-v2-goal3/vertical_9x16.mp4",
  "directorVideoSha256": "0a8f7f9f14da5eadfcebd15dd9f1ae6ead73cf7b50ea05593599696b69c96579",
  "baselineTimeline": "content/episode-002/production/timeline.json",
  "baselineTimelineSha256": "5b9d5751447de2c42efdc72b97d788b17044717c325fd9aef004dad3c6f7744a",
  "directorTimeline": "content/episode-002-v2-goal3/production/timeline.json",
  "directorTimelineSha256": "812ff1ad8ed20eb8b38a40e80766c3fb7c122e68155656203312cec1eb8b09ca",
  "dimensions": {
    "hookStrength": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "两版都从三天送达起步；当前 v2 在 19.356 秒内加入伊丽莎白时代英语这一具体用户动作、阶段数字与唯一问题，产品规则和人的好奇心同时成立。"
    },
    "storyCoherence": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "当前 v2 删除融资、终身支持档销量和赛道结论，把十二段持续收回到等待如何变成可见体验。"
    },
    "viewerCuriosity": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 先问这种等待为何值得讲给别人，再用具体作者体验、母亲与女儿的通信仪式逐步兑现。"
    },
    "productUnderstanding": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 用真实 App Store、送达规则、路线、训练、商店和位置权限组成完整使用链，且删除无 Claim 支持的剩余时间和鸟种速度细节。"
    },
    "visualStorytelling": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "强事实首次出现时都有真实页面、具体来源标签或 Claim 支持图形；当前权限句和片尾句也已在同一视觉节拍内完整读取。"
    },
    "retentionPotential": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 比 v1 缩短 26.300 秒，删去研究报告式支线；47 条语义字幕修复了上一轮阻碍阅读的权限句和片尾主谓拆分。"
    }
  },
  "baselineTotal": 46,
  "directorCutTotal": 54,
  "verdict": "IMPROVED",
  "limitations": [
    "六维评分是同一编辑标准下的留存代理指标，不是发布后的真实观众数据。",
    "两版没有进行随机受众 A/B 测试，不能据此声称具体播放量、完播率或留存提升幅度。",
    "机器音频复核未包含耳机环境下的主观吞字与音色盲听。",
    "底部通用来源 footer 的局部遮挡和结尾顶部 ANSA 7 小标题属于可继续润色的非 blocker。"
  ]
}
-->

# Episode 002 v1 / 最终 v2 对比

对比对象是仓库保留的 Episode 002 v1 与本轮重新生成并通过 Delivery Critic 的 `v2-goal3` 实际成片。结论：**编辑代理指标 IMPROVED（46 → 54，+8）**。提升来自研究取舍、单一故事问题、自然口播、强事实同期画面与语义字幕修复，不来自编排系统迁移。

上一轮字幕 REJECT 状态的 canonical 对比已原样归档为 `production/comparison-report-caption-reject.md`，SHA-256 为 `1aeefb3db6983be074bb5654b0b75880e15b11a6d36ac0826b05695f746ef26d`。

## 客观读回

| 指标          |                         v1 |                                                   最终 v2-goal3 | 变化                             |
| ------------- | -------------------------: | --------------------------------------------------------------: | -------------------------------- |
| 最终 MP4 时长 |                 167.233 秒 |                                                      140.933 秒 | -26.300 秒（-15.7%）             |
| 旁白字符      |                       1000 |                                                             811 | -189（-18.9%）                   |
| 旁白段落      |                         12 |                                                              12 | 段数不变，删除支线并重写段内节奏 |
| 中文字幕 cue  |                    v1 旧版 |                                                              47 | 最终版按完整语义单位规划         |
| Hook 问题     |           慢为什么让人期待 |                                  这样的等待，为什么值得讲给别人 | 从抽象判断改成可复述的人类行为   |
| 后段支线      | 融资、终身档销量、赛道信号 |                                      路线、商店、权限、开场回收 | 回到产品体验、用户动作和必要边界 |
| 当前独立评审  |              v1 旧流程产物 | Oral 5/5/5；Audience 93；Fact PASS；Retention 90；Delivery PASS | 故事门禁与实际成片门禁均通过     |

旁白字符按两版 `script.json` 中 12 段 narration 直接拼接后统计，包含标点，不含段间换行。最终 v2 因将碎片字幕重新合并为 47 个语义 cue，比上一轮 136.467 秒的字幕 REJECT 版本增加 4.466 秒，但仍比 v1 短 15.7%，且严格小于 180 秒。

## 质量变化

v1 仍有“慢速通讯 App”“Roost 留出另一种节奏”“对慢速社交这个小赛道，这组数字给出的信号很直接”等定义式或结论式表达，并连续解释融资、终身支持档和赛道判断。最终 v2 改成“消息一飞走，你就不用守着手机”“每只鸟的速度不一样”“广告和付费获客，一分钱都没花”“那位作者等着等着，反而开始盼那只鸟落地了”等可见动作和自然说法。

故事只回答“这样的等待，为什么值得讲给别人”：先给三日送达的可见结果，再解释起源与具体机制，接着落到作者体验和母女通信，最后用权限边界、三十万注册用户与开场飞鸟完成回收。融资、终身档销量和赛道判断被删除后，每段都能接回产品选择、用户动作或可验证结果。

事实层面，v2 删除了无 Claim 支持的剩余时间、鸟种速度和增长归因，把作者体验限定为单一来源，把用户故事和三十万数字分别标明创始人口径或 ANSA 统计日期。视觉层面，App Store 真实页面、路线、位置权限、数据卡与程序化界面的身份标签均在强事实首次出现时同期出现。

上一轮 Delivery REJECT 暴露的质量问题不在研究、故事或 orchestration，而在字幕语义规划：字节一致性没有发现修饰语、对象、谓语和句界跨 cue。本轮重新规划后，close-friends 权限句、结尾数据句和飞鸟主谓句均已完整同屏；47 条 cue 中只有 2 条短于 1 秒，占 4.2553%，因此视觉叙事与留存潜力恢复为 9 分。

## 六维评估

| 维度       |        v1 |   最终 v2 | 主要变化                                               |
| ---------- | --------: | --------: | ------------------------------------------------------ |
| Hook 强度  |         8 |         9 | 前 20 秒把产品规则、用户仪式、阶段数字与唯一问题连起来 |
| 故事连贯性 |         8 |         9 | 删除融资与赛道判断，始终围绕等待体验推进               |
| 观众好奇心 |         8 |         9 | 伊丽莎白时代英语成为前段问题与中段人物故事的回收点     |
| 产品理解   |         8 |         9 | 产品动作完整，来源与演示边界更清楚                     |
| 视觉叙事   |         7 |         9 | 强事实证据同期出现，字幕以完整语义单位显示             |
| 留存潜力   |         7 |         9 | 总时长缩短 15.7%，支线减少，上一轮字幕 blocker 已修复  |
| **总分**   | **46/60** | **54/60** | **+8**                                                 |

## 结论与下一步

最终 v2 在六项编辑代理指标上都高于 v1，并通过当前实际 MP4 的 Delivery Critic。Goal 3.2 的 Episode 002 证据支持继续使用现有 artifact-based workflow，不支持迁移 orchestration。下一步应优先加强 caption plan 的语义边界评估，让自动门禁识别“字面未断、主谓已断”的问题；同时在发布前补一次人工耳机抽听，并把通用来源 footer 与结尾顶部小标题作为视觉润色项处理。任何真实留存改善仍需发布数据或受控 A/B 验证。
