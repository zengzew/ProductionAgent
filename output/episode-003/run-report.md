# Episode 003 evaluation run

- Episode: `episode-003`
- Product: Manus
- Title: 任务发出后，它自己打开网页去办
- Orchestrator: `manual` (unset / default)
- Publish status: `evaluation`（未写入 HumanDecision、final approval 或 published）
- As of: 2026-08-16

## Measured output

- `output/episode-003/vertical_9x16.mp4`
- Duration: 46.867 s
- 1080×1920, 30 fps, H.264 + AAC 48 kHz
- Peak: -1.7 dB
- TTS: requested MiniMax, actual Microsoft Edge `zh-CN-YunjianNeural` (+25%, pitch -2Hz) because `MINIMAX_API_KEY` was missing

## Commands

```bash
pnpm validate:research --episode episode-003
pnpm validate:workflow --episode episode-003
pnpm validate:story --episode episode-003
pnpm materialize:story --episode episode-003
pnpm capture --episode episode-003
pnpm tts --episode episode-003
pnpm timeline --episode episode-003
pnpm validate:content --episode episode-003
pnpm render:smoke --episode episode-003
pnpm render:vertical --episode episode-003
pnpm inspect:output --episode episode-003
pnpm validate:delivery --episode episode-003
```

`validate:content` 在 repo 实现里要求 production timeline 已存在，因此实际顺序是 materialize → capture → tts → timeline → validate:content。
