<!-- comparison-gate
{
  "rubricVersion": "director-comparison-v1",
  "method": "editorial-retention-proxy",
  "baselineVideo": "output/episode-002/vertical_9x16.mp4",
  "baselineVideoSha256": "3edbabc411fc70042c8fec54ab0098765b0ffee09586c25605bba7cd6fb96854",
  "directorVideo": "output/episode-002-v2-goal3/vertical_9x16.mp4",
  "directorVideoSha256": "afc12da77fc39908f4d1f8e004990f124a8187431ee9cdb390ede33fd049f1aa",
  "baselineTimeline": "content/episode-002/production/timeline.json",
  "baselineTimelineSha256": "5b9d5751447de2c42efdc72b97d788b17044717c325fd9aef004dad3c6f7744a",
  "directorTimeline": "content/episode-002-v2-goal3/production/timeline.json",
  "directorTimelineSha256": "1369e6aaa877ac3c495141179cecda1420fb2eb4d067b5c601fb2914019ff577",
  "dimensions": {
    "hookStrength": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "两版都有三天送达的动作；v2 在 20 秒内加入伊丽莎白时代英语这一具体用户行为，让产品规则和人的好奇心同时成立。"
    },
    "storyCoherence": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 删除融资、终身支持档销量和赛道结论，把十二段都收回到等待如何变成可见体验。"
    },
    "viewerCuriosity": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 的问题是等待为什么值得讲给别人，后段用用户通信仪式、路线和阶段增长逐步回答。"
    },
    "productUnderstanding": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 用真实 App Store、送达规则、路线、训练、商店和位置权限形成完整但更紧凑的使用链。"
    },
    "visualStorytelling": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 为慢速送达、路线、用户仪式、增长、支持和位置分别安排证据画面，并移除旧模板中无 Claim 支持的价格、速度与结尾标签。"
    },
    "retentionPotential": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 从 167.233 秒缩到 127.300 秒，旁白从 1000 字降到 736 字，保留用户故事和产品机制，删除研究报告式支线。"
    }
  },
  "baselineTotal": 46,
  "directorCutTotal": 54,
  "verdict": "IMPROVED",
  "limitations": [
    "评分是同一编辑标准下的留存代理指标，不是发布后的真实观众数据。",
    "两版没有进行随机受众 A/B 测试，不能据此声称具体播放量、完播率或留存提升幅度。",
    "机器交付复核未包含耳机环境下的主观听感盲测。"
  ]
}
-->

# Episode 002 v1 / v2 对比

对比对象是仓库当前 Episode 002 v1 与 `v2-goal3`。两版均读取最终 MP4、production timeline、脚本和关键帧；六维评分使用同一套 10 分制编辑代理标准。

## 客观读回

| 指标          |                         v1 |                                         v2-goal3 | 变化                   |
| ------------- | -------------------------: | -----------------------------------------------: | ---------------------- |
| 最终 MP4 时长 |                 167.233 秒 |                                       127.300 秒 | -39.933 秒（-23.9%）   |
| 旁白字数      |                       1000 |                                              736 | -264（-26.4%）         |
| 旁白段落      |                         12 |                                               12 | 段数不变，段内更紧凑   |
| Hook 问题     |           慢为什么让人期待 |                           等待为什么值得讲给别人 | 增加可复述的人类行为   |
| 后段支线      | 融资、终身档销量、赛道信号 |                       路线、商店、权限、开场回收 | 回到产品体验与用户动作 |
| 独立评审      |            v1 当前流程报告 | Oral 4/4/5；Audience 92；Fact PASS；Retention 87 | v2 完成独立多轮闭环    |

## 六维评估

| 维度       |        v1 |        v2 | 主要变化                                                  |
| ---------- | --------: | --------: | --------------------------------------------------------- |
| Hook 强度  |         8 |         9 | 前 20 秒把产品规则、用户仪式和阶段增长连起来              |
| 故事连贯性 |         8 |         9 | 删除融资与赛道判断，始终围绕等待体验推进                  |
| 观众好奇心 |         8 |         9 | 伊丽莎白时代英语成为可复述的用户行为与中段回收点          |
| 产品理解   |         8 |         9 | 产品动作完整，解释更短，位置权限仍保留必要边界            |
| 视觉叙事   |         7 |         9 | 强事实同期给出真实页面或 Claim 支持图形，并清除旧文案泄漏 |
| 留存潜力   |         7 |         9 | 缩短 23.9%，保留人类故事，删除研究报告式支线              |
| **总分**   | **46/60** | **54/60** | **+8**                                                    |

## 结论

v2 保留了 v1 最强的慢速送达概念，同时把人的使用仪式提前到 Hook，并减少商业与赛道支线。提升主要来自故事设计、口播压缩和画面事实绑定；下一步仍需真实发布或受控 A/B 数据验证留存。
