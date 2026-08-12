<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001/vertical_9x16.mp4",
  "reviewedVideoSha256": "207633de6992736d25212f890ee55feb17f54a22a9383e3ddc118e329e74a0ae",
  "reviewedSubtitles": "output/episode-001/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "07adeac0ff517a47de382994b6c60f6774629c4ec6f4e974d393c1a26d5742a1",
  "reviewedTimeline": "content/episode-001/production/timeline.json",
  "reviewedTimelineSha256": "8e14cd40d4813283ccb23a659b14a56980a59f7fcd4d12714ec7e9585a8facec",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.053,
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
| `output/episode-001/vertical_9x16.mp4`             | `207633de6992736d25212f890ee55feb17f54a22a9383e3ddc118e329e74a0ae` |
| `output/episode-001/subtitles_zh.srt`              | `07adeac0ff517a47de382994b6c60f6774629c4ec6f4e974d393c1a26d5742a1` |
| `content/episode-001/production/timeline.json`     | `8e14cd40d4813283ccb23a659b14a56980a59f7fcd4d12714ec7e9585a8facec` |
| `content/episode-001/production/tts-metadata.json` | `8143a52c00cffd9510f75f9c77ace10a2d88e26bb1d3558cdaa860b899b12178` |
| `content/episode-001/story/caption-plan.json`      | `7684e6a926c42d91c2edc15b01b2325c021e658e25156865771e4fc90583cfec` |
| `src/poke-captions.generated.json`                 | `e791604e692d484cd8888ba04f5435c1e52c40bfce8ce2dd0859b6ba8714dfe4` |

## 最终复审

| 检查             | 结果 | 当前产物证据                                                                                                 |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| 首帧零背景可懂   | PASS | 第 0 帧同时出现“已发送”的改会消息和“日历已更新”的周三 15:00 卡片，并标注“功能演示”                           |
| 前 20 秒心智模型 | PASS | 19.956 秒前完成具体动作、消息规模、联系人入口和唯一故事问题                                                  |
| 中文字幕语义边界 | PASS | 自动复核 61 个 cue；caption plan、generated captions 与 SRT 一致，新语义门禁未检出断裂                       |
| 英文单词边界     | PASS | `Poke`、`AI`、`Beta`、`Recipe`、`Cognition` 均保持完整                                                       |
| 微 cue           | PASS | 小于 1.0 秒为 0 条，占比 0；最短 cue 为 1.053 秒                                                             |
| 字幕安全区       | PASS | 抽查 Hook、权限确认、Recipe、消息规模、收购公告和结尾，字幕未遮挡证据重点                                    |
| 真实页面镜头     | PASS | Poke Release Notes 与 Cognition 收购公告首次出现时均在 9:16 中可辨认，来源和日期标签可见，并与 manifest 对应 |
| 视觉推进         | PASS | 完成动作、规模、入口选择、用户请求、权限确认、Recipe、运行代价和收购状态依次增加新信息                       |
| 结尾兑现         | PASS | 结尾回到开场同一句请求和已更新日历，不转去功能清单、未来质疑或互动 CTA                                       |
| 画面规格         | PASS | H.264，1080×1920，30 fps，真实时长 135.744 秒；完整读回无错误                                                |
| 音频技术状态     | PASS | AAC 48 kHz；最终混音实测 -14.19 LUFS、LRA 4.70 LU、true peak -1.15 dBFS，无削波或异常截断                    |
| 旁白完整性       | PASS | 12 段 TTS 全部成功；旁白音频按 `I=-16, TP=-1.5, LRA=7` 归一化；缺少 MiniMax 凭据后按配置回退 Edge            |
| 音画与字幕同步   | PASS | 末条字幕结束于 133.272 秒，成片 135.744 秒；最后完成状态保留约 2.47 秒                                       |

本轮保持旁白、12 段 TTS、事实和视觉结构不变，只合并了 7 处跨 cue 的语义断裂。最终
MP4 逐帧抽查确认人工规划的两行字幕被保留，“人们”“入口”“继续工作”等词组没有再因
自动换行而断开。

## 对旧版的交付差异

旧版第 0 帧只有空白画布、来源小字和字幕，且 180.544 秒触碰了“严格小于 180
秒”的硬门槛。当前版第 0 帧已经发生产品动作，删掉 Apple 日期支线和负面问题式结尾，
把真实时长降到 135.744 秒。中段的真实页面与程序化界面都在强事实首次出现时同步给出，
不再靠后段补交证据。

本报告只证明当前成片通过交付门禁。留存提升结论来自可观察的编辑代理指标，不代替
发布后的真实留存、完播、评论和转发数据。
