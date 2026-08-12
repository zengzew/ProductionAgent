对照原稿和改写稿评分，不要补写事实。

先应用 system 中的 calibration：局部拗口但不需要听众修复主语或事实口径时，可以在
issues 记录但对应 check 保持 pass；听众必须补主语，或时间或指标口径存在两种读法时，
对应 check 必须 fail，verdict 必须 rewrite。

原稿：
{{ORIGINAL}}

改写稿：
{{CANDIDATE}}

返回以下 JSON。`checks` 的每个 evidence 至少包含一个 segmentId 和具体 observation。

{"scores":{"translationese":0,"spokenChinese":0,"informationFidelity":0},"checks":{"translatedSyntax":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"sourceAttributionLanguage":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"productStageLanguage":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"turnDirection":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"sentenceCadence":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"spokenBreath":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"informationFidelity":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]}},"issues":["具体问题"],"verdict":"pass 或 rewrite"}
