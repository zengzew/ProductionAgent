import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {episodeRoot} from "../src/lib/episode/paths";
import {
  containsGenericCta,
  endsWithQuestion,
  findActionVisualIntentViolations,
  findMissingHookCandidateFields,
  findSeenActionViolations,
  findVisualAssetContractViolations,
  parseVisualPlanSections,
  parseVisualPlanV3Sections,
} from "../src/lib/editorial/story-quality";

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

  it("detects generic engagement CTAs independently from ending questions", () => {
    expect(containsGenericCta("你觉得这个创意怎么样？关注我们。")).toBe(true);
    expect(containsGenericCta("下一次日历出错后，你还会不会继续发消息？")).toBe(false);
    expect(containsGenericCta("用户把链接转发给朋友，三天后十万人加入俱乐部。")).toBe(false);
  });

  it("rejects question endings under the positive product-story contract", () => {
    expect(endsWithQuestion("一个月后还会不会回来？")).toBe(true);
    expect(endsWithQuestion("这只鸟继续飞向朋友。")).toBe(false);
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

  it("reports missing Visual Director fields by segment", () => {
    expect(
      parseVisualPlanSections(`## seg-001

- Scene structure: 结果已经出现。
- Visual evidence: 官网截图。
- Claim IDs: claim-demo-001
`).missing,
    ).toEqual([
      {segmentId: "seg-001", field: "Narrative purpose"},
      {segmentId: "seg-001", field: "Viewer state in"},
      {segmentId: "seg-001", field: "Viewer state out"},
      {segmentId: "seg-001", field: "New information"},
      {segmentId: "seg-001", field: "Animation ideas"},
      {segmentId: "seg-001", field: "Asset requirements"},
      {segmentId: "seg-001", field: "Pacing"},
      {segmentId: "seg-001", field: "Render target"},
    ]);
  });

  it("requires v3 visual plans to show the narrated action instead of a landing page", () => {
    const parsed = parseVisualPlanV3Sections(`## seg-001

- Visible action: 任务已发出。
- Evidence type: still-page
- Focal crop: 官网首页
- Visual event: 轻微呼吸灯
- Media preference: 官网截图
`);
    expect(parsed.missing).toEqual([]);
    expect(
      findSeenActionViolations(parsed.sections, new Map([["seg-001", "它自己打开网页去办。"]])),
    ).toEqual(
      expect.arrayContaining([
        "seg-001 旁白包含产品动作，但 Evidence type 仍是 still-page",
        "seg-001 的 Visual event 必须写出可观察变化，不能只写氛围或空切",
        "seg-001 Hook 第一段不能用 still-page 证明开场动作",
      ]),
    );
    expect(
      findActionVisualIntentViolations([
        {
          id: "seg-001",
          narration: "它自己打开网页去办。",
          visualIntent: "配一张官网首页。",
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        "seg-001 的 visualIntent 必须写出至少两步可见变化",
        "seg-001 不能只用官网首页代替动作过程",
      ]),
    );
  });
});
