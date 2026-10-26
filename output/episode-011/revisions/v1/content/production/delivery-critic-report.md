<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-011/vertical_9x16.mp4",
  "reviewedVideoSha256": "be26cb75fef6720483675f76ab52ccac64814d20ae75393f70619c9d6f31266b",
  "reviewedSubtitles": "output/episode-011/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "b801ec5c6c3c9872670d82cd974742b7021d4e805e72b865217e4c6109111a26",
  "reviewedTimeline": "content/episode-011/production/timeline.json",
  "reviewedTimelineSha256": "6b06e725bc008f326795eed29d5924c66e49dfde68646e6af9ffb0bd6131ade5",
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
    "完整正常速度有声观看、耳机听感和独立Delivery审核未完成；吞字、连读与精确音画同步仍未知。"
  ],
  "verdict": "REJECT",
  "returnTo": "tts"
}
-->

# Gamma 成片检查

当前为本地有声观看版。由本制作会话查看当前MP4的全片每两秒联系表、完整分辨率首帧与43秒融资帧，以及来源逐半秒帧和三个派生片段联系表；不是独立Delivery会话或人工批准。REJECT/tts只表示完整听感未确认，不表示发现了TTS缺陷，也不据此无依据重配。

当前最终MP4：56.166667秒、1080×1920、30fps、H.264/AAC 48kHz、峰值-1.7dB、5933245字节。MiniMax真实配音9段，fallbackUsed=false。inspect-output通过、完整ffmpeg解码通过；证据区99%黑像素且持续0.2秒的检查未检出黑屏。28条字幕最短1.116秒，无小于1秒的cue、无英文拆词，逐段语义检查通过。未做离线ASR，不把机器检查说成已试听。

0–2.67秒：文字块经Make this more visual变为图示，标题与旁白交代用途；图示在约2秒出现。2.67–11.17秒：真实创始人照片、深夜排版回忆，非采访视频。11.17–17.09秒：写作先于版式的理念，配2025官方图示；不冒充2020原型。17.09–23.16秒：官方教程内容的编辑说明与演示结果，没有声称取得主题输入到生成全过程实录。23.16–30.47秒：2025官方Agent的真实布局编辑、截图到表格动作；数字为示例内容，非Gamma业务数据。30.47–41.69秒：朋友→Product Hunt公开测试→主动通话，以明确标注的访谈关键词及中文释义呈现，不伪装平台截图或用户通话。41.69–47.95秒：历史公司融资披露与2025-11-10同现。47.95–56.17秒：回到可修改的产品稿，兑现把注意力留给内容的用途。

对照Fastlane V2的当前最终稿及实际成片联系表，本期保持具体开场、人物需求、自然推进、日期及口径、结尾回报。局限：人物为静态照片、原文编辑卡占比较高；官方GIF原始800×450，放大后细小英文无需逐字阅读，核心动作和中文解释承担理解。部分证据区的标题与常驻场景标签重复，未遮挡操作；来源行与字幕分区。静态证据按真实旁白阅读时长展示，没有为凑60秒拉长片长。不能声称与基准相同的创意效果或留存。

完整听感、独立Delivery、用户创意评价与外部发布权利待确认；speechClippingOrSwallowing保持null，不为了通过release改成false。未上传或发布。
