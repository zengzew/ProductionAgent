import fs from "node:fs";
import path from "node:path";
import {parseRenderMode} from "../src/lib/cli";
import {
  assertTimelineMatchesEpisode,
  generatedTimelinePath,
  getRenderContract,
} from "../src/lib/render-contract";
import {episodeId, episodeRoot, outputEpisodeRoot, repoRoot} from "../src/lib/project";
import {runCommand} from "./lib/process";
import {installCliErrorHandlers, jsonValuesEqual, readTimeline} from "./lib/validation";

installCliErrorHandlers();

const mode = parseRenderMode(process.argv);

fs.mkdirSync(outputEpisodeRoot, {recursive: true});

const contract = getRenderContract(episodeId);
const currentTimeline = readTimeline(path.join(episodeRoot, "production/timeline.json"));
const generatedPath = path.join(repoRoot, generatedTimelinePath(episodeId));
if (!fs.existsSync(generatedPath)) {
  throw new Error(`缺少当前 episode 的生成时间轴：${generatedPath}；请先运行 pnpm timeline`);
}
const generatedTimeline = readTimeline(generatedPath);
assertTimelineMatchesEpisode(currentTimeline, episodeId);
assertTimelineMatchesEpisode(generatedTimeline, episodeId);
if (!jsonValuesEqual(generatedTimeline, currentTimeline)) {
  throw new Error(
    `生成时间轴不是当前 episode 的最新版本：${generatedPath}；请先运行 pnpm timeline`,
  );
}

const run = (args: string[]): void => {
  const executable = path.join(
    repoRoot,
    "node_modules/.bin",
    process.platform === "win32" ? "remotion.cmd" : "remotion",
  );
  runCommand(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
};

const renderVideo = (composition: string, output: string): void => {
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
  run([
    "render",
    "src/index.ts",
    composition,
    output,
    "--codec=h264",
    "--crf=20",
    "--pixel-format=yuv420p",
    "--audio-codec=aac",
    "--audio-bitrate=192K",
    "--concurrency=2",
    ...(browserExecutable ? [`--browser-executable=${browserExecutable}`] : []),
  ]);
};

if (mode === "smoke") {
  renderVideo(contract.smokeComposition, path.join(outputEpisodeRoot, "smoke_9x16.mp4"));
}
if (mode === "vertical") {
  renderVideo(contract.composition, path.join(outputEpisodeRoot, "vertical_9x16.mp4"));
}

console.log(`render mode ${mode} complete`);
