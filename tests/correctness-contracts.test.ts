import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, expect, it, vi} from "vitest";
import {parseCliArgs, parseRenderMode} from "../src/lib/cli";
import {captureConfiguredAssets, type CapturePage} from "../src/lib/capture-assets";
import {buildPokeSoundCues} from "../src/lib/poke-sound-design";
import {assertSpawnSucceeded, parseFiniteNumber} from "../src/lib/process";
import {readJson, resolveEpisodeId} from "../src/lib/project";
import {productionContract} from "../src/lib/production-contract";
import {splitSpeechSentences} from "../src/lib/tts-providers";

describe("correctness contracts", () => {
  it("parses named episode flags independently from render mode", () => {
    expect(parseCliArgs(["node", "render.ts", "vertical", "--episode", "episode-002"])).toEqual({
      episode: "episode-002",
      positionals: ["vertical"],
    });
    expect(parseRenderMode(["node", "render.ts", "--episode", "episode-002", "smoke"])).toBe(
      "smoke",
    );
    expect(() => parseCliArgs(["node", "script.ts", "--episode"])).toThrow(/缺少值/u);
    expect(() => parseCliArgs(["node", "script.ts", "--unknown"])).toThrow(/未知参数/u);
    expect(() => parseRenderMode(["node", "render.ts", "smoke", "vertical"])).toThrow(
      /只能指定一个/u,
    );
    expect(() => resolveEpisodeId(["node", "validate-content.ts", "extra"], {})).toThrow(
      /未知位置参数/u,
    );
  });

  it("ignores test-runner argv while keeping its pinned episode environment", () => {
    expect(
      resolveEpisodeId(
        ["node", "vitest", "--episode", "episode-wrong"],
        {EPISODE_ID: "episode-001"},
        true,
      ),
    ).toBe("episode-001");
  });

  it("reports the JSON path and preserves the parser cause", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-json-"));
    const filePath = path.join(directory, "broken.json");
    fs.writeFileSync(filePath, "{not-json");
    try {
      expect.assertions(3);
      try {
        readJson(filePath);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(filePath);
        expect((error as Error).cause).toBeInstanceOf(SyntaxError);
      }
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

  it("skips sound cues whose scene is absent and bounds proportional pulses", () => {
    const withoutHook = buildPokeSoundCues([{id: "seg-010", startFrame: 500, durationFrames: 40}]);
    expect(withoutHook.some((cue) => cue.id === "message-seg-001")).toBe(false);
    expect(withoutHook.every((cue) => cue.from >= 500)).toBe(true);
    expect(withoutHook.every((cue) => cue.from + cue.durationInFrames <= 540)).toBe(true);

    const long = buildPokeSoundCues([{id: "seg-010", startFrame: 0, durationFrames: 400}]);
    expect(long.filter((cue) => cue.file === "pulse.wav").map((cue) => cue.from)).toEqual([
      56, 116, 180, 240, 300,
    ]);
  });

  it("fails capture when a configured anchor is not uniquely present", async () => {
    const screenshot = vi.fn();
    const page: CapturePage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      getByRole: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      }),
      screenshot,
    };

    await expect(
      captureConfiguredAssets(
        [
          {
            file: "release.png",
            url: "https://example.com/releases",
            anchor: {role: "heading", name: "Release"},
          },
        ],
        "/tmp/captures",
        async () => page,
      ),
    ).rejects.toThrow(/锚点必须唯一命中/u);
    expect(screenshot).not.toHaveBeenCalled();
  });

  it("uses every configured capture URL and output file", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const screenshot = vi.fn().mockResolvedValue(undefined);
    const page: CapturePage = {
      goto,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      getByRole: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(1),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      }),
      screenshot,
    };
    await captureConfiguredAssets(
      [{file: "home.png", url: "https://example.com"}],
      "/tmp/captures",
      async () => page,
    );
    expect(goto).toHaveBeenCalledWith("https://example.com", expect.any(Object));
    expect(goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: productionContract.capture.navigationTimeoutMs,
    });
    expect(page.waitForTimeout).toHaveBeenCalledWith(productionContract.capture.pageSettleMs);
    expect(screenshot).toHaveBeenCalledWith({
      path: "/tmp/captures/home.png",
      fullPage: false,
    });
  });

  it("surfaces spawn errors, non-zero status, stderr and non-finite measurements", () => {
    const cause = new Error("spawn ENOENT");
    expect(() => assertSpawnSucceeded("tool", [], {error: cause, status: null})).toThrow(
      /无法启动/u,
    );
    expect(() =>
      assertSpawnSucceeded("tool", ["arg"], {status: 2, stderr: "specific failure"}),
    ).toThrow(/specific failure/u);
    expect(() => parseFiniteNumber("NaN", "duration")).toThrow(/不是有效数字/u);
  });

  it("splits TTS input at semicolons and ellipses as well as sentence endings", () => {
    expect(splitSpeechSentences("先打开邮件；再补日历……最后确认。")).toEqual([
      "先打开邮件；",
      "再补日历……",
      "最后确认。",
    ]);
  });
});
