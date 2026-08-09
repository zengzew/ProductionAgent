# 技术债 Backlog：v1/v2 双轨与共享能力

本清单对应 code review 2026-08-09 的中等项 14–20。当前只完成规划，不在本轮实施。排期应以当前 `v2` 生产链稳定、已有 episode 产物可回归为前提；删除旧链路或抽取组件时，必须保留现有竖版渲染、字幕和门禁证据。

## TD-001：清理 v1 TTS、pipeline 与旧配置

- 背景：`src/lib/tts.ts`、`src/lib/pipeline-config.ts`、`config/tts.json`、旧 `polish.json` 与 `polish-style.json` 已没有明确调用方，且旧规则与 v2 配置存在漂移。
- 目标：完成调用关系盘点和迁移确认后，将旧链路标记 deprecated 并删除死代码、旧配置和无效入口；保留 v2 作为唯一生产实现。
- 影响范围：TTS、polish、配置文件、package scripts、文档、测试夹具和历史运行说明。
- 预估工作量：1–2 人日。
- 建议优先级：P1，依赖现有 v2 TTS/交付门禁先保持稳定。

## TD-002：统一禁用写法与 polish 风格规则的唯一来源

- 背景：`validate-story.ts`、`validate-content.ts` 和 `config/polish-v2-style.json` 各自维护规则，正则集合和长度上限已经不一致。
- 目标：建立一个带版本号的共享规则模块或规范配置，由 polish、story validator 和 content validator 共同读取；为规则变更保留明确的回归样例。
- 影响范围：旁白生成、polish judge、Story Pipeline、内容门禁、配置 schema 和相关测试。
- 预估工作量：1–1.5 人日。
- 建议优先级：P1，避免同一稿件在不同门禁得到相反结论。

## TD-003：集中维护全局与 episode 级生产常量

- 背景：180 秒上限、30 fps、字幕/音频尾部留白、Hook 品牌词和若干 episode 特化规则分散在多个脚本中，新 episode 需要改代码才能适配。
- 目标：区分全局交付约束与 episode 配置，把时长、帧率、尾部留白、Hook 检查和素材锚点纳入可校验的配置契约；所有 validator 和渲染脚本只读取同一来源。
- 影响范围：`build-timeline`、`validate-content`、`validate-comparison`、`validate-delivery`、`evaluation`、`inspect-output`、episode config schema。
- 预估工作量：1.5–2 人日。
- 建议优先级：P1，先于继续增加新 episode。

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

先做 TD-001、TD-002 和 TD-003，形成单一配置与规则来源；随后并行推进 TD-004 的视觉抽取和 TD-005/TD-006 的工程整理；最后处理 TD-007 的兼容层清理。每个条目关闭前都应至少通过 `pnpm typecheck`、`pnpm test`、相关 episode 的 `validate:content`，以及受影响的竖版渲染与交付门禁。
