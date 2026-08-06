import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {importLegacyEpisode001} from "../../src/orchestration";

const hashFile = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

describe("M1.2 read-only Episode 001 legacy import", () => {
  it("creates legacy-derived references and explicit unavailable telemetry without changing bytes", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const workflowPath = path.join(repoRoot, "content/episode-001/story/workflow.json");
    const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8")) as {
      stages: {artifacts: string[]}[];
    };
    const sourcePaths = [
      "content/episode-001/story/workflow.json",
      ...workflow.stages.flatMap((stage) => stage.artifacts),
    ];
    const before = Object.fromEntries(
      sourcePaths.map((sourcePath) => [sourcePath, hashFile(path.join(repoRoot, sourcePath))]),
    );

    const imported = importLegacyEpisode001({
      repoRoot,
      occurredAt: "2026-08-05T00:00:00.000Z",
    });
    const after = Object.fromEntries(
      sourcePaths.map((sourcePath) => [sourcePath, hashFile(path.join(repoRoot, sourcePath))]),
    );

    expect(after).toEqual(before);
    expect(imported.workflowRef.schemaVersion).toBe("director-workflow-v1");
    expect(
      Object.values(imported.artifacts).every((ref) => ref.producer === "legacy-derived"),
    ).toBe(true);
    expect(imported.artifactIndex.artifacts.every((record) => record.state === "selected")).toBe(
      true,
    );
    expect(imported.executionEvents).toHaveLength(11);
    for (const event of imported.executionEvents) {
      expect(event.environment.runnerVersion).toBe("legacy-derived");
      expect(event.model).toBeNull();
      expect(event.prompt).toBeNull();
      expect(event.usage.availability).toBe("unavailable");
      expect(event.usage.totalTokens).toBeNull();
      expect(event.usage.cost.amount).toBeNull();
      expect(event.timing.durationMs).toBeNull();
    }
  });
});
