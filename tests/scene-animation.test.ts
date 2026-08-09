import {describe, expect, it} from "vitest";
import {fadeSceneOpacity} from "../src/lib/scene-animation";

describe("scene fade animation", () => {
  it.each([1, 2, 8, 11, 22, 60])(
    "keeps short and normal scene opacity finite for duration %s",
    (duration) => {
      const values = Array.from({length: duration + 1}, (_, frame) =>
        fadeSceneOpacity(frame, duration),
      );
      expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
        true,
      );
      expect(values[0]).toBeGreaterThanOrEqual(0);
      expect(values.at(-1)).toBe(0);
    },
  );

  it("keeps the first frame visible when a scene starts visible", () => {
    expect(fadeSceneOpacity(0, 8, true)).toBe(1);
    expect(fadeSceneOpacity(8, 8, true)).toBe(0);
  });
});
