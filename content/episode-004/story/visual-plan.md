<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v3",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "9305c55f5a78f84bab55de087c72b6f1dc292b6e35ab7609182d788cf4411218",
  "plannedSegments": 6,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Devin Visual Plan

## Visual system

1080×1920 竖屏以“看得见的自主执行”为证据台：核心镜头来自已准入的官方演示与教程视频（Devin 自带界面里的计划、浏览器、编辑器、终端），逐段通过 M5 管线检索、核验后使用；价格、奔驰与 89% 数字用来源标注的数据卡，不能只贴整屏官网。真实官方视频素材在画面里标注来源（Cognition 官方演示）与“功能演示”；素材未通过核验的段落记录回退原因。旁白说什么，画面就放什么正在发生。

## Asset summary

真实媒体来源：官方演示（Introducing Devin）、官方上手教程（Getting Started）、官方 IDE 视频（Working with Devin in your IDE）、官方客户访谈（Mercedes-Benz）、官方 Upwork 演示与平行 Devin 教程。全部经 media admission/rights 人工批准后入库；每个镜头绑定 claim 与核验记录。程序化素材只用于数字卡与来源标签。

## seg-001

- Narrative purpose: 先给执行中的结果，让零背景观众立即看见任务已经交出去、它自己开始干活。
- Viewer state in: 不认识 Devin，也不知道视频主题。
- Viewer state out: 看懂一句话：任务交出去后，它会自己打开浏览器执行。
- New information: 任务交出去后，Devin 自己开始干活。
- Scene structure: 第 0 帧官方演示画面已在执行中：任务已输入，计划与自带浏览器在工作。
- Visual evidence: 持续标“功能演示”与官方来源，绑定 `claim-devin-001`。
- Animation ideas: 不淡入，直接进入执行画面；浏览器打开的动作保持可见。
- Asset requirements: 已准入的官方演示片段（Introducing Devin 或 Upwork 演示）。
- Pacing: 三秒完成交任务到开始干活的建立。
- Visible action: 任务已交出去，浏览器自己打开并开始加载。
- Evidence type: product-operation
- Focal crop: 官方界面中央的任务与执行区，保留可见的浏览器与进度。
- Visual event: 浏览器打开并出现内容。
- Media preference: 官方演示 real-media；如核验不过则回退程序化演示动作并记录原因。
- Render target: hook-delegated-open
- Claim IDs: claim-devin-001

## seg-002

- Narrative purpose: 用发布身份放大动作，并提出为什么写代码要它自己开浏览器。
- Viewer state in: 看见它自己开始干活，还不知道产品尺度。
- Viewer state out: 知道它是官方称为第一个 AI 软件工程师的产品，并开始问机制。
- New information: 2024 年 3 月发布；官方自我定位。
- Scene structure: 官方演示口播收成身份卡，随后“第一个 AI 软件工程师·官方称”与唯一问题落下。
- Visual evidence: 官方标签与口径限制同屏，日期不提前。
- Animation ideas: 标题卡落下后停住，问题单独出现。
- Asset requirements: 官方演示画面与程序化身份卡。
- Pacing: 七秒完成身份和唯一问题。
- Visible action: 从执行画面切到发布身份卡，再留下问题。
- Evidence type: product-operation
- Focal crop: 官方演示中 Devin 正在工作的界面中央。
- Visual event: 身份卡落下后问题出现。
- Media preference: 官方演示 real-media；回退时用来源标注的身份卡。
- Render target: hook-identity-question
- Claim IDs: claim-devin-002

## seg-003

- Narrative purpose: 建立工具链心智模型，回答“它怎么自己干活”。
- Viewer state in: 已看见动作和身份，尚未理解执行方式。
- Viewer state out: 知道它有浏览器、编辑器和终端，先列计划再执行，每一步看得见。
- New information: 自带工具链与可见步骤。
- Scene structure: 官方演示里计划列表、浏览器、编辑器、终端依次进入画面。
- Visual evidence: 每一步操作持续可见，标“功能演示”。
- Animation ideas: 计划列表先出现，随后浏览器、编辑器、终端依次点亮。
- Asset requirements: 已准入的官方教程与演示片段。
- Pacing: 十秒先定义工具链，再留下团队选择。
- Visible action: 看见计划、浏览器、编辑器和终端同时在动。
- Evidence type: product-operation
- Focal crop: 界面左侧计划列表与中央执行区。
- Visual event: 计划列表出现后工具依次点亮。
- Media preference: 官方教程 real-media；回退时用程序化工具链演示并记录原因。
- Render target: hook-toolchain-visible
- Claim IDs: claim-devin-003, claim-devin-004

## seg-004

- Narrative purpose: 把“为什么这样选”落到价格与并行两个团队决策。
- Viewer state in: 已理解工具链，还不知道获取门槛变化。
- Viewer state out: 知道价格从 500 降到 20 美元，且可以多个 Devin 并行。
- New information: Devin 2.0 的价格与并行能力。
- Scene structure: 执行画面收成价格对比卡，随后平行 Devin 执行画面铺开。
- Visual evidence: 公司披露标签与“Devin 2.0”同屏，数字不换算用户。
- Animation ideas: 500 划掉、20 落下；随后多个 Devin 卡片同时推进。
- Asset requirements: 官方平行 Devin 演示片段与程序化价格卡。
- Pacing: 十四秒只解释一个选择。
- Visible action: 价格从 500 落到 20，随后多个 Devin 并行执行。
- Evidence type: data-graphic
- Focal crop: 价格对比卡与多个 Devin 会话卡片并排的执行画面。
- Visual event: 价格落下后平行卡片推进。
- Media preference: 官方平行 Devin 视频 real-media；回退时用来源标注的价格卡。
- Render target: choice-price-parallel
- Claim IDs: claim-devin-005, claim-devin-006

## seg-005

- Narrative purpose: 用企业与自用证据回答“用户为什么开始接受”。
- Viewer state in: 已理解价格与并行，还不知道企业反应。
- Viewer state out: 知道奔驰把 8 个月压到 8 天，公司 89% 代码由 Devin 提交。
- New information: 奔驰案例与 89% 自用代码。
- Scene structure: 官方客户访谈画面收成案例卡，20 万行 COBOL 与 8 天落下；再切到 89% 自用代码卡。
- Visual evidence: 官方口径与公司自报标签同屏，不换算成功率。
- Animation ideas: 案例数字依次落下后停住。
- Asset requirements: 官方客户访谈片段与程序化案例卡。
- Pacing: 十四秒先给案例，再给自用口径。
- Visible action: 看见奔驰访谈画面，随后 8 个月到 8 天与 89% 落下。
- Evidence type: interview
- Focal crop: 访谈画面中央对谈者与案例卡切换。
- Visual event: 案例数字落下后 89% 出现。
- Media preference: 官方客户访谈 real-media；回退时用来源标注的案例卡。
- Render target: body-acceptance-evidence
- Claim IDs: claim-devin-007, claim-devin-008

## seg-006

- Narrative purpose: 用工程师新角色回收开场，停在仍在执行的任务。
- Viewer state in: 已理解工具链、价格与企业接受。
- Viewer state out: 回头看懂“派活与验收”的开场动作。
- New information: 工程师负责派活与检查结果。
- Scene structure: 官方定位卡落下后，回到开场同一条仍在执行的官方演示任务。
- Visual evidence: 派活与验收标官方定位；结尾动作持续标“功能演示”。
- Animation ideas: 定位卡落下后不再跳动，任务画面继续推进。
- Asset requirements: 开场同一段官方演示素材。
- Pacing: 十二秒不追加新机制，停在具体执行动作。
- Visible action: 派活卡出现后，开场那条任务还在自己往下做。
- Evidence type: product-operation
- Focal crop: 开场同一执行区，保留正在增长的进度。
- Visual event: 派活卡出现后任务继续推进。
- Media preference: 与开场共用官方演示素材，回收同一动作。
- Render target: ending-still-running
- Claim IDs: claim-devin-009, claim-devin-001
