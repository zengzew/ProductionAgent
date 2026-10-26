<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-010/vertical_9x16.mp4",
  "reviewedVideoSha256": "b0b72fc536d1f539228af447fe5bffa004c365a9ccbde98cca911e9cd946b0b9",
  "reviewedSubtitles": "output/episode-010/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "6a15e744eafb3b095d3a785c0e1ec6e6fb2f840198c18a600950e6519e595018",
  "reviewedTimeline": "content/episode-010/production/timeline.json",
  "reviewedTimelineSha256": "52d026e2cd8927b27da69a03128c850da1e9f636057cc2e6cadacf5b23c83978",
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
    "完整正常速度有声观看、耳机听感及独立Delivery会话尚未完成；吞字、连读和精确音画同步保持未知。"
  ],
  "verdict": "REJECT",
  "returnTo": "tts"
}
-->

# Granola 成片检查

本次由同一制作会话对当前最终MP4做像素及机器检查，未声称独立Delivery capability gate或人工批准。当前是可播放的本地有声观看版；REJECT/tts表示完整听感未知，不代表已确认声音缺陷，不据此要求无依据重配。

ffprobe读回55.466667秒、1080×1920、30fps、H.264/AAC 48kHz、峰值-1.7dB。inspect-output无错误，全片ffmpeg解码通过。30条字幕最短1.116秒，无小于1秒的短cue，英文Granola、AI未拆词；逐段语义边界检查通过。制作时将18.7–21.9秒附近“结束后，再把你写的／和会上说的合在一起”合成一条两行字幕并重新生成最终MP4，没有手修成片。

实际查看当前成片每秒一帧联系表，以及20秒两行字幕、44秒融资全分辨率帧和标题局部。0–3.3秒可见几条手记展开，标题和字幕交代开会记词→AI补笔记；3.3–10.4秒创始人照片与所提出的问题；10.4–14.9秒官网黑色手记/灰色补全图配中文释义；14.9–22.2秒原始官方动画；22.2–30.1秒补全结果局部停帧供理解，未宣称继续生成；30.1–42.2秒真实原文支持封闭测试、投资人和负责人使用、团队传播与分享；42.2–48.1秒融资原文、公司口径和2026-03-25同现；48.1–55.47秒回到同一手记，解释人的判断和可读细节。字幕、来源和证据各有区域，未见相互遮挡。

证据区全片blackdetect（99%黑像素、至少0.2秒）未检出连续黑帧。官网历史动画明示“2024年产品演示·非本次实测”；人物是官网照片，没有冒充采访；中文是编辑释义，没有仿制应用内中文界面。原文卡英文较多，手机上核心理解依赖中文标题和旁白，不要求观众读完英文；来源小字有缩放阅读限制。真实来源与裁切见asset-manifest、still-lineage、edit-recipe和media manifest。

当前最终MP4的离线ASR覆盖全部九段，识别了Granola、用户重点、手记加转写、早期测试和团队传播，以及2026年3月、1亿2500万美元、估值15亿美元。纪要/记忆、转写/专写、同事/同时等识别差异不能单凭ASR判作发音错误。它不替代正常速度有声观看，不证明声音自然或字幕精确同步。

对照Fastlane V2，本片保持立即说明用途、人物所提出的需求、单一产品价值、同期来源与结尾回报；原始动态素材较少，来源卡比例更高，不能声称达到相同留存或用户评价。完整听感、独立Delivery与用户创意评价仍未知，未标delivery-approved，未上传或发布。
