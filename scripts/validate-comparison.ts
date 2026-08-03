import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {parseComparisonGate} from "../src/lib/comparison";
import {episodeRoot, repoRoot} from "../src/lib/project";

const reportPath = path.join(episodeRoot, "production/comparison-report.md");
if (!fs.existsSync(reportPath)) {
  console.error(`缺少导演版对比报告：${path.relative(repoRoot, reportPath)}`);
  process.exit(1);
}

const gate = parseComparisonGate(fs.readFileSync(reportPath, "utf8"));
const errors: string[] = [];
const hashFile = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const absolute = (relativePath: string): string => path.join(repoRoot, relativePath);
const referencedFiles = [
  ["baseline video", gate.baselineVideo, gate.baselineVideoSha256],
  ["director video", gate.directorVideo, gate.directorVideoSha256],
  ["baseline timeline", gate.baselineTimeline, gate.baselineTimelineSha256],
  ["director timeline", gate.directorTimeline, gate.directorTimelineSha256],
] as const;
for (const [label, file, expectedHash] of referencedFiles) {
  const filePath = absolute(file);
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} 不存在：${file}`);
  } else if (hashFile(filePath) !== expectedHash) {
    errors.push(`${label} SHA-256 与当前文件不一致`);
  }
}

const baselineTotal = Object.values(gate.dimensions).reduce(
  (total, dimension) => total + dimension.baseline,
  0,
);
const directorCutTotal = Object.values(gate.dimensions).reduce(
  (total, dimension) => total + dimension.directorCut,
  0,
);
if (baselineTotal !== gate.baselineTotal) errors.push("baselineTotal 计算错误");
if (directorCutTotal !== gate.directorCutTotal) errors.push("directorCutTotal 计算错误");
for (const [dimension, scores] of Object.entries(gate.dimensions)) {
  if (scores.directorCut <= scores.baseline) {
    errors.push(`${dimension} 没有高于 baseline`);
  }
}
if (directorCutTotal - baselineTotal < 6) {
  errors.push("导演版六维总分提升不足 6 分，不能标记明显改善");
}

const duration = (filePath: string): number => {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    {encoding: "utf8"},
  );
  if (result.status !== 0) throw new Error(`ffprobe 失败：${filePath}`);
  return Number.parseFloat(result.stdout.trim());
};
if (fs.existsSync(absolute(gate.directorVideo))) {
  const directorDuration = duration(absolute(gate.directorVideo));
  if (directorDuration >= 180) {
    errors.push(`导演版成片必须严格小于 180 秒，当前 ${directorDuration.toFixed(3)} 秒`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `comparison validation passed: baseline=${baselineTotal}/60, director=${directorCutTotal}/60, improvement=+${directorCutTotal - baselineTotal}`,
);
