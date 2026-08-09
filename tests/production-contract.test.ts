import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {episodeConfigSchema, timelineSchema} from "../src/schemas/episode";
import {readJson, repoRoot} from "../src/lib/project";
import {
  assertEpisodeMatchesProductionContract,
  assertTimelineMatchesProductionContract,
  containsConfiguredHookAction,
  expectedFrameRate,
  productionContract,
  productionContractSchema,
  startsWithConfiguredAttribution,
  timelineTailSeconds,
} from "../src/lib/production-contract";

const loadEpisode = (episodeId: string) =>
  episodeConfigSchema.parse(
    readJson<unknown>(path.join(repoRoot, "content", episodeId, "episode.config.json")),
  );

describe("production contract", () => {
  it("owns the global duration, fps, vertical and caption limits", () => {
    expect(productionContract.schemaVersion).toBe("production-contract-v1");
    expect(productionContract.delivery).toMatchObject({
      hardMaximumSeconds: 180,
      fps: 30,
      vertical: {width: 1080, height: 1920},
    });
    expect(expectedFrameRate()).toBe("30/1");
    expect(
      productionContractSchema.safeParse({
        ...productionContract,
        delivery: {...productionContract.delivery, fps: 0},
      }).success,
    ).toBe(false);
  });

  it.each(["episode-001", "episode-002", "episode-001-v2-goal3", "episode-002-v2-goal3"])(
    "validates %s without script-specific production constants",
    (episodeId) => {
      const episode = loadEpisode(episodeId);
      expect(() => assertEpisodeMatchesProductionContract(episode)).not.toThrow();
      expect(episode).not.toHaveProperty("fps");
      expect(episode).not.toHaveProperty("hardMaximumSeconds");
      expect(episode).not.toHaveProperty("vertical");
    },
  );

  it("resolves default and episode-specific timeline tail padding", () => {
    const episode = loadEpisode("episode-002");
    expect(timelineTailSeconds(episode, {id: "seg-001", section: "hook"})).toBe(
      productionContract.timeline.hookTailSeconds,
    );
    expect(timelineTailSeconds(episode, {id: "seg-009", section: "body"})).toBe(
      productionContract.timeline.bodyTailSeconds,
    );
    expect(timelineTailSeconds(episode, {id: "seg-012", section: "ending"})).toBe(2.4);
  });

  it("validates timeline fps, duration arithmetic and the hard maximum", () => {
    const timeline = timelineSchema.parse(
      readJson<unknown>(path.join(repoRoot, "content/episode-001/production/timeline.json")),
    );
    expect(() => assertTimelineMatchesProductionContract(timeline)).not.toThrow();
    expect(() =>
      assertTimelineMatchesProductionContract({...timeline, fps: timeline.fps + 1}),
    ).toThrow(/fps/u);
    expect(() =>
      assertTimelineMatchesProductionContract({
        ...timeline,
        totalSeconds: productionContract.delivery.hardMaximumSeconds,
        totalFrames:
          productionContract.delivery.hardMaximumSeconds * productionContract.delivery.fps,
      }),
    ).toThrow(/严格小于/u);
  });

  it("derives Hook action and attribution checks from the shared and episode contracts", () => {
    const episode = loadEpisode("episode-002");
    expect(containsConfiguredHookAction("打开消息，回复朋友")).toBe(true);
    expect(startsWithConfiguredAttribution("Roost 表示今天上线", episode)).toBe(true);
    expect(startsWithConfiguredAttribution("先打开消息", episode)).toBe(false);
  });

  it("validates asset URLs, files and capture anchors in episode configuration", () => {
    const episode = loadEpisode("episode-001");
    expect(episode.captureAssets.some((asset) => asset.anchor?.name === "March 19, 2026")).toBe(
      true,
    );
    expect(
      episodeConfigSchema.safeParse({
        ...episode,
        captureAssets: [
          {
            file: "release.png",
            url: "https://example.com/releases",
            anchor: {role: "button", name: "Release"},
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps listed production scripts free of retired local constants", () => {
    const files = [
      "scripts/build-timeline.ts",
      "scripts/inspect-output.ts",
      "scripts/validate-comparison.ts",
      "scripts/validate-delivery.ts",
      "src/orchestration/evaluation.ts",
      "scripts/validate-content.ts",
      "src/lib/capture-assets.ts",
    ];
    const source = files
      .map((file) => fs.readFileSync(path.join(repoRoot, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/(?:>=|>|===|!==)\s*180\b/u);
    expect(source).not.toMatch(/(?:const\s+fps\s*=|r_frame_rate\s*!==)\s*["']?30/u);
    expect(source).not.toMatch(/segment\.id\s*===\s*["']seg-0(?:10|11|12)["']/u);
    expect(source).not.toContain("Cognition|Poke");
  });
});
