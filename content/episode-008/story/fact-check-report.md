<!-- fact-check-gate
{
  "rubricVersion": "fact-guardian-v1",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "59b6e8fe0b52f7a245b82fc26f64123dd58070405c6424fdb83eb9aa2c80e9c3",
  "checkedSegments": 6,
  "checkedNarrationUnits": 6,
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Episode-008 独立事实核查

2026-09-02，Fact Guardian：PASS。已核对当前脚本 SHA-256 与 Audience Critic 第 2 轮 PASS 的绑定一致；逐句检查全部 6 段、6 个 narration units。所有引用 Claim 均存在且 allowedInNarration=true。此次只判断脚本在现有证据边界内是否可播，不代表素材入库、版权许可、留存、成片或人工终审通过。

| 段落 | Claim | 核查结论 |
| --- | --- | --- |
| seg-001 | 001、004 | “刷新还在”限定于官方情绪记录示例。refresh-action-contact.jpg 可见保存前后与刷新白帧之后仍有记录；demo-preview-readback.json 记录源片 42:15–42:57 的保存、刷新和数据库对应行。不是本团队自建产品测试，也不外推永久保存或任意应用稳定性。 |
| seg-002 | 001、002、004 | 聊天制作网页和面向不会编程的人，与公司产品展示及创始人需求叙述一致。“开始做应用”没有升级为一次生成完整商业产品；末句是继续解释登录和保存的开放问题，没有虚构已经发生的失败。该 unit 的 company 标签承载产品介绍，创始人来源同时列明，未将其主观需求判断伪装成独立调查。 |
| seg-003 | 002、003 | Indie Hackers 访谈正文支持创始人的编程门槛判断与一个周末的 GPT-Engineer 命令行原型。“创始人安东说”保留来源身份；没有说 Lovable 完整产品在一个周末完成，也未把访谈发表日当作原型开发日。 |
| seg-004 | 004 | 官方文章明述登录、心情分数和备注的数据库持久化。现有联系表与根执行者的视频读回相互印证页面新记录和数据库对应记录；“能看，也能存”是该示例的可见能力，没有承诺免调试。具体画面对应关系必须在后续裁切中保留。 |
| seg-005 | 005 | 公司复盘明确列出 Product Hunt 发布视频、X 讨论、社区接触和 Supabase 联合推广。当前概括没有虚构用户人数、转化率或收入贡献；“让正在找工具的人看到”表达渠道触达目的，未作为已量化的获客结果。视觉来源短注应保留“团队复盘”身份。 |
| seg-006 | 007 | 2025-07-23 官方公告支持达到一亿美元 ARR。旁白保留“到二零二五年七月，公司宣布”和“年化经常性收入”，画面保留日期及公司口径；没有换算利润、过去一年实际收款、留存或当前规模。与上一段仅为叙事先后，不构成渠道导致 ARR 的因果主张。 |

本轮重新打开并核对了[创始人访谈](https://www.indiehackers.com/post/tech/hitting-100m-arr-in-eight-months-with-an-ai-software-builder-ONMaxjB3rix2PnBCnrDr)、[官方演示文章](https://lovable.dev/blog/2025-01-13-rebranding-gpt-engineer-to-lovable)、[团队获客复盘](https://lovable.dev/blog/2025-01-28-lovables-two-failed-launches-and-what-we-got-wrong-about-plg)与[ARR 公告](https://lovable.dev/blog/agent)。前两篇 Lovable 文章的 URL 日期不等于页面发表日期：演示文章显示 2024-12-03，获客复盘显示 2025-01-22。2025-08-06 是访谈发表日；这些日期都不证明原型或获客动作恰在当日发生。脚本没有作这样的断言。演示数据库画面日期 2024-11-21 也不应直接冒充录制日期；视觉采用“2024 年官方演示”即可。

已检查 research/facts.json、sources.json、timeline.json、technology.md、growth-data.md，以及 story-bible.md、three-act-structure.md、final-script.md、critic-report.md。额外查看 production/logs/refresh-action-contact.jpg、demo-contact-1080p.jpg、demo-observed-42m44s.png 和 demo-preview-readback.json。保存、刷新与数据库的精确时间点采用根执行者对原片的实际读回记录；本角色没有冒称亲自重做登录或独立运行应用。

视觉执行边界：登录片段 29:54–30:18 与保存/数据库片段 42:15–42:57 属于同一 Mood Matrix 示例的不同界面迭代，必须标明官方演示节选，并以明确转场区分，不能剪成一次无改版的连续操作。保留刷新前后同一记录，以及数据库中对应分数、备注的可读区域；不要用无关页面或仿制画面替代上述强事实。现有研究预览仅提供事实核查证据，rightsApproved=false、admissionApproved=false；Fact Guardian 不授予使用许可。如果最终无法使用对应素材，应回退相关表达或另取等价证据后重新审核。

无事实 blocker，无上游退回。当前稿未出现虚构动机、稻草人反转、未经披露技术、单渠道增长归因或把资本数字当成成功原因；所需改动均未超出现有事实边界。脚本计划 55 秒不构成真实时长验证，仍以 TTS 与 MP4 读回为准。
