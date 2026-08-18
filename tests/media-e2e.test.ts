import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {FineGrainedCacheStore} from "../src/lib/platform/cache";
import {productionContract} from "../src/lib/episode/production-contract";
import {
  assertMediaDeliveryGate,
  assertOutputInspectionMeetsDeliveryContract,
  assertVerticalInspectionMeetsDeliveryContract,
  probeVerticalMp4,
  readOutputInspection,
} from "../src/media/delivery-gate";
import {
  assertMediaRenderManifestConsistent,
  buildMediaRenderManifest,
  projectMediaRenderManifest,
  readMediaRenderManifest,
} from "../src/media/projection";
import {buildMediaRenderPlanForTimeline, createStubRenderProxyExtractor} from "../src/media/render";
import {timelineSchema} from "../src/schemas/episode";
import {
  E2E_EPISODE_ID,
  E2E_FIXED_NOW,
  e2eDependencyHashes,
  setupReadyMediaEpisode,
  sha256OfFile,
  writeInspection,
  writeVerticalMp4,
} from "./helpers/media-e2e-pipeline";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-e2e-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const itSlow = (name: string, fn: () => Promise<void> | void): void => {
  it(name, fn, 90_000);
};

const expectGateError = (fn: () => void, pattern: RegExp): void => {
  expect(fn).toThrow(pattern);
};

describe("WP-M5.09 delivery gate + real-media E2E", () => {
  itSlow("real-media E2E produces a 9:16 40–80s readout and Delivery PASS", async () => {
    const repoRoot = temporaryRepo();
    const ready = await setupReadyMediaEpisode(repoRoot);
    const projection = buildMediaRenderManifest({
      repoRoot,
      episodeId: ready.episodeId,
      now: () => E2E_FIXED_NOW,
    });
    expect(projection.schemaVersion).toBe("media-render-manifest-v1");
    expect(projection.usage.some((entry) => entry.selectedType === "real-media")).toBe(true);
    expect(projection.clips.length).toBeGreaterThan(0);
    expect(projection.sources.every((source) => source.admitted && source.rightsApproved)).toBe(
      true,
    );
    assertMediaRenderManifestConsistent({repoRoot, episodeId: ready.episodeId});

    const videoPath = path.join(repoRoot, "output", ready.episodeId, "vertical_9x16.mp4");
    writeVerticalMp4(videoPath, 41);
    const probed = probeVerticalMp4(videoPath);
    expect(probed.width).toBe(1080);
    expect(probed.height).toBe(1920);
    expect(probed.duration).toBeGreaterThanOrEqual(productionContract.delivery.minimumSeconds);
    expect(probed.duration).toBeLessThanOrEqual(productionContract.delivery.hardMaximumSeconds);

    const result = assertMediaDeliveryGate({
      repoRoot,
      episodeId: ready.episodeId,
      videoPath,
      requireObservabilityComplete: true,
      persistProjection: true,
      now: () => E2E_FIXED_NOW,
    });
    expect(result.plan.shots[0]?.visualType).toBe("real-media");
    expect(result.inspection?.width).toBe(1080);
    expect(result.inspection?.height).toBe(1920);
    expect(readMediaRenderManifest(repoRoot, ready.episodeId).renderPlanSha256).toBe(
      result.plan.artifactRef.sha256,
    );
  });

  itSlow("tampered original / verification / selection / warm cache all fail closed", async () => {
    const repoRoot = temporaryRepo();
    const ready = await setupReadyMediaEpisode(repoRoot);
    buildMediaRenderManifest({repoRoot, episodeId: ready.episodeId, now: () => E2E_FIXED_NOW});
    const videoPath = path.join(repoRoot, "output", ready.episodeId, "vertical_9x16.mp4");
    writeInspection(path.join(repoRoot, "output", ready.episodeId, "inspection.json"), {
      duration: 41,
    });
    writeVerticalMp4(videoPath, 41);

    const gate = (): void => {
      assertMediaDeliveryGate({
        repoRoot,
        episodeId: ready.episodeId,
        videoPath,
        requireObservabilityComplete: true,
      });
    };
    gate();

    const originalBytes = fs.readFileSync(ready.originalPath);
    fs.writeFileSync(ready.originalPath, Buffer.concat([originalBytes, Buffer.from("tampered")]));
    expectGateError(gate, /MEDIA_RENDER_|MEDIA_VERIFY_|MEDIA_PROJECTION_ASSET_TAMPERED/u);
    fs.writeFileSync(ready.originalPath, originalBytes);
    gate();

    const verificationBytes = fs.readFileSync(ready.verificationPath);
    fs.writeFileSync(ready.verificationPath, Buffer.concat([verificationBytes, Buffer.from(" ")]));
    expectGateError(gate, /MEDIA_RENDER_|MEDIA_VERIFY_|TAMPERED/u);
    fs.writeFileSync(ready.verificationPath, verificationBytes);
    gate();

    const selectionBytes = fs.readFileSync(ready.selectionPath);
    fs.writeFileSync(ready.selectionPath, Buffer.concat([selectionBytes, Buffer.from(" ")]));
    expectGateError(gate, /MEDIA_RENDER_SLOT_TAMPERED|TAMPERED/u);
    fs.writeFileSync(ready.selectionPath, selectionBytes);
    gate();

    const cache = new FineGrainedCacheStore({
      root: path.join(repoRoot, ".m5-e2e-cache"),
      episodeId: ready.episodeId,
    });
    const timelinePath = path.join(
      repoRoot,
      "content",
      ready.episodeId,
      "production",
      "timeline.json",
    );
    const timeline = timelineSchema.parse(JSON.parse(fs.readFileSync(timelinePath, "utf8")));
    buildMediaRenderPlanForTimeline({
      repoRoot,
      episodeId: ready.episodeId,
      timeline,
      timelineSha256: sha256OfFile(timelinePath),
      cache,
      cacheDependencyHashes: e2eDependencyHashes(),
      proxyExtractor: createStubRenderProxyExtractor(),
      now: () => E2E_FIXED_NOW,
    });
    fs.writeFileSync(ready.originalPath, Buffer.concat([originalBytes, Buffer.from("tampered")]));
    expect(() =>
      buildMediaRenderPlanForTimeline({
        repoRoot,
        episodeId: ready.episodeId,
        timeline,
        timelineSha256: sha256OfFile(timelinePath),
        cache,
        cacheDependencyHashes: e2eDependencyHashes(),
        proxyExtractor: createStubRenderProxyExtractor(),
        now: () => E2E_FIXED_NOW,
      }),
    ).toThrow(/MEDIA_RENDER_|MEDIA_VERIFY_|TAMPERED/u);
    fs.writeFileSync(ready.originalPath, originalBytes);
  });

  itSlow("inspect rejects duration outside 40–80s and non-9:16 frames", async () => {
    const repoRoot = temporaryRepo();
    const ready = await setupReadyMediaEpisode(repoRoot);
    buildMediaRenderManifest({repoRoot, episodeId: ready.episodeId, now: () => E2E_FIXED_NOW});

    expect(() =>
      assertVerticalInspectionMeetsDeliveryContract({
        file: "vertical_9x16.mp4",
        duration: 12,
        width: 1080,
        height: 1920,
      }),
    ).toThrow(/MEDIA_DELIVERY_DURATION_SHORT/u);
    expect(() =>
      assertVerticalInspectionMeetsDeliveryContract({
        file: "vertical_9x16.mp4",
        duration: 90,
        width: 1080,
        height: 1920,
      }),
    ).toThrow(/MEDIA_DELIVERY_DURATION_LONG/u);
    expect(() =>
      assertVerticalInspectionMeetsDeliveryContract({
        file: "vertical_9x16.mp4",
        duration: 41,
        width: 1920,
        height: 1080,
      }),
    ).toThrow(/MEDIA_DELIVERY_DIMENSIONS/u);

    const inspectionPath = path.join(repoRoot, "output", ready.episodeId, "inspection.json");
    writeInspection(inspectionPath, {duration: 12});
    expect(() =>
      assertOutputInspectionMeetsDeliveryContract(readOutputInspection(inspectionPath)),
    ).toThrow(/MEDIA_DELIVERY_DURATION_SHORT/u);

    writeInspection(inspectionPath, {duration: 41, width: 720, height: 1280});
    expect(() =>
      assertMediaDeliveryGate({
        repoRoot,
        episodeId: ready.episodeId,
        inspectionPath,
      }),
    ).toThrow(/MEDIA_DELIVERY_DIMENSIONS/u);
  });

  itSlow("projection rejects a stale stored manifest and unauthorized source", async () => {
    const repoRoot = temporaryRepo();
    const ready = await setupReadyMediaEpisode(repoRoot);
    const stored = buildMediaRenderManifest({
      repoRoot,
      episodeId: ready.episodeId,
      now: () => E2E_FIXED_NOW,
    });
    const expected = projectMediaRenderManifest({repoRoot, episodeId: ready.episodeId});
    expect(expected.renderPlanSha256).toBe(stored.renderPlanSha256);

    const storedPath = path.join(
      repoRoot,
      "content",
      ready.episodeId,
      "media",
      "render-manifest.json",
    );
    const mutated = {
      ...JSON.parse(fs.readFileSync(storedPath, "utf8")),
      renderPlanSha256: "ab".repeat(32),
    };
    fs.writeFileSync(storedPath, `${JSON.stringify(mutated, null, 2)}\n`);
    expect(() =>
      assertMediaRenderManifestConsistent({repoRoot, episodeId: ready.episodeId}),
    ).toThrow(/MEDIA_PROJECTION_STALE/u);

    const restored = buildMediaRenderManifest({
      repoRoot,
      episodeId: ready.episodeId,
      now: () => E2E_FIXED_NOW,
    });
    expect(restored.renderPlanSha256).toBe(expected.renderPlanSha256);

    const manifestPath = path.join(
      repoRoot,
      "content",
      ready.episodeId,
      "media",
      "source-manifest.json",
    );
    const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      sources: Array<{sourceId: string; rightsStatus: string; rightsDecisionRef?: unknown}>;
    };
    const source = sourceManifest.sources.find((entry) => entry.sourceId === ready.sourceId);
    if (!source) throw new Error("source missing");
    source.rightsStatus = "rejected";
    Reflect.deleteProperty(source, "rightsDecisionRef");
    fs.writeFileSync(manifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`);
    expect(() =>
      assertMediaRenderManifestConsistent({repoRoot, episodeId: ready.episodeId}),
    ).toThrow(/MEDIA_PROJECTION_SOURCE_NOT_AUTHORIZED|MEDIA_RENDER_|MEDIA_SOURCE/u);
  });

  itSlow("incomplete media observability blocks delivery approval", async () => {
    const repoRoot = temporaryRepo();
    const ready = await setupReadyMediaEpisode(repoRoot);
    buildMediaRenderManifest({repoRoot, episodeId: ready.episodeId, now: () => E2E_FIXED_NOW});
    const eventsPath = path.join(
      repoRoot,
      "content",
      ready.episodeId,
      "media",
      "observability",
      "media-events.jsonl",
    );
    if (fs.existsSync(eventsPath)) {
      const kept = fs
        .readFileSync(eventsPath, "utf8")
        .split(/\r?\n/u)
        .filter(Boolean)
        .filter(
          (line) => !line.includes("media.render.completed") && !line.includes("media.rendered"),
        );
      fs.writeFileSync(eventsPath, kept.length > 0 ? `${kept.join("\n")}\n` : "");
    }
    const inspectionPath = path.join(repoRoot, "output", ready.episodeId, "inspection.json");
    writeInspection(inspectionPath, {duration: 41});
    expect(() =>
      assertMediaDeliveryGate({
        repoRoot,
        episodeId: ready.episodeId,
        inspectionPath,
        requireObservabilityComplete: true,
      }),
    ).toThrow(/MEDIA_DELIVERY_OBSERVABILITY_(RENDER_MISSING|INCOMPLETE)/u);
  });

  it("M4 observability-degraded still blocks approval", () => {
    expect(() =>
      assertMediaDeliveryGate({
        repoRoot: temporaryRepo(),
        episodeId: E2E_EPISODE_ID,
        inspectionPath: path.join(os.tmpdir(), "missing-inspection.json"),
        observability: {events: [], executedStages: ["validate:delivery"]},
      }),
    ).toThrow(/MEDIA_RENDER_PLAN_MISSING|MEDIA_DELIVERY_|OBSERVABILITY_DEGRADED/u);
  });
});
