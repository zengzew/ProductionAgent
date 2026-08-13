执行 `editorial-policy-v1` 的口播子集。只改下面脚本的 narration，保留每个 id、事实边界
和原有揭示顺序。

风格规则：
{{STYLE_RULES}}

人工认可样本：
{{FEW_SHOTS}}

信息初稿：
{{SCRIPT}}

改写时检查：Hook 是否仍先落动作或结果；疑问是否在后文有答案；转折是否保留原方向；
payoff 是否仍由前文事实推出。不要照抄样本措辞，也不要新增悬念或反转。

返回：{"segments":[{"id":"原 id","narration":"改写后的口播"}]}
