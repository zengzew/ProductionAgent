# 全面代码审查报告 — 2026-08-09

审查范围：`src/`（编排层、lib、compositions）、`scripts/`（14 个 CLI）、`config/`（7 个 JSON）、`tests/`（26 个文件），合计约 1.7 万行 TS/TSX。

## 客观健康状况（本次实测）

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit`（strict + noUncheckedIndexedAccess） | 通过，0 错误 |
| `eslint . --max-warnings=0` | 通过，0 警告 |
| `vitest run` | **Node 24 下 26 文件 119/119 通过**；Node 22 下 4 个 checkpoint 相关测试因 better-sqlite3 原生绑定 ABI（NODE_MODULE_VERSION 137 vs 127）失败 |

整体设计水平明显高于一般原型：zod schema 贯穿数据边界、critic 评分服务端重算防模型算术造假（`evaluation.ts`）、freeze 前字节级 hash 校验、reducer 交换律/幂等性质测试、checkpoint 不含正文的 reference-only 约束，都是成熟做法。主要短板集中在：渲染入口与 episode 数据脱钩、网络层无超时/重试、v1/v2 双轨残留、编排失败路径测试盲区。

---

## 【严重】

### S1. 渲染入口与新 episode 静默错配，会产出错误成片
- **位置**：`scripts/render.ts:42,48`；`src/compositions/PokeEpisode.tsx:13`、`RoostEpisode.tsx:13`；`scripts/build-timeline.ts:161-163`；`scripts/validate-content.ts:182`
- **问题**：composition 选择是 `episodeId === "episode-002" ? "Roost" : "Poke"`，除 episode-002 外一律落到 Poke；而两个 composition 都硬编码 import 具体 generated timeline JSON。`content/` 下已存在 `episode-001-v2-goal3` 等集数，build-timeline 会为其生成 timeline 文件，但没有任何 composition 加载它——对新集数运行 `render:vertical` 会**无报错渲染出旧集数的成片**。validate-content 在 generated JSON 缺失时静默跳过校验，全链路无人发现。
- **建议**：episode→composition 改为显式映射表，未知 episode fail-fast；渲染前校验 composition 加载的 timeline 与当前 episodeId 一致；validate-content 对 generated JSON 缺失报错而非跳过。

### S2. 短场景下 `fadeScene` 的 interpolate 输入范围非单调，动画错乱
- **位置**：`src/compositions/PokeEpisode.tsx:59-60`（`RoostEpisode.tsx:658-663` 同构）
- **问题**：`interpolate(frame, [0, 10, Math.max(11, duration - 10), duration], [0,1,1,0], clamp)`。当 `durationFrames ≤ 11` 时范围变为 `[0, 10, 11, 8]` 这类非递增序列，interpolate 输出错乱，场景可能全程透明或闪帧。schema 只要求 `durationFrames` 为正数，不阻止短场景。
- **建议**：构造范围前 clamp 保证单调性，或对 duration < 22 降级为简单线性淡入淡出。

### S3. MiniMax TTS 与 LLM 的 fetch 全线无超时、无重试
- **位置**：`src/lib/tts-providers.ts:173,204`；`src/lib/llm.ts:12,31-36`
- **问题**：fetch 无 `AbortSignal.timeout`，对端挂起时整条生产 pipeline 无限期阻塞；MiniMax 按句串行合成，任何一句挂起卡死全片。`chatJson` 解析失败时错误不含返回内容片段，网络抖动无重试，polish 多轮调用任一瞬时失败即废弃整轮。
- **建议**：所有 fetch 加 `AbortSignal.timeout`（可配置化）；chatJson catch 后附 `content.slice(0, 500)`；对 5xx/网络错误做 1-2 次指数退避。

### S4. 编排层失败/升级路径与生产执行层几乎无测试保护
- **位置**：`src/orchestration/graph/content-subgraph.ts:916,924,937,940,1038`；`src/orchestration/freeze.ts:301-323`；`src/lib/tts-providers.ts:324-349`
- **问题**：(a) content-subgraph 1092 行只有 1 条 happy-path 用例，escalated/needs-revision/再拒路径零覆盖，`evaluateContentGate` 从未被直接测；(b) freeze.ts 一半前置条件未测，含 **hash 字节校验这条 freeze 核心安全保证**；(c) TTS 回退逻辑（missing-credential、on-error、拒绝路径）全部未测，且 provider/config/env 硬编码在模块内导致**当前结构不可测**；(d) 全部 `scripts/validate-*.ts`（CI 门禁入口）无回归保护。
- **建议**：按风险顺序补测试——content-subgraph 三条主路径用例 → TTS 回退（先改依赖注入）→ freeze 每种 reason 一条 + 篡改字节用例 → validate 脚本临时目录退出码冒烟。

### S5. Roost 渲染靠内容嗅探切换版式、按下标分发场景
- **位置**：`src/compositions/RoostEpisode.tsx:20-22, 341-617`
- **问题**：`isGoal3Benchmark` 靠 `onScreenText` 包含"伊丽莎白时代"判断——改一句文案静默改变整片布局；`SceneVisual` 用 `scene.index === 0..10` 硬编码分支——时间线增删一个场景，其后所有分支错位渲染。PokeEpisode 按 `scene.scene` 名字分发的做法明显更稳。
- **建议**：版式标识进 timeline/scene 显式字段（schema 加枚举）；场景分发统一按场景名字符串。

---

## 【中等】

### 正确性 / 契约

1. **渲染层用 `as` 断言绕过已有 zod schema**（`PokeEpisode.tsx:19-21`、`RoostEpisode.tsx:19-24`）：`src/schemas/episode.ts` 已定义 `timelineSchema` 等却未用，数据漂移会延迟到渲染阶段以 undefined 行为暴露。改为 `timelineSchema.parse(...)` 在加载早期报错。
2. **`sameRubric` 不比较 `dimensionFloors`**（`revision.ts:388-390`）：floors 变化但 rubricVersion/threshold 不变时仍视为可比，floor-crossed 判定沿用旧 floor。建议把 dimensionFloors 纳入可比性判断。
3. **`checkProtectedConstraints` 只查 artifactId 存在、不比对 sha256**（`revision.ts:616-619`）：受保护约束的产物内容变了也能通过。与全库其他地方严格的 hash 比对不一致，建议补上。
4. **freeze 门禁对畸形 issue 宽松降级**（`freeze.ts:100-127`）：手工 `isRecord` 解析，severity 非字符串静默降为 "info"、status 非字符串默认 "open"。无法识别的 issue 应计为待确认而非放行；有 zod schema 应复用。
5. **`execution.started` 事件在 agent 执行完成后才 emit**（`main-graph.ts:57,136-137`）：started/completed 两条事件同时发出，运行中途无可观测性。started 应在调用 runAgent 前 emit。
6. **音效挂载硬编码 seg-id 与帧偏移，找不到场景时静默落到第 0 帧**（`PokeEpisode.tsx:2137-2167`）：`sceneStart` 返回 0 会把音效叠到片头；`seg-010` 的 5 个 pulse 偏移写死，重配音后时长变短会溢出到下一场景。找不到时应跳过该音效，偏移按 `durationFrames` 比例计算。
7. **`fill` 模板静默吞未匹配占位符**（`polish.ts:164-165`）：`?? ""` 让拼错的 `{{PLACEHOLDER}}` 消失无踪。未命中应 warn 或 throw。
8. **polish 生成的 caption plan 与下游校验不自洽**（`polish.ts:267-272` vs `captions.ts:99-101,165-166`）：超长 token 独占行可超 16 字，但 `captionPartsFromPlan` 按 16 字校验会 throw。polish 写出前应自检一遍。
9. **`readJson` 解析失败不含文件路径**（`src/lib/project.ts:19-20`）：14 个脚本全部受影响。包一层 try/catch 附 `filePath`。
10. **CLI 参数解析互相干扰**（`project.ts:6-9` vs `render.ts:7`）：`tsx render.ts --episode x` 会把 `--episode` 当 mode 抛错；多余未知参数一律静默忽略。建议统一 named-flag 解析。
11. **测试环境敏感**：`story-pipeline` 等多个测试从 `process.env.EPISODE_ID`/`argv` 解析 episode（`project.ts:6-9`），`EPISODE_ID=episode-002 pnpm test` 会让测试读错目录。测试内应显式 `vi.stubEnv` 固定。
12. **checkpoint 测试断言依赖 SQLite 明文存储**（`checkpoint-resume.test.ts:84-87`）：checkpointer 改序列化格式后变成恒真断言。改用 `graph.getState` 反序列化后断言。
13. **capture-assets 是 episode-001 专用脚本却在通用流水线**（`capture-assets.ts:33-62`）：URL、锚点标题全硬编码，锚点未命中静默继续截图。目标 URL/锚点移入 episode 配置，未命中 fail。

### 双轨残留 / 规则漂移

14. **v1 链路整套死代码**：`src/lib/tts.ts`、`pipeline-config.ts`、`config/tts.json`、`polish.json`、`polish-style.json` 均无调用方，且 `polish-style.json` 缺 v2 必需字段、`bannedTerms` 两份已漂移。删除或文件头标 deprecated。
15. **禁用写法规则三个真源且已漂移**：`validate-story.ts:274-295`（12 组正则）、`validate-content.ts:102-111`（5 组子集，"不是…而是"上限 40 vs story 的 50）、`config/polish-v2-style.json`（纯字符串）。polish 放行的文本可能被 validator 拦，反之亦然。建议共享同一份常量模块。
16. **`validate-comparison.ts:72` 硬编码 180 秒上限**：另两处用 `episodeConfig.hardMaximumSeconds`。同理 `evaluation.ts:232` 的 `>= 180` 硬规则、 `inspect-output.ts:68` 的 `"30/1"` 与 `build-timeline.ts:22` 的 fps=30 双写。统一到配置/常量。
17. **单集特化逻辑渗入通用脚本**：`build-timeline.ts:81-87` 按 seg-id 硬编码尾部留白；`validate-content.ts:82-88` Hook 归因正则硬编码品牌名。新集数需改代码而非配置，且静默回退无人察觉。下沉到 episode 配置。

### 可维护性

18. **两个 Episode 组件共 3000 行且互相复制**：`CaptionLayer`、噪点背景、`clamp`、`reportingLabel`（两者优先级还**不一致**：Poke 是 inference>company>founder，Roost 是 inference>founder>company）均为复制粘贴变体。抽共享组件；口径差异如有意应注释，否则统一。
19. **校验脚本重复样板**：`hashFile` 重复 4 份、`generatedPrefix` 三行逻辑重复 3 份（其中 `episodeId.replace("episode-","episode-")` 是恒等死代码）、字幕一致性校验逐行重复 2 份、每个 validate-* 末尾同样的 `errors.join + exit(1)`。提取 `scripts/lib/` 公共模块，预计各瘦身 20-30%。
20. **测试夹具三处近乎逐字重复 + 两处手工重实现被测算术**：`content-loop.test.ts:78-127` / `critic-output.test.ts:64-113` / `revision-detect.test.ts:30-97` 重复约 50 行夹具；`revision-detect.test.ts:130-163`、`revision-select.test.ts:81-88` 手工重算 `normalizedTotal`，rubric 公式改动时夹具静默漂移。抽 `tests/helpers/`，夹具构造统一走生产函数 `recomputeCriticEvaluation`。
21. **ESLint 关闭 `@typescript-eslint/no-explicit-any`**（`eslint.config.mjs`）：与 strict tsconfig（含 `noUncheckedIndexedAccess`）的严格基线不一致，建议开启并逐个豁免。
22. **进程退出风格三种并存**：`errors[]+exit(1)`、顶层 `throw`（堆栈噪音）、`process.exitCode=1`（最佳）。统一封装 `fatal()`。

---

## 【轻微】

1. `revision.ts:556-562`：`severityRank` 表在循环内每次迭代重建，应提升到模块级（`routing.ts:149`、`freeze.ts:28` 已是模块级，风格也不统一）。
2. `content-subgraph.ts:1086-1092`：`createContentSubgraph`/`createContentLoop`/`createContentGraph`/`runContentRevisionLoop` 四个别名导出同一实现，API 面膨胀，保留一个即可。
3. 稳定序列化两套语义三处实现：`revision.ts:264 stableJson`、`evaluation.ts:170 stable`（键排序）与 `reducers.ts:5 sameJson`（原始 stringify，键序敏感）。建议统一为共享工具并明确语义。
4. `routing.ts:444`：每次 `selectPrimaryRoute` 都重新 `validateOwnershipConfig`，含模块加载时已验证过的默认配置；自定义配置可缓存校验结果。
5. `artifact-registry.ts:64-70`：`writeArtifactIndex` 缺 try/finally 清理 `.tmp`（`freeze.ts:496-505` 有），写失败残留临时文件。
6. `content-subgraph.ts:1051`：`beforeHashes` 的 `?? ""` 兜底不可达（`requireChanged` 已保证 previous 存在），死防御代码。
7. `main-graph.ts:53`：`promptRef` 取 `Object.values(artifacts)[0]`（插入序任意），stub 简化应注释标明或按 artifact 角色选取。
8. `captions.ts:66-69`：`timeAtBoundary` 线性查找，整体 O(n²)，span 已有序可二分。
9. `tts-providers.ts:84-85`：断句只按 `。！？!?`，漏 `；` 和 `……`，长句可能整段超接口上限；与 `captions.ts:17` 的切分字符集对齐。
10. `polish.ts:96-98`：`/\d+/` 漏检全角数字，建议 NFKC 归一化后检。
11. `captions.ts:233`：合并 cue 用空格拼接，中文语境应直接拼接。
12. `RoostEpisode.tsx:657`：`const dark = false` 使全文件 dark 分支成为死代码；PokeEpisode 大量 landscape 分支从未渲染（Root 只注册 vertical）。裁剪或确认是规划中的交付物。
13. `story.ts:381` vs `polish.ts:145`：segment id 正则不一致（`seg-\d+` vs `seg-[a-z0-9-]+`），polish 能跑通但 final script 解析静默漏块。
14. `workflow.ts:74`：stages 只校验长度等于角色数，不校验 11 个角色各出现一次。
15. `comparison.ts:31`：`verdict: z.literal("IMPROVED")` 无法表达"未改进"，存在确认偏差的制度性风险；如有意为之应注释。
16. `render.ts:15-22`、`inspect-output.ts:34-43`、`validate-comparison.ts:67-68`：spawnSync 的 `result.error`/`status`/stderr 未检查或丢弃，失败原因被掩盖；`NaN >= 180` 为 false 导致超长检查静默跳过。
17. `content-loop.test.ts:346-347,361-365`：mock 回调内写断言的反模式（回调不被调用时断言静默失效）；`orchestrator-switch.test.ts` 与 `contracts.test.ts:156-169` 完全重复。
18. `package.json`：`workflow:status` 与 `validate:workflow` 是无差别别名；缺端到端 `pipeline` 聚合 script；`engines: node>=22` 但 better-sqlite3 原生绑定实际只匹配 Node 24（本次实测 Node 22 下 4 个测试 ABI 失败），建议收敛到 Node 24 或文档说明。
19. 无覆盖率工具：`test` 只是 `vitest run`，无 `--coverage` 脚本与阈值，覆盖盲区只能靠人工审查发现。

---

## 修复优先级建议

1. **立即**：S1（错误成片风险）、S2（真实渲染 bug）、S3（pipeline 挂起风险）
2. **下一轮迭代**：S4 测试盲区前三项、S5 渲染数据契约、中等项 1-5（契约与门禁完整性）
3. **技术债排期**：v1/v2 双轨清理（14-17）、共享组件与公共模块抽取（18-20）、ESLint 收紧（21）

## 值得保留的做法（不要改坏）

- critic 评分全部由服务端重算并与模型自报值比对（`evaluation.ts:180-208`），模型算术造假直接拒绝；
- freeze 前的字节级 hash 校验 + 原子写 manifest；
- reducer 的交换律/幂等性质测试与 reference-only state 约束；
- 测试不 mock 内部模块、全部依赖注入、时间夹具显式传入——这是正确的测试文化。
