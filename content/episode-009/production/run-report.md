# Fastlane 本地成片记录

本期为 episode-009，采用 `golden-reference-v1` 最新参考流程。已生成 [44.633秒竖屏有声MP4](../../../output/episode-009/vertical_9x16.mp4)，1080×1920、30fps、H.264/AAC 48kHz，约5MB。十段MiniMax真实旁白、6段真实原片节选和4张署名原文／流程图，25条中文字幕。

核心问题是Fastlane怎样让会做产品的人把营销内容做出来并发出去。主源为Starter Story创始人采访；14日前后官网v2与历史滑卡界面不混用。历史收入保留2026-04-03创始人自述、AUD >120000 ARR，不把币种未明的69K MRR称为美元，不计算两个月增速。输入网站、获客和七天访问只用有来源示意，不伪造实测。

| 证据项 | 当前结果 |
| --- | --- |
| Repository | /Users/zengze/Documents/ProductionAgent，master，原工作区修改保留 |
| Changed scope | 新候选与episode-009包、公开运行素材、唯一共享代码改动为注册episode-009渲染契约 |
| Commands run | story-source preflight；validate:research；materialize:story；真实tts；timeline；media ingest/index/retrieve/verify/selection/render-plan；render vertical；inspect-output；Fast/Story/Production；全片ffmpeg解码；独立Delivery；release；git diff --check |
| Result | Preflight/研究/故事/Production、MP4解码与输出检查通过。25cue、0微cue、最短1.012秒，峰值-1.7dB。独立画面逐秒、关键帧、全帧检查未确认视觉硬缺陷。离线ASR文字核对完成，有同音歧义，非听感批准。 |
| Code checks | Node24的test:affected：25文件144项通过；typecheck通过。没有为本期重复全量Vitest或coverage。 |
| Not run / incomplete | 人工佩戴耳机听完整成片与最终人工批准未完成；未上传、发布、注册Fastlane账号或投放广告。完整vertical渲染直接验证，未重复smoke渲染。 |
| Git status | 工作于既有master脏工作区；保留原有修改。本期新增目录及1行渲染契约注册，未commit/push。 |
| Residual risk | Delivery保留REJECT/tts（未知听感，不是确认配音有缺陷）；schema的bool无法表达未知，报告null使release拒绝，绝不填虚假false。外部发布权利与真实留存未验证。 |

MP4 SHA-256：`d612eee006c838b3934717ba4f7af4b175e7371918a79d3aaf0eaed9a241dabe`。当前字幕和timeline哈希见独立 `delivery-critic-report.md`。

素材窗、原片SHA-256、裁切与停帧见 `edit-recipe.json`。排期选项采用原片814秒真实帧短暂停留以便阅读，输出明确标记停帧及步骤省略；不拉长到60秒。原片与最终成片不做手工修改，后续改动从工件重新生成。

运行时路径：Node24.13.0；本机Chrome；FFmpeg。MiniMax经现有DashScope配置生成，无fallback；离线转写使用临时目录的Whisper small识别模型，只用于核对，不部署语音或LLM生成服务。
