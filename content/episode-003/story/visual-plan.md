<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v2",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "be058fc23f45374cb53666204cd081ac2f45f6508fccb565eb1bb7588feaa06e",
  "plannedSegments": 6,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Manus Visual Plan

## Visual system

1080×1920 竖屏围绕一条连续的“已发出任务 → 已打开网页”动作组织。任务气泡、浏览器窗、云电脑和批准按钮是重复视觉语汇；每次回看都增加规模、机制或本机控制。合成操作持续标“功能演示”，真实页面保留来源标签。

## Asset summary

使用已登记的 Manus 官网与桌面页截图。任务发送、云电脑、虚拟电脑阵列、文件夹和批准按钮使用 Claim 支持的程序化图形；关键证据位于字幕上方安全区。

## seg-001

- Narrative purpose: 先给完成结果，让零背景观众立即看懂任务已经开始执行。
- Viewer state in: 不认识 Manus，也不知道视频主题。
- Viewer state out: 看懂一句任务已经打开网页。
- New information: 发出任务后，网页会自己打开。
- Scene structure: 第 0 帧已发送任务与已打开浏览器同屏，随后地址栏只加载一次。
- Visual evidence: 持续标“功能演示”，能力来源小字同期出现。
- Animation ideas: 不淡入核心对象，只让加载条动一次后停住。
- Asset requirements: 程序化任务气泡与浏览器窗，无新增外部素材。
- Pacing: 三秒只读一个动作结果。
- Render target: hook-task-open
- Claim IDs: claim-manus-001

## seg-002

- Narrative purpose: 用公司规模放大动作，并提出为什么要自己干活。
- Viewer state in: 看见网页已经打开，还不知道产品尺度。
- Viewer state out: 知道规模很大，并开始问机制。
- New information: 上线以来超过八千万台虚拟电脑。
- Scene structure: 浏览器窗扩成虚拟电脑阵列，公司来源和“不是用户数”同时出现。
- Visual evidence: 公司标签与口径限制同屏，数字不换算用户。
- Animation ideas: 阵列只铺开一次，问题句停下。
- Asset requirements: 程序化数字墙和来源条。
- Pacing: 七秒完成规模和唯一问题，不增加第二个争议。
- Render target: hook-metric-question
- Claim IDs: claim-manus-005

## seg-003

- Narrative purpose: 建立云电脑心智模型，回答产品是什么。
- Viewer state in: 已看见动作和规模，尚未形成产品定义。
- Viewer state out: 知道它在云电脑里打开网页和文件，关掉页面还能跑。
- New information: 通用 AI agent、云端浏览器与文件、任务可继续跑。
- Scene structure: 先切官网真实首页建立产品入口，再回到云电脑里的浏览器和文件夹。
- Visual evidence: 官网截图标注“真实页面截图”和来源；机制图形标功能演示。
- Animation ideas: 官网停稳后，进度条在关掉的标签后仍继续走。
- Asset requirements: 已登记官网截图和程序化云电脑。
- Pacing: 十秒先定义产品，再留下团队选择问题给下一段。
- Render target: hook-cloud-model
- Claim IDs: claim-manus-001, claim-manus-002, claim-manus-003

## seg-004

- Narrative purpose: 把“为什么自己干活”落到团队选择和可见工作台。
- Viewer state in: 已理解云电脑，还不知道这是主动选择。
- Viewer state out: 看见执行引擎对应一台隔离云电脑。
- New information: 每个任务一台隔离环境，内有浏览器、文件和命令行。
- Scene structure: 聊天气泡退到背景，云电脑内部三块区域同时保持轻量运动。
- Visual evidence: 公司定位与沙箱部件分开标注，避免静态功能卡。
- Animation ideas: 浏览器滚动、文件落下、命令行闪一下光标。
- Asset requirements: 程序化云电脑内部件。
- Pacing: 十四秒只解释一个选择，不展开连接器目录。
- Render target: choice-action-engine
- Claim IDs: claim-manus-003, claim-manus-004

## seg-005

- Narrative purpose: 用真实桌面页证明同一套能力进到本机，并留下批准权。
- Viewer state in: 以为执行只发生在云端。
- Viewer state out: 知道桌面版能整理本地文件，但命令先要批准。
- New information: 2026-03-16 桌面发布、本机文件、逐条批准。
- Scene structure: 硬切官方桌面页，再叠加本机文件夹和允许一次按钮。
- Visual evidence: 桌面页标注真实页面截图和来源，批准按钮标官方设计。
- Animation ideas: 真实页面先停稳，批准按钮后亮起。
- Asset requirements: 已登记桌面页截图和程序化批准面板。
- Pacing: 十四秒先给日期和本机动作，最后才出现批准。
- Render target: desktop-approval
- Claim IDs: claim-manus-008, claim-manus-009, claim-manus-010

## seg-006

- Narrative purpose: 用阶段性用户口径回收开场，停在仍在执行的任务。
- Viewer state in: 已理解云电脑和本机批准。
- Viewer state out: 回头看懂开头那个打开网页的动作。
- New information: 公司称全球数百万用户把任务交给它。
- Scene structure: 用户数字收拢回开场任务气泡和仍在加载的网页。
- Visual evidence: 用户数字标公司口径；结尾动作持续标功能演示。
- Animation ideas: 数字落下后不再跳动，浏览器继续缓慢加载。
- Asset requirements: 程序化数字卡与开场同一套任务/网页图形。
- Pacing: 十二秒不追加新机制，停在具体执行动作。
- Render target: ending-still-working
- Claim IDs: claim-manus-007, claim-manus-002, claim-manus-003
