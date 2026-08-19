import {SCRIPT_DRAFT_REQUIRED_MARKERS} from "../script-writer-evaluate";
import type {RoleModelBenchmarkConfig} from "../../../config/role-model-benchmark";
import type {AutoRepairDiagnosis} from "../../../schemas/role-model-auto";
import {readAutoRepositoryFile, writeAutoRepositoryFile} from "./paths";
import {promptDeclaresScriptDraftTemplate} from "./taxonomy";

export const SCRIPT_DRAFT_OUTPUT_FORMAT_SECTION = `## 输出格式

\`story/script-draft.md\` 必须使用下面的最小 Markdown 模板。这是机器解析契约，不是文风
建议。每个 segment 的标题必须是单独一行的 \`## seg-xxx\`；字段名必须原样使用英文。
禁止写成 \`## Segment\`、\`### S1\`、\`**旁白**\` 或其他变体。解析器不会猜测同义格式。

每个 segment 必须使用：

\`\`\`markdown
## seg-001

- Section: \`hook\`
- Target seconds: \`3\`
- Claim IDs: \`claim-example-001\`
- Source identity: 官方演示
- Visual intent: 任务已输入，随后浏览器打开目标页并开始加载。
- Fact boundary: 不宣称成功率。

### Narration

任务交出去，它自己打开浏览器。
\`\`\`
`;

export type CatalogRepairResult = {
  applied: boolean;
  sharedInputChanged: boolean;
  files: string[];
  detail: string;
};

export const applyCatalogRepair = (input: {
  repoRoot: string;
  diagnosis: AutoRepairDiagnosis;
  promptPath: string;
  config: RoleModelBenchmarkConfig;
}): CatalogRepairResult => {
  if (input.diagnosis.target === "artifact-output-contract") {
    const current = readAutoRepositoryFile(input.repoRoot, input.promptPath);
    if (promptDeclaresScriptDraftTemplate(current)) {
      return {
        applied: false,
        sharedInputChanged: false,
        files: [],
        detail: "script-draft template already declared",
      };
    }
    const next = current.trimEnd().concat("\n\n", SCRIPT_DRAFT_OUTPUT_FORMAT_SECTION);
    for (const marker of SCRIPT_DRAFT_REQUIRED_MARKERS) {
      if (!next.includes(marker)) {
        throw new Error(`catalog repair missing required marker: ${marker}`);
      }
    }
    writeAutoRepositoryFile(input.repoRoot, input.promptPath, next);
    return {
      applied: true,
      sharedInputChanged: true,
      files: [input.promptPath],
      detail: `declared script-draft template in ${input.promptPath}`,
    };
  }

  if (input.diagnosis.code === "transport-timeout") {
    let changed = false;
    for (const policy of Object.values(input.config.candidates)) {
      if (policy.timeoutMs < 300_000) {
        policy.timeoutMs = 300_000;
        changed = true;
      }
      if (policy.maxRetries > 0) {
        policy.maxRetries = 0;
        changed = true;
      }
    }
    return {
      applied: changed,
      sharedInputChanged: false,
      files: changed ? ["config/role-model-benchmark.json"] : [],
      detail: changed
        ? "raised candidate timeout to 300000ms and disabled retries"
        : "timeout already bounded",
    };
  }

  return {
    applied: false,
    sharedInputChanged: false,
    files: [],
    detail: `no catalog patch for ${input.diagnosis.code}`,
  };
};
