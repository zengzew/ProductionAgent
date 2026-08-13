import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const trackedArtifactValidators = ["validate-research"] as const;
// 旧标准（180 秒上限）下生产的 Episode 002 内容包，在新 60 ± 20 秒规则下不再合规；
// 重新生成前，validate-story / validate-content 必须 fail closed 拒绝超时长的旧内容。
const legacyDurationWindowValidators = ["validate-story", "validate-content"] as const;
const mediaBoundValidators = [
  "validate-workflow",
  "validate-delivery",
  "validate-comparison",
] as const;

describe("validation CLI entrypoints", () => {
  it.each(trackedArtifactValidators)("runs %s with tracked Episode 002 artifacts", (name) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", `scripts/${name}.ts`], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {...process.env, EPISODE_ID: "episode-002"},
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${name} stderr:\n${result.stderr}`).toBe(0);
  });

  it.each(legacyDurationWindowValidators)(
    "%s rejects legacy Episode 002 content until it is regenerated under the 60-second rule",
    (name) => {
      const result = spawnSync(process.execPath, ["--import", "tsx", `scripts/${name}.ts`], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {...process.env, EPISODE_ID: "episode-002"},
        timeout: 30_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status, `${name} stderr:\n${result.stderr}`).toBe(1);
      expect(result.stderr).toMatch(/时长/u);
    },
  );

  it.each(mediaBoundValidators)(
    "%s uses the shared CLI contract without requiring ignored media fixtures",
    (name) => {
      const source = fs.readFileSync(path.join(repoRoot, `scripts/${name}.ts`), "utf8");

      expect(source).toContain('from "./lib/validation"');
      expect(source).toContain("installCliErrorHandlers();");
      expect(source).toContain("finishValidation(");
      expect(source).not.toMatch(/process\.exit\(1\)|spawnSync\(/u);
    },
  );
});
