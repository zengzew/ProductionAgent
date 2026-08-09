import fs from "node:fs";
import path from "node:path";
import {parseCliArgs} from "./cli";

export const repoRoot = path.resolve(import.meta.dirname, "../..");

export const resolveEpisodeId = (
  argv: string[],
  environment: NodeJS.ProcessEnv,
  ignoreCliArguments = false,
): string => {
  const effectiveArgv = ignoreCliArguments ? argv.slice(0, 2) : argv;
  const parsed = parseCliArgs(effectiveArgv);
  if (parsed.positionals.length > 0 && path.basename(effectiveArgv[1] ?? "") !== "render.ts") {
    throw new Error(`未知位置参数：${parsed.positionals.join(" ")}`);
  }
  return parsed.episode ?? environment.EPISODE_ID ?? "episode-001";
};

export const episodeId = resolveEpisodeId(process.argv, process.env, Boolean(process.env.VITEST));

if (!/^episode-[a-z0-9-]+$/u.test(episodeId)) {
  throw new Error(`Invalid episode id: ${episodeId}`);
}

export const episodeRoot = path.join(repoRoot, "content", episodeId);
export const publicEpisodeRoot = path.join(repoRoot, "public/episodes", episodeId);
export const outputEpisodeRoot = path.join(repoRoot, "output", episodeId);

export const readJson = <T>(filePath: string): T => {
  const source = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(source) as T;
  } catch (error) {
    throw new Error(`无法解析 JSON 文件：${filePath}`, {cause: error});
  }
};

export const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const ensureDir = (directory: string): void => {
  fs.mkdirSync(directory, {recursive: true});
};
