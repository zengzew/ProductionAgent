import fs from "node:fs";
import crypto from "node:crypto";
import {
  proposeMediaSource,
  applyMediaSourceAdmission,
  applyMediaSourceRights,
} from "../../../src/media/discovery";
import {readMediaSourceManifest} from "../../../src/media/manifest";
import {mediaDiscoveryFileConfig} from "../../../src/media/discovery-config";
import {humanDecisionSchema} from "../../../src/orchestration/schemas/human-decision";
const repoRoot = process.cwd(),
  episodeId = "episode-012",
  root = `content/${episodeId}`,
  manifestPath = `${root}/media/source-manifest.json`;
const defs = [
  ["official", "https://www.photoroom.com/tools/background-remover", "Photoroom"],
  [
    "founder",
    "https://pulse2.com/photoroom-matthieu-rouif-profile/amp/",
    "Matthieu Rouif / Pulse 2.0; portrait from Stripe",
  ],
  [
    "trust",
    "https://stripe.com/au/newsroom/stories/stripe-and-photoroom",
    "Stripe / Matthieu Rouif",
  ],
  [
    "growth",
    "https://subscriptionleague.com/episode/photoroom-how-to-grow-a-subscription-app-business-and-its-user-base-globally-by-olivier-lemarie",
    "Subscription League / Olivier Lemarie",
  ],
  [
    "finance",
    "https://www.prnewswire.com/news-releases/photoroom-secures-43m-in-series-b-funding-launches-next-generation-ai-photo-editing-features-for-businesses-302071832.html",
    "Photoroom via PR Newswire",
  ],
];
const config = {
  ...mediaDiscoveryFileConfig,
  allowedHosts: [
    ...mediaDiscoveryFileConfig.allowedHosts,
    ...defs.map((d) => new URL(d[1]!).hostname),
  ],
};
fs.writeFileSync(
  `${root}/production/discovery-policy.json`,
  JSON.stringify(
    {scope: "本期已人工回读的公开来源，精确hostname；不修改全局策略", ...config},
    null,
    2,
  ) + "\n",
);
for (const [key, url, publisher] of defs) {
  const sourceId = `${episodeId}:media-source:${key}`;
  if (
    !fs.existsSync(manifestPath) ||
    !readMediaSourceManifest(repoRoot, episodeId).sources.some((s) => s.sourceId === sourceId)
  )
    proposeMediaSource({
      repoRoot,
      episodeId,
      config,
      source: {
        sourceId,
        sourceUrl: url,
        publisher,
        sourceType: "official",
        rightsBasis: "用户明确授权的本地评估制作、必要署名节选；外部发布权利未核实。",
        notes:
          "原始公开素材及中文编辑转述卡，完整底层来源与衍生步骤见research/source-notes.md、production/edit-recipe.json；不是本次实测或平台原始截图。",
      },
    });
  for (const gate of ["media-admission", "media-rights"] as const) {
    const source = readMediaSourceManifest(repoRoot, episodeId).sources.find(
      (s) => s.sourceId === sourceId,
    )!;
    if (gate === "media-admission" ? source.admissionDecisionRef : source.rightsDecisionRef)
      continue;
    const now = new Date().toISOString(),
      bytes = fs.readFileSync(manifestPath);
    const decision = humanDecisionSchema.parse({
      schemaVersion: "human-decision-v1",
      decisionId: `e012-local-authorized-${key}-${gate}`,
      gate,
      decision: "approve",
      reviewer: "zengze-user-authorization",
      timestamp: now,
      reason:
        "承接本聊天用户“授权”：公开来源必要署名节选、编辑转述及配音用于本地评估视频。不代表第三方外部发布许可或成片最终批准；参见production/local-production-scope.json。",
      approvalEpoch: 1,
      artifactRefs: [
        {
          artifactId: `${episodeId}:media:source-manifest`,
          episodeId,
          path: manifestPath,
          mediaType: "application/json",
          schemaVersion: "media-source-manifest-v1",
          revision: 1,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          sizeBytes: bytes.length,
          producer: "local-authorized-scope",
          createdAt: now,
        },
      ],
    });
    const result = (
      gate === "media-admission" ? applyMediaSourceAdmission : applyMediaSourceRights
    )({repoRoot, episodeId, sourceId, decision});
    console.log(key, gate, result.decisionRef.sha256.slice(0, 10));
  }
}
