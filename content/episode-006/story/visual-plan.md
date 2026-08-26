<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v3",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "36d29b97533d08992fb81e777564aaeeb896bf4348acd7b066f0a0b8940b3370",
  "plannedSegments": 8,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Rikyū Visual Plan — episode-006

## Visual system

1080×1920 的 MediaMixVertical 使用暖白、深橄榄与荧光黄绿，呼应已检查的 Rikyū 官网。横向截图进入竖屏时只做有明确焦点的 9:16 裁切与纵向移动，不把整页缩小塞入画面；来源条位于上方安全区，字幕位于下方安全区，二者都不遮输入框、构造线或数字。真实页面只证明页面上看得见的内容；程序化动作持续标“功能演示”“连接示意”或“来源数据卡”，不冒充真实 UI、真实用户或模型内部构造。

## Asset summary

- 已实际检查 `public/episodes/episode-006/captured/rikyu-home.png`：1440×900 PNG，SHA-256 `92b19f37cb9f16f2c330ebbf263d36b4ecdfbc5a5577a19f3c108ddbbc48f919`。画面可读内容包括 Rikyū 字标、`MCP` / `Pricing` 导航、两处 `Start for free`、`Create. Don’t design.`、`No design skills. No second-guessing.`，以及下方部分可见的 “Branding a walking app” 项目输入与设计卡。
- 有效裁切分三组：中央约 506×900 的主张与 CTA；左侧约 506×900 的字标、项目需求与结果卡；顶部导航横移到 `MCP`、`Pricing` 与右侧 CTA。截图未显示完整价格表，也不是录屏，不能单独证明生成、付费权限或 MCP 操作。
- 对 `public/episodes/episode-006/` 与 `content/episode-006/` 的有界媒体扫描未发现其他本地图片、短片或关键帧。原始 X 功能短片、原帖和用户分享图不作为本方案的必需资产：功能动作使用带标记的程序化演示，传播与用户反应使用带 ITmedia 来源身份的重排数据卡，不伪装成原帖截图。
- 上述回退足以执行所有段落且不越过 Claim 边界，因此没有关键素材缺口，`unresolvedAssets` 保持为空；若后续要改用真实 X/用户媒体，须在 media 阶段另做权利、来源和 9:16 可读性审核。

## Audience feedback handling

- `feedback-001`：视觉不能改动已批准旁白，但第 0 帧以常驻角标“AI 功能演示”补清动作主体；首屏只保留 `ITmedia 2026-08-13 / 帖子展示 5,000,000+`，不再显示 10,000+ 单日使用。
- `feedback-002`：seg-003 先读官网主张，再把 `7` 作为唯一主视觉；旁白说到“一万人”时只出现必要的窄来源条，不做第三张大数字卡，完整的 10,000+ 证据留到 seg-005 揭示。后续只按 08.10 → 08.12 → 08.13 排列，常驻“公开事件顺序，不代表因果”。
- `feedback-003`：视觉不能改写 seg-005 的被动句；镜头先亮出“开发者公开披露”身份条，再展开日期与数字，让观众在听到“被公开”之前已经知道披露者。
- `feedback-004`：价格与 MCP 不并列解释；2,000 积分、5 美元和权限卡先完成并退出，再复用 seg-002 的“给咖啡店做一个 Logo”，让同一需求从 Claude/Codex 发出并抵达 Rikyū。

## seg-001

- Narrative purpose: 用正在发生的 AI 几何 Logo 演示与一个清晰的帖子展示刻度制造第一屏停留。
- Viewer state in: 不认识 Rikyū，也不知道这是一种可见的设计过程。
- Viewer state out: 看懂这是 AI 功能演示中的 Logo 绘制过程，并准确把 5,000,000+ 理解为帖子展示次数。
- New information: 几何 Logo 过程、5,000,000+ 帖子展示；10,000+ 单日使用只保留合同 Claim 绑定，不在首屏重复呈现。
- Scene structure: 第 0 帧网格与圆已经运动，左上常驻“AI 功能演示”；1 秒后 Logo 才成形；右上只落下一张 `帖子展示 5,000,000+` 证据卡。
- Visual evidence: 程序化过程持续标“AI 功能演示”；`ITmedia 2026-08-13 / 帖子展示 5,000,000+` 同期出现。claim-rikyu-009 的 10,000+ 不在本段显示，避免把使用人数与展示次数挤成同一首屏漏斗。
- Animation ideas: 网格从中心展开，圆和直线按 0.35 秒间隔出现；深橄榄证据卡只高亮“帖子展示”，不出现第二种规模数字。
- Asset requirements: Claim 支持的程序化几何动作，无外部素材缺口。
- Pacing: 0–1.4 秒只读动作与“AI 功能演示”角标，1.4–3.0 秒稳定读 ITmedia 日期与帖子展示；首帧无静态停留。
- Visible action: 网格铺开 → 圆锁定 → 直线切分 → Logo 轮廓成形。
- Evidence type: programmatic-action
- Focal crop: 中央 Logo 构造区占画面上部约 60%；左上动作身份、右上单张展示证据卡，字幕保持在下方安全区。
- Visual event: 0.0 秒网格运动且“AI 功能演示”出现；0.35 秒圆出现；0.75 秒直线出现；1.15 秒成品；1.55 秒展示卡落下并保持到段尾。
- Media preference: 无可稳定取得的原始功能短片，使用有 Claim 支持且明确标注的程序化动作。
- Render target: hook-logo-result
- Claim IDs: claim-rikyu-006, claim-rikyu-007, claim-rikyu-009

## seg-002

- Narrative purpose: 在前 10 秒建立“说需求 → 得到设计”的产品心智模型。
- Viewer state in: 只知道一个 Logo 过程被传播。
- Viewer state out: 知道 Rikyū 是个人开发的 AI 设计服务及其第一步操作。
- New information: 自然语言需求可生成 Logo、网页、社交和印刷设计。
- Scene structure: 中央 9:16 裁切先放大官网主张与 CTA；纵向移到已截页面下方的项目输入和设计卡；随后进入标“功能演示”的输入界面，输入咖啡店 Logo，再切一次非 Logo 社交封面生成。
- Visual evidence: 官网截图角标“Rikyū 官网，2026-08-25”，只证明官网主张与页面确有需求/结果卡；合成输入到结果持续标“功能演示”。
- Animation ideas: 光标逐字输入，生成区从骨架状态变成 Logo；第二条需求加速生成社交封面。
- Asset requirements: 已检查的 `rikyu-home.png` 中央主张裁切、左侧项目输入/结果裁切；程序化输入与结果动作。
- Pacing: 官网裁切不超过 1.5 秒；两个输入到结果动作各 2～3 秒。
- Visible action: 输入“给咖啡店做一个 Logo” → Logo 成品出现；输入“做一张开业社交封面” → 封面出现。
- Evidence type: programmatic-action
- Focal crop: 先看中央 `Create. Don’t design.`、副标题与 CTA，再看左下真实项目需求卡；功能演示只保留输入框和结果画布。
- Visual event: 官网主张放大 → 输入光标出现 → Logo 生成 → 第二条需求出现 → 社交封面生成。
- Media preference: 已检查 official UI crop 优先承担产品身份与官网主张；截图不是操作证据，输入到结果回退为明确标注的程序化动作。
- Render target: product-prompt-design
- Claim IDs: claim-rikyu-001

## seg-003

- Narrative purpose: 用官网主张与首日 7 人形成冷启动反差，并打开后续事件问题。
- Viewer state in: 已看懂输入需求能得到设计。
- Viewer state out: 知道产品目标门槛低，但首日只有 7 人，并等待接下来发生什么。
- New information: 官网主张无需设计技能；上线首日 7 名用户。
- Scene structure: 延续上一段输入动作作背景；官网原文裁切出现后收起；数字 7 落下并成为唯一大号数字；问句说到“一万人”时，底部只滑入窄来源条 `1 天内 10,000+ 使用 / 创始人披露`，随后以“接下来公开发生的事”进入下段。
- Visual evidence: 官网 `No design skills. No second-guessing.` 原文裁切、首日 7 人的创始人回顾来源小字；旁白中的 10,000+ 用窄条同步承担 claim-rikyu-009 的强事实证据，不做大卡，不与 7 画箭头。
- Animation ideas: 输入动作保持低速循环，数字 7 从空白计数到 7 后停住。
- Asset requirements: 已捕获官网截图与程序化数据卡。
- Pacing: 官网主张不超过 2 秒；7 独占中央至少 2 秒；10,000+ 只在问句对应时出现约 1 秒窄条，完整数字揭示留给 seg-005。
- Visible action: 用户输入需求 → 成品出现；主张卡滑入 → 首日数字停在 7。
- Evidence type: data-graphic
- Focal crop: 先看官网主张，再只看数字 7；10,000+ 位于底部来源条且不抢占中央，不展示整页桌面。
- Visual event: 输入框回看 → 官网主张高亮 → 数字 7 落下 → 10,000+ 来源窄条出现 → “接下来公开发生的事”出现。
- Media preference: 官方 UI crop 加程序化数据卡；避免无语境库存人物。
- Render target: contrast-seven-users
- Claim IDs: claim-rikyu-002, claim-rikyu-005, claim-rikyu-009

## seg-004

- Narrative purpose: 展示冷启动转折区间里的第一个可见产品动作。
- Viewer state in: 正等待 7 人之后发生了什么。
- Viewer state out: 看见开发者在 8 月 10 日发布几何 Logo 功能。
- New information: 发布日期与圆、直线、网格构成的可见过程。
- Scene structure: 08.10 来源条落下；几何过程从不同于开场的放大辅助线细节开始；停在两个 Logo 变体，底部时间顺序标签等待 08.12。
- Visual evidence: 来源条写“X @kaiseisuzuk，2026-08-10；内容经 ITmedia 交叉核对”，不绘制仿 X 帖卡；全程标“功能演示”，不把构造线说成模型内部步骤。
- Animation ideas: 放大对齐点，辅助线吸附，两个变体左右分开。
- Asset requirements: Claim 支持的程序化功能演示。
- Pacing: 12 秒内每 2～3 秒出现新构造细节或变体。
- Visible action: 来源卡出现 → 辅助线对齐 → Logo 成形 → 第二个变体出现。
- Evidence type: programmatic-action
- Focal crop: 辅助线交点、圆与最终 Logo 变体。
- Visual event: 日期卡出现 → 圆锁定 → 交点放大 → 轮廓成形 → 变体切换。
- Media preference: 原始 X 视频未取得稳定本地权利与可读裁切，使用标注清楚的程序化动作。
- Render target: geometric-process
- Claim IDs: claim-rikyu-006

## seg-005

- Narrative purpose: 给出发布后一天超过一万人使用的创始人披露结果。
- Viewer state in: 已看见 08.10 的产品动作。
- Viewer state out: 知道 08.12 出现了 10,000+ 单日使用披露，但不把它当因果证明。
- New information: 08.12 披露与 10,000+ 使用口径。
- Scene structure: 08.10 画面收成左侧日期标签；先亮出“开发者公开披露”身份条，再让 08.12 披露卡逐行打开；`10,000+ 单日使用` 最后放大，口径条与数字同时停住。
- Visual evidence: 来源小字“开发者公开披露，经 ITmedia 2026-08-13 报道”；卡片明确写“功能发布后一天”，常驻“公开事件顺序，不代表因果”。
- Animation ideas: 披露者身份先出现，随后高亮日期与“功能发布后一天”，最后才点亮 `10,000+ 单日使用`。
- Asset requirements: 带 ITmedia 来源身份的程序化披露卡与数据卡，无真实用户群像。
- Pacing: 7 秒内先动作后数字，避免重复开场证据卡。
- Visible action: “开发者公开披露”身份条出现 → 08.12 日期被高亮 → 披露口径逐行展开 → 10,000+ 落下并停住。
- Evidence type: data-graphic
- Focal crop: 中央 `10,000+` 与其下方“单日使用 / 创始人披露”口径，不展示虚构用户界面。
- Visual event: 披露者身份出现 → 08.12 日期高亮 → 披露卡打开 → “功能发布后一天”高亮 → 10,000+ 数字落下。
- Media preference: 无可核实的真实一万用户群像或原始披露截图，回退为带 ITmedia 来源身份的数据卡。
- Render target: ten-thousand-disclosure
- Claim IDs: claim-rikyu-009

## seg-006

- Narrative purpose: 用独立媒体与用户分享行为给传播结果增加可读语境。
- Viewer state in: 已知道创始人披露的使用规模。
- Viewer state out: 知道 ITmedia 记录了帖子展示与用户分享，但不把个别评论泛化为满意度。
- New information: 5,000,000+ 展示、用户晒 Logo、评论过程有趣。
- Scene structure: ITmedia 来源卡进入；`5,000,000+ 帖子展示` 高亮；切到程序化分享动作卡，Logo 缩略图被放入分享框；最后出现媒体转述“有人评论过程有趣”。
- Visual evidence: 所有卡片标“ITmedia 观察与转述，2026-08-13”，转述不用引号，不伪装成报道截图、原始社媒截图或真实用户头像。
- Animation ideas: 报道来源卡纵向推入，展示数字放大；分享框展开后，转述文字放大到至少 52 px 并停留不少于 1.5 秒。
- Asset requirements: ITmedia 来源卡、程序化 Logo 分享动作和无引号的媒体转述卡，不需要未获权的原帖截图。
- Pacing: 8 秒内报道、数字、两条用户动作依次出现。
- Visible action: ITmedia 来源卡出现 → 5,000,000+ 被高亮 → Logo 缩略图进入分享框 → “过程有趣”媒体转述放大。
- Evidence type: news-quote
- Focal crop: 5,000,000+、用户生成 Logo 与可读评论，不展示整页网页。
- Visual event: 报道来源出现 → 展示数字高亮 → 分享框打开 → Logo 缩略图进入 → 媒体转述切入。
- Media preference: 无本地权利明确的原帖截图，使用带独立媒体来源的程序化引用卡。
- Render target: media-user-shares
- Claim IDs: claim-rikyu-007, claim-rikyu-008

## seg-007

- Narrative purpose: 先给当前价格锚点，再解释熟悉 Claude/Codex 的用户如何从原入口发起设计。
- Viewer state in: 已理解产品动作与传播结果。
- Viewer state out: 知道免费入口、5 美元商用门槛与 MCP 的具体用户动作。
- New information: 免费 2,000 积分、商用与 SVG 每月 5 美元起、MCP 外部入口。
- Scene structure: 已检查截图顶部裁切依次停在 `Pricing` 与 `Start for free`；来源数据卡单独完成 2,000 积分、5 美元、商用与 SVG 权限；价格卡退出后，Claude/Codex 对话里复用“给咖啡店做一个 Logo”，连线到 Rikyū 结果。
- Visual evidence: 官网截图标来源与访问日，但只证明导航与入口；价格细项以官网/条款来源数据卡呈现；MCP 部分持续标“连接示意”。
- Animation ideas: 2,000 与 5 美元分两拍点亮；价格停留 1 秒后 MCP 连线才出现。
- Asset requirements: 已检查官网截图的 `Pricing` / `Start for free` 顶部裁切、官网与条款来源数据卡、程序化 MCP 连接示意。
- Pacing: 10 秒内价格占前 6 秒，MCP 动作占后 4 秒。
- Visible action: Start for free 按钮高亮 → 价格权限展开 → Claude/Codex 输入需求 → Rikyū 结果出现。
- Evidence type: official-ui-crop
- Focal crop: 横移裁切只让 `Pricing`、`Start for free` 依次成为焦点；随后只保留价格数字，再只保留 Claude/Codex 输入与 Rikyū 结果。
- Visual event: 官网按钮 → 2,000 积分 → 5 美元 → MCP 需求 → 设计结果。
- Media preference: 官方 UI crop 承担入口证据；MCP 无公开操作录屏，使用明确标注的连接示意。
- Render target: pricing-mcp
- Claim IDs: claim-rikyu-003, claim-rikyu-010

## seg-008

- Narrative purpose: 回看同一个几何过程，收束在今天可以尝试的入口与价格。
- Viewer state in: 已知道完整事件顺序和当前入口。
- Viewer state out: 能复述“7 人起步、可见过程、一天万人、免费与 5 美元起”的故事。
- New information: 无新事实；把已出现的过程与价格组合成可复述结尾。
- Scene structure: `首日 7 人` 与 `一天 10,000+ 人` 两张已出现的口径卡依次回标；几何过程短循环从运动开始；成品 Logo 落下；官网 `Start for free` 与价格条依次出现并停住。
- Visual evidence: 7 人与 10,000+ 复用 seg-003/005 的来源身份并保持“公开事件顺序，不代表因果”；程序化过程标“功能演示”；价格条标“官网与条款，截至 2026-08-25”。
- Animation ideas: 网格、圆、直线快速重演，最后一秒静止在成品和价格。
- Asset requirements: 程序化几何动作与已捕获官网裁切。
- Pacing: 0–1.6 秒按口播回标 7 与 10,000+；1.6–4.6 秒重演几何动作；4.6–6.2 秒显示免费入口；6.2–8.0 秒停在 5 美元商用价格。
- Visible action: 7 人卡出现 → 10,000+ 卡替换 → 几何过程重演 → 成品出现 → Start for free 高亮 → 价格条停住。
- Evidence type: programmatic-action
- Focal crop: 单次只看中央口径卡、Logo 构造区或中央 CTA/价格条；不把数字、过程与入口同时挤在一屏。
- Visual event: 7 人卡出现 → 10,000+ 卡替换 → 网格展开 → 成品落下 → 免费入口高亮 → 价格条停帧。
- Media preference: 复用已验证的程序化动作和官方页面裁切，无新素材。
- Render target: closing-process-price
- Claim IDs: claim-rikyu-005, claim-rikyu-006, claim-rikyu-009, claim-rikyu-010
