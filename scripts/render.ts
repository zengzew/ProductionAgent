import fs from "node:fs";
import path from "node:path";
import {parseRenderMode} from "../src/lib/episode/cli";
import {assertTimelineMatchesEpisode, getRenderContract} from "../src/lib/episode/render-contract";
import {assertMediaMixReadyToRender} from "../src/media/render";
import {episodeId, episodeRoot, outputEpisodeRoot, repoRoot} from "../src/lib/episode/paths";
import {runCommand} from "./lib/process";
import {installCliErrorHandlers, readTimeline} from "./lib/validation";

installCliErrorHandlers();

const mode = parseRenderMode(process.argv);

fs.mkdirSync(outputEpisodeRoot, {recursive: true});

const contract = getRenderContract(episodeId);
const timelinePath = path.join(episodeRoot, "production/timeline.json");
if (!fs.existsSync(timelinePath)) {
  throw new Error(`缺少当前 episode 的生成时间轴：${timelinePath}；请先运行 pnpm timeline`);
}
const currentTimeline = readTimeline(timelinePath);
assertTimelineMatchesEpisode(currentTimeline, episodeId);

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
  const mediaMixProps =
    composition === "MediaMixVertical" ? [`--props=${JSON.stringify({episodeId})}`] : [];
  if (composition === "MediaMixVertical") {
    assertMediaMixReadyToRender({repoRoot, episodeId});
  }
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
    ...mediaMixProps,
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
