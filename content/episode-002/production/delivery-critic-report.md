<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002/vertical_9x16.mp4",
  "reviewedVideoSha256": "a43d02ff92f4068bb3bc8f59b0349093990898d8e7d551b368fb8b0fa7c885d2",
  "reviewedSubtitles": "output/episode-002/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "79742289b69c7c6254f6d817fe40f23a659ed97874a2135e85e680f9efc46d67",
  "reviewedTimeline": "content/episode-002/production/timeline.json",
  "reviewedTimelineSha256": "711aecece346d4abbc6b6453a7b7c91be3773b598e508c8a51cddd5b5282b4c2",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 3,
    "microCueRatio": 0.025862,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.898,
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
metadata、generated captions、烟测抽帧与十个关键时间点接触表

结论：**PASS**

## 产物绑定

| 产物                                               | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-002/vertical_9x16.mp4`             | `a43d02ff92f4068bb3bc8f59b0349093990898d8e7d551b368fb8b0fa7c885d2` |
| `output/episode-002/subtitles_zh.srt`              | `79742289b69c7c6254f6d817fe40f23a659ed97874a2135e85e680f9efc46d67` |
| `content/episode-002/production/timeline.json`     | `711aecece346d4abbc6b6453a7b7c91be3773b598e508c8a51cddd5b5282b4c2` |
| `content/episode-002/production/tts-metadata.json` | `5316ae049917e3a4a77cde13d65198c54b5197752a4d6d9c192211bf47fd02e0` |
| `src/episode-002-captions.generated.json`          | `ff9089f2163ea893d600a8f559c0be60a9abebb6ba4cc662f83bf0b67911185f` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                |
| ---------------- | ---- | --------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 输入框出现“周末见”，发送按钮、飞行路线和“三天后到达”同时可见                |
| 前 20 秒心智模型 | PASS | 真实 Hook 在 17.892 秒结束，完成鸟速送达、三日增长和“为什么有人偏要等”      |
| 中文字幕语义边界 | PASS | 116 个 cue 与人工 caption plan 一致，主谓、专名和英文词没有词中断开         |
| 英文单词边界     | PASS | `Roost`、`App`、`TechCrunch`、`Threads`、`Pen Pals`、`Claude Code` 保持完整 |
| 两行字幕可读性   | PASS | 每条最多两行，每行不超过 16 个可见字符；抽帧未见横向溢出                    |
| 微 cue           | PASS | 小于 1 秒为 3 条，占 2.5862%；低于 10% 上限，最短 0.898 秒                  |
| 字幕安全区       | PASS | Hook、用户压力、地图、增长、商店、安全和结尾抽帧均在底部安全区              |
| 视觉推进         | PASS | 通知快切、官网实拍页、飞行地图、App Store 应用截图、商店和权限面板均有变化  |
| 画面规格         | PASS | H.264，1080×1920，30 fps，完整时长 208.567 秒                               |
| 音频技术状态     | PASS | AAC 48 kHz，峰值 -1.7 dB；12 段归一化音频均完整接入，未见削波或异常截断     |
| 音画与字幕同步   | PASS | 时间轴由每段真实 MP3 时长生成；SRT 与渲染使用同一 generated captions        |
| 来源身份         | PASS | 每幕保留来源小字；创始人口径、官方说明、交叉核对与边界标签可见              |

## 人工判断

十个关键时间点接触表覆盖 25、45、65、85、105、125、145、165、185 和 202 秒。
另复核 12.5 秒官网截图和 64 秒 App Store 应用截图。标题、截图、来源小字与字幕没有
互相遮挡。最后一幕停在“谁来画、谁愿意付钱、一个月后还会不会回来”，兑现开场
问题，没有转去行业总结。

当前 MP4、SRT 与 production timeline 和本报告哈希一致，状态可标记为
`delivery-approved`。
