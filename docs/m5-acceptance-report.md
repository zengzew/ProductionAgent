# M5 Exit Acceptance Report

日期：2026-08-16  
仓库：`ProductionAgent`  
基线 HEAD：`2fd27f7`（WP-M5.06 commit）；本报告对应其后的 M5.07 + M5.08 + M5 exit 验收工作树  
验收范围：M5.01–M5.08 全部 media 管线、real-media Remotion editing、render/delivery 门禁、orchestration/cache/concurrency 回归，以及两次独立 E2E（合法 real-media 通过、tampered-media 失败）。  
执行环境：Node `v24.13.0`（`~/.nvm/versions/node/v24.13.0/bin`），macOS 本地，无网络依赖（TTS 使用本机 `say`，VLM/ASR 使用文档规定的 deterministic 适配器，ffmpeg/ffprobe 为真实工具）。

## 结论

**M5 ✅ exit-accepted**

所有 critical gates 通过。验收期间只做了三处最小必要修复（composition 浏览器侧依赖拆分、render gate 增加 cut-source/proxy 字节校验、render proxy 临时文件扩展名），没有实现新功能，没有进入 M6。M5.09 仍不在本 WP 范围内（见 non-critical notes），但其 exit criteria 中的两条 E2E（一条 real-media 通过、一条 tampered-media 失败）已由本次验收独立执行并通过。

## Critical gate 结果

| Gate                            | 结果     | 当前证据                                                                                                                                             |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5.01–M5.08 media contract 套件 | **PASS** | `tests/media-contract                                                                                                                                | discovery      | ingest              | index                | retrieve           | verify                               | selection      | remotion.test.ts`：8 files、144 tests passed |
| render / delivery contract 套件 | **PASS** | `render-contract                                                                                                                                     | delivery       | captions            | production-contract  | composition-shared | scene-animation                      | baseline-gates | validation-entrypoints`：60 tests passed     |
| orchestration 回归              | **PASS** | `tests/orchestration`：32 files、193 tests passed（M4 CAS/concurrency/observability 不退化）                                                         |
| cache / recovery / isolation    | **PASS** | `media-remotion                                                                                                                                      | media-contract | orchestration/cache | checkpoint-integrity | concurrency        | observability-gate`：41 tests passed |
| type safety / lint              | **PASS** | `pnpm typecheck`、`pnpm lint`（`--max-warnings=0`）                                                                                                  |
| full `pnpm test`                | **PASS** | 62/63 files、480/482 tests passed；2 个失败为 media-ingest 在满并行负载下的已知 5s timeout flake，独立运行全部 PASS（36/36）                         |
| 集成 real-media E2E             | **PASS** | 真实 fixture MP4 → admission/rights → ingest → normalize → index → retrieve → verify → select → render plan → 9:16 MP4 → inspect → **Delivery PASS** |
| tampered-media E2E              | **PASS** | original / proxy / verification / selection 逐一 tamper 全部被检测；warm cache 不能绕过；fail-closed；无 Delivery PASS                               |
| MP4 技术读回                    | **PASS** | `output/episode-m5e2e/vertical_9x16.mp4`：1080×1920、H.264、30 fps、AAC 48 kHz、42.800 s、peak −4.1 dB                                               |
| lineage 追溯                    | **PASS** | rendered shot → clip → verification(pass) → ClipIndex → original MediaAsset SHA → source + 0–4000 ms 全链一致                                        |
| boundary 回归                   | **PASS** | `ORCHESTRATOR=manual` 默认不变；Goal 3.2/Golden Set/prompts/hard validators 未被本 WP 修改；无 publish/upload；LangGraph state reference-only        |

## M5.01–M5.09 结果

| WP    | 交付物                                                           | 结果         | 证据                                                                                    |
| ----- | ---------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| M5.01 | MediaAsset / provenance / rights fail-closed                     | PASS         | media-contract 13 tests；本报告 lineage 中 original SHA 与 fixture 一致                 |
| M5.02 | source admission + rights（HumanDecision）                       | PASS         | E2E 中 admission/rights 决策 artifact 持久化并可读回；revoked rights 阻断 render        |
| M5.03 | ingest + normalize + lineage                                     | PASS         | E2E 真实 11.5 MB MP4 入库、proxy 7.3 MB 生成；crash/resume 与 normalize cache 测试 PASS |
| M5.04 | transcript/scenes/keyframes/ClipIndex                            | PASS         | media-index 套件 PASS；E2E 建立 clip-index 供 retrieval                                 |
| M5.05 | deterministic retrieval                                          | PASS         | E2E：4 candidates、top score 0.519667；相同输入 → 相同 key/结果                         |
| M5.06 | short-clip VLM verification + `assertMediaClipVerified`          | PASS         | E2E verdict=pass；tampered verification 在 render gate 被拦截                           |
| M5.07 | VisualSlot selection + fallback                                  | PASS         | E2E 选中 real-media；rights revoked 场景 fallback `REAL_MEDIA_RIGHTS_BLOCKED`           |
| M5.08 | real-media Remotion editing（trim/crop/PiP/audio/cache/lineage） | PASS         | media-remotion 12 tests；E2E 真实渲染；render cache hit/miss 事件                       |
| M5.09 | Delivery gate + E2E（正式 test file）                            | **deferred** | 未实现（不在本 WP 范围）；其两条 E2E 已由本次验收执行并 PASS/FAIL-closed 正确           |

## 集成 real-media E2E 证据

专用验收 episode `episode-m5e2e`（`src/lib/render-contract.ts` 增加该 episode 的
`MediaMixVertical` 契约，纯 additive）：

1. **真实 fixture**：`ffmpeg testsrc2+sine` 生成 24 s、1280×720、30 fps MP4
   （11,513,933 bytes，SHA-256 `7bc9633f…`）。
2. **admission + rights**：`local-approved` source 经 `proposeMediaSource` +
   两份持久化 HumanDecision（`media-admission` / `media-rights`）approve。
3. **ingest**：`ingestMediaSource` 真实字节入库，original artifact
   `episode-m5e2e:media:demo`（SHA 与 fixture 一致，bytes immutable）。
4. **normalize**：真实 ffmpeg proxy `episode-m5e2e:media:demo-proxy`
   （`f0e62f88…`，7,301,277 bytes）。
5. **index**：真实 keyframe 管线 + deterministic transcript stub（3×8 s 段落）。
6. **retrieve**：claim-bound Top-K（4 candidates，top score 0.519667）。
7. **verify**：deterministic pass VLM stub，verdict=pass，recommended window
   记录在案。
8. **select**：`real-media` VisualSlot（clip
   `episode-m5e2e:media-clip:1ebacc573f498cdcc4383420`）。
9. **Remotion editing**：`pnpm media:render-plan` 产出 4 shots（1 real-media +
   3 programmatic fallback），render proxy 由 ffmpeg 裁剪（0–4000 ms）。
10. **渲染**：`remotion render … MediaMixVertical` → 1080×1920 9:16 MP4。
11. **inspect**：ffprobe 读回 1080×1920、h264、30/1 fps、aac 48 kHz、
    42.800 s、peak −4.1 dB、19 captions、0 micro cue、errors=[]。
12. **Delivery PASS**：`validate:delivery` — cues=19, semantic=0, micro=0
    (0.0%), minimum=1.188s, status=delivery-approved。

Lineage 全链（`resolveMediaShotLineage`）：

```text
rendered shot (seg-001)
→ clip episode-m5e2e:media-clip:1ebacc573f498cdcc4383420 (0–4000 ms)
→ verification episode-m5e2e:media-verification:…-1ebacc573f498cdcc4383420 (verdict=pass)
→ ClipIndex episode-m5e2e:media-clip-index:demo
→ original MediaAsset episode-m5e2e:media:demo sha256=7bc9633f907a052812d0120ad8588858dac2058667782d3d3eaacb36d3bc0f6e
→ source episode-m5e2e:media-source:official-demo (publisher “M5 Acceptance Fixture”)
→ source timestamp 0–4000 ms
```

复现命令（记录于 `reports/m5-acceptance/`）：`setup-e2e.ts`（story+说白+媒体管线）、
`EPISODE_ID=episode-m5e2e pnpm timeline`、`pnpm media:render-plan`、
`remotion render src/index.ts MediaMixVertical --props='{"episodeId":"episode-m5e2e"}' …`、
`pnpm inspect:output`、`e2e-evidence.ts`、`pnpm validate:delivery`。

## Tampered-media E2E 证据

在完整合法管线（含已渲染 MP4 与 Delivery PASS）之上，逐一 tamper 关键
artifact，每次均先断言 baseline gate PASS，tamper 后断言 fail-closed，
再恢复并断言 gate 重新 PASS：

| Tampered artifact                   | 检测结果 | 错误                                                                               |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| original asset bytes                | ✅ 检测  | `MEDIA_RENDER_CLIP_GATE_FAILED:MEDIA_VERIFY_ASSET_TAMPERED`                        |
| normalized proxy bytes (cut source) | ✅ 检测  | `MEDIA_RENDER_CUT_SOURCE_TAMPERED:ARTIFACT_HASH_MISMATCH`                          |
| verification artifact bytes         | ✅ 检测  | `MEDIA_RENDER_CLIP_GATE_FAILED:MEDIA_VERIFY_VERIFICATION_TAMPERED`                 |
| selection (visual-slot) bytes       | ✅ 检测  | `MEDIA_RENDER_SLOT_TAMPERED`                                                       |
| original bytes + **warm cache**     | ✅ 检测  | `MEDIA_RENDER_CLIP_GATE_FAILED:MEDIA_VERIFY_ASSET_TAMPERED`（cache 不能绕过 gate） |

任何 tamper 状态下 `assertMediaRenderPlanRenderable` 均失败 → 无法重渲染 →
`validate:delivery` 不能以 tampered media 通过（Delivery PASS 只绑定合法
pipeline 的 MP4/timeline hash）。结论：**不允许 Delivery PASS**。

## Cache / replay / isolation 证据

- **crash/resume**：`media-ingest` “resumes after a crash without repeating
  hash-valid work” PASS；orchestration `cache.test.ts` checkpoint/resume
  边界 PASS。
- **cache 命中/重建**：`media-remotion` cache 测试（miss → hit 重发布 →
  trim 变化 → miss）；`media-ingest` normalize cache hit + corrupt entry
  rebuild（独立运行 PASS）；`orchestration/cache` corrupt TTS payload rebuild
  并发出 zero-cost hit 事件 PASS。
- **render cache key**：clip SHA + trim + crop/transform + timeline/render
  config；同输入同 key、任一输入变化 key 变化（测试断言）。
- **isolation**：episode 前缀校验贯穿 source/asset/clip/verification/selection/
  shot/plan；cross-episode shot 测试证明即使 artifact 自洽，跨 episode 也
  fail-closed（`MEDIA_RENDER_SLOT_MISSING`）。
- **M4 CAS / concurrency / observability**：orchestration 193 tests 全 PASS，
  本 WP 未改动 M4 合约（cache kind 仅 additive 增加 `media-render`，事件 schema
  仅 additive 增加 `shotId`/`renderProxyRef`）。

## 最终 MP4 技术读回

| 属性            | 值                                       |
| --------------- | ---------------------------------------- |
| 文件            | `output/episode-m5e2e/vertical_9x16.mp4` |
| 尺寸            | 1080×1920（9:16）                        |
| 视频编码        | h264                                     |
| 帧率            | 30/1                                     |
| 音频编码/采样率 | aac / 48000 Hz                           |
| 时长            | 42.800 s（40–80 s 窗口内）               |
| 峰值            | −4.1 dB（无削波）                        |
| captions        | 19 cues，0 micro cue，语义断裂 0         |
| inspection      | errors=[]，output inspection passed      |

## Representative artifact SHA-256

| Artifact                             | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| fixture / original asset（同一字节） | `7bc9633f907a052812d0120ad8588858dac2058667782d3d3eaacb36d3bc0f6e` |
| normalized proxy asset               | `f0e62f88d227732af00dace2295c21e52124a26a78ed0f00f68ead556a27d67a` |
| render proxy（trimmed cut）          | `1c783f6349bdb33102b76ddaf4b8ae76b1d40af8d6c1ee8cb6f25fbbc5a99ae4` |
| `media-render-plan-v1`               | `8442ea0c207db722a8bd470e99bc4b31da7352a33d28c98b49a36e95d3413fb2` |
| `media-shot-v1` seg-001              | `843cbd03134d07b803a60a89decf14acd5dc967aff72d06346b55f24cb7c3a2b` |
| `production/timeline.json`           | `bda98ec75de1a09779707f94d425f1bdc9d6af909f886edc23140759610213c6` |
| final `vertical_9x16.mp4`            | `709afc3b99783fb81cb457f449c2e4377caf508bf5f69ac956388d098b3d68de` |
| `subtitles_zh.srt`                   | `8b46f6dd8b81bbd1cc8fc657c3e1de3c37015ddab3c6b05a216523e036b0f7bc` |
| `inspection.json`                    | `fe32685f6fe390c7662975a2c273826ad6ba389ac1e527a1c6e7b38fc142f063` |
| `delivery-critic-report.md`          | `5310f935282d3d503fa6395f86a1ca834ff43c464affd572333cf236d204fd2e` |

## Regression / boundary checks

- `ORCHESTRATOR=manual` 默认不变（`selectOrchestrator` 默认 manual，README 与
  M1–M4 合约未动）。
- Goal 3.2 / Golden Set / prompts（`prompts/`、`editorial-calibration/`、
  `style/`、`config/polish-v2.json`）未被本 WP 修改（工作树中相关 diff 均为
  M5.07 之前的既有修改，本 WP 未触碰）。
- hard validators（`scripts/validate-*.ts`）未修改；40–80 s、9:16、H.264、
  caption 语义边界等 contract 原样执行（E2E 读回 42.800 s）。
- 无 social publish/upload 代码路径（media 模块中 “publish” 仅指 hash-bound
  artifact 注册）。
- LangGraph state 仍 reference-only（VisualSlot 节点只产出 ArtifactRef，media
  outcome 只含 refs，测试断言 state 不含正文）。
- original media bytes immutable：ingest 只写一次；render gate 对 original 与
  cut source 逐字节校验；E2E 中 original SHA == fixture SHA。
- LLM/VLM 不能授予 rights：VLM 只 observe/score，授权由确定性代码
  （`assertMediaClipVerified` / `assertMediaShotRenderable`）执行；E2E 中 tampered
  verification 无法绕过。

## Non-critical notes

1. **M5.09 未实现**（按 WP 范围约定，不在本 WP 内）：`tests/media-e2e.test.ts`
   尚未落地；其 exit criteria 的两条 E2E 已由本次验收以 `reports/m5-acceptance/`
   脚本独立执行并通过（real-media PASS / tampered FAIL-closed）。正式 M5.09 WP
   应把这些脚本固化为可重复测试。
2. **满并行 load flake**：`pnpm test` 在默认并行度下偶发 5 s timeout
   （media-ingest real-WebM/normalize-cache 等重 ffmpeg 用例），独立运行与
   分组运行全部 PASS；基线（无本 WP 改动）同样存在该行为。
3. **hosted ASR/VLM 未在本环境调用**（无网络/无 key）：E2E 使用文档规定的
   deterministic 适配器；deterministic 门禁（hash/rights/admission/registry）
   全部为真实代码路径。
4. `pnpm format:check` 仍报告 17 个既有文件（M5.07 之前的文档/源码），本 WP
   新增/修改文件全部通过 prettier 检查；新增 `.gitignore` 条目 `build/`
   （Remotion bundle 输出目录）。
5. 验收期间的最小必要修复（均非新功能）：① composition 浏览器侧拆分
   `src/media/render-math.ts`（修复 Remotion bundle 回归）；② render gate 增加
   `MEDIA_RENDER_CUT_SOURCE_*` 字节校验（tamper E2E 发现 proxy tamper 漏检）；
   ③ render proxy 临时文件以真实扩展名结尾（ffmpeg muxer 推断）。
