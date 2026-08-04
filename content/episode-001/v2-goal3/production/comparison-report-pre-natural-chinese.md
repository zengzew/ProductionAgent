<!-- comparison-gate
{
  "rubricVersion": "director-comparison-v1",
  "method": "editorial-retention-proxy",
  "baselineVideo": "output/episode-001/vertical_9x16.mp4",
  "baselineVideoSha256": "57a02a5de86f188fe260d6295d7e2a38d16ed948f3341b2d44306e3b472040c0",
  "directorVideo": "output/episode-001-v2-goal3/vertical_9x16.mp4",
  "directorVideoSha256": "4c3c189d95575397b34e10043d0dcc8021bba736cae5457750eddee09e9d7cea",
  "baselineTimeline": "content/episode-001/production/timeline.json",
  "baselineTimelineSha256": "8974170d35d09317cc521acdf821ac4f68f92bfa2955d20e6665cb221011bbd6",
  "directorTimeline": "content/episode-001-v2-goal3/production/timeline.json",
  "directorTimelineSha256": "96f08c76ecf62bf1be64bb1d82b60db9604505ae0ef52d356c7dd8e0cd70e08f",
  "dimensions": {
    "hookStrength": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "两版都从改日历动作开始；v2 在首句直接给出周三下午三点，并在 10 秒内补齐联系人入口与产品能力，再进入规模。"
    },
    "storyCoherence": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 删除运行成本与收购现状两条支线，十段只回答工作台如何收起、用户如何把产品带出邮箱。"
    },
    "viewerCuriosity": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 把一亿条消息放在心智模型之后，并把悬念收束为用户还会把哪些日常任务交给这个联系人。"
    },
    "productUnderstanding": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 更早连起联系人、邮件、日历与主动提醒，之后用 Beta 请求、授权和 Recipe 展示三个连续产品动作。"
    },
    "visualStorytelling": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 让完成动作、界面收起、用户请求、Recipe 分享和官方 Release Notes 分别承担一次信息推进，并清除了旧版证据标签泄漏。"
    },
    "retentionPotential": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 从 135.744 秒缩到 99.925 秒，旁白从 761 字降到 567 字；删去重复数字、成本与收购支线后仍完整兑现开场。"
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

# Episode 001 v1 / v2 对比

对比对象是仓库当前 Episode 001 v1 与 `v2-goal3`。两版均读取最终 MP4、production timeline、脚本和关键帧；六维评分使用同一套 10 分制编辑代理标准。

## 客观读回

| 指标          |                         v1 |                                         v2-goal3 | 变化                       |
| ------------- | -------------------------: | -----------------------------------------------: | -------------------------- |
| 最终 MP4 时长 |                 135.744 秒 |                                        99.925 秒 | -35.819 秒（-26.4%）       |
| 旁白字数      |                        761 |                                              567 | -194（-25.5%）             |
| 旁白段落      |                         12 |                                               10 | 删除运行成本与收购现状支线 |
| Hook 顺序     |     动作 → 规模 → 心智模型 |                     动作 → 心智模型 → 规模与问题 | 更快说明产品是什么         |
| 结尾          | 动作 + 方向变化 + 一亿消息 |              动作 + 团队选择 + 用户动作 + Recipe | 不重复规模数字             |
| 独立评审      |            v1 当前流程报告 | Oral 4/4/4；Audience 89；Fact PASS；Retention 87 | v2 完成独立多轮闭环        |

## 六维评估

| 维度       |        v1 |        v2 | 主要变化                                     |
| ---------- | --------: | --------: | -------------------------------------------- |
| Hook 强度  |         8 |         9 | 首句给出具体时间，10 秒内建立产品心智模型    |
| 故事连贯性 |         8 |         9 | 只保留“团队选择 → 用户动作 → 分享方式”主线   |
| 观众好奇心 |         8 |         9 | 一亿消息成为悬念背景，不再重复作为后段答案   |
| 产品理解   |         8 |         9 | 入口、能力、授权和 Recipe 按用户动作连续出现 |
| 视觉叙事   |         7 |         9 | 强事实与官方页面同期，演示与真实截图边界明确 |
| 留存潜力   |         7 |         9 | 缩短 26.4%，删除两条不服务核心问题的支线     |
| **总分**   | **46/60** | **54/60** | **+8**                                       |

## 结论

v2 的主要收益来自故事设计和删减，不是新增研究材料。事实覆盖没有减少，产品心智模型更早，结尾也更集中。下一步需要真实发布或受控 A/B 数据验证代理评分是否转化为留存改善。
