# Episode 001 run report

执行日期：2026-07-29
项目：Poke 产品故事短视频
当前状态：**DELIVERY-APPROVED**

## 本轮结果

- 重新生成 12 段中文旁白、字幕、生产时间轴、竖版烟测和完整竖版成片。
- 字幕改用人工可审计的双行语义规划，并通过独立 Delivery Critic 逐 cue 复核。
- 开场在 19.578 秒内完成具体动作、产品定义和权限问题。
- 当前管线只注册并交付 9:16 视频，不再保留横版 Poke 成片或旧 Genspark 项目。
- 旧文件已移入 macOS 废纸篓目录
  `/Users/zengze/.Trash/ProductionAgent-legacy-deleted-20260729`，清空废纸篓前可恢复。

## 配音与时间轴

- Voice：`zh-CN-YunjianNeural`
- Rate：`+25%`
- Pitch：`-2Hz`
- 分段：12
- 分段音频归一化：`loudnorm I=-16 TP=-1.5 LRA=7`
- 最终混音实测：-14.11 LUFS、2.50 LU LRA、-1.69 dBFS true peak
- 实测成片时长：185.400 秒
- 帧数：5562
- 字幕：62 个 cue；小于 1 秒的 cue 为 0，最短 1.357 秒

实际参数记录在
`content/episode-001/production/tts-metadata.json`，时间轴记录在
`content/episode-001/production/timeline.json`。

## 输出

- 文件：`output/episode-001/vertical_9x16.mp4`
- 规格：H.264、1080×1920、30 fps、AAC 48 kHz
- 文件大小：12,574,885 bytes
- SHA-256：
  `cd502c2001b426c78d37ef04969bfc03c52eba6e3ca796f3603074424f400376`

## 已执行命令

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:research
pnpm validate:story
pnpm materialize:story
pnpm validate:content
pnpm tts
pnpm timeline
pnpm render:smoke
pnpm render:vertical
pnpm inspect:output
```

正式渲染使用 Remotion concurrency 2。烟测和正式成片均为 9:16。

## 发布前仍需人工处理

1. 审查 Poke、Cognition 和 TechCrunch 等公开网页截图的编辑使用依据。
2. 按目标平台要求标记合成语音或 AIGC。
3. 在实际发布平台预览竖版 UI 覆盖层。

本项目没有执行上传或发布。Delivery Critic 报告已绑定当前 MP4、SRT 和生产时间轴
哈希，并通过 `pnpm validate:delivery`。
