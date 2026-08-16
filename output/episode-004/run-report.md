# Episode 004 evaluation run

- Episode: `episode-004`
- Product: Devin (Cognition)
- Title: 把任务交给它，剩下的它自己干
- Core story question: 把一个编程任务交给 Devin 之后，它是怎样自己打开浏览器、写代码、跑测试，让工程师开始“派活”而不是自己写代码的？
- Orchestrator: `manual` (unset / default)
- Publish status: `evaluation`（未写入 final approval 或 published；media admission/rights 为真实 HumanDecision，reviewer=`human-approver`，经人工批准）
- As of: 2026-08-16

## Measured output

- `output/episode-004/vertical_9x16.mp4`
- Duration: 44.033 s（40–80 秒窗口内，目标 60 ±20）
- 1080×1920, 30 fps, H.264 + AAC 48 kHz
- Peak: -4.1 dB（无削波）
- Captions: 24 cues, 0 micro cue, 0 semantic break, min cue 1.013 s
- TTS: requested MiniMax, actual Microsoft Edge `zh-CN-YunjianNeural` (+25%, pitch -2Hz) because `MINIMAX_API_KEY` was missing
- Real media: **6/6 段使用人工批准 + 核验的官方 real-media clip**（0 fallback）

## Commands

```bash
# 内容与评审（11-role workflow 产物）
git worktree add -b episode-004 ../ProductionAgent-episode-004
pnpm validate:research            # PASS: 15 sources, 11 facts, 7 events
pnpm validate:workflow            # PASS（最终: 11 owners, 9 decisions, 3 reviews, delivery-approved）
pnpm validate:story               # PASS: 6 segments, hook=20s, viral=24, oral=PASS, critic=92, fact=PASS, visual=READY, retention=92
pnpm materialize:story
# 媒体准入（真实 HumanDecision，人工批准后）
npx tsx reports/episode-004/media-pipeline.ts propose     # 6 个官方 source，pending/review-required
npx tsx reports/episode-004/media-pipeline.ts admit --reviewer=human-approver   # 12 份 HumanDecision
# 生产
pnpm tts                          # Edge 回退
pnpm timeline                     # 44.033s；hook 17.89s ≤ 20s
pnpm validate:content             # PASS
npx tsx reports/episode-004/media-pipeline.ts reset-stages && npx tsx reports/episode-004/media-pipeline.ts pipeline
                                  # ingest(12 assets) → index(6 clip-index) → retrieval(25 candidates/segment)
                                  # → human keyframe review(OCR) → verification(6 pass) → selection(6 real-media)
pnpm media:render-plan            # 6 shots, 6 real-media, plan 0176204d5c6c
pnpm render:smoke && pnpm render:vertical
pnpm inspect:output               # PASS
pnpm validate:delivery            # PASS: status=delivery-approved
```

## 11-role workflow

| 角色 | 产物 | 结果 |
| ---- | ---- | ---- |
| research-analyst | `research/facts.json`（Claim Ledger 11 条）、`sources.json`（15 个来源）、`timeline.json`（7 事件） | PASS |
| story-director | `director-brief.md`、`story-bible.md`、`story-angle.md`、`three-act-structure.md` | READY |
| viral-director | `hook-candidates.md`、`viral-strategy.md` | 24/25 READY |
| script-writer | `script-draft.md` | PASS |
| oral-rewriter | `final-script.md`（6 段 12 个旁白单元） | PASS |
| oral-judge | `oral-review.md` | 5/5/5 PASS，七项检查通过 |
| audience-critic | `critic-report.md` | 92/100 PASS |
| fact-guardian | `fact-check-report.md` | PASS |
| visual-director | `visual-plan.md`（v3，real-media first） | READY |
| retention-critic | `retention-report.md` | 92/100 PASS |
| delivery-critic | `production/delivery-critic-report.md` | PASS（绑定真实 hash） |

## 选题与素材

- 选题：Devin（Cognition）——第一个被官方称为 AI 软件工程师的自主编程 agent。
  不复用 episode-003（Manus）的选题、script、claims 与 visual plan。
- 素材：6 个 Cognition 官方 YouTube 视频（Introducing Devin、Getting Started、
  How to Run 10 Devins in Parallel、Mercedes-Benz partnership、Upwork Side Hustle、
  Working with Devin in your IDE），640×360 mp4 + 官方 en 字幕（yt-dlp android
  client，2026-08-16 下载）。全部经 propose → 人工 admission/rights 批准
  （reviewer=`human-approver`）→ ingest → normalize。

## 验证与证据

- 检索：claim-bound deterministic retrieval，25 candidates/segment；中文 claim 与
  英文字幕的词汇匹配为弱证据，最终由人工 keyframe 审阅（Vision OCR 读取画面文字 +
  字幕轨道）决定每个 clip 的证据充分性。
- 核验：6/6 pass（provider `human-keyframe-review`，hash-bound verification 产物）。
- 渲染门禁：`assertMediaRenderPlanRenderable` PASS；lineage 全链一致（shot →
  VisualSlot → verification → ClipIndex → MediaAsset SHA → source → 原片时间戳）。
- 成片抽帧 OCR：0.1s 任务输入界面、7s “The first AI software engineer”+姓名卡、
  15s 计划列表、25s parallel builds UI、28s `Katrin Lehmann | CIO, Mercedes-Benz`、
  33s 89% 数据卡、38/43s 测试计划与测试报告（任务仍在执行）。

## 已知边界 / fallback 说明

- 本环境无 hosted ASR/VLM key：transcript 使用官方视频自带字幕轨道（真实、带时间戳，
  provider=`youtube-captions`）；verification 使用人工 keyframe 审阅（OCR 证据），
  两者均在产物中如实标注，未冒充 hosted VLM。
- 素材分辨率 640×360（YouTube android client 上限）；UI 文字在竖屏裁切/PiP 中可读，
  视觉质量为 M5 选择顺序最低优先级。
- seg-003/004/006 的镜头来自同一支官方平行 Devin 视频的三个不同时间窗（计划列表 /
  并行构建 / 测试报告），画面风格相近但内容不同。
- 奔驰 COBOL 数字（20 万行、8 个月→8 天）在同一官方访谈的 84–92 秒口播；成片使用
  8–12 秒合作伙伴声明画面，数字以字幕卡呈现。
- 时间轴 1 帧取整缺口通过 episode 级 `timelineTailSeconds`（seg-002: 0.189,
  seg-005: 0.9007）消除，未改任何基础设施代码。
- `src/lib/render-contract.ts` 仅做 additive 注册（episode-004 → MediaMixVertical），
  与 M5 acceptance 对 episode-m5e2e 的做法一致。

## 质量门禁

- `pnpm typecheck` PASS；`pnpm lint` PASS；`pnpm exec prettier --check`（本次改动文件）PASS
- media/render/delivery 相关测试套件 80/80 PASS
- 全量 `pnpm test`：36 个失败全部为 `tests/orchestration/*` 预存在问题，与未改动的
  master 基线（同一 commit）失败清单完全一致，非本次改动引入
- `pnpm format:check` 全仓失败为基线状态（master 130 个文件），本次未扩大

## 未发生的事

- 未伪造 HumanDecision / final approval / published / PASS（delivery PASS 绑定真实产物 hash）
- 未修改 prompts、Golden Set、hard validators、duration rules、M1–M5 基础设施
- 未实现 M6；ORCHESTRATOR=manual 默认不变
- 未上传或发布任何内容
