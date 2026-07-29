<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001/vertical_9x16.mp4",
  "reviewedVideoSha256": "cd502c2001b426c78d37ef04969bfc03c52eba6e3ca796f3603074424f400376",
  "reviewedSubtitles": "output/episode-001/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "7475b9ef7799864ae3d65e77a093c72e3b5eac51ec1c31d5e5368b3347133da5",
  "reviewedTimeline": "content/episode-001/production/timeline.json",
  "reviewedTimelineSha256": "e7a7730cee254f4daf99f135ac57ef8e38e7fc52ec7301fcdc3fbab5db31200c",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.357,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Poke Delivery Critic Report

审核对象：当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、TTS
metadata 和 generated captions
结论：**PASS**

## 产物绑定

| 产物                                               | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-001/vertical_9x16.mp4`             | `cd502c2001b426c78d37ef04969bfc03c52eba6e3ca796f3603074424f400376` |
| `output/episode-001/subtitles_zh.srt`              | `7475b9ef7799864ae3d65e77a093c72e3b5eac51ec1c31d5e5368b3347133da5` |
| `content/episode-001/production/timeline.json`     | `e7a7730cee254f4daf99f135ac57ef8e38e7fc52ec7301fcdc3fbab5db31200c` |
| `content/episode-001/production/tts-metadata.json` | `f858517b88ca73132b8fe694800dd191001d14063dccebc7ff9a5315748be284` |
| `src/poke-captions.generated.json`                 | `bba529e57835a6e6d3e7a4d0f1e1a5b18571c1fe49b2ec6597df0d15c2a225d5` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                                                  |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 第 0 帧直接显示“提醒吃药、问球赛结果、出门前看天气”；核心动作没有晚于第 3 秒                                  |
| 前 20 秒心智模型 | PASS | 19.228 秒前完成动作、Poke 联系人入口定义和邮件/日历权限问题                                                   |
| 中文字幕语义边界 | PASS | 逐条复核 62 个 cue；完整词组与判断均留在同一 cue，未跨时间切换                                                |
| 英文单词边界     | PASS | `Poke`、`AI`、`App`、`Beta`、`Recipe`、`Cognition`、`TechCrunch` 均保持完整                                   |
| 两行字幕可读性   | PASS | 最多两行；单行最长 18 个字符；抽帧确认没有横向溢出或被底部裁切                                                |
| 微 cue           | PASS | 小于 1.0 秒为 0 条，占比 0；最短 cue 为 1.357 秒                                                              |
| SRT 与渲染字幕   | PASS | SRT 与 generated captions 均为 62 条，文本、换行和起止时间无不一致                                            |
| 字幕安全区       | PASS | 抽查 0、1、2.8、12、15、19、40、65、90、110、128.5、135、145、155、170、180、184 秒，字幕均位于竖屏底部安全区 |
| 画面规格         | PASS | H.264，1080×1920，30 fps，时长 185.4 秒；完整解码无错误                                                       |
| 音频技术状态     | PASS | AAC 48 kHz 双声道；峰值 -1.7 dBFS；无削波、异常截短、NaN 或 Inf                                               |
| 旁白听审         | PASS | 完整旁白没有吞字、异常连读或非预期停顿；分段间停顿与 12 段 production timeline 一致                           |
| 音画与字幕同步   | PASS | SRT 末条结束于 185.05 秒，成片尾部保留 0.35 秒；未发现明显音画或字幕错位                                      |

## 结论

当前竖版 MP4、字幕和 production timeline 与本报告哈希一致。首屏理解、中文与英文
边界、微 cue、两行可读性、字幕安全区、旁白完整性和音画同步均未命中硬拒绝项。
本轮无需退回生产环节。
