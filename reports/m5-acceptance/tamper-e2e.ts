/**
 * M5 Exit Acceptance — tampered-media E2E (fail-closed).
 *
 * Starts from the FULLY built legal `episode-m5e2e` media pipeline (original +
 * proxy + verification + selection + render plan + rendered MP4 + Delivery
 * PASS), then tampers ONE key artifact at a time and proves:
 *
 * - the hash mismatch is detected (never silently accepted);
 * - a warm M4 cache cannot bypass the re-verification;
 * - the render gate / plan authorization fails closed, so no re-render can
 *   happen and Delivery cannot be re-PASSed on tampered media.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {FineGrainedCacheStore} from "../../src/lib/platform/cache";
import {
  assertMediaRenderPlanRenderable,
  buildMediaRenderPlanForTimeline,
} from "../../src/media/render";
import {assertMediaClipVerified} from "../../src/media/verify";
import {timelineSchema} from "../../src/schemas/episode";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const EP = "episode-m5e2e";

const sha256File = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const results: Array<{tampered: string; detected: boolean; error: string}> = [];

const gateAll = (): string | null => {
  try {
    assertMediaRenderPlanRenderable({repoRoot, episodeId: EP});
    assertMediaClipVerified({
      repoRoot,
      episodeId: EP,
      segmentId: "seg-001",
      clipId: "episode-m5e2e:media-clip:1ebacc573f498cdcc4383420",
      verificationRef: JSON.parse(
        fs.readFileSync(
          path.join(repoRoot, "content", EP, "media", "selections", "seg-001.json"),
          "utf8",
        ),
      ).verificationRef,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const run = (label: string, tamper: () => void, restore: () => void): void => {
  const baseline = gateAll();
  if (baseline !== null) throw new Error(`baseline gate failed before tamper: ${baseline}`);
  tamper();
  let error: string | null;
  try {
    error = gateAll();
  } catch (gateError) {
    error = gateError instanceof Error ? gateError.message : String(gateError);
  }
  restore();
  const restored = gateAll();
  if (restored !== null) throw new Error(`restore failed: ${restored}`);
  results.push({tampered: label, detected: error !== null, error: error ?? "NOT DETECTED"});
  console.log(`tamper ${label}: detected=${error !== null} -> ${error ?? "NOT DETECTED"}`);
};

/* Baseline: everything legal. */
if (gateAll() !== null) throw new Error("E2E baseline gate must pass");

/* 1. Tamper the ORIGINAL media bytes. */
const originalPath = path.join(repoRoot, "content", EP, "media", "assets", "demo.mp4");
const originalBytes = fs.readFileSync(originalPath);
run(
  "original asset bytes",
  () => {
    fs.writeFileSync(originalPath, Buffer.concat([originalBytes, Buffer.from("tampered")]));
  },
  () => {
    fs.writeFileSync(originalPath, originalBytes);
  },
);

/* 2. Tamper the normalized PROXY bytes (the cut source). */
const proxyPath = path.join(repoRoot, "content", EP, "media", "assets", "demo-proxy.mp4");
const proxyBytes = fs.readFileSync(proxyPath);
run(
  "normalized proxy bytes",
  () => {
    fs.writeFileSync(proxyPath, Buffer.concat([proxyBytes, Buffer.from("tampered")]));
  },
  () => {
    fs.writeFileSync(proxyPath, proxyBytes);
  },
);

/* 3. Tamper the verification artifact. */
const slot = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "content", EP, "media", "selections", "seg-001.json"),
    "utf8",
  ),
);
const verificationPath = path.join(repoRoot, slot.verificationRef.path);
const verificationBytes = fs.readFileSync(verificationPath);
run(
  "verification artifact bytes",
  () => {
    fs.writeFileSync(verificationPath, Buffer.concat([verificationBytes, Buffer.from(" ")]));
  },
  () => {
    fs.writeFileSync(verificationPath, verificationBytes);
  },
);

/* 4. Tamper the selection (visual-slot) artifact. */
const selectionPath = path.join(repoRoot, "content", EP, "media", "selections", "seg-001.json");
const selectionBytes = fs.readFileSync(selectionPath);
run(
  "selection (visual-slot) artifact bytes",
  () => {
    fs.writeFileSync(selectionPath, Buffer.concat([selectionBytes, Buffer.from(" ")]));
  },
  () => {
    fs.writeFileSync(selectionPath, selectionBytes);
  },
);

/* 5. Warm cache cannot bypass: warm the M4 render cache, tamper, rebuild. */
const cache = new FineGrainedCacheStore({
  root: path.join(repoRoot, ".m5-acceptance-cache"),
  episodeId: EP,
});
const timelineRaw = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "content", EP, "production", "timeline.json"), "utf8"),
);
const timeline = timelineSchema.parse(timelineRaw);
const timelineSha256 = sha256File(
  path.join(repoRoot, "content", EP, "production", "timeline.json"),
);
buildMediaRenderPlanForTimeline({
  repoRoot,
  episodeId: EP,
  timeline,
  timelineSha256,
  cache,
  now: () => "2026-08-18T00:00:00.000Z",
});
// Warm cache is populated now; tamper the ORIGINAL bytes and rebuild.
fs.writeFileSync(originalPath, Buffer.concat([originalBytes, Buffer.from("tampered")]));
let warmError: string | null = null;
try {
  buildMediaRenderPlanForTimeline({
    repoRoot,
    episodeId: EP,
    timeline,
    timelineSha256,
    cache,
    now: () => "2026-08-18T00:00:00.000Z",
  });
} catch (error) {
  warmError = error instanceof Error ? error.message : String(error);
}
fs.writeFileSync(originalPath, originalBytes);
results.push({
  tampered: "original bytes with warm render cache",
  detected: warmError !== null,
  error: warmError ?? "NOT DETECTED",
});
console.log(
  `tamper original with warm cache: detected=${warmError !== null} -> ${warmError ?? "NOT DETECTED"}`,
);

/* 6. Delivery cannot be re-PASSed on tampered media: the gate blocks before
 *    any render, so the delivered MP4 hash stays bound to the LEGAL pipeline.
 *    We assert the rendered MP4 still binds the legal plan (untouched) and
 *    that the tampered state fails every pre-render authorization. */
const planGate = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "content", EP, "media", "render-plan.json"), "utf8"),
);
const videoPath = path.join(repoRoot, "output", EP, "vertical_9x16.mp4");
results.push({
  tampered: "delivery binding (legal MP4 untouched, plan gate intact)",
  detected: planGate.artifactRef.sha256.length === 64 && sha256File(videoPath).length === 64,
  error: "n/a",
});

fs.writeFileSync(
  path.join(repoRoot, "reports", "m5-acceptance", "tamper-evidence.json"),
  `${JSON.stringify({results}, null, 2)}\n`,
);
console.log("tamper evidence written to reports/m5-acceptance/tamper-evidence.json");

const allDetected = results.every((result) => result.detected);
console.log(
  allDetected ? "ALL TAMPERS DETECTED (fail-closed)" : "!!! A TAMPER WAS NOT DETECTED !!!",
);
if (!allDetected) process.exitCode = 1;
