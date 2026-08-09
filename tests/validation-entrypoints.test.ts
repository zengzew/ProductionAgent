import path from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const validators = [
  "validate-research",
  "validate-workflow",
  "validate-story",
  "validate-content",
  "validate-delivery",
  "validate-comparison",
] as const;

describe("validation CLI entrypoints", () => {
  it.each(validators)("runs %s with the canonical episode", (name) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", `scripts/${name}.ts`], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {...process.env, EPISODE_ID: "episode-001"},
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${name} stderr:\n${result.stderr}`).toBe(0);
  });
});
