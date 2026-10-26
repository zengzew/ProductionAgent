# 本地验证记录

以下为历史实现证据，不是当前操作入口。相关Episode-008试验包已于2026-10-26移出工作区，位置见[清理记录](../production-resources.md#本次清理)。

## 2026-10-14：内容迁移与运行入口

- Episode-008 的研究和原始媒体已复制到独立制作目录，新稿 10 段、剪辑预算 63 秒；旧 A/B 成片保留。
- 新 LangGraph 入口实际导入六阶段工件，停在 `content-approval`；`completedAgents` 为空，`productionAuthorization` 为空。没有执行旧十一角色内容循环，也没有自动批准。
- `node --import tsx scripts/test-affected.ts`：25 个文件、144 项通过。新增断点测试在 narrative 文件缺失时暂停，补齐后恢复到内容批准。
- 类型检查和新增交接模块、主图、测试映射及回归测试的 scoped ESLint 通过。下述既有 entrypoint lint 错误仍未处理。
- 新包 `validate:episode --profile fast`、`validate:story`、`validate:content --pre-production` 通过。正式 production/release 验收尚未完成。
- 外部 TTS 请求最初被自动审批拒绝；用户明确回复“允许发送并生成配音”后，已通过 MiniMax／阿里云 DashScope 生成十段配音，没有切换备用服务。
- 按真实 TTS 重建时间轴、八段派生视频和两段图示／截图，既有 MediaMixVertical 渲染得到 55 秒有声版。全片解码、`inspect:output` 与 production 验证通过；音频峰值 -1.7 dB，29 条字幕，最短 0.92 秒。新媒体标签支持逐段覆盖，14 项媒体渲染测试、类型检查和 scoped ESLint 通过。
- 有声版关键帧已逐段检查，服务端时间戳文字与十段稿件一致。离线 ASR 依赖缓存不完整，未完成独立转写或听辨。Release 检查停在缺少正式 Delivery 报告，未生成用户或独立审核批准。
- 已渲染完整 63.061333 秒无声分镜（1080×1920、30 fps），全片解码通过，检查了十段关键帧。预览与证据见 `output/golden-reference-episode-008-20261014/`；无声分镜使用稿件预算，不伪造 TTS 或正式成片记录。运行包中的旧生产工件只用于保留历史链路。

## 2026-10-13：首轮实现

2026-10-13，Node 24.13.0，在现有 `master` 工作区完成；原有 Source-First 修改和 Episode 工件保留。

- 三条样本的完整视频、完整音轨均成功解码，文件信息与哈希见 [access-evidence.json](access-evidence.json)。画面抽样覆盖全片；音轨做全片离线转写与响度测量，没有完成音乐、音色的听辨。
- `node --import tsx scripts/test-affected.ts`：22 个文件、135 项通过。这与 `pnpm test:affected` 使用同一脚本；直接 `tsx` 启动受本地 IPC 沙箱限制。
- `pnpm typecheck` 通过；本次实现文件的 ESLint 通过。`production-entrypoint.ts` 仍有 7 个既有 unused-vars 错误，单独对 HEAD 原文件验证得到相同错误；不宣称全库 lint 通过。
- `node --import tsx scripts/validate-episode.ts --episode episode-008 --profile production` 通过，证明既有 Episode 的兼容性。它仍使用旧格式，不是新格式成片验收。
- Remotion 实际渲染 90 帧：1080×1920、30 fps、H.264/AAC，容器时长 3.050667 秒。检查输出帧后，标题、产品证据、来源和字幕没有互相遮挡。预览见 `output/golden-reference-smoke-20261013/preview.mp4`。
- `git diff --check` 通过。未运行全量 Vitest／coverage，CI 的 Contract 检查仍按既有规则执行。

新增回归覆盖短开场、显式段尾覆盖、标题修改后审核失效、视觉方案缺项、标题进入渲染计划并随配置变化失效、不支持的 PiP 拒绝，以及新格式误入旧 LangGraph 时明确报错。

预览复用 Episode-008 的旧旁白和官方演示裁切，只检验渲染组件；不是新的开场方案，也不含新的事实或 Delivery 批准。新人工文件交接流程、验证和版式已接入；旧 LangGraph 内容循环未迁移。完整新 Episode、听感和人工对照观看尚未完成，因此没有“已复刻同等效果”的结论。
