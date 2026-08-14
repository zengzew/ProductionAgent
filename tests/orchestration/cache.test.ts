import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  buildSegmentTtsCacheKey,
  cacheEntryPath,
  createDeterministicToolAdapter,
  FineGrainedCacheStore,
  freezeContent,
  productionStageCheckpoint,
  sha256Json,
} from "../../src/orchestration";
import {captureConfiguredAssets, type CapturePage} from "../../src/lib/capture-assets";
import {generateTtsWithProviders, type ChineseTtsProvider} from "../../src/lib/tts-providers";
import type {Script} from "../../src/schemas/episode";

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = (prefix: string): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

const write = (root: string, relative: string, value: string): void => {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, value, "utf8");
};

const dependencyHashes = (version: string): Record<string, string> => ({
  "test-config": sha256Json({version}),
});

const scriptFixture = (secondNarration = "第二段保持不变。"): Script => ({
  selectedHook: "具体动作",
  segments: [
    {
      id: "seg-001",
      section: "hook",
      narration: "第一段保持不变。",
      onScreenText: ["一"],
      claimIds: ["claim-001"],
      scene: "scene one",
      visualIntent: "visual one",
      targetSeconds: 20,
    },
    {
      id: "seg-002",
      section: "body",
      narration: secondNarration,
      onScreenText: ["二"],
      claimIds: ["claim-002"],
      scene: "scene two",
      visualIntent: "visual two",
      targetSeconds: 20,
    },
  ],
});

const fakeTtsProvider = (sampleAudio: string, calls: string[]): ChineseTtsProvider => ({
  id: "edge",
  label: "fixture edge",
  model: "fixture-edge-model",
  voice: "fixture-voice",
  speed: 1,
  pitch: "0Hz",
  cacheConfiguration: {fixtureVersion: "v1"},
  credentialRequired: false,
  splitBySentence: false,
  async synthesize(text, outputPath) {
    calls.push(text);
    fs.copyFileSync(sampleAudio, outputPath);
    return {};
  },
});

const ttsOptions = (input: {
  root: string;
  cache: FineGrainedCacheStore;
  provider: ChineseTtsProvider;
}) => ({
  audioDirectory: path.join(input.root, "audio"),
  metadataPath: path.join(input.root, "tts-metadata.json"),
  providerOverride: input.provider,
  requestedProvider: "edge" as const,
  allowFallback: false,
  cache: input.cache,
  cacheDependencyHashes: dependencyHashes("v1"),
  publicPathForFile: (file: string) => path.relative(input.root, file),
});

const audioHashes = (directory: string): string[] =>
  fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".mp3"))
    .sort()
    .map((file) => sha256Json(fs.readFileSync(path.join(directory, file)).toString("base64")));

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("WP-M4-03 fine-grained cache", () => {
  it("resynthesizes only the changed narration segment and keeps repeated output hashes stable", async () => {
    const root = makeTemporaryDirectory("production-agent-tts-cache-");
    const sampleAudio = path.resolve(
      "content/episode-002/v2-goal3/production/public/audio/seg-001.mp3",
    );
    const calls: string[] = [];
    const cache = new FineGrainedCacheStore({
      root: path.join(root, "cache"),
      episodeId: "episode-001",
    });
    const provider = fakeTtsProvider(sampleAudio, calls);

    const first = await generateTtsWithProviders(
      scriptFixture(),
      ttsOptions({root: path.join(root, "first"), cache, provider}),
    );
    expect(calls).toHaveLength(2);
    const firstAudio = audioHashes(path.join(root, "first", "audio"));
    const firstMetadata = fs.readFileSync(path.join(root, "first", "tts-metadata.json"));

    const second = await generateTtsWithProviders(
      scriptFixture(),
      ttsOptions({root: path.join(root, "second"), cache, provider}),
    );
    expect(calls).toHaveLength(2);
    expect(audioHashes(path.join(root, "second", "audio"))).toEqual(firstAudio);
    expect(fs.readFileSync(path.join(root, "second", "tts-metadata.json"))).toEqual(firstMetadata);
    expect(second.generatedAt).toBe(first.generatedAt);

    await generateTtsWithProviders(
      scriptFixture("第二段已经修改。"),
      ttsOptions({root: path.join(root, "changed"), cache, provider}),
    );
    expect(calls).toHaveLength(3);
    expect(calls.at(-1)).toBe("第二段已经修改。");
  });

  it("invalidates TTS keys when provider, voice, or configuration changes", () => {
    const base = {
      normalizedNarration: "一段口播。",
      provider: "edge",
      model: "edge-tts",
      voice: "zh-CN-YunjianNeural",
      speed: 1.25,
      pitch: "-2Hz" as string | number,
      requestedProvider: "edge",
      ttsConfigVersion: "tts-config-v2",
      configurationHash: sha256Json({normalization: "v1"}),
      dependencyHashes: dependencyHashes("v1"),
    };
    const key = buildSegmentTtsCacheKey(base);
    expect(buildSegmentTtsCacheKey({...base, voice: "zh-CN-XiaoxiaoNeural"})).not.toBe(key);
    expect(
      buildSegmentTtsCacheKey({...base, provider: "minimax", model: "speech-2.8-hd"}),
    ).not.toBe(key);
    expect(
      buildSegmentTtsCacheKey({...base, configurationHash: sha256Json({normalization: "v2"})}),
    ).not.toBe(key);
    expect(buildSegmentTtsCacheKey({...base, dependencyHashes: dependencyHashes("v2")})).not.toBe(
      key,
    );
  });

  it("reuses the same cache key after a checkpoint/resume boundary", async () => {
    const root = makeTemporaryDirectory("production-agent-tts-resume-");
    const sampleAudio = path.resolve(
      "content/episode-002/v2-goal3/production/public/audio/seg-001.mp3",
    );
    const calls: string[] = [];
    const provider = fakeTtsProvider(sampleAudio, calls);
    const firstCache = new FineGrainedCacheStore({
      root: path.join(root, "cache"),
      episodeId: "episode-001",
    });
    await generateTtsWithProviders(
      scriptFixture(),
      ttsOptions({root: path.join(root, "first"), cache: firstCache, provider}),
    );
    const resumedCache = new FineGrainedCacheStore({
      root: path.join(root, "cache"),
      episodeId: "episode-001",
    });
    await generateTtsWithProviders(
      scriptFixture(),
      ttsOptions({root: path.join(root, "resumed"), cache: resumedCache, provider}),
    );
    expect(calls).toHaveLength(2);
    expect(audioHashes(path.join(root, "resumed", "audio"))).toEqual(
      audioHashes(path.join(root, "first", "audio")),
    );
  });

  it("rebuilds a corrupted TTS payload and emits a zero-cost hit event", async () => {
    const root = makeTemporaryDirectory("production-agent-tts-corrupt-");
    const sampleAudio = path.resolve(
      "content/episode-002/v2-goal3/production/public/audio/seg-001.mp3",
    );
    const calls: string[] = [];
    const events: Array<{
      eventType: string;
      hit: boolean | null;
      cost: {amount: string};
      usage: {totalTokens: number; cacheReadTokens: number};
    }> = [];
    const cache = new FineGrainedCacheStore({
      root: path.join(root, "cache"),
      episodeId: "episode-001",
      eventSink: (event) => events.push(event),
    });
    const provider = fakeTtsProvider(sampleAudio, calls);
    await generateTtsWithProviders(
      scriptFixture(),
      ttsOptions({root: path.join(root, "first"), cache, provider}),
    );
    const key = fs.readdirSync(path.join(root, "cache", "episode-001", "tts-segment"))[0];
    expect(key).toBeTruthy();
    fs.writeFileSync(
      path.join(
        cacheEntryPath(path.join(root, "cache"), "episode-001", "tts-segment", key!),
        "payload.bin",
      ),
      "corrupt",
    );
    await generateTtsWithProviders(
      scriptFixture(),
      ttsOptions({root: path.join(root, "second"), cache, provider}),
    );
    expect(calls).toHaveLength(3);
    expect(events.some((event) => event.eventType === "cache.invalidation")).toBe(true);
    expect(
      events
        .filter((event) => event.eventType === "cache.hit")
        .every(
          (event) =>
            event.cost.amount === "0" &&
            event.usage.totalTokens === 0 &&
            event.usage.cacheReadTokens === 0,
        ),
    ).toBe(true);
  });

  it("reuses a shot cache entry independently of its mutable output filename", async () => {
    const root = makeTemporaryDirectory("production-agent-shot-cache-");
    const cache = new FineGrainedCacheStore({
      root: path.join(root, "cache"),
      episodeId: "episode-001",
    });
    let pageCount = 0;
    const makePage = (): CapturePage => ({
      goto: async () => undefined,
      waitForLoadState: async () => undefined,
      waitForTimeout: async () => undefined,
      getByRole: () => ({count: async () => 1, scrollIntoViewIfNeeded: async () => undefined}),
      screenshot: async ({path: outputPath}) => {
        fs.mkdirSync(path.dirname(outputPath), {recursive: true});
        fs.writeFileSync(outputPath, "captured-shot-bytes");
      },
    });
    const newPage = async () => {
      pageCount += 1;
      return makePage();
    };
    const target = {file: "first.png", url: "https://example.com/product"};
    await captureConfiguredAssets([target], path.join(root, "first"), newPage, undefined, {
      cache,
      dependencyHashes: dependencyHashes("v1"),
    });
    await captureConfiguredAssets(
      [{...target, file: "renamed.png"}],
      path.join(root, "second"),
      newPage,
      undefined,
      {cache, dependencyHashes: dependencyHashes("v1")},
    );
    expect(pageCount).toBe(1);
    expect(fs.readFileSync(path.join(root, "second", "renamed.png"), "utf8")).toBe(
      "captured-shot-bytes",
    );

    await captureConfiguredAssets(
      [{...target, file: "changed.png", anchor: {role: "heading", name: "Changed"}}],
      path.join(root, "changed"),
      newPage,
      undefined,
      {cache, dependencyHashes: dependencyHashes("v1")},
    );
    expect(pageCount).toBe(2);
  });

  it("treats a corrupted shot cache as a miss and safely rebuilds it", async () => {
    const root = makeTemporaryDirectory("production-agent-shot-corrupt-");
    const cacheRoot = path.join(root, "cache");
    const cache = new FineGrainedCacheStore({root: cacheRoot, episodeId: "episode-001"});
    let pageCount = 0;
    const newPage = async (): Promise<CapturePage> => {
      pageCount += 1;
      return {
        goto: async () => undefined,
        waitForLoadState: async () => undefined,
        waitForTimeout: async () => undefined,
        getByRole: () => ({count: async () => 0, scrollIntoViewIfNeeded: async () => undefined}),
        screenshot: async ({path: outputPath}) => {
          fs.mkdirSync(path.dirname(outputPath), {recursive: true});
          fs.writeFileSync(outputPath, `shot-${pageCount}`);
        },
      };
    };
    const target = {file: "asset.png", url: "https://example.com/asset"};
    await captureConfiguredAssets([target], path.join(root, "first"), newPage, undefined, {cache});
    const key = fs.readdirSync(path.join(cacheRoot, "episode-001", "shot-asset"))[0];
    expect(key).toBeTruthy();
    fs.writeFileSync(
      path.join(cacheRoot, "episode-001", "shot-asset", key!, "payload.bin"),
      "tampered",
    );
    await captureConfiguredAssets([target], path.join(root, "second"), newPage, undefined, {cache});
    expect(pageCount).toBe(2);
    expect(fs.readFileSync(path.join(root, "second", "asset.png"), "utf8")).toBe("shot-2");
  });

  it("keeps aggregate validation running when a fine-grained cache stage is revisited", async () => {
    const root = makeTemporaryDirectory("production-agent-cache-validation-");
    const episodeId = "episode-001";
    const finalScriptPath = `content/${episodeId}/story/final-script.md`;
    write(root, finalScriptPath, "frozen script\n");
    const finalScriptRef = buildArtifactRef({
      repoRoot: root,
      artifactId: `${episodeId}:story:final-script`,
      episodeId,
      path: finalScriptPath,
      mediaType: "text/markdown",
      schemaVersion: "final-script-v1",
      producer: "fixture",
      createdAt: "2026-08-14T00:00:00.000Z",
    });
    const frozen = freezeContent({
      repoRoot: root,
      episodeId,
      artifactIndex: {
        schemaVersion: "artifact-index-v1",
        episodeId,
        artifacts: [
          {
            ref: finalScriptRef,
            state: "selected",
            producedByExecutionId: "freeze",
            dependencies: [],
          },
        ],
        selected: {
          [finalScriptRef.artifactId]: {
            revision: finalScriptRef.revision,
            sha256: finalScriptRef.sha256,
            path: finalScriptRef.path,
          },
        },
      },
      selectedArtifactRefs: [finalScriptRef],
      issues: [],
      frozenAt: "2026-08-14T00:00:00.000Z",
      frozenBy: "fixture",
    });
    let validatorCalls = 0;
    const adapter = createDeterministicToolAdapter({
      repoRoot: root,
      enableFineGrainedCache: true,
      runTool: async () => {
        validatorCalls += 1;
        return {stdout: "valid", stderr: ""};
      },
      createdAt: () => "2026-08-14T00:00:00.000Z",
    });
    const request = {
      contractVersion: "production-stage-v1" as const,
      executionId: "cache-validation:production:validate-content:1",
      episodeId,
      stage: "validate:content" as const,
      attempt: 1,
      revisionRound: 0,
      contentManifestRef: frozen.manifestRef,
      inputArtifacts: [frozen.manifestRef],
      previousArtifacts: [finalScriptRef],
    };
    const first = await adapter(request);
    const second = await adapter({
      ...request,
      executionId: "cache-validation:production:validate-content:2",
      attempt: 2,
      cached: productionStageCheckpoint(first),
    });
    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");
    expect(validatorCalls).toBe(2);
  });
});
