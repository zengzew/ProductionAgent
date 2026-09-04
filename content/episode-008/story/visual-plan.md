<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v3",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "59b6e8fe0b52f7a245b82fc26f64123dd58070405c6424fdb83eb9aa2c80e9c3",
  "plannedSegments": 6,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Lovable / 视觉方案

## Visual system

使用现有 MediaMixVertical。实际检查过三段1920×1080官方录像、官方联合创始人照片与推广/ARR页面裁切。来源已按用户继续制作本地评估MP4的指令完成正式准入；仅本地评估，外部发布权利未终审。官方原片先按可重复的时间/裁切配方生成竖屏输入素材，再走正式MediaAsset、clip验证与渲染；不是手修最终成片。不以网页或文字冒充动作。

视觉以深蓝底、明亮的真实绿黑UI为主，人物段切照片，分发切原文与渠道名，结果切公司公告。中部证据独占约y=350–1350，字幕保留底部安全区。真实UI只做裁切、等比放大和必要说明；不改数字、按钮或产品状态。所有程序化字层均为来源标注或翻译，不伪造界面。TTS读回后对齐镜头切点，登录与后续保存来自不同界面迭代，明确标记“2024 官方演示节选”。

## Asset summary

正式原片：lovable-save-2535（原视频42:15–42:57）、lovable-login-1794（29:54–30:18）、lovable-chat-1670（27:50–28:30）。对应1080p研究联系表和原片已目检；输入框提交、刷新与对应数据库记录可见。照片来自官方品牌页编辑报道许可，不能当作原型开发现场。lovable-gtm-source.png / lovable-partner-source.png 为官方复盘实际截图，lovable-arr-source.png 含2025-07-23与$100M ARR。素材来源及使用范围见production/local-evaluation-authorization.json；事实审查不代替发布许可。

## seg-001

- Narrative purpose: 先给可见的保存结果
- Viewer state in: 未听过产品
- Viewer state out: 看懂记录刷新后仍在
- New information: 同一条心情记录持久化
- Scene structure: 首帧已保存 → 刷新加载 → 同一条目重新出现
- Visual evidence: save原片local16–20秒；claim001/004
- Animation ideas: 裁切输入区和Historical Data Logs，不裁掉对照记录；首帧无淡入
- Asset requirements: 正式save视频裁切，保持源时间顺序
- Pacing: 约3秒；保留刷新白帧作为动作证据，不长时间黑屏
- Visible action: 已存在记录 → 刷新 → 同一条目出现
- Evidence type: product-operation
- Focal crop: 分数10与备注所在记录行，顶部保留应用名
- Visual event: 0秒记录；约1秒加载；约2秒同一记录恢复
- Media preference: 真实操作优先，无静态回退；若动作不成立退回脚本
- Render target: 保存后刷新
- Claim IDs: claim-lovable-001, claim-lovable-004

## seg-002

- Narrative purpose: 交代工具与待回答的问题
- Viewer state in: 看过心情记录结果
- Viewer state out: 知道聊天能开始做应用，想看它怎样真正可用
- New information: 真实输入Just add login并发送；功能在编辑器中迭代
- Scene structure: 输入区进入 → 文本发送进入气泡 → 处理反馈；切已有示例界面
- Visual evidence: chat原片local12–24秒，claim001/002/004
- Animation ideas: 竖屏分两焦点裁切输入框与反馈，不把已存在的网页说成这次输入刚生成
- Asset requirements: 真实chat片段与应用区域
- Pacing: 每2–4秒从输入到发送再反馈，避免等生成空白拖满段
- Visible action: 输入添加登录的请求 → 发送 → 出现反馈
- Evidence type: product-operation
- Focal crop: 左侧输入框与发送后的消息气泡，至少700px宽投影
- Visual event: 0秒输入区；2秒发送；4秒消息出现；7秒处理反馈；末端回示例界面
- Media preference: 真实聊天操作，不用官网首页代替；已有应用与新添功能明确区分
- Render target: 工具与用户需求
- Claim IDs: claim-lovable-001, claim-lovable-002, claim-lovable-004

## seg-003

- Narrative purpose: 把产品背后的需求落到人物选择
- Viewer state in: 已知道聊天做应用
- Viewer state out: 认识提出需求并做原型的创始人
- New information: 周末做早期原型，非完整产品
- Scene structure: 照片全景 → 创始人名字和需求短句 → GPT-Engineer早期原型文字注
- Visual evidence: 官方联合创始人照片；Indie Hackers2025-08-06访谈；claim002/003
- Animation ideas: 照片轻推拉，文字依旁白依次出现，不能生成假开发画面
- Asset requirements: 已许可官方照片与引述短注
- Pacing: 约7秒，2.5秒一层信息
- Visible action: 照片进入 → 需求摘意出现 → 周末原型名称出现；照片不证明开发动作
- Evidence type: interview
- Focal crop: 双人照片保持完整，不根据脸猜人物左右身份；文字注明Anton Osika口述
- Visual event: 0秒联合创始人照片出现；2.5秒需求短注出现；5秒早期原型名称高亮
- Media preference: 官方人物照加有来源口述；无开发现场视频，明确静态人物来源
- Render target: 创始人原型
- Claim IDs: claim-lovable-002, claim-lovable-003

## seg-004

- Narrative purpose: 兑现页面如何真正用起来
- Viewer state in: 知道创始人的原型尝试
- Viewer state out: 看懂登录、界面记录与数据库对应关系
- New information: 新证据是登录后使用与后台同记录
- Scene structure: 登录成功 → 明确节选转场 → 填写提交与新记录 → 切数据库分数/备注对应行
- Visual evidence: login local0–3秒；save local8–14与37–40.8秒；claim004
- Animation ideas: 按真实TTS语义切点生成节选组合；显示01登录、02保存、03数据三个阶段
- Asset requirements: 正式原片；可重复节选配方；只截数据库score/note，排除用户ID
- Pacing: 2–4秒切一次功能不同的证据；不同界面迭代加明显转场
- Visible action: 登录进入应用 → 输入并保存 → 数据库出现对应记录
- Evidence type: product-operation
- Focal crop: 登录按钮、记录行、score10及对应note；裁去账号标识和无关数据库字段
- Visual event: 0秒登录页打开；约2秒切到保存输入；约5秒新记录出现；约7秒切到数据库对应字段
- Media preference: 真实操作，明确官方演示节选，不能伪装成一次连续无改版操作
- Render target: 从页面到可用数据
- Claim IDs: claim-lovable-004

## seg-005

- Narrative purpose: 解释团队如何让潜在用户看到能力
- Viewer state in: 知道产品能用
- Viewer state out: 记住具体发布、社区与合作渠道
- New information: Product Hunt、X与Supabase是并列传播渠道
- Scene structure: Product Hunt视频材料原文裁切 → X社区描述 → Supabase联合推广原文
- Visual evidence: lovable-gtm-source.png、lovable-partner-source.png；团队复盘2025-01-22；claim005
- Animation ideas: 原文短证据以约2秒进入并配中文摘意，渠道名逐个高亮；不虚构转化数据
- Asset requirements: 已抓取官方复盘截图；制作带来源标签的三个焦点镜头
- Pacing: 约14秒内3种触达动作，字幕不遮住英文渠道名
- Visible action: 发布视频材料出现 → 社区讨论原文出现 → 合作推广原文出现
- Evidence type: news-quote
- Focal crop: Product Hunt、X、Supabase与对应动词；中文概括置于其下
- Visual event: 0秒发布演示原文出现；3秒渠道名高亮；6秒切到X社区原文；9秒合作推广高亮；12秒三项并列收束
- Media preference: 具体团队复盘优先；无授权平台实录，使用可追溯原文而非虚构发布动画
- Render target: 让潜在用户看见
- Claim IDs: claim-lovable-005

## seg-006

- Narrative purpose: 给有日期有口径的经营结果
- Viewer state in: 已理解产品和触达用户的动作
- Viewer state out: 记住2025年7月公司宣布1亿美元ARR
- New information: 历史年化经常性收入，不是利润
- Scene structure: 日期与官方标题同屏 → $100M ARR放大 → 中文指标定义
- Visual evidence: lovable-arr-source.png；官方2025-07-23公告；claim007
- Animation ideas: 数字本身不计数冲高；仅变焦与指标说明，保留公司口径
- Asset requirements: 实际官方公告截图与中文定义
- Pacing: 末段约11秒，最多3–4秒一次日期/数字/定义的阅读焦点变化
- Visible action: 公告出现 → 日期高亮 → 指标中文定义出现
- Evidence type: data-graphic
- Focal crop: July23,2025与$100M ARR，持续显示公司口径
- Visual event: 0秒官方日期标题出现；3秒一亿美元高亮；6秒指标定义出现；9秒公司口径高亮
- Media preference: 真实公司公告，不把2025历史数字当当前规模
- Render target: 历史商业结果
- Claim IDs: claim-lovable-007

## Audience feedback

feedback-lovable-audience-003 已在seg-005落实：Product Hunt、X、Supabase以真实复盘短证据和具体渠道名出现，保持并列，不作ARR增长归因。
