<!-- visual-plan-gate
{
  "rubricVersion": "visual-plan-v3",
  "reviewedFile": "story/final-script.md",
  "reviewedSha256": "3f97518104c8c7f743104c4274864fa47fddbb8baf74e6c3a6d44271ed35d9ce",
  "plannedSegments": 6,
  "unresolvedAssets": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Suno Visual Plan

## Visual system

1080×1920 竖屏用官网创作者视频开场，中段优先真实做歌画面，Discord、Copilot 和资本市场用带来源的裁切页或数据卡。结尾停在估值数字，不回看开场歌词。

## Asset summary

已准入：Miles 小孩用 Suno、Timbaland 创作者视频。补官网创作入口、新闻标题页作获客与定价证据。没有匹配画面时回退数据卡并记录原因。

## seg-001

- Narrative purpose: 先给完成结果。
- Viewer state in: 不认识 Suno。
- Viewer state out: 看懂一句歌词能生成一首带人声的歌。
- New information: 输入歌词后生成带人声的完整歌曲。
- Scene structure: 第 0 帧已有创作动作，歌曲出现。
- Visual evidence: 持续标“功能演示”。
- Animation ideas: 不淡入。
- Asset requirements: 官方 CDN 用户创作视频。
- Pacing: 三秒完成输入到生成。
- Visible action: 歌词写入后生成按钮点亮，波形出现。
- Evidence type: product-operation
- Focal crop: 输入框与生成后的歌曲。
- Visual event: 生成按钮点亮后波形出现。
- Media preference: 官方 CDN 用户创作视频。
- Render target: hook-lyrics-to-song
- Claim IDs: claim-suno-001

## seg-002

- Narrative purpose: 把作品接到创作需求。
- Viewer state in: 看见一首歌已生成。
- Viewer state out: 知道创始人要让人来做，九成用户在创作。
- New information: 音乐人身份与九成创作。
- Scene structure: 真实创作者做歌画面上叠出九成进度条。
- Visual evidence: 九成标创始人访谈。
- Animation ideas: 进度条铺开一次。
- Asset requirements: Timbaland 或 Miles 创作视频。
- Pacing: 八秒完成需求。
- Visible action: 创作者画面上，九成进度条铺开。
- Evidence type: product-operation
- Focal crop: 正在做歌的人和进度条。
- Visual event: 进度条铺开后九成数字落下。
- Media preference: 已准入创作者视频。
- Render target: hook-founder-need
- Claim IDs: claim-suno-002, claim-suno-003, claim-suno-011

## seg-003

- Narrative purpose: 用早期限制打开市场定价问题。
- Viewer state in: 已理解创作需求。
- Viewer state out: 知道他们起初做不长，并开始问市场给了什么价。
- New information: 先做听懂声音，早期十几秒。
- Scene structure: 短波形两次对不上歌词，问题落下。
- Visual evidence: 标创始人访谈口径。
- Animation ideas: 短波形中断再试。
- Asset requirements: 程序化短波形。
- Pacing: 九秒完成限制和问题。
- Visible action: 短波形中断后问题出现。
- Evidence type: programmatic-action
- Focal crop: 短波形与问题。
- Visual event: 波形中断后问题落下。
- Media preference: 无匹配实拍，使用程序化短波形。
- Render target: hook-early-limit
- Claim IDs: claim-suno-017, claim-suno-018

## seg-004

- Narrative purpose: 用 Discord 机器人回答冷启动。
- Viewer state in: 知道早期做不长。
- Viewer state out: 看见他们把机器人放到 Discord 里试。
- New information: Midjourney 式 Discord 机器人。
- Scene structure: 机器人消息一条条冒出，有人点生成。
- Visual evidence: 标创始人访谈口径。
- Animation ideas: 消息上冒，生成按钮亮。
- Asset requirements: 程序化 Discord 动作。
- Pacing: 十四秒只讲冷启动。
- Visible action: 机器人消息出现后，有人点生成。
- Evidence type: programmatic-action
- Focal crop: 机器人消息与生成按钮。
- Visual event: 机器人消息出现后，有人点击生成。
- Media preference: 无官方 Discord 录屏，使用程序化动作。
- Render target: choice-discord-cold-start
- Claim IDs: claim-suno-019

## seg-005

- Narrative purpose: 把冷启动接到更大的获客动作。
- Viewer state in: 已看见 Discord 试探。
- Viewer state out: 知道正式开放、进了 Copilot、免费四分钟。
- New information: Copilot 与免费四分钟。
- Scene structure: Copilot 入口和免费四分钟按钮依次点亮。
- Visual evidence: 官方节点标签。
- Animation ideas: 按钮后亮。
- Asset requirements: 官网或程序化入口。
- Pacing: 十二秒完成获客。
- Visible action: Copilot 入口出现后，免费四分钟按钮点亮。
- Evidence type: programmatic-action
- Focal crop: Copilot 与四分钟按钮。
- Visual event: 入口出现后按钮点亮。
- Media preference: 优先官网截图，否则程序化入口。
- Render target: body-open-copilot
- Claim IDs: claim-suno-005, claim-suno-006

## seg-006

- Narrative purpose: 用资本市场证据回答开场问题。
- Viewer state in: 已理解需求和获客。
- Viewer state out: 知道付费翻倍、ARR 到 3 亿、融资 3.75 亿、估值 24.5 亿。
- New information: 付费、ARR、融资、估值。
- Scene structure: 四个数字依次落下，来源条同期出现，停在估值。
- Visual evidence: 公司/媒体口径标签。
- Animation ideas: 数字逐个落下后停住。
- Asset requirements: 新闻标题或数据卡。
- Pacing: 十四秒只回答定价。
- Visible action: ARR 落下后，估值最后停住。
- Evidence type: data-graphic
- Focal crop: ARR 与估值两个数字。
- Visual event: 付费、ARR、融资、估值依次出现。
- Media preference: 优先 36氪/华尔街见闻标题截图，否则数据卡。
- Render target: ending-market-price
- Claim IDs: claim-suno-008, claim-suno-009, claim-suno-010
