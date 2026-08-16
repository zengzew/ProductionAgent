<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-003/vertical_9x16.mp4",
  "reviewedVideoSha256": "f4778d09f9bf1260a8f373ffb6e92c823e3429ec85d9dedfe675b53e56c8c094",
  "reviewedSubtitles": "output/episode-003/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "cd62f0b5fed2662e67cb64d3c3723fdca71ebc5bc4e67f4877cec872dae61252",
  "reviewedTimeline": "content/episode-003/production/timeline.json",
  "reviewedTimelineSha256": "9e7aa6eb5afb61f65fe9868a8d0466e21dcc43ca663e493d0dc34c5fcebf6938",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.062,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Manus Delivery Critic Report

审核对象：当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、TTS
metadata、generated captions 和关键时间点抽帧
结论：**PASS**

本报告是 Delivery Critic 成片门，不是 HumanDecision、final approval 或 published
状态。`episode.config.json` 的 `publishStatus` 仍为 `evaluation`。

## 产物绑定

| 产物                                               | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-003/vertical_9x16.mp4`             | `f4778d09f9bf1260a8f373ffb6e92c823e3429ec85d9dedfe675b53e56c8c094` |
| `output/episode-003/subtitles_zh.srt`              | `cd62f0b5fed2662e67cb64d3c3723fdca71ebc5bc4e67f4877cec872dae61252` |
| `content/episode-003/production/timeline.json`     | `9e7aa6eb5afb61f65fe9868a8d0466e21dcc43ca663e493d0dc34c5fcebf6938` |
| `content/episode-003/production/tts-metadata.json` | `935453d292c922d9d9b55d65c5d56c6945f6e85f5816162ed361eaa5bfb77668` |
| `content/episode-003/story/caption-plan.json`      | `384691ad80acde3156e7defda4cee5bd37ee17dd75fbe17403f6988a9fd99972` |
| `src/episode-003-captions.generated.json`          | `b3664b97343ba3dc0bb10c41a2d2983dee4f677319e5bfae638e7fd669ee6024` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                 |
| ---------------- | ---- | ---------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 第 0 帧同时出现“任务已发出”、已发送任务气泡、已打开的浏览器窗，并标注“功能演示” |
| 前 20 秒心智模型 | PASS | Hook 真实音频在 19.500 秒结束，完成动作、虚拟电脑规模、云电脑和唯一问题       |
| 中文字幕语义边界 | PASS | 23 个 cue；caption plan、generated captions 与 SRT 一致，语义门禁未检出断裂  |
| 英文单词边界     | PASS | `Manus`、`AI`、`agent` 均保持完整                                            |
| 微 cue           | PASS | 小于 1.0 秒为 0 条，占比 0；最短 cue 为 1.062 秒                             |
| 字幕安全区       | PASS | 抽查 Hook、官网、桌面页和结尾，字幕未遮挡任务气泡、来源标签或批准按钮        |
| 真实页面镜头     | PASS | 官网与桌面页首次出现时均可辨认，标“真实页面截图”和来源，并与 manifest 对应   |
| 视觉推进         | PASS | 完成动作、规模、云电脑、执行引擎、桌面批准和回收依次增加新信息               |
| 结尾兑现         | PASS | 结尾回到开场同一条任务和仍在打开的网页，不转去收购、独立化或互动 CTA         |
| 画面规格         | PASS | H.264，1080×1920，30 fps，真实时长 46.867 秒；完整读回无错误                 |
| 音频技术状态     | PASS | AAC 48 kHz；实测峰值 -1.7 dB，无削波；6 段 TTS 均生成并按 loudnorm 归一化    |
| 旁白完整性       | PASS | 请求 MiniMax，缺少 `MINIMAX_API_KEY` 后回退 Edge `zh-CN-YunjianNeural` +25%  |
| 音画与字幕同步   | PASS | 末条字幕结束于 45.036 秒，成片 46.867 秒；最后完成状态保留约 1.83 秒         |

听感说明：未做人工耳机听感评分。技术检查覆盖全段有声、无削波、字幕与时间轴对齐。
若后续人工听感发现吞字，应退回 `tts`，不能用本报告代替听感终审。

本报告只证明当前成片通过交付门禁。evaluation run 不写入 HumanDecision，也不发布。
