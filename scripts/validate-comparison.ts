import fs from "node:fs";
import path from "node:path";
import {parseComparisonGate} from "../src/lib/comparison";
import {episodeRoot, repoRoot} from "../src/lib/project";
import {productionContract} from "../src/lib/production-contract";
import {classifyComparisonVerdict, signedScore} from "./lib/comparison";
import {probeMediaDuration} from "./lib/process";
import {fatal, finishValidation, hashFile, installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const reportPath = path.join(episodeRoot, "production/comparison-report.md");
if (!fs.existsSync(reportPath)) {
  fatal(`缺少导演版对比报告：${path.relative(repoRoot, reportPath)}`);
}

const gate = parseComparisonGate(fs.readFileSync(reportPath, "utf8"));
const errors: string[] = [];
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
const totalChange = directorCutTotal - baselineTotal;
if (gate.verdict === "IMPROVED") {
  for (const [dimension, scores] of Object.entries(gate.dimensions)) {
    if (scores.directorCut <= scores.baseline) {
      errors.push(`${dimension} 没有高于 baseline`);
    }
  }
  if (totalChange < 6) {
    errors.push("导演版六维总分提升不足 6 分，不能标记明显改善");
  }
}
const expectedVerdict = classifyComparisonVerdict(gate.dimensions);
if (gate.verdict !== expectedVerdict) {
  errors.push(`comparison verdict 与六维评分不一致：期望 ${expectedVerdict}，当前 ${gate.verdict}`);
}

if (fs.existsSync(absolute(gate.directorVideo))) {
  const directorDuration = probeMediaDuration(absolute(gate.directorVideo));
  if (directorDuration >= productionContract.delivery.hardMaximumSeconds) {
    errors.push(
      `导演版成片必须严格小于 ${productionContract.delivery.hardMaximumSeconds} 秒，当前 ${directorDuration.toFixed(3)} 秒`,
    );
  }
}

finishValidation(
  errors,
  `comparison validation passed: baseline=${baselineTotal}/60, director=${directorCutTotal}/60, change=${signedScore(totalChange)}, verdict=${gate.verdict}`,
);
