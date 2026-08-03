# Episode 001 导演流程复刻复盘

复盘对象：2026-07-30 publish-v2 基线与 2026-08-02 director cut。详细六维评分和两版
哈希以 `content/episode-001/production/comparison-report.md` 为准。

| 产物         | publish-v2 基线                                                    | director cut                                                       |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| MP4 SHA-256  | `672113aeb631f17c97c5d46d45d3c02d7e7003fdec669ef5298729ac81e4b523` | `57a02a5de86f188fe260d6295d7e2a38d16ed948f3341b2d44306e3b472040c0` |
| 规格         | 1080×1920、30 fps、180.544 秒                                      | 1080×1920、30 fps、135.744 秒                                      |
| 字幕         | 92 cue，最短 1.025 秒                                              | 72 cue，最短 1.036 秒                                              |
| 第 0 帧      | 空白画布、来源栏和字幕                                             | 已发送请求、已更新日历和功能演示标签                               |
| 结尾         | 用未来成本问题收尾                                                 | 回到同一消息与已更新日历                                           |
| 六维代理总分 | 39/60                                                              | 52/60                                                              |

## 结论

导演版已通过 research、workflow、story、content、delivery 和 comparison 门禁。旧版
触碰时长硬门槛且第一帧没有产品动作；导演版严格小于 180 秒，并在第 0 帧完成产品
结果。改善来自实际脚本、画面和时长变化，不是只增加三个角色名称或评审文档。

六维分数是编辑留存代理指标。它证明新版本在同一规则下更强，不能替代发布后的真实
留存、完播、评论、转发或受控 A/B 数据。

## 新流程怎样改变成片

### 1. Story Director 先锁定观众问题

`director-brief.md` 不再从时间线顺序组织旁白。它先确定：

- 核心问题：团队为什么收起工作台，Beta 用户怎样把 Poke 带出邮箱；
- 观众承诺：看到团队选择、用户动作和一句消息落到日历；
- 情绪弧线：完成结果 → 日常麻烦 → 团队选择 → 用户扩展 → 运行取舍 → 回看结果；
- 事实边界：消息数不换算用户或留存，入口和 Recipe 不写成增长归因。

这一步直接删除了旧版 Apple 日期编年和“以后还能跑多久”的问题式结尾。

### 2. Viral Director 决定揭示顺序

新 Hook 的第 0 帧已经显示改期完成。3～10 秒才用一亿多条消息放大动作，10～20 秒
补出联系人 AI 的心智模型和唯一问题。事实没有改变，观众先看到的内容改变了。

### 3. Critic 反馈必须有责任人与产物变化

Retention Critic 第一轮给出 66 分并 REJECT，三条 high risk 分别路由到：

- Story Director：负面问题式结尾没有兑现产品价值；
- Script Writer：Apple 节点和重复时间线削弱主线；
- Visual Director：逐段缺少叙事目的和观众状态变化。

第二轮不能只提高分数。`retention-report.md` 引用第一轮报告，逐条记录 owner、修改
内容和 before/after SHA-256；`workflow.json` 同时记录路由和关闭状态。最终第二轮为
93 分 PASS。

### 4. Visual Director 的计划落到真实 Render target

每个段落现在同时说明 Narrative purpose、Viewer state in/out、New information、
证据、节奏和 Render target。实际成片因此有明确的视觉推进：

- 首帧的消息与日历完成状态；
- 联系人入口与工作台退场；
- Beta 请求、权限确认和日历执行；
- 真实 Poke Release Notes；
- 消息聚合、持续运行状态和真实 Cognition 公告；
- 回到开场的同一完成动作。

真实页面首次出现时有来源与日期标签，合成 UI 持续标“功能演示”。

### 5. Delivery Critic 只相信当前成片

交付报告绑定当前 MP4、SRT 与 production timeline。读回结果为 135.744 秒、72 个
cue、0 个小于 1 秒的 cue，首帧、真实页面、字幕安全区、音频和结尾均通过。旧版
Delivery PASS 不会被沿用到新哈希，也不会用 smoke render 代替正式竖版检查。

## 可重复的生产准则

1. Research 决定可说什么；Director Brief 决定观众为什么继续看。
2. 每期只有一个核心问题，每段必须增加动作、选择、证据、尺度或判断。
3. Critic 必须说明观众为什么离开、谁负责、哪个产物要怎样变。
4. REJECT 只能靠产物变化和重新评审关闭，不能靠改分数关闭。
5. Visual Plan 的每段都要能映射到实际 scene；交付时抽查最终 MP4，而非文档意图。
6. 复刻对比要保留旧视频与 timeline 并绑定哈希，避免用记忆描述“变好”。
7. 代理评分与真实受众结果分开。发布后再用平台数据校准评分规则。

## 复现与验证

```bash
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
pnpm materialize:story
pnpm validate:content
pnpm tts
pnpm timeline
pnpm render:smoke
pnpm render:vertical
pnpm inspect:output
pnpm validate:delivery
pnpm validate:comparison
```

当前关键帧和两版 contact sheet 位于
`output/episode-001/evidence/director-workflow/`。下一步若要证明实际留存提升，应在
同平台、相近发布时间和受众条件下进行受控发布测试，而不是继续抬高内部评分。
