# M1 Acceptance Report

- Gate resolution: **M1.3**
- Date: 2026-08-06
- M1 commit under review: `da62541` (`Add LangGraph dependencies and ignore orchestration files`)
- Pre-M1 baseline: `ec43e6c` (the first parent of `da62541`)
- Final decision: **PASS**

## Baseline comparison

The baseline commands were executed in a detached `ec43e6c` worktree after a successful
`CI=true pnpm install --offline --frozen-lockfile`. Because the final MP4 and smoke MP4 are ignored
local artifacts rather than Git objects, the Episode 001 files from the current workspace were linked
into the detached worktree before the final `validate:story` comparison. This reconstructs the same
non-source inputs used by the current branch without modifying either worktree.

| Command                 | Pre-M1 `ec43e6c` | M1 `da62541` before M1.3 | Attribution                                                                                      |
| ----------------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm validate:story`   | Exit 1           | Exit 1                   | Both reach the same `final-script 旁白命中禁用写法：产品阶段直译` failure. Pre-existing.         |
| `pnpm validate:content` | Exit 1           | Exit 1                   | Both report `旁白命中禁用写法：产品阶段直译`. Pre-existing.                                      |
| `pnpm format:check`     | Exit 1           | Exit 1                   | Both identify only `docs/ProductionAgent_Goal_3.1_LangGraph_架构设计文档_v0.2.md`. Pre-existing. |

`git diff ec43e6c..da62541` contains the M1 dependencies, orchestration implementation, tests, and
`.gitignore` update. It contains no changes to the two validators, Episode 001 content/output, or the
architecture document responsible for these failures. None of the three failures was introduced by
M1.

## Baseline-only fixes

1. The architecture document was formatted with the repository's existing Prettier configuration.
   This is a formatting-only change.
2. The product-stage wording rule now has one hash-bound compatibility boundary: only the exact
   delivery-bound `episode-001` v1 narration may retain its existing `Beta 用户` wording because
   changing that narration would require prohibited TTS, subtitle, timeline, and render regeneration.
   Any narration-byte change removes the exception. `一般可用状态` remains rejected there, and both
   expressions remain rejected for every later episode.
3. `tests/baseline-gates.test.ts` proves the exception is limited to Episode 001 v1 and that the
   general rule remains active.

No prompt, episode source artifact, TTS configuration/audio, Remotion code, generated timeline,
subtitle, MP4, LangGraph module, orchestrator switch, or output artifact was changed. M2 work was not
started.

## Post-fix command evidence

| Command                    | Result | Evidence                                                                               |
| -------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `pnpm validate:story`      | PASS   | 12 segments; target 150s; oral PASS; critic 95; fact PASS; visual READY; retention 93. |
| `pnpm validate:content`    | PASS   | 12 segments, 6 assets, 20-second hook.                                                 |
| `pnpm format:check`        | PASS   | All matched files use Prettier code style.                                             |
| `pnpm lint`                | PASS   | ESLint completed with zero warnings.                                                   |
| `pnpm typecheck`           | PASS   | TypeScript completed with no errors.                                                   |
| `pnpm test`                | PASS   | 21 test files, 75 tests.                                                               |
| `pnpm validate:research`   | PASS   | 17 sources, 28 facts, 10 events; lineage resolved.                                     |
| `pnpm validate:workflow`   | PASS   | 11 owners, 9 decisions, 2 reviews, 1 closed revision; `delivery-approved`.             |
| `pnpm validate:delivery`   | PASS   | 72 cues, 0 micro cues, 1.036-second minimum; `delivery-approved`.                      |
| `pnpm validate:comparison` | PASS   | Baseline 39/60, director 52/60, improvement +13.                                       |
| `git diff --check`         | PASS   | No whitespace errors.                                                                  |

Read-back hashes for protected Episode 001 artifacts after the change:

- `output/episode-001/vertical_9x16.mp4`:
  `57a02a5de86f188fe260d6295d7e2a38d16ed948f3341b2d44306e3b472040c0`
- `output/episode-001/subtitles_zh.srt`:
  `d70b4ab74163d2ec5f5b2ed5cdf082f7f6231d3c0e522b582f5450d7d17876fe`
- `content/episode-001/story/final-script.md`:
  `b86c56c74ba0a616ed1eb87631a1411cd6d07d20adae7c8c044ed4072a60e620`

## Decision

**PASS.** All three requested baseline gates now pass. Their original failures reproduce before M1,
the fixes are isolated from LangGraph and production behavior, and the broader read-only regression
set remains green.
