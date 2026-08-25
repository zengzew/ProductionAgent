<!-- oral-review-gate
{
  "rubricVersion": "oral-review-v2",
  "promptVersion": "oral-judge-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "ba6d3415d904701d63d5d1cca1eac5ebbd4c112f35e4a0736556332ffc8db59a",
  "sourceDraftFile": "story/script-draft.md",
  "sourceDraftSha256": "443a75919d4299353e129bbb0b62d4a47396485b6f5ef8f58e4b98d23d55104a",
  "round": 1,
  "scores": {
    "chineseNaturalness": 4,
    "spokenDelivery": 4,
    "informationFidelity": 3
  },
  "minimumScore": 4,
  "checks": {
    "translatedSyntax": {"result": "PASS", "evidence": [{"locator": "seg-001", "observation": "短句、主谓宾完整；seg-004 与 seg-006 的长句仍是中文自然语序，没有英文长定语或说明书式并列。"}]},
    "sourceAttributionLanguage": {"result": "PASS", "evidence": [{"locator": "seg-005", "observation": "旁白没有用“访谈里/独立体验者”等研究档案标签；来源边界由画面小字“官方口径/公司自报”承担。"}]},
    "productStageLanguage": {"result": "PASS", "evidence": [{"locator": "seg-004", "observation": "“团队版正式上线”“个人套餐起价”把 GA 和套餐阶段转成用户可见的上线动作与价格，没有念成“一般可用状态”。"}]},
    "turnDirection": {"result": "PASS", "evidence": [{"locator": "seg-003", "observation": "全稿没有“仍、却、反而、不过”等无方向转折；“市场后来给了它什么价”从冷启动播放量推进到融资价格，方向清楚。"}]},
    "sentenceCadence": {"result": "PASS", "evidence": [{"locator": "seg-001", "observation": "开场三短句落下动作，seg-004 用长句装价格与并行能力，长短交错，没有海报式整句或均匀节拍。"}]},
    "spokenBreath": {"result": "PASS", "evidence": [{"locator": "seg-004", "observation": "长句在“每月500美元”后的分号处停顿，14秒段可分两次换气；没有一句需要连续两次换气。"}]},
    "informationFidelity": {"result": "FAIL", "evidence": [{"locator": "seg-005 / claim-devin-008", "observation": "“公司工程师提交的代码里，八成九由 Devin 提交”紧接奔驰案例，零背景听众可能把公司理解为奔驰；Claim 是 Cognition 自家工程师的代码占比（company-reported），来源主体漂移。另有 seg-004 首次出现英文产品名 Devin 无普通话解释。"}]}
  },
  "styleSamples": [],
  "blockers": [
    "seg-005 的“公司工程师”缺少 Cognition 限定，可能被理解为奔驰，必改为“Cognition 自己的工程师”或“官方称自家工程师”等明确主体。",
    "seg-004 首次出现产品名 Devin 前没有普通话解释，须在首次出现前补一句“刚才自己干活的 AI 叫 Devin”或类似定义。"
  ],
  "verdict": "REJECT",
  "returnTo": "script-writer"
}
-->

# Oral Review（第 1 轮）

## 结论

REJECT（`informationFidelity` FAIL；两个 blocker 需先修改再复审）。

## 检查摘要

- `translatedSyntax`: PASS
- `sourceAttributionLanguage`: PASS
- `productStageLanguage`: PASS
- `turnDirection`: PASS
- `sentenceCadence`: PASS
- `spokenBreath`: PASS
- `informationFidelity`: FAIL（seg-005 / claim-devin-008 的“公司工程师”主体漂移；seg-004 产品名 Devin 首次出现无解释）

## 最小修改清单

1. 将 seg-005 的“公司工程师”改为“Cognition 自己的工程师”或“官方称自家工程师”，避免接在奔驰后面被理解成奔驰的代码。
2. 在 seg-004 首次说出 Devin 前补一句普通话解释，如“这个能自己打开浏览器干活的 AI，叫 Devin”，或把解释提前到 seg-001/002。

问题来自初稿信息结构，退回 Script Writer，不进入 TTS/字幕流程。