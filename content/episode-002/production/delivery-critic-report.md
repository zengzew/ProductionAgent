<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002/vertical_9x16.mp4",
  "reviewedVideoSha256": "3edbabc411fc70042c8fec54ab0098765b0ffee09586c25605bba7cd6fb96854",
  "reviewedSubtitles": "output/episode-002/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "655c9764bfec2bc4ef1f599d1397c4f6a686242a4da8a5da2d81bb9e4b68d48f",
  "reviewedTimeline": "content/episode-002/production/timeline.json",
  "reviewedTimelineSha256": "5b9d5751447de2c42efdc72b97d788b17044717c325fd9aef004dad3c6f7744a",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 6,
    "microCueRatio": 0.068966,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.551,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Roost Social Delivery Critic Report

审核对象：当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、TTS
metadata、generated captions，以及开场、官网、当前 Pen Pals 和新版总结结尾抽帧。

结论：**PASS**

## 产物绑定

| 产物                                               | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-002/vertical_9x16.mp4`             | `3edbabc411fc70042c8fec54ab0098765b0ffee09586c25605bba7cd6fb96854` |
| `output/episode-002/subtitles_zh.srt`              | `655c9764bfec2bc4ef1f599d1397c4f6a686242a4da8a5da2d81bb9e4b68d48f` |
| `content/episode-002/production/timeline.json`     | `5b9d5751447de2c42efdc72b97d788b17044717c325fd9aef004dad3c6f7744a` |
| `content/episode-002/production/tts-metadata.json` | `f0567f29bde01e7a75596b154728010e4d890b23a2713bba0732ac6d738c9d31` |
| `src/episode-002-captions.generated.json`          | `62bab810378a602a1ae5ddd1dbd21b4ba2c7946f73a445c5ce26822783d80210` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                              |
| ---------------- | ---- | ------------------------------------------------------------------------- |
| 正向推广口吻     | PASS | 主线围绕慢速送信体验、用户动作、阶段性流量和产品选择展开                  |
| 首帧零背景可懂   | PASS | 第一帧显示消息已发出、鸟已离开起点、三天倒计时和“功能演示”标签            |
| 前 20 秒心智模型 | PASS | Hook 在 19.98 秒结束；App Store、官网、送达规则、增长口径和核心问题已出现 |
| 中文字幕语义边界 | PASS | 87 个 cue 与 caption plan 一致，主谓、专名和英文词没有词中断开            |
| 两行字幕可读性   | PASS | 每条最多两行；关键抽帧未见横向溢出或证据遮挡                              |
| 微 cue           | PASS | 小于 1 秒为 6 条，占 6.8966%；低于 10% 上限，最短 0.551 秒                |
| 字幕安全区       | PASS | Hook、官网、当前 Pen Pals 和新版结尾抽帧均在底部安全区                    |
| 官网与应用截图   | PASS | App Store 和 Roost 官网真实页面可辨认，来源标签与 asset manifest 一致     |
| 当前功能口径     | PASS | 已删除旧版“不可撤回”和年龄分组表述；Pen Pals 使用 8 月 2 日官方 FAQ       |
| 结尾总结         | PASS | 先总结即时回复压力、30 万注册用户、10 万多个活跃对话和阶段性市场信号      |
| 来源身份         | PASS | 结尾显示 ANSA、GamesBeat、TechCrunch；注册用户与活跃对话分开呈现          |
| 结尾兑现开场     | PASS | 最后停在开场那只鸟继续飞向朋友，没有未来质疑或互动 CTA                    |
| 时长上限         | PASS | FFprobe 实测 167.233 秒，严格小于项目级 180 秒硬上限                      |
| 画面规格         | PASS | H.264，1080×1920，30 fps                                                  |
| 音频技术状态     | PASS | AAC 48 kHz，峰值 -1.7 dB；12 段归一化音频完整接入                         |
| 音画与字幕同步   | PASS | 时间轴由真实 MP3 时长生成，SRT 与渲染共用 generated captions              |

## 人工判断

复核了当前 Pen Pals 场景、结尾数据首次出现、市场信号字幕和最后一帧。关键文字、
来源标签与字幕没有互相遮挡。新版结尾用痛点、流量和赛道信号完成总结，再回到飞行中的
鸟，过渡完整，不再像突然停止。

当前 MP4、SRT、production timeline 与本报告哈希一致，状态可标记为
`delivery-approved`。
