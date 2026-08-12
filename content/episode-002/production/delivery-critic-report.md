<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002/vertical_9x16.mp4",
  "reviewedVideoSha256": "30d45b37ab9cedb92922a77bff4a2acaa02c546ab14c840d86e3da84b4169318",
  "reviewedSubtitles": "output/episode-002/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "be58d09a21ab011fa385faa8a9008fba21c0042a4901c9bb3872ea3932f9ee10",
  "reviewedTimeline": "content/episode-002/production/timeline.json",
  "reviewedTimelineSha256": "bfab0e07963a48876abba6f620aae7424fae58e9302541a9dc5be6347ad44059",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 4,
    "microCueRatio": 0.051282,
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
metadata、generated captions，以及首帧、官网、App Store、用户故事、权限、增长数字和
结尾抽帧。

结论：**PASS**

## 产物绑定

| 产物                                               | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-002/vertical_9x16.mp4`             | `30d45b37ab9cedb92922a77bff4a2acaa02c546ab14c840d86e3da84b4169318` |
| `output/episode-002/subtitles_zh.srt`              | `be58d09a21ab011fa385faa8a9008fba21c0042a4901c9bb3872ea3932f9ee10` |
| `content/episode-002/production/timeline.json`     | `bfab0e07963a48876abba6f620aae7424fae58e9302541a9dc5be6347ad44059` |
| `content/episode-002/production/tts-metadata.json` | `f0567f29bde01e7a75596b154728010e4d890b23a2713bba0732ac6d738c9d31` |
| `content/episode-002/story/caption-plan.json`      | `2149a36d42593c80ed39ee00dc34017d7133471834b83dbd394c8e700bec0787` |
| `src/episode-002-captions.generated.json`          | `3d06775e960fb984db66b677a57319773a2571c318ee6312da0376147dbe0fef` |
| `output/episode-002/inspection.json`               | `806b580154bd1fcff9cc1f15c44a47d015d47a485e2311e4efedecfc4f7c3911` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                              |
| ---------------- | ---- | ------------------------------------------------------------------------- |
| 正向推广口吻     | PASS | 主线围绕慢速送信体验、用户动作、阶段性流量和产品选择展开                  |
| 首帧零背景可懂   | PASS | 第一帧显示消息已发出、鸟已离开起点、三天倒计时和“功能演示”标签            |
| 前 20 秒心智模型 | PASS | Hook 在 19.98 秒结束；App Store、官网、送达规则、增长口径和核心问题已出现 |
| 中文字幕语义边界 | PASS | 78 个 cue 与 caption plan 一致；8 处旧断裂已清零，英文专名保持完整        |
| 两行字幕可读性   | PASS | 每条最多两行；关键抽帧未见横向溢出或证据遮挡                              |
| 微 cue           | PASS | 小于 1 秒为 4 条，占 5.1282%；低于 10% 上限，最短 0.551 秒                |
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

直接从当前 MP4 抽查了 0 秒首帧、5.0 秒 App Store、12.5 秒官网、94.5 秒用户故事、
101.5 秒增长数字、129.5 秒 close friends、133.0 秒 Pen Pals、151.5 秒结尾数据和
163.5 秒开场回收。8 处修复后的条件句、统计句、修饰语和对象均在同一 cue 内完整显示；
关键界面、来源标签与字幕没有互相遮挡，底部安全区和两行上限均成立。无需组件级换行
修复。新版结尾用痛点、流量和赛道信号完成总结，再回到飞行中的鸟，过渡完整。

当前 MP4、SRT、production timeline 与本报告哈希一致，状态可标记为
`delivery-approved`。
