# Episode-008 / Lovable

目标：真实1080×1920竖屏中文MP4，40–80秒。研究与既有fixture隔离；沿用master。

当前：用户允许受控渲染后，Episode-008本地审阅版MP4已生成，输出为`output/episode-008/vertical_9x16.mp4`。42.166667秒、1080×1920、30fps、H.264/AAC 48kHz，9,393,109字节；SHA-256为`7c0b614beb3eee18fca04538df5b8abc4f8e8f817a1561258d8f5755324049a1`。真实MiniMax六段语音无fallback，最终音视频全片解码通过，音频峰值−1.7dB。round-01至round-03保留供对照。

独立评审：Oral第3轮PASS 4/4/4，Audience第2轮PASS88，Fact6段6units PASS，Retention计划82分。保留口播与观众初轮拒绝记录。机械门不是创意和成片质量证明。

验证：研究、故事、内容production校验通过；81项affected测试此前通过，本次14项媒体组件测试与TypeScript通过。最终MP4技术读回通过，24条字幕的短cue占4.17%。独立成片抽帧报告按轮次留存；完整人工试听未完成，workflow保持story-approved，未宣称release或人工最终验收通过。不跑全量Vitest。

素材：Lovable官方长视频仅定位短片，3条竖屏操作片按源码时间偏移和裁切配方可重建。照片的官方品牌页允许编辑报道，其他页面只作署名本地评估引用。用户要求继续已列明范围的本地MP4后记录正式admission/rights；不代表外部发布权利或人工最终验收。

问题细节见blockers.md和issues.json。原片、元数据、评审请求与结果各自保留哈希；最终视频不手修。

最终修正：稳定钩子消除白闪，替换正确GTM/ARR来源截图，标题层移入空区避免遮叠，来源标明Lovable，页面截图徽章修复过滤规则后可显示。E008-025渲染权限问题已解除。剩余本地审阅备注：机制段数据库画面约比字幕晚0.8秒；完整人工试听与外部发布权利终审尚未完成。完整问题清单含30项记录。

## 2026-09-04 续作记录

上一轮MP4的逐帧检查发现三个可见问题：钩子源片段在原始15.8–19.4秒区间包含约0.6秒白屏过渡；seg-005截到了Lovable文章的Introduction而不是Distribution；seg-006只留下窄标题条，且静态图层白色contain画布令文字无法承担证据。处理方式均已落到可重跑资产：重新抓取两篇官方页面的可读裁切，保留round-01资产作对照；从同一已准入原片生成12.0–15.6秒`prepared-hook-stable`并完成独立媒体PASS；静态图层改为深色、保持比例并按当前script显示标题/指标。`build-evaluation.ts`已重新生成manifest，seg-001当前选中`episode-008:media:prepared-hook-stable`。

本轮验证：`node --import tsx scripts/test-affected.ts`为81项测试全通过；`node --import tsx scripts/validate-episode.ts --profile fast`与`--profile production`通过；`pnpm typecheck`通过；旧round-01 MP4的技术读回仍为1080×1920、30fps、H.264/AAC、42.167秒。`--profile release`已通过研究、故事和内容检查，但在缺少当前`delivery-critic-report.md`处停止。尝试新版渲染时Chromium在macOS沙箱启动阶段报`MachPortRendezvous… Permission denied`；受控升级执行因Codex账户使用上限被自动审查拒绝。详见`logs/render-round-02-blocked.log`，当前没有把旧MP4宣称为新版最终交付。
