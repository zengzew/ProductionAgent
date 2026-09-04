# Episode-008 运行问题记录

产品 Lovable。用户已允许受控渲染，E008-025环境阻塞已解除。round-04 MP4已生成且技术读回通过：42.166667秒、1080×1920，SHA-256为7c0b614beb3eee18fca04538df5b8abc4f8e8f817a1561258d8f5755324049a1。所有批准仅限本地评估；外部发布未批准。下面保留各阶段历史，最新结构化状态以issues.json为准。

本次成片复核又发现并处理了标题叠加、来源标注、截图日期和徽章误过滤（E008-027、E008-030）。仍明确保留两项边界：机制段数据库画面比对应字幕晚约0.8秒（E008-028），完整人工试听与外部发布验收待完成（E008-029）。

| ID | 阶段 | 状态 | 问题与处理 | 证据 |
| --- | --- | --- | --- | --- |
| E008-001 | environment | resolved | 默认 Node v22.23.2，仓库要求24.x。 所有生产命令使用已安装 Node v24.13.0 PATH；预检与研究执行成功。 | [logs/research.log](logs/research.log) |
| E008-002 | research | resolved | 来源时点混用风险：当前官网有2026公告，选题采用2024–2025故事。 研究包明确历史窗口，每个数字保留事件日期与公司/创始人口径。 | [../research/growth-data.md](../research/growth-data.md) |
| E008-003 | workflow | resolved | 新一期没有评审，Fast schema却强制reviewCycles至少1条。 修复为仅尚未评审的in-progress可为空；批准状态和已完成评审仍必须有记录。32个受影响测试通过。 | [logs/fast-initial.log](logs/fast-initial.log) |
| E008-004 | media-discovery | resolved | 正式来源入口返回MEDIA_DISCOVERY_HOST_NOT_ALLOWED：www.youtube.com和lovablebrand.lovable.app。 精确加入两个已定位官方域名后成功propose，两来源经正式API完成本地评估准入。 | [../media/source-manifest.json](../media/source-manifest.json) |
| E008-005 | media-rights | resolved-for-local-evaluation | 官方视频公开播放不等于生产素材使用批准；照片已找到编辑报道许可。 用户在已说明来源待准入后明确要求继续；按该指令记录本地评估admission/rights，外部发布权利未终审。 | [local-evaluation-authorization.json](local-evaluation-authorization.json) |
| E008-006 | media-verification | resolved | 视频长约67分钟，最初时间指示对应缓存缩略图；实际播放后帧只有640×360。 1080p原片实际查看；生成哈希绑定竖屏裁切并由独立媒体评审真实核验，原3条PASS，稳定钩子替换后新增1条PASS。 | [../media/verification-readiness.json](../media/verification-readiness.json) |
| E008-007 | tooling | resolved | 临时Python内容生成脚本报Non-UTF-8 code，但字节UTF-8解码成功。 加显式UTF-8声明后脚本成功，根因未进一步定位；未改仓库运行环境。 | [run-report.md](run-report.md) |
| E008-008 | editorial-review | resolved | 当前写稿会话不能同时冒充未参与上游的独立评审。 用户已批准评审子代理。独立口播第3轮PASS，观众第2轮88分PASS，事实与留存记录已归档。 | [../story/workflow.json](../story/workflow.json) |
| E008-009 | release | resolved-for-render-gate | release故事门与内容门已通过；真实TTS、timeline和新版render manifest已完成，但最终MP4渲染受Chromium权限阻塞，Delivery Critic尚未有当前输入。 | [../story/workflow.json](../story/workflow.json) |
| E008-010 | oral-review | resolved | 接着、再把并列推广活动写成无来源先后。 保留第一轮拒绝记录，删除顺序连接词，第2轮PASS。 | [../story/reviews/round-01/oral-review.md](../story/reviews/round-01/oral-review.md) |
| E008-011 | timing | resolved | 初稿Hook计划15秒，契约要求20秒。 前三段目标3+10+7秒，真实时长待读回。 | [../story/final-script.md](../story/final-script.md) |
| E008-012 | environment | resolved | tsx IPC被sandbox阻止；uv缓存不可写且PyPI DNS受限。 Node24 --import tsx；临时uv缓存移至/tmp，获准联网安装yt-dlp，确认1080p可用。 | [run-report.md](run-report.md) |
| E008-013 | audience-review | resolved | 第1轮82分REJECT：继续观看问题偏离用户实际使用，保存动作重复。 两稿改为可用性问题，seg004加入登录与数据库新行；口播第3轮PASS，观众第2轮88分PASS。 | [../story/reviews/audience-round-01/critic-report.md](../story/reviews/audience-round-01/critic-report.md) |
| E008-014 | media-preparation | resolved | 本机FFmpeg未编译drawtext，文字绘制报No such filter。 用Sharp将原创文字排版生成透明PNG，再由FFmpeg叠加到真实片段，配方可重跑。 | [prepare-vertical-media.py](prepare-vertical-media.py) |
| E008-015 | content-validation | resolved | 具体动作门仅认识旧词表，未识别本期保存、刷新、登录。 补入3个客观产品动作；保持人工口播、观众、事实和留存评审及原阈值不变。 | [../../../config/production-contract.json](../../../config/production-contract.json) |
| E008-016 | media-retrieval | resolved | normalizeRetrievalRequest丢失visualTrackMode，将独立画面请求重置claim-evidence并错误降分。 保留该字段，增加回归断言；未降低ranking阈值或调整惩罚，46项相关测试通过。 | [../../../src/media/retrieve.ts](../../../src/media/retrieve.ts) |
| E008-017 | renderer | resolved | 通用真实媒体层硬编码GAMMA产品标注；新产品截图缺少通用标题呈现。 移除错误品牌硬编码，使用来源/片内标注；截图层支持当前script已有标题逐项显示，无新Composition。 | [../../../src/media/remotion.tsx](../../../src/media/remotion.tsx) |
| E008-018 | tts-timing | resolved | 初次真实TTS时间轴41.567秒；Hook实际18.533秒，首镜2.4秒不足看清刷新结果。 首镜尾帧调到3秒，Hook实际19.133秒在20±1区间，整片42.167秒。 | [timeline.json](timeline.json) |
| E008-019 | media-timing | resolved | 机制段原先12.6秒而实际语音+尾帧约8秒，直接用会裁掉数据库证据。 按真实语音生成8秒timed新版：登录、保存后新行、数据库对应行；保留旧版与新版哈希，独立重新核验PASS。 | [vertical-edit-recipe.json](vertical-edit-recipe.json) |
| E008-020 | media-index | resolved | 检索要求本期全部已准入video originals已有index，原始研究片段尚未索引阻挡检索。 按正式接口补齐3条原片索引，ASR unavailable如实记录，不捏造转录；prepared执行实际语义审阅。 | [review-media.ts](review-media.ts) |
| E008-021 | visual-QA | resolved | round-01误截Lovable文章Introduction。 重新以“2. A Focus on Distribution”为锚点抓取上下两块可读裁切，旧资产保留作对照。 | [lovable-gtm-source.png](../../public/episodes/episode-008/assets/lovable-gtm-source.png) |
| E008-022 | visual-QA | resolved | round-01的ARR来源只有窄标题条。 重新抓取官方Agent公告的发布日期、$100M ARR标题和主图。 | [lovable-arr-source.png](../../public/episodes/episode-008/assets/lovable-arr-source.png) |
| E008-023 | renderer | resolved | round-01静态图层白色contain画布造成白卡和不可读小字，且残留GAMMA标注。 改为深色画布、保持比例、显示当前script标题/指标并移除错误品牌。 | [remotion.tsx](../../../src/media/remotion.tsx) |
| E008-024 | media-QA | resolved | round-01钩子约local 17.2–17.8秒出现白闪。 从同一准入原片12.0–15.6秒制作`prepared-hook-stable`，独立媒体复核PASS并被新版manifest选中。 | [stable verification](../media/verifications/seg-001/episode-008-media-clip-ed12a51af5a56e620f4980af.broll-v2.codex-result.json) |
| E008-025 | render | blocked | 新版Remotion渲染在Chromium启动时报macOS MachPortRendezvous权限错误；升级执行又被自动审查以Codex使用上限拒绝。 需要用户在知悉该阻塞后明确允许一次受控浏览器启动。 | [render-round-02-blocked.log](logs/render-round-02-blocked.log) |
| E008-026 | validation | resolved | pnpm入口再次触发tsx IPC listen EPERM。 改用Node24的`node --import tsx`直接入口，81项affected tests、TypeScript与Episode-008 fast校验通过。 | [run-report.md](run-report.md) |
