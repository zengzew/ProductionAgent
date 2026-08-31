import fs from "node:fs";
import path from "node:path";
import {parseFinalScript} from "../src/lib/editorial/story";
import {episodeRoot, writeJson} from "../src/lib/episode/paths";
import {scriptSchema} from "../src/schemas/episode";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const finalScriptPath = path.join(episodeRoot, "story/final-script.md");
const markdown = fs.readFileSync(finalScriptPath, "utf8");
const hookCandidatesPath = path.join(episodeRoot, "story/hook-candidates.md");
const selectedHook =
  markdown.match(/选中 Hook：`([^`]+)`/u)?.[1] ??
  (fs.existsSync(hookCandidatesPath)
    ? fs
        .readFileSync(hookCandidatesPath, "utf8")
        .match(/^## 候选 [^\n]+（选中）—\s*(.+)$/mu)?.[1]
        ?.trim()
    : undefined);
if (!selectedHook) {
  throw new Error("final-script.md 缺少“选中 Hook”");
}

const segments = parseFinalScript(markdown).map((segment) => ({
  id: segment.id,
  section: segment.section,
  narration: segment.narration,
  onScreenText: segment.onScreenText
    .replaceAll("`", "")
    .split(/\s*\/\s*/u)
    .map((text) => text.trim())
    .filter(Boolean),
  claimIds: segment.claimIds,
  scene: segment.scene,
  visualIntent: segment.visualIntent,
  targetSeconds: segment.targetSeconds,
}));

const script = scriptSchema.parse({selectedHook, segments});
writeJson(path.join(episodeRoot, "story/script.json"), script);
fs.writeFileSync(
  path.join(episodeRoot, "story/narration.txt"),
  `${script.segments.map((segment) => segment.narration).join("\n\n")}\n`,
);

console.log(
  `story materialized: ${script.segments.length} segments, hook=${selectedHook}, target=${script.segments.reduce(
    (total, segment) => total + segment.targetSeconds,
    0,
  )}s`,
);
