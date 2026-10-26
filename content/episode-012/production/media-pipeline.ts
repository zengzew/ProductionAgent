import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {ingestMediaSource} from "../../../src/media/ingest";
import {indexMediaAsset} from "../../../src/media/understanding";
import {
  mediaRetrievalRequestSchema,
  readMediaRetrievalResult,
  retrieveMediaCandidates,
} from "../../../src/media/retrieve";
import {
  verifyMediaClip,
  mediaVerificationRequestSchema,
  type MediaVerificationProvider,
} from "../../../src/media/verify";
import {readArtifactIndex} from "../../../src/orchestration/artifact-registry";
import {sha256Json} from "../../../src/lib/platform/cache";
const repoRoot = process.cwd(),
  episodeId = "episode-012",
  root = `content/${episodeId}`;
const script = JSON.parse(fs.readFileSync(`${root}/story/script.json`, "utf8"));
const timeline = JSON.parse(fs.readFileSync(`${root}/production/timeline.json`, "utf8"));
const entries = JSON.parse(fs.readFileSync(`${root}/media/observations.json`, "utf8"));
const mode = process.argv[2];
if (mode === "index") {
  const manifest = JSON.parse(fs.readFileSync(`${root}/media/source-manifest.json`, "utf8"));
  for (const asset of manifest.assets.filter(
    (a: any) => a.kind === "original" && !entries.some((e: any) => e.mediaId === a.mediaId),
  )) {
    const segmentId = asset.mediaId.match(/seg-\d{3}/)?.[0];
    if (!segmentId) continue;
    entries.push({
      segmentId,
      mediaId: asset.mediaId,
      sha256: asset.sha256,
      textSummary: "本期已替换的准备片段，仅保留来源索引，不批准渲染。",
      keywords: ["superseded"],
    });
  }
}
const reviewRoot = `${root}/media/clip-reviews`;
fs.mkdirSync(reviewRoot, {recursive: true});
const provider: MediaVerificationProvider = {
  id: "codex",
  model: "current-session",
  verificationVersion: "photoroom-observed-v1",
  async verify(input) {
    const requestHash = sha256Json(input);
    const file = `${reviewRoot}/${input.segmentId}`;
    fs.writeFileSync(
      file + ".request.json",
      JSON.stringify({...input, requestHash}, null, 2) + "\n",
    );
    if (!fs.existsSync(file + ".result.json"))
      throw new Error(`REFERENCE_OBSERVATION_PENDING:${file}`);
    const result = JSON.parse(fs.readFileSync(file + ".result.json", "utf8"));
    if (result.requestHash !== requestHash) throw new Error(`REFERENCE_OBSERVATION_STALE:${file}`);
    return result.output;
  },
};
for (const entry of entries) {
  const segment = script.segments.find((s: any) => s.id === entry.segmentId);
  const scene = timeline.scenes.find((s: any) => s.id === entry.segmentId);
  if (mode === "ingest") {
    const file = path.resolve(`${root}/media/prepared/${segment.id}.mp4`);
    if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== entry.sha256)
      throw new Error("Prepared clip changed");
    const result = await ingestMediaSource({
      repoRoot,
      episodeId,
      sourceId: entry.sourceId,
      mediaId: entry.mediaId,
      adapter: {
        id: "photoroom-measured-source-assembly-v1",
        async acquire(context) {
          const output = path.join(context.tempDirectory, path.basename(file));
          fs.copyFileSync(file, output);
          return {
            filePath: output,
            originalFilename: path.basename(file),
            declaredContentType: "video/mp4",
          };
        },
      },
    });
    console.log("ingested", segment.id, result.original.artifactRef.sha256);
  } else if (mode === "index") {
    const result = await indexMediaAsset({
      repoRoot,
      episodeId,
      mediaId: entry.mediaId,
      sceneDetector: {
        id: "bounded-reference-excerpt",
        version: "v1",
        detect: ({durationMs}) => [{sceneIndex: 0, startMs: 0, endMs: durationMs!}],
      },
      semanticAdapter: {
        id: "codex-observed-reference",
        version: entry.sha256.slice(0, 16),
        describe: () => ({
          textSummary: entry.textSummary,
          keywords: entry.keywords,
          entities: ["Photoroom"],
          semanticTags: ["attributed-source-excerpt", "local-evaluation", "measured"],
          speaker: null,
        }),
      },
    });
    console.log("indexed", segment.id, result.clipIndex.ref.sha256);
  } else if (mode === "retrieve") {
    await retrieveMediaCandidates({
      repoRoot,
      episodeId,
      request: mediaRetrievalRequestSchema.parse({
        schemaVersion: "media-retrieval-request-v1",
        episodeId,
        segmentId: segment.id,
        claimIds: segment.claimIds,
        narration: segment.narration,
        visualIntent: segment.visualIntent,
        visualTrackMode: "independent-b-roll",
        preferredMediaTypes: ["video"],
        topK: 50,
        durationTargetMs: Math.round((scene.durationFrames / 30) * 1000),
      }),
    });
    console.log("retrieved", segment.id);
  } else if (mode === "verify") {
    const retrieval = readMediaRetrievalResult(repoRoot, episodeId, segment.id),
      candidate = retrieval.candidates.find((c) => c.mediaId === entry.mediaId);
    if (!candidate) throw new Error(`Missing candidate ${entry.mediaId}`);
    const idx = readArtifactIndex(`${root}/artifact-index.json`);
    const ref = idx.artifacts
      .filter(
        (x) =>
          x.ref.artifactId === `${episodeId}:media-retrieval:${segment.id}` &&
          x.state !== "quarantined",
      )
      .sort((a, b) => b.ref.revision - a.ref.revision)[0]?.ref;
    try {
      await verifyMediaClip({
        repoRoot,
        episodeId,
        provider,
        request: mediaVerificationRequestSchema.parse({
          schemaVersion: "media-verification-request-v1",
          episodeId,
          segmentId: segment.id,
          claimIds: segment.claimIds,
          narration: segment.narration,
          visualIntent: segment.visualIntent,
          clipId: candidate.clipId,
          retrievalResultRef: ref,
          maxKeyframes: 4,
        }),
      });
      console.log("verified", segment.id);
    } catch (error) {
      if (!/REFERENCE_OBSERVATION_(PENDING|STALE)/u.test(String(error))) throw error;
      console.log(String(error));
    }
  } else throw new Error("Use ingest | index | retrieve | verify");
}
