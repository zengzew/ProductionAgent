import fs from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../..");

const episodeFlagIndex = process.argv.indexOf("--episode");
const requestedEpisode =
  episodeFlagIndex >= 0 ? process.argv.at(episodeFlagIndex + 1) : process.env.EPISODE_ID;
export const episodeId = requestedEpisode ?? "episode-001";

if (!/^episode-[a-z0-9-]+$/u.test(episodeId)) {
  throw new Error(`Invalid episode id: ${episodeId}`);
}

export const episodeRoot = path.join(repoRoot, "content", episodeId);
export const publicEpisodeRoot = path.join(repoRoot, "public/episodes", episodeId);
export const outputEpisodeRoot = path.join(repoRoot, "output", episodeId);

export const readJson = <T>(filePath: string): T =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

export const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const ensureDir = (directory: string): void => {
  fs.mkdirSync(directory, {recursive: true});
};
