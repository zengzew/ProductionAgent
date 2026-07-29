# Logical Multi-Agent Story Room

本项目当前使用“角色化 Prompt + 文件交接”模拟多 Agent，不引入
LangGraph、AutoGen 或 CrewAI。每个角色只修改自己负责的文件，文件是角色之间唯一
的正式交接，不以聊天记录作为 source of truth。

## 稳定角色

1. `Research Analyst`：收集事实，不写故事。
2. `Story Director`：从证据中选择故事问题、冲突和转折，不写旁白。
3. `Script Writer`：根据已批准的故事结构写中文旁白；同一角色在收到评审后进入
   Rewrite 模式。
4. `Audience Critic`：只从观众和编辑角度评审，不改稿。
5. `Fact Guardian`：最后核对 Claim、归因、指标、时间和因果边界，不负责增强戏剧性。
6. `Delivery Critic`：在生产完成后独立审核实际竖版成片、字幕和真实语速，不改
   脚本或产物。

Rewrite 是 Script Writer 的工作模式，不是第六个角色。视频制作也不是这一阶段的
角色；只有故事和事实门同时通过，才允许进入 TTS、字幕、时间轴和渲染。生产完成
后必须再过 Delivery Critic，`story-approved` 不等于成片合格。

## 状态流

```text
research-ready
      ↓
story-ready
      ↓
draft-ready
      ↓
critic-pass ───────────────┐
      │                    │
      └─ critic-reject → rewrite
                               │
                               └─→ critic
      ↓
fact-pass ──────────────────→ story-approved
      │
      ├─ evidence gap ──────→ Research Analyst
      ├─ unsupported angle ─→ Story Director
      └─ wording error ─────→ Script Writer
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

`Audience Critic` 低于 85 分、任一维度低于 60% 或存在 blocker 时，必须退回
Script Writer。`Fact Guardian` 发现事实 blocker 时，必须明确填写退回角色；不得
自己静默改稿。

## 文件交接

以 `content/episode-001` 为例：

| 角色             | 只读输入                                                      | 可写输出                                                                                  |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Research Analyst | 原始来源、既有研究文件                                        | `research/facts.json`、`sources.json`、`timeline.json`、`technology.md`、`growth-data.md` |
| Story Director   | `research/`                                                   | `story/story-bible.md`、`story-angle.md`、`three-act-structure.md`                        |
| Script Writer    | 已批准的 `research/` 与 `story/`                              | `story/hook-candidates.md`、`final-script.md`                                             |
| Audience Critic  | `research/` 与全部 `story/`                                   | `story/critic-report.md`                                                                  |
| Fact Guardian    | `research/`、`final-script.md`、已 PASS 的 `critic-report.md` | `story/fact-check-report.md`                                                              |
| Delivery Critic  | 竖版 MP4、SRT、真实 TTS 时长与 production timeline            | `production/delivery-critic-report.md`                                                    |

角色不得修改上游文件。确需修正上游时，在报告中写清退回对象和原因，再由对应角色
执行。

## 在 Codex 中运行

可在同一个 Codex task 中依次运行前三个角色。为减少自我评审偏差，
`Audience Critic` 和 `Fact Guardian` 建议在新的 Codex task 中运行。

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
以 draft 模式为 content/episode-001 写 Hook 和最终脚本。
```

```text
读取 agents/audience-critic.md。
独立评审 content/episode-001，不要修改脚本。
```

Critic REJECT 时：

```text
读取 agents/script-writer.md。
以 rewrite 模式读取 critic-report.md，只修复报告列出的 blocker 和低分项。
完成后让 Audience Critic 重新评审。
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
