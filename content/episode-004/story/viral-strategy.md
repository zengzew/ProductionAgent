<!-- viral-strategy-gate
{
  "rubricVersion": "viral-strategy-v2",
  "reviewedFiles": {
    "storyBibleSha256": "3e5f453587d10a851240391da338640ee16ed1926f01d30e5a1b8d8535bea69d",
    "storyAngleSha256": "a894a35ba283bb9d96668c7f9a5738145a27e0660c15dcfae3e8f1aa8646ad5f",
    "threeActStructureSha256": "7554fa8ed491a199ec4bcda79f6c42713df19aac84981c99dbbc0d34bf4bc7b6",
    "hookCandidatesSha256": "47262b1ad47a66bcf70047333aaf161c735817b7a58d439a745ddb375c4c4996",
    "directorBriefSha256": "39feb9f375e75f8d2cd7754ce875d5f9ca7cf26bdecf5f17f212191fd9c5c79a"
  },
  "selectedHookHeading": "1. 任务已经交出去，它自己打开浏览器（选中）",
  "claimIds": [
    "claim-devin-001",
    "claim-devin-002",
    "claim-devin-003",
    "claim-devin-004",
    "claim-devin-005",
    "claim-devin-006",
    "claim-devin-007",
    "claim-devin-008",
    "claim-devin-009"
  ],
  "scores": {
    "openingHook": 5,
    "curiosityGap": 5,
    "emotionalTension": 4,
    "informationRevealOrder": 5,
    "endingPayoff": 5
  },
  "total": 24,
  "threshold": 20,
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Devin Viral Strategy

## Opening hook

第 0 帧显示官方演示里的 Devin 界面：任务已经输入，它自己开始规划并打开浏览器执行。三秒内只说“任务交出去，它自己打开浏览器，开始干活”，持续标“功能演示”。随后用发布身份建立产品定义，再用工具链回答“为什么写代码要它自己开浏览器”。

## Curiosity gap

二十秒内让观众知道它自带浏览器、编辑器和终端，先列计划再执行，每一步都看得见。留下一个可由现有证据回答的问题：为什么写代码要它自己开浏览器？

## Emotional tension

张力从日常愿望开始：把任务交出去，让它自己去办，而且每一步都看得见。随后出现价格门槛的降低与并行，结尾回到仍在执行的开场任务与工程师的新角色。

## Information reveal order

| 时间      | 新信息                                       | 暂缓回答               | 证据                                                                   |
| --------- | -------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| 0～3 秒   | 任务交出去，它自己打开浏览器                 | 这是什么产品           | 官方演示 + `claim-devin-001`                                           |
| 3～10 秒  | 2024 年 3 月发布，官方称第一个 AI 软件工程师 | 为什么写代码要自己开浏览器 | `claim-devin-002`                                                    |
| 10～20 秒 | 自带浏览器、编辑器、终端，先列计划再执行     | 团队为什么这样选       | `claim-devin-003`, `claim-devin-004`                                   |
| 中段      | 价格从 500 降到 20 美元、平行 Devin          | 用户为什么开始接受     | `claim-devin-005`, `claim-devin-006`                                   |
| 后段      | 奔驰 8 个月到 8 天、89% 自用代码             | 工程师的角色变成什么   | `claim-devin-007`, `claim-devin-008`                                   |
| 结尾      | 工程师派活与验收，开场任务还在自己往下做     | 无                     | `claim-devin-009`, `claim-devin-001`                                   |

## Ending payoff

结尾先收回“工程师派活、验收”的新角色，再回到开场同一条任务：它还在自己的浏览器里往下做。观众已经看懂，这个动作来自可见的自主执行与团队两次选择（价格、并行）。最后一句停在具体执行动作，不追加问题或 CTA。
