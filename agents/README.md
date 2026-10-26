# 当前制作职责与文件交接

新Episode从 [Reference Producer](reference-producer.md) 开始。执行合同见[当前制作流程](../docs/golden-workflow/README.md)，质量对照见 [Fastlane V2](../docs/golden-workflow/fastlane-v2-quality-baseline.md)。角色由人工或任意Agent Harness执行，文件是正式交接依据；角色定义不绑定特定工具。

| 职责                                        | 输入与交付                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| [Reference Producer](reference-producer.md) | 协调本期来源、素材、故事与真实成片对照，不自行批准审核结果                    |
| [Research Analyst](research-analyst.md)     | 已通过候选预检的来源 → `research/`，区分人物原话、公司口径、独立证据和推断    |
| [Spine Extractor](spine-extractor.md)       | 同一来源与视觉预研 → `story/story-spine.md`，保留原有关系和可用画面           |
| [Narrative Adapter](narrative-adapter.md)   | Spine、原始来源与可用素材 → `story/script-draft.md`                           |
| [Script Editor](script-editor.md)           | 通读初稿及主来源 → `story/final-script.md`、一次 `story/critic-report.md`     |
| [Fact Guardian](fact-guardian.md)           | 研究、终稿及常驻标题 → `story/fact-check-report.md`                           |
| [Visual Director](visual-director.md)       | 写稿前做素材可行性检查；事实通过后交付 `story/visual-plan.md` 与镜头/素材配置 |
| [Delivery Critic](delivery-critic.md)       | 实际MP4、字幕、音轨与时间轴 → `production/delivery-critic-report.md`          |

`story/workflow.json` 使用 `source-first-workflow-v1`，记录research、spine、narrative、editor、fact、visual、delivery七个职责。六份故事工件是Spine、draft、final、critic、fact-check与visual-plan；编辑维度用于记录具体问题，不增加六个数值门。

创作职责都能回看同一主来源，不只接收上一个角色的摘要。先找能展示核心动作的素材，再同步写稿与画面。旁白讲人物和动作，来源及口径放到同期画面与Claim记录。按真实TTS、已有停顿和想法转换安排剪辑，不给每句添加固定空白。

事实与成片审核由未参与对应上游创作的执行会话承担。审核发现问题时写清责任角色和定位，由责任角色修改，再重新检查受影响的下游文件；不得替审核者制造PASS。`story-approved`只表示内容门通过，Delivery及最终批准单独完成。

生产继续使用现有素材准入、权利记录、媒体索引/核验、TTS、字幕、timeline和MediaMix。逐阶段命令见[执行合同](../docs/golden-workflow/README.md)。`ORCHESTRATOR=manual`为默认；显式LangGraph的参考格式也采用相同文件交接与批准边界。

历史Episode及可选模型评测仍使用Story Director、Viral Director、Script Writer、Oral Rewriter、Oral Judge、Audience Critic、Retention Critic的角色定义与旧合同，因此保留相应文件。新一期无需补写这些角色的空报告。旧十一角色的详细说明保存在[清理前交接文档](../../ProductionAgent-legacy-archive/2026-10-26-cleanup/before-edits/agents/README.md)，当前资源与保留理由见[制作资源清单](../docs/production-resources.md)。
