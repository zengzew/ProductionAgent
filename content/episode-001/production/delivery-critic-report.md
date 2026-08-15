<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001/vertical_9x16.mp4",
  "reviewedVideoSha256": "6d8493daebdab714ee1b637f9bf88464c779b7ec6c9bba4062024c4a51ab83d5",
  "reviewedSubtitles": "output/episode-001/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "8cc6cde44b461da0cf6712a196a5bb2459511a91bdac84ea602690b2add9952c",
  "reviewedTimeline": "content/episode-001/production/timeline.json",
  "reviewedTimelineSha256": "4b5e7af7bf87457bbed7a8ba8bd22b2290dbf33660f29f0bb6c096907ac94f6b",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.06,
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
| `output/episode-001/vertical_9x16.mp4`             | `6d8493daebdab714ee1b637f9bf88464c779b7ec6c9bba4062024c4a51ab83d5` |
| `output/episode-001/subtitles_zh.srt`              | `8cc6cde44b461da0cf6712a196a5bb2459511a91bdac84ea602690b2add9952c` |
| `content/episode-001/production/timeline.json`     | `4b5e7af7bf87457bbed7a8ba8bd22b2290dbf33660f29f0bb6c096907ac94f6b` |
| `content/episode-001/production/tts-metadata.json` | `e53a96118ef46230cf5674d29a92459b1fc60c6f4943f406778c61d42fce26f6` |
| `content/episode-001/story/caption-plan.json`      | `943c2699501d48f545cacc1cb5d264fd91ccaf09881cd6ee037c1ea73fda36b0` |
| `src/poke-captions.generated.json`                 | `5d9765ae514cb34f066db4c2b52984b3d6c38ad704d38356de01a9d8d44eedd0` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                                                 |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| 首帧零背景可懂   | PASS | 第 0 帧同时出现“已发送”的改会消息和“日历已更新”的周三 15:00 卡片，并标注“功能演示”                           |
| 前 20 秒心智模型 | PASS | 19.956 秒前完成具体动作、消息规模、联系人入口和唯一故事问题                                                  |
| 中文字幕语义边界 | PASS | 自动复核当前 23 个 cue；caption plan、generated captions 与 SRT 一致，新语义门禁未检出断裂                  |
| 英文单词边界     | PASS | `Poke`、`AI`、`Recipe`、`Cognition` 均保持完整                                                               |
| 微 cue           | PASS | 小于 1.0 秒为 0 条，占比 0；最短 cue 为 1.060 秒                                                             |
| 字幕安全区       | PASS | 抽查 Hook、权限确认、Recipe、消息规模、收购公告和结尾，字幕未遮挡证据重点                                    |
| 真实页面镜头     | PASS | Poke Release Notes 与 Cognition 收购公告首次出现时均在 9:16 中可辨认，来源和日期标签可见，并与 manifest 对应 |
| 视觉推进         | PASS | 完成动作、规模、入口选择、用户请求、权限确认、Recipe、运行代价和收购状态依次增加新信息                       |
| 结尾兑现         | PASS | 结尾回到开场同一句请求和已更新日历，不转去功能清单、未来质疑或互动 CTA                                       |
| 画面规格         | PASS | H.264，1080×1920，30 fps，真实时长 43.648 秒；完整读回无错误                                                 |
| 音频技术状态     | PASS | AAC 48 kHz；最终混音实测 -14.19 LUFS、LRA 4.70 LU、true peak -1.15 dBFS，无削波或异常截断                    |
| 旁白完整性       | PASS | 6 段 TTS 全部成功；旁白音频按 `I=-16, TP=-1.5, LRA=7` 归一化；缺少 MiniMax 凭据后按配置回退 Edge             |
| 音画与字幕同步   | PASS | 末条字幕结束于 41.960 秒，成片 43.648 秒；最后完成状态保留约 1.69 秒                                         |

本轮按当前 60 秒目标重生成 6 段旁白、TTS、时间轴和竖版 MP4。最终 MP4 读回为
43.648 秒，落在 40–80 秒硬契约内；字幕边界、音画同步和首帧动作均通过当前门禁。

## 对旧版的交付差异

旧版第 0 帧只有空白画布、来源小字和字幕，且旧版本明显超过当前 40–80 秒硬门槛。
当前版第 0 帧已经发生产品动作，删掉 Apple 日期支线和负面问题式结尾，把真实时长压到
43.648 秒。中段的程序化界面在产品动作首次出现时同步给出，未改变 legacy source bytes。

本报告只证明当前成片通过交付门禁。留存提升结论来自可观察的编辑代理指标，不代替
发布后的真实留存、完播、评论和转发数据。
