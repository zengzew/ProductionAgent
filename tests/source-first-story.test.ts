import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {
  parseStorySpine,
  sourceFirstCreativeRoles,
  sourceFirstWorkflowSchema,
  validateSourceFirstStory,
  validateSourceFirstWorkflow,
} from "../src/lib/editorial/source-first";
import {repoRoot} from "../src/lib/episode/paths";

const spineFixture = `# Story Spine

状态：\`spine-ready\`

## Source
- Title: A product story
- Speaker: The team
- URL: https://example.com/story
- Published: 2025-01-22

## Story question
用户为什么从好玩的原型转向真正能用的产品？

## Source beats
| Beat | Source location | What changes | Relation to previous | Necessary premise / Claims |
| --- | --- | --- | --- | --- |
| B01 | 00:10 | 团队发现早期工具只是好玩 | 起点 | 需要先知道用户把它当作原型；待核验 |
| B02 | 01:25 | 用户开始要求完整产品能力 | 问题回答 | 需要保留需求变化；claim-example-001 |
| B03 | 02:40 | 团队把能力接到真实工作流 | 来源声称的因果 | 不能外推成增长保证；claim-example-002 |
`;

describe("Source-First content contract", () => {
  it("parses a source spine in source order without inventing a beat count", () => {
    const spine = parseStorySpine(spineFixture);
    expect(spine.title).toBe("A product story");
    expect(spine.storyQuestion).toContain("原型");
    expect(spine.beats.map((beat) => beat.id)).toEqual(["B01", "B02", "B03"]);
    expect(spine.beats[1]?.relation).toBe("问题回答");
  });

  it("rejects duplicate or out-of-order source beats", () => {
    expect(() => parseStorySpine(spineFixture.replace("| B03 |", "| B02 |"))).toThrow(/拍点重复/u);
  });

  it("accepts the three creative stages without legacy director or oral stages", () => {
    const episodeId = "episode-source-first-test";
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "source-first-workflow-"));
    const artifacts = sourceFirstCreativeRoles.map((role) => {
      const relative = `content/${episodeId}/story/${role}.md`;
      const absolute = path.join(tempRoot, relative);
      fs.mkdirSync(path.dirname(absolute), {recursive: true});
      fs.writeFileSync(absolute, `${role}\n`);
      return relative;
    });
    const workflow = sourceFirstWorkflowSchema.parse({
      schemaVersion: "source-first-workflow-v1",
      episodeId,
      coreStoryQuestion: "用户为什么留下来？",
      currentStatus: "in-progress",
      stages: sourceFirstCreativeRoles.map((role, index) => ({
        id: role,
        owner: role,
        status: "complete",
        artifacts: [artifacts[index]],
        decision: "完成交接",
      })),
      decisions: [],
    });

    expect(workflow.stages.map((stage) => stage.id)).toEqual([...sourceFirstCreativeRoles]);
    expect(
      validateSourceFirstWorkflow({
        workflow,
        episodeId,
        resolveArtifact: (relative) => path.join(tempRoot, relative),
      }),
    ).toEqual([]);
  });

  it("requires existing fact and visual responsibilities before story approval", () => {
    const episodeId = "episode-source-first-approval-test";
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "source-first-approval-"));
    const workflow = sourceFirstWorkflowSchema.parse({
      schemaVersion: "source-first-workflow-v1",
      episodeId,
      coreStoryQuestion: "产品怎样被真正用起来？",
      currentStatus: "story-approved",
      stages: sourceFirstCreativeRoles.map((role) => ({
        id: role,
        owner: role,
        status: "complete",
        artifacts: [`content/${episodeId}/story/${role}.md`],
        decision: "完成交接",
      })),
      decisions: [],
    });

    expect(
      validateSourceFirstWorkflow({
        workflow,
        episodeId,
        resolveArtifact: (relative) => path.join(tempRoot, relative),
      }),
    ).toEqual(
      expect.arrayContaining([
        "story-approved 缺少 fact-guardian stage",
        "story-approved 缺少 visual-director stage",
      ]),
    );
  });

  it("validates the six Source-First artifacts without requiring the legacy eight story files", () => {
    const episodeId = "episode-source-first-content-test";
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "source-first-content-"));
    const sourceEpisodeRoot = path.join(tempRoot, "content", episodeId);
    const legacyEpisodeRoot = path.join(repoRoot, "content/episode-008");
    fs.mkdirSync(path.join(sourceEpisodeRoot, "research"), {recursive: true});
    fs.mkdirSync(path.join(sourceEpisodeRoot, "story"), {recursive: true});

    const config = JSON.parse(
      fs.readFileSync(path.join(legacyEpisodeRoot, "episode.config.json"), "utf8"),
    ) as {id: string};
    config.id = episodeId;
    fs.writeFileSync(
      path.join(sourceEpisodeRoot, "episode.config.json"),
      `${JSON.stringify(config)}\n`,
    );
    fs.copyFileSync(
      path.join(legacyEpisodeRoot, "research/facts.json"),
      path.join(sourceEpisodeRoot, "research/facts.json"),
    );
    for (const file of [
      "script-draft.md",
      "final-script.md",
      "critic-report.md",
      "fact-check-report.md",
      "visual-plan.md",
    ]) {
      fs.copyFileSync(
        path.join(legacyEpisodeRoot, "story", file),
        path.join(sourceEpisodeRoot, "story", file),
      );
    }
    fs.writeFileSync(path.join(sourceEpisodeRoot, "story/story-spine.md"), spineFixture);

    expect(
      validateSourceFirstStory({
        episodeId,
        episodeRoot: sourceEpisodeRoot,
      }),
    ).toEqual([]);
    expect(fs.existsSync(path.join(sourceEpisodeRoot, "story/story-bible.md"))).toBe(false);
    expect(fs.existsSync(path.join(sourceEpisodeRoot, "story/oral-review.md"))).toBe(false);
  });
});
