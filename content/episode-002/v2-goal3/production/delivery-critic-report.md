<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-002-v2-goal3/vertical_9x16.mp4",
  "reviewedVideoSha256": "0a8f7f9f14da5eadfcebd15dd9f1ae6ead73cf7b50ea05593599696b69c96579",
  "reviewedSubtitles": "output/episode-002-v2-goal3/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "38b6621f7af8bd8894738e901c07923516b8be0a27dd5e660f9dfa789387b5d9",
  "reviewedTimeline": "content/episode-002-v2-goal3/production/timeline.json",
  "reviewedTimelineSha256": "812ff1ad8ed20eb8b38a40e80766c3fb7c122e68155656203312cec1eb8b09ca",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 2,
    "microCueRatio": 0.042553,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.684,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Episode 002 v2 Delivery Critic Report

审核对象是本轮重新生成的 Roost v2 实际竖版 MP4、SRT、inspection、production timeline、TTS metadata、caption plan、asset manifest 与 visual plan。结论：**PASS**。上一轮的两个字幕语义 blocker 已修复；视频规格、真实时长、首帧、关键证据画面、来源标签、字幕安全区与量化字幕门槛均通过。

本轮更新前的 canonical 报告已原样归档：

- `production/delivery-critic-report-caption-reject.md`，SHA-256 `9101dc3397eb5dc92eebdbfde6ca6b3ba5310f3cca035a1a1b704ba1cccf4042`
- `production/comparison-report-caption-reject.md`，SHA-256 `1aeefb3db6983be074bb5654b0b75880e15b11a6d36ac0826b05695f746ef26d`

## 当前产物绑定

| 产物                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `production/output/vertical_9x16.mp4` | `0a8f7f9f14da5eadfcebd15dd9f1ae6ead73cf7b50ea05593599696b69c96579` |
| `production/output/subtitles_zh.srt`  | `38b6621f7af8bd8894738e901c07923516b8be0a27dd5e660f9dfa789387b5d9` |
| `production/output/inspection.json`   | `6118e91e9ae7ffadbc8337587e42bd4d05c23eeccbe66300eeb71dcf5c7ae699` |
| `production/timeline.json`            | `812ff1ad8ed20eb8b38a40e80766c3fb7c122e68155656203312cec1eb8b09ca` |
| `production/tts-metadata.json`        | `b6b883456bdd168f68fba61177f81894b24d8270607d7168634cd5c551c8ff42` |
| `production/asset-manifest.json`      | `6121479bfee39e25c13a132b3ccd1a782acc1a356f52f0c5c41fa45afc295c2b` |
| `story/caption-plan.json`             | `217e0bb8ff4cf6701742c91032d55c47abaebaa3bc428c9bdbbe84ea1635e875` |
| `story/visual-plan.md`                | `b9ec7338208e7f0a3d6e2aa65f868f83d9ea016cc7da9b223270677ebab8fcef` |

## 实际成片读回

| 检查         | 结果 | 证据                                                                                                     |
| ------------ | ---- | -------------------------------------------------------------------------------------------------------- |
| 当前时间轴   | PASS | 12 段共 4228 帧；seg-001 为 0–3.252 秒，seg-012 为 124.656–140.928 秒，确认是本轮 Roost v2 时间轴        |
| 视频规格     | PASS | H.264，1080×1920，30 fps；FFprobe 实测 140.933333 秒，严格小于 180 秒                                    |
| 音频技术状态 | PASS | AAC 48 kHz 双声道，inspection 峰值 -1.7 dBFS；12 段音频完整，机器检查未见削波、异常截断或成片尾部丢音    |
| 首帧         | PASS | 0.1 秒已显示“这条消息已经发送”、飞鸟离开起点、“预计三天后到达”与“功能演示”，零背景观众能看懂已改变的状态 |
| 前 20 秒     | PASS | 19.356 秒前建立三天送达、地图、伊丽莎白时代英语这一用户动作、阶段数字与唯一故事问题                      |
| 最终时长     | PASS | 140.933333 秒，距离硬门槛仍有 39.066667 秒余量                                                           |

TTS 请求 provider 为 MiniMax；当前环境缺少 `MINIMAX_API_KEY` 后，按 `config/tts-v2.json` 回退到 Edge `zh-CN-YunjianNeural`，rate `+25%`、pitch `-2Hz`，随后按 `I=-16`、`TP=-1.5`、`LRA=7` 归一化。`volumedetect` 的 mean volume 为 -17.9 dB、max volume 为 -1.7 dB；机器读回支持 `speechClippingOrSwallowing = false`。本环境不能完成耳机主观盲听，因此发布前仍应人工抽听音色、吞字和口语节奏；这项残余风险不构成本轮机器交付 blocker。

## 字幕复审

当前 SRT 共 **47** 条 cue。小于 1.0 秒的只有 cue 2（0.684 秒，“没有卡住”）和 cue 39（0.909 秒，“默认情况下”），占 **4.2553%**，低于 10% 上限；最短 cue 为 **0.684 秒**。`Roost`、`Mendelsohn`、`App Store`、`TechCrunch`、`Pen Pals` 等英文单词均保持完整。

上一轮 blocker 的修复读回如下：

1. 01:56.243–01:59.518 的 cue 41 以同一条两行字幕完整显示“只有你选中的亲密好友 / 才能看到精确位置”，修饰语、对象和谓语不再跨 cue。
2. 02:12.781–02:15.754 的 cue 46 完整显示“到7月10日 / 注册用户到了三十万”；02:15.754–02:18.528 的 cue 47 再完整显示“开头那只鸟 / 还在地图上朝朋友飞”。数据句与结尾主谓句各自成立。
3. seg-005 的“Roost 最早只是个业余项目”与“是 Mendelsohn 和朋友一起做的”已改成两个可独立读取的语义单位；seg-008 的用户故事、等待仪式和三日增长也没有主谓或英文词跨 cue。

字幕拼接与旁白逐字一致，片段末尾标点已去除；抽查画面未发现字幕越过安全区或遮住关键产品动作、数字和来源标签。

## 画面、来源与权利抽查

| 时间     | 画面                                     | 结果                                                             |
| -------- | ---------------------------------------- | ---------------------------------------------------------------- |
| 0.1 秒   | 已发送状态、三日到达、飞鸟与功能演示标签 | PASS：第一帧给出已发生结果，字幕处于安全区                       |
| 4.5 秒   | App Store 真实页面                       | PASS：“真实页面截图 · Apple App Store”可读，关键界面未被字幕遮挡 |
| 27.0 秒  | 作者试用体验首次出现                     | PASS：作者身份、媒体来源和单一体验边界同期出现                   |
| 38.5 秒  | Roost 起源与作者关系                     | PASS：人物和项目关系用 Claim 支持图形呈现，不补写动机            |
| 54.0 秒  | 距离路线与飞鸟位置                       | PASS：路线与速度规则可见，程序化图形保持“功能演示”边界           |
| 68.5 秒  | 同一作者的等待体验回指                   | PASS：没有把单一作者体验泛化成所有用户                           |
| 80.5 秒  | 母亲、女儿与朋友的用户故事               | PASS：人物关系、伊丽莎白时代英语与三日增长按创始人口径呈现       |
| 117.5 秒 | 城市级位置、亲密好友与 Pen Pals          | PASS：精确位置权限句完整显示，官方来源标签可读                   |
| 133.8 秒 | 三十万注册用户与 ANSA 7/10 证据卡        | PASS：数字、统计日期和来源同期出现                               |
| 139.2 秒 | 开场飞鸟回收                             | PASS：最后停在仍朝朋友飞的具体产品状态，没有通用 CTA 或未来质疑  |

asset manifest 中 App Store 与官网截图的来源 URL、捕获日期、权利主体、用途和 Claim ID 均与画面一致；本片没有需要复审的真实操作录屏或外部视频素材。程序化界面均保留“功能演示”或具体来源身份，没有伪装成真实应用截图。

有两个不影响交付的画面润色项：部分镜头的底部通用来源 footer 在字幕显示时会被局部遮住，但同镜头上方已有可读的具体来源标签，片段留白时 footer 也能完整出现；结尾顶部小标题因换行显示为“ANSA 7”，但中央主证据卡完整显示“ANSA 7/10”。二者均未造成事实、来源或关键证据丢失。

## 结论

上一轮 close-friends 权限句和结尾主谓句 blocker 已被当前 47-cue SRT 与重渲 MP4 实质修复。当前成片通过 Delivery Critic，可标记为 `delivery-approved`。该结论只覆盖合同、机器读回与独立编辑抽查，不代表发布后的真实留存或完播表现。
