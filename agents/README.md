# Logical Multi-Agent Story Room

本项目当前使用“角色化 Prompt + 文件交接”模拟多 Agent，不引入
LangGraph、AutoGen 或 CrewAI。每个角色只修改自己负责的文件，文件是角色之间唯一
的正式交接，不以聊天记录作为 source of truth。

这些角色由 Codex 执行，不在仓库中调用 LLM API。项目永久排除自部署 GPT、LLM 和
语音生成模型，也不为它们预留运行时接口。

## 稳定角色

1. `Research Analyst`：收集事实，不写故事。
2. `Story Director`：从证据中选择故事问题、冲突和转折，不写旁白。
3. `Script Writer`：根据已批准的故事结构写信息完整的旁白初稿。
4. `Oral Rewriter`：独立把初稿改成自然中文口播，不增加或改变事实。
5. `Oral Judge`：独立评估中文自然度、口播节奏和信息保真，不改稿。
6. `Audience Critic`：只从观众和编辑角度评审，不改稿。
7. `Fact Guardian`：最后核对 Claim、归因、指标、时间和因果边界，不负责增强戏剧性。
8. `Delivery Critic`：在生产完成后独立审核实际竖版成片、字幕和真实语速，不改
   脚本或产物。

口播改写必须独立于信息初稿。Oral Judge 三项均不低于 4/5 才能继续，最多回改
三轮。第三轮仍不通过时交给人工编辑。只有口播、观众和事实三道门全部通过，才允许
进入 TTS、字幕、时间轴和渲染。生产完成后必须再过 Delivery Critic，
`story-approved` 不等于成片合格。

## 状态流

```text
research-ready
      ↓
story-ready
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
fact-pass ──────────────────→ story-approved
      │
      ├─ evidence gap ──────→ Research Analyst
      ├─ unsupported angle ─→ Story Director
      ├─ draft error ───────→ Script Writer
      └─ rewrite drift ─────→ Oral Rewriter → Oral Judge
                                  │
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
静默改稿。

## 文件交接

以 `content/episode-001` 为例：

| 角色             | 只读输入                                                                     | 可写输出                                                                                  |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Research Analyst | 原始来源、既有研究文件                                                       | `research/facts.json`、`sources.json`、`timeline.json`、`technology.md`、`growth-data.md` |
| Story Director   | `research/`                                                                  | `story/story-bible.md`、`story-angle.md`、`three-act-structure.md`                        |
| Script Writer    | 已批准的 `research/` 与故事结构                                              | `story/hook-candidates.md`、`story/script-draft.md`                                       |
| Oral Rewriter    | 初稿、Claim、story structure、style guide、最多 3 份 approved 样稿           | `story/final-script.md`                                                                   |
| Oral Judge       | 初稿、最终稿、Claim 与实际使用的 style 样稿                                  | `story/oral-review.md`                                                                    |
| Audience Critic  | 已 PASS 的 `oral-review.md`、`research/` 与全部 `story/`                     | `story/critic-report.md`                                                                  |
| Fact Guardian    | `research/`、`final-script.md`、已 PASS 的 oral review 与 `critic-report.md` | `story/fact-check-report.md`                                                              |
| Delivery Critic  | 竖版 MP4、SRT、真实 TTS 时长与 production timeline                           | `production/delivery-critic-report.md`                                                    |

角色不得修改上游文件。确需修正上游时，在报告中写清退回对象和原因，再由对应角色
执行。

## 在 Codex 中运行

可在同一个 Codex task 中依次运行 Research Analyst、Story Director、Script Writer
和 Oral Rewriter。为减少自我评审偏差，`Oral Judge`、`Audience Critic` 和
`Fact Guardian` 建议在新的 Codex task 中运行。

```text
读取 agents/research-analyst.md。
以 content/episode-001 为 episode root，执行 Research Analyst。
只生成该角色允许的文件，完成后运行 pnpm validate:research。
```

```text
读取 agents/story-director.md。
以 content/episode-001 为 episode root，执行 Story Director。
不要写旁白，不要补研究缺口。
```

```text
读取 agents/script-writer.md。
为 content/episode-001 写 Hook 和 script-draft.md，不写 final-script.md。
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

最后运行：

```bash
pnpm validate:research
pnpm validate:story
```

只有两条命令都通过，状态才是 `story-approved`。

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
