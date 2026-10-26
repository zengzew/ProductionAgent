<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-010/vertical_9x16.mp4",
  "reviewedVideoSha256": "ac322ef7d753931bfafab2c90186d64772ee871e794eba597deaa72fab796c39",
  "reviewedSubtitles": "output/episode-010/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "9b062e11c2539ec0da62b60d29514513a444c545edd5bbfbeba830751d0ca1f1",
  "reviewedTimeline": "content/episode-010/production/timeline.json",
  "reviewedTimelineSha256": "bfeb13e228c6e5408b2d8f1a689358523cd87c755969eb2e9375bdd35956c3f9",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.116,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": null
  },
  "blockers": [
    "Revised pacing rendered; complete listening and independent Delivery review remain unconfirmed."
  ],
  "verdict": "REJECT",
  "returnTo": "tts"
}
-->

# Granola 节奏修订检查

用户在2026-10-20先认可原版达到发布水准，随后指出局部突然加速和段间停顿不足。两项评价均保留；旧版整体认可不自动批准当前新音轨。旧报告与原视频保存在 pacing-source 和 output/episode-010/original。

新版62.30秒、1080×1920、30fps、H.264/AAC48kHz，峰值-1.7dB；inspect-output通过，30条字幕最短1.116秒，微cue为0，字幕语义检查通过。对原TTS作保音高调速并插入句间静音，同步变换提供方时间戳，再生成时间轴、媒体及完整MP4，未手修最终视频。seg-003实际音频从4.331秒变为5.397秒；详细读回见 pacing-measurements.json。

本会话查看新素材首中尾九帧及最终九场景抽帧，标题、来源、字幕与证据均可见；全片解码通过，证据区blackdetect未检出持续黑帧。抽帧不证明精确声画同步。完整耳机听辨与独立Delivery未完成，speechClippingOrSwallowing继续为null。已有离线ASR环境包不完整，本次重跑失败；不沿用旧视频ASR作为新版证据。REJECT/tts保留为听感待复核，不宣称修订已经获得用户认可。
