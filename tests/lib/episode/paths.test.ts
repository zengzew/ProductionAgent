import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {readJson, repoRoot, resolveEpisodeId} from "../../../src/lib/episode/paths";

describe("lib episode paths", () => {
  it("resolves repoRoot to this package even after the lib split", () => {
    const packageJson = readJson<{name: string}>(path.join(repoRoot, "package.json"));
    expect(packageJson.name).toBe("product-story-video-lab");
    expect(fs.existsSync(path.join(repoRoot, "src/lib/episode/paths.ts"))).toBe(true);
  });

  it("keeps src/lib as four packages with no leftover flat modules", () => {
    const libRoot = path.join(repoRoot, "src/lib");
    const entries = fs.readdirSync(libRoot, {withFileTypes: true});
    expect(entries.filter((entry) => entry.isFile()).map((entry) => entry.name)).toEqual([]);
    expect(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(["delivery", "editorial", "episode", "platform"]);
  });

  it("does not reject benchmark --role/--models when resolving episode", () => {
    expect(
      resolveEpisodeId(
        [
          "node",
          "scripts/benchmark-role.ts",
          "--episode",
          "episode-004",
          "--role",
          "script-writer",
          "--models",
          "default",
        ],
        {},
      ),
    ).toBe("episode-004");
    expect(() =>
      resolveEpisodeId(["node", "scripts/benchmark-role.ts", "--episode"], {}),
    ).toThrow(/缺少值/u);
    expect(() =>
      resolveEpisodeId(
        [
          "node",
          "scripts/benchmark-role.ts",
          "--episode",
          "episode-004",
          "--episode",
          "episode-005",
        ],
        {},
      ),
    ).toThrow(/不能重复/u);
  });
});
