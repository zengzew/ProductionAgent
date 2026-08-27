<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-006/vertical_9x16.mp4",
  "reviewedVideoSha256": "bbfc5f0d5b9c2b2f71600b013e6a6ce9f6655db067786c7c4fd4e9936977c525",
  "reviewedSubtitles": "output/episode-006/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "a3f5645a21dfd6e4c861b55bdaff7e7ed198e35239a1c89564759b2f10bffab6",
  "reviewedTimeline": "content/episode-006/production/timeline.json",
  "reviewedTimelineSha256": "ce226f83bfab88dc271834506239ef627ebc840f894c4b219fe4c8c9326e3eac",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.015,
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
| `output/episode-006/vertical_9x16.mp4` | `bbfc5f0d5b9c2b2f71600b013e6a6ce9f6655db067786c7c4fd4e9936977c525` |
| `output/episode-006/subtitles_zh.srt` | `a3f5645a21dfd6e4c861b55bdaff7e7ed198e35239a1c89564759b2f10bffab6` |
| `content/episode-006/production/timeline.json` | `ce226f83bfab88dc271834506239ef627ebc840f894c4b219fe4c8c9326e3eac` |
| `output/episode-006/inspection.json` | `fa32987e016c404985774f1bec65a8ed10d698d3649926e9b06b38b32f2109ec` |
| `content/episode-006/media/render-plan.json` | `6701e7d7b5e49fa7765685674ce8457aed5addee4b0f67245b4d0dd0e24d9d19` |
| `content/episode-006/production/asset-manifest.json` | `b509ccf569986406af7e3b28504817cff393e3d3140d1ef61ca1ca121c32996d` |
| `content/episode-006/production/tts-metadata.json` | `68bc097ba984d06a6486874b7d276a7c1e14ef6c74b045e27c25dd8051a69fbd` |

## Codex 实际媒体复核

- 最终 MP4 读回为 H.264、1080×1920、30 fps，时长 41.566667 秒；含 AAC LC、48 kHz 双声道音轨，峰值 -1.7 dB。
- 实际检查了 `output/episode-006/verification/bounded-00-12.mp4`（SHA-256 `14da1422328a35b35abd23653fe719cd35fc07055ab00fa3ad3d90c7a212c99c`）以及 0.2、4.5、13.5、21.5、27、31、36、40.5 秒关键帧。首帧同时出现 RIKYŪ、真实几何 Logo 图、来源标签和字幕；中后段覆盖产品项目图、入口动作、7 名用户、10,000+ 使用、5,000,000+ 展示和价格结尾。
- 实际媒体复核先后发现来源标签重复、两处字幕语义边界不自然、两行字幕遮住来源标签、真实 Hook 音频超出 20 秒，以及加速后出现 5 条微字幕，均按 `returnTo` 返回 captions/timeline/TTS/render 修复并重渲染。最终 Hook 在 19.835 秒结束；当前关键帧中来源标签已移至字幕上方，白色文字与阴影清晰可读，且没有遮挡真实图片主体。
- 逐帧核对显示 7 个场景都实际使用 `asset-manifest.json` 声明的对应官网/X 图片；每个 shot 的 `fallbackImageAssetId` 和 `fallbackImageSha256` 与源文件、公网投影副本一致。没有再以程序化占位画面冒充真实素材。
- 音轨已完整解码，并读回声道、采样率、峰值和静音区间；五处约 1.10–1.16 秒静音都位于场景换气尾部，没有跨越旁白段的缺音或异常长静音。7 段 TTS metadata 均为真实 MiniMax provider，语速 1.65，`fallback=false`，且使用 provider timestamps 对齐字幕。
- SRT 共 19 条 cue，与 generated captions 一致；没有中英文词内断裂，小于 1 秒的 cue 为 0，最短 1.015 秒。关键帧确认字幕位于底部安全区，未遮挡主图、关键数字、来源标签或价格卡。

## 假绿灯阻断证明

Delivery gate 现在额外检查所有 `approved=true`、`usedInRender=true` 且绑定 `segmentIds` 的图片：对应场景必须是 `official-screenshot`，并绑定同一 assetId 与非空 SHA；任一声明素材未真正入片都会报 `MEDIA_DELIVERY_DECLARED_STILL_NOT_RENDERED`。本片 7/7 场景满足该门。

最终状态：视频、音频、字幕、真实素材绑定和 40–80 秒交付合同均通过；blocker 为空，`returnTo=none`。
