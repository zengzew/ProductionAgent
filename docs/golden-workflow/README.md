# 参考样本驱动的生产流程

2026-10-13 起，新 Episode 的人工／Agent 文件交接入口是
[`agents/reference-producer.md`](../../agents/reference-producer.md)。本次用户明确要求以三条
golden examples 重构流程；这是设计方向的授权，不代表新成片已达到样本效果。
2026-10-16，用户明确认可 Fastlane V2 并要求后续保持其质量；新一期同时执行
[Fastlane V2 质量基准](fastlane-v2-quality-baseline.md)，在既有编辑和成片检查中落实对照。

旧 Episode 按原配置执行。新格式的 LangGraph 已使用六个文件交接阶段替代旧内容循环，
随后进入原有内容批准、生产和最终批准。

迁移旧内容时先保留原稿、原 MP4 和原 checkpoint，再把研究、来源、媒体权利记录与
原始素材复制到独立制作目录，重新编写 Spine、稿件、字幕、事实报告和视觉方案。
不要复制旧审核结论作为新稿批准；既有配音与时间轴也不能代表新稿已完成。

`ORCHESTRATOR=langgraph pnpm orchestrate -- --episode episode-NNN --run <new-run-id>`
现在按 research、spine、narrative、editor、fact、visual 逐份校验并记录交接。尚未完成的
文件会触发 external-capability 暂停，补齐后用同目录的 `--resume` 继续；交接本身不会
发起模型调用、生成评分或冒充独立审稿。完成后仍进入正式内容批准，再进入原生产图。
旧 checkpoint 的内容角色状态不会被转换成新流程完成记录；迁移使用独立目录中的新
checkpoint。内容批准后的修改继续遵循原有 direct-edit／解冻合同。

## 从证据到成片

| 环节               | 负责人和实际交付                                                                                       | 进入下一步的依据                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 选题与素材一起研究 | Research Analyst 核验来源；Spine Extractor 写 `story/story-spine.md`；Visual Director 提前检查核心素材 | 来源能解释故事，真实素材能展示核心操作。缺哪个就补哪个或缩小选题                 |
| 一份共享故事骨架   | Spine 保留来源关系，并附「可用画面」：来源、时间段、可见动作、Claim、权利状态和缺口                    | 不把参考短片当商业事实的一手来源；不靠多轮摘要丢掉人物与动作                     |
| 脚本与画面同步改编 | Narrative Adapter 写 `script-draft.md`；Script Editor 写 `final-script.md` 和一次编辑记录              | 开场结果有证据；产品有输入、操作、反馈；段落回答观众自然产生的下一个问题         |
| 事实与画面定稿     | Fact Guardian 核对旁白及标题；Visual Director 写现有 v3 `visual-plan.md`、镜头和素材配置               | 真正 PASS／READY，画面逐段覆盖，缺失素材不写成已取得                             |
| 声音驱动剪辑       | 真实 TTS → 字幕和时间轴 → 已核验媒体 → render plan → 9:16 MP4                                          | 按真实语音调整时长与切点；不靠拉长静帧和段尾空白补到 60 秒                       |
| 实际观看           | Delivery Critic 检查成片；用户对照参考观看                                                             | 分别看清晰度、连续性、同期证据、听感和结尾，记录具体时间点；不能自行声称同等效果 |

六份故事工件沿用 Source-First：Spine、draft、final、critic、fact-check、visual-plan。
`caption-plan.json`、媒体准入、真实 TTS、渲染和 Delivery 继续走既有生产合同。
视觉预研和正式视觉定稿是同一职责的两次介入，不新增一串审批角色。

开场通常在 3–8 秒完成“谁／什么产品＋可核验结果”，随后立即推进产品或需求。
这是样本观察，不是固定模板。新格式的机器上限为 10 秒，不要求问号；前三秒仍要清楚。
主体解释具体用户的麻烦、产品操作、愿意付费的理由和可验证的获客动作。结尾落回用户
得到什么，不强塞数字、创始人履历或通用关注口号。参考里没有出现的来源关系仍是未知。

## 启用方式

选题和标题核验后，在本期 `episode.config.json` 的 `production` 中加入：

```json
{
  "referenceStory": {
    "profile": "golden-reference-v1",
    "headline": "本期的人物或产品动作",
    "resultLine": "有来源支持的具体结果",
    "claimIds": ["claim-current-001"]
  }
}
```

这里的文字和 Claim 是格式示例，必须替换成本期事实。`workflow.json` 使用
`source-first-workflow-v1`，按 research、spine、narrative、editor、fact、visual、delivery
记录七个职责；视觉预研写入 Spine，正式定稿后才完成 visual stage。阶段初始为 pending，
不得为凑齐文件制造 PASS。新 Episode 仍须按现有 `render-contract.ts` 注册 MediaMixVertical。

Fact Guardian 的报告增加一行 `- Reference title SHA-256: <hash>`，hash 是
`sha256(JSON.stringify(episodeConfigSchema.parse(config).production.referenceStory))`。
标题换字、换 Claim 都会要求重新核对；渲染计划绑定相同配置，过期版本拒绝渲染。

版式是黑底、两行常驻标题、中部等比呈现的证据、独立来源说明和下方中文字幕。
最多 24 字的标题不是写满提示；超长标题先改写。中部应随叙事改变真实操作、人物、
渠道或数字证据。不要将整张桌面网页缩到不可读，也不要为切镜头切断操作因果。
证据窗口应使用干净的原始素材，并按可见操作裁切；不要把已经带标题和字幕的竖屏成片再嵌进去。
本版式不支持 PiP，渲染计划会拒绝启用 PiP 的镜头。
同一句需要多个片段时按语义拆成多个现有 segment；不复制一个长段来塞不同镜头。

默认段尾 0.12 秒是实现起点，不是自然停顿标准。可用既有 `timelineTailSeconds` 为具体段覆盖；先计入原音已有间隔，按语义衔接判断，已有显式覆盖不会消失。
参考音轨约 5.6–6.2 个汉字／秒，只作初稿预算，不能替代实际 TTS 读回。沿用当前 TTS
服务及响度标准，不克隆创作者声音，不照搬参考的低响度。原声与旁白相遇时做取舍，
音乐和音效在实际听辨后再决定。

执行命令均带本期 `--episode`，避免误改 Episode 001：

```bash
pnpm validate:episode -- --episode episode-NNN --profile fast
pnpm validate:story -- --episode episode-NNN
pnpm materialize:story -- --episode episode-NNN
pnpm validate:content -- --episode episode-NNN --pre-production
pnpm tts -- --episode episode-NNN
pnpm timeline -- --episode episode-NNN
# 完成既有媒体准入、索引、验证与镜头选择后：
pnpm media:render-plan -- --episode episode-NNN
pnpm render:smoke -- --episode episode-NNN
pnpm render:vertical -- --episode episode-NNN
pnpm inspect:output -- --episode episode-NNN
# 完成实际 Delivery 审核后：
pnpm validate:episode -- --episode episode-NNN --profile release
```

格式与代码检查不证明创意质量。三条参考已用于设计，因此不作为隐藏回归集；既有
`datasets/golden` loader 保持独立。样本原片在被忽略的 `downloads/golden-20261013/`，
仅供本地分析；访问证据见 [access-evidence.json](access-evidence.json)，观察见
[reference-study.md](reference-study.md)。Episode-008 的迁移与预览进度见
[已归档的Episode-008迁移记录](../../../ProductionAgent-legacy-archive/2026-10-26-cleanup/retired/output/golden-reference-episode-008-20261014/README.md)。
无声分镜只能观察结构和画面，不能代替真实配音成片或用户对照评价。

人工反馈的分类、适用边界及保留的冲突见 [Episode-010复盘](episode-010-feedback-learning.md)；本期参数不作为后续固定模板。
