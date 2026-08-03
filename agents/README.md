# Logical Multi-Agent Story Room

本项目当前使用“角色化 Prompt + 文件交接”模拟多 Agent，不引入
LangGraph、AutoGen 或 CrewAI。每个角色只修改自己负责的文件，文件是角色之间唯一
的正式交接，不以聊天记录作为 source of truth。

这些角色由 Codex 执行，不在仓库中调用 LLM API。项目永久排除自部署 GPT、LLM 和
语音生成模型，也不为它们预留运行时接口。

所有角色共同遵守两条最新规则：成片使用有事实支撑的正面推广口吻，优先讲产品
价值、真实体验和用户动作；最终竖版 MP4 必须严格小于 180 秒。问题、风险和数据
缺口只在影响理解、准确性或合规时简短出现，结尾不能转成对产品未来的质疑。

事实先确定可说边界，导演流程再决定先让观众看见什么。每期在写旁白前必须先批准
一个核心故事问题、观众承诺、情绪弧线和信息揭示顺序；不能把 Claim Ledger 的排列
顺序直接当成故事。

## 稳定角色

1. `Research Analyst`：收集事实，不写故事。
2. `Story Director`：从证据中选择能正面展示产品价值的故事问题、张力和转折，不写
   旁白。
3. `Viral Director`：在写稿前设计并评估 Hook、好奇缺口、情绪张力、信息揭示顺序
   和结尾兑现，不制造事实或承诺播放量。
4. `Script Writer`：根据已批准的故事结构和注意力策略写信息完整的旁白初稿。
5. `Oral Rewriter`：独立把初稿改成自然中文口播，不增加或改变事实。
6. `Oral Judge`：独立评估中文自然度、口播节奏和信息保真，不改稿。
7. `Audience Critic`：只从观众和编辑角度评审，不改稿。
8. `Fact Guardian`：最后核对 Claim、归因、指标、时间和因果边界，不负责增强戏剧性。
9. `Visual Director`：把通过事实审核的旁白转成逐段视觉方案，定义证据、动画、素材
   和节奏，不改旁白。
10. `Retention Critic`：预测前三秒、前三十秒、中段和结尾的划走风险，只写评审报告。
11. `Delivery Critic`：在生产完成后独立审核实际竖版成片、字幕和真实语速，不改
    脚本或产物。

口播改写必须独立于信息初稿。Oral Judge 三项均不低于 4/5 才能继续，最多回改
三轮。第三轮仍不通过时交给人工编辑。口播、观众和事实三道门通过后，还必须完成
逐段视觉方案并通过留存预测，才允许进入 TTS、字幕、时间轴和渲染。生产完成后必须
再过 Delivery Critic，`story-approved` 不等于成片合格。

`story/workflow.json` 记录这 11 个角色的固定顺序、当前状态、每个重大决定的 owner、
产物、评审轮次、反馈路由和关闭状态。它是文件交接的控制面，不是第 12 个角色，也
不引入 LangGraph。

## 状态流

```text
research-ready
      ↓ Story Director
director-ready
      ↓ Viral Director
attention-ready
      ↓
draft-ready
      ↓
oral-rewrite
      ↓
oral-judge-pass ───────────┐
      │                    │
      └─ reject → oral-rewrite（最多 3 轮）
                           └─ 第 3 轮仍失败 → human-editor
      ↓
critic-pass ───────────────┐
      │                    │
      ├─ expression issue ─→ Oral Rewriter → Oral Judge
      └─ structure issue ──→ Script Writer / Story Director
      ↓
fact-pass
      │
      ├─ evidence gap ──────→ Research Analyst
      ├─ unsupported angle ─→ Story Director
      ├─ draft error ───────→ Script Writer
      └─ rewrite drift ─────→ Oral Rewriter → Oral Judge
      ↓ Visual Director
visual-ready
      ↓ Retention Critic
retention-pass ──────────────→ story-approved
      │
      ├─ attention issue ────→ Viral Director
      ├─ structure/copy ─────→ Story Director / Script Writer / Oral Rewriter
      └─ visual issue ───────→ Visual Director
                                  ↓
                         TTS → captions → timeline → render
                                  │
                                  ↓
                         delivery-pass → delivery-approved
                                  │
                                  ├─ captions
                                  ├─ timeline
                                  ├─ tts
                                  └─ render
```

`Audience Critic` 低于 85 分、任一维度低于 60% 或存在 blocker 时，必须按问题
类型退回。`Fact Guardian` 发现事实 blocker 时，必须明确填写退回角色；不得自己
静默改稿。`Retention Critic` 总分低于 80、任一时间窗口低于 15/25、出现 high risk
或 blocker 时，必须退回对应角色。下一轮不能只改分数；必须引用上一轮报告、逐条
关闭 feedback ID，并绑定修改前后的产物哈希。

## 文件交接

以 `content/episode-001` 为例：

| 角色             | 只读输入                                                                     | 可写输出                                                                                  |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Research Analyst | 原始来源、既有研究文件                                                       | `research/facts.json`、`sources.json`、`timeline.json`、`technology.md`、`growth-data.md` |
| Story Director   | `research/`                                                                  | `story/director-brief.md`、`story-bible.md`、`story-angle.md`、`three-act-structure.md`   |
| Viral Director   | `research/` 与已批准的 Director Brief                                        | `story/hook-candidates.md`、`story/viral-strategy.md`                                     |
| Script Writer    | 已批准的 `research/`、故事结构与注意力策略                                   | `story/script-draft.md`                                                                   |
| Oral Rewriter    | 初稿、Claim、story structure、style guide、最多 3 份 approved 样稿           | `story/final-script.md`                                                                   |
| Oral Judge       | 初稿、最终稿、Claim 与实际使用的 style 样稿                                  | `story/oral-review.md`                                                                    |
| Audience Critic  | 已 PASS 的 `oral-review.md`、`research/` 与全部 `story/`                     | `story/critic-report.md`                                                                  |
| Fact Guardian    | `research/`、`final-script.md`、已 PASS 的 oral review 与 `critic-report.md` | `story/fact-check-report.md`                                                              |
| Visual Director  | 已通过口播、观众和事实审核的脚本、研究与 asset manifest                      | `story/visual-plan.md`                                                                    |
| Retention Critic | 最终稿、注意力策略、视觉方案与全部脚本审核报告                               | `story/retention-report.md`                                                               |
| Delivery Critic  | 竖版 MP4、SRT、真实 TTS 时长与 production timeline                           | `production/delivery-critic-report.md`                                                    |

角色不得修改上游文件。确需修正上游时，在报告中写清退回对象和原因，再由对应角色
执行。执行工作流的 Codex task 在每次正式交接后同步 `story/workflow.json`，但不得
替角色修改其评审结论。

## 在 Codex 中运行

可在同一个 Codex task 中依次运行 Research Analyst、Story Director、Viral Director、
Script Writer、Oral Rewriter 和 Visual Director。为减少自我评审偏差，`Oral Judge`、
`Audience Critic`、`Fact Guardian` 和 `Retention Critic` 建议在新的 Codex task 中
运行。

```text
读取 agents/research-analyst.md。
以 content/episode-001 为 episode root，执行 Research Analyst。
只生成该角色允许的文件，完成后运行 pnpm validate:research。
```

```text
读取 agents/story-director.md。
以 content/episode-001 为 episode root，执行 Story Director。
先写并批准 director-brief.md，再对齐其余故事文件。不要写旁白，不要补研究缺口。
```

```text
读取 agents/viral-director.md。
以 content/episode-001 为 episode root，写 hook-candidates.md 和 viral-strategy.md。
必须绑定当前 director-brief.md；只有 viral-strategy-v2 gate 为 READY 才能进入
Script Writer。
```

```text
读取 agents/script-writer.md。
读取已批准的注意力策略，为 content/episode-001 写 script-draft.md，不写 final-script.md。
```

```text
读取 agents/oral-rewriter.md。
把 content/episode-001/story/script-draft.md 改成 final-script.md。
没有人工 approved 样稿时，只读取 style/voice-guide.md。
```

```text
读取 agents/oral-judge.md。
独立评审 content/episode-001 的初稿与最终稿，只写 oral-review.md。
```

Oral Judge REJECT 时：

```text
读取 agents/oral-rewriter.md 和 oral-review.md。
只修复报告列出的问题，然后重新交给 Oral Judge。最多三轮。
```

Oral Judge PASS 后：

```text
读取 agents/audience-critic.md。
独立评审 content/episode-001，不要修改脚本。
```

Critic REJECT 时：

```text
按 critic-report.md 的问题类型退回 Oral Rewriter、Script Writer 或 Story Director。
final-script.md 改动后必须从 Oral Judge 重新开始，不能直接回到 Audience Critic。
```

Critic PASS 后：

```text
读取 agents/fact-guardian.md。
独立核查 content/episode-001，并写 fact-check-report.md。
不要直接修改研究、故事或脚本。
```

Fact Guardian PASS 后：

```text
读取 agents/visual-director.md。
为 content/episode-001 的每个旁白段落写 visual-plan.md，不修改脚本。
```

Visual Director READY 后，在新的 Codex task 中：

```text
读取 agents/retention-critic.md。
审核 final-script.md 与 visual-plan.md，只写 retention-report.md。
```

Retention Critic REJECT 时，按 `returnTo` 退回。`final-script.md` 改动后，Oral Judge、
Audience Critic、Fact Guardian、Visual Director 和 Retention Critic 全部重新执行；
只改 `visual-plan.md` 时，重新执行 Retention Critic。下一轮报告必须引用上一轮哈希，
并用 `resolvedFeedback` 证明每条修改实际落到了责任角色的产物；同时把两轮状态写入
`workflow.json`。

最后运行：

```bash
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
```

只有三条命令都通过，状态才是 `story-approved`。

进入生产后运行：

```bash
pnpm materialize:story
pnpm validate:content
pnpm tts
pnpm timeline
pnpm render:smoke
pnpm render:vertical
pnpm inspect:output
```

渲染前还要检查本期是否存在与故事主线相关的公开官网、应用商店页面或官方应用
截图。存在时，默认至少使用一处真实官方产品画面；官网和应用内截图分别能推进故事
时，优先各使用一处。每张截图先登记到 `production/asset-manifest.json`，写明
来源 URL、捕获日期、权利主体、编辑使用依据、用途和 Claim IDs。画面必须标注
“真实页面截图”和来源；无法稳定取得或权利不清楚时，使用标明“功能演示”的
程序化图形。

官方演示视频、发布视频或可追溯的真实操作录屏能更直接证明核心动作时，优先使用
动态证据。它们必须同样登记来源、权利依据、用途和 Claim IDs，并在强事实第一次
说出口时出现。Delivery Critic 要检查竖屏中的动作可读性和证据同步，不能只检查
静态截图。

然后在新的 Codex task 中：

```text
读取 agents/delivery-critic.md。
以陌生观众身份审核 content/episode-001 的实际竖版成片，只写
production/delivery-critic-report.md。
```

最后运行：

```bash
pnpm validate:delivery
```

只有该命令通过，状态才是 `delivery-approved`。

复刻既有 episode 时，再保留旧 MP4 与 timeline，写
`production/comparison-report.md`，运行：

```bash
pnpm validate:comparison
```

对比必须绑定两版文件哈希，并分别评估 Hook、连贯性、好奇心、产品理解、视觉叙事和
留存潜力。它只证明编辑代理指标改善；真实留存仍以发布后的同平台数据或受控 A/B
为准。
