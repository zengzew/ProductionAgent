import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import type {CaptionPlan, Script, Timeline} from "../../src/schemas/episode";
import {
  captionPlanMismatchIds,
  validateCaptionPlanCoverage,
} from "../../scripts/lib/caption-artifacts";
import {classifyComparisonVerdict, signedScore} from "../../scripts/lib/comparison";
import {runCommand} from "../../scripts/lib/process";
import {
  finishValidation,
  hashFile,
  readGeneratedCaptions,
  readJsonFile,
} from "../../scripts/lib/validation";

const temporaryDirectories: string[] = [];

const temporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "productionagent-validator-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
  process.exitCode = undefined;
});

describe("scripts validation helpers", () => {
  it("hashes files deterministically and reports the JSON path on parse failure", () => {
    const directory = temporaryDirectory();
    const validPath = path.join(directory, "valid.json");
    const invalidPath = path.join(directory, "invalid.json");
    fs.writeFileSync(validPath, '{"ok":true}\n');
    fs.writeFileSync(invalidPath, "{");

    expect(hashFile(validPath)).toBe(
      "e5f1eb4d806641698a35efe20e098efd20d7d57a9b90ee69079d5bb650920726",
    );
    expect(readJsonFile<{ok: boolean}>(validPath)).toEqual({ok: true});
    expect(() => readJsonFile(invalidPath)).toThrow(`无法解析 JSON 文件：${invalidPath}`);
  });

  it("rejects malformed generated caption artifacts at the read boundary", () => {
    const directory = temporaryDirectory();
    const captionsPath = path.join(directory, "captions.json");
    fs.writeFileSync(captionsPath, '[{"sceneId":"seg-001"}]');

    expect(() => readGeneratedCaptions(captionsPath)).toThrow();
  });

  it("uses one caption comparison implementation for validators", () => {
    const script: Script = {
      selectedHook: "hook",
      segments: [
        {
          id: "seg-001",
          section: "hook",
          narration: "打开日历",
          onScreenText: [],
          claimIds: ["fact-001"],
          scene: "calendar",
          visualIntent: "show calendar",
          targetSeconds: 3,
        },
      ],
    };
    const captionPlan: CaptionPlan = {
      segments: [{segmentId: "seg-001", cues: ["打开日历"]}],
    };
    const timeline: Timeline = {
      episodeId: "episode-test",
      layoutVariant: "poke-standard",
      fps: 30,
      totalFrames: 90,
      totalSeconds: 3,
      ttsProvider: "test",
      scenes: [
        {
          ...script.segments[0]!,
          index: 0,
          startFrame: 0,
          durationFrames: 90,
          startSeconds: 0,
          endSeconds: 3,
          audioDurationSeconds: 3,
          audio: "episodes/episode-test/audio/seg-001.mp3",
        },
      ],
    };

    expect(validateCaptionPlanCoverage(script, captionPlan)).toEqual([]);
    expect(
      captionPlanMismatchIds({
        script,
        captionPlan,
        timeline,
        generatedCaptions: [{sceneId: "seg-001", text: "错误字幕"}],
        maximumLineCharacters: 16,
        microCueThresholdSeconds: 1,
      }),
    ).toEqual(["seg-001"]);
  });

  it("preserves command failure details", () => {
    expect(() =>
      runCommand(process.execPath, [
        "-e",
        "process.stderr.write('specific failure'); process.exit(2)",
      ]),
    ).toThrow(/specific failure/u);
  });

  it("sets exitCode without throwing for collected validation failures", () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      expect(finishValidation(["first", "second"], "unused")).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      console.error = originalError;
    }
  });

  it("classifies comparison results without forcing an improvement", () => {
    expect(
      classifyComparisonVerdict({
        hook: {baseline: 7, directorCut: 8},
        story: {baseline: 7, directorCut: 8},
        curiosity: {baseline: 7, directorCut: 8},
        understanding: {baseline: 7, directorCut: 8},
        visual: {baseline: 7, directorCut: 8},
        retention: {baseline: 7, directorCut: 8},
      }),
    ).toBe("IMPROVED");
    expect(
      classifyComparisonVerdict({
        hook: {baseline: 7, directorCut: 8},
        story: {baseline: 7, directorCut: 7},
      }),
    ).toBe("MIXED");
    expect(
      classifyComparisonVerdict({
        hook: {baseline: 7, directorCut: 6},
        story: {baseline: 7, directorCut: 7},
      }),
    ).toBe("NOT_IMPROVED");
    expect(signedScore(-2)).toBe("-2");
  });
});
