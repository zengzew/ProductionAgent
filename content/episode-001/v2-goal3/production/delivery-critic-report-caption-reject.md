<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001-v2-goal3/vertical_9x16.mp4",
  "reviewedVideoSha256": "80fd95bc44d620a23ae03b387c3749604122b5525c66e7c5dc3d2b6f27d4b2cd",
  "reviewedSubtitles": "output/episode-001-v2-goal3/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "76eca0695f20c93423e5aecd23fffd153e7c03fc3d180f596f95f631c49e9274",
  "reviewedTimeline": "content/episode-001-v2-goal3/production/timeline.json",
  "reviewedTimelineSha256": "c9509bbef7e09d47d4031ddbefc4efd93decc6e328d2ef318cd8c4a98eab0600",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.013,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [
    "SRT cue 8-9 将“可它一开始 / 只是邮件工作台”的主谓结构拆到相邻 cue。",
    "SRT cue 24-25 将“这些要求 / 也让 Poke 开始处理更多日常小事”的主谓结构拆到相邻 cue。",
    "SRT cue 30-31 把“授权以后”并入上一句末尾，与它修饰的能力说明分离。",
    "SRT cue 32-33 把转折词“不过”留在上一 cue 末尾，与转折结论分离。"
  ],
  "verdict": "REJECT",
  "returnTo": "captions"
}
-->

# Episode 001 v2 Delivery Critic Report

审核对象是当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、inspection、TTS metadata、caption plan、visual plan、asset manifest，以及首帧、Hook、Recipe、Release Notes 和结尾关键帧。结论：**REJECT，退回 captions**。

编码、时长、音频、画面证据和微字幕指标均通过，但实际成片字幕有四处语义单元被拆开。根据当前字幕合同，每条 cue 必须独立可读，不能把主谓、条件或转折拆到相邻 cue；因此不能把当前状态标记为 `delivery-approved`。

## 产物绑定

| 产物                                                             | SHA-256                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `output/episode-001-v2-goal3/vertical_9x16.mp4`                  | `80fd95bc44d620a23ae03b387c3749604122b5525c66e7c5dc3d2b6f27d4b2cd` |
| `output/episode-001-v2-goal3/subtitles_zh.srt`                   | `76eca0695f20c93423e5aecd23fffd153e7c03fc3d180f596f95f631c49e9274` |
| `content/episode-001-v2-goal3/production/timeline.json`          | `c9509bbef7e09d47d4031ddbefc4efd93decc6e328d2ef318cd8c4a98eab0600` |
| `content/episode-001/v2-goal3/production/output/inspection.json` | `e7dabdf4687ed9239e58959e9d3e56d604b99af525c4d8761b39d6b6d233ee39` |
| `content/episode-001/v2-goal3/production/tts-metadata.json`      | `b55c2ea414f67297a99bf4114ec961193b0bc9694d187262ec61018cb6316fb3` |
| `src/episode-001-v2-goal3-captions.generated.json`               | `4b553bfffebd7a03c99667da2ff4d6fbd9ec022594e6bcb5a4ba9619db62d436` |
| `content/episode-001/v2-goal3/story/caption-plan.json`           | `21d9f0c6d24815ea942eaa70e331d5237bbfc09450274ddc86a72c893dc853d3` |
| `content/episode-001/v2-goal3/story/visual-plan.md`              | `26e7f511e1301f6311a33cd1f7c67b5e5b82b30ad05890b731df155636248e0b` |
| `content/episode-001/v2-goal3/production/asset-manifest.json`    | `b2a1e9d9396f4e8fd33100849389453a6001277b8d6f6ab678ccf6f4a83494df` |

## 独立成片复审

| 检查               | 结果        | 当前产物证据                                                                                                                     |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 首帧零背景可懂     | PASS        | 第一帧已显示“把周三的会改到下午三点”、周三 15:00 的更新结果和“功能演示”，不是只展示动作开端。                                    |
| 前 20 秒心智模型   | PASS        | 3.420–9.180 秒完成联系人入口、读邮件、改日历和提醒；19.800 秒前给出消息口径与核心问题，Hook scene 于 19.980 秒结束。             |
| 中文字幕机器指标   | PASS        | 52 个 cue；小于 1.0 秒 0 个，占 0%；最短 1.013 秒；英文词未断开；caption plan 与 generated captions 没有文件级不一致。           |
| 中文字幕语义边界   | **BLOCKER** | 14.166–17.149 秒拆开“可它一开始 / 只是邮件工作台”；49.384–55.308 秒拆开“这些要求 / 也让 Poke 开始处理更多日常小事”。             |
| 条件与转折边界     | **BLOCKER** | 62.487–65.930 秒把“授权以后”挂在上一句末尾；65.930–69.576 秒把“不过”留在上一 cue，观众要等下一条才得到完整意思。                 |
| 字幕安全区         | PASS        | 抽查首帧、Hook、Beta、授权、Recipe、开放节点和结尾，字幕未遮住主要动作、日期或来源标签。                                         |
| Recipe 证据        | PASS        | 70.476–85.320 秒同时出现 Recipe 结构和 Poke 官方 Release Notes，来源标签“Poke 官方 Release Notes · 真实页面截图”可读。           |
| Release Notes 节点 | PASS        | 85.320–92.844 秒清楚呈现 2026.03.19、候补名单取消与 Recipes 开放，真实页面、来源和日期与 asset manifest 一致。                   |
| 程序化演示边界     | PASS        | 日历动作与权限画面标注“功能演示”，没有伪装成真实应用截图。                                                                       |
| 结尾兑现           | PASS        | 92.844 秒后回到同一句改期请求、Recipe 传播和周三 15:00 的完成状态；没有未来质疑或通用互动 CTA。                                  |
| 画面规格与时长     | PASS        | H.264、1080×1920、30 fps；MP4 实测 109.312 秒，timeline 109.267 秒，严格小于 180 秒。                                            |
| 音频技术状态       | PASS        | AAC 48 kHz；最终混音实测 -14.2 LUFS、LRA 3.2 LU、true peak -1.0 dBFS，未发现削波、异常截断或超过 1.5 秒的非设计静音。            |
| TTS 谱系           | PASS        | 10 段音频齐全；请求 MiniMax，因缺少 `MINIMAX_API_KEY` 按配置回退至 Microsoft Edge `zh-CN-YunjianNeural`，rate 1.25、pitch -2Hz。 |
| 尾部同步           | PASS        | 最后一条字幕于 108.060 秒结束，MP4 于 109.312 秒结束，结果画面保留约 1.252 秒。                                                  |

`captionWordBreaks: 0` 是校验器定义的“caption plan 与 generated captions 不一致数”，不能证明语义切分合格。四处 blocker 已经存在于当前规划经过最短时长拟合后的实际 SRT 中，需要重做 cue 边界并重新生成字幕与时间轴后复审。

机器检查覆盖编码、峰值、静音区间、字幕时长和生成一致性；未做耳机环境下的主观听感盲测。该剩余风险不改变本轮因字幕语义边界而 REJECT 的结论。
