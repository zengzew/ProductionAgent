<!-- comparison-gate
{
  "rubricVersion": "director-comparison-v1",
  "method": "editorial-retention-proxy",
  "baselineVideo": "output/episode-001/vertical_9x16.mp4",
  "baselineVideoSha256": "57a02a5de86f188fe260d6295d7e2a38d16ed948f3341b2d44306e3b472040c0",
  "directorVideo": "output/episode-001-v2-goal3/vertical_9x16.mp4",
  "directorVideoSha256": "80fd95bc44d620a23ae03b387c3749604122b5525c66e7c5dc3d2b6f27d4b2cd",
  "baselineTimeline": "content/episode-001/production/timeline.json",
  "baselineTimelineSha256": "8974170d35d09317cc521acdf821ac4f68f92bfa2955d20e6665cb221011bbd6",
  "directorTimeline": "content/episode-001-v2-goal3/production/timeline.json",
  "directorTimelineSha256": "c9509bbef7e09d47d4031ddbefc4efd93decc6e328d2ef318cd8c4a98eab0600",
  "dimensions": {
    "hookStrength": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "两版首帧都有改日历结果；v2 首句补出周三下午三点，并在 9.18 秒前先交代联系人入口和三类能力，再引入规模与问题。"
    },
    "storyCoherence": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 删除运行成本和收购现状两条支线，十段持续回答工作台为何收起、用户怎样把产品带出邮箱以及 Recipe 如何传播用法。"
    },
    "viewerCuriosity": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 把一亿条消息放在产品心智模型之后，19.8 秒前把悬念收束为用户为什么愿意继续交出日常小事。"
    },
    "productUnderstanding": {
      "baseline": 8,
      "directorCut": 9,
      "evidence": "v2 更早连起联系人、邮件、日历和主动提醒，后段再用用户请求、授权、Recipe 与正式开放展示连续产品动作。"
    },
    "visualStorytelling": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 让完成结果、入口选择、Beta 请求、权限、Recipe 和官方 Release Notes 各承担一次信息推进，并清楚区分功能演示与真实页面。"
    },
    "retentionPotential": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "v2 从 135.744 秒缩到 109.312 秒，旁白从 761 字符降到 625 字符；删去两条支线后仍回到同一改期结果。"
    }
  },
  "baselineTotal": 46,
  "directorCutTotal": 54,
  "verdict": "IMPROVED",
  "limitations": [
    "评分是同一编辑标准下的留存代理指标，不是发布后的真实观众数据。",
    "两版没有进行随机受众 A/B 测试，不能据此声称具体播放量、完播率或留存提升幅度。",
    "当前 v2 Delivery Critic 因四处字幕语义切分判定 REJECT；IMPROVED 不等于 delivery-approved。",
    "机器交付复核未包含耳机环境下的主观听感盲测。"
  ]
}
-->

# Episode 001 v1 / v2 对比

对比对象是仓库当前 Episode 001 v1 与当前 `v2-goal3`。两版均读取最终 MP4、production timeline、脚本和首帧、Hook、中段、Recipe、Release Notes、结尾关键帧；六维评分使用同一套 10 分制编辑代理标准。结论：**v2 的产品故事明显改善，但当前字幕尚未通过 Delivery Critic。**

## 客观读回

| 指标                     |                         v1 |                                   v2-goal3 | 变化                              |
| ------------------------ | -------------------------: | -----------------------------------------: | --------------------------------- |
| 最终 MP4 时长            |                 135.744 秒 |                                 109.312 秒 | -26.432 秒（-19.5%）              |
| 旁白字符（含标点与空格） |                        761 |                                        625 | -136（-17.9%）                    |
| 旁白段落                 |                         12 |                                         10 | 删除运行成本与收购现状支线        |
| Hook 顺序                |     动作 → 规模 → 心智模型 |               动作 → 心智模型 → 规模与问题 | v2 先让观众知道产品是什么         |
| Hook 完成时间            |                  19.956 秒 |                                  19.980 秒 | 总长近似，但信息顺序更清楚        |
| 强事实画面               |   规模、访谈、官方能力说明 | 同类证据 + Recipe / Release Notes 同期实页 | v2 的首次强事实证据更完整         |
| 结尾                     | 动作 + 方向变化 + 一亿消息 |        动作 + 团队选择 + 用户需求 + Recipe | v2 不再重复规模数字或引入收购支线 |
| 当前交付状态             |                v1 既有成片 |              Delivery REJECT：字幕语义边界 | v2 仍需 captions 回修             |

## 六维评估

| 维度       |        v1 |        v2 | 主要变化                                                 |
| ---------- | --------: | --------: | -------------------------------------------------------- |
| Hook 强度  |         8 |         9 | 首句给出具体时间，9.18 秒前建立产品心智模型              |
| 故事连贯性 |         8 |         9 | 只保留“团队选择 → 用户动作 → 分享方式”主线               |
| 观众好奇心 |         8 |         9 | 一亿消息成为悬念背景，问题落到用户为什么继续交出日常小事 |
| 产品理解   |         8 |         9 | 入口、能力、授权和 Recipe 按用户动作连续出现             |
| 视觉叙事   |         7 |         9 | 强事实与官方页面同期，功能演示与真实截图边界明确         |
| 留存潜力   |         7 |         9 | 缩短 19.5%，删除两条不服务核心问题的支线                 |
| **总分**   | **46/60** | **54/60** | **+8**                                                   |

## 结论

v2 的主要收益来自故事设计、口语改写和删减，不是新增未经支持的事实。它更早说明 Poke 是什么，把用户请求、团队选择和 Recipe 连成同一条因果受限的动作线，结尾也回到开场的具体日历结果。

当前质量问题已经能定位：研究和事实谱系没有成为交付 blocker，故事设计与口播相对 v1 改善；剩余问题在字幕规划及其最短时长拟合后的语义边界。先修四处 cue，再重跑 captions、timeline、render 与 Delivery Critic。之后仍需真实发布或受控 A/B 数据验证代理评分是否转化为留存改善。
