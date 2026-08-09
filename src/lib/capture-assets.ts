import path from "node:path";
import type {EpisodeConfig} from "../schemas/episode";

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

export const captureConfiguredAssets = async (
  targets: CaptureTarget[],
  outputDirectory: string,
  newPage: () => Promise<CapturePage>,
): Promise<void> => {
  if (targets.length === 0) {
    throw new Error("当前 episode.config.json 未配置 captureAssets");
  }

  for (const target of targets) {
    const page = await newPage();
    await page.goto(target.url, {waitUntil: "domcontentloaded", timeout: 60_000});
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

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
      await page.waitForTimeout(600);
    }

    await page.screenshot({path: path.join(outputDirectory, target.file), fullPage: false});
  }
};
