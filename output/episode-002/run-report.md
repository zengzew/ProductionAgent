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
- SHA-256：`3edbabc411fc70042c8fec54ab0098765b0ffee09586c25605bba7cd6fb96854`

## 真实生产数据

- 12 段旁白
- TTS：Microsoft Edge neural TTS `zh-CN-YunjianNeural`
- MiniMax：因当前环境缺少 `MINIMAX_API_KEY`，按 `config/tts-v2.json` 回退
- Hook 真实结束时间：19.98 秒
- 中文字幕：87 个 cue
- 小于 1 秒 cue：6 个，占 6.8966%
- 最短 cue：0.551 秒

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

- `output/episode-002/evidence/current-pen-pals.png`
- `output/episode-002/evidence/summary-ending-start.png`
- `output/episode-002/evidence/summary-ending-market.png`
- `output/episode-002/evidence/summary-ending-final.png`

## 发布边界

本轮没有上传或发布。发布前仍需人工确认官方页面引用、平台合成语音披露和账号侧
标题、封面选择。
