import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {episodeRoot} from "../src/lib/project";
import {
  containsGenericCta,
  findMissingHookCandidateFields,
  findVisualAssetContractViolations,
} from "../src/lib/story-quality";

describe("story quality contract", () => {
  it("requires every Hook candidate to declare result, evidence and progression", () => {
    const markdown = fs.readFileSync(path.join(episodeRoot, "story/hook-candidates.md"), "utf8");
    expect(findMissingHookCandidateFields(markdown)).toEqual([]);
  });

  it("reports the exact missing Hook candidate fields", () => {
    expect(findMissingHookCandidateFields(`## Hook A\n\n- 首帧结果：日历已经移动。\n`)).toEqual([
      {heading: "Hook A", field: "同期证据："},
      {heading: "Hook A", field: "递进台阶："},
      {heading: "Hook A", field: "自然误解："},
    ]);
  });

  it("rejects generic engagement CTAs without rejecting a concrete unresolved question", () => {
    expect(containsGenericCta("你觉得这个创意怎么样？关注我们。")).toBe(true);
    expect(containsGenericCta("下一次日历出错后，你还会不会继续发消息？")).toBe(false);
    expect(containsGenericCta("用户把链接转发给朋友，三天后十万人加入俱乐部。")).toBe(false);
  });

  it("requires rendered real visuals to carry a source URL and Claim IDs", () => {
    expect(
      findVisualAssetContractViolations({
        type: "recording",
        usedInRender: true,
        sourceUrl: "",
        claimIds: [],
      }),
    ).toEqual(["sourceUrl", "claimIds"]);
    expect(
      findVisualAssetContractViolations({
        type: "generated",
        usedInRender: true,
        sourceUrl: "",
        claimIds: [],
      }),
    ).toEqual([]);
  });
});
