import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {timelineSchema} from "../src/schemas/episode";
import {
  assertTimelineMatchesEpisode,
  generatedTimelinePath,
  getRenderContract,
} from "../src/lib/render-contract";
import {episodeId, episodeRoot, outputEpisodeRoot, readJson, repoRoot} from "../src/lib/project";

type Mode = "smoke" | "vertical";
const mode = (process.argv[2] ?? "vertical") as Mode;
if (!["smoke", "vertical"].includes(mode)) {
  throw new Error(`未知渲染模式：${mode}`);
}

fs.mkdirSync(outputEpisodeRoot, {recursive: true});

const contract = getRenderContract(episodeId);
const currentTimeline = timelineSchema.parse(
  readJson<unknown>(path.join(episodeRoot, "production/timeline.json")),
);
const generatedPath = path.join(repoRoot, generatedTimelinePath(episodeId));
if (!fs.existsSync(generatedPath)) {
  throw new Error(`缺少当前 episode 的生成时间轴：${generatedPath}；请先运行 pnpm timeline`);
}
const generatedTimeline = timelineSchema.parse(readJson<unknown>(generatedPath));
assertTimelineMatchesEpisode(currentTimeline, episodeId);
assertTimelineMatchesEpisode(generatedTimeline, episodeId);
if (JSON.stringify(generatedTimeline) !== JSON.stringify(currentTimeline)) {
  throw new Error(
    `生成时间轴不是当前 episode 的最新版本：${generatedPath}；请先运行 pnpm timeline`,
  );
}

const run = (args: string[]): void => {
  const result = spawnSync("pnpm", ["exec", "remotion", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Remotion 命令失败：${args.join(" ")}`);
  }
};

const renderVideo = (composition: string, output: string): void => {
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
  ]);
};

if (mode === "smoke") {
  renderVideo(contract.smokeComposition, path.join(outputEpisodeRoot, "smoke_9x16.mp4"));
}
if (mode === "vertical") {
  renderVideo(contract.composition, path.join(outputEpisodeRoot, "vertical_9x16.mp4"));
}

console.log(`render mode ${mode} complete`);
