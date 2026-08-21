import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {evaluateRoleBenchmarkOutput} from "../../src/orchestration";
import {evaluateScriptWriterDraft} from "../../src/orchestration/agents/benchmark/script-writer-evaluate";
import type {AgentExecutionRequest, AgentName} from "../../src/orchestration/schemas/agent";
import type {ArtifactRef} from "../../src/orchestration/schemas/artifact";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const sha = (value: string): string => value.repeat(64).slice(0, 64);

const factsJson = `[
  {"id": "claim-devin-001", "claim": "Devin opens a browser after a task is delegated.", "metricName": "", "value": "", "period": "2025", "eventDate": "2025-01-01", "sourceIds": ["src-1"], "confidence": "high", "reportingType": "independently-verified", "allowedInNarration": true, "notes": ""},
  {"id": "claim-devin-009", "claim": "Founders want the agent to finish engineering work.", "metricName": "", "value": "", "period": "2025", "eventDate": "2025-01-01", "sourceIds": ["src-1"], "confidence": "high", "reportingType": "founder-reported", "allowedInNarration": true, "notes": ""},
  {"id": "claim-devin-010", "claim": "SWE-bench 13.86% benchmark result.", "metricName": "", "value": "", "period": "2025", "eventDate": "2025-01-01", "sourceIds": ["src-1"], "confidence": "high", "reportingType": "company-reported", "allowedInNarration": false, "notes": ""},
  {"id": "claim-devin-011", "claim": "PR merge rate 34% to 67% and 4x solve speed.", "metricName": "", "value": "", "period": "2025", "eventDate": "2025-01-01", "sourceIds": ["src-1"], "confidence": "high", "reportingType": "company-reported", "allowedInNarration": false, "notes": ""},
  {"id": "claim-devin-016", "claim": "Valued at $2.5B with $1B+ raised.", "metricName": "", "value": "", "period": "2025", "eventDate": "2025-01-01", "sourceIds": ["src-1"], "confidence": "high", "reportingType": "company-reported", "allowedInNarration": true, "notes": ""}
]`;

const emptyRequest = (agentName: AgentName): AgentExecutionRequest => ({
  contractVersion: "agent-execution-v1",
  executionId: `bench-episode-test-${agentName}`,
  episodeId: "episode-test",
  agentName,
  attempt: 1,
  revisionRound: 0,
  promptRef: {
    artifactId: "episode-test:prompt:test",
    episodeId: "episode-test",
    path: `content/episode-test/prompts/${agentName}.md`,
    mediaType: "text/markdown",
    schemaVersion: "prompt-v1",
    producer: "benchmark-fixture",
    createdAt: "2026-08-21T00:00:00.000Z",
    revision: 1,
    sizeBytes: 10,
    sha256: sha("a"),
  },
  inputArtifacts: [
    {
      artifactId: "episode-test:research:facts",
      episodeId: "episode-test",
      path: "content/episode-test/research/facts.json",
      mediaType: "application/json",
      schemaVersion: "facts-v1",
      producer: "benchmark-fixture",
      createdAt: "2026-08-21T00:00:00.000Z",
      revision: 1,
      sizeBytes: 10,
      sha256: sha("b"),
    },
  ],
  upstreamGateRefs: [],
  expectedOutputs: [
    {
      artifactId: "episode-test:story:test-output",
      path: "content/episode-test/story/test.md",
      schemaVersion: "test-v1",
    },
  ],
  revisionBudgetRemaining: 0,
});

const artifactsFor = (content: string, suffix = "/story/test.md"): ArtifactRef[] => [
  {
    artifactId: "episode-test:story:test-output",
    episodeId: "episode-test",
    path: `content/episode-test${suffix}`,
    mediaType: "text/markdown",
    schemaVersion: "test-v1",
    producer: "candidate",
    createdAt: "2026-08-21T00:00:00.000Z",
    revision: 1,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    sha256: sha("c"),
  },
];

const outputSuffixByRole: Partial<Record<AgentName, string>> = {
  "story-director": "/story/director-brief.md",
  "viral-director": "/story/viral-strategy.md",
  "script-writer": "/story/script-draft.md",
  "oral-rewriter": "/story/final-script.md",
  "fact-guardian": "/story/fact-check-report.md",
  "research-analyst": "/research/facts.json",
};

const evaluate = (input: {
  role: AgentName;
  output: string;
  facts?: string;
  suffix?: string;
}) => {
  const suffix = input.suffix ?? outputSuffixByRole[input.role] ?? "/story/test.md";
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-role-aware-"));
  temporaryDirectories.push(repoRoot);
  const repositoryPath = `content/episode-test${suffix}`;
  fs.mkdirSync(path.dirname(path.join(repoRoot, repositoryPath)), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, repositoryPath), input.output);
  return evaluateRoleBenchmarkOutput({
    repoRoot,
    request: {
      ...emptyRequest(input.role),
      expectedOutputs: [
        {
          artifactId: "episode-test:story:test-output",
          path: repositoryPath,
          schemaVersion: "test-v1",
        },
      ],
    },
    outputArtifacts: artifactsFor(input.output, suffix),
    status: "SUCCEEDED",
    factsJson: input.facts ?? factsJson,
  });
};

const directorBrief = (overrides: {
  factBoundary?: string;
  beatClaimIds?: string[][];
  body?: string;
}): string => {
  const beats = (overrides.beatClaimIds ?? [
    ["claim-devin-001"],
    ["claim-devin-009"],
    ["claim-devin-016"],
  ]).map((claimIds, index) => ({
    beatId: `beat-0${index + 1}`,
    viewerState: `viewer state ${index + 1}`,
    storyMove: `story move ${index + 1}`,
    targetRange: `0:0${index}-0:0${index + 1}`,
    claimIds,
  }));
  const gate = {
    rubricVersion: "director-brief-v1",
    reviewedFiles: {
      factsSha256: sha("f"),
      sourcesSha256: sha("a"),
      timelineSha256: sha("b"),
    },
    coreStoryQuestion: "怎么让第一批人用起来",
    audiencePromise: "看见需求与获客",
    sourcedAnswer: "官方演示与融资口径",
    factBoundary: overrides.factBoundary ?? "融资估值保留媒体口径",
    emotionalArc: beats,
    revealOrder: [1, 2, 3].map((order) => ({
      order,
      reveal: `reveal ${order}`,
      withheldAnswer: `withheld ${order}`,
      purpose: `purpose ${order}`,
    })),
    blockers: [],
    verdict: "READY",
    returnTo: "none",
  };
  return `# Director Brief

<!-- director-brief-gate
${JSON.stringify(gate)}
-->

${overrides.body ?? ""}
`;
};

describe("role-aware claim boundary", () => {
  it("A: story-director factBoundary naming a forbidden claim is not unsupported", () => {
    const evaluation = evaluate({
      role: "story-director",
      output: directorBrief({
        factBoundary: "claim-devin-010 不进入旁白；claim-devin-011 仅作研究背景",
        body: "- **禁止入旁白**: SWE-bench 13.86%（claim-devin-010）、PR 合并率（claim-devin-011）",
      }),
    });
    expect(evaluation.hardFailures).toEqual([]);
    expect(evaluation.unsupportedClaimIds).toEqual([]);
    expect(evaluation.claimIds).toEqual([
      "claim-devin-001",
      "claim-devin-009",
      "claim-devin-016",
    ]);
    expect(evaluation.claimCoverage).toBe(3 / 3);
  });

  it("B: story-director emotionalArc.claimIds using a forbidden claim fails", () => {
    const evaluation = evaluate({
      role: "story-director",
      output: directorBrief({beatClaimIds: [["claim-devin-010"], ["claim-devin-001"], ["claim-devin-016"]]}),
    });
    expect(evaluation.hardFailures).toContain("unsupported-claim:claim-devin-010");
    expect(evaluation.unsupportedClaimIds).toEqual(["claim-devin-010"]);
    expect(evaluation.hardFailures).not.toContain("unsupported-claim:claim-devin-001");
  });

  it("C: fact-guardian citing a forbidden claim in a rejection is not unsupported", () => {
    const gate = {
      rubricVersion: "fact-guardian-v1",
      reviewedFile: "story/final-script.md",
      reviewedSha256: sha("a"),
      checkedSegments: 2,
      checkedNarrationUnits: 3,
      blockers: ["claim-devin-010 被旁白引用，必须移出"],
      verdict: "REJECT",
      returnTo: "oral-rewriter",
    };
    const evaluation = evaluate({
      role: "fact-guardian",
      output: `<!-- fact-check-gate
${JSON.stringify(gate)}
-->

# Fact Guardian Report

结论：**REJECT**

- 旁白单元引用了 claim-devin-010（SWE-bench 13.86%），该 Claim 禁止进入旁白，必须删除。
`,
    });
    expect(evaluation.hardFailures).toContain("fact-check-not-pass");
    expect(evaluation.hardFailures.some((item) => item.startsWith("unsupported-claim:"))).toBe(
      false,
    );
    expect(evaluation.unsupportedClaimIds).toEqual([]);
    expect(evaluation.claimIds).toEqual([]);
  });

  it("D: oral-rewriter narration using a forbidden claim fails", () => {
    const script = `# Final Script

状态：\`story-approved\`
选中 Hook：\`task-delegated-browser-open\`

## seg-001

- Section: \`hook\`
- Time range: \`0:00–0:03\`
- Target seconds: \`3\`
- Claim IDs: \`claim-devin-001\`
- Source identity: 官方演示
- On-screen text: \`它自己打开浏览器\`
- Scene: \`hook-delegated-open\`
- Visual intent: 官方演示进行中
- Pace switch: 无淡入
- Fact boundary: 不宣称执行成功率

### Narration

任务交出去，它自己打开浏览器，开始干活。

### Narration units

| Text | Mode | Claim IDs | Attribution |
| ---- | ---- | --------- | ----------- |
| 任务交出去，它自己打开浏览器，开始干活。 | demonstration | claim-devin-001 | 官方演示；标功能演示 |
| SWE-bench 13.86%。 | company | claim-devin-011 | 官方基准 |
`;
    const evaluation = evaluate({
      role: "oral-rewriter",
      output: script,
    });
    expect(evaluation.hardFailures).toContain("unsupported-claim:claim-devin-011");
    expect(evaluation.unsupportedClaimIds).toEqual(["claim-devin-011"]);
    expect(evaluation.claimIds).toEqual(["claim-devin-001", "claim-devin-011"]);
  });

  it("viral-director gate claimIds using a forbidden claim fails", () => {
    const gate = {
      rubricVersion: "viral-strategy-v2",
      reviewedFiles: {
        storyBibleSha256: sha("1"),
        storyAngleSha256: sha("2"),
        threeActStructureSha256: sha("3"),
        hookCandidatesSha256: sha("4"),
        directorBriefSha256: sha("5"),
      },
      selectedHookHeading: "任务交出去，它自己打开浏览器",
      claimIds: ["claim-devin-001", "claim-devin-010"],
      scores: {openingHook: 4, curiosityGap: 4, emotionalTension: 4, informationRevealOrder: 4, endingPayoff: 4},
      total: 20,
      threshold: 20,
      blockers: [],
      verdict: "READY",
      returnTo: "none",
    };
    const evaluation = evaluate({
      role: "viral-director",
      output: `# Viral Strategy

<!-- viral-strategy-gate
${JSON.stringify(gate)}
-->
`,
    });
    expect(evaluation.hardFailures).toContain("unsupported-claim:claim-devin-010");
    expect(evaluation.unsupportedClaimIds).toEqual(["claim-devin-010"]);
  });

  it("E: script-writer behavior is unchanged and still delegates to evaluateScriptWriterDraft", () => {
    const markdown = `# Script Draft

状态：\`draft-ready\`

## seg-001

- Section: \`hook\`
- Target seconds: \`4\`
- Claim IDs: \`claim-devin-001\`
- Source identity: official demo
- Visual intent: browser opens
- Fact boundary: no success rate

### Narration

任务交出去，它自己打开浏览器。
`;
    const evaluation = evaluate({
      role: "script-writer",
      output: markdown,
    });
    const direct = evaluateScriptWriterDraft({markdown, factsJson});
    expect(evaluation).toEqual(direct);
    expect(evaluation.hardFailures).toEqual([]);
    expect(evaluation.unsupportedClaimIds).toEqual([]);

    const forbidden = evaluate({
      role: "script-writer",
      output: markdown.replace("claim-devin-001", "claim-devin-010"),
    });
    expect(forbidden.hardFailures).toContain("unsupported-claim:claim-devin-010");
    expect(forbidden.unsupportedClaimIds).toEqual(["claim-devin-010"]);
  });

  it("research-analyst output is not subject to the narration claim boundary", () => {
    const evaluation = evaluate({
      role: "research-analyst",
      output: factsJson,
    });
    expect(evaluation.hardFailures).toEqual([]);
    expect(evaluation.unsupportedClaimIds).toEqual([]);
    expect(evaluation.claimIds).toEqual([]);
    expect(evaluation.claimCoverage).toBe(1);
  });
});
