import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

describe("media restore", () => {
  it("verify-only fails when a listed binary is missing, and restore copies by hash", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "restore-media-"));
    const episodeId = "episode-restore";
    const bytes = Buffer.from("restore-media-fixture");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const assetRelative = `content/${episodeId}/media/assets/demo.mp4`;
    writeJson(path.join(fixtureRoot, `content/${episodeId}/media/source-manifest.json`), {
      schemaVersion: "media-source-manifest-v1",
      episodeId,
      assets: [
        {
          artifactRef: {
            artifactId: `${episodeId}:media:demo`,
            path: assetRelative,
            sha256,
            sizeBytes: bytes.length,
          },
        },
      ],
    });
    fs.mkdirSync(path.join(fixtureRoot, "downloads"), {recursive: true});
    fs.writeFileSync(path.join(fixtureRoot, "downloads", sha256), bytes);

    const verifyMissing = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(repoRoot, "scripts/restore-media.ts"),
        "--episode",
        episodeId,
        "--verify-only",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          MEDIA_RESTORE_ROOT: fixtureRoot,
          VITEST: undefined,
          VITEST_WORKER_ID: undefined,
        },
      },
    );
    expect(verifyMissing.status).not.toBe(0);
    expect(`${verifyMissing.stdout}\n${verifyMissing.stderr}`).toMatch(/MISSING/u);

    const restore = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(repoRoot, "scripts/restore-media.ts"), "--episode", episodeId],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          MEDIA_RESTORE_ROOT: fixtureRoot,
          VITEST: undefined,
          VITEST_WORKER_ID: undefined,
        },
      },
    );
    expect(restore.status).toBe(0);
    const restored = path.join(fixtureRoot, assetRelative);
    expect(fs.existsSync(restored)).toBe(true);
    expect(crypto.createHash("sha256").update(fs.readFileSync(restored)).digest("hex")).toBe(
      sha256,
    );
    fs.rmSync(fixtureRoot, {recursive: true, force: true});
  });
});
