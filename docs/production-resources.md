# 制作文件与资源清单

当前新视频采用 `golden-reference-v1` 与 `source-first-workflow-v1`。截至2026-10-26，最新一期为 [episode-012：Photoroom](../content/episode-012/README.md)；默认创意对照为 [Fastlane V2](golden-workflow/fastlane-v2-quality-baseline.md)。本清单按实际入口、配置与调用关系整理，不把本地结构验证当成成片批准。

## 新一期会读取什么

| 环节       | 文件或资源                                                                                                                   | 用途                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 工作规范   | `AGENTS.md`、[Reference Producer](../agents/reference-producer.md)、[当前执行合同](golden-workflow/README.md)                | 制作范围、职责与批准边界                       |
| 质量对照   | `docs/golden-workflow/fastlane-v2-quality-baseline.md`、`content/episode-009-v2/`、`output/episode-009-v2/vertical_9x16.mp4` | 已认可的文案、画面与成片；保留原字节           |
| 编辑经验   | `docs/golden-workflow/episode-010-feedback-learning.md`、`reference-study.md`、`access-evidence.json`                        | 连续语音节奏、第一秒理解及参考来源             |
| 选题       | `candidates/<product>/story-source-preflight.json`、`docs/contracts/story-source-selection.md`                               | 检查人物需求、产品动作、获客与市场证据的可用性 |
| 研究       | `content/<episode>/research/`，含 `sources.json`、`facts.json`、`timeline.json`、来源笔记与快照                              | 可说事实、原话、日期、口径与证据定位           |
| 创作与审核 | `story/story-spine.md`、`script-draft.md`、`final-script.md`、`critic-report.md`、`fact-check-report.md`、`visual-plan.md`   | 同一故事骨架、自然衔接、事实审核和同期画面     |
| 控制与配置 | `episode.config.json`、`story/workflow.json`、`story/caption-plan.json`                                                      | 标题与Claim、交接状态、字幕意图                |
| 生产输入   | `story/script.json`、`production/asset-manifest.json`、本期媒体recipe与原始素材                                              | 从终稿物化的脚本、素材权利、可复现镜头         |
| 媒体证据链 | `media/` 下的来源准入、assets、indexes、retrieval、verifications、selections、`render-plan.json`                             | 素材来源、人工核验、镜头选择和当前渲染计划     |
| 配音与剪辑 | `production/tts-metadata.json`、`timeline.json`、`captions.generated.json`、`public/episodes/<episode>/`                     | 真实声音、实测切点、字幕及Remotion运行副本     |
| 输出与验收 | `output/<episode>/vertical_9x16.mp4`、`subtitles_zh.srt`、`production/delivery-critic-report.md`、批准记录                   | 实际成片、独立审核和对应字节的批准             |

`downloads/golden-20261013/` 保存三条用户指定参考，仅供本地分析，不作新产品事实或可直接发布的素材。`editorial-calibration/` 保存批准政策与样本边界；intake不自动变成approved样本，隐藏golden也不进入生成侧。`style/voice-guide.md`、`style/approved/`和受政策保护的 `prompts/v4/` 继续用于现有口播校准与模型评测。

## 实际执行的代码与配置

| 范围           | 当前文件                                                                                                     | 作用                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 校验与物化     | `scripts/validate-*.ts`、`materialize-story.ts`、`src/lib/editorial/`、`src/schemas/`                        | 研究、故事、Claim、工作流与生产输入检查                                |
| 配音           | `scripts/generate-tts.ts`、`src/lib/delivery/tts-providers.ts`、`config/tts-v2.json`、`requirements.txt`     | MiniMax与受配置控制的Edge备用；共用网络重试和缓存                      |
| 字幕与时间轴   | `scripts/build-timeline.ts`、`src/lib/delivery/captions.ts`、`config/production-contract.json`               | 真实时长、字幕和逐段停顿                                               |
| 素材           | `src/media/`、`config/media-discovery.json`、`config/media-ingest.json`、本期 `production/media-pipeline.ts` | 准入、下载、索引、人工核验、选择和渲染计划；本期脚本名称按实际工件确定 |
| 当前渲染       | `src/index.ts` → `src/Root.tsx` → `MediaMixEpisode.tsx`、`ReferenceStoryFrame.tsx`、`src/media/remotion.tsx` | 只注册MediaMixVertical；Studio默认预览episode-012                      |
| 渲染路由       | `scripts/render.ts`、`src/lib/episode/render-contract.ts`                                                    | 显式选择当前或历史入口；未知期数仍拒绝渲染                             |
| 文件检查       | `scripts/inspect-output.ts`、`validate-delivery.ts`、`src/lib/delivery/delivery.ts`                          | ffprobe读回、声画边界与Delivery哈希绑定                                |
| 可选检查点编排 | `src/orchestration/`、`config/checkpoint.json`、角色/模型/能力门配置、`.orchestration/`                      | 显式选择LangGraph时运行；六阶段参考内容交接及现有批准/生产图           |
| 共享验证       | `tests/`、`scripts/test-affected.ts`、CI及[验证分层](contracts/verification-layers.md)                       | 与本次改动范围相符的可执行回归                                         |

外部运行资源为Node.js 24.x、pnpm 11.9.0、FFmpeg/ffprobe、Chromium和已配置的配音服务。密钥由环境提供，不写入上述资源清单或归档。

## 保留的历史依赖

前三期手写Composition仍用于历史视频复现，入口独立为 `src/compositions/legacy/index.tsx`。`pnpm render:vertical -- --episode episode-001` 等既有命令会按渲染契约选择该入口；当前 `src/index.ts` 不再导入旧组件或前三期时间轴。旧封面需显式打开历史入口。

旧十一角色文件、模型评测工具和对应配置仍被历史Episode合同及可选LangGraph/benchmark调用，保留这些实际调用关系。它们不作为新一期写稿顺序。Episode 001/002和嵌套Goal 3包也被CI与回归夹具使用，不能按文件日期删除。

旧只读backfill导入器没有生产调用者，已从 `src/orchestration/`及生产barrel导出移走，保存在 `tests/helpers/legacy-import.ts`，只供四组历史引用/日志/检查点回归使用。事实、素材、ArtifactRef、审批、checkpoint兼容检查继续保留。

## 本次清理

归档位于 [ProductionAgent-legacy-archive/2026-10-26-cleanup](../../ProductionAgent-legacy-archive/2026-10-26-cleanup/README.md)，在当前工作区之外；[逐文件清单](../../ProductionAgent-legacy-archive/2026-10-26-cleanup/retired-manifest.json)记录原路径、字节数和SHA-256，移动后已核验。`before.patch`与 `before-edits/` 保存清理前已有改动及本次编辑文件的原始版本；`protected-artifacts.json` 用于核对近期视频与质量基准未变。

| 已移出工作区                                                                                                                                  | 原因                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `prompts/`根目录五份文件、`prompts/v2/`、`prompts/v3/`，共15份早期prompt                                                                      | 没有生产调用；原文按历史保存，当前v4未改                                |
| `src/lib/editorial/llm.ts`及其专属测试用例                                                                                                    | 无生产调用的早期chat helper；现行hosted-chat适配器及网络/TTS测试保留    |
| `src/episode-004-{captions,timeline}.generated.json`                                                                                          | 没有引用的旧投影；现行生成路径为本期 `production/`和 `public/episodes/` |
| `docs/source-first-storytelling-v1/`                                                                                                          | 默认入口建立前的试点计划，与当前制作说明分开存档                        |
| `output/source-first-episode-008-trial-20260904/`、`output/golden-reference-episode-008-20261014/`、`output/golden-reference-smoke-20261013/` | 已结束的试验、旧A/B和重复wrapper，保留原始内容及历史证据                |
| `coverage/`、`.m5-acceptance-cache/`与失效的Prettier忽略条目                                                                                  | 失效的可再生缓存及不存在文件的配置                                      |

共归档1820个文件/符号链接，221,454,124字节（约221 MB）。归档释放的是工作区占用，文件仍保留在同一磁盘。已有视频、基准、来源和批准不因清理而重生成或重新认证。具体验证结果见[本次检查记录](workspace-cleanup-verification.md)。

### 补充清理：agentic workflow历史设计

2026-10-26根据用户追问，另归档18份历史设计与评审文档，共330,222字节，原路径和SHA-256见[补充归档清单](../../ProductionAgent-legacy-archive/2026-10-26-cleanup/agentic-design-manifest.json)：

- `docs/archive/`中的LangGraph架构v0.2、implementation readiness、实施计划、追踪矩阵、Goal 3比较/评审和早期复盘，共7份。
- `docs/decisions/`中的旧口播/模型阶段决策与已落地目录迁移方案，共2份；旧文中的临时TTS限制不作为当前规则。
- M1、M2、M4、M5验收报告，以及已退役legacy backfill说明和已实现的M5开发计划，共6份。
- 已关闭的 `technical-debt-backlog.md` 和两份历史系统/代码评审，共3份。

仍适用的事实与ArtifactRef、人工批准、checkpoint、失败恢复、并发、媒体及验证契约保留；`milestones/m5-01`至`m5-09`说明实际媒体实现，其历史Parent已改指归档计划。此次仅改文档，不移除LangGraph运行实现、测试、配置或持久化数据。补充清理前的文档副本保存在归档 `agentic-design-before-edits/`。两轮合计归档1838个文件/链接、221,784,346字节。

### 补充清理：旧视觉证据、一次性脚本与闲置缓存

第三轮移出7项根路径，共18816个文件/链接、276,685,585字节（约276.7 MB），移动后逐文件SHA-256核验通过，详见[本轮清单](../../ProductionAgent-legacy-archive/2026-10-26-cleanup/residual-manifest.json)：

| 已归档                                                    | 判断依据                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `reports/visual-qa/`、`reports/visual-review-story-v4.md` | 早期Poke抽帧与183.6秒旧版视觉检查，实际引用仅在该历史报告内部；配套保存                                                                   |
| `reports/environment.md`、`reports/selection-decision.md` | 2026-07-28环境快照仍写Edge无需凭据；根目录选题记录仅转指episode-001研究包，没有当前执行调用                                               |
| `reports/m5-acceptance/`                                  | 6份M5历史验收脚本/证据，无src/scripts/tests/CI调用；当前E2E继续由 `tests/media-e2e.test.ts` 与 `tests/helpers/media-e2e-pipeline.ts` 承担 |
| `.pnpm-store/`                                            | pnpm实际store及 `node_modules/.modules.yaml` 均指向 `/Users/zengze/Library/pnpm/store/v11`；已扫描本仓库symlink，0项依赖本地旧store       |
| `style-samples/`                                          | 仅有空的accepted目录；当前风格样稿位于 `style/approved/`                                                                                  |

仍保留 `reports/design-concept-9x16.png`，因为两份历史asset manifest引用它；`reports/episode-004/005`是本期素材处理配方，继续保留。近期视频修订快照、源媒体、`.orchestration/`、`node_modules/`、`.venv/`和当前Remotion编译缓存都有复现、运行或性能用途。

旧十一角色、role benchmark/rollout及旧内容循环仍有实际调用；整套移除将是功能退役，需要同步代码、配置、契约及回归，不能按无引用文件直接删除。当前未执行该功能裁剪。三轮合计归档20654个文件/链接、498,469,931字节；归档保留在同一磁盘，不表示释放了相同的磁盘空间。
