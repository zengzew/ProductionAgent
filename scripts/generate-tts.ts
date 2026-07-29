import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {scriptSchema} from "../src/schemas/episode";
import {
  ensureDir,
  episodeRoot,
  publicEpisodeRoot,
  readJson,
  repoRoot,
  writeJson,
} from "../src/lib/project";

const voice = "zh-CN-YunjianNeural";
const rate = "+25%";
const pitch = "-2Hz";
const provider = "Microsoft Edge neural TTS";
const edgeTtsExecutable = path.join(repoRoot, ".venv/bin/edge-tts");

if (!fs.existsSync(edgeTtsExecutable)) {
  throw new Error(
    [
      `缺少 ${edgeTtsExecutable}`,
      "请执行：python3 -m venv .venv",
      "然后执行：.venv/bin/pip install -r requirements.txt",
    ].join("\n"),
  );
}

const script = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
const audioDir = path.join(publicEpisodeRoot, "audio");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "poke-edge-tts-"));
ensureDir(audioDir);

const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} 失败：${result.stderr || result.stdout || `exit ${result.status ?? "unknown"}`}`,
    );
  }
};

const normalize = (input: string, output: string): void => {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=7",
    "-ar",
    "48000",
    "-ac",
    "1",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    output,
  ]);
};

const generated: Array<{segmentId: string; file: string}> = [];

try {
  for (const segment of script.segments) {
    const raw = path.join(tempDir, `${segment.id}.mp3`);
    const output = path.join(audioDir, `${segment.id}.mp3`);
    run(edgeTtsExecutable, [
      "--voice",
      voice,
      `--rate=${rate}`,
      `--pitch=${pitch}`,
      "--text",
      segment.narration,
      "--write-media",
      raw,
    ]);
    normalize(raw, output);
    generated.push({
      segmentId: segment.id,
      file: path.relative(path.join(publicEpisodeRoot, "..", ".."), output),
    });
    console.log(`generated ${segment.id} with ${voice}`);
  }
} finally {
  fs.rmSync(tempDir, {recursive: true, force: true});
}

writeJson(path.join(episodeRoot, "production/tts-metadata.json"), {
  provider,
  preview: false,
  generatedAt: new Date().toISOString(),
  voice,
  rate,
  pitch,
  normalization: "loudnorm I=-16 TP=-1.5 LRA=7",
  credentialRequired: false,
  networkRequired: true,
  referenceEffect: "fixed project narration profile",
  files: generated,
});

console.log(
  `TTS complete: ${generated.length} segments, provider=${provider}, voice=${voice}, rate=${rate}, pitch=${pitch}`,
);
