<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "493e0866a5759009876654a93c53e676442d8a2b1fd8765317ea74eb5bc561cd",
  "plannedSegments": 12,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Roost Social Visual Plan

## Visual system

1080×1920 竖屏围绕一条连续飞行路线组织画面。地图、鸟、倒计时和鸟舍使用程序化
图形；App Store 与官网使用已登记真实截图并保留来源标签。字幕位于下方安全区，
路线和关键 UI 始终避开字幕。

## Asset summary

使用已登记的 Roost App Store 与官网截图。发送、地图、鸟舍、商店和权限面板采用
Claim 支持的程序化图形；合成操作持续标“功能演示”。

## seg-001

- Narrative purpose: 用完成后的慢速送达结果建立反常识 Hook。
- Viewer state in: 不认识 Roost，也不知道消息规则。
- Viewer state out: 看懂消息已经发出，但三天后才到。
- New information: 距离和鸟速会改变送达时间。
- Scene structure: 已发送气泡、离开起点的鸟和三天倒计时在第一帧同时出现。
- Visual evidence: 全程标“功能演示”，送达规则 Claim 与动作同期。
- Animation ideas: 鸟从画面内已有位置缓慢前移，倒计时只变化一次。
- Asset requirements: 程序化消息、地图和鸟图形。
- Pacing: 三秒只让观众读懂已发生的慢速送达结果。
- Render target: hook-send-bird
- Claim IDs: claim-roost-003

## seg-002

- Narrative purpose: 用真实页面纠正“网络故障”的自然误解。
- Viewer state in: 看到消息很慢，但不知道是否故障。
- Viewer state out: 知道慢速送达是明确产品规则。
- New information: 距离、鸟速、路线和剩余时间共同决定体验。
- Scene structure: 从功能演示硬切 App Store 真实截图，旁边展开距离、鸟速、路线和剩余时间。
- Visual evidence: App Store 页面和来源标签完整可读。
- Animation ideas: 四项规则沿真实截图空白区依次出现。
- Asset requirements: 已登记 Roost App Store 截图。
- Pacing: 七秒完成唯一认知修正，不增加第二个争议。
- Render target: hook-rule-growth
- Claim IDs: claim-roost-003, claim-roost-004

## seg-003

- Narrative purpose: 建立产品心智模型和唯一故事问题。
- Viewer state in: 已理解规则，尚不知道等待的价值。
- Viewer state out: 等待“慢为什么让人期待”的答案。
- New information: 官网地图、阶段性增长与全片问题。
- Scene structure: 官网真实地图建立心智模型，创始人口径数字从一万升到十万后停在问题。
- Visual evidence: 官网来源与增长数字来源身份分开标注。
- Animation ideas: 飞行路线保持慢速，数字只在后半段加速。
- Asset requirements: 已登记 Roost 官网截图和程序化数字卡。
- Pacing: 十秒先定义产品，再留下“慢为什么让人期待”。
- Render target: hook-core-question
- Claim IDs: claim-roost-003, claim-roost-004, claim-roost-009

## seg-004

- Narrative purpose: 让观众感到即时通知压力与主动等待的差异。
- Viewer state in: 知道产品故意放慢消息。
- Viewer state out: 理解等待给回复留出空间。
- New information: 创始人目标与单一体验者动作。
- Scene structure: 通知快切停止，只保留起飞后的路线、倒计时和一张体验者动作卡。
- Visual evidence: 创始人目标与单一体验者身份分别标注。
- Animation ideas: 通知气泡退出后，路线稳定移动并留两秒安静。
- Asset requirements: 程序化通知、路线与来源卡。
- Pacing: 从 Hook 高密度转成长镜头，让观众感到等待。
- Render target: instant-pressure
- Claim IDs: claim-roost-003, claim-roost-007, claim-roost-008

## seg-005

- Narrative purpose: 交代产品从概念到公开的具体推动者。
- Viewer state in: 理解产品体验，不知道为何公开。
- Viewer state out: 知道朋友反馈推动创始人上架。
- New information: 概念视频、朋友反馈和发布日期。
- Scene structure: 概念视频卡交到朋友手中，上架按钮在反馈出现后亮起，最后落到发布日期。
- Visual evidence: 创始人口述身份和正式发布日期同期。
- Animation ideas: 卡片传递采用轻微错位，不重建未披露开发场景。
- Asset requirements: 程序化概念卡、反馈卡和日期卡。
- Pacing: 十八秒完成起点、朋友推动与公开三个动作。
- Render target: origin-friends-publish
- Claim IDs: claim-roost-002, claim-roost-005, claim-roost-006

## seg-006

- Narrative purpose: 把慢速送达机制变成一段可见的连续动作。
- Viewer state in: 知道消息会慢，尚未理解速度差异。
- Viewer state out: 看懂鸟速、距离、路线与倒计时的关系。
- New information: 不同信使速度与地图状态。
- Scene structure: 不同速度的鸟沿同一地图出发，距离和剩余时间同步变化。
- Visual evidence: 官方规则来源标签持续显示，不画未披露算法。
- Animation ideas: 鸟使用不同但稳定的速度，路线长度决定倒计时。
- Asset requirements: 程序化地图、四类信使和鸟舍卡。
- Pacing: 十八秒连续解释机制，每次只高亮一个变量。
- Render target: distance-speed-map
- Claim IDs: claim-roost-003, claim-roost-004

## seg-007

- Narrative purpose: 展示等待期间用户能看见和做什么。
- Viewer state in: 已理解送达机制。
- Viewer state out: 知道等待包含地图、鸟舍和小游戏动作。
- New information: 鸟舍、小游戏与体验者的离开手机动作。
- Scene structure: 飞行中的鸟缩成地图点，手机退出画面，鸟舍和小游戏入口随后出现。
- Visual evidence: 产品功能与单一体验者引语身份分开标注。
- Animation ideas: 鸟持续移动但画面留白增加，鸟舍只做一次解锁反馈。
- Asset requirements: 程序化地图、鸟舍和小游戏入口。
- Pacing: 中间留短暂静音，避免把等待讲成连续功能清单。
- Render target: waiting-becomes-play
- Claim IDs: claim-roost-004, claim-roost-008

## seg-008

- Narrative purpose: 用可复述的用户玩法推动传播与规模线。
- Viewer state in: 理解等待如何被产品化。
- Viewer state out: 看见用户把等待变成古英语通信并公开分享。
- New information: Threads 故事与三日增长时序。
- Scene structure: 地图切成古英语纸张消息卡，再出现 Threads 帖子轮廓和三日增长数字。
- Visual evidence: TechCrunch 报道与创始人口径增长分开显示。
- Animation ideas: 纸张消息逐字出现，帖子出现后数字才增长。
- Asset requirements: 程序化消息卡、帖子轮廓和数字图形。
- Pacing: 从慢镜头切回高信息密度，保持时序而不暗示唯一因果。
- Render target: threads-elizabethan
- Claim IDs: claim-roost-009

## seg-009

- Narrative purpose: 给出分口径的阶段性使用证据。
- Viewer state in: 已看到一个传播故事。
- Viewer state out: 知道注册、活跃对话和获客支出是不同指标。
- New information: 三项独立数据口径。
- Scene structure: 用户、活跃对话和付费获客三张数据卡逐张落下，互不换算。
- Visual evidence: 三项始终标“创始人口径”和各自日期。
- Animation ideas: 数字使用独立计数器，不用合并增长曲线。
- Asset requirements: 程序化数据卡。
- Pacing: 十八秒形成数据高潮，最后一拍切走避免停成报告页。
- Render target: growth-evidence
- Claim IDs: claim-roost-010, claim-roost-011, claim-roost-012

## seg-010

- Narrative purpose: 展示用户支持产品的具体方式。
- Viewer state in: 已知道阶段性规模。
- Viewer state out: 看见鸟类商品与支持者档位。
- New information: 商店与支持方式，不推算收入。
- Scene structure: 彩色鸟类商品卡轮换，支持者档位和创始人口径份数随后出现。
- Visual evidence: 商店事实与创始人披露分开标注，不显示推算收入。
- Animation ideas: 卡片横向缓慢轮换，支持者卡只做一次放大。
- Asset requirements: 程序化鸟类商品卡和支持者卡。
- Pacing: 从数据图切到具体可购买对象，信息密度下降。
- Render target: bird-store
- Claim IDs: claim-roost-013, claim-roost-014

## seg-011

- Narrative purpose: 解释慢速社交怎样处理位置与陌生关系。
- Viewer state in: 理解产品价值与支持方式。
- Viewer state out: 知道城市级位置、好友选择与双方接受规则。
- New information: 位置权限和 Pen Pals 开启条件。
- Scene structure: 精确坐标缩成城市范围，用户选择 close friends，Pen Pals 双方接受后打开。
- Visual evidence: 当前官方位置与 Pen Pals 规则同期显示来源。
- Animation ideas: 权限由精确到模糊逐级变化，对话只在双方确认后展开。
- Asset requirements: 程序化位置与权限面板。
- Pacing: 十七秒按位置、好友、笔友三步解释，不加入历史状态。
- Render target: privacy-safety
- Claim IDs: claim-roost-015, claim-roost-022

## seg-012

- Narrative purpose: 用阶段性结果回答开场，并回到同一只鸟。
- Viewer state in: 已理解规则、体验、传播与权限。
- Viewer state out: 能复述 Roost 如何把等待变成可见交流体验。
- New information: 无新机制，只回收规模与开场路线。
- Scene structure: 三十万注册用户与十万多个活跃对话分开出现，随后收拢成开场飞行路线。
- Visual evidence: ANSA 与创始人口径分别标注，结论只写阶段性市场信号。
- Animation ideas: 数据卡缩入地图两侧，鸟沿原路线继续飞向朋友。
- Asset requirements: 复用官网、程序化数据卡和开场路线。
- Pacing: 前半回答产品价值，最后四秒只保留飞行动作完成回看。
- Render target: artist-community-ending
- Claim IDs: claim-roost-003, claim-roost-004, claim-roost-007, claim-roost-010, claim-roost-020
