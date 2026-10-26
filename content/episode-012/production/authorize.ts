import fs from "node:fs";
import {buildArtifactRef} from "../../../src/orchestration/artifact-registry";
import {createContentManifest} from "../../../src/orchestration/freeze";
import {persistHumanDecision} from "../../../src/orchestration/human-decision";
import {humanDecisionSchema} from "../../../src/orchestration/schemas/human-decision";
const repoRoot = process.cwd(),
  episodeId = "episode-012",
  root = `content/${episodeId}`,
  now = new Date().toISOString();
const artifactRefs = [
  "story/final-script.md",
  "story/caption-plan.json",
  "story/visual-plan.md",
  "research/facts.json",
  "research/sources.json",
].map((p) =>
  buildArtifactRef({
    repoRoot,
    episodeId,
    artifactId: `${episodeId}:approved:${p.replace(/[^a-z0-9-]/g, "-")}`,
    path: `${root}/${p}`,
    mediaType: p.endsWith(".json") ? "application/json" : "text/markdown",
    schemaVersion: "approved-content-file-v1",
    producer: "codex-current-session",
    createdAt: now,
  }),
);
const decision = humanDecisionSchema.parse({
  schemaVersion: "human-decision-v1",
  decisionId: "e012-user-content-approval-20261025",
  gate: "content-approval",
  decision: "approve",
  reviewer: "zengze",
  timestamp: now,
  approvalEpoch: 1,
  artifactRefs,
  reason:
    "用户在本聊天针对第012集旁白进入配音渲染的请求明确回复“授权”。允许本地配音、字幕、必要素材处理和竖屏渲染；不包括外部发布。首段仅将预算4秒校正为3秒，旁白文字未改。",
});
const result = persistHumanDecision({repoRoot, decision});
const manifest = createContentManifest({
  episodeId,
  selectedArtifactRefs: artifactRefs,
  frozenBy: "human:zengze",
  frozenAt: now,
  approvalEpoch: 1,
});
fs.writeFileSync(
  `${root}/production/content-manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
fs.writeFileSync(
  `${root}/production/local-production-scope.json`,
  JSON.stringify(
    {
      userRequest: "开始做新一集视频",
      explicitApproval: "授权",
      approvalContext: "当前Photoroom第012集文案进入配音、字幕及竖屏渲染",
      recordedAt: now,
      contentDecisionRef: result.decisionRef,
      scope: "本地评估制作及公开来源的必要署名节选；不包含外部发布、商业投放或第三方媒体再授权",
      independentReview: "本会话承担编辑/事实/视觉职责，不冒充独立会话审核",
    },
    null,
    2,
  ) + "\n",
);
console.log("Content approval persisted:", result.decisionRef.path);
