# Editorial Policy

- Policy: `editorial-policy-v1`
- Decision: `goal-3-2-prompt-integration-2026-08-13`
- Canonical record: `editorial-calibration/policies/prompt-editorial-policy-v1.json`

Goal 3.2 将人工确认的多模态 findings 蒸馏为角色专属编辑规则。它不把仍在 intake 的第三方
样本升级为数据集，也不在运行时把参考视频、完整 transcript 或全部案例上下文注入 Agent。

## 角色整合

| 角色             | 整合模式                                                             |
| ---------------- | -------------------------------------------------------------------- |
| Story Director   | 悬念—转折—解法—兑现；先交互后抽象；需求—产品—获客—市场定价；回看开场可选 |
| Viral Director   | 结果与同期证明；逐段疑问桥；命题匹配的视觉证据；资本市场或动作 payoff   |
| Script Writer    | 有来源的叙事起伏；可回答的段落桥；用户动作优先；需求/获客/定价链         |
| Oral Rewriter    | 保留 Hook、疑问、转折和 payoff 的文字节奏；不模仿未听辨的声音表现    |
| Visual Director  | 采访、产品实演、需求、分发与结果素材各司其职；说到动作必须看到动作   |
| Audience Critic  | 只用结果—需求—产品—分发—兑现证据链澄清现有评分，不改阈值             |
| Retention Critic | 只用跨样本的悬念、推进、视觉密度和 payoff 证据澄清现有窗口，不改阈值 |
| Oral Judge       | 不变：缺少人工听感和带分数边界的批准 calibration 样本                |

## 永久边界

- 所有事实、来源等级、指标、时间和因果仍由 Claim 与 Fact Guardian 硬门控制。
- 评论、采访、渠道事件、经营数字和视觉反应不能自动证明市场规模、产品效果或增长原因。
- 画面密度按新增信息和证据功能判断，不按硬切、动画或素材数量判断。
- 不迁移创作者原句、产品专属事实、完整 transcript、音乐/音效推断、泛化财富 CTA 或长
  参考的晚揭示时间。
- 不修改 validator、artifact contract、M1/M2、episode artifacts，也不开始 M3。
