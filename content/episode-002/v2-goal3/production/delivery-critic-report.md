<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002-v2-goal3/vertical_9x16.mp4",
  "reviewedVideoSha256": "afc12da77fc39908f4d1f8e004990f124a8187431ee9cdb390ede33fd049f1aa",
  "reviewedSubtitles": "output/episode-002-v2-goal3/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "83d8d94c336dfcc46ca2029ee213a6ed4b0f0092e3f0331f80d74928f7125592",
  "reviewedTimeline": "content/episode-002-v2-goal3/production/timeline.json",
  "reviewedTimelineSha256": "1369e6aaa877ac3c495141179cecda1420fb2eb4d067b5c601fb2914019ff577",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 5,
    "microCueRatio": 0.076923,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.737,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Episode 002 v2 Delivery Critic Report

审核对象：当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、TTS metadata、generated captions，以及最终成片抽帧。结论：**PASS**。

## 产物绑定

| 产物                                                        | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-002-v2-goal3/vertical_9x16.mp4`             | `afc12da77fc39908f4d1f8e004990f124a8187431ee9cdb390ede33fd049f1aa` |
| `output/episode-002-v2-goal3/subtitles_zh.srt`              | `83d8d94c336dfcc46ca2029ee213a6ed4b0f0092e3f0331f80d74928f7125592` |
| `content/episode-002-v2-goal3/production/timeline.json`     | `1369e6aaa877ac3c495141179cecda1420fb2eb4d067b5c601fb2914019ff577` |
| `content/episode-002-v2-goal3/production/tts-metadata.json` | `4d76f2c7a99114c0f8cb2df15b00d837852745737fb89943d7a5261e9f0b2e55` |
| `src/episode-002-v2-goal3-captions.generated.json`          | `6c7fa9e45a4d3a1c3d25c09722b4f9bcb4870dfe0f15290d046319fd1b5ff7fc` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                                              |
| ---------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 第一帧显示消息已发出、鸟已离开起点和预计三天后到达，并标注“功能演示”                                      |
| 前 20 秒心智模型 | PASS | 真实 TTS Hook 在 17.868 秒结束，已解释鸟速、距离、路线、用户行为与三日增长，并提出“等待为什么值得”        |
| 中文字幕语义边界 | PASS | 自动复核 65 个 cue；“按距离”在同一 cue 内换行，caption plan 与 generated captions 一致，未检出词组断裂    |
| 英文单词边界     | PASS | `Roost`、`Threads`、`Pen Pals`、`ANSA` 均保持完整                                                         |
| 微 cue           | PASS | 小于 1.0 秒 5 条，占 7.6923%；最短 0.737 秒，低于 10% 上限                                                |
| 字幕安全区       | PASS | 抽查开场、上架、路线、用户故事、商店、隐私和结尾，字幕未遮住证据重点                                      |
| 官网与应用截图   | PASS | 首个产品心智模型使用 App Store 真实页面；来源标签可读，并与 asset manifest 一致                           |
| 程序化演示边界   | PASS | 发送与飞行路线画面明确标注“功能演示”，没有伪装成真实应用界面                                              |
| 事实画面同步     | PASS | 路线、训练、增长、支持者订阅、城市级位置和 30 万注册用户均在对应旁白首次出现时给出来源或 Claim 支持图形   |
| v1 文案泄漏复检  | PASS | 已移除无 Claim 支持的“剩余时间”、鸟种速度、价格、10 万结尾数字和“市场信号”标签                            |
| 结尾兑现         | PASS | 回到开场那只鸟仍在地图上飞向朋友，停在“回复不用马上来”的产品价值上                                        |
| 画面规格         | PASS | H.264，1080×1920，30 fps；FFprobe 实测 127.300 秒，严格小于 180 秒                                        |
| 音频技术状态     | PASS | AAC 48 kHz，峰值 -1.7 dBFS；最终混音实测 -14.36 LUFS、LRA 3.90 LU、true peak -1.70 dBFS，无削波或异常截断 |
| 旁白完整性       | PASS | 12 段 TTS 全部生成；缺少 MiniMax 凭据后按配置回退到 `zh-CN-YunjianNeural`                                 |
| 音画与字幕同步   | PASS | 末条字幕结束于 124.872 秒，成片 127.300 秒，末帧结果保留约 2.43 秒                                        |

机器检查覆盖编码读回、峰值、静音区间、字幕时长和词边界；未做耳机环境下的主观听感盲测。该项作为人工发布前抽听的已知剩余风险，不构成当前技术交付 blocker。

本报告只证明当前成片通过交付门禁。留存改善是编辑代理指标，不代替发布后的真实留存、完播、评论或转发数据。
