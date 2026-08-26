<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-006/vertical_9x16.mp4",
  "reviewedVideoSha256": "443537e848657a8e7734ff2aeb5a04f03116e333e2da51302ba705f641e02677",
  "reviewedSubtitles": "output/episode-006/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "4ec214bdd18de06fc6b98630326d3c2c63ffb2d4a0332a95135a74eff05baae2",
  "reviewedTimeline": "content/episode-006/production/timeline.json",
  "reviewedTimelineSha256": "7520ff0d1650925180bc8ff7c0118076a9eceb2bbbde255c55d0a82ebe8a7bc9",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 2,
    "microCueRatio": 0.068966,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.844,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Rikyū Delivery Critic Report

审核对象：当前 1080×1920、30 fps 竖版 MP4、SRT、production timeline、TTS
metadata、asset manifest、output inspection，以及有界首帧和关键帧证据。

结论：**PASS**

本报告是 Delivery Critic 成片门，不是 HumanDecision、发布批准或已发布状态。
`episode.config.json` 的 `publishStatus` 仍为 `evaluation`。

## 产物绑定

| 产物 | SHA-256 |
| --- | --- |
| `output/episode-006/vertical_9x16.mp4` | `443537e848657a8e7734ff2aeb5a04f03116e333e2da51302ba705f641e02677` |
| `output/episode-006/subtitles_zh.srt` | `4ec214bdd18de06fc6b98630326d3c2c63ffb2d4a0332a95135a74eff05baae2` |
| `content/episode-006/production/timeline.json` | `7520ff0d1650925180bc8ff7c0118076a9eceb2bbbde255c55d0a82ebe8a7bc9` |
| `output/episode-006/inspection.json` | `5c84215d09195b6d73614cbfcc390e04b5c1a9da6ec8ee04cd4ae7cd1611b896` |
| `content/episode-006/production/tts-metadata.json` | `0183dc8ea0011e582def2865931141992c38e25bb37424cdb2e97ee357754623` |
| `content/episode-006/production/asset-manifest.json` | `24996950363bae6bac83ff110fcfc8169ffb39bd887836923182b0d9010fb05a` |
| `content/episode-006/production/captions.generated.json` | `722b2184edfc0775fc59abe72bc6a427ed05db2f476e8cbef2f020d7d1aef32d` |
| `content/episode-006/story/caption-plan.json` | `c9c271cee8ae52393238eb307b1b632c6dbbe5c2d31be2a326a9ca2d3b9c4e57` |

## 有界媒体证据

| 证据 | SHA-256 | 检查结果 |
| --- | --- | --- |
| `/private/tmp/episode006-review/bounded-0-12-v3.mp4` | `64ff9d7a3f5a3a3276c7bd38aff0876889f7495802a7faaabbb5a74deeb03015` | 12.067 秒，1080×1920、30 fps，含 H.264 视频与 AAC 48 kHz 双声道音轨 |
| `/private/tmp/episode006-review/first-frame-v3.png` | `8353d639dcf92fc1a40517e6e744572901f452b9affc5dc60e1123b176fefd67` | 1080×1920；首屏同时显示 Logo 构造结果、`功能演示 · ITmedia 2026-08-13`、`5,000,000+ 帖子展示 · 不是用户数` 与首句字幕 |
| `/private/tmp/episode006-review/keyframes-grid-v3.png` | `47c013e3cfb48c1f3702b0977b4d593ea86b3df1ded9dc0fba157d0d8a3a29f8` | 关键镜头覆盖产品需求输入、7 名用户、几何功能、10,000+ 披露、用户分享、价格与 MCP；中央证据与底部字幕没有明显遮挡 |

首屏不要求观众先理解 Rikyū 名称：中央是 Logo 构造结果，顶部明确标“功能演示”，
数字卡明确写“帖子展示 · 不是用户数”，首句字幕说明 Logo 正在自己画出来。零背景
观众可在前三秒内识别产品动作与传播口径，`firstFrameZeroContextReadable` 判为 true。

## 字幕检查

- 当前 SRT 共 29 条 cue；小于 1.0 秒的 cue 为 2 条，占比
  `2 / 29 = 0.068966`，低于 0.1 上限。
- 最短 cue 为第 21 条“说过程有趣”，时长 0.844 秒；第 11 条“有一万人来试”为
  0.948 秒。其余 cue 均不低于 1.0 秒。
- 逐 cue 检查未发现中文词组在词中断开；`Rikyū`、`AI`、`Logo`、`ITmedia`、
  `SVG`、`Claude`、`Codex` 等英文或拉丁字母专名均完整保留在单条 cue 内。
- 字幕位于底部安全区；首帧和关键帧网格中未遮住 Logo、7、10,000+、5,000,000+、
  价格卡或 MCP 连线等证据重点。

## 画面与素材边界

- 最终画面为 MediaMix 程序化图形。`asset-rikyu-generated` 已批准并用于 render，
  覆盖本片使用的 Claim；合成产品过程首次出现时标有“功能演示”。
- `asset-rikyu-home-capture` 的 `usedInRender` 为 false；未经独立权利决定的官网截图
  没有进入成片，因此不存在不可辨认、缺来源标签或 manifest 用途不一致的问题。
- 关键帧显示命题变化时证据形态也变化：产品输入、冷启动数字、几何功能、披露数据、
  用户分享、价格和 MCP 分开呈现；结尾的 Logo 过程与 7 → 10,000+、当前价格组合后
  获得收束含义，不是无信息增量的重复填时长。

## 音频机器复核

- ffprobe：AAC LC，48 kHz，双声道，音轨从 0 秒开始，时长 56.7467 秒；视频时长
  57.5667 秒，尾部约 0.82 秒为画面收尾。
- ffmpeg `volumedetect`：平均音量 -17.3 dB，峰值 -1.7 dB，无 0 dBFS 削波证据。
- ffmpeg `silencedetect=noise=-40dB:d=0.5` 检出的主要 1.1–1.26 秒静音位于场景尾部，
  与 timeline 的 scene tail 对齐；未发现跨越整段旁白的异常长静音。
- TTS metadata 显示 8 段均由 MiniMax Speech 生成、无 fallback，provider timestamps
  覆盖全部旁白；timeline 为每段音频保留 0.18/0.9 秒尾部。GUI 播放未作为本次判定
  证据，`speechClippingOrSwallowing: false` 基于音轨完整性、峰值、静音分布和 provider
  时间戳；不声称完成了耳机主观听音。

## 最终复审

| 检查 | 结果 | 当前产物证据 |
| --- | --- | --- |
| 画面规格与时长 | PASS | H.264，1080×1920，30 fps，最终读回 57.5667 秒，位于 40–80 秒范围 |
| 首帧零背景可懂 | PASS | 功能演示、Logo 构造结果、传播口径与首句字幕同屏；核心动作未晚于 3 秒 |
| 中文字幕边界 | PASS | 29 cue，未发现词中断裂；generated captions 与 SRT 文本一致 |
| 英文单词边界 | PASS | 所有英文与拉丁字母专名保持完整 |
| 微 cue | PASS | 2 条，占 6.8966%，最短 0.844 秒，未超过 10% 硬门 |
| 素材与来源 | PASS | render 只使用已批准程序化资产；官网截图明确未进入 render |
| 证据可读性 | PASS | 关键数字、产品动作、价格与 MCP 在 9:16 中可辨认，字幕不遮重点 |
| 音轨技术状态 | PASS | AAC 48 kHz 双声道，峰值 -1.7 dB，无异常长静音或缺失段证据 |
| 结尾兑现 | PASS | 回看几何过程并接到 7 → 10,000+ 与当前价格，无通用 CTA |

本报告只证明上述 hash-bound 成片通过 Delivery Critic 门。未创建 HumanDecision，未发布、
上传或改变 `publishStatus`。
