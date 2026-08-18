import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import timelineRaw from "../content/episode-001/production/timeline.json";
import {timelineSchema} from "../src/schemas/episode";
import {EPISODE_ROOT_ALIASES, episodeRepositoryRoot, repoRoot} from "../src/lib/episode/paths";
import {
  assertTimelineMatchesEpisode,
  generatedCaptionsPath,
  generatedTimelinePath,
  getRenderContract,
} from "../src/lib/episode/render-contract";

describe("render contract", () => {
  it("maps every supported episode to an explicit renderer and composition", () => {
    expect(getRenderContract("episode-001")).toEqual({
      renderer: "legacy-composition",
      composition: "PokeVertical",
      smokeComposition: "PokeVerticalSmoke",
      layoutVariant: "poke-standard",
    });
    expect(getRenderContract("episode-002").composition).toBe("RoostVertical");
    expect(getRenderContract("episode-002").renderer).toBe("legacy-composition");
    expect(getRenderContract("episode-002").layoutVariant).toBe("roost-standard");
    expect(getRenderContract("episode-004")).toMatchObject({
      renderer: "media-mix",
      composition: "MediaMixVertical",
    });
    expect(getRenderContract("episode-005").renderer).toBe("media-mix");
    expect(getRenderContract("episode-m5e2e").renderer).toBe("media-mix");
    expect(generatedTimelinePath("episode-002")).toBe(
      "content/episode-002/production/timeline.json",
    );
    expect(generatedCaptionsPath("episode-001")).toBe(
      "content/episode-001/production/captions.generated.json",
    );
  });

  it("fails closed for an episode without a registered composition", () => {
    expect(() => getRenderContract("episode-999")).toThrow(/没有为 episode-999 配置渲染契约/u);
  });

  it("rejects a generated timeline whose audio belongs to another episode", () => {
    const timeline = timelineSchema.parse(timelineRaw);
    const mismatched = {
      ...timeline,
      scenes: timeline.scenes.map((scene, index) =>
        index === 0 ? {...scene, audio: "episodes/episode-002/audio/seg-001.mp3"} : scene,
      ),
    };
    expect(() => assertTimelineMatchesEpisode(mismatched, "episode-001")).toThrow(
      /时间轴与当前 episode 不一致/u,
    );
    expect(() => assertTimelineMatchesEpisode(timeline, "episode-001")).not.toThrow();
  });

  it("keeps only MediaMix and shared compositions at the compositions root", () => {
    const rootFiles = fs
      .readdirSync(path.join(repoRoot, "src/compositions"))
      .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
      .sort();
    expect(rootFiles).toEqual(["MediaMixEpisode.tsx", "shared.tsx"]);
    expect(fs.existsSync(path.join(repoRoot, "src/compositions/legacy/PokeEpisode.tsx"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(repoRoot, "src/lib/poke-sound-design.ts"))).toBe(false);
  });

  it("resolves historical flat IDs to nested packages and keeps content/ free of aliases", () => {
    expect(episodeRepositoryRoot("episode-001")).toBe("content/episode-001");
    expect(episodeRepositoryRoot("episode-001-v2-goal3")).toBe("content/episode-001/v2-goal3");
    expect(episodeRepositoryRoot("episode-002-v2-goal3")).toBe("content/episode-002/v2-goal3");
    expect(() => getRenderContract("episode-001-v2-goal3")).toThrow(/没有为 episode-001-v2-goal3/u);
    const contentRoot = path.join(repoRoot, "content");
    const leftoverAliases = fs
      .readdirSync(contentRoot)
      .filter((name) => Object.keys(EPISODE_ROOT_ALIASES).includes(name));
    expect(leftoverAliases).toEqual([]);
    const contentSymlinks = fs
      .readdirSync(contentRoot)
      .filter((name) => fs.lstatSync(path.join(contentRoot, name)).isSymbolicLink());
    expect(contentSymlinks).toEqual([]);
  });
});
