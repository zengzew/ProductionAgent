# Environment check

检查日期：2026-07-28

- OS: macOS 26.5.1, Darwin 25.5.0, arm64
- Node.js: v24.13.0
- pnpm: 11.9.0
- FFmpeg / ffprobe: 8.1.2
- Git: 2.34.1
- Playwright: 1.62.0
- Edge TTS: 7.2.7，位于 `.venv/bin/edge-tts`
- 固定旁白：`zh-CN-YunjianNeural`, rate `+25%`, pitch `-2Hz`
- TTS 凭证：不需要
- TTS 网络：生成音频时需要访问 Microsoft Edge 在线语音服务
- 输出范围：只生成并验收 1080×1920 竖版视频
- 依赖管理：pnpm，锁文件为 `pnpm-lock.yaml`
- 仓库状态：只保留当前 9:16 产品故事生产链
