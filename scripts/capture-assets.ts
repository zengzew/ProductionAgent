import fs from "node:fs";
import path from "node:path";
import {chromium, type Page} from "playwright";
import {ensureDir, publicEpisodeRoot} from "../src/lib/project";

const outputDir = path.join(publicEpisodeRoot, "captured");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!fs.existsSync(chromeExecutable)) {
  throw new Error(`未找到可用 Chrome：${chromeExecutable}`);
}

ensureDir(outputDir);

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

const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(4000);
};

try {
  const home = await context.newPage();
  await home.goto("https://poke.com/", {waitUntil: "domcontentloaded", timeout: 60_000});
  await settle(home);
  await home.screenshot({path: path.join(outputDir, "poke-home.png"), fullPage: false});

  const releases = await context.newPage();
  await releases.goto("https://poke.com/docs/release-notes", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await settle(releases);
  const marchHeading = releases.getByRole("heading", {name: "March 19, 2026"});
  if ((await marchHeading.count()) === 1) {
    await marchHeading.scrollIntoViewIfNeeded();
    await releases.waitForTimeout(600);
  }
  await releases.screenshot({
    path: path.join(outputDir, "poke-release-notes.png"),
    fullPage: false,
  });

  const cognition = await context.newPage();
  await cognition.goto("https://cognition.com/blog/interaction", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await settle(cognition);
  await cognition.screenshot({
    path: path.join(outputDir, "cognition-announcement.png"),
    fullPage: false,
  });
} finally {
  await context.close();
  await browser.close();
}

console.log(`captured 3 official-page stills in ${outputDir}`);
