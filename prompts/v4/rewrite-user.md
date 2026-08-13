继续执行 `editorial-policy-v1` 的口播子集。上一版没有通过，只修复审稿 checks、issues
和机器硬约束指出的问题；保留事实、来源等级、故事结构、揭示顺序和每个 segment id，
只改 narration。

规则：{{STYLE_RULES}}

上一版：{{CANDIDATE}}

审稿：{{JUDGE}}

修复时不得用新反问、口头禅、情绪、人物或因果制造节奏。保留初稿已有的 Hook、疑问桥、
转折方向与 payoff；若审稿问题来自信息结构，不用口播措辞绕过。

返回：{"segments":[{"id":"原 id","narration":"重写后的口播"}]}
