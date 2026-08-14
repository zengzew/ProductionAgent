import path from "node:path";
import {scriptSchema} from "../src/schemas/episode";
import {generateTtsWithProviders} from "../src/lib/tts-providers";
import {
  createFineGrainedCacheFromEnvironment,
  hashRepositoryFiles,
} from "../src/lib/fine-grained-cache";
import {episodeRoot, publicEpisodeRoot, readJson, repoRoot} from "../src/lib/project";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const script = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
const audioDir = path.join(publicEpisodeRoot, "audio");
const cache = createFineGrainedCacheFromEnvironment({
  episodeId: process.env.EPISODE_ID ?? "episode-001",
  stage: "tts",
});
const metadata = await generateTtsWithProviders(script, {
  audioDirectory: audioDir,
  metadataPath: path.join(episodeRoot, "production/tts-metadata.json"),
  publicPathForFile: (output) => path.relative(path.join(publicEpisodeRoot, "..", ".."), output),
  ...(cache
    ? {
        cache,
        cacheDependencyHashes: hashRepositoryFiles(repoRoot, [
          "config/tts-v2.json",
          "src/lib/tts-providers.ts",
          "src/lib/pipeline-v2-config.ts",
          "scripts/generate-tts.ts",
        ]),
      }
    : {}),
});

console.log(
  `TTS complete: ${metadata.files.length} segments, requested=${metadata.requestedProvider}, provider=${metadata.provider}, fallback=${metadata.fallbackUsed}`,
);
