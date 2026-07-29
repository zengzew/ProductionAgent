# 竖版成片视觉检查（故事与字幕 V4）

检查对象：`output/episode-001/vertical_9x16.mp4`

## 结论

- 画面规格为 1080 × 1920、30 fps，时长 183.600 秒。
- 已检查开场、问题、日期、配方、风险和收尾六个时间点。
- 标题、来源说明和字幕均在竖屏安全区内，没有发现裁切、重叠或越界。
- 生成的 112 个字幕片段均未保留句末标点。
- 当前流程只把竖版 MP4 视为交付物，仓库不再保留横版输出。

## 检查证据

- 编码后抽帧拼图：`reports/visual-qa/final/v4-story-caption-contact-sheet.png`
- 冒烟抽帧：`reports/visual-qa/smoke-story-v4-1.5.png`
- 冒烟抽帧：`reports/visual-qa/smoke-story-v4-8.0.png`

这是一轮本地编码后抽帧检查，不是独立审片人的复核。
