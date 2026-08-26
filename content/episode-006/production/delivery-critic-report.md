<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-006/vertical_9x16.mp4",
  "reviewedVideoSha256": "b761f2217928fe6349f76bcda9c4ead967c35ee6170af94f6de2aa61cd5bccb8",
  "reviewedSubtitles": "output/episode-006/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "e6666442d942eabfe545e7656ad792de85f954d962a378e3cfbf2b44431a4970",
  "reviewedTimeline": "content/episode-006/production/timeline.json",
  "reviewedTimelineSha256": "da93cf8cc2ad828cfa0eccbd46145576a4d0c90b6812c4e1ad7e350cf3b0d4ce",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.004,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Rikyū Delivery Critic Report

审核角色：Codex 5.6 Capability Gate。结论：**PASS**。本报告只批准下面 hash-bound 的本地成片，不代表 HumanDecision、发布或上线。

## 产物绑定

| 产物 | SHA-256 |
| --- | --- |
| `output/episode-006/vertical_9x16.mp4` | `b761f2217928fe6349f76bcda9c4ead967c35ee6170af94f6de2aa61cd5bccb8` |
| `output/episode-006/subtitles_zh.srt` | `e6666442d942eabfe545e7656ad792de85f954d962a378e3cfbf2b44431a4970` |
| `content/episode-006/production/timeline.json` | `da93cf8cc2ad828cfa0eccbd46145576a4d0c90b6812c4e1ad7e350cf3b0d4ce` |
| `output/episode-006/inspection.json` | `f0ec95d921a9e85e5958565e3c0eb3d24c9d4e88ba4998bedb519ae1ed7f056f` |
| `content/episode-006/media/render-plan.json` | `0cea070cf5eba8e31546e51b7079cc0e4ecf6471c715cb755c4767bc7a9034a1` |
| `content/episode-006/production/asset-manifest.json` | `b509ccf569986406af7e3b28504817cff393e3d3140d1ef61ca1ca121c32996d` |
| `content/episode-006/production/tts-metadata.json` | `169ab60e1adf28c9266332edc85183f5bdaa69a5a044146afb0c1d83032ba7c5` |

## Codex 实际媒体复核

- 最终 MP4 读回为 H.264、1080×1920、30 fps，时长 47.666667 秒；含 AAC LC、48 kHz 双声道音轨，峰值 -1.7 dB。
- 实际检查了 `output/episode-006/verification/bounded-00-12.mp4`（SHA-256 `5202ef8afca550e6aa1b8ccd66438526b6a61be836dc09e6be09a4dcb5ce3a87`）以及 0.2、3.5、10.5、18、27、34、41、46 秒关键帧。首帧同时出现 RIKYŪ、真实几何 Logo 图、来源标签和字幕；中后段覆盖产品项目图、入口动作、7 名用户、10,000+ 使用、5,000,000+ 展示和价格结尾。
- 第一轮关键帧发现来源标签重复，已返回 render 修复并重新生成 render-plan 和 MP4；上述 hashes 与关键帧均来自修复后的第二轮成片。
- 逐帧核对显示 7 个场景都实际使用 `asset-manifest.json` 声明的对应官网/X 图片；每个 shot 的 `fallbackImageAssetId` 和 `fallbackImageSha256` 与源文件、公网投影副本一致。没有再以程序化占位画面冒充真实素材。
- 音轨波形、声道、采样率、峰值和静音区间已读回；大于约 1 秒的静音都位于场景换气尾部，没有跨越旁白段的缺音或异常长静音。7 段 TTS metadata 均为真实 MiniMax provider，`fallback=false`。
- SRT 共 24 条 cue，与 generated captions 一致；没有中英文词内断裂，小于 1 秒的 cue 为 0，最短 1.004 秒。关键帧确认字幕位于底部安全区，未遮挡主图、关键数字、来源标签或价格卡。

## 假绿灯阻断证明

Delivery gate 现在额外检查所有 `approved=true`、`usedInRender=true` 且绑定 `segmentIds` 的图片：对应场景必须是 `official-screenshot`，并绑定同一 assetId 与非空 SHA；任一声明素材未真正入片都会报 `MEDIA_DELIVERY_DECLARED_STILL_NOT_RENDERED`。本片 7/7 场景满足该门。

最终状态：视频、音频、字幕、真实素材绑定和 40–80 秒交付合同均通过；blocker 为空，`returnTo=none`。
