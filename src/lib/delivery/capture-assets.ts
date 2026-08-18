import fs from "node:fs";
import path from "node:path";
import type {EpisodeConfig} from "../../schemas/episode";
import {productionContract, type ProductionContract} from "../episode/production-contract";
import {
  buildShotAssetCacheKey,
  copyBytesAtomically,
  sha256Bytes,
  type FineGrainedCacheStore,
} from "../platform/cache";

type CaptureTarget = EpisodeConfig["captureAssets"][number];

type CaptureAnchor = {
  count(): Promise<number>;
  scrollIntoViewIfNeeded(): Promise<void>;
};

export type CapturePage = {
  goto(url: string, options: {waitUntil: "domcontentloaded"; timeout: number}): Promise<unknown>;
  waitForLoadState(state: "domcontentloaded"): Promise<unknown>;
  waitForTimeout(milliseconds: number): Promise<unknown>;
  getByRole(role: "heading", options: {name: string; exact: true}): CaptureAnchor;
  screenshot(options: {path: string; fullPage: false}): Promise<unknown>;
};

export type CaptureCacheOptions = {
  cache?: FineGrainedCacheStore;
  dependencyHashes?: Record<string, string>;
  toolVersion?: string;
  viewport?: {width: number; height: number};
  deviceScaleFactor?: number;
  locale?: string;
  colorScheme?: "light" | "dark";
};

const defaultCaptureProfile = {
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 1,
  locale: "en-US",
  colorScheme: "light" as const,
};

const captureMetadata = (input: {
  cacheKey: string;
  target: CaptureTarget;
  toolVersion: string;
}): Record<string, unknown> => ({
  schemaVersion: "shot-asset-metadata-v1",
  requestSpecHash: input.cacheKey,
  sourceUrlSha256: requireSha256(input.target.url),
  provenance: "official-page-screenshot",
  toolVersion: input.toolVersion,
});

const requireSha256 = (value: string): string => {
  // The URL itself is not persisted in cache metadata; only its source fingerprint is.
  return sha256Bytes(new TextEncoder().encode(value));
};

const validateCaptureMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("shot asset cache metadata must be an object");
  }
  const metadata = value as Record<string, unknown>;
  if (
    metadata.schemaVersion !== "shot-asset-metadata-v1" ||
    typeof metadata.requestSpecHash !== "string" ||
    typeof metadata.sourceUrlSha256 !== "string" ||
    metadata.provenance !== "official-page-screenshot" ||
    typeof metadata.toolVersion !== "string"
  ) {
    throw new Error("shot asset cache metadata schema mismatch");
  }
  return metadata;
};

const captureRequestIdentity = (input: {
  target: CaptureTarget;
  captureContract: ProductionContract["capture"];
  options: CaptureCacheOptions;
}): {
  cacheKey: string;
  logicalItem: string;
  metadata: Record<string, unknown>;
} => {
  const profile = {
    viewport: input.options.viewport ?? defaultCaptureProfile.viewport,
    deviceScaleFactor: input.options.deviceScaleFactor ?? defaultCaptureProfile.deviceScaleFactor,
    locale: input.options.locale ?? defaultCaptureProfile.locale,
    colorScheme: input.options.colorScheme ?? defaultCaptureProfile.colorScheme,
  };
  const requestSpec = {
    schemaVersion: "shot-asset-request-v1",
    sourceUrl: input.target.url,
    anchor: input.target.anchor ?? null,
    navigation: {
      waitUntil: "domcontentloaded",
      timeoutMs: input.captureContract.navigationTimeoutMs,
      pageSettleMs: input.captureContract.pageSettleMs,
      anchorSettleMs: input.captureContract.anchorSettleMs,
    },
    browserProfile: profile,
    screenshot: {format: "png", fullPage: false},
  };
  const source = {
    sourceType: "official-web-page",
    url: input.target.url,
  };
  const provenance = {
    captureMethod: "playwright-page-screenshot",
    sourceBasis: "episode-capture-request",
  };
  const toolVersion = input.options.toolVersion ?? "capture-assets-v1";
  const cacheKey = buildShotAssetCacheKey({
    requestSpec,
    source,
    provenance,
    dependencyHashes: input.options.dependencyHashes ?? {},
    toolVersion,
  });
  return {
    cacheKey,
    logicalItem: `asset-request:${cacheKey.slice(0, 16)}`,
    metadata: captureMetadata({cacheKey, target: input.target, toolVersion}),
  };
};

export const captureConfiguredAssets = async (
  targets: CaptureTarget[],
  outputDirectory: string,
  newPage: () => Promise<CapturePage>,
  captureContract: ProductionContract["capture"] = productionContract.capture,
  cacheOptions: CaptureCacheOptions = {},
): Promise<void> => {
  if (targets.length === 0) {
    throw new Error("当前 episode.config.json 未配置 captureAssets");
  }

  for (const target of targets) {
    const identity = captureRequestIdentity({target, captureContract, options: cacheOptions});
    if (cacheOptions.cache) {
      const cached = cacheOptions.cache.lookup({
        kind: "shot-asset",
        cacheKey: identity.cacheKey,
        stage: "capture",
        logicalItem: identity.logicalItem,
        validateMetadata: validateCaptureMetadata,
      });
      if (cached.hit) {
        copyBytesAtomically(path.join(outputDirectory, target.file), cached.bytes);
        continue;
      }
    }
    const page = await newPage();
    await page.goto(target.url, {
      waitUntil: "domcontentloaded",
      timeout: captureContract.navigationTimeoutMs,
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(captureContract.pageSettleMs);

    if (target.anchor) {
      const anchor = page.getByRole(target.anchor.role, {
        name: target.anchor.name,
        exact: true,
      });
      const count = await anchor.count();
      if (count !== 1) {
        throw new Error(
          `截图锚点必须唯一命中：${target.url} heading=${JSON.stringify(target.anchor.name)}，实际 ${count}`,
        );
      }
      await anchor.scrollIntoViewIfNeeded();
      await page.waitForTimeout(captureContract.anchorSettleMs);
    }

    const outputPath = path.join(outputDirectory, target.file);
    await page.screenshot({path: outputPath, fullPage: false});
    if (cacheOptions.cache) {
      try {
        cacheOptions.cache.put({
          kind: "shot-asset",
          cacheKey: identity.cacheKey,
          stage: "capture",
          logicalItem: identity.logicalItem,
          mediaType: "image/png",
          bytes: fs.readFileSync(outputPath),
          metadata: identity.metadata,
        });
      } catch (error) {
        console.warn(
          `asset cache write skipped for ${target.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
};
