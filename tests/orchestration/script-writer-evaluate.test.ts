import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {
  evaluateScriptWriterDraft,
  parseScriptDraftSegments,
  SCRIPT_DRAFT_REQUIRED_MARKERS,
} from "../../src/orchestration";

const factsJson = `[
  {
    "id": "claim-alpha-001",
    "claim": "Product opens a browser after a task is delegated.",
    "metricName": "",
    "value": "",
    "period": "2024",
    "eventDate": "2024-03-12",
    "sourceIds": ["src-1"],
    "confidence": "high",
    "reportingType": "independently-verified",
    "allowedInNarration": true,
    "notes": ""
  }
]`;

const canonicalDraft = `# Script Draft

状态：\`draft-ready\`

## seg-001

- Section: \`hook\`
- Time range: \`0:00–0:03\`
- Target seconds: \`3\`
- Claim IDs: \`claim-alpha-001\`
- Source identity: 官方演示
- On-screen text: demo
- Scene: hook
- Visual intent: 任务已输入，随后浏览器打开目标页并开始加载。
- Pace switch: none
- Fact boundary: 不宣称成功率。

### Narration

任务交出去，它自己打开浏览器。
`;

const missingSegmentHeadings = `# Script Draft

状态：\`draft-ready\`

任务交出去，它自己打开浏览器。Claim IDs: \`claim-alpha-001\`
`;

const numberedSHeadings = `# Devin 旁白初稿

## 分段脚本

### S1（0:00–0:03）

- 目标时长：3 秒
- Claim ID：claim-alpha-001
- 来源身份：官方演示
- visualIntent：浏览器打开目标页
- 事实边界：不宣称成功率。
- 旁白：任务交出去，它自己打开浏览器。
`;

const segmentTitleHeadings = `# Script Draft

## Segment 1 — Hook：任务交出去，它自己打开浏览器
- **目标时长**：3 秒
- **旁白**：任务交出去，它自己打开浏览器。
- **Claim**：\`claim-alpha-001\`
- **来源身份**：官方演示
- **visualIntent**：浏览器打开目标页
- **事实边界**：不宣称成功率。
`;

const boldChineseLabels = `# Devin 旁白初稿

## Segment 001

**目标时长**：3 秒

**visualIntent**：
1. 任务已输入
2. 浏览器打开目标页

**旁白**：
把任务交出去，它自己打开浏览器。

**Claim ID**：\`claim-alpha-001\`
**来源身份**：官方演示
**事实边界**：不宣称成功率。
`;

describe("script-writer draft markdown contract", () => {
  it("parses the canonical segment template", () => {
    const segments = parseScriptDraftSegments(canonicalDraft);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      id: "seg-001",
      section: "hook",
      targetSeconds: 3,
      claimIds: ["claim-alpha-001"],
      sourceIdentity: "官方演示",
      visualIntent: "任务已输入，随后浏览器打开目标页并开始加载。",
      factBoundary: "不宣称成功率。",
      narration: "任务交出去，它自己打开浏览器。",
    });
    const evaluation = evaluateScriptWriterDraft({markdown: canonicalDraft, factsJson});
    expect(evaluation.schemaValid).toBe(true);
    expect(evaluation.hardFailures).toEqual([]);
    expect(evaluation.claimIds).toEqual(["claim-alpha-001"]);
    expect(evaluation.unsupportedClaimIds).toEqual([]);
  });

  it("fails closed when ## seg-* headings are missing", () => {
    expect(parseScriptDraftSegments(missingSegmentHeadings)).toEqual([]);
    const evaluation = evaluateScriptWriterDraft({
      markdown: missingSegmentHeadings,
      factsJson,
    });
    expect(evaluation.schemaValid).toBe(false);
    expect(evaluation.hardFailures).toEqual(["script-draft-missing-segments"]);
    expect(evaluation.claimIds).toEqual([]);
  });

  it.each([
    ["numbered S-headings", numberedSHeadings],
    ["Segment title headings", segmentTitleHeadings],
    ["bold Chinese labels", boldChineseLabels],
  ])("does not accept %s as parseable segments", (_name, markdown) => {
    expect(parseScriptDraftSegments(markdown)).toEqual([]);
    const evaluation = evaluateScriptWriterDraft({markdown, factsJson});
    expect(evaluation.schemaValid).toBe(false);
    expect(evaluation.hardFailures).toEqual(["script-draft-missing-segments"]);
    expect(evaluation.claimIds).toEqual([]);
  });

  it("keeps the Script Writer prompt aligned with the fail-closed parser", () => {
    const prompt = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../agents/script-writer.md"),
      "utf8",
    );
    for (const marker of SCRIPT_DRAFT_REQUIRED_MARKERS) {
      expect(prompt).toContain(marker);
    }
    expect(prompt).toContain("editorial-policy-v1");
    expect(prompt).toContain("第一段不超过 3 秒");
    expect(prompt).toContain("每句事实旁白绑定 Claim ID");
    expect(prompt).not.toContain("prompts/v4/");
  });

  it("fails closed when draft-ready status is missing", () => {
    const markdown = canonicalDraft.replace("状态：`draft-ready`\n\n", "");
    const evaluation = evaluateScriptWriterDraft({markdown, factsJson});
    expect(evaluation.hardFailures).toContain("script-draft-not-draft-ready");
  });

  it("fails closed when a declared schema field is missing", () => {
    const withoutVisual = canonicalDraft.replace(
      "- Visual intent: 任务已输入，随后浏览器打开目标页并开始加载。\n",
      "",
    );
    const evaluation = evaluateScriptWriterDraft({markdown: withoutVisual, factsJson});
    expect(evaluation.hardFailures).toContain("seg-001:missing-visual-intent");
    expect(evaluation.hardFailures).not.toContain("script-draft-missing-segments");
  });
});
