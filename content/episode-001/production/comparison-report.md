<!-- comparison-gate
{
  "rubricVersion": "director-comparison-v1",
  "method": "editorial-retention-proxy",
  "baselineVideo": "output/episode-001/iterations/publish-v2-2026-07-30/vertical_9x16.mp4",
  "baselineVideoSha256": "672113aeb631f17c97c5d46d45d3c02d7e7003fdec669ef5298729ac81e4b523",
  "directorVideo": "output/episode-001/vertical_9x16.mp4",
  "directorVideoSha256": "207633de6992736d25212f890ee55feb17f54a22a9383e3ddc118e329e74a0ae",
  "baselineTimeline": "output/episode-001/iterations/publish-v2-2026-07-30/timeline.json",
  "baselineTimelineSha256": "ceae4ae27e97e0def20c51fa134dab9a7d572491dca05b36e51eb9cd4ebe1fa1",
  "directorTimeline": "content/episode-001/production/timeline.json",
  "directorTimelineSha256": "8e14cd40d4813283ccb23a659b14a56980a59f7fcd4d12714ec7e9585a8facec",
  "dimensions": {
    "hookStrength": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "旧版第 0 帧为空白画布；导演版第 0 帧已同时显示已发送请求和更新后的日历。"
    },
    "storyCoherence": {
      "baseline": 6,
      "directorCut": 9,
      "evidence": "旧版从入口问题转向 Apple 日期与成本支线；导演版所有段落都推进团队收起工作台、用户扩展用途这一条因果受限主线。"
    },
    "viewerCuriosity": {
      "baseline": 7,
      "directorCut": 8,
      "evidence": "旧版等待成本答案但结尾又变成未来质疑；导演版在 20 秒内提出两个可由当前材料兑现的产品选择，并在结尾逐项回答。"
    },
    "productUnderstanding": {
      "baseline": 7,
      "directorCut": 9,
      "evidence": "导演版用联系人、邮件、日历和 Beta 请求连续示范入口、能力、权限确认与用户扩展用途。"
    },
    "visualStorytelling": {
      "baseline": 6,
      "directorCut": 8,
      "evidence": "旧版多次停在大标题与白卡；导演版用已完成动作、请求链、真实 Release Notes、消息聚合和收购公告承担各段新信息。"
    },
    "retentionPotential": {
      "baseline": 6,
      "directorCut": 9,
      "evidence": "导演版从 180.544 秒缩到 135.744 秒，首帧立即兑现动作，中段每 20 至 40 秒有新动作或证据，结尾回收开场。"
    }
  },
  "baselineTotal": 39,
  "directorCutTotal": 52,
  "verdict": "IMPROVED",
  "limitations": [
    "评分是同一编辑标准下的留存代理指标，不是发布后的真实观众数据。",
    "两个版本没有进行随机受众 A/B 测试，不能据此声称具体播放量或留存提升幅度。"
  ]
}
-->

# Episode 001 导演流程复刻对比

对比对象是 2026-07-30 的 publish-v2 基线与当前 director cut。两版均读取实际 MP4、
production timeline 和关键帧；六维评分使用同一套 10 分制编辑代理标准。它回答“当前
版本是否更有机会留住陌生观众”，不替代发布后的真实留存实验。

## 客观读回

| 指标             | publish-v2 基线  | director cut                       | 变化                               |
| ---------------- | ---------------- | ---------------------------------- | ---------------------------------- |
| 真实 MP4 时长    | 180.544 秒       | 135.744 秒                         | 缩短 44.800 秒，并恢复合规         |
| 第 0 帧产品动作  | 无               | 已发送 + 日历已更新                | 结果在第一帧可见                   |
| 前 20 秒问题     | 为什么越用越贵   | 为什么收起工作台，用户如何带出邮箱 | 回到产品选择与使用                 |
| 结尾             | 未来还能跑多久   | 同一消息与已更新日历               | 从开放问题改为兑现开场             |
| Retention Critic | 旧流程无闭环记录 | 66 REJECT → 93 PASS                | 三条高风险反馈均有责任人与产物变更 |

## 六维评估

| 维度       | 基线      | 导演版    | 判断依据                                                                   |
| ---------- | --------- | --------- | -------------------------------------------------------------------------- |
| Hook 强度  | 7         | 9         | 字幕说明动作，提升为首帧直接看见动作完成                                   |
| 故事连贯性 | 6         | 9         | 删除 Apple 编年支线，团队选择、用户动作和产品结果形成单一推进              |
| 观众好奇心 | 7         | 8         | 问题能被现有事实逐段回答，结尾不再另开未来问题                             |
| 产品理解   | 7         | 9         | 联系人入口、邮件读取、日历执行、权限确认和 Recipe 分享均有具体动作         |
| 视觉叙事   | 6         | 8         | 每段都有 narrative purpose、viewer state、新信息、证据与真实 render target |
| 留存潜力   | 6         | 9         | 缩短 24.8%，强化第一帧，并把中段重复信息改成动作或证据                     |
| **总分**   | **39/60** | **52/60** | **+13**                                                                    |

## 结论

导演版在六项代理指标上都高于 publish-v2，且通过当前交付门禁。改善来自问题、揭示顺序、
反馈路由和实际画面的共同变化，不是仅增加评审文档。下一步真正验证留存提升仍需发布后的
同平台、同受众或受控 A/B 数据。本轮字幕语义修复未改变旁白、事实、镜头结构、时长或
六维评分；当前导演版 MP4 哈希已绑定到上方 gate。
