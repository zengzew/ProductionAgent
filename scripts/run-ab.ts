import fs from "node:fs";
import path from "node:path";
import {runPolish} from "../src/lib/polish";
import {generateTtsWithProviders} from "../src/lib/tts-providers";
import {episodeId, outputEpisodeRoot, repoRoot, writeJson} from "../src/lib/project";

const polish = await runPolish();
if (polish.status !== "passed") throw new Error("polish 未通过，A/B 已停止");
const root = path.join(outputEpisodeRoot, "ab", polish.runId);
const oldAudio = path.join(root, "old/audio");
const newAudio = path.join(root, "new/audio");
const oldTts = await generateTtsWithProviders(polish.source, {
  requestedProvider: "edge",
  allowFallback: false,
  audioDirectory: oldAudio,
  metadataPath: path.join(root, "old/tts-metadata.json"),
  publicPathForFile: (file) => path.relative(repoRoot, file),
});
const newTts = await generateTtsWithProviders(polish.candidate, {
  audioDirectory: newAudio,
  metadataPath: path.join(root, "new/tts-metadata.json"),
  publicPathForFile: (file) => path.relative(repoRoot, file),
});
fs.mkdirSync(path.join(root, "old"), {recursive: true});
fs.mkdirSync(path.join(root, "new"), {recursive: true});
fs.writeFileSync(
  path.join(root, "old/narration.txt"),
  `${polish.source.segments.map((segment) => segment.narration).join("\n")}\n`,
);
fs.writeFileSync(
  path.join(root, "new/narration.txt"),
  `${polish.candidate.segments.map((segment) => segment.narration).join("\n")}\n`,
);
writeJson(path.join(root, "comparison-report.json"), {
  schemaVersion: 1,
  runId: polish.runId,
  episodeId,
  judgeReport: path.relative(repoRoot, polish.reportPath),
  old: {provider: oldTts.provider, audioDirectory: path.relative(repoRoot, oldAudio)},
  new: {
    requestedProvider: newTts.requestedProvider,
    provider: newTts.provider,
    fallbackUsed: newTts.fallbackUsed,
    fallbackReason: newTts.fallbackReason,
    alignment: newTts.alignmentStrategy,
    audioDirectory: path.relative(repoRoot, newAudio),
  },
  humanReview: {
    preferredVersion: null,
    translationeseNotes: "",
    spokenChineseNotes: "",
    voiceNaturalnessNotes: "",
    subtitleAlignmentNotes: "",
  },
});
console.log(`A/B complete: ${path.relative(repoRoot, root)}`);
