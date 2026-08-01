import path from "node:path";
import {scriptSchema} from "../src/schemas/episode";
import {generateTtsWithProviders} from "../src/lib/tts-providers";
import {episodeRoot, publicEpisodeRoot, readJson} from "../src/lib/project";

const script = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
const audioDir = path.join(publicEpisodeRoot, "audio");
const metadata = await generateTtsWithProviders(script, {
  audioDirectory: audioDir,
  metadataPath: path.join(episodeRoot, "production/tts-metadata.json"),
  publicPathForFile: (output) => path.relative(path.join(publicEpisodeRoot, "..", ".."), output),
});

console.log(
  `TTS complete: ${metadata.files.length} segments, requested=${metadata.requestedProvider}, provider=${metadata.provider}, fallback=${metadata.fallbackUsed}`,
);
