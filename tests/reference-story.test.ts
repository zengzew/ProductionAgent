import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {createFoundationGraph} from "../src/orchestration/graph/main-graph";
import {
  createReferenceContentNode,
  referenceContentStages,
} from "../src/orchestration/graph/reference-content";
import {
  createLocalCheckpoint,
  checkpointConfig,
  resumeCheckpoint,
} from "../src/orchestration/checkpoint";
import {buildArtifactRef} from "../src/orchestration/artifact-registry";
import {createInitialProductionState} from "../src/orchestration/state";
import {episodeConfigSchema} from "../src/schemas/episode";
import {referenceStorySchema} from "../src/schemas/reference-story";
import {validateSourceFirstStory} from "../src/lib/editorial/source-first";
import {timelineTailSeconds} from "../src/lib/episode/production-contract";
import {runEpisodeOrchestrator} from "../src/orchestration/production-entrypoint";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, {recursive: true, force: true})));
const digest = (text: string): string => crypto.createHash("sha256").update(text).digest("hex");
const presentation = referenceStorySchema.parse({
  profile: "golden-reference-v1",
  headline: "用聊天做一个应用",
  resultLine: "保存的记录，刷新后仍在",
  claimIds: ["claim-lovable-004"],
});

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reference-story-"));
  roots.push(root);
  const episodeId = "episode-008";
  const episodeRoot = path.join(root, "content", episodeId);
  const original = path.resolve("content", episodeId);
  for (const dir of ["research", "story"])
    fs.mkdirSync(path.join(episodeRoot, dir), {recursive: true});
  fs.copyFileSync(
    path.join(original, "research/facts.json"),
    path.join(episodeRoot, "research/facts.json"),
  );
  const config = episodeConfigSchema.parse(
    JSON.parse(fs.readFileSync(path.join(original, "episode.config.json"), "utf8")),
  );
  config.production.referenceStory = presentation;
  config.production.timelineTailSeconds = {};
  fs.writeFileSync(path.join(episodeRoot, "episode.config.json"), JSON.stringify(config));
  for (const file of [
    "script-draft.md",
    "final-script.md",
    "critic-report.md",
    "fact-check-report.md",
    "visual-plan.md",
  ]) {
    fs.copyFileSync(path.join(original, "story", file), path.join(episodeRoot, "story", file));
  }
  fs.writeFileSync(
    path.join(episodeRoot, "story/story-spine.md"),
    `# Spine
## Source
- Title: Official demo
- Speaker: Team
- URL: https://example.com/demo
- Published: 2025-01-01
## Story question
怎样保存用户输入？
## Source beats
| Beat | Source location | What changes | Relation | Necessary premise / Claims |
| --- | --- | --- | --- | --- |
| B01 | 00:01 | 保存记录 | 起点 | claim-lovable-004 |
`,
  );
  const scriptPath = path.join(episodeRoot, "story/final-script.md");
  let hookIndex = 0;
  const previous = fs.readFileSync(scriptPath, "utf8");
  const script = previous.replaceAll("- Section: `hook`", () =>
    ++hookIndex === 1 ? "- Section: `hook`" : "- Section: `body`",
  );
  fs.writeFileSync(scriptPath, script);
  for (const file of ["fact-check-report.md", "visual-plan.md"]) {
    const filePath = path.join(episodeRoot, "story", file);
    let text = fs.readFileSync(filePath, "utf8").replaceAll(digest(previous), digest(script));
    if (file === "fact-check-report.md")
      text += `\n- Reference title SHA-256: ${digest(JSON.stringify(presentation))}\n`;
    fs.writeFileSync(filePath, text);
  }
  return {root, episodeId, episodeRoot, config};
};

describe("reference-driven production contract", () => {
  it("accepts a short opening with full visual coverage and a reviewed title", () => {
    const input = fixture();
    expect(validateSourceFirstStory(input)).toEqual([]);
    expect(timelineTailSeconds(input.config, {id: "seg-002", section: "body"})).toBe(0.12);
    input.config.production.timelineTailSeconds["seg-002"] = 0.4;
    expect(timelineTailSeconds(input.config, {id: "seg-002", section: "body"})).toBe(0.4);
    delete input.config.production.referenceStory;
    expect(timelineTailSeconds(input.config, {id: "seg-003", section: "body"})).toBe(0.9);
  });

  it("rejects a changed persistent title after fact review", () => {
    const input = fixture();
    input.config.production.referenceStory!.resultLine = "另一条尚未审核的结果";
    fs.writeFileSync(
      path.join(input.episodeRoot, "episode.config.json"),
      JSON.stringify(input.config),
    );
    expect(validateSourceFirstStory(input)).toContain("Fact Guardian 未核对当前常驻标题版本");
  });

  it("rejects a READY label with missing visual handoffs", () => {
    const input = fixture();
    const file = path.join(input.episodeRoot, "story/visual-plan.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/- Visible action: .+\n/gu, ""));
    expect(
      validateSourceFirstStory(input).some((error) => error.includes("缺少 Visible action")),
    ).toBe(true);
  });

  it("routes manual episodes to the reference guide", async () => {
    const input = fixture();
    const result = await runEpisodeOrchestrator({
      repoRoot: input.root,
      episodeId: input.episodeId,
      env: {ORCHESTRATOR: "manual"},
    });
    expect(result.nextAction).toContain("agents/reference-producer.md");
  });

  it("checkpoints the six file handoffs and pauses at real content approval without legacy role executions", async () => {
    const input = fixture();
    // Research-validator process is a stub here; its own contracts have separate tests.
    fs.mkdirSync(path.join(input.root, "scripts"));
    fs.writeFileSync(path.join(input.root, "scripts/validate-research.ts"), "process.exit(0);");
    fs.symlinkSync(path.resolve("node_modules"), path.join(input.root, "node_modules"), "dir");
    fs.cpSync(
      path.resolve("content/episode-008/research"),
      path.join(input.episodeRoot, "research"),
      {recursive: true},
    );
    fs.copyFileSync(
      path.resolve("content/episode-008/story/caption-plan.json"),
      path.join(input.episodeRoot, "story/caption-plan.json"),
    );
    const workflow = {
      schemaVersion: "source-first-workflow-v1",
      episodeId: input.episodeId,
      coreStoryQuestion: "如何做应用？",
      currentStatus: "in-progress",
      decisions: [],
      stages: referenceContentStages.map((stage) => ({
        id: stage.role,
        owner: stage.role,
        status: stage.role === "narrative-adapter" ? "pending" : "complete",
        artifacts: stage.files.map((file) => `content/${input.episodeId}/${file}`),
        decision: "Reviewed fixture",
      })),
    };
    const workflowPath = path.join(input.episodeRoot, "story/workflow.json");
    fs.writeFileSync(workflowPath, JSON.stringify(workflow));
    // Force a real capability pause in the middle; the preceding stage checkpoints survive.
    fs.renameSync(
      path.join(input.episodeRoot, "story/script-draft.md"),
      path.join(input.episodeRoot, "story/script-draft.saved"),
    );
    const control = buildArtifactRef({
      repoRoot: input.root,
      episodeId: input.episodeId,
      artifactId: `${input.episodeId}:control:config`,
      path: `content/${input.episodeId}/episode.config.json`,
      schemaVersion: "episode-config-v2",
      mediaType: "application/json",
      producer: "test",
      createdAt: new Date().toISOString(),
    });
    const graph = createFoundationGraph({
      repoRoot: input.root,
      checkpointer: createLocalCheckpoint({repoRoot: input.root}),
      runAgent: async () => {
        throw new Error("Legacy role must not run");
      },
      referenceContent: createReferenceContentNode({repoRoot: input.root}),
    });
    const config = checkpointConfig(input.episodeId);
    const initial = createInitialProductionState({
      episodeId: input.episodeId,
      runId: "reference-migration",
      artifacts: {control},
    });
    const paused = await graph.invoke(initial, config);
    expect(paused.completedAgents).toEqual([]);
    expect(paused.decisions["reference:spine-extractor"]?.code).toBe("REFERENCE_STAGE_RECORDED");
    expect(JSON.stringify(paused)).toContain("reference-content:");
    fs.renameSync(
      path.join(input.episodeRoot, "story/script-draft.saved"),
      path.join(input.episodeRoot, "story/script-draft.md"),
    );
    workflow.currentStatus = "story-approved";
    workflow.stages.forEach((stage) => {
      stage.status = "complete";
    });
    fs.writeFileSync(workflowPath, JSON.stringify(workflow));
    const reviewed = await graph.invoke(resumeCheckpoint({}), config);
    expect(reviewed.completedAgents).toEqual([]);
    expect(reviewed.gates["reference-content"]).toBe("pass");
    expect(reviewed.decisions["reference-content"]?.code).toBe("REFERENCE_CONTENT_READY");
    expect(
      Object.keys(reviewed.decisions).filter((key) => key.startsWith("reference:")),
    ).toHaveLength(6);
    expect(JSON.stringify(reviewed)).toContain("content-approval");
    expect(reviewed.productionAuthorization).toBeNull();
  }, 15000);
});
