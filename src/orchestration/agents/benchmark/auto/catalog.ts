import fs from "node:fs";
import path from "node:path";
import {SCRIPT_DRAFT_REQUIRED_MARKERS} from "../script-writer-evaluate";
import type {RoleModelBenchmarkConfig} from "../../../config/role-model-benchmark";
import {stableJson} from "../../../stable-json";
import type {AutoRepairDiagnosis} from "../../../schemas/role-model-auto";
import type {StagedRepairPatch} from "./executor";
import {readAutoRepositoryFile} from "./paths";
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

export type CatalogRepairPlan = {
  applied: boolean;
  sharedInputChanged: boolean;
  runtimeOverride: boolean;
  files: Array<{path: string; content: string}>;
  detail: string;
};

const boundTimeoutConfig = (config: RoleModelBenchmarkConfig): boolean => {
  let changed = false;
  for (const policy of Object.values(config.candidates)) {
    if (policy.timeoutMs < 300_000) {
      policy.timeoutMs = 300_000;
      changed = true;
    }
    if (policy.maxRetries > 0) {
      policy.maxRetries = 0;
      changed = true;
    }
  }
  return changed;
};

export const planCatalogRepair = (input: {
  repoRoot: string;
  diagnosis: AutoRepairDiagnosis;
  promptPath: string;
  config: RoleModelBenchmarkConfig;
}): CatalogRepairPlan => {
  if (input.diagnosis.target === "artifact-output-contract") {
    const current = readAutoRepositoryFile(input.repoRoot, input.promptPath);
    if (promptDeclaresScriptDraftTemplate(current)) {
      return {
        applied: false,
        sharedInputChanged: false,
        runtimeOverride: false,
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
    return {
      applied: true,
      sharedInputChanged: true,
      runtimeOverride: false,
      files: [{path: input.promptPath, content: next.endsWith("\n") ? next : `${next}\n`}],
      detail: `declared script-draft template in ${input.promptPath}`,
    };
  }

  if (input.diagnosis.code === "transport-timeout") {
    const changed = boundTimeoutConfig(input.config);
    if (!changed) {
      return {
        applied: false,
        sharedInputChanged: false,
        runtimeOverride: false,
        files: [],
        detail: "timeout already bounded",
      };
    }
    const relative = "config/role-model-benchmark.json";
    const absolute = path.join(input.repoRoot, relative);
    if (!fs.existsSync(absolute)) {
      return {
        applied: true,
        sharedInputChanged: false,
        runtimeOverride: true,
        files: [],
        detail: "raised timeout in memory only; marked runtimeOverride",
      };
    }
    const file = JSON.parse(fs.readFileSync(absolute, "utf8")) as {
      candidates?: Record<string, {timeoutMs?: number; maxRetries?: number}>;
    };
    for (const policy of Object.values(file.candidates ?? {})) {
      policy.timeoutMs = 300_000;
      policy.maxRetries = 0;
    }
    return {
      applied: true,
      sharedInputChanged: false,
      runtimeOverride: false,
      files: [{path: relative, content: `${stableJson(file)}\n`}],
      detail: "atomically writing config/role-model-benchmark.json timeout bound",
    };
  }

  return {
    applied: false,
    sharedInputChanged: false,
    runtimeOverride: false,
    files: [],
    detail: `no catalog patch for ${input.diagnosis.code}`,
  };
};

export const writeCatalogPlanToStaging = (
  stagingRoot: string,
  plan: CatalogRepairPlan,
): StagedRepairPatch => {
  for (const file of plan.files) {
    const destination = path.join(stagingRoot, file.path);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, file.content);
  }
  return {files: plan.files, detail: plan.detail};
};
