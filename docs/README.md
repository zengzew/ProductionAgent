# 文档入口

新一期先读[当前制作流程](golden-workflow/README.md)、[Fastlane V2质量基准](golden-workflow/fastlane-v2-quality-baseline.md)和[制作文件与资源清单](production-resources.md)。[角色交接](../agents/README.md)说明各职责读什么、写什么。

| 目录               | 用途                                                |
| ------------------ | --------------------------------------------------- |
| `golden-workflow/` | 当前生产流程、参考观察、质量基准和人工反馈          |
| `contracts/`       | 当前事实、素材、ArtifactRef、批准、检查点与验证契约 |
| `milestones/`      | 仍适用的恢复、并发与媒体实现说明；按模块查阅        |

工程变更优先查[验证分层](contracts/verification-layers.md)、[Artifact契约](contracts/artifact-contract.md)及[媒体渲染契约](milestones/m5-08-media-remotion.md)。模型评测的可选工具分别见[评测](role-model-benchmark.md)、[自动修复](role-model-auto.md)和[灰度配置](role-model-rollout.md)。

早期LangGraph架构草稿、实施计划、追踪矩阵、已结束的验收与评审已移到工作区外[历史归档](../../ProductionAgent-legacy-archive/2026-10-26-cleanup/README.md)。旧设计不作为当前制作规则；ArtifactRef、checkpoint、人工批准、恢复、并发与媒体契约继续保留。完整清理范围见[资源清单](production-resources.md#本次清理)。
