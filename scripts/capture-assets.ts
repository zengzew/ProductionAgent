import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {captureConfiguredAssets} from "../src/lib/delivery/capture-assets";
import {episodeConfigSchema} from "../src/schemas/episode";
import {
  createFineGrainedCacheFromEnvironment,
  hashRepositoryFiles,
} from "../src/lib/platform/cache";
import {
  ensureDir,
  episodeRoot,
  publicEpisodeRoot,
  readJson,
  repoRoot,
} from "../src/lib/episode/paths";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const outputDir = path.join(publicEpisodeRoot, "captured");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!fs.existsSync(chromeExecutable)) {
  throw new Error(`未找到可用 Chrome：${chromeExecutable}`);
}

ensureDir(outputDir);
const episodeConfig = episodeConfigSchema.parse(
  readJson<unknown>(path.join(episodeRoot, "episode.config.json")),
);
const cache = createFineGrainedCacheFromEnvironment({
  episodeId: episodeConfig.id,
  stage: "capture",
});

const browser = await chromium.launch({
  executablePath: chromeExecutable,
  headless: true,
});
const context = await browser.newContext({
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 1,
  locale: "en-US",
  colorScheme: "light",
});

try {
  await captureConfiguredAssets(
    episodeConfig.captureAssets,
    outputDir,
    () => context.newPage(),
    undefined,
    {
      cache,
      dependencyHashes: hashRepositoryFiles(repoRoot, [
        "config/production-contract.json",
        "src/lib/delivery/capture-assets.ts",
        "scripts/capture-assets.ts",
      ]),
      toolVersion: "capture-assets-v1",
    },
  );
} finally {
  await context.close();
  await browser.close();
}

console.log(`captured ${episodeConfig.captureAssets.length} official-page stills in ${outputDir}`);
