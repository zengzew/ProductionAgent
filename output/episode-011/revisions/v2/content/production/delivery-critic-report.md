<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-011/vertical_9x16.mp4",
  "reviewedVideoSha256": "353e114fc7419f7cf8b17ecfe7a941a3ebc50faacddcf3305a908f09c80ab93f",
  "reviewedSubtitles": "output/episode-011/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "953d85f4926e407d079281e4371e18f9012d190e59f00ea622091dfef8936ee4",
  "reviewedTimeline": "content/episode-011/production/timeline.json",
  "reviewedTimelineSha256": "9d0e4b74fd62984b438692132af5757da374502ec601ee65ae311a70f6c49b44",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.082,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": null
  },
  "blockers": [
    "V2完整正常速度有声观看、耳机听感与独立Delivery尚未完成；吞字、连读、英文读音和精确音画同步未知。"
  ],
  "verdict": "REJECT",
  "returnTo": "tts"
}
-->

# Gamma V2 成片检查

本会话查看当前V2最终MP4全片每两秒联系表、0秒首帧、45秒市场指标与55秒结尾全分辨率帧，并查看重新派生的两个动态片段联系表。未声称独立Delivery或人类批准。REJECT/tts表示完整听感未知，不是已确认配音有缺陷，不凭此无依据重配。

ffprobe：56.933333秒、1080×1920、30fps、H.264/AAC 48kHz、峰值-1.6dB。真实MiniMax9段，fallbackUsed=false。27条字幕，最短1.082秒，0条小于1秒；PPT、Gamma、Product Hunt未拆词。逐段语义检查、生产校验、inspect-output与完整ffmpeg解码通过。证据区黑屏检查未发现99%黑像素持续0.2秒的画面。未做ASR，不把机器检查当试听。

0–2.47秒明确“输入文字，AI帮你生成PPT”，显示官方可编辑演示稿结果和多页缩略图，不冒充本次生成全过程。2.47–10.62秒“做咨询”及真实人物照对应排版需求；10.62–22.85秒理念与后续AI产品初稿；22.85–30.10秒官方编辑动作；30.10–41.66秒朋友、公开测试和主动反馈；41.66–49.72秒公司自报历史ARR与累计使用人数，每项各有日期；49.72–56.93秒结尾回扣排版到初稿，并补上“就这样，Gamma把做PPT，变成了先生成、再修改”。

市场画面中2025-11-10 ARR突破1亿美元与2026-08-11累计使用人数超1亿分开标注。报告分析数据截至2026年5月，未写成2026年8月月活；ARR不是实际年度销售额。结尾未声称已取代PowerPoint。常驻标题、来源与两行字幕没有相互遮挡；首屏用途文字有重复但不影响识别，人物静照与编辑卡比例仍较高。GIF源800×450，不要求观众逐字读细小英文，中文与核心操作承担理解。

V1视频、稿件、来源、音频和原报告完整保存在output/episode-011/revisions/v1。V2不继承旧报告hash或用户听感。完整听感、独立审核、用户创意评价及外部发布权利未知，未上传或发布。
