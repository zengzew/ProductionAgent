对照原稿和改写稿评分，不要补写事实。

原稿：
{{ORIGINAL}}

改写稿：
{{CANDIDATE}}

返回以下 JSON。`checks` 的每个 evidence 至少包含一个 segmentId 和具体 observation。

{"scores":{"translationese":0,"spokenChinese":0,"informationFidelity":0},"checks":{"translatedSyntax":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"sourceAttributionLanguage":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"productStageLanguage":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"turnDirection":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"sentenceCadence":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"spokenBreath":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]},"informationFidelity":{"result":"pass 或 fail","evidence":[{"segmentId":"seg-001","observation":"具体观察"}]}},"issues":["具体问题"],"verdict":"pass 或 rewrite"}
