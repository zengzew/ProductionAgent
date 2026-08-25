# 技术债 Backlog：v1/v2 双轨与共享能力

本清单保留 code review 2026-08-09 中等项 14–20 的 2026-08-10 维护记录，不代表之后 checkout 的依赖安装或媒体回归结果。TD-001～007 已于该轮完成代码收敛；TD-004 仍需补 Episode 001/002 的 9:16 smoke render 验证。该轮本机 Chrome 在沙箱内以 `SIGABRT` 退出，沙箱外执行又被 Codex 用量额度拦截，因此不能把 smoke 标成 PASS。该轮没有调用真实 TTS，也没有以工程结果替代独立人工听审和完整 Delivery approval；历史完整 MP4 与 Delivery Critic 结论不因维护性重构自动续期。

## TD-001：清理 v1 TTS、pipeline 与旧配置

- 状态：**完成**。
- 调用关系结论：`src/lib/tts.ts` 只调用 `pipeline-config.ts`，后者只读取 `config/tts.json`；旧 `polish.json` 只引用旧 `polish-style.json`。仓库脚本、测试和生产入口均未调用这五个文件。
- 迁移决定：删除上述五个死文件，不保留会继续漂移的 deprecated 运行层。TTS 唯一生产实现为 `src/lib/tts-providers.ts` + `config/tts-v2.json`；旧 standalone polish 入口已删除，口语改写与评审只走角色合同和 role rollout。继续排除通用 provider/API-key UI 和自部署模型。
- 兼容边界：历史研究报告保留原文；现役 README 与 LangGraph 实施映射已改指向 v2 文件。

## TD-002：统一禁用写法与 polish 风格规则的唯一来源

- 状态：**完成**。
- 唯一真源：`config/editorial-text-rules.json`（`editorial-text-rules-v1`），由 `src/lib/editorial-text-rules.ts` 统一做 schema、正则、作用范围、字符计数和兼容例外校验。
- 调用方：polish、`validate-story` 和 `validate-content` 都通过同一 `findTextRuleViolations` 执行禁用规则；规则自带逐规则回归样例，测试保证三个作用域得到相同决定。
- 长度语义：统一为“去空白后的 Unicode code point 数”；25 字是目标、36 字只在 polish 硬约束中执行。数字口播同样显式限定为 polish 作用域，避免 validator 暗含另一套阈值。
- 兼容决定：Episode 001 已绑定交付的 `Beta 用户` 旧措辞只按 episode ID + 完整旁白 SHA-256 豁免；文本一旦变化，例外自动失效。

## TD-003：集中维护全局与 episode 级生产常量

- 状态：**完成**。
- 全局真源：`config/production-contract.json`（`production-contract-v1`）保存目标时长、时长窗口（下限/上限）、fps、竖版尺寸、默认 Hook/body 尾部留白、字幕行宽与微短 cue 阈值、Hook 时长/动作词/归因动词和素材捕获等待参数。
- episode 真源：`episode-config-v2` 只保留目标时长、逐段尾部留白覆盖、Hook 归因主体以及素材 URL/文件/可选唯一锚点。全局 fps、硬时长和画幅已从四份 episode 配置删除。
- 调用方：`build-timeline`、`inspect-output`、`validate-comparison`、`validate-delivery`、`evaluation`、`validate-story`、`validate-content` 和 `capture-assets` 均读取共享契约；通用脚本不再出现 `seg-010/011/012`、Poke/Cognition、80/180 或 30 fps 的本地判断。
- 验证边界：已对 Episode 001 和 Episode 002 运行 research/workflow/story/content，并用两期历史已批准 MP4 复跑 delivery validator；Episode 001 另复跑 comparison。历史 FFprobe/hash 契约均通过，但本轮没有调用真实 TTS、生成新媒体、完成 smoke 画面抽查或独立人工听审，因此不声明媒体重新验收。

## TD-004：抽取共享 Episode 视觉组件

- 状态：**完成**。
- 共享边界：`src/compositions/shared.tsx` 只承载 `CaptionLayer`、`BackgroundCanvas`、噪点、`CLAMP`、`SourceLabel` 和来源身份工具；episode 事实、颜色、字号、位置与布局全部由显式 props 注入。
- 口径：来源身份统一为 `inference > company-reported > founder-reported > independently-verified`；来源 publisher 按输入顺序去重，不再由两个 Episode 各自决定优先级。
- 清理：Roost 的固定暗色分支与 Poke 未注册的横版成片分支已物理删除。保留的 3:4 Cover 是当前显式注册的封面 Composition，不属于已删除的横版视频路径。
- 验证：共享工具测试覆盖口径优先级和来源去重；两期 9:16 smoke render 与首帧、代表帧检查因上述环境阻塞仍待补，不影响代码项关闭，但阻止本轮媒体验收完成。

## TD-005：抽取校验脚本公共模块

- 状态：**完成**。
- 公共入口：`scripts/lib/validation.ts` 统一 SHA-256、带路径 JSON/schema 读取、artifact 读取、错误收集、`fatal` 与 `exitCode`；`process.ts` 统一 `spawnSync`/stderr/启动失败/有限数字/FFprobe；`caption-artifacts.ts` 统一字幕覆盖与生成字幕一致性。
- 调用方：所有 `validate-*`、timeline、render 与 inspect CLI 已迁移；生成物路径只通过 render contract 解析，不再复制 `generatedPrefix` 拼接。
- 错误语义：可聚合校验错误统一设置 `process.exitCode = 1`；未捕获 CLI 错误只输出可操作消息，不打印堆栈；`spawnSync` 的启动失败、非零状态与无效数值都 fail closed。

## TD-006：统一测试夹具与评分计算入口

- 状态：**完成**。
- 共享夹具：`tests/helpers/` 提供 artifact/index、critic、revision、freeze 与历史 Episode 临时仓库 fixture；critic fixture 的总分、floor、blocker 和 verdict 全部调用生产 `recomputeCriticEvaluation`。
- 独立性：历史导入与 CLI 入口测试不再依赖 worktree 中是否存在 ignored MP4 或其他无关生成文件。
- 覆盖率：新增 `test:coverage`，只统计可单元测试的 `src/**/*.{ts,tsx}`，排除 generated JSON、Remotion Composition 和注册入口；最低阈值为 statements 60%、branches 55%、functions 65%、lines 60%。Composition 由两期真实 smoke render 补足验证。

## TD-007：清理单集特化脚本与旧兼容层

- 状态：**完成**。
- 已删除：无调用方的 content-loop graph/revision 别名、freeze 输入/manifest 别名、`claimSchema`/`Claim`、ownership config 别名，以及 best-selection 的多套参数名。
- 已显式化：通用 timeline/validator/render 脚本不再携带单集 seg-id、品牌或旧生成物拼接；尾部留白、Hook 主体、素材捕获与生成物前缀分别来自 episode config、production contract 和 render contract。Episode 001 的 `poke-*` 生成物前缀仍由显式 render contract 保留，因为当前 Root import、已审计 timeline 与媒体 hash 都绑定该文件名；它不再是隐式 fallback，未知 episode 会 fail fast。
- 有意保留：`legacy-import.ts` 和 critic envelope adapter 只用于读取不可改写的历史 source-of-truth/旧评审 metadata，并有独立测试；它们不会被当前生产路径自动回退调用。Episode 001 文本兼容例外同样绑定 episode ID 与完整旁白 SHA-256，文本变化即失效。

## 当前修复状态与剩余有意保留项

TD-001～007 没有剩余可执行代码项；该轮唯一未闭合的是 TD-004 的双期 smoke 验证环境阻塞。另有三项有意保留的契约边界：历史只读 adapter 保护不可改写 artifact；Episode 001 的显式 `poke-*` 前缀保护当前渲染导入和 hash 绑定；当前人工 artifact 生产路径不增加自动跨越故事门禁、联网 TTS 和 Delivery Critic 的单命令 `pipeline`。已验收的 M1–M4 LangGraph control plane 不改变这条边界。M3 HITL 与 production orchestration 已在 `src/orchestration/` 落地，并由 HITL/production/unfreeze 测试和 `docs/milestones/m4-acceptance-report.md` 覆盖；M3 没有单独的 acceptance report。后续若要迁移这些边界，必须作为带 artifact 迁移、媒体重渲与独立 Delivery 复审的产品范围任务处理。
