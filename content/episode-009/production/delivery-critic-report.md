<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-009/vertical_9x16.mp4",
  "reviewedVideoSha256": "d612eee006c838b3934717ba4f7af4b175e7371918a79d3aaf0eaed9a241dabe",
  "reviewedSubtitles": "output/episode-009/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "0aae4c6cd068c2afb1865854219ef7a73450e4a6aa724e68ec8ce2cfb7ea8a33",
  "reviewedTimeline": "content/episode-009/production/timeline.json",
  "reviewedTimelineSha256": "3c890cea0254f0e908d062c68109e2c9a57a3c50c397d716d56e32927aa6a306",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.012,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": null
  },
  "blockers": [
    "未能实际听辨完整最终MP4音轨；吞字、连读、异常停顿与真实音画/字幕同步仍待人工佩戴耳机终审。音频解码、峰值、静音检测及ASR不能替代听辨。"
  ],
  "verdict": "REJECT",
  "returnTo": "tts"
}
-->

# Episode 009 本地成片独立审查

结论：**REJECT，唯一首要退回环节为 `tts`，补齐完整音轨人工听感终审**。当前视觉与字幕抽检未发现需重渲染的硬缺陷；本结论不能升级为 `delivery-approved`。`speechClippingOrSwallowing: null` 明确表示未核验，既不是发现吞字，也不是确认没有吞字；现有布尔字段不能表达 unknown，保留 null 作为待核验记录；release 未通过。

审查由未参与本期脚本、TTS、字幕、时间轴和渲染修改的独立执行会话完成。实际证据是当前 MP4 解码所得的 0–44 秒逐秒画面、首尾及关键操作的全分辨率帧、5.5–8.9 秒每 0.2 秒操作帧；另对全部 1339 帧解码检查标题、证据和来源区域。此为实际文件视觉检查，不宣称完成正常速度的有声观看或佩戴耳机试听。临时检查帧位于 `/private/tmp/e009-delivery-review/`，未修改视频。

## 成片与字幕

`ffprobe` 实测 44.633333 秒、1080×1920、30/1 fps、H.264、AAC 48 kHz 双声道；符合 40–80 秒竖屏边界。2026-10-15T03:32:39.193Z 的 `inspection.json` 无 errors，读回音频峰值 -1.7 dB。最终 MP4 全片音轨可以解码；`silencedetect=noise=-40dB:d=0.35` 检出若干约 0.39–0.77 秒停顿，最长为 41.214208–41.988687 秒（0.774479 秒）。这些值不能判断停顿自然与否、吐字质量或是否有听觉上的错位。

逐条检查当前 SRT 的全部 25 cue：英文词 `Fastlane`、`Reddit` 没有切开，中文词组未见词中断裂；画面所见字幕在独立下方安全区，没有遮住操作控件或收入原文。小于 1 秒的 cue 为 0/25，占比 0；最短为 cue 13「和社交平台找人」，20.640–21.652 秒，1.012 秒。cue 10「应用做出来了」1.043 秒、cue 8「也能在这里选」1.051 秒，也达当前阈值。部分 cue 省去口语停顿标点，但文本没有因切分改变含义。真实语音与 cue 精确同步仍待听辨，不能仅据 provider timestamps 确认。

## 观众实际画面

| 成片时间 | 实际核验 |
| --- | --- |
| 0–2.07 秒 | 两行标题直接交代 Fastlane 把产品链接变成营销短视频；画面下方标「Starter Story · 历史演示 · Cal AI 宣传候选」。食物与运动画面被明确放在宣传候选语境中，第一屏没有把 Fastlane 描述成饮食记录工具。字幕给出做产品者的具体麻烦。 |
| 2.07–5.53 秒 | 「你的产品网站链接→宣传短视频／图集」输入与结果清楚，3 秒内给出具体动作。画面及来源行均标流程示意、据创始人介绍、非生成实录，没有冒充实际输入生成录屏。 |
| 5.53–8.97 秒 | Cal AI 候选卡、红色 ×、Edit、绿色 ✓ 可辨；密集帧中可见指针靠近 × 与卡片切换。候选自身的英文属于原内容，中文字幕独立；未把卡片内容当成 Fastlane 的营养功能。 |
| 9.00–13.73 秒 | TikTok/Instagram、账号选择与 Next 可读；随后 Post ASAP 与 Schedule for Later 以及具体说明可读。标「历史演示节选 · 步骤省略 · 排期选项停帧」，与 edit-recipe 中原片 814 秒真实帧停帧一致，没有伪装成完整连续流程或真实已发布结果。 |
| 13.77–18.50 秒 | 创始人脸部清楚，下方有 Gaurav Thapa、Fastlane 创始人、Starter Story 采访身份标签。 |
| 18.50–27.13 秒 | Reddit/社媒→等候名单→邮件约通话、预约通话→额外七天使用的图示可读；均显著标示为创始人自述的编辑示意，并区分非真实帖子／邮件截图、非当前试用规则。 |
| 27.13–32.07 秒 | 仍是创始人访谈，来源行明确「非客户通话录像」，没有把讲述画面伪装成客户共享屏幕实录。 |
| 32.07–37.93 秒 | 历史收入卡保留「超过12万澳元」「ARR · 年化经常性收入」、2026-04-03，原图两条白底局部清楚显示 April 3rd, 2026 和 AUD $120,000 ARR 原文；同时标「历史口径，非当前数据；ARR不等于利润」与真实页面局部截图来源。数字证据在该段首次旁白之前即进入画面，字幕没有覆盖原文。 |
| 37.93–44.63 秒 | 回到同组候选、账号选择和排期选项。中段展示了获客与观察用户的做法后，这次回看落在「挑好并排期」的可见用途；没有补造发布成功、播放量或用户转化。 |

四张静态图与 `production/asset-manifest.json` 的用途、来源、Claim ID 对应：网站流程为 claim-fastlane-001，获客为 005，额外七天为 004，历史 ARR 为 009。原片各首次出现对照 `media/source-manifest.json`、render plan 和 edit recipe，来源均为 Starter Story 的 `BA_fC95p43c` 采访，产品演示为 001，人物需求为 002，观察用户为 005；实际来源标注与用途一致。未把静态示意当真实应用截图；本地准入也不代表外部发布许可。

首次批量图像呈现时曾怀疑有标题／证据层缺失，后以同一帧文件逐字节复抽、单图查看、完整序列和全帧解码交叉核验排除，因此不将该误读列为当前成片缺陷。

## 剩余交付条件

已读取 `production/asr-check.json` 与 `asr-check.log`：离线 small 模型识别结果覆盖十段旁白，叙事次序与脚本大体对应，识别到了 Fastlane、Reddit、额外七天、共享屏幕、2026年4月、年化经常性收入、超过12万澳元及结尾排期用途。两处应在最终 MP4 中重点听辨：约 5.53–6.66 秒的「一张张滑着挑」被识为「一张张华制条」；约 34.16–36.39 秒的「创始人自报」被识为「创始人自保」。这些是 ASR 歧义，不能据此断言 TTS 读错、吞字或必须重新配音。另有「帐号／账号」「在哪儿／在哪」和汉字数字转阿拉伯数字等文字差异，不据此判定事实或发音错误。

ASR 输入是十段真实 TTS 顺序拼接，未加入最终时间轴的段尾空白，故其时间码不能精确比对最终 MP4 或 SRT；上列待听区间取自最终成片的 cue，只作定位。此检查增加文字交叉证据，未补齐完整混音的实际听感、自然停顿或音画同步证据。

人工需从 0 秒听到 44.633 秒，确认 Fastlane／Reddit 读音、「滑着挑」「自报」、语速下的吞字与连读、上述停顿、收入日期／澳元／年化经常性收入，以及末句收尾和字幕同步。当前未完成实际听辨；不声称已经听过，离线 ASR 不能替代这项终审。没有依据要求重新生成全部 TTS；先核验最终音轨，发现具体问题再按时间点修复并重新绑定产物。

本审查仅针对当前本地文件；没有证明观众留存、完播、讨论或转发，也没有授予发布批准。
