# Editorial Calibration

这个目录是 Goal 3.2 的版本化编辑样本库与 Prompt 编辑政策来源。数据基础设施不改变
hard validator、episode artifacts 或 M1/M2 编排行为；只有 `policies/` 中单独的人审决定
可以授权把可迁移 findings 固化到角色 Prompt。

## 数据边界

- `intake/`：已分析、待人审的候选记录。它不是数据集，任何 loader 都不会读取它。
- `human-feedback/`：人工明确表达的跨样本编辑偏好。它有独立版本和结构化证据关联，
  但不是数据集审批，也没有生成侧 loader。
- `policies/`：人工批准的 Prompt/编辑政策决策，记录角色映射、来源 findings、拒绝项和
  保持不变的合同；它不等于 reference/calibration/golden membership。
- `datasets/reference/`：人工明确批准、按角色提供给生成型 Agent 的结构化参考。
- `datasets/calibration/`：人工标注并批准、只供 Critic / Judge 校准的样本。
- `datasets/golden/`：人工批准的隐藏回归样本。它有单独 loader，不从生成安全入口导出。

三个 manifest 独立版本、独立目录、独立加载。一个记录最多属于一个集合；仅把文件放进
目录并不会生效，manifest、文件哈希、记录内 membership 和人审决定必须全部一致。
当前三个 manifest 都为空：本次 URL 仅形成待审核 intake，用户尚未逐条批准集合归属。

## 人工编辑偏好

`human-feedback/` 保存“人为什么喜欢这些样本”的结构化信号，并把主观偏好关联到各样本
中已经检查过的时间段。当前记录强调两点：一是由创作者采访、产品实演、需求/分发/
经营证据组成的有效画面密度；二是从结果悬念，经疑点、挫折、用户痛点和解决方式，
推进到营销机制与 payoff 的叙事起伏。

画面充实不等于切得多，悬念也不授权虚构挫折或成功原因。`human-feedback/` 故意没有
loader，且不从生成安全入口导出。最初反馈记录本身没有授权 Prompt tuning；用户随后通过
`policies/prompt-editorial-policy-v1.json` 明确授权角色专属的政策整合。该决策仍不改变
任何 intake 的审批状态或三个数据集 manifest。

## Prompt 与编辑政策

`editorial-policy-v1` 把结构化 findings 编译成角色专属规则：Story、Viral、Script、Oral
和 Visual 只获得与其职责相关的抽象模式，Audience 与 Retention 只获得有清晰证据的
rubric 解释。运行时不加载 intake、完整 transcript 或第三方原文。由于本批没有人工听感
和带分数边界的 Oral 样本，Oral Judge 没有校准变更。

政策版本不改变数据集版本。reference、calibration、golden 仍必须分别通过原有明确人审、
哈希与 manifest 流程；Prompt 整合不能绕过任何 loader 或批准门。

## 审批流程

1. 在 `intake/` 保存结构化分析，`review.status` 保持 `pending`，
   `datasetMembership` 保持空数组。
2. 人工明确给出样本、目标集合、适用角色和批准理由，并留下 reviewer、时间和唯一
   `decisionId`。批准不能由 Agent 自行推断。
3. 将新版本记录写入目标集合自己的 `records/`，更新记录的 approval 和 membership，
   计算 SHA-256 后人工更新对应 manifest，并提升 manifest patch/minor 版本。
4. 运行 `pnpm test -- tests/editorial-calibration.test.ts`、`pnpm typecheck` 和
   `pnpm lint`。loader 会拒绝 pending/rejected、哈希错误、路径越界、集合错配或角色越权。

ProductionAgent 自产内容不会自动晋升。即使人工选择自产内容，进入 `reference` 还要求
审批记录显式设置 `allowProductionAgentGenerated: true`。

## Loader 边界

- 生成侧只从 `src/editorial-calibration/index.ts` 使用 `loadRoleReferences`。该入口只接受
  `reference` manifest，并返回与指定角色有关的结构化摘要和可迁移模式。
- `calibration-loader.ts` 只接受 Critic / Judge 角色和 calibration manifest。
- `golden-loader.ts` 必须显式声明 `purpose: "regression-evaluation"`，且故意不从生成安全
  `index.ts` 导出。生成流程不得直接导入它。
- `requiredModalities` 可要求某些模态已检查；未检查或不可访问的样本会被确定性排除。

加载顺序固定为 `sampleId + recordVersion + path`。记录路径必须留在各自数据集目录内，
内容必须匹配 manifest 中的 SHA-256。

## `style/approved/` 兼容

旧机制保持不变。可选兼容 loader 只把 `style/approved/` 中人工放入的 `.md` / `.txt`
样稿映射给 `oral-rewriter`，排除 `README.md`，并按文件名稳定排序。它不会把 intake、
calibration、golden 或新生成稿写回该目录。

## 标注原则

记录优先保存时间范围、模态证据、结构化摘要和可迁移模式，不默认保存第三方完整
transcript。每个分析证据必须声明使用过的模态；schema 会拒绝引用状态不是 `checked`
的模态。`checked` 也必须写明方法、证据和限制，例如只做响度/波形检查而没有人工听辨
时，不能据此判断音乐类型或具体音效。
