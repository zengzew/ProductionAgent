# 独立口播改写与模型边界

状态：Accepted

## 决策

项目把“信息正确的脚本初稿”和“能自然说出口的中文旁白”拆成两个阶段：

1. Script Writer 依据故事结构与 Claim Ledger 生成 `story/script-draft.md`。
2. Oral Rewriter 只改表达与节奏，生成结构化的 `story/final-script.md`。
3. Oral Judge 独立检查中文自然度、口播节奏和信息保真，结果写入
   `story/oral-review.md`。
4. 三项均达到 4/5 且没有 blocker 后，才进入 Audience Critic 与 Fact Guardian。

Oral Judge 最多允许三轮回改。第三轮仍未通过时，状态改为需要人工编辑，不继续
自动循环。

## 原因

研究整理与口播写作优化的是两件不同的事。前者要保证来源、指标、时间和因果边界；
后者要消除英文句序、均匀书面句和没有对象感的说明文节奏。把两者放在一次生成里，
容易让事实限定直接进入旁白，也容易把英文材料逐句换成中文。

TTS 不解决上游文案问题。它只会把现有句序、停顿和语气放大，所以项目先把文本门
做稳定，再讨论声音质量。

## 当前 TTS 边界

- 继续使用现有 Microsoft Edge neural TTS，无项目 API Key。
- 本阶段不增加商业 TTS API、provider 抽象、供应商配置或音色 benchmark。
- 只有当前样稿通过全部文本门后，才可另开任务评估托管 TTS 服务。
- 评估时必须使用同一份中英混排样稿、真实时长、停顿、错读和授权边界进行比较。

## 永久排除

- 不自部署 GPT、LLM 或任何生成模型服务。
- 不建设 GPU 推理、模型权重、容器编排或私有模型运维链路。
- 不采用 GPT-SoVITS、CosyVoice 等自托管语音方案，也不把它们保留为未来 fallback。
- 仓库中的 Oral Rewriter 和 Oral Judge 是 Codex 角色与文件交接，不是生产代码里的
  LLM API 调用。

未来若评估 TTS，只考虑当前无 Key 链路或另行批准的托管服务。这个边界不为所谓
“供应商灵活性”预留自部署接口。
