<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002-v2-goal3/vertical_9x16.mp4",
  "reviewedVideoSha256": "d9ab0386258839c79e3060a8cd7f4329742350c85ae7ad80cbfd532a3c1f4b41",
  "reviewedSubtitles": "output/episode-002-v2-goal3/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "3aad12cbf6a6c5559aa86be34d2bf68a1b5b975aaec358297bc73e9108967ff3",
  "reviewedTimeline": "content/episode-002-v2-goal3/production/timeline.json",
  "reviewedTimelineSha256": "505e7b6ed57f89d75368b667a71820fc63acd4b554e47973514ee61facfc98b8",
  "reviewedInspection": "output/episode-002-v2-goal3/inspection.json",
  "reviewedInspectionSha256": "60e3801f3d6339290308cb53a8f4b132c753cf21f921648bc841d86d46bf525d",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 7,
    "microCueRatio": 0.094595,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.684,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [
    "字幕语义边界 blocker：01:51.477–01:55.772 将“只有你选中的 close friends，才能看到精确位置”拆成三条相邻 cue，修饰语、对象和谓语不能同时读到。",
    "字幕语义边界 blocker：02:09.616–02:14.040 把“注册用户到了三十万”和“开头那只鸟”合进同一 cue，再把“开头那只鸟”的谓语留到下一条，句界和主谓关系被破坏。"
  ],
  "verdict": "REJECT",
  "returnTo": "captions"
}
-->

# Episode 002 v2 Delivery Critic Report

审核对象是本轮新生成的 Roost v2 实际竖版 MP4、SRT、inspection、production timeline、TTS metadata、caption plan、generated captions、asset manifest 与 visual plan。结论：**REJECT，退回 captions**。视频规格、时长、关键证据画面和来源标签通过；字幕语义边界仍命中硬 blocker。

旧版 canonical 报告已在改写前原样归档：

- `production/delivery-critic-report-pre-natural-chinese.md`，SHA-256 `bf9ffd1a8b9ef1415dc2b3710c82c19328a38b6e9a75feef46b88b25741feaee`
- `production/comparison-report-pre-natural-chinese.md`，SHA-256 `4b801652839b5fe58c0665707399281c0be7ebdb68fed297433248e2fb9cc2c3`

## 当前产物绑定

| 产物                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `production/output/vertical_9x16.mp4` | `d9ab0386258839c79e3060a8cd7f4329742350c85ae7ad80cbfd532a3c1f4b41` |
| `production/output/subtitles_zh.srt`  | `3aad12cbf6a6c5559aa86be34d2bf68a1b5b975aaec358297bc73e9108967ff3` |
| `production/output/inspection.json`   | `60e3801f3d6339290308cb53a8f4b132c753cf21f921648bc841d86d46bf525d` |
| `production/timeline.json`            | `505e7b6ed57f89d75368b667a71820fc63acd4b554e47973514ee61facfc98b8` |
| `production/tts-metadata.json`        | `5b7f1c60869f029b7c8df0328438f59f950eec102b5cf634223e4346de2fe46c` |
| `production/asset-manifest.json`      | `6121479bfee39e25c13a132b3ccd1a782acc1a356f52f0c5c41fa45afc295c2b` |
| `story/caption-plan.json`             | `7d01e95f3ed5684f79ec5df33fe1c150b9e5542ab12b1662694b7d08ecf1ebe7` |
| `story/visual-plan.md`                | `574d1408f54cd43f8b8edbd0bc7a01feda074ff4a63a1c83fd295c47c4008905` |

## 实际成片读回

| 检查         | 结果 | 证据                                                                                                              |
| ------------ | ---- | ----------------------------------------------------------------------------------------------------------------- |
| 当前时间轴   | PASS | 12 段共 4094 帧；seg-001 为 0–3.252 秒，seg-012 为 120.576–136.440 秒，确认是本轮 Roost v2 时间轴                 |
| 视频规格     | PASS | H.264，1080×1920，30 fps；FFprobe 实测 136.466667 秒，严格小于 180 秒                                             |
| 音频技术状态 | PASS | AAC 48 kHz 双声道，inspection 峰值 -1.7 dBFS；12 段音频完整，MiniMax 缺少凭据后按配置回退到 `zh-CN-YunjianNeural` |
| 首帧         | PASS | 0.1 秒画面已经显示“这条消息已经发送”、鸟离开起点与“预计三天后到达”，并持续标注“功能演示”                          |
| 前 20 秒     | PASS | 19.356 秒前完成距离、鸟速、地图、伊丽莎白时代英语用户动作、一万到十万阶段数字与唯一问题                           |
| 最终时长     | PASS | 136.466667 秒，留有 43.533333 秒硬门槛余量                                                                        |

机器读回没有发现削波、异常截断或字幕超过成片时长，因此 gate 中 `speechClippingOrSwallowing` 记为 false。本环境不能播放音频输入，未完成耳机环境的主观吞字与音色盲听；这仍是发布前人工抽听风险，不能把机器峰值检查等同于主观听感通过。

## 画面与来源抽查

|           时间 | 画面                                     | 结果                                                                              |
| -------------: | ---------------------------------------- | --------------------------------------------------------------------------------- |
|         0.1 秒 | 已发送状态、三日到达、飞鸟与功能演示标签 | PASS：零背景观众可直接看懂改变后的状态                                            |
|         4.5 秒 | App Store 真实页面                       | PASS：来源标签“真实页面截图 · Apple App Store”可读，字幕未遮住产品证据            |
|        26.5 秒 | 作者试用体验首次出现                     | PASS：画面限定为单一作者体验，媒体与 Roost 来源小字同期出现                       |
|        52.0 秒 | 距离路线与飞鸟位置                       | PASS：路线是 Claim 支持的程序化图形，来源标签可读                                 |
|        65.5 秒 | “那位作者”等待体验回指                   | PASS：明确回到同一个试用作者，没有泛化成所有用户                                  |
|        76.5 秒 | 母亲、女儿与朋友的用户故事               | PASS：人物关系先于增长数字，创始人口径标签同期出现                                |
|       113.0 秒 | 城市级位置、close friends 与 Pen Pals    | 画面 PASS；字幕语义边界 REJECT，见下节                                            |
| 130.5–135.5 秒 | 三十万注册用户与开场飞鸟回收             | 画面 PASS；数据口径、ANSA 日期与来源可读，最后停在鸟继续飞向朋友；字幕句界 REJECT |

asset manifest 中 App Store 和官网截图的 URL、用途、权利依据与 Claim ID 均和画面一致；本片没有真实操作录屏或外部视频素材。所有程序化界面均标注“功能演示”，没有伪装成真实应用截图。

## 字幕硬 blocker

当前 SRT 共 **74** 条 cue；小于 1.0 秒的 cue 为 **7** 条，占 **9.4595%**，最短 **0.684 秒**。比例仍低于 10% 上限，`Roost`、`TechCrunch`、`App Store`、`close friends`、`Pen Pals` 和 `ANSA` 等英文词本身均保持完整。

机械一致性检查得到 `captionWordBreaks = 0`，只说明 caption plan 和 generated captions 使用了同一套切分结果，不能证明切分符合语义合同。人工复审发现：

1. 01:51.477–01:55.772 的 cue 63–65 依次是“只有你选中的” / “close friends” / “才能看到精确位置”。英文词未断，但完整权限语义被拆成修饰语、对象和谓语，观众要等三条才能知道谁能看到什么。按照“不得把主语、谓语、修饰语拆到相邻 cue”的合同，这是 Delivery blocker。
2. 02:09.616–02:14.040 的 cue 73–74 先显示“注册用户到了三十万 开头那只鸟”，再显示“还在地图上朝朋友飞”。它把上一句结尾与下一句主语合并，同时把下一句主谓拆开，破坏片尾兑现的读取顺序。
3. 同类问题并非孤例，例如 00:32.424–00:36.979 将“Roost 最早只是 Mendelsohn 和朋友做的一个业余项目”拆成三条，说明根因在当前 caption plan 与拟合算法的语义边界，而不是渲染丢字。

## 退回要求

退回 `captions`：在不改旁白的前提下，重新规划完整语义单元，优先在同一 cue 内使用最多两行；至少修复权限句、片尾句和其他主谓跨 cue 的位置。随后必须按真实音频重新计算 cue 时间、重建 SRT、重渲竖版视频并重新执行 Delivery Critic。当前报告不批准交付，也不声称发布后真实留存。
