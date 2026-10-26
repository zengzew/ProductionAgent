# AI Product Storytelling Studio

制作有来源支撑的中文产品故事视频：1080×1920、9:16，目标60秒，实际成片40–80秒。事实决定可说边界，故事和画面让观众看懂人物需求、产品动作、获客过程与有来源的市场回应。

新一期从 [Reference Producer](agents/reference-producer.md) 开始，执行[当前制作流程](docs/golden-workflow/README.md)，对照用户认可的 [Fastlane V2质量基准](docs/golden-workflow/fastlane-v2-quality-baseline.md)。按来源与画面预研、共享Spine、脚本改编、独立事实审核、视觉定稿、真实声音剪辑及成片检查推进。[制作文件与资源清单](docs/production-resources.md)列明各阶段的输入、代码、配置及本次legacy清理范围。

## 当前视频与参考

| 用途               | 入口                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 最新一期 Photoroom | [episode-012](content/episode-012/README.md)、[本地成片](output/episode-012/vertical_9x16.mp4)                     |
| 默认质量基准       | [Fastlane V2成片](output/episode-009-v2/vertical_9x16.mp4)、[最终稿](content/episode-009-v2/story/final-script.md) |
| 连续听感与人工反馈 | [Episode-010反馈复盘](docs/golden-workflow/episode-010-feedback-learning.md)                                       |
| 职责和交接         | [agents/README.md](agents/README.md)                                                                               |
| 工程契约和验证     | [docs/README.md](docs/README.md)                                                                                   |

Episode-012已生成本地观看版；完整听感、独立Delivery和最终批准仍以本期记录为准。旧视频的认可不能代替新一期事实、权利或Delivery验收。

## 本地环境

需要Node.js 24.x、pnpm 11.9.0、FFmpeg/ffprobe、Chromium；Edge备用配音使用Python环境。

```bash
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

配音读取 `config/tts-v2.json`：默认通过阿里云Model Studio调用MiniMax，凭据来自 `QWEN_API_KEY`；是否允许Edge备用及响度参数均由该配置控制。真实TTS的外部请求需处于本期授权范围内，不在仓库保存密钥。项目不部署GPT、LLM或语音模型服务。

## 制作命令

所有命令显式指定本期 `--episode`；示例ID需替换为正在制作的期数。分阶段执行，完成对应审核后再继续。

```bash
pnpm validate:story-source -- --candidate candidates/photoroom/story-source-preflight.json
pnpm validate:episode -- --episode episode-012 --profile fast
pnpm validate:story -- --episode episode-012
pnpm materialize:story -- --episode episode-012
pnpm validate:content -- --episode episode-012 --pre-production
# 内容及配音授权就绪后
pnpm tts -- --episode episode-012
pnpm timeline -- --episode episode-012
# 完成本期媒体准入、索引、人工核验和选择后
pnpm media:render-plan -- --episode episode-012
pnpm render:smoke -- --episode episode-012
pnpm render:vertical -- --episode episode-012
pnpm inspect:output -- --episode episode-012
# 实际成片审核完成后
pnpm validate:episode -- --episode episode-012 --profile release
```

`pnpm preview` 打开当前MediaMix预览，默认展示episode-012。当前入口 `src/index.ts` 只注册 `MediaMixVertical`；前三期的历史组件由显式渲染契约选择独立入口，见[资源清单](docs/production-resources.md)。

默认 `ORCHESTRATOR=manual`，由人工或任意Agent Harness按角色文件执行。可显式选择检查点编排：

```bash
ORCHESTRATOR=langgraph pnpm orchestrate -- --episode episode-012 --run <new-run-id>
ORCHESTRATOR=langgraph pnpm orchestrate -- --episode episode-012 --run <new-run-id> --resume
```

参考格式采用六个内容交接阶段，再进入正式内容批准和现有生产图；缺失外部能力或批准时暂停。编排不推断批准、不上传或发布，检查点只保存ArtifactRef。[批准协议](docs/contracts/human-decision.md)、[生产适配器](docs/contracts/production-adapters.md)及[检查点契约](docs/contracts/checkpoint-persistence.md)继续适用。

## 验证

本地修改运行 `pnpm test:affected`；修改Episode时再运行该期 `validate:episode --profile fast`。hash、checkpoint或媒体关键模块按[验证分层](docs/contracts/verification-layers.md)选择Contract检查，CI只跑一次coverage。新一期以真实素材、TTS、MP4、独立成片检查和人工批准验收；结构校验不证明创意质量或留存。`story-approved`不等于Delivery通过，本项目不自动上传或发布。
