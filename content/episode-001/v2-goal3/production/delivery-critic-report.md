<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001-v2-goal3/vertical_9x16.mp4",
  "reviewedVideoSha256": "114f324f2563f98b2bf5a4c7c4b765ca00e28aea92127c44d9c0305d118504c0",
  "reviewedSubtitles": "output/episode-001-v2-goal3/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "f5d364a2d306e71dd7d0bbbed2e79ebf7644d10bed5d86e96d1e27ea27ffdd08",
  "reviewedTimeline": "content/episode-001-v2-goal3/production/timeline.json",
  "reviewedTimelineSha256": "44379cabb4c007be8f1c2f307c96c22742880f02d623ffd6118a75060a45388b",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 1,
    "microCueRatio": 0.019608,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.994,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Episode 001 v2 Delivery Critic Report

审核对象是当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、inspection、TTS metadata、caption plan、visual plan、asset manifest，以及首帧、Hook、Recipe、Release Notes 和结尾关键帧。结论：**PASS**。

上一轮四处字幕语义 blocker 已在当前 SRT 与成片画面中修复。主谓、条件和转折现在保留在同一 cue；编码、时长、音频、证据画面、来源标签和字幕安全区同时通过，可以标记为 `delivery-approved`。

## 产物绑定

| 产物                                                             | SHA-256                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-001-v2-goal3/vertical_9x16.mp4`                  | `114f324f2563f98b2bf5a4c7c4b765ca00e28aea92127c44d9c0305d118504c0` |
| `output/episode-001-v2-goal3/subtitles_zh.srt`                   | `f5d364a2d306e71dd7d0bbbed2e79ebf7644d10bed5d86e96d1e27ea27ffdd08` |
| `content/episode-001-v2-goal3/production/timeline.json`          | `44379cabb4c007be8f1c2f307c96c22742880f02d623ffd6118a75060a45388b` |
| `content/episode-001/v2-goal3/production/output/inspection.json` | `4096c4d6f2465f5900450fbb348fb0e996a55f4a15858435f3e869e4c735c921` |
| `content/episode-001/v2-goal3/production/tts-metadata.json`      | `b55c2ea414f67297a99bf4114ec961193b0bc9694d187262ec61018cb6316fb3` |
| `src/episode-001-v2-goal3-captions.generated.json`               | `5e974a0155f2e378431049246652b82adc2910a60f579b31b501a0c010a163f2` |
| `content/episode-001/v2-goal3/story/caption-plan.json`           | `f35abb46a370e4f90f038feb3a8cb3b9ed33b645c49de67f2fd6b87d116abab8` |
| `content/episode-001/v2-goal3/story/visual-plan.md`              | `26e7f511e1301f6311a33cd1f7c67b5e5b82b30ad05890b731df155636248e0b` |
| `content/episode-001/v2-goal3/production/asset-manifest.json`    | `b2a1e9d9396f4e8fd33100849389453a6001277b8d6f6ab678ccf6f4a83494df` |

## 独立成片复审

| 检查               | 结果 | 当前产物证据                                                                                                                           |
| ------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 首帧零背景可懂     | PASS | 第一帧显示已发送的改期请求、周三 15:00 的完成结果和“功能演示”，字幕完整且不遮挡动作。                                                  |
| 前 20 秒心智模型   | PASS | 3.420–9.180 秒完成联系人入口、读邮件、改日历和提醒；19.800 秒前给出消息口径与核心问题，Hook scene 于 19.980 秒结束。                   |
| 中文字幕机器指标   | PASS | 51 个 cue；小于 1.0 秒 1 个，占 1.9608%，低于 10% 上限；最短 cue 0.994 秒；英文词未断开；caption plan 与 generated captions 无不一致。 |
| Hook 语义边界      | PASS | cue 8 单独保留“一亿多条消息”；cue 9 在同一显示片段内完整呈现“可它一开始 / 只是邮件工作台”。                                            |
| 用户请求语义边界   | PASS | cue 25 在同一显示片段内完整呈现“这些要求也让 Poke / 开始处理更多日常小事”。                                                            |
| 条件与转折边界     | PASS | cue 30 同时显示“授权以后 / 它能读邮件、改日历”；cue 32 同时显示“不过结果还得 / 由你自己核对”。                                         |
| 字幕安全区         | PASS | 抽查首帧、修复后的四处 cue、Recipe、开放节点和结尾；两行字幕均处于安全区，没有遮住主要动作、日期或来源标签。                           |
| Recipe 证据        | PASS | 70.476–85.320 秒同时出现 Recipe 结构和 Poke 官方 Release Notes，来源标签“Poke 官方 Release Notes · 真实页面截图”可读。                 |
| Release Notes 节点 | PASS | 85.320–92.844 秒清楚呈现 2026.03.19、候补名单取消与 Recipes 开放，真实页面、来源和日期与 asset manifest 一致。                         |
| 程序化演示边界     | PASS | 日历动作与权限画面标注“功能演示”，没有伪装成真实应用截图。                                                                             |
| 结尾兑现           | PASS | 92.844 秒后回到同一句改期请求、Recipe 传播和周三 15:00 的完成状态；没有未来质疑或通用互动 CTA。                                        |
| 画面规格与时长     | PASS | H.264、1080×1920、30 fps；MP4 实测 109.312 秒，timeline 109.267 秒，严格小于 180 秒。                                                  |
| 音频技术状态       | PASS | AAC 48 kHz；最终混音实测 -14.2 LUFS、LRA 3.2 LU、true peak -1.0 dBFS，没有削波或异常截断。                                             |
| TTS 谱系           | PASS | 10 段音频齐全；请求 MiniMax，因缺少 `MINIMAX_API_KEY` 按配置回退至 Microsoft Edge `zh-CN-YunjianNeural`，rate 1.25、pitch -2Hz。       |
| 尾部同步           | PASS | 最后一条字幕于 108.060 秒结束，MP4 于 109.312 秒结束，结果画面保留约 1.252 秒。                                                        |

`captionWordBreaks: 0` 是校验器定义的 caption plan 与 generated captions 不一致数；本轮还独立读取了实际 SRT 并抽取相应成片帧，确认上一轮四处人工语义 blocker 均已消失。唯一小于 1 秒的 cue 为 0.994 秒，整体占比 1.9608%，不触发交付硬门槛。

机器检查覆盖编码、峰值、字幕时长、生成一致性和实际关键帧；未做耳机环境下的主观听感盲测。该项保留为人工发布前抽听风险，不构成本轮技术交付 blocker。
