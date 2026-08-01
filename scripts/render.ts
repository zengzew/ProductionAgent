import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {episodeId, outputEpisodeRoot, repoRoot} from "../src/lib/project";

type Mode = "smoke" | "vertical";
const mode = (process.argv[2] ?? "vertical") as Mode;
if (!["smoke", "vertical"].includes(mode)) {
  throw new Error(`未知渲染模式：${mode}`);
}

fs.mkdirSync(outputEpisodeRoot, {recursive: true});

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
  renderVideo(
    episodeId === "episode-002" ? "RoostVerticalSmoke" : "PokeVerticalSmoke",
    path.join(outputEpisodeRoot, "smoke_9x16.mp4"),
  );
}
if (mode === "vertical") {
  renderVideo(
    episodeId === "episode-002" ? "RoostVertical" : "PokeVertical",
    path.join(outputEpisodeRoot, "vertical_9x16.mp4"),
  );
}

console.log(`render mode ${mode} complete`);
