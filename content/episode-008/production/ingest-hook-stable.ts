import fs from "node:fs";
import path from "node:path";
import {ingestMediaSource} from "../../../src/media/ingest";

const repoRoot = process.cwd();
const episodeId = "episode-008";
const sourceId = `${episodeId}:media-source:lovable-office-hours`;
const mediaId = `${episodeId}:media:prepared-hook-stable`;
const file = path.join(
  repoRoot,
  "content/episode-008/media/prepared/prepared-hook-stable.mp4",
);

if (!fs.existsSync(file)) throw new Error(`Prepared stable hook missing: ${file}`);

const result = await ingestMediaSource({
  repoRoot,
  episodeId,
  sourceId,
  mediaId,
  adapter: {
    id: "observed-official-excerpt-local-copy-v1",
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

console.log(
  JSON.stringify({
    mediaId,
    originalSha256: result.original.artifactRef.sha256,
    proxySha256: result.proxy?.artifactRef.sha256 ?? null,
    reused: result.reused,
  }),
);
