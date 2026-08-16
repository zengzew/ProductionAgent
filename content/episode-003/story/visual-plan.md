<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v3",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "20dc63873f536fbc1eeb7833f0bce08afe4bf17e69988052f6e7b5cb76bd3cd8",
  "plannedSegments": 6,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Manus Visual Plan

## Visual system

1080×1920 竖屏用可变证据台，而不是 47 秒同一张官网。开场必须看见任务发出后浏览器自己打开目标页并抓取内容；规模用数字墙，产品定义才裁切官网输入框，选择段看云电脑内部运动，桌面段看标题裁切和批准按钮，结尾回到开场那条仍在工作的任务页。常驻标题可以缩小，但不能锁死中部证据。合成动作标“功能演示”，真实页面只以裁切后的焦点出现。

## Asset summary

官网截图只用于任务输入框和桌面标题的焦点裁切。任务执行过程、虚拟电脑墙、云电脑内部件和批准按钮使用 Claim 支持的程序化动作。未准入真实操作录屏，回退原因写入各段 Media preference。

## seg-001

- Narrative purpose: 先给完成结果，让零背景观众立即看见任务已经开始执行。
- Viewer state in: 不认识 Manus，也不知道视频主题。
- Viewer state out: 看懂一句任务已经打开网页并开始办事。
- New information: 发出任务后，网页会自己打开并工作。
- Scene structure: 第 0 帧任务已发出，浏览器地址栏写入目标并加载出内容块。
- Visual evidence: 持续标“功能演示”，来源小字同期出现。
- Animation ideas: 地址栏写入、内容块逐条出现，不用淡入。
- Asset requirements: 程序化工作中的浏览器与任务气泡，不使用官网首页作唯一画面。
- Pacing: 三秒完成发出到开始抓取。
- Visible action: 任务气泡已在画面上，随后浏览器打开目标页并开始出现摘要块。
- Evidence type: programmatic-action
- Focal crop: 地址栏与正在填充的页面内容，不是品牌首页。
- Visual event: 地址栏写入后内容块逐条出现。
- Media preference: 需要真实操作录屏；当前回退为功能演示的程序化动作，因为尚未准入可渲染 clip。
- Render target: hook-task-open
- Claim IDs: claim-manus-001

## seg-002

- Narrative purpose: 用公司规模放大动作，并提出为什么要自己干活。
- Viewer state in: 看见网页已经打开，还不知道产品尺度。
- Viewer state out: 知道规模很大，并开始问机制。
- New information: 上线以来超过八千万台虚拟电脑。
- Scene structure: 工作中的浏览器收成数据墙，公司来源和“不是用户数”同时压上。
- Visual evidence: 公司标签与口径限制同屏，数字不换算用户。
- Animation ideas: 阵列铺开一次，数字落下后停住。
- Asset requirements: 程序化数字墙和来源条。
- Pacing: 七秒完成规模和唯一问题。
- Visible action: 工作页收成虚拟电脑格子，随后金色八千万落下。
- Evidence type: data-graphic
- Focal crop: 八千万数字与“不是用户数”限制条。
- Visual event: 格子铺开后数字高亮落下。
- Media preference: 没有独立审计画面，使用公司口径数据图形。
- Render target: hook-metric-question
- Claim IDs: claim-manus-005

## seg-003

- Narrative purpose: 建立云电脑心智模型，回答产品是什么。
- Viewer state in: 已看见动作和规模，尚未形成产品定义。
- Viewer state out: 知道它在云电脑里打开网页和文件，关掉页面还能跑。
- New information: 通用 AI agent、云端浏览器与文件、任务可继续跑。
- Scene structure: 先裁切官网任务输入框，再回到云电脑里仍在动的浏览器和文件。
- Visual evidence: 官网输入框标真实页面截图；内部运动标功能演示。
- Animation ideas: 输入框停稳后，进度条在关掉的标签后仍继续走。
- Asset requirements: 已登记官网截图的输入框裁切和程序化云电脑。
- Pacing: 十秒先定义产品，再留下团队选择。
- Visible action: 看见任务输入框，随后浏览器、文件和进度条同时运动。
- Evidence type: official-ui-crop
- Focal crop: “What can I do for you?” 输入框，去掉整页白边和独立化横幅。
- Visual event: 硬切到输入框后，进度条继续加载。
- Media preference: 官网 UI 裁切；完整操作录屏仍未准入。
- Render target: hook-cloud-model
- Claim IDs: claim-manus-001, claim-manus-002, claim-manus-003

## seg-004

- Narrative purpose: 把“为什么自己干活”落到团队选择和可见工作台。
- Viewer state in: 已理解云电脑，还不知道这是主动选择。
- Viewer state out: 看见执行引擎对应一台隔离云电脑。
- New information: 每个任务一台隔离环境，内有浏览器、文件和命令行。
- Scene structure: 聊天气泡退到背景，云电脑内部用滚动页面、落下文件和闪动光标同时运动。
- Visual evidence: 公司定位与沙箱部件分开标注，避免静态功能卡。
- Animation ideas: 页面滚动、文件落下、命令行光标闪动。
- Asset requirements: 程序化云电脑内部件。
- Pacing: 十四秒只解释一个选择。
- Visible action: 聊天气泡让位，随后同一台云电脑里三种工具同时在动。
- Evidence type: programmatic-action
- Focal crop: 云电脑内部浏览器内容区、文件名和命令行光标。
- Visual event: 文件落下后光标闪动。
- Media preference: 需要沙箱操作录屏；当前回退为功能演示。
- Render target: choice-action-engine
- Claim IDs: claim-manus-003, claim-manus-004

## seg-005

- Narrative purpose: 用真实桌面页证明同一套能力进到本机，并留下批准权。
- Viewer state in: 以为执行只发生在云端。
- Viewer state out: 知道桌面版能整理本地文件，但命令先要批准。
- New information: 2026-03-16 桌面发布、本机文件、逐条批准。
- Scene structure: 硬切桌面标题裁切，再叠加本机命令和允许一次按钮。
- Visual evidence: 标题裁切标真实页面截图，批准按钮标官方设计。
- Animation ideas: 标题先停稳，批准按钮后亮起。
- Asset requirements: 已登记桌面页的标题裁切和程序化批准面板。
- Pacing: 十四秒先给日期和本机动作，最后才出现批准。
- Visible action: 看见“lives on your computer”，随后命令弹出并点亮允许一次。
- Evidence type: official-ui-crop
- Focal crop: 桌面页主标题和双平台按钮，去掉大面积空白。
- Visual event: 硬切标题后批准按钮点亮。
- Media preference: 官网桌面页裁切；本机真实操作录屏未准入。
- Render target: desktop-approval
- Claim IDs: claim-manus-008, claim-manus-009, claim-manus-010

## seg-006

- Narrative purpose: 用阶段性用户口径回收开场，停在仍在执行的任务。
- Viewer state in: 已理解云电脑和本机批准。
- Viewer state out: 回头看懂开头那个打开网页的动作。
- New information: 公司称全球数百万用户把任务交给它。
- Scene structure: 数百万用户叠在开场同一条仍在抓取内容的任务页上。
- Visual evidence: 用户数字标公司口径；结尾动作持续标功能演示。
- Animation ideas: 数字落下后不再跳动，页面继续出现新内容块。
- Asset requirements: 开场同一套程序化任务页。
- Pacing: 十二秒不追加新机制，停在具体执行动作。
- Visible action: 数百万用户出现后，开场那条任务页仍在往下加载。
- Evidence type: programmatic-action
- Focal crop: 开场同一地址栏和仍在增加的内容块。
- Visual event: 数字出现后内容块继续增加。
- Media preference: 与开场共用功能演示任务页，回收同一动作。
- Render target: ending-still-working
- Claim IDs: claim-manus-007, claim-manus-002, claim-manus-003
