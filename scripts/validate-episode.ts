import {spawnSync} from "node:child_process";
import path from "node:path";
import {parseEpisodeFlag, parseProfileFlag} from "../src/lib/episode/cli";
import {episodeValidationScripts, stripProfileFlag} from "./lib/episode-validation";
import {errorMessage, installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const profile = parseProfileFlag(process.argv) ?? "fast";
const episodeId = parseEpisodeFlag(process.argv) ?? process.env.EPISODE_ID ?? "episode-001";
const forwarded = stripProfileFlag(process.argv.slice(2));
const scripts = episodeValidationScripts(profile);

for (const script of scripts) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(import.meta.dirname, script), ...forwarded],
    {encoding: "utf8", env: process.env, stdio: "inherit"},
  );
  if (result.error) {
    console.error(errorMessage(result.error));
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(
  `${episodeId} profile=${profile}：${scripts.join(" → ")} 通过。结构校验通过不表示成片好看或有留存价值。`,
);
