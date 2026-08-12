# Episode 002 Run Report

成片：`output/episode-002/vertical_9x16.mp4`

状态：`delivery-approved`

## 选题

Roost Social：一条消息飞三天，为什么反而让人期待？

## 最终规格

- 1080×1920，9:16
- 30 fps
- H.264 视频，AAC 48 kHz 音频
- 时长 167.233 秒，严格小于 180 秒
- 音频峰值 -1.7 dB
- SHA-256：`30d45b37ab9cedb92922a77bff4a2acaa02c546ab14c840d86e3da84b4169318`

## 真实生产数据

- 12 段旁白
- TTS：Microsoft Edge neural TTS `zh-CN-YunjianNeural`
- MiniMax：因当前环境缺少 `MINIMAX_API_KEY`，按 `config/tts-v2.json` 回退
- Hook 真实结束时间：19.98 秒
- 中文字幕：78 个 cue
- 字幕语义边界问题：0（本轮修复 8 处）
- 小于 1 秒 cue：4 个，占 5.1282%
- 最短 cue：0.551 秒

## 当前产物绑定

- Smoke MP4：`27def221b7e7137cc1a3312b096a209d9d292cf982fb1928a9dbf6c83967c770`
- 竖版 MP4：`30d45b37ab9cedb92922a77bff4a2acaa02c546ab14c840d86e3da84b4169318`
- SRT：`be58d09a21ab011fa385faa8a9008fba21c0042a4901c9bb3872ea3932f9ee10`
- Production timeline：`bfab0e07963a48876abba6f620aae7424fae58e9302541a9dc5be6347ad44059`
- TTS metadata：`f0567f29bde01e7a75596b154728010e4d890b23a2713bba0732ac6d738c9d31`
- Generated captions：`3d06775e960fb984db66b677a57319773a2571c318ee6312da0376147dbe0fef`
- Inspection：`806b580154bd1fcff9cc1f15c44a47d015d47a485e2311e4efedecfc4f7c3911`

## 新版结尾

- 明确总结产品缓解即时回复压力的方式
- 采用 7 月 10 日 ANSA 报道的 30 万注册用户
- 保留 7 月 7 日创始人披露的每天 10 万多个活跃对话
- 将两项指标表述为慢速社交的阶段性市场信号，不扩写成赛道规模
- 最后回到开场那只鸟继续飞向朋友

## 同步事实修正

- 删除旧版“消息不可撤回”的绝对表述
- Pen Pals 改用 8 月 2 日官方 FAQ 的当前流程：自愿加入、双方接受后开启、与朋友列表分开

## 门禁结果

- Research：9 个来源、22 条事实、9 个事件，PASS
- Oral Judge：PASS
- Audience Critic：93 / 100，PASS
- Fact Guardian：PASS
- Smoke render：PASS
- Vertical render：PASS
- Output inspection：PASS
- Delivery Critic：PASS

## 复审证据

- `output/episode-002/evidence/latest-first-frame.png`
- `output/episode-002/evidence/app-store-in-video.png`
- `output/episode-002/evidence/website-in-video.png`
- `output/episode-002/evidence/latest-user-story.png`
- `output/episode-002/evidence/positive-growth.png`
- `output/episode-002/evidence/positive-privacy.png`
- `output/episode-002/evidence/current-pen-pals.png`
- `output/episode-002/evidence/summary-ending-market.png`
- `output/episode-002/evidence/summary-ending-final.png`

## 发布边界

本轮没有上传或发布。发布前仍需人工确认官方页面引用、平台合成语音披露和账号侧
标题、封面选择。
