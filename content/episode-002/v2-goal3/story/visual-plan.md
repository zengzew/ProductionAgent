<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "c986e3c8f4fdc7d0bdf5436f0b62563e34622697960670c08a27daf138709648",
  "plannedSegments": 12,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Roost v2 Visual Plan

## Visual system

1080×1920 竖屏继续使用现有 Roost 飞行路线、鸟、地图、App Store 与官网素材。v2 把
同一只鸟作为连续视觉主角，数据只在用户动作之后出现。真实页面保留来源标签，合成界面
持续标功能演示，伊丽莎白时代英语卡不展示真实未成年人身份。

## Asset summary

复用已登记的 Roost 官网与 App Store 截图及代码图形，不新增外部素材。鸟类商店和位置
镜头被压缩为与等待体验直接相关的支持与边界，不承担新支线。

## seg-001

- Narrative purpose: 用已出发却三天后才到的结果建立反常识 Hook。
- Viewer state in: 不认识 Roost，也不知道消息规则。
- Viewer state out: 看懂消息已发送、鸟已离开起点、预计三天到达。
- New information: 距离和鸟速会让消息延迟。
- Scene structure: 已发送气泡、飞行中的鸟和倒计时从第 0 帧同屏。
- Visual evidence: 持续标功能演示与 Roost 官方送达规则。
- Animation ideas: 鸟从已有位置缓慢前移，倒计时只变化一次。
- Asset requirements: 现有程序化消息与 FlightMap。
- Pacing: 三秒只读一个结果。
- Render target: hook-send-bird
- Claim IDs: claim-roost-003

## seg-002

- Narrative purpose: 纠正网络故障误解并完成产品定义。
- Viewer state in: 已看到慢速结果，尚不知道是规则。
- Viewer state out: 理解虚拟鸟按距离和鸟速送信，地图显示位置。
- New information: 送达规则、鸟速、距离与飞行路线。
- Scene structure: 硬切 App Store 真实页，三项规则在旁边展开。
- Visual evidence: Apple App Store 来源标签完整可读。
- Animation ideas: 规则沿截图空白区依次出现。
- Asset requirements: 已登记 App Store 截图。
- Pacing: 七秒完成唯一认知修正。
- Render target: hook-rule-growth
- Claim IDs: claim-roost-003, claim-roost-004

## seg-003

- Narrative purpose: 提前给人类行为、阶段结果和唯一问题。
- Viewer state in: 已懂产品规则，尚不知道等待价值。
- Viewer state out: 看到伊丽莎白时代英语通信与三日增长时序，等待答案。
- New information: 用户仪式和一万到十万的创始人口径。
- Scene structure: 官网地图后出现伊丽莎白时代英语卡、分口径数字和问题。
- Visual evidence: 官网来源与创始人口径分开显示。
- Animation ideas: 路线保持慢，数字只在后半加速。
- Asset requirements: 已登记官网截图与程序化数据卡。
- Pacing: 十秒由规则进入人的问题。
- Render target: hook-core-question
- Claim IDs: claim-roost-009

## seg-004

- Narrative purpose: 让观众感到即时通知与等待的差异。
- Viewer state in: 知道慢是故意的。
- Viewer state out: 理解创始人想减轻即时回复压力，单一体验者产生期待。
- New information: 设计动机与独立体验感受。
- Scene structure: 通知气泡退出，只留路线和离开手机的动作。
- Visual evidence: 创始人动机与单一体验者身份分别标注。
- Animation ideas: 快切停止后留两秒稳定飞行。
- Asset requirements: 现有 InstantPressure 场景图形。
- Pacing: 从 Hook 高密度切到长镜头。
- Render target: instant-pressure
- Claim IDs: claim-roost-003, claim-roost-007, claim-roost-008

## seg-005

- Narrative purpose: 交代朋友怎样推动业余项目公开。
- Viewer state in: 已理解等待体验，不知道产品为何上架。
- Viewer state out: 知道概念视频、朋友反馈和 4 月 28 日公开。
- New information: 创始人与朋友的连续动作。
- Scene structure: 概念卡交给朋友，反馈后上架按钮点亮。
- Visual evidence: 创始人口述与 App Store 日期同期。
- Animation ideas: 卡片轻微传递，不重建开发空间。
- Asset requirements: 现有 origin-friends-publish 程序图形。
- Pacing: 十一秒完成项目、反馈和公开。
- Render target: origin-friends-publish
- Claim IDs: claim-roost-002, claim-roost-005, claim-roost-006

## seg-006

- Narrative purpose: 把鸟速、距离和地图变成连续可见机制。
- Viewer state in: 已知道为何公开，等待体验仍较抽象。
- Viewer state out: 看懂不同鸟速和距离怎样改变到达时间。
- New information: 信使速度、距离与地图位置。
- Scene structure: 不同鸟沿同一地图飞行，位置持续变化。
- Visual evidence: 官网与商店规则来源常驻。
- Animation ideas: 每只鸟保持稳定但不同速度，不画算法。
- Asset requirements: 现有 FlightMap 与鸟图形。
- Pacing: 十二秒连续运动，不切功能卡。
- Render target: distance-speed-map
- Claim IDs: claim-roost-003, claim-roost-004

## seg-007

- Narrative purpose: 展示等待期间用户能看见和做什么。
- Viewer state in: 已理解送达机制。
- Viewer state out: 知道地图继续飞，人可离开手机并做收集、训练或小游戏。
- New information: 收集、训练、小游戏与单一体验者期待。
- Scene structure: 鸟缩成地图点，手机退出，收集、训练和小游戏出现。
- Visual evidence: 产品功能与体验者身份分开标注。
- Animation ideas: 鸟持续移动，收集状态只做一次解锁反馈。
- Asset requirements: 现有 waiting-becomes-play 场景。
- Pacing: 十一秒中间留短暂停顿。
- Render target: waiting-becomes-play
- Claim IDs: claim-roost-003, claim-roost-004, claim-roost-008

## seg-008

- Narrative purpose: 用可复述用户行为兑现等待价值。
- Viewer state in: 已理解机制与个人体验。
- Viewer state out: 看见用户把等待变成伊丽莎白时代英语通信仪式。
- New information: 母亲帖子中的用户动作与三日增长时序。
- Scene structure: 伊丽莎白时代英语纸张卡先出现，Threads 轮廓和数字随后进入。
- Visual evidence: TechCrunch 记录与创始人口径分开显示。
- Animation ideas: 纸张文字先出现，帖子后数字才变化。
- Asset requirements: 程序化纸张卡与帖子轮廓。
- Pacing: 十五秒完成全片最强人类故事。
- Render target: threads-elizabethan
- Claim IDs: claim-roost-003, claim-roost-009

## seg-009

- Narrative purpose: 给出分口径阶段使用证据。
- Viewer state in: 已看到一个传播故事。
- Viewer state out: 知道用户、活跃对话和付费获客是三项数据。
- New information: 二十五万用户、十万活跃对话与零付费获客。
- Scene structure: 三张数据卡分开落下，互不换算。
- Visual evidence: 日期与创始人口径始终可读。
- Animation ideas: 独立计数器，不合并增长曲线。
- Asset requirements: 现有 growth-evidence 数据卡。
- Pacing: 十秒短数据高潮后立即切回产品对象。
- Render target: growth-evidence
- Claim IDs: claim-roost-010, claim-roost-012

## seg-010

- Narrative purpose: 从数字回到用户能选择和支持的鸟。
- Viewer state in: 已看到阶段规模。
- Viewer state out: 知道鸟可以收集、训练或购买，也有支持者订阅。
- New information: 鸟类支持方式。
- Scene structure: 训练中的鸟进入轮换商店和支持者卡。
- Visual evidence: App Store 与创始人采访身份可读，不推算收入。
- Animation ideas: 卡片慢速轮换，价格不做增长动效。
- Asset requirements: 现有 bird-store 场景。
- Pacing: 九秒只交代两种支持动作。
- Render target: bird-store
- Claim IDs: claim-roost-004, claim-roost-013

## seg-011

- Narrative purpose: 交代距离机制所需的位置与陌生关系边界。
- Viewer state in: 理解鸟和距离，尚未看到权限选择。
- Viewer state out: 知道朋友默认看城市、精确位置需选择、Pen Pals 双方接受。
- New information: 位置与对话开启条件。
- Scene structure: 精确坐标缩成城市，双方确认后对话打开。
- Visual evidence: 当前官方隐私说明与 FAQ 来源同期。
- Animation ideas: 位置逐级模糊，对话只在双确认后展开。
- Asset requirements: 现有 privacy-safety 场景。
- Pacing: 八秒完成必要边界，不展开历史状态。
- Render target: privacy-safety
- Claim IDs: claim-roost-015, claim-roost-022

## seg-012

- Narrative purpose: 回答开场并停在同一只飞向朋友的鸟。
- Viewer state in: 已理解规则、人的选择、用户仪式和阶段结果。
- Viewer state out: 能复述 Roost 怎样把等待变成可见送达体验。
- New information: ANSA 三十万注册用户，随后只回收产品动作。
- Scene structure: 三十万卡缩入地图，最后四秒保留开场路线与鸟。
- Visual evidence: ANSA 日期和注册口径可读，功能演示标签保留。
- Animation ideas: 数据退出，鸟沿原路线继续前进。
- Asset requirements: 现有 ending 场景与程序化地图。
- Pacing: 十四秒前半给阶段结果，后半留给动作兑现。
- Render target: artist-community-ending
- Claim IDs: claim-roost-003, claim-roost-004, claim-roost-020
