# Episode 001 run report

执行日期：2026-07-30
项目：Poke 产品故事短视频
当前状态：**DELIVERY-APPROVED**

## 本轮结果

- 围绕“一个省掉界面的 AI 助手，为什么会越用越贵”重构完整 3 分钟故事。
- Hook 改为“消息改日历 → 1 亿+ 条消息 → 运行昂贵、很难赚钱”，真实音频 19.884 秒。
- 重新生成 12 段旁白、92 条字幕、生产时间轴、竖版烟测和完整竖版成片。
- 新增程序生成的氛围底、消息提示、信息冲击和成本脉冲，不使用外部音乐或录音样本。
- 保存基线版和发布版完整产物，并生成直接对比与关键时间点抽帧。

## 配音与时间轴

- Requested provider：`MiniMax Speech`
- Actual provider：`Microsoft Edge neural TTS`（未设置 `MINIMAX_API_KEY`，按配置回退）
- Voice：`zh-CN-YunjianNeural`
- Rate：`+25%`
- Pitch：`-2Hz`
- 分段：12
- 分段音频归一化：`loudnorm I=-16 TP=-1.5 LRA=7`
- 最终混音实测：-14.1 LUFS、3.3 LU LRA、-1.0 dBFS true peak
- 实测成片时长：180.544 秒
- 帧数：5415
- 字幕：92 个 cue；小于 1 秒的 cue 为 0，最短 1.025 秒

实际参数记录在
`content/episode-001/production/tts-metadata.json`，时间轴记录在
`content/episode-001/production/timeline.json`。

## 输出

- 当前成片：`output/episode-001/vertical_9x16.mp4`
- 发布版归档：`output/episode-001/iterations/publish-v2-2026-07-30/vertical_9x16.mp4`
- 基线版归档：`output/episode-001/iterations/baseline-2026-07-30/vertical_9x16.mp4`
- 规格：H.264、1080×1920、30 fps、AAC 48 kHz
- 文件大小：12,474,444 bytes
- SHA-256：
  `672113aeb631f17c97c5d46d45d3c02d7e7003fdec669ef5298729ac81e4b523`

## 验证结果

```text
format:check          PASS
lint                  PASS
typecheck             PASS
test                  PASS  6 files / 21 tests
validate:research     PASS  17 sources / 28 facts / 10 events
validate:story        PASS  oral PASS / critic 96 / fact PASS
validate:content      PASS  12 segments / 6 assets / hook 20s
render:smoke          PASS  1080×1920
render:vertical       PASS  180.544s
inspect:output        PASS
validate:delivery     PASS  92 cues / micro 0 / minimum 1.025s
git diff --check      PASS
```

正式渲染使用 Remotion concurrency 2。烟测和正式成片均为 9:16。

## 发布边界

1. MiniMax Speech 未实际验证；当前发布版使用 Edge neural TTS 回退音色。
2. 发布前仍需人工确认 Poke、Cognition 等公开网页截图的编辑使用依据。
3. 按目标平台要求标记合成语音或 AIGC，并在平台预览竖版 UI 覆盖层。

本项目没有执行上传或发布。Delivery Critic 报告已绑定当前 MP4、SRT 和生产时间轴
哈希，并通过 `pnpm validate:delivery`。
