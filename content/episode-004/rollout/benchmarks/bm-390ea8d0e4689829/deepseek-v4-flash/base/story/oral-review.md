# Oral Review — story/final-script.md

评审轮次：1  
结论：**REJECT**  
阻断项：1（`productStageLanguage`）  
退回：`oral-rewriter`

<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v2",
  "promptVersion": "oral-judge-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "28c55afd0a8c01d0f937f5b854a43f4a0bd6a335c6dc6f2369eac853eb989e4d",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "443a75919d4299353e129bbb0b62d4a47396485b6f5ef8f58e4b98d23d55104a",
  "round": 1,
  "scores": {
    "chineseNaturalness": 3,
    "spokenDelivery": 4,
    "informationFidelity": 5
  },
  "minimumScore": 4,
  "checks": {
    "translatedSyntax": {"result": "PASS", "evidence": [{"locator": "seg-003 / 旁白", "observation": "「一百多万人看它自己打开浏览器写代码」中文语序自然，主语动作清晰；seg-005「公司工程师提交的代码里，八成九由 Devin 提交」中「提交」重复属局部小疵，不影响首遍理解。"}]},
    "sourceAttributionLanguage": {"result": "PASS", "evidence": [{"locator": "seg-002 / claim-devin-012 / 原句「三个奥赛金牌程序员做了这个产品」", "observation": "用具体人物身份与动作代替档案标签，全文无「访谈里」「独立体验者」等研究档案词；seg-005「奔驰」「公司工程师」均为可听的具体主体。"}]},
    "productStageLanguage": {"result": "FAIL", "evidence": [{"locator": "seg-004 / claim-devin-005 / 原句「2024 年 12 月 GA 时」", "observation": "「GA」为 general availability 的英文阶段缩写，零背景听众无法感知，未转成中文用户可感知的身份或变化，违反 availability 阶段词处理要求，触发自动失败。"}]},
    "turnDirection": {"result": "PASS", "evidence": [{"locator": "seg-003→seg-006 / 旁白「市场后来给了它什么价？」→「2026 年 5 月，Cognition 以 25 亿美元估值，融资超过 10 亿美元。」", "observation": "全稿无「仍、却、反而、不过」等无方向转折词；疑问在结尾由具体融资估值事实回答，预期方向明确。"}]},
    "sentenceCadence": {"result": "PASS", "evidence": [{"locator": "seg-001 / seg-004 / seg-006 旁白", "observation": "开场三连短句、中段信息句、结尾单句收束，长短错开；seg-004 双日期＋双价格并列略像列表，仅局部节奏瑕疵。"}]},
    "spokenBreath": {"result": "PASS", "evidence": [{"locator": "seg-004 / 最长句「2024 年 12 月 GA 时，团队版每月 500 美元；2025 年 4 月 3 日 Devin 2.0 发布时，个人套餐起价每月 20 美元，还能同时开多个 Devin 并行干。」", "observation": "分号与逗号形成自然停顿换气点，不需要连续换气两次；其余句子按目标语速可一气读完。"}]},
    "informationFidelity": {"result": "PASS", "evidence": [{"locator": "seg-003 / claim-devin-015", "observation": "「一百多万人」为 122 万+ 的口播约数（同一量级）；句首时间修饰「演示发出去」这个发布动作，播放量按发布以来累计口径读，不构成统计窗口歧义。"}, {"locator": "seg-005 / claim-devin-007 / claim-devin-008", "observation": "「预计 8 个月压到 8 天」保留估算口径，20 万行老代码对应 20 万行 COBOL；「八成九」对应 89% 的公司自报口径。"}, {"locator": "seg-004 / claim-devin-005 / claim-devin-006", "observation": "团队版 500 美元/月（2024-12）与个人套餐 20 美元/月起（2025-04-03 Devin 2.0）并列陈述，未写成降价；「还能同时开多个 Devin 并行干」对应平行 Devin。"}, {"locator": "seg-006 / claim-devin-016", "observation": "「以 25 亿美元估值」采用 pre-money 口径，融资超 10 亿美元，2026 年 5 月与 2026-05-27 一致。"}]}
  },
  "styleSamples": [],
  "blockers": [
    {
      "check": "productStageLanguage",
      "issue": "「GA」英文阶段缩写直用，未转成中文听众能感知的发布变化",
      "locator": "seg-004 / 旁白「2024 年 12 月 GA 时」",
      "minimumCorrection": "将「2024 年 12 月 GA 时」改为中文可感知的发布变化，例如「2024 年 12 月，Devin 正式向团队开放时」或「2024 年 12 月，团队版正式发布时」；其余旁白保持不动。"
    }
  ],
  "verdict": "REJECT",
  "returnTo": "oral-rewriter"
}
-->

## 评分说明

| 维度 | 分数 | 说明 |
| --- | --- | --- |
| chineseNaturalness | 3 | 「2024 年 12 月 GA 时」把 general availability 的英文缩写原样放进旁白，零背景听众不可感知，属于阶段词未转成中文表达；4 分锚点明确排除 literal stage translation，故不能给 4。其余句子语序自然。 |
| spokenDelivery | 4 | 长短句整体错开；seg-004 价格并列句偏长偏说明书，是局部节奏问题，标点可换气，对象感仍在。 |
| informationFidelity | 5 | 定稿与初稿旁白逐字一致；人物、数字、时间、来源等级、指标口径与 Claim 全部一致。 |

归一化分数：(3/5×1/3 + 4/5×1/3 + 5/5×1/3)×100 = 80，达到 80 阈值，但 chineseNaturalness 低于 4 分下限且存在 blocker，按评分算法必须 REJECT。

## 必查七项

### translatedSyntax — PASS
- locator：seg-003 / 旁白「2024 年 3 月，官方演示发出去，一百多万人看它自己打开浏览器写代码。」
- 观察：中文自然语序，主语与动作首遍可辨；seg-005「公司工程师提交的代码里，八成九由 Devin 提交」中「提交」重复两次，属局部措辞小疵，不要求补主语，不改变口径。

### sourceAttributionLanguage — PASS
- locator：seg-002 / claim-devin-012, claim-devin-009 / 原句「三个奥赛金牌程序员做了这个产品。他们要让它自己把工程任务干完，工程师负责检查结果。」
- 观察：用具体人物与动作代替研究档案标签；「官方口径」「公司披露」「媒体口径」只出现在画面小字，不占用旁白。

### productStageLanguage — FAIL
- locator：seg-004 / claim-devin-005 / 原句「2024 年 12 月 GA 时，团队版每月 500 美元；」
- 观察：「GA」是 general availability 的阶段缩写，原样念入旁白；零背景听众无法知道它指产品正式开放使用，未变成中文用户可感知的身份或变化，触发硬拒绝。
- 最小修改：把「2024 年 12 月 GA 时」改成「2024 年 12 月，Devin 正式向团队开放时」或「2024 年 12 月，团队版正式发布时」；不得使用「一般可用状态」式直译。

### turnDirection — PASS
- locator：seg-003→seg-006 / 「市场后来给了它什么价？」→「2026 年 5 月，Cognition 以 25 亿美元估值，融资超过 10 亿美元。」
- 观察：全稿没有「仍、却、反而、不过」等无方向转折词；问题在结尾由具体估值事实回答，方向明确。

### sentenceCadence — PASS
- locator：seg-001 / seg-004 / seg-006
- 观察：开场三连短句、中段信息句、结尾单句收束，长短结构错开；seg-004 两个日期加两个价格的并列略像说明书（低严重度观察），不构成整体均匀节拍。

### spokenBreath — PASS
- locator：seg-004 / 最长句
- 观察：分号与逗号对应自然停顿和换气，不需要连续换气两次；其余句子按目标语速可一次读完。

### informationFidelity — PASS
- locator：seg-003 / claim-devin-015；seg-005 / claim-devin-007, claim-devin-008；seg-004 / claim-devin-005, claim-devin-006；seg-006 / claim-devin-016
- 观察：
  1. 「一百多万人」对应 122 万+（同一量级口播约数）；句首时间修饰发布动作，播放量按发布以来累计口径读，不构成统计窗口歧义。
  2. 「预计 8 个月压到 8 天」保留「预计」估算口径；89% 读作「八成九」符合口播读法；奔驰案例未换算成功率。
  3. 团队版 500 美元/月（2024-12 GA）与个人套餐 20 美元/月起（2025-04-03 Devin 2.0）并列，未写成「从 500 美元降到 20 美元」，守住 claim-devin-005 禁止口径。
  4. 「以 25 亿美元估值」采用 claim-devin-016 的 pre-money 口径，未混写 post-money。
  5. 定稿与初稿旁白逐字一致；未新增人物、场景、动机、结果或生活细节。

## Blocker 清单（必须修改）

1. `productStageLanguage`：seg-004「2024 年 12 月 GA 时」——将「GA」替换为中文可感知的发布变化（见上），其余不动。

## 低严重度观察（不升级为 blocker）

- seg-005「提交…提交」重复；可接受，非必需修改。
- seg-004 Narration units 表格把一句旁白拆成两行（上行以「，」结尾），是表格排版问题，正式旁白文本完整；下游请按 Narration 字段生成 TTS。
- 「奥赛」未展开为「国际信息学奥林匹克」，作为中文常用简称不影响理解。

## 轮次与退回

- round 1，verdict REJECT，returnTo `oral-rewriter`（问题属于口播语言转写，不涉及初稿信息结构，故不改事实，不回 Script Writer）。
