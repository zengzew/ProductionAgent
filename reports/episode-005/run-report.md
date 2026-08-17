# Episode-005 Run Report

## 概览

| 项 | 值 |
| --- | --- |
| Episode | `episode-005`（worktree `ProductionAgent-episode-005`，branch `episode-005`） |
| 产品 | Suno（生成式 AI 音乐平台） |
| 标题 / Thesis | 一句歌词，怎么变成一首带人声的歌？——音乐创作从专业门槛变成人人能上手的事，团队选择“创作而非收听”，一亿人开始用它做歌 |
| 成片时长 | 46.233 秒（目标 60 秒，40–80 秒窗口内） |
| 最终 MP4 | `output/episode-005/vertical_9x16.mp4`（1080×1920 9:16，H.264，30fps，AAC 48kHz，峰值 −1.7 dB） |
| ORCHESTRATOR | `manual`（默认，未改动） |
| M6 | 未实现（按要求不使用） |
| 状态 | `delivery-approved`（`validate:delivery` PASS）；`publishStatus=evaluation`，未发布 |

## 11-role workflow 结果

全部 11 个角色按固定顺序完成，文件交接见 `content/episode-005/story/workflow.json`
（status=delivery-approved）：

Research Analyst → Story Director → Viral Director → Script Writer → Oral Rewriter →
Oral Judge（3×5/5，7 项检查全 PASS）→ Audience Critic（92/100 PASS）→ Fact Guardian
（PASS，12 个旁白单元全部 Claim 绑定）→ Visual Director（visual-plan-v3 READY）→
Retention Critic（92/100 PASS）→ Delivery Critic（PASS）。

修订轮次：无 REJECT 轮次；1 次字幕规划修正（seg-004 补 “Bark”）；1 次视觉事件
措辞修正（seg-005 Visual event）；1 次质量轮（fallback 卡片文案 + 第二段真实视频）。

## Claims / Sources

- Claim Ledger：`content/episode-005/research/facts.json`（16 条，全部有 sourceIds）。
- Sources：`content/episode-005/research/sources.json`（7 个：Wikipedia、36氪、
  华尔街见闻、虎嗅、Suno 官网、Suno 官方博客 v5.5、Sequoia 创始人播客）。
- Research timeline：`content/episode-005/research/timeline.json`（7 个事件）。
- 进入旁白的 Claim：claim-suno-001/002/003/004/005/006/007/008/011/012/013；
  claim-suno-010/014/015/016 在 Ledger 但不进旁白。

## Real media（M5 Real-Media-First）

- Source：`episode-005:media-source:official-creator-video`（publisher=Suno，
  官网首页创作者区公开视频，官方 CDN cdn1.suno.ai，本地下载后按 local-approved
  导入；admission + rights 两份 HumanDecision 均为人工批准，reviewer=zengzew，
  持久化于 `content/episode-005/production/human-decisions/`）。
- Verified real-media clips（均 verdict=pass）：
  1. seg-001 Hook：`episode-005:media-clip:38013cf59cedb03aaa58f729`
     （Miles 视频，original SHA `5edf4041505b1920…`，source timestamp 0–4000ms）。
  2. seg-006 结尾：`episode-005:media-clip:b9a81754afab6af461c2351b`
     （Timbaland 视频，original SHA `36f3ca12ce63ec47…`，source timestamp 28000–32000ms）。
- 追溯链（`resolveMediaShotLineage` 全链验证）：
  shot → VisualSlot → verification(pass) → ClipIndex → MediaAsset(original SHA)
  → source → source timestamp。两条链均通过。
- 环境说明：无 hosted ASR/VLM key，按 M5 文档使用 deterministic
  transcript/VLM 适配器（与 m5e2e 验收相同）；hash/rights/admission/registry
  等确定性门禁均为真实代码路径。

## Fallback 原因

- seg-002/003/004/005：`REAL_MEDIA_NOT_FOUND`（无检索结果）→ 按固定优先级回退
  到 data-evidence-card：规模、产品机制、团队、发布节点没有证据拟合足够的
  官方视频可映射（现有官方 CDN 视频均为创作者展示，不展示输入界面/创始人/
  日期节点），故不强行使用弱相关素材。

## TTS

- 请求 MiniMax，缺 `MINIMAX_API_KEY` 后回退 Microsoft Edge neural TTS
  `zh-CN-YunjianNeural` +25%（loudnorm I=−16 TP=−1.5 LRA=7），6 段。
- 字幕：24 cues，0 micro cue，最短 1.018s，caption-plan 对齐。

## Delivery 结果

- `pnpm inspect:output` PASS：1080×1920、h264、30/1 fps、aac 48 kHz、46.233s、
  peak −1.7 dB。
- `pnpm validate:delivery` PASS：cues=24, semantic=0, micro=0 (0.0%), minimum=1.018s,
  status=delivery-approved。
- Self-inspection：freezedetect 无 >2.5s 冻结（4 个 data-card 段约 2s 静态卡片，
  已在 fallback 原因中说明）；8 个时间点抽帧互不相同（无重复画面）；音轨全程
  有声无削波；seg-006 的 16:9 素材以 cover 方式裁切为 9:16（无变形）。

## Changed files（worktree，branch episode-005）

- `src/lib/render-contract.ts`（additive：注册 episode-005 → MediaMixVertical）
- `content/episode-005/`（episode.config.json、research/、story/、production/、
  media/ 全套产物）
- `src/episode-005-timeline.generated.json`、`src/episode-005-captions.generated.json`
- `public/episodes/episode-005/`（音频、媒体投影）
- `output/episode-005/`（vertical_9x16.mp4、subtitles_zh.srt、inspection.json）
- `reports/episode-005/`（media-pipeline.ts、media-summary.json、本报告）
- `downloads/`（两个官方视频的本地字节）

未修改：prompts、Golden Set（editorial-calibration、style/）、hard validators、
duration rules（config/production-contract.json 等）、M1–M5 基础设施代码
（唯一改动是 render-contract 的 additive episode 注册，与 episode-m5e2e 注册同型）。

## Commands run（worktree，Node v24.13.0，EPISODE_ID=episode-005）

```text
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
pnpm materialize:story
tsx reports/episode-005/media-pipeline.ts   (discover→admission/rights→ingest→index→retrieve→verify→select)
pnpm media:render-plan
pnpm tts
pnpm timeline
pnpm validate:content
pnpm render:vertical
pnpm inspect:output
pnpm validate:delivery
```

## Blockers

- 无未解决 blocker。遗留说明：① 本环境无 hosted VLM/ASR key，multimodal
  验证使用 M5 文档规定的 deterministic 适配器（与 m5e2e 验收一致）；② 发布前
  仍需人工权利终审与合成语音披露（evaluation run 不发布）；③ 人工耳机听感
  未做（交付报告已注明）。

## Quality gates（worktree 上运行）

- `pnpm typecheck` PASS、`eslint`（改动文件）PASS。
- 定向测试 `render-contract` / `media-selection` / `media-remotion`：30/30 PASS。
- 全量 `pnpm test`：482/486 PASS；4 个失败全部位于
  `tests/orchestration/legacy-backfill.test.ts`，原因是新 worktree 缺少 gitignore
  的既有输出 fixture `output/episode-001/vertical_9x16.mp4`（非本次改动引入）；
  补齐该 fixture 后该文件 12/12 PASS（即代码上全量 486/486）。
- `pnpm format:check` 未运行（仓库存在 17 个既有未格式化文件，与本 episode 无关）。
