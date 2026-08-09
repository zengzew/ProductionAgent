import {describe, expect, it} from "vitest";
import timelineRaw from "../src/poke-timeline.generated.json";
import {timelineSchema} from "../src/schemas/episode";
import {
  assertTimelineMatchesEpisode,
  generatedCaptionsPath,
  generatedTimelinePath,
  getRenderContract,
} from "../src/lib/render-contract";

describe("render contract", () => {
  it("maps every supported episode to an explicit composition and generated prefix", () => {
    expect(getRenderContract("episode-001")).toEqual({
      composition: "PokeVertical",
      smokeComposition: "PokeVerticalSmoke",
      generatedPrefix: "poke",
      layoutVariant: "poke-standard",
    });
    expect(getRenderContract("episode-002").composition).toBe("RoostVertical");
    expect(getRenderContract("episode-002").layoutVariant).toBe("roost-standard");
    expect(generatedTimelinePath("episode-002")).toBe("src/episode-002-timeline.generated.json");
    expect(generatedCaptionsPath("episode-001")).toBe("src/poke-captions.generated.json");
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
});
