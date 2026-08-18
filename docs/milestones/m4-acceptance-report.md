# M4 Exit Acceptance Report

日期：2026-08-15  
仓库：`ProductionAgent`  
基线 HEAD：`f9176e5`；本报告对应其后的 M4 Exit Repair 工作树  
验收范围：M4.01–M4.06 persistence、recovery、cache、observability、legacy backfill、concurrency，以及当前 `episode-001` 的 40–80 秒交付门禁。  
执行环境：Node `v24.13.0`，macOS 本地，网络无依赖。

## 结论

**M4 ✅ exit-accepted**

所有 critical gates 已通过。M4 Exit Repair 只修复了外层 lease ownership、production retry/repair observability、refreeze artifact identity、集成 E2E、当前 episode 交付物和对应 hash-bound reports；没有进入 M5、Real Media 或模型接入。

## Critical gate 结果

| Gate                        | 结果     | 当前证据                                                                                                                                                              |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4.01–M4.06 contract suite  | **PASS** | `pnpm test`：52 test files、328 tests passed                                                                                                                          |
| type safety / lint          | **PASS** | `pnpm typecheck`、`pnpm lint`                                                                                                                                         |
| research / workflow / story | **PASS** | `validate:research`：17 sources、28 facts、10 events；`validate:story`：6 segments、target=60s、hook=20s、oral=PASS、critic=95、fact=PASS、visual=READY、retention=93 |
| current content             | **PASS** | `validate:content`：6 segments、6 assets、hook=20s                                                                                                                    |
| output inspection           | **PASS** | `inspect:output` 读回 H.264、1080×1920、30 fps、AAC 48 kHz、43.648s                                                                                                   |
| Delivery Critic             | **PASS** | `validate:delivery`：23 cues、semantic=0、micro=0、status=delivery-approved                                                                                           |
| director comparison         | **PASS** | `validate:comparison`：baseline=39/60、director=52/60、change=+13、verdict=IMPROVED                                                                                   |
| integrated M4 E2E           | **PASS** | `tests/orchestration/m4-exit-e2e.test.ts`：4 tests passed                                                                                                             |

## Orchestration / runtime repair

`withControlledOrchestrationRun` 现在以 `AsyncLocalStorage` 保存当前 repo、episode、run、thread、trace identity。相同 identity 的 composed production node 复用已存在的 outer lease，不再重复 acquire；不同 identity、standalone `runProductionPipeline`、跨 episode run 仍按原路径独立 acquire。Global cap、episode lock、CAS、heartbeat、stale-lock recovery 和 live-lock rejection 均保留，并由完整 test suite 与 `production-adapters` regression 覆盖。

production stage recovery 会从已持久化的 execution log 计算恢复 attempt；重启或 repair/unfreeze rerun 写入新的 hash-bound `retry.scheduled` control event 和 attempt-specific artifact path，避免重复 event identity 或覆盖历史 artifact。`refreezeAfterUnfreeze` 使用不可变的 versioned manifest path，保留旧 manifest 的历史 hash。

## Integrated E2E 证据

四条路径均在真实 SQLite/filesystem fixture 上执行，不使用内存替代持久化；每条路径都读回并校验以下对象：

1. content approval → freeze → composed production → delivery PASS → final approval；最终 state 为 `published`，content/final approval gates 为 `pass`。
2. production interruption → checkpoint resume；`render:smoke` 等 hash-valid stage 不重跑，只从被中断的 `render:vertical` 继续。
3. delivery REJECT → 最小 `timeline` repair closure → delivery PASS，并记录 `repair.started` / `repair.completed`。
4. L4 unfreeze → HumanDecision approve → scoped immutable edit → content gates → versioned refreeze → production resume，并记录 unfreeze、human decision 和新的 manifest hash。

每条测试实际写入并读回：

- SQLite checkpoint，并用 `restoreVerifiedCheckpoint` 验证 `productionStateSha256`；
- episode-local `artifact-index.json`，并验证 `artifactIndexControlHash`；
- append-only `executions.jsonl`，读回后验证 `hashExecutionEvents`、event identity 和 event hash；
- structured `run-report.md`，读回 `reportSha256`、event-log hash 和 Artifact revision/hash 表；
- ArtifactRef、event、checkpoint 的 hash linkage，以及 episode/run identity 和 observability completeness。

测试命令：

```text
PATH=/Users/zengze/.nvm/versions/node/v24.13.0/bin:$PATH \
  pnpm exec vitest run tests/orchestration/m4-exit-e2e.test.ts
```

结果：1 test file、4 tests passed。fixture 在每次测试后删除，避免把临时测试 artifact 当成生产 source of truth；持久化和读回行为由测试中的磁盘文件、SQLite saver、hash assertion 和 structured report assertion 直接证明。

## Current episode 交付证据

`episode-001` 已按当前 contract 重生成，不修改 hard duration rule，也未改写 `v2-goal3` 或其他 legacy source bytes：

- final script：6 segments，target=60s；
- TTS：6 段全部生成，当前本机按既有配置回退 Edge neural TTS；
- timeline：6 scenes、23 captions；
- vertical render：`output/episode-001/vertical_9x16.mp4`，实际读回 43.648s；
- delivery：23 cues，最短 cue 1.060s，semantic boundary=0，micro cue=0；
- comparison：39/60 → 52/60，`IMPROVED`。

当前产物 hash：

| Artifact                                                   | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `content/episode-001/story/workflow.json`                  | `120648ca2ee041afb29e964e25ce80b30d67f75a21f48eee69757289ba01eb8e` |
| `content/episode-001/production/timeline.json`             | `4b5e7af7bf87457bbed7a8ba8bd22b2290dbf33660f29f0bb6c096907ac94f6b` |
| `output/episode-001/vertical_9x16.mp4`                     | `6d8493daebdab714ee1b637f9bf88464c779b7ec6c9bba4062024c4a51ab83d5` |
| `output/episode-001/subtitles_zh.srt`                      | `8cc6cde44b461da0cf6712a196a5bb2459511a91bdac84ea602690b2add9952c` |
| `output/episode-001/inspection.json`                       | `a6e1d8f77bf67f007ec4af24fa69ed955fa1aa45b78f50443dab9eef4e6c89a5` |
| `content/episode-001/production/delivery-critic-report.md` | `7b28b4b89d308fa19a2e27dd83152799b058ccf45ffd06db961d9662841130c7` |
| `content/episode-001/production/comparison-report.md`      | `d7400e76163c9e48d73e76439abe9a49993f1e9c7a459e26d69a30d70000b77d` |

## Regression / boundary checks

- `M4.06` per-episode isolation, global cap, checkpoint/artifact CAS, live/stale lock behavior and scoped HumanDecision tests remain PASS.
- `ORCHESTRATOR=manual` default and final approval’s internal-only behavior remain unchanged; no network upload or publication side effect was added.
- No hard duration rule, validator rule, prompt/model integration or Real Media path was changed.
- `content/episode-001/v2-goal3` and `content/episode-002/v2-goal3` source bytes were not modified; the current working-tree diff contains no paths under either legacy package.
- No real Postgres service was required for this network-free M4 exit; the backend/configuration and migration contracts remain covered by the M4 suite.

## Non-critical repository notes

`pnpm format:check` still reports 17 existing M4/current-document files, including unrelated pre-existing M4 source files. This remains a non-critical repository hygiene item and does not block the M4 exit marker. No broad formatting sweep was performed because this repair was limited to critical exit blockers.
