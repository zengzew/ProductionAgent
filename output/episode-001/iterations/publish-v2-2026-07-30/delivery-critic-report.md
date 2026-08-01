<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001/vertical_9x16.mp4",
  "reviewedVideoSha256": "672113aeb631f17c97c5d46d45d3c02d7e7003fdec669ef5298729ac81e4b523",
  "reviewedSubtitles": "output/episode-001/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "5aa0b169df39f66d297d7136b8e87bd02d2eb99a59eca01e5c9ec1ab0c4295bc",
  "reviewedTimeline": "content/episode-001/production/timeline.json",
  "reviewedTimelineSha256": "ceae4ae27e97e0def20c51fa134dab9a7d572491dca05b36e51eb9cd4ebe1fa1",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.025,
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
metadata、generated captions 和关键时间点抽帧
结论：**PASS**

## 产物绑定

| 产物                                               | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-001/vertical_9x16.mp4`             | `672113aeb631f17c97c5d46d45d3c02d7e7003fdec669ef5298729ac81e4b523` |
| `output/episode-001/subtitles_zh.srt`              | `5aa0b169df39f66d297d7136b8e87bd02d2eb99a59eca01e5c9ec1ab0c4295bc` |
| `content/episode-001/production/timeline.json`     | `ceae4ae27e97e0def20c51fa134dab9a7d572491dca05b36e51eb9cd4ebe1fa1` |
| `content/episode-001/production/tts-metadata.json` | `f6c92cd086da1f4e69148d971fad92abb5025d6abe641fb86465478f96cd5911` |
| `src/poke-captions.generated.json`                 | `7ac074e7eb1d231fed8fcd726c99ae32a5e2dffed211cb6b267ff2a40dde5c57` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                                      |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 第 0 帧出现消息气泡“把周三的会改到下午三点”和已更新的日历卡；动作不依赖产品背景                   |
| 前 20 秒心智模型 | PASS | 19.884 秒前完成日历动作、“1 亿+ / 难盈利”冲突、联系人 AI 定义和唯一问题                           |
| 中文字幕语义边界 | PASS | 逐条复核 92 个 cue；完整词组与判断留在同一 cue，没有在词中切断                                    |
| 英文单词边界     | PASS | `Poke`、`AI`、`Beta`、`Recipe`、`Apple Messages for Business`、`Cognition` 均保持完整             |
| 两行字幕可读性   | PASS | 每条最多两行，单行不超过 16 个可见字符；关键时间点抽帧未见横向溢出或底部裁切                      |
| 微 cue           | PASS | 小于 1.0 秒为 0 条，占比 0；最短 cue 为 1.025 秒                                                  |
| SRT 与渲染字幕   | PASS | SRT 与 generated captions 均为 92 条，文本、换行和起止时间无不一致                                |
| 字幕安全区       | PASS | 抽查 Hook、痛点、Beta、权限、Recipe、数据、成本、收购和结尾，字幕均位于竖屏底部安全区             |
| 视觉推进         | PASS | 日历动作、数字对撞、邮箱边界、权限错误、Recipe 实证、调用链、收购公告和结尾回环形成可感知节奏变化 |
| 画面规格         | PASS | H.264，1080×1920，30 fps，时长 180.544 秒；完整解码无错误                                         |
| 音频技术状态     | PASS | AAC 48 kHz 双声道；综合响度 -14.1 LUFS，LRA 3.3 LU，true peak -1.0 dBFS，无削波或异常截断         |
| 旁白完整性       | PASS | 12 段 Edge neural TTS 均成功；分段时长与 production timeline 一致；MiniMax 因缺少凭据按配置回退   |
| 音画与字幕同步   | PASS | 末条字幕结束于 178.080 秒，成片 180.544 秒；最后问题保留约 2.4 秒视觉停留                         |

## 版本对比结论

旧版前三秒是三项功能清单，最强的消息规模与成本冲突要到后半段才出现，画面主要重复
大标题和白色卡片。新版前三秒先发生日历动作，十秒内给出“1 亿+”与“难盈利”，中后段
每个产品动作都在回答同一个问题。视觉和声音节点也随信息转折变化，不再只复述旁白。

当前竖版 MP4、字幕和 production timeline 与本报告哈希一致。首屏理解、Hook 实际
时长、字幕边界、音频技术状态、画面节奏和结尾停留均未命中硬拒绝项。
