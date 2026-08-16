<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "53010913e4718c9d5c02b703d540e877687b1be57589973cc47055df02dbce9d",
    "sourcesSha256": "e7ab32ef19f93d6420919ea9012551c75423b53369bbcff215baeccc48bd81cb",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "把一个编程任务交给 Devin 之后，它是怎样自己打开浏览器、写代码、跑测试，让工程师开始“派活”而不是自己写代码的？",
  "audiencePromise": "观众会看懂 Devin 自主执行的样子（计划、自带浏览器、终端）、团队把价格降到 20 美元并支持并行的选择，以及奔驰案例与 89% 自用代码为什么让企业开始接受它。",
  "sourcedAnswer": "Devin 在沙箱里自带浏览器、编辑器和终端，任务全程可见；2025 年 4 月团队把个人价格从 500 美元降到 20 美元并支持平行 Devin；2026 年奔驰案例与公司 89% 自用代码的披露，把采用从开发者推向企业。",
  "factBoundary": "89% 与奔驰案例都是公司口径；“第一个 AI 软件工程师”是官方自我定位；SWE-bench 分数与演示画面不换算真实成功率；不把官方演示冒充独立评测。",
  "emotionalArc": [
    {"beatId": "beat-01", "viewerState": "看见任务交出去后，它自己打开浏览器开始干活", "storyMove": "用官方演示的自主执行结果建立零背景动作", "targetRange": "0:00-0:20", "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"]},
    {"beatId": "beat-02", "viewerState": "理解团队选择的是让工程师派活而不是逐行写码", "storyMove": "展示 Devin 2.0 的价格与并行选择", "targetRange": "0:20-0:34", "claimIds": ["claim-devin-005", "claim-devin-006"]},
    {"beatId": "beat-03", "viewerState": "看见企业与公司自己开始接受它", "storyMove": "进入奔驰案例与 89% 自用代码", "targetRange": "0:34-0:48", "claimIds": ["claim-devin-007", "claim-devin-008"]},
    {"beatId": "beat-04", "viewerState": "带着新理解回看工程师的新角色与开场那个任务", "storyMove": "用派活与验收回收开场动作", "targetRange": "0:48-1:00", "claimIds": ["claim-devin-009", "claim-devin-001"]}
  ],
  "revealOrder": [
    {"order": 1, "reveal": "任务交出去后，它自己打开浏览器开始干活", "withheldAnswer": "这是什么产品", "purpose": "建立零背景可懂的自主执行结果"},
    {"order": 2, "reveal": "2024 年 3 月发布，官方称第一个 AI 软件工程师", "withheldAnswer": "为什么写代码要它自己开浏览器", "purpose": "建立身份并留下机制疑问"},
    {"order": 3, "reveal": "它有浏览器、编辑器和终端，先列计划再执行，每一步看得见", "withheldAnswer": "团队为什么这样选", "purpose": "建立产品心智模型"},
    {"order": 4, "reveal": "价格从 500 美元降到 20 美元，可以同时开多个 Devin 并行干", "withheldAnswer": "用户为什么开始接受", "purpose": "展示降低门槛的团队选择"},
    {"order": 5, "reveal": "奔驰把 8 个月的改造压到 8 天，公司 89% 的代码由 Devin 提交", "withheldAnswer": "工程师的角色变成什么", "purpose": "用企业与自用证据回答接受"},
    {"order": 6, "reveal": "工程师负责派活与验收，开头那个任务还在自己往下做", "withheldAnswer": "无", "purpose": "兑现开场动作并结束在具体状态"}
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Devin Director Brief

## Core story question

把一个编程任务交给 Devin 之后，它是怎样自己打开浏览器、写代码、跑测试，让工程师开始“派活”而不是自己写代码的？

## Audience promise

观众会看懂 Devin 自主执行的样子（计划、自带浏览器、终端）、团队把价格降到 20 美元并支持并行的选择，以及奔驰案例与 89% 自用代码为什么让企业开始接受它。

## Emotional arc

自主执行结果 → 追问为什么写代码要它自己开浏览器 → 看懂它怎么干活 → 看到价格与并行选择 → 看到企业与自用证据 → 回看开场任务。

## Reveal order

先给已经打开浏览器干活的执行结果，再用发布身份与机制疑问推进；中段解释工具链与团队选择，后段用奔驰和 89% 自用代码回答接受，最后用派活与验收收回开场动作。

## Fact boundary

89% 与奔驰案例都是公司口径，不换算成功率；"第一个 AI 软件工程师"是官方自我定位；SWE-bench 分数与演示画面不进入旁白；不把官方演示冒充独立评测。
