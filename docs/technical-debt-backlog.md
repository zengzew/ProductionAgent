# 技术债 Backlog：v1/v2 双轨与共享能力

本清单对应 code review 2026-08-09 的中等项 14–20。TD-001～003 已于 2026-08-10 完成代码与非媒体门禁收敛；TD-004～007 仍待实施。此次没有重新生成 TTS、字幕、时间轴或 MP4，也没有做新的媒体交付验收；历史媒体和 Delivery Critic 结论不因本次配置治理自动续期。

## TD-001：清理 v1 TTS、pipeline 与旧配置

- 状态：**完成**。
- 调用关系结论：`src/lib/tts.ts` 只调用 `pipeline-config.ts`，后者只读取 `config/tts.json`；旧 `polish.json` 只引用旧 `polish-style.json`。仓库脚本、测试和生产入口均未调用这五个文件。
- 迁移决定：删除上述五个死文件，不保留会继续漂移的 deprecated 运行层。TTS 唯一生产实现为 `src/lib/tts-providers.ts` + `config/tts-v2.json`；polish 唯一生产入口为 `src/lib/polish.ts` + `config/polish-v2.json`。继续排除通用 provider/API-key UI 和自部署模型。
- 兼容边界：历史研究报告保留原文；现役 README 与 LangGraph 实施映射已改指向 v2 文件。

## TD-002：统一禁用写法与 polish 风格规则的唯一来源

- 状态：**完成**。
- 唯一真源：`config/editorial-text-rules.json`（`editorial-text-rules-v1`），由 `src/lib/editorial-text-rules.ts` 统一做 schema、正则、作用范围、字符计数和兼容例外校验。
- 调用方：polish、`validate-story` 和 `validate-content` 都通过同一 `findTextRuleViolations` 执行禁用规则；规则自带逐规则回归样例，测试保证三个作用域得到相同决定。
- 长度语义：统一为“去空白后的 Unicode code point 数”；25 字是目标、36 字只在 polish 硬约束中执行。数字口播同样显式限定为 polish 作用域，避免 validator 暗含另一套阈值。
- 兼容决定：Episode 001 已绑定交付的 `Beta 用户` 旧措辞只按 episode ID + 完整旁白 SHA-256 豁免；文本一旦变化，例外自动失效。

## TD-003：集中维护全局与 episode 级生产常量

- 状态：**完成**。
- 全局真源：`config/production-contract.json`（`production-contract-v1`）保存严格时长上限、fps、竖版尺寸、默认 Hook/body 尾部留白、字幕行宽与微短 cue 阈值、Hook 时长/动作词/归因动词和素材捕获等待参数。
- episode 真源：`episode-config-v2` 只保留目标时长、逐段尾部留白覆盖、Hook 归因主体以及素材 URL/文件/可选唯一锚点。全局 fps、硬时长和画幅已从四份 episode 配置删除。
- 调用方：`build-timeline`、`inspect-output`、`validate-comparison`、`validate-delivery`、`evaluation`、`validate-story`、`validate-content` 和 `capture-assets` 均读取共享契约；通用脚本不再出现 `seg-010/011/012`、Poke/Cognition、180 或 30 fps 的本地判断。
- 验证边界：已对 Episode 001 和 Episode 002 运行 research/workflow/story/content 非媒体 validator。没有调用真实 TTS、浏览器、渲染、FFprobe 媒体读回或 Delivery Critic，因此不声明媒体重新验收。

## TD-004：抽取共享 Episode 视觉组件

- 背景：Poke 和 Roost 组件中重复了 `CaptionLayer`、背景/噪点、clamp、来源标签等实现，局部口径还存在差异。
- 目标：抽出不携带 episode 事实的共享视觉组件和动画工具；事实标签、颜色、布局和场景内容通过显式 props 或 episode 配置注入，并保留两期的竖版视觉回归证据。
- 影响范围：`src/compositions/PokeEpisode.tsx`、`RoostEpisode.tsx`、共享 UI/动画模块、Root composition、视觉截图与渲染测试。
- 预估工作量：2–3 人日。
- 建议优先级：P2，先完成 TD-003，避免把配置问题固化进抽象层。

## TD-005：抽取校验脚本公共模块

- 背景：多个 `validate-*.ts` 重复实现文件哈希、生成物路径、字幕一致性检查和错误收集/退出逻辑，修复容易只覆盖一处。
- 目标：建立 `scripts/lib/` 公共校验工具，统一错误格式、退出码、哈希读取、timeline/caption 读取和 episode render contract 使用方式。
- 影响范围：research、workflow、story、content、comparison、delivery 校验脚本及其入口冒烟测试。
- 预估工作量：1.5–2.5 人日。
- 建议优先级：P2，与 TD-003 配套实施。

## TD-006：统一测试夹具与评分计算入口

- 背景：content loop、critic output 和 revision 测试存在近似重复的 critic/artifact 夹具，部分测试还手工重算生产评分公式。
- 目标：把 artifact、critic result、revision 和 freeze fixture 放入 `tests/helpers/`，评分统一调用生产侧 `recomputeCriticEvaluation`，并保持失败路径的最小可读样例。
- 影响范围：`tests/orchestration/*`、critic/revision 测试、后续新增 episode 与门禁测试。
- 预估工作量：1–1.5 人日。
- 建议优先级：P2，建议与 TD-005 同一测试整理迭代完成。

## TD-007：清理单集特化脚本与旧兼容层

- 背景：旧兼容别名、单集 seg-id 判断和旧 artifact 命名约定会让通用脚本继续携带历史分支，新增 episode 时容易出现静默回退。
- 目标：在 TD-003 完成后逐项迁移到 episode 配置或显式 render contract，删除无调用方的兼容别名；对旧产物提供一次性迁移说明，不保留隐式 fallback。
- 影响范围：timeline、asset capture、story/content validator、legacy export、历史 output 与文档。
- 预估工作量：2–3 人日，需先完成依赖盘点。
- 建议优先级：P2，安排在 TD-001 和 TD-003 之后。

## 建议排期

下一轮只处理 TD-004～007：先评估 TD-004 的共享视觉组件与真实竖版回归成本；TD-005/TD-006 处理 validator 公共模块和测试夹具/评分入口；TD-007 再清理剩余 render contract、旧别名、音效 seg-id 和历史 artifact 命名兼容。媒体相关条目关闭前仍需重新生成受影响产物并完成竖版读回与 Delivery Critic，不能复用本轮非媒体结果代替。
