import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("LEGACY-005 wrapper episode forwarding", () => {
  it("keeps validate:story as a single process that forwards argv", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as {scripts: Record<string, string>};
    expect(packageJson.scripts["validate:story"]).toBe("tsx scripts/validate-story.ts");
    expect(packageJson.scripts["validate:episode"]).toBe("tsx scripts/validate-episode.ts");
    const source = fs.readFileSync(path.join(repoRoot, "scripts/validate-story.ts"), "utf8");
    expect(source).toContain("validate-workflow.ts");
    expect(source).toContain("process.argv.slice(2)");
  });

  it("fails the nested workflow validator for a non-default missing episode", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/validate-story.ts", "--episode", "episode-legacy-005-missing"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 30_000,
        env: {...process.env, VITEST: undefined, VITEST_WORKER_ID: undefined},
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/content\/episode-legacy-005-missing\/story\/workflow\.json/u);
    expect(output).not.toMatch(/content\/episode-001\/story\/workflow\.json/u);
  });
});
