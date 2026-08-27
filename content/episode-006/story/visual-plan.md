<!-- visual-plan-gate
{"rubricVersion":"visual-plan-v3","reviewedFile":"story/final-script.md","reviewedSha256":"b76cb12409994f28cf7e8f7d39bf0608313feef67519980d16ed4d1d0aa7d74b","plannedSegments":7,"unresolvedAssets":[],"verdict":"READY","returnTo":"none"}
-->

# Visual Plan — episode-006（Rikyū）

## Visual system

这版不再用黑底几何动画替代产品。七段全部以 Rikyū 官网或开发者原帖的真实成品为画面主体，竖屏采用“满版模糊底图 + 中央可读原图卡 + 克制推拉 + 来源标签”的剪辑语言；数据只做叠层，不遮住 Logo、构成网格或品牌物料。第一帧常驻 `Rikyū`，解决 Audience Critic 的 `feedback-001`。MCP 不画协议图，改成普通话动作标签“在常用 AI 里发起设计”，解决 `feedback-002`。字幕区保持在底部 228 px 以上，来源标签放在上方安全区。

## Asset summary

- 已实际检查开发者官方 X 帖四张原图：大猩猩/狮子构成网格与各自成品 Logo。
- 已实际检查官网 Waypause、Elias、Lowbell 的视觉识别、海报、社交图和落地页成品。
- `production/asset-manifest.json` 将七张具体原图逐段准入；每张图都有来源 URL、Claim、segmentId 和本地使用边界。
- 所有准入原图进入 hash-bound render plan；任一文件缺失、替换、未批准或未实际进入指定镜头时，Delivery Gate 必须拒绝。

## seg-001

- Narrative purpose: 第一帧先证明“真实构成图与成品同框”，而不是让观众等程序化动画生成。
- Viewer state in: 零背景，不知道 Rikyū。
- Viewer state out: 看见 Rikyū 公开展示的几何构成图和成品 Logo，并知道这是同一产品。
- New information: 开发者原帖中真实的大猩猩网格图包含圆、直线、节点与成品标志。
- Scene structure: 第 0 帧直接显示完整原图和 `Rikyū` 标签；0.5 秒放大构成网格；1.8 秒把焦点移到右下成品 Logo，段尾硬切。
- Visual evidence: `official-x-gorilla-grid.webp`；来源 `X @kaiseisuzuk`；同期支持 claim-rikyu-006。
- Animation ideas: 只做 1.00→1.08 的慢推和焦点框移动，不重画官方图。
- Asset requirements: 已准入开发者官方 X 原图，无缺口。
- Pacing: 3 秒内两次可见焦点变化；首帧无空白、无等待。
- Visible action: 完整原图出现 → 网格被放大 → 成品 Logo 被框选。
- Evidence type: official-ui-crop
- Focal crop: 先读大猩猩构成网格，再读右下成品 Logo；保留足够边缘证明二者同图。
- Visual event: 0.0 秒产品名与原图出现；0.5 秒高亮并推进网格；1.8 秒切到成品焦点。
- Media preference: 开发者官方原图优先于程序化复刻；不需要回退。
- Render target: 几何网格与成品 Logo 同框
- Claim IDs: claim-rikyu-006

## seg-002

- Narrative purpose: 把产品从“一张 Logo”扩展为一套真实品牌结果。
- Viewer state in: 只见过一个几何 Logo 例子。
- Viewer state out: 知道描述需求后，Rikyū 会输出可继续使用的品牌资产。
- New information: Waypause 官方案例在同一视觉识别板中展示标志、字形、色彩与应用关系。
- Scene structure: 先满版显示 Waypause 视觉识别板；2 秒框选 Logo；4 秒横向扫到色彩与排版；6 秒出现“Logo → 网页 / 社交 / 印刷”动作条。
- Visual evidence: `official-waypause-visual-identity.webp`；来源 `rikyu.ai`；支持 claim-rikyu-001、002。
- Animation ideas: 轻微横移与逐项高亮，避免把静帧当壁纸。
- Asset requirements: 已准入官网真实案例图，无缺口。
- Pacing: 8 秒内每 2 秒更换一次焦点，不连续重复开场裁切。
- Visible action: Logo 被框选 → 色彩/排版被框选 → 输出类型依次点亮。
- Evidence type: official-ui-crop
- Focal crop: 中央身份板，保证标志与色彩可读，字幕不压住下部应用区。
- Visual event: 0 秒案例名出现；2 秒高亮 Logo；4 秒切到色彩；6 秒输出类型依次出现。
- Media preference: 官网真实产品结果优先；不用品牌首页或合成 mockup。
- Render target: 产品定义与整套品牌资产
- Claim IDs: claim-rikyu-001, claim-rikyu-002

## seg-003

- Narrative purpose: 把“输入需求”和“从常用 AI 发起”翻译成普通用户动作。
- Viewer state in: 知道能生成一套设计，不知道入口。
- Viewer state out: 理解可以直接描述需求，也可以从 Claude/Codex 发起。
- New information: 外部 AI 是另一个发起入口，不需要解释 MCP 协议。
- Scene structure: Waypause 真实落地页作为结果底图；1 秒出现输入条“给咖啡品牌做一套视觉”；3 秒出现结果勾选；4.5 秒 Claude/Codex 名称进入；6 秒动作标签“在常用 AI 里发起设计”。
- Visual evidence: `official-waypause-landing-page.webp` 证明真实结果；外部入口文字由 claim-rikyu-003 支持并标“功能示意”。
- Animation ideas: 输入条从左滑入，结果勾选后再出现外部入口，避免协议连线图。
- Asset requirements: 已准入官网真实落地页；入口动作使用 Claim 支持的文字叠层。
- Pacing: 7 秒分成输入、结果、外部入口三拍。
- Visible action: 需求被输入 → 真实落地页结果被勾选 → Claude/Codex 入口被点亮。
- Evidence type: programmatic-action
- Focal crop: 中央真实落地页与上方输入条；不显示整页桌面浏览器。
- Visual event: 0 秒结果页；1 秒输入；3 秒勾选；4.5 秒入口；6 秒普通话动作标签。
- Media preference: 无公开操作录屏，使用真实结果图 + 明确标注的功能示意；不冒充实录。
- Render target: 两个使用入口
- Claim IDs: claim-rikyu-003

## seg-004

- Narrative purpose: 从首日七人切到开发者真正公开做的分发动作。
- Viewer state in: 正在等“它怎么被看见”。
- Viewer state out: 知道开发者随后在 X 发布了另一张真实几何 Logo 演示。
- New information: 首日七人是创始人回顾；狮子构成图是可见的发布动作。
- Scene structure: 0 秒小号 `首日 7 人` 来源卡覆盖在狮子网格原图边缘；2 秒卡片收起，完整原图露出；4 秒框选圆、直线与狮子成品；6 秒出现 `发布到 X`。
- Visual evidence: `official-x-lion-grid.webp` + 创始人口径数据层；支持 claim-rikyu-005、006。
- Animation ideas: 数据卡缩小让位给真实原图，视觉上从“起点”转为“动作”。
- Asset requirements: 已准入开发者官方原图；七人数据为 Claim 支持叠层。
- Pacing: 8 秒四拍，每拍只读一件事。
- Visible action: 七人卡出现 → 卡片收起 → 网格细节被框选 → 发布动作标签出现。
- Evidence type: still-page
- Focal crop: 狮子构成网格与右下成品标志，不复用 seg-001 的大猩猩焦点。
- Visual event: 0 秒七人卡出现；2 秒切到原图；4 秒高亮构成细节；6 秒发布标签出现。
- Media preference: 开发者官方发布素材优先于仿 X 帖卡；无需回退。
- Render target: 低起点与公开演示动作
- Claim IDs: claim-rikyu-005, claim-rikyu-006

## seg-005

- Narrative purpose: 给出公开演示后的单日使用规模，同时维持真实产品结果在场。
- Viewer state in: 已看见公开发布动作。
- Viewer state out: 知道开发者披露的口径是一天超过一万人使用，不是展示量。
- New information: `10,000+ / 发布后一天 / 开发者披露`。
- Scene structure: 大猩猩成品 Logo 满版出现；1.5 秒 `发布后一天`；3 秒 `10,000+ 使用` 放大；5 秒来源口径停住。
- Visual evidence: `official-x-gorilla-final.webp` + ITmedia 转述的数据层；支持 claim-rikyu-009。
- Animation ideas: 成品 Logo 缓慢后退，让数字有空间但不被数字完全覆盖。
- Asset requirements: 已准入开发者官方成品图；数据层由 Claim 支持。
- Pacing: 7 秒只解释一个规模数字。
- Visible action: 成品出现 → 时间口径出现 → 10,000+ 放大 → 来源标签锁定。
- Evidence type: data-graphic
- Focal crop: 上半部成品 Logo，下半部单一数字与口径；字幕在最底安全区。
- Visual event: 0 秒成品出现；1.5 秒口径出现；3 秒数字放大；5 秒来源高亮。
- Media preference: 官方成品 + 程序化数据层优先于抽象数字卡。
- Render target: 规模数字
- Claim IDs: claim-rikyu-009

## seg-006

- Narrative purpose: 区分帖子展示规模与使用人数，并回到可分享的真实成品。
- Viewer state in: 已知道一万使用。
- Viewer state out: 知道 ITmedia 记录的是五百万展示和用户分享行为，不是收入或留存。
- New information: `5,000,000+ 展示` 与“有人分享生成 Logo”。
- Scene structure: 狮子成品 Logo 先出现；2 秒 `ITmedia` 来源条；3 秒 `5,000,000+ 展示`；5 秒分享图标把成品缩成一张分享卡。
- Visual evidence: `official-x-lion-final.webp` + ITmedia 来源数据层；支持 claim-rikyu-007、008。
- Animation ideas: 用分享卡收缩动作说明“被分享”，不绘制虚构用户头像或评论。
- Asset requirements: 已准入开发者官方成品图；不需要未获权的用户头像或帖子截图。
- Pacing: 7 秒三拍，数字只出现一次。
- Visible action: 成品出现 → ITmedia 来源进入 → 展示数字出现 → 成品缩成分享卡。
- Evidence type: news-quote
- Focal crop: 狮子成品与单一展示数字；来源条保持可读。
- Visual event: 0 秒成品出现；2 秒来源条进入；3 秒数字出现；5 秒切到分享动作。
- Media preference: 官方成品与独立媒体口径优先；不伪造原始用户帖。
- Render target: 传播与用户反馈
- Claim IDs: claim-rikyu-007, claim-rikyu-008

## seg-007

- Narrative purpose: 用真实海报结果收束到今天可执行的免费入口与商用价格。
- Viewer state in: 已理解产品、发布动作与规模。
- Viewer state out: 记住可以免费开始，商用/SVG 从每月五美元起。
- New information: `2,000 免费积分`、`$5/月起`、`SVG + 商用`。
- Scene structure: Waypause 霓虹城市海报满版进入；2 秒出现 Free 卡；5 秒 Basic 卡替换；8 秒结果海报与两档价格并列停帧。
- Visual evidence: `official-waypause-city-poster.webp` 是官网真实产品结果；价格文字由 claim-rikyu-010 支持并标 `rikyu.ai`。
- Animation ideas: 价格卡从海报边缘滑入，不遮住品牌主视觉；结尾 1.5 秒稳定停留。
- Asset requirements: 已准入官网真实海报；价格为来源绑定文字层。
- Pacing: 10 秒，最后 2 秒不再增加新信息。
- Visible action: 海报结果出现 → Free 卡出现 → Basic 卡替换 → 两档与结果并列停住。
- Evidence type: official-ui-crop
- Focal crop: 海报中央人物与霓虹 Logo，价格卡置于上半部留白，不压字幕。
- Visual event: 0 秒海报出现；2 秒免费卡进入；5 秒切到五美元卡；8 秒最终并列高亮。
- Media preference: 官网真实成品 + 来源绑定价格层；不以未捕获的价格页冒充真实页面。
- Render target: 当前入口与定价
- Claim IDs: claim-rikyu-006, claim-rikyu-010
