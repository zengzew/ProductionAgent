import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {parseRetentionGate} from "../src/lib/editorial/story";
import {directorWorkflowSchema, orderedStoryRoles} from "../src/lib/episode/workflow";
import {episodeRoot, readJson, repoRoot} from "../src/lib/episode/paths";

describe("director-driven artifact workflow", () => {
  const workflow = directorWorkflowSchema.parse(
    readJson<unknown>(path.join(episodeRoot, "story/workflow.json")),
  );

  it("assigns every production stage and major decision to an owner", () => {
    expect(workflow.stages.map((stage) => stage.id)).toEqual(orderedStoryRoles);
    expect(workflow.stages.every((stage) => stage.owner === stage.id)).toBe(true);
    expect(new Set(workflow.decisions.map((decision) => decision.owner))).toEqual(
      new Set([
        "story-director",
        "viral-director",
        "script-writer",
        "oral-rewriter",
        "audience-critic",
        "fact-guardian",
        "visual-director",
        "retention-critic",
        "delivery-critic",
      ]),
    );
  });

  it("rejects duplicate stage roles even when the stage count is unchanged", () => {
    const duplicate = {
      ...workflow,
      stages: workflow.stages.map((stage, index) =>
        index === 1 ? {...stage, id: workflow.stages[0]!.id} : stage,
      ),
    };
    expect(directorWorkflowSchema.safeParse(duplicate).success).toBe(false);
  });

  it("closes rejected retention feedback through routed artifact revisions", () => {
    const rejected = workflow.reviewCycles.find((cycle) => cycle.verdict === "REJECT");
    expect(rejected).toBeDefined();
    expect(rejected?.routes.length).toBeGreaterThan(0);
    expect(rejected?.routes.every((route) => route.status === "resolved")).toBe(true);
    expect(
      workflow.reviewCycles.some(
        (cycle) =>
          cycle.critic === rejected?.critic &&
          cycle.round > (rejected?.round ?? 0) &&
          cycle.verdict === "PASS",
      ),
    ).toBe(true);
  });

  it("records why a viewer would leave and what the responsible role changed", () => {
    const reports = workflow.reviewCycles
      .filter((cycle) => cycle.critic === "retention-critic")
      .map((cycle) =>
        parseRetentionGate(fs.readFileSync(path.join(repoRoot, cycle.reportPath), "utf8")),
      );
    const rejected = reports.find((report) => report.verdict === "REJECT");
    const passed = reports.find((report) => report.verdict === "PASS");
    expect(rejected?.viewerExitRisks.every((risk) => risk.whyViewerStops.length > 0)).toBe(true);
    expect(passed?.resolvedFeedback.map((item) => item.feedbackId).sort()).toEqual(
      rejected?.viewerExitRisks.map((risk) => risk.id).sort(),
    );
  });
});
