<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002/vertical_9x16.mp4",
  "reviewedVideoSha256": "60e5ca73c6530ae832a704dd48048b2c1658e15072c6d6e7c38b8acb2a957a27",
  "reviewedSubtitles": "output/episode-002/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "0511b1ba8f2a630bdb489ed5da92c2113386900666430345f361d6c8d3d7b4e8",
  "reviewedTimeline": "content/episode-002/production/timeline.json",
  "reviewedTimelineSha256": "a3661a9e4fa96622d90a1bcd302a2eda00252bf7a6c9bd048064587bc6a72b7d",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 3,
    "microCueRatio": 0.02521,
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
| `output/episode-002/vertical_9x16.mp4`             | `60e5ca73c6530ae832a704dd48048b2c1658e15072c6d6e7c38b8acb2a957a27` |
| `output/episode-002/subtitles_zh.srt`              | `0511b1ba8f2a630bdb489ed5da92c2113386900666430345f361d6c8d3d7b4e8` |
| `content/episode-002/production/timeline.json`     | `a3661a9e4fa96622d90a1bcd302a2eda00252bf7a6c9bd048064587bc6a72b7d` |
| `content/episode-002/production/tts-metadata.json` | `994e46a2e02040e1b6b2b9cad24057b83707fbc58cd1dc0baa3ac1b5c60dd9f2` |
| `src/episode-002-captions.generated.json`          | `ac099d5d5cbc99ab576ea3b7e960dba80953dc5aba908de9f0f9b8daaf2e39e2` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                 |
| ---------------- | ---- | ---------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 第一帧已显示“周末见·已发送”、离开起点的鸟、三天倒计时和“功能演示”标签        |
| 前 20 秒心智模型 | PASS | Hook 在 19.044 秒结束；App Store、官网、发送代价、增长口径和核心问题依次出现 |
| 中文字幕语义边界 | PASS | 119 个 cue 与人工 caption plan 一致，主谓、专名和英文词没有词中断开          |
| 英文单词边界     | PASS | `Roost`、`App`、`TechCrunch`、`Threads`、`Pen Pals`、`Claude Code` 保持完整  |
| 两行字幕可读性   | PASS | 每条最多两行，每行不超过 16 个可见字符；抽帧未见横向溢出                     |
| 微 cue           | PASS | 小于 1 秒为 3 条，占 2.5210%；低于 10% 上限，最短 0.898 秒                   |
| 字幕安全区       | PASS | Hook、用户压力、地图、增长、商店、安全和结尾抽帧均在底部安全区               |
| 视觉推进         | PASS | 已发送结果、App Store、官网增长、地图、商店、权限面板和结尾回看均有信息增量  |
| 画面规格         | PASS | H.264，1080×1920，30 fps，完整时长 213.267 秒                                |
| 音频技术状态     | PASS | AAC 48 kHz，峰值 -1.7 dB；12 段归一化音频均完整接入，未见削波或异常截断      |
| 音画与字幕同步   | PASS | 时间轴由每段真实 MP3 时长生成；SRT 与渲染使用同一 generated captions         |
| 来源身份         | PASS | 每幕保留来源小字；创始人口径、官方说明、交叉核对与边界标签可见               |

## 人工判断

最新接触表按约 21 秒间隔覆盖全片；另复核 0.25 秒首帧、4.2 秒 App Store、13 秒官网
与增长、68 秒机制、146 秒付费、170 秒安全、190 秒素材选择和 208 秒结尾回看。标题、
真实页面、来源标签与字幕没有互相遮挡。结尾让开场那只鸟再次出现，并停在“谁来画、
多少人愿意付钱、一个月后还会不会回来”，没有转去行业总结或互动 CTA。

当前 MP4、SRT 与 production timeline 和本报告哈希一致，状态可标记为
`delivery-approved`。
