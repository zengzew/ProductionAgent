# Episode 001 director-cut run report

执行日期：2026-08-02
项目：Poke AI 产品故事短视频
当前状态：**DELIVERY-APPROVED / COMPARISON IMPROVED**

## 本轮结果

- 用 `director-brief.md` 先锁定核心问题、观众承诺、情绪弧线、揭示顺序和事实边界。
- Retention Critic Round 01 以 66 分 REJECT，反馈分别路由到 Story Director、Script
  Writer 和 Visual Director；Round 02 用 before/after 哈希验证修订后以 93 分 PASS。
- 重新生成 12 段旁白、72 条字幕、production timeline、烟测和完整竖版成片。
- 第 0 帧直接显示已发送请求和已更新日历；结尾回到同一完成动作。
- 与 publish-v2 基线的六维编辑代理总分从 39/60 提升到 52/60。

## 配音与时间轴

- Requested provider：`MiniMax Speech`
- Actual provider：`Microsoft Edge neural TTS`（缺少 `MINIMAX_API_KEY`，按配置回退）
- Voice：`zh-CN-YunjianNeural`
- Rate：`+25%`
- Pitch：`-2Hz`
- 分段：12
- 分段音频归一化：`loudnorm I=-16 TP=-1.5 LRA=7`
- 最终混音实测：-14.19 LUFS、4.70 LU LRA、-1.15 dBFS true peak
- 实测成片时长：135.744 秒
- 帧数：4071
- Hook：19.956 秒
- 字幕：72 个 cue；小于 1 秒的 cue 为 0，最短 1.036 秒

## 输出

- 当前成片：`output/episode-001/vertical_9x16.mp4`
- 字幕：`output/episode-001/subtitles_zh.srt`
- 交付报告：`content/episode-001/production/delivery-critic-report.md`
- 基线对比：`content/episode-001/production/comparison-report.md`
- 关键帧与 contact sheet：`output/episode-001/evidence/director-workflow/`
- 规格：H.264、1080×1920、30 fps、AAC 48 kHz
- 文件大小：10,078,003 bytes
- MP4 SHA-256：
  `57a02a5de86f188fe260d6295d7e2a38d16ed948f3341b2d44306e3b472040c0`

## 验证结果

```text
format:check          PASS
lint                  PASS
typecheck             PASS
test                  PASS  9 files / 34 tests
validate:research     PASS  17 sources / 28 facts / 10 events
validate:workflow     PASS  11 owners / 9 decisions / 2 reviews / 1 closed revision
validate:story        PASS  viral 24 / oral PASS / critic 95 / fact PASS / visual READY / retention 93
materialize:story     PASS  12 segments / target 150s
validate:content      PASS  12 segments / 6 assets / hook 20s
tts                   PASS  12 segments / configured fallback
timeline              PASS  135.700s / actual hook 19.956s
render:smoke          PASS  1080×1920
render:vertical       PASS  135.744s
inspect:output        PASS
validate:delivery     PASS  72 cues / micro 0 / minimum 1.036s
validate:comparison   PASS  39/60 → 52/60 (+13)
git diff --check      PASS
```

Episode 002 的 research、workflow、story 和 content 门禁也通过，证明新增流程不是只为
Poke 单集硬编码。

## 发布边界

1. MiniMax Speech 未在本轮实际验证；当前成片使用 Edge neural TTS 回退音色。
2. Poke Release Notes 与 Cognition 公告已登记来源并通过竖屏可读性抽查，正式发布前
   仍需人工确认编辑使用依据。
3. 六维提升是内部编辑留存代理，不是发布后的真实留存结论。
4. 按目标平台要求标记合成语音或 AIGC，并在平台预览竖版 UI 覆盖层。

本项目没有执行上传或发布。
