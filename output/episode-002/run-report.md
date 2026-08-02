# Episode 002 Run Report

成片：`output/episode-002/vertical_9x16.mp4`

状态：`delivery-approved`

## 选题

Roost Social：一条消息飞三天，为什么有人偏要等？

## 最终规格

- 1080×1920，9:16
- 30 fps
- H.264 视频，AAC 48 kHz 音频
- 时长 213.267 秒
- 音频峰值 -1.7 dB
- SHA-256：`60e5ca73c6530ae832a704dd48048b2c1658e15072c6d6e7c38b8acb2a957a27`

## 真实生产数据

- 12 段旁白
- TTS：Microsoft Edge neural TTS `zh-CN-YunjianNeural`
- MiniMax：因当前环境缺少凭据，按 `config/tts-v2.json` 回退
- Hook 真实结束时间：19.044 秒
- 中文字幕：119 个 cue
- 小于 1 秒 cue：3 个，占 2.5210%
- 最短 cue：0.898 秒

## 门禁结果

- Research：7 个来源、19 条事实、7 个事件，PASS
- Oral Judge：PASS
- Audience Critic：93 / 100，PASS
- Fact Guardian：PASS
- TypeScript / ESLint / Vitest：PASS，25 项测试
- Smoke render：PASS
- Vertical render：PASS
- Output inspection：PASS
- Delivery Critic：PASS
- `git diff --check`：PASS

## 复审证据

- `output/episode-002/evidence/latest-hook-0.25.png`
- `output/episode-002/evidence/latest-hook-4.2.png`
- `output/episode-002/evidence/latest-hook-website.png`
- `output/episode-002/evidence/latest-contact-sheet.jpg`
- `output/episode-002/evidence/latest-ending-return.png`

## 发布边界

本轮没有上传或发布。发布前仍需人工确认官方页面引用、平台合成语音披露和账号侧
标题/封面选择。
