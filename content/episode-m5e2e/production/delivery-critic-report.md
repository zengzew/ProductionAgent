<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-m5e2e/vertical_9x16.mp4",
  "reviewedVideoSha256": "709afc3b99783fb81cb457f449c2e4377caf508bf5f69ac956388d098b3d68de",
  "reviewedSubtitles": "output/episode-m5e2e/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "8b46f6dd8b81bbd1cc8fc657c3e1de3c37015ddab3c6b05a216523e036b0f7bc",
  "reviewedTimeline": "content/episode-m5e2e/production/timeline.json",
  "reviewedTimelineSha256": "bda98ec75de1a09779707f94d425f1bdc9d6af909f886edc23140759610213c6",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.188,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# M5 E2E Delivery Critic Report

审核对象：`episode-m5e2e` 1080×1920、30 fps 竖版 MP4（MediaMixVertical 通用
real-media 合成）、SRT、production timeline、TTS metadata、generated captions
和 output inspection 读回
结论：**PASS**

本报告是 M5 exit acceptance 的成片门证据，不代表公开发布。

## 产物绑定

| 产物                                                | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-m5e2e/vertical_9x16.mp4`                  | `709afc3b99783fb81cb457f449c2e4377caf508bf5f69ac956388d098b3d68de` |
| `output/episode-m5e2e/subtitles_zh.srt`                   | `8b46f6dd8b81bbd1cc8fc657c3e1de3c37015ddab3c6b05a216523e036b0f7bc` |
| `content/episode-m5e2e/production/timeline.json`          | `bda98ec75de1a09779707f94d425f1bdc9d6af909f886edc23140759610213c6` |
| `content/episode-m5e2e/production/tts-metadata.json`      | `322eaea57bd05071e13eb922e34b27e382e514873292c5da812187bef1c5df17` |
| `content/episode-m5e2e/story/caption-plan.json`           | `f64950ef748f1279057ed0ba321dcd9c2c71da620b0e9b00ecd1fd3751b49723` |
| `src/episode-m5e2e-captions.generated.json`               | `f4c6e6fd78d3fa084d9ab7c54bbdff333527613777e20dd1e67bbf5226db0d92` |

## 最终复审

| 检查             | 结果 | 当前产物证据 |
| ---------------- | ---- | ------------ |
| 首帧零背景可懂   | PASS | 第 0 帧为真实媒体镜头（fixture 主界面演示），来源标签可见 |
| 画面规格         | PASS | H.264，1080×1920，30 fps，真实时长 42.8 秒；完整读回无错误 |
| 中文字幕语义边界 | PASS | 19 个 cue；caption plan、generated captions 与 SRT 一致，语义门禁未检出断裂 |
| 英文单词边界     | PASS | 无英文单词断裂 |
| 微 cue           | PASS | 小于 1.0 秒为 0 条，占比 0；最短 cue 为 1.188 秒 |
| 真实媒体镜头     | PASS | seg-001 为 verified real-media shot，来源标签与 badge 显示真实画面 |
| 语音清晰度       | PASS | 读回 peak -4.1 dB，无削波或吞音 |

