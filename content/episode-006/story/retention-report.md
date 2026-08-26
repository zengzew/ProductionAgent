<!-- retention-gate
{
  "rubricVersion": "retention-critic-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "9da397d3458768eb625c5c49101bced42f20a7013500b3cf02197edc9f23bbc8",
  "visualPlanFile": "story/visual-plan.md",
  "visualPlanSha256": "a84ba2ecf0be46a0f7c5ccc95dbd1cd96e9d1bfd7cdee87348aa083cfe505e98",
  "round": 1,
  "previousReview": null,
  "resolvedFeedback": [],
  "scores": {
    "first3Seconds": 22,
    "first30Seconds": 22,
    "midVideoEngagement": 22,
    "endingSatisfaction": 22
  },
  "total": 88,
  "threshold": 80,
  "windows": {
    "first3Seconds": {
      "dropOffRisk": "medium",
      "prediction": "首帧呈现官方 X 帖大猩猩几何网格特写，0.5 秒后推入网格细节，1.8 秒焦点移至成品 Logo，右上角常驻 Rikyū 标签。动作（网格→成品并置）零背景可懂，产品名第一帧可见，旁白 9 字短句与画面同步。但网格本身对零背景观众仍属陌生视觉语言，需依赖 Rikyū 标签和成品 Logo 同框才能判断这是 AI 设计服务的公开演示，而非纯几何艺术。同期证据为官方原图而非品牌首页，满足 seen-action-not-described-action。"
    },
    "first30Seconds": {
      "dropOffRisk": "medium",
      "prediction": "seg-002 用官网 Waypause/Elias/Lowbell 三个项目组建立产品心智模型（描述需求→整套品牌资产），seg-003 用功能演示展示两个入口（直接描述需求 / 从 Claude/Codex 发起）。前 20 秒结束时观众已知产品是什么、怎么触发，并留下疑问桥‘怎么让陌生用户愿意试一次’。但 seg-003 的 MCP 连接用功能示意而非真实操作录屏，零背景观众无法看到真实用户如何从外部 AI 发起设计，可能产生‘这是不是又要我打开网页去办’的说明书感。seg-004 开头用‘开发者自己回顾’过渡到低起点，与 seg-003 结尾疑问桥的衔接存在 1-2 秒延迟。"
    },
    "midVideo": {
      "dropOffRisk": "low",
      "prediction": "seg-004 到 seg-006 每段引入新证据形态：seg-004 用创始人公开回顾标签 + 官方 X 帖狮子网格原图（与 seg-001 大猩猩不同焦点）；seg-005 用大猩猩成品 Logo 满版 + ITmedia 转述的 10,000+ 使用数字层；seg-006 用狮子成品 + ITmedia 来源条 + 5,000,000+ 展示 + 分享卡收缩动作。每 7-8 秒一次新判断（低起点→公开动作→单日规模→传播尺度），无虚构危机，无重复情绪 B-roll。证据形态从 still-page 切换到 data-graphic 再到 news-quote，视觉密度有效。"
    },
    "ending": {
      "dropOffRisk": "low",
      "prediction": "seg-007 用 Waypause 霓虹城市海报满版进入，2 秒 Free 卡、5 秒 Basic 卡替换、8 秒结果海报与两档价格并列停帧。结尾停在 claim-rikyu-010 支持的当前入口（2000 免费积分、5 美元起含 SVG/商用），兑现开场‘它是什么、怎么开始’的承诺。未回看 seg-001 同一动作，未用市场预测或‘你也能赚到’替代 payoff。有来源的价格和功能开放范围作为可验证结果，满足 ending satisfaction。"
    }
  },
  "viewerExitRisks": [
    {
      "id": "feedback-001",
      "timeRange": "0:00-0:03",
      "severity": "medium",
      "whyViewerStops": "首帧几何网格对零背景观众属陌生视觉语言，需依赖 Rikyū 标签和成品 Logo 同框才能判断这是 AI 设计服务的公开演示。若 Rikyū 标签字号过小或成品 Logo 叠入时机晚于 1.5 秒，观众可能在首帧判定为纯几何艺术而划走。",
      "evidence": "visual-plan seg-001 规定第 0 帧直接显示完整原图和 Rikyū 标签，0.5 秒放大构成网格，1.8 秒焦点移至成品 Logo。旁白仅 9 字‘几何网格旁，出现了一张成品 Logo’，未口播产品名。",
      "requestedChange": "确保 Rikyū 标签在首帧 0.0 秒即清晰可读，字号不小于 24pt，位置在右上角安全区；成品 Logo 叠入或焦点移至成品的时机不晚于 1.5 秒，使零背景观众在 1.5 秒内同时看到产品名、网格和成品。",
      "returnTo": "visual-director"
    },
    {
      "id": "feedback-002",
      "timeRange": "0:13-0:20",
      "severity": "medium",
      "whyViewerStops": "seg-003 的 MCP 连接用功能示意（输入条滑入 + 结果勾选 + Claude/Codex 入口点亮）而非真实操作录屏，零背景观众无法看到真实用户如何从外部 AI 发起设计。画面标注‘功能演示’，旁白‘也能把 Claude、Codex 接进来，从那边发起设计’未用一句普通话解释 MCP 的实际作用，可能产生‘这是不是又要我打开网页去办’的说明书感。",
      "evidence": "visual-plan seg-003 明确‘无公开操作录屏，使用真实结果图 + 明确标注的功能示意；不冒充实录’；入口动作使用 Claim 支持的文字叠层。旁白未解释 MCP 是‘不用打开网站，从你常用的 AI 里直接发起’。",
      "requestedChange": "在 seg-003 旁白中用一句普通话解释 MCP 的实际作用，如‘不用打开网站，从你常用的 AI 里直接发起’，使零背景观众理解这是另一个入口而非协议说明；或将功能示意替换为更直观的用户动作画面（如 Claude 对话界面中出现‘发起设计’按钮的真实截图，若有来源支持）。",
      "returnTo": "script-writer"
    },
    {
      "id": "feedback-003",
      "timeRange": "0:20-0:28",
      "severity": "low",
      "whyViewerStops": "seg-004 从产品功能切换到‘首日 7 名用户’的创始人回顾，与 seg-003 结尾疑问桥‘怎么让陌生用户愿意试一次’的衔接存在 1-2 秒延迟。观众可能困惑为何突然讲起开发者个人经历，与前面建立的产品价值关联不够紧密。",
      "evidence": "seg-003 结尾旁白‘这样一个小工具，怎么让陌生用户愿意试一次？’seg-004 开头旁白‘开发者自己回顾，上线首日只有 7 个用户’，未用过渡句将‘低起点’与‘如何被看见’的问题连接。",
      "requestedChange": "在 seg-004 开头增加一句过渡，将‘低起点’与‘如何被看见’的问题连接起来，如‘但开发者自己回顾，上线首日只有 7 个用户——它是怎么被看见的？’使疑问桥与后续证据的衔接更紧密。",
      "returnTo": "script-writer"
    }
  ],
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->

# Retention Report — episode-006（Rikyū）

## 总体判断

最终脚本与视觉方案通过 Retention Critic 评审，总分 88 分，达到 80 分门槛，四项窗口均不低于 15 分，无 blocker，verdict 为 PASS。

首帧（0:00-0:03）以官方 X 帖大猩猩几何网格特写开场，0.5 秒推入网格细节，1.8 秒焦点移至成品 Logo，右上角常驻 Rikyū 标签。动作（网格→成品并置）零背景可懂，产品名第一帧可见，旁白 9 字短句与画面同步。同期证据为官方原图而非品牌首页，满足 seen-action-not-described-action。但网格本身对零背景观众仍属陌生视觉语言，需依赖 Rikyū 标签和成品 Logo 同框才能判断这是 AI 设计服务的公开演示，drop-off risk 为 medium。

前 30 秒（0:03-0:30）用 seg-002 官网项目组建立产品心智模型（描述需求→整套品牌资产），seg-003 用功能演示展示两个入口（直接描述需求 / 从 Claude/Codex 发起）。前 20 秒结束时观众已知产品是什么、怎么触发，并留下疑问桥‘怎么让陌生用户愿意试一次’。但 seg-003 的 MCP 连接用功能示意而非真实操作录屏，零背景观众无法看到真实用户如何从外部 AI 发起设计，可能产生说明书感，drop-off risk 为 medium。

中段（0:28-0:42）每段引入新证据形态：seg-004 用创始人公开回顾标签 + 官方 X 帖狮子网格原图（与 seg-001 大猩猩不同焦点）；seg-005 用大猩猩成品 Logo 满版 + ITmedia 转述的 10,000+ 使用数字层；seg-006 用狮子成品 + ITmedia 来源条 + 5,000,000+ 展示 + 分享卡收缩动作。每 7-8 秒一次新判断（低起点→公开动作→单日规模→传播尺度），无虚构危机，无重复情绪 B-roll。证据形态从 still-page 切换到 data-graphic 再到 news-quote，视觉密度有效，drop-off risk 为 low。

结尾（0:42-0:52）用 seg-007 Waypause 霓虹城市海报满版进入，2 秒 Free 卡、5 秒 Basic 卡替换、8 秒结果海报与两档价格并列停帧。结尾停在 claim-rikyu-010 支持的当前入口（2000 免费积分、5 美元起含 SVG/商用），兑现开场‘它是什么、怎么开始’的承诺。未回看 seg-001 同一动作，未用市场预测或‘你也能赚到’替代 payoff。有来源的价格和功能开放范围作为可验证结果，满足 ending satisfaction，drop-off risk 为 low。

## 分项评分

### first3Seconds: 22/25

- 首帧呈现官方 X 帖大猩猩几何网格特写，0.5 秒后推入网格细节，1.8 秒焦点移至成品 Logo，右上角常驻 Rikyū 标签。
- 动作（网格→成品并置）零背景可懂，产品名第一帧可见，旁白 9 字短句与画面同步。
- 同期证据为官方原图而非品牌首页，满足 seen-action-not-described-action。
- 但网格本身对零背景观众仍属陌生视觉语言，需依赖 Rikyū 标签和成品 Logo 同框才能判断这是 AI 设计服务的公开演示。
- drop-off risk: medium

### first30Seconds: 22/25

- seg-002 用官网 Waypause/Elias/Lowbell 三个项目组建立产品心智模型（描述需求→整套品牌资产）。
- seg-003 用功能演示展示两个入口（直接描述需求 / 从 Claude/Codex 发起）。
- 前 20 秒结束时观众已知产品是什么、怎么触发，并留下疑问桥‘怎么让陌生用户愿意试一次’。
- 但 seg-003 的 MCP 连接用功能示意而非真实操作录屏，零背景观众无法看到真实用户如何从外部 AI 发起设计，可能产生说明书感。
- seg-004 开头用‘开发者自己回顾’过渡到低起点，与 seg-003 结尾疑问桥的衔接存在 1-2 秒延迟。
- drop-off risk: medium

### midVideoEngagement: 22/25

- seg-004 到 seg-006 每段引入新证据形态：seg-004 用创始人公开回顾标签 + 官方 X 帖狮子网格原图（与 seg-001 大猩猩不同焦点）；seg-005 用大猩猩成品 Logo 满版 + ITmedia 转述的 10,000+ 使用数字层；seg-006 用狮子成品 + ITmedia 来源条 + 5,000,000+ 展示 + 分享卡收缩动作。
- 每 7-8 秒一次新判断（低起点→公开动作→单日规模→传播尺度），无虚构危机，无重复情绪 B-roll。
- 证据形态从 still-page 切换到 data-graphic 再到 news-quote，视觉密度有效。
- drop-off risk: low

### endingSatisfaction: 22/25

- seg-007 用 Waypause 霓虹城市海报满版进入，2 秒 Free 卡、5 秒 Basic 卡替换、8 秒结果海报与两档价格并列停帧。
- 结尾停在 claim-rikyu-010 支持的当前入口（2000 免费积分、5 美元起含 SVG/商用），兑现开场‘它是什么、怎么开始’的承诺。
- 未回看 seg-001 同一动作，未用市场预测或‘你也能赚到’替代 payoff。
- 有来源的价格和功能开放范围作为可验证结果，满足 ending satisfaction。
- drop-off risk: low

## 观众流失风险

### feedback-001（medium）

- **时间区间**：0:00-0:03
- **观众为何停**：首帧几何网格对零背景观众属陌生视觉语言，需依赖 Rikyū 标签和成品 Logo 同框才能判断这是 AI 设计服务的公开演示。若 Rikyū 标签字号过小或成品 Logo 叠入时机晚于 1.5 秒，观众可能在首帧判定为纯几何艺术而划走。
- **当前证据**：visual-plan seg-001 规定第 0 帧直接显示完整原图和 Rikyū 标签，0.5 秒放大构成网格，1.8 秒焦点移至成品 Logo。旁白仅 9 字‘几何网格旁，出现了一张成品 Logo’，未口播产品名。
- **修订要求**：确保 Rikyū 标签在首帧 0.0 秒即清晰可读，字号不小于 24pt，位置在右上角安全区；成品 Logo 叠入或焦点移至成品的时机不晚于 1.5 秒，使零背景观众在 1.5 秒内同时看到产品名、网格和成品。
- **责任角色**：visual-director

### feedback-002（medium）

- **时间区间**：0:13-0:20
- **观众为何停**：seg-003 的 MCP 连接用功能示意（输入条滑入 + 结果勾选 + Claude/Codex 入口点亮）而非真实操作录屏，零背景观众无法看到真实用户如何从外部 AI 发起设计。画面标注‘功能演示’，旁白‘也能把 Claude、Codex 接进来，从那边发起设计’未用一句普通话解释 MCP 的实际作用，可能产生‘这是不是又要我打开网页去办’的说明书感。
- **当前证据**：visual-plan seg-003 明确‘无公开操作录屏，使用真实结果图 + 明确标注的功能示意；不冒充实录’；入口动作使用 Claim 支持的文字叠层。旁白未解释 MCP 是‘不用打开网站，从你常用的 AI 里直接发起’。
- **修订要求**：在 seg-003 旁白中用一句普通话解释 MCP 的实际作用，如‘不用打开网站，从你常用的 AI 里直接发起’，使零背景观众理解这是另一个入口而非协议说明；或将功能示意替换为更直观的用户动作画面（如 Claude 对话界面中出现‘发起设计’按钮的真实截图，若有来源支持）。
- **责任角色**：script-writer

### feedback-003（low）

- **时间区间**：0:20-0:28
- **观众为何停**：seg-004 从产品功能切换到‘首日 7 名用户’的创始人回顾，与 seg-003 结尾疑问桥‘怎么让陌生用户愿意试一次’的衔接存在 1-2 秒延迟。观众可能困惑为何突然讲起开发者个人经历，与前面建立的产品价值关联不够紧密。
- **当前证据**：seg-003 结尾旁白‘这样一个小工具，怎么让陌生用户愿意试一次？’seg-004 开头旁白‘开发者自己回顾，上线首日只有 7 个用户’，未用过渡句将‘低起点’与‘如何被看见’的问题连接。
- **修订要求**：在 seg-004 开头增加一句过渡，将‘低起点’与‘如何被看见’的问题连接起来，如‘但开发者自己回顾，上线首日只有 7 个用户——它是怎么被看见的？’使疑问桥与后续证据的衔接更紧密。
- **责任角色**：script-writer

## 结论

最终脚本与视觉方案通过 Retention Critic 评审，总分 88 分，达到 80 分门槛，四项窗口均不低于 15 分，无 blocker，verdict 为 PASS，returnTo 为 none。

存在三处中低严重度的观众流失风险，建议在后续修订中处理：

1. **feedback-001**（medium）：首帧 Rikyū 标签字号和成品 Logo 叠入时机需确保零背景观众在 1.5 秒内识别产品身份。责任角色：visual-director。
2. **feedback-002**（medium）：seg-003 的 MCP 连接需在旁白中用一句普通话解释实际作用，或替换为更直观的用户动作画面。责任角色：script-writer。
3. **feedback-003**（low）：seg-004 开头需增加过渡句，将‘低起点’与‘如何被看见’的问题连接。责任角色：script-writer。

这些风险不构成 blocker，但建议在后续修订中处理，以提升零背景观众的留存率。