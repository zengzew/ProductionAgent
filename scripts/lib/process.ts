import {spawnSync, type SpawnSyncOptionsWithStringEncoding} from "node:child_process";
import {assertSpawnSucceeded, parseFiniteNumber} from "../../src/lib/platform/process";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export const runCommand = (
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding = {encoding: "utf8"},
): CommandResult => {
  const result = spawnSync(command, args, {...options, encoding: "utf8"});
  assertSpawnSucceeded(command, args, result);
  return {stdout: result.stdout ?? "", stderr: result.stderr ?? ""};
};

export const probeMediaDuration = (filePath: string): number => {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ];
  const {stdout} = runCommand("ffprobe", args);
  const duration = parseFiniteNumber(stdout.trim(), `${filePath} 时长`);
  if (duration <= 0) throw new Error(`无效媒体时长：${filePath}`);
  return duration;
};
