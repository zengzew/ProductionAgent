import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const trackedArtifactValidators = [
  "validate-research",
  "validate-story",
  "validate-content",
] as const;
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
