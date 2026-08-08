import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {containsProductStageTranslation} from "../src/lib/baseline-gates";

describe("M1.3 baseline gate compatibility", () => {
  it("grandfathers only the delivery-bound Episode 001 v1 Beta wording", () => {
    const script = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, "../content/episode-001/story/script.json"),
        "utf8",
      ),
    ) as {segments: {narration: string}[]};
    const narration = script.segments.map((segment) => segment.narration).join("\n");

    expect(containsProductStageTranslation("episode-001", narration)).toBe(false);
    expect(containsProductStageTranslation("episode-001", `${narration}\n新版本`)).toBe(true);
    expect(containsProductStageTranslation("episode-001", "产品进入一般可用状态")).toBe(true);
  });

  it("keeps the product-stage rule active for every later episode", () => {
    expect(containsProductStageTranslation("episode-002", "Beta 用户把用途带出邮箱")).toBe(true);
    expect(containsProductStageTranslation("episode-new", "内测用户把用途带出邮箱")).toBe(false);
  });
});
