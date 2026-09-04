# Episode-008 权限与验收边界

最新授权：用户已明确回复“允许受控渲染”。本次按既有 `scripts/render.ts vertical` 入口启动本地无头 Chromium，生成 Episode-008 的竖屏 MP4；无需再次请求同一动作权限。素材本地评估授权沿用现有记录，外部发布和最终人工验收仍未签署。

以下为之前阻塞时的历史请求，已经完成的独立评审、TTS与素材准入不再待批准。

截至2026-09-04，独立口播/观众/事实/留存评审与媒体验证已完成，当前render manifest已重新生成；round-01 MP4逐帧发现的问题已修复到素材与渲染层。最终新版MP4尚未生成：无头Chromium启动受macOS沙箱拦截，升级执行又被自动审查以Codex账户使用上限拒绝。`release`校验也按预期停在缺少当前Delivery Critic报告。以下请求仍然只记录范围与权限边界，不是HumanDecision；需要用户知悉并明确允许一次受控Remotion浏览器启动后，才能完成最终渲染、读回和Delivery Critic。

这是一份可审阅的请求，不是已经签署的 HumanDecision。当前没有代填 reviewer、approve 或通过结论。

1. 独立评审：允许使用未参与本期写稿的子代理，按 agents/README.md 完成 Oral Judge、Audience Critic、Fact Guardian、Retention Critic 和后续 Delivery Critic。评审失败就回到对应责任角色修订。
2. 素材来源入口：在 config/media-discovery.json 精确增加 `www.youtube.com` 与 `lovablebrand.lovable.app`，用于下述两项已定位的官方来源，不加入通配符。批准后仍保留媒体 admission、rights 与字节核验门，白名单不是使用权批准。
3. 素材用途：官方 2024 年产品演示拟取 42:19–42:56 的保存、刷新和数据库核对动作，预计成片使用其中约 15–25 秒，常驻来源标注；创始人照片拟出现约 3–5 秒，依据官方编辑报道许可。视频片段的权利依据需要单独确认；此请求不授权外部发布。

视频：https://www.youtube.com/watch?v=47sKfUOqARY&t=2539s 。官方嵌入出处：https://lovable.dev/blog/2025-01-13-rebranding-gpt-engineer-to-lovable 。照片许可：https://lovablebrand.lovable.app/brand/photos 。

后续先完成独立内容评审和素材审批，再进行真实 TTS、timeline、media render plan、smoke/vertical render、readback、Delivery Critic 与最终人工批准。现有 MiniMax 凭据仅确认存在，未发生合成调用。
