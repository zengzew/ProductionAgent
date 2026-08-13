# Goal 3.2 review package

状态：四条候选均已完成可审核分析，但全部保持 `pending`；`reference`、`calibration`、
`golden` manifest 均为 0 条。第一批链接中的第 3、4 个 URL 指向同一 sourceId，已去重；
用户随后补充的 `6809f616000000000903a1fb` 作为第 4 个唯一候选记录。

## 1. Cat on Chair 番茄钟

- 记录：`intake/xhs-6a7b007600000000240264dc-v1.json`
- 时长：67.413 秒
- 核心结构：结果/反差 → 奖励循环 → 创意与分工 → 商业化 → 分发事件 → 累计结果。
- 主要可迁移模式：结果—机制—起源—增长、持续 stakes 标题、问句式阶段桥、命题匹配的
  证据切换。
- 建议角色：`story-director`、`viral-director`、`script-writer`、
  `visual-director`、`retention-critic`。
- 不迁移：猫咪奖励机制、人物/产品名、定价、下载和销售数字。

## 2. AI 婚礼电影

- 记录：`intake/xhs-6a7091e400000000250032e2-v1.json`
- 时长：40.128 秒
- 核心结构：神秘事件 → 跨时代近失重复 → 新娘反应升级 → 真实相遇 → 礼物来源 →
  情感意义。
- 主要可迁移模式：反应先行的悬念、规则不变/场景升级、晚揭示重构前文、内容轨与
  反应轨并置。
- 建议角色：`viral-director`、`visual-director`、`retention-critic`。
- 不迁移：婚礼人物、跨时代剧情、第三方反应和生成影片资产。

## 3. AI 身高预测 App

- 记录：`intake/xhs-6a75e71a00000000210235f0-v1.json`
- 时长：76.500 秒
- 核心结构：多源结果证明 → 重复需求 → 快速产品/付费墙 → 内容/UGC/广告 → 收入阶梯
  → 产品—内容—订阅公式。
- 主要可迁移模式：解释前证据栈、评论作为需求证据、产品—内容—订阅因果链、证据模态
  阶梯、把结果回收为可复述模型。
- 建议角色：`story-director`、`viral-director`、`script-writer`、
  `visual-director`、`audience-critic`。
- 不迁移：健康预测流程、人物/产品事实、渠道和经营数字；相关主张仍需 Claim Ledger 与
  合规审核。

## 4. Alex Tew：百万美元首页到 Calm

- 记录：`intake/xhs-6809f616000000000903a1fb-v1.json`
- 时长：94.320 秒，超过当前 40–80 秒交付边界，只能迁移结构并重新压缩。
- 核心结构：双结果 → 第一个极简网页的机制/传播/兑现 → 复制失败与重新定向 →
  第二个两分钟网页实验 → Calm 产品与规模 → 市场/泛化 CTA。
- 主要可迁移模式：双结果连接问题、镜像的极简产品实验、成功—受挫—重新定向、
  先看懂交互再讲规模、随故事阶段切换视觉模式、静态证据的运动层。
- 建议角色：`story-director`、`viral-director`、`visual-director`、
  `retention-critic`。
- 不迁移：人物心理、网页与 Calm 的产品/经营事实、金额、估值、用户和市场预测；不照搬
  约 67 秒才出现 Calm 的揭示位置，也不迁移“下一个财富传奇”式泛化结尾。

## 人工偏好补充（非数据集审批）

用户明确指出，喜欢这组视频不只是因为题材，也因为两个共同的编辑特征：

- **有效画面密度高**：创作者采访、人物原始素材、App/网页实际演示、用户评论、后台、
  传播素材和经营图形不断替换，而且与当前旁白命题对应。这里的“充实”不是单纯增加
  B-roll、硬切或动画。
- **叙事有悬念和起伏**：开头马上给出反常结果或未解问题，再依次揭示原因、疑点、
  挫折/反转、用户痛点、产品解决方式、营销路径和结果 payoff。故事中的挫折、心理状态、
  增长数字和因果关系仍必须有来源，不能为了戏剧性补写。

该反馈已结构化保存在
`human-feedback/visual-density-narrative-tension-v1.json`，并分别关联到四条样本中实际检查
过的时间段。反馈记录本身不是 `sampleId@recordVersion` 的批准；用户后续明确授权的
Prompt 整合由 `policies/prompt-editorial-policy-v1.json` 单独记录，仍不改变任何 membership。

## Prompt / 编辑政策整合决定

`editorial-policy-v1` 已批准将可迁移 findings 固化到 Story Director、Viral Director、
Script Writer、Oral Rewriter 和 Visual Director，并仅用清晰证据校准 Audience Critic 与
Retention Critic。角色只接收蒸馏规则，不运行时加载 intake 或完整 transcript。

Oral Judge 刻意保持不变：本批没有人工听感，也没有带分数与 PASS/REJECT 边界的批准
calibration 样本。所有阈值、blocker、Claim 边界、validator、M1/M2 行为和 episode
artifacts 保持不变；没有开始 M3。

## 模态检查边界

四条视频的 `video`、`audio`、`transcript`、`captions`、`metadata` 都有实际检查记录，
但检查深度不同：

- 视频：在 Edge 中确认可播放，并对完整时长每 3 秒解码取帧后逐页检查；第 4 条还检查
  了 scene-change 候选缩略图。它们不是逐帧 edit decision list，候选也不等于硬切数量。
- 音频：实际解码并检查 EBU R128 响度、低电平间隔，同时作为本地 ASR 输入；模型没有
  人工听辨通道，所以没有判断音乐类型、情绪配乐或具体音效。
- transcript：本地时间戳 ASR，并与采样字幕/画面交叉核对；第 4 条还检查了页面提供的
  source zh-CN 时间轴字幕。文本存在专名/同音错误，仓库不保存完整第三方 transcript。
- captions：检查了完整时长的 3 秒采样和持续标题；没有导出或穷尽 OCR 全部字幕。
- metadata：读取了页面、Edge 媒体诊断和 ffprobe 元数据；没有把平台互动数或精确发布
  时间当作稳定证据。

每个 JSON 内保存了更细的检查方法、证据、限制、时间段、多模态同步、可迁移/产品专属
模式和角色映射。审批时应以 JSON 为准。

## 人工审批所需信息

若要让某一候选进入数据集，需要人工逐条明确：`sampleId@recordVersion`、目标集合、适用
角色、reviewer id、decision id 和理由。公开提供过的样本不适合作为隐藏 `golden`；没有
Critic/Judge 分数或边界标注的样本也不应仅凭本次分析进入 `calibration`。
