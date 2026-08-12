# Episode 001 director-cut run report

执行日期：2026-08-11
项目：Poke AI 产品故事短视频
当前状态：**DELIVERY-APPROVED / COMPARISON IMPROVED**

## 本轮结果

- 用 `director-brief.md` 先锁定核心问题、观众承诺、情绪弧线、揭示顺序和事实边界。
- Retention Critic Round 01 以 66 分 REJECT，反馈分别路由到 Story Director、Script
  Writer 和 Visual Director；Round 02 用 before/after 哈希验证修订后以 93 分 PASS。
- 保持旁白和现有 12 段 TTS 不变，修复 7 处字幕语义断裂，重建 61 条字幕、production
  timeline、烟测和完整竖版成片。
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
- 字幕：61 个 cue；小于 1 秒的 cue 为 0，最短 1.053 秒；新语义门禁检出 0 个问题

## 输出

- 当前成片：`output/episode-001/vertical_9x16.mp4`
- 字幕：`output/episode-001/subtitles_zh.srt`
- 交付报告：`content/episode-001/production/delivery-critic-report.md`
- 基线对比：`content/episode-001/production/comparison-report.md`
- 关键帧与 contact sheet：`output/episode-001/evidence/director-workflow/`
- 规格：H.264、1080×1920、30 fps、AAC 48 kHz
- 文件大小：10,140,502 bytes
- MP4 SHA-256：
  `207633de6992736d25212f890ee55feb17f54a22a9383e3ddc118e329e74a0ae`
- Smoke MP4 SHA-256（10.048 秒，991,998 bytes）：
  `7c08c58035d6dee3d992f722b4f7a814d4fddfd38acec136c9892d6439b4f7cc`
- SRT SHA-256：
  `07adeac0ff517a47de382994b6c60f6774629c4ec6f4e974d393c1a26d5742a1`
- Production timeline SHA-256：
  `8e14cd40d4813283ccb23a659b14a56980a59f7fcd4d12714ec7e9585a8facec`
- TTS metadata SHA-256：
  `8143a52c00cffd9510f75f9c77ace10a2d88e26bb1d3558cdaa860b899b12178`
- Caption plan SHA-256：
  `7684e6a926c42d91c2edc15b01b2325c021e658e25156865771e4fc90583cfec`
- Generated captions SHA-256：
  `e791604e692d484cd8888ba04f5435c1e52c40bfce8ce2dd0859b6ba8714dfe4`
- Inspection JSON SHA-256：
  `710d648bef5b0d2ed38c39fad17f06bd90642634183b1a8bc60910f2e0c95858`
- Evidence contact sheet SHA-256：
  `90d16ac7fa321c9250c42d9a0fd7803a4bec399bf9aedd88e585747976be1bc0`
- Final script SHA-256：
  `b86c56c74ba0a616ed1eb87631a1411cd6d07d20adae7c8c044ed4072a60e620`
- Script JSON SHA-256：
  `3b7d3713d7af567391bac5bbf8fcc58e32179bdf8c9762f8a0be148b120271a8`
- Narration SHA-256：
  `3fde248aa12e331513233a19028e1add5b9ca36bfeb8a7c450b4f54f36e3eff4`

TTS metadata 仍只引用 `seg-001` 至 `seg-012`；12 个文件均存在，逐文件 SHA-256
与字幕修复前基线一致，script JSON 拼接旁白与 `narration.txt` 仅空行格式不同。

## 验证结果

```text
format:check          PASS
lint                  PASS
typecheck             PASS
test                  PASS  39 files / 230 tests
validate:research     PASS  17 sources / 28 facts / 10 events
validate:workflow     PASS  11 owners / 9 decisions / 2 reviews / 1 closed revision
validate:story        PASS  viral 24 / oral PASS / critic 95 / fact PASS / visual READY / retention 93
materialize:story     PASS  12 segments / target 150s
validate:content      PASS  12 segments / 6 assets / hook 20s
tts                   REUSED 12 segments / narration and audio hashes unchanged
timeline              PASS  135.700s / actual hook 19.956s
render:smoke          PASS  1080×1920 / 10.048s
render:vertical       PASS  135.744s
inspect:output        PASS
validate:delivery     PASS  61 cues / semantic 0 / micro 0 / minimum 1.053s
validate:comparison   PASS  39/60 → 52/60 (+13)
git diff --check      PASS
```

本轮没有改动或复跑 Episode 002，也没有重新调用外部 TTS。

## 发布边界

1. MiniMax Speech 未在本轮实际验证；当前成片使用 Edge neural TTS 回退音色。
2. Poke Release Notes 与 Cognition 公告已登记来源并通过竖屏可读性抽查，正式发布前
   仍需人工确认编辑使用依据。
3. 六维提升是内部编辑留存代理，不是发布后的真实留存结论。
4. 按目标平台要求标记合成语音或 AIGC，并在平台预览竖版 UI 覆盖层。

本项目没有执行上传或发布。
