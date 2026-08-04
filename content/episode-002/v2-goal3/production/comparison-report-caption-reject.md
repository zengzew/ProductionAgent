<!-- comparison-gate
{
  "rubricVersion": "director-comparison-v1",
  "method": "editorial-retention-proxy",
  "baselineVideo": "output/episode-002/vertical_9x16.mp4",
  "baselineVideoSha256": "3edbabc411fc70042c8fec54ab0098765b0ffee09586c25605bba7cd6fb96854",
  "directorVideo": "output/episode-002-v2-goal3/vertical_9x16.mp4",
  "directorVideoSha256": "d9ab0386258839c79e3060a8cd7f4329742350c85ae7ad80cbfd532a3c1f4b41",
  "directorSubtitles": "output/episode-002-v2-goal3/subtitles_zh.srt",
  "directorSubtitlesSha256": "3aad12cbf6a6c5559aa86be34d2bf68a1b5b975aaec358297bc73e9108967ff3",
  "directorInspection": "output/episode-002-v2-goal3/inspection.json",
  "directorInspectionSha256": "60e3801f3d6339290308cb53a8f4b132c753cf21f921648bc841d86d46bf525d",
  "baselineTimeline": "content/episode-002/production/timeline.json",
  "baselineTimelineSha256": "5b9d5751447de2c42efdc72b97d788b17044717c325fd9aef004dad3c6f7744a",
  "directorTimeline": "content/episode-002-v2-goal3/production/timeline.json",
  "directorTimelineSha256": "505e7b6ed57f89d75368b667a71820fc63acd4b554e47973514ee61facfc98b8",
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
      "directorCut": 8,
      "evidence": "当前 v2 的强事实均有真实页面、来源标签或 Claim 支持图形同期出现；但位置权限和片尾字幕仍破坏语义读取，因此从原 9 分下调到 8 分。"
    },
    "retentionPotential": {
      "baseline": 7,
      "directorCut": 8,
      "evidence": "当前 v2 比 v1 缩短 30.767 秒，删去研究报告式支线并保留人类故事；字幕语义 blocker 和后段功能密度仍构成局部划走风险。"
    }
  },
  "baselineTotal": 46,
  "directorCutTotal": 52,
  "verdict": "IMPROVED",
  "limitations": [
    "六维评分是同一编辑标准下的留存代理指标，不是发布后的真实观众数据。",
    "当前 v2 因字幕语义边界被 Delivery Critic 退回 captions；IMPROVED 不等于 delivery-approved。",
    "两版没有进行随机受众 A/B 测试，不能据此声称具体播放量、完播率或留存提升幅度。",
    "机器音频复核未包含耳机环境下的主观吞字与音色盲听。"
  ]
}
-->

# Episode 002 v1 / 当前 v2 对比

对比对象是仓库保留的 Episode 002 v1 与本轮重新生成的 `v2-goal3` 实际成片。结论：**编辑代理指标仍为 IMPROVED（46 → 52，+6）**，但当前 v2 因字幕语义边界被独立 Delivery Critic 退回 `captions`，不能标记交付通过。

## 客观读回

| 指标          |                         v1 |                                                     当前 v2-goal3 | 变化                             |
| ------------- | -------------------------: | ----------------------------------------------------------------: | -------------------------------- |
| 最终 MP4 时长 |                 167.233 秒 |                                                        136.467 秒 | -30.767 秒（-18.4%）             |
| 旁白字符      |                       1000 |                                                               811 | -189（-18.9%）                   |
| 旁白段落      |                         12 |                                                                12 | 段数不变，删除支线并重写段内节奏 |
| Hook 问题     |           慢为什么让人期待 |                                    这样的等待，为什么值得讲给别人 | 从抽象判断改成可复述的人类行为   |
| 后段支线      | 融资、终身档销量、赛道信号 |                                        路线、商店、权限、开场回收 | 回到产品体验、用户动作和必要边界 |
| 当前独立评审  |              v1 旧流程产物 | Oral 5/5/5；Audience 93；Fact PASS；Retention 90；Delivery REJECT | 故事门禁通过，成片字幕门禁未通过 |

旁白字符按两版 `script.json` 中 12 段 narration 直接拼接后统计，包含标点，不含段间换行。

## 自然中文变化

v1 仍有“慢速通讯 App”“Roost 留出另一种节奏”“对慢速社交这个小赛道，这组数字给出的信号很直接”等定义式、结论式表达，也连续解释融资、终身支持档与赛道判断。当前 v2 改为“消息一飞走，你就不用守着手机”“每只鸟的速度不一样”“广告和付费获客，一分钱都没花”“那位作者等着等着，反而开始盼那只鸟落地了”等可见动作和自然说法。

本轮自然中文改写还把“独立体验者”“在那篇体验里”“送达感”等研究档案或抽象词，换成“有位作者试用 Roost 后说”“那位作者”和“改变消息送达时的感觉”。作者身份先建立再回指，单一体验没有被泛化；人物、日期、数字、Claim 和故事顺序保持不变。代价是旁白比自然改写前版本更长，成片从归档报告中的 127.300 秒增至 136.467 秒，但仍明显短于 v1 且严格小于 180 秒。

## 六维评估

| 维度       |        v1 |   当前 v2 | 主要变化                                                |
| ---------- | --------: | --------: | ------------------------------------------------------- |
| Hook 强度  |         8 |         9 | 前 20 秒把产品规则、用户仪式、阶段数字与唯一问题连起来  |
| 故事连贯性 |         8 |         9 | 删除融资与赛道判断，始终围绕等待体验推进                |
| 观众好奇心 |         8 |         9 | 伊丽莎白时代英语成为前段问题与中段人物故事的回收点      |
| 产品理解   |         8 |         9 | 产品动作完整，来源与演示边界更清楚                      |
| 视觉叙事   |         7 |         8 | 证据画面更强，但位置权限和片尾字幕破坏语义读取          |
| 留存潜力   |         7 |         8 | 总时长缩短 18.4%，但字幕 blocker 与后段功能密度仍需修复 |
| **总分**   | **46/60** | **52/60** | **+6**                                                  |

## 结论

当前 v2 的主要提升来自故事设计、事实删减、自然口播和强事实同期画面，不来自编排系统变化。质量问题已从研究、故事设计和口播准确性收敛到交付字幕语义边界：caption plan 与 generated captions 字节一致，但这种一致性没有发现主谓和句界跨 cue 的问题。因此本轮不支持迁移 orchestration；应先修正字幕规划或评估规则，再重建 SRT、重渲并复审。任何留存改善仍需发布后数据或受控 A/B 验证。
