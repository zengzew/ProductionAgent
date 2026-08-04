<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001-v2-goal3/vertical_9x16.mp4",
  "reviewedVideoSha256": "4c3c189d95575397b34e10043d0dcc8021bba736cae5457750eddee09e9d7cea",
  "reviewedSubtitles": "output/episode-001-v2-goal3/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "c155fdc89e204fda3079648a56ff70df6897bbcfb9f2cf7d6436294063f7444c",
  "reviewedTimeline": "content/episode-001-v2-goal3/production/timeline.json",
  "reviewedTimelineSha256": "96f08c76ecf62bf1be64bb1d82b60db9604505ae0ef52d356c7dd8e0cd70e08f",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.056,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Episode 001 v2 Delivery Critic Report

审核对象：当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、TTS metadata、generated captions，以及最终成片抽帧。结论：**PASS**。

## 产物绑定

| 产物                                                        | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-001-v2-goal3/vertical_9x16.mp4`             | `4c3c189d95575397b34e10043d0dcc8021bba736cae5457750eddee09e9d7cea` |
| `output/episode-001-v2-goal3/subtitles_zh.srt`              | `c155fdc89e204fda3079648a56ff70df6897bbcfb9f2cf7d6436294063f7444c` |
| `content/episode-001-v2-goal3/production/timeline.json`     | `96f08c76ecf62bf1be64bb1d82b60db9604505ae0ef52d356c7dd8e0cd70e08f` |
| `content/episode-001-v2-goal3/production/tts-metadata.json` | `1aaa535f4b48edcd9fbd0377fb264a284f9f78a9308752477c7d5782239ab8d8` |
| `src/episode-001-v2-goal3-captions.generated.json`          | `e0787a376cad036799de6c2d14c2c5cdd4a89639903f9cc11d5be0c6a25ca670` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                                              |
| ---------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| 首帧零背景可懂   | PASS | 第一帧同时出现“已发送”的改会消息、周三 15:00 的已更新日历，并持续标注“功能演示”                           |
| 前 20 秒心智模型 | PASS | 真实 TTS Hook 在 18.228 秒结束，已完成动作、联系人入口、三类能力、1 亿条消息口径与核心问题                |
| 中文字幕语义边界 | PASS | 自动复核 50 个 cue；caption plan 与 generated captions 一致，未检出词组断裂                               |
| 英文单词边界     | PASS | `Poke`、`AI`、`Beta`、`Recipe` 均保持完整                                                                 |
| 微 cue           | PASS | 小于 1.0 秒 0 条，占 0%；最短 1.056 秒                                                                    |
| 字幕安全区       | PASS | 抽查开场、消息规模、用户请求、Recipe、开放节点和结尾，字幕未遮住证据重点                                  |
| 真实页面镜头     | PASS | Recipe 与一般可用节点同期显示 Poke 官方 Release Notes，来源标签和日期可读，并与 asset manifest 一致       |
| 程序化演示边界   | PASS | 日历动作与权限画面均明确标注“功能演示”，没有伪装成真实产品截图                                            |
| 视觉推进         | PASS | 动作结果、入口选择、用户拉动、主动能力、Recipe 和一般可用节点依次增加新信息                               |
| 结尾兑现         | PASS | 回到开场同一句请求和已更新日历，不追加功能清单、未来质疑或互动 CTA                                        |
| 画面规格         | PASS | H.264，1080×1920，30 fps；FFprobe 实测 99.925 秒，严格小于 180 秒                                         |
| 音频技术状态     | PASS | AAC 48 kHz，峰值 -1.2 dBFS；最终混音实测 -14.00 LUFS、LRA 3.30 LU、true peak -1.17 dBFS，无削波或异常截断 |
| 旁白完整性       | PASS | 10 段 TTS 全部生成；缺少 MiniMax 凭据后按配置回退到 `zh-CN-YunjianNeural`                                 |
| 音画与字幕同步   | PASS | 末条字幕结束于 98.652 秒，成片 99.925 秒，末帧结果保留约 1.27 秒                                          |

机器检查覆盖编码读回、峰值、静音区间、字幕时长和词边界；未做耳机环境下的主观听感盲测。该项作为人工发布前抽听的已知剩余风险，不构成当前技术交付 blocker。

本报告只证明当前成片通过交付门禁。留存改善是编辑代理指标，不代替发布后的真实留存、完播、评论或转发数据。
