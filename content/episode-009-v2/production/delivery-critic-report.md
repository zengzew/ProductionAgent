<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-009-v2/vertical_9x16.mp4",
  "reviewedVideoSha256": "2addd0a56fd3512d60a47e1e3dbc47a0f137c4077b9dd1a6c5028be783ce2e61",
  "reviewedSubtitles": "output/episode-009-v2/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "c6f59df8d109304e4ae5230296a6fa106d5c2093c037ef595da8017a7a3a23ee",
  "reviewedTimeline": "content/episode-009-v2/production/timeline.json",
  "reviewedTimelineSha256": "33c7eb3a75892a9351836f279d363bac2ff123ea6383c34dfcc153cb9fcc47cb",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 1,
    "microCueRatio": 0.030303030303030304,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 0.984,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": null
  },
  "blockers": [
    "未能实际听辨完整最终 MP4 音轨；吞字、连读、异常停顿和音画／字幕同步待人工佩戴耳机终审。ASR 与机器解码不能替代听辨。"
  ],
  "verdict": "REJECT",
  "returnTo": "tts"
}
-->

当前可作为本地观看版交付；Delivery 为 **REJECT / tts**，唯一首要待补项是完整音轨听感终审。`speechClippingOrSwallowing: null` 表示未知，既不确认吞字，也不确认没有吞字。不能为通过布尔字段校验而改成 false，也不能据此声称 delivery-approved。

本次由未参与 V2 脚本、配音、字幕、时间轴及渲染修改的独立会话审查。实际查看最终 MP4 的 13 张关键帧、独立抽取的每秒一帧序列、0／11／30／47／52 秒全分辨率帧，以及 56.9–57.9 秒每 0.1 秒的结尾切换序列。临时帧在 `/private/tmp/e009-v2-delivery-review/`。这是视觉与机器证据检查，未完成正常速度的有声观看或佩戴耳机试听。

独立 ffprobe 读回 60.133333 秒、1080×1920、30/1 fps、H.264／AAC，符合 40–80 秒边界。当前 inspection.json 无 errors，音轨 48 kHz、峰值 -1.7 dB。逐条阅读全部 33 个 SRT cue，并对照 captions.generated.json：Fastlane、Reddit、AI 没有词中切分，中文词组未见断裂。唯一小于一秒的 cue 为第 18 条“再约报名者通话”，32.687–33.671 秒，0.984 秒；占 1/33，即 3.030303%，低于 10% 上限。第 8→9 条在“的／图文”间分 cue，属于短语间切分。所见字幕位于独立下方区域，未遮住控件和原文证据。真实听觉同步仍未知。

0 秒标题与字幕已经交代“网址→宣传短视频”，中间为标明历史演示、Cal AI 候选的内容卡；3 秒内可理解具体输入和用途。2.67 秒出现创始人及需求。10.1 秒开始的 URL 宣传动画保留输入框，11 秒清楚读到 CalAI.com 和箭头按钮；来源明确“官网宣传动效＋历史候选·非本次生成实录”。随后候选、×／Edit／✓、账号选择、排期选项可辨，排期静帧已标步骤省略和停帧，没有冒充连续操作或发布成功。

21.57–29.20 秒回到候选时，字幕说明用户从准备内容转为挑选调整，赋予素材具体用途。29.2 秒 Reddit 局部保留 r/SideProject、标题及创始人介绍，并裁掉未进入事实链的数字；约 1.6 秒只足以辨认渠道和帖子存在，不应要求观众读完整段英文。33.95–45.12 秒是本人谈观察用户及七天激励，来源行区分自述、非客户通话实录和非现行试用政策。

45.12 秒首位付费用户卡明确“原文摘录·编辑排版·非网页截图”，对应 asset manifest 的 image 类型、claim-fastlane-006 及历史访谈 URL，没有将模糊网页伪装成可读截图。50.57 秒收入卡保留 April 3rd, 2026 和 AUD $120,000 ARR 原文，明确历史自述、非利润或全年实收，对应 screenshot 类型及 claim-fastlane-009，证据先于本段旁白中的数字出现。真实素材首次使用可追到 source-manifest 中 Starter Story 的 BA_fC95p43c 采访及当前 render plan，画面用途与 Claim ID 一致。

54.27 秒回到创始人，再切回产品候选，有“自己推广困难→招人观察→测试者付费”的铺垫，结尾成为人物选择的结果，没有重复排期流程填时间。56.9–57.9 秒密集帧显示人物直接切到手机候选，无黑屏；对最后 6.13 秒证据区全帧运行 blackdetect，未检出占区域 99% 的连续黑帧。全片每秒抽帧未见内容层缺失。来源小字全尺寸可读，但手机缩放后偏小，核心理解依靠标题、字幕及证据卡；这项可读性局限不能当作留存已经验证。

已读取本轮 MiniMax 元数据：11 段新旁白、speed 1.2、无 fallback。离线 ASR 覆盖全部主要内容，未见整段遗漏；“年化”识别为“年华”是同音歧义，不能据此判断配音错误。ASR 基于分段音频拼接，时间码不等于最终 MP4，不能证明真实语速自然或精确同步。人工仍需听完 0–60.133 秒，重点确认 Fastlane／Reddit／高拉夫读音、51.776–54.051 秒收入表述、段间停顿、结尾收音与字幕同步。没有依据要求全部重新配音；先听最终音轨，有具体缺陷再定位修复。

本次读取当前配置、story-approved 工作流、SRT、timeline、captions、TTS 元数据、asset manifest、media source manifest、render plan、ASR 和 inspection；未修改任何生产输入或成片。当前本地技术与视觉证据不能证明自然听感、真实留存、外部发布许可或用户最终批准。
