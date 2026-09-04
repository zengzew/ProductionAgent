import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {indexMediaAsset} from "../../../src/media/understanding";
import {mediaRetrievalRequestSchema, readMediaRetrievalResult, retrieveMediaCandidates} from "../../../src/media/retrieve";
import {createCodexMediaVerificationProvider, mediaVerificationRequestSchema, verifyMediaClip} from "../../../src/media/verify";
import {readMediaSourceManifest} from "../../../src/media/manifest";
import {readArtifactIndex} from "../../../src/orchestration/artifact-registry";

// Local evaluation only. Observations are written after actual frame inspection;
// this runner never manufactures a Codex result or changes admission/rights.
const repoRoot = process.cwd();
const episodeId = "episode-008";
const root = path.join(repoRoot, "content", episodeId);
type Observation = {
  mediaId: string;
  segmentId: string;
  textSummary: string;
  keywords: string[];
  entities: string[];
  semanticTags: string[];
  evidenceFiles: string[];
  sourceRecipe: string;
};
const observations = JSON.parse(fs.readFileSync(path.join(root, "media/review-observations.json"), "utf8")) as Observation[];
const requested = process.argv[3];
const entries = observations.filter((entry) => !requested || entry.segmentId === requested);
const mode = process.argv[2];
const script = JSON.parse(fs.readFileSync(path.join(root, "story/script.json"), "utf8"));
if (mode === "index-corpus") {
  for (const slug of ["lovable-save-2535", "lovable-login-1794", "lovable-chat-1670"]) {
    const result = await indexMediaAsset({repoRoot, episodeId, mediaId: `${episodeId}:media:${slug}`});
    console.log(JSON.stringify({mode, mediaId: slug, index: result.clipIndex.ref}));
  }
} else if (mode === "index") {
  for (const entry of entries) {
    const asset = readMediaSourceManifest(repoRoot, episodeId).assets.find((item) => item.mediaId === entry.mediaId);
    if (!asset?.durationMs) throw new Error(`Missing duration: ${entry.mediaId}`);
    for (const file of [...entry.evidenceFiles, entry.sourceRecipe]) {
      if (!fs.existsSync(path.join(repoRoot, file))) throw new Error(`Missing observed evidence: ${file}`);
    }
    const result = await indexMediaAsset({repoRoot, episodeId, mediaId: entry.mediaId,
      sceneDetector: {id: "episode008-bounded-prepared-clip", version: "v1", detect: ({durationMs}) => [{sceneIndex: 0, startMs: 0, endMs: durationMs!}]},
      semanticAdapter: {id: "codex-observed-episode008", version: `v1-${createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 16)}`, describe: () => ({textSummary: entry.textSummary, keywords: entry.keywords, entities: entry.entities, semanticTags: entry.semanticTags, speaker: null})},
    });
    console.log(JSON.stringify({mode, mediaId: entry.mediaId, index: result.clipIndex}));
  }
} else if (mode === "retrieve") {
  for (const entry of entries) {
    const segment = script.segments.find((item: {id: string}) => item.id === entry.segmentId);
    const result = await retrieveMediaCandidates({repoRoot, episodeId, request: mediaRetrievalRequestSchema.parse({
      schemaVersion: "media-retrieval-request-v1", episodeId, segmentId: segment.id,
      claimIds: segment.claimIds, narration: segment.narration, visualIntent: segment.visualIntent,
      visualTrackMode: "independent-b-roll", preferredMediaTypes: ["video"], topK: 50,
      durationTargetMs: Math.round(segment.targetSeconds * 1000),
    })});
    console.log(JSON.stringify({mode, ...result}));
  }
} else if (mode === "verify") {
  for (const entry of entries) {
    const segment = script.segments.find((item: {id: string}) => item.id === entry.segmentId);
    const retrieval = readMediaRetrievalResult(repoRoot, episodeId, segment.id);
    const candidate = retrieval.candidates.find((item) => item.mediaId === entry.mediaId);
    if (!candidate) throw new Error(`Requested observed clip not retrieved: ${entry.mediaId}`);
    const index = readArtifactIndex(path.join(root, "artifact-index.json"));
    const ref = index.artifacts.filter((item) => item.ref.artifactId === `${episodeId}:media-retrieval:${segment.id}` && item.state !== "quarantined").sort((a,b) => b.ref.revision - a.ref.revision)[0]?.ref;
    if (!ref) throw new Error(`Retrieval ref missing: ${segment.id}`);
    try {
      const result = await verifyMediaClip({repoRoot, episodeId, provider: createCodexMediaVerificationProvider({repoRoot}), request: mediaVerificationRequestSchema.parse({schemaVersion: "media-verification-request-v1", episodeId, segmentId: segment.id, claimIds: segment.claimIds, narration: segment.narration, visualIntent: segment.visualIntent, clipId: candidate.clipId, retrievalResultRef: ref, maxKeyframes: 4})});
      console.log(JSON.stringify({mode, ...result}));
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("MEDIA_VERIFY_CODEX_RESULT_PENDING")) throw error;
      console.log(JSON.stringify({mode, segmentId: segment.id, status: "pending-real-inspection", message: error.message}));
    }
  }
} else throw new Error("Use index-corpus | index | retrieve | verify [seg-id]");
