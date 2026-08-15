import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {findTextRuleViolations, loadEditorialTextRules} from "../src/lib/editorial-text-rules";

const rules = loadEditorialTextRules();
const hits = (episodeId: string, narration: string) =>
  findTextRuleViolations(narration, rules, "content", episodeId).map((item) => item.id);

describe("M1.3 baseline gate compatibility", () => {
  it("grandfathers only the delivery-bound Episode 001 v1 Beta wording", () => {
    const script = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, "../content/episode-001/story/script.json"),
        "utf8",
      ),
    ) as {segments: {narration: string}[]};
    const narration = script.segments.map((segment) => segment.narration).join("\n");

    expect(hits("episode-001", narration)).not.toContain("product-stage-beta-user");
    expect(hits("episode-001", "Beta 用户把用途带出邮箱")).toContain("product-stage-beta-user");
    expect(hits("episode-001", "产品进入一般可用状态")).toContain("product-stage-beta-user");
  });

  it("keeps the product-stage rule active for every later episode", () => {
    expect(hits("episode-002", "Beta 用户把用途带出邮箱")).toContain("product-stage-beta-user");
    expect(hits("episode-new", "内测用户把用途带出邮箱")).not.toContain("product-stage-beta-user");
  });
});
