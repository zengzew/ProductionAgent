import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {parseCliArgs} from "../src/lib/episode/cli";
import {episodeRepositoryRoot, repoRoot} from "../src/lib/episode/paths";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

type RestorableRef = {
  artifactId: string;
  path: string;
  sha256: string;
  sizeBytes: number;
};

const BINARY_SUFFIX = /\.(mp4|mov|webm|wav|mp3|m4a)$/iu;

const parsed = parseCliArgs(process.argv);
const episodeId = parsed.episode ?? process.env.EPISODE_ID ?? "episode-001";
if (!/^episode-[a-z0-9-]+$/u.test(episodeId)) {
  throw new Error(`Invalid episode id: ${episodeId}`);
}
const restoreRoot = process.env.MEDIA_RESTORE_ROOT
  ? path.resolve(process.env.MEDIA_RESTORE_ROOT)
  : repoRoot;

const hashFile = (filePath: string): string => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
};

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const collectFromArtifactRef = (value: unknown, collected: Map<string, RestorableRef>): void => {
  if (!isRecord(value)) return;
  const artifactId = value.artifactId;
  const refPath = value.path;
  const sha256 = value.sha256;
  const sizeBytes = value.sizeBytes;
  if (
    typeof artifactId !== "string" ||
    typeof refPath !== "string" ||
    typeof sha256 !== "string" ||
    typeof sizeBytes !== "number" ||
    !BINARY_SUFFIX.test(refPath)
  ) {
    return;
  }
  collected.set(refPath, {artifactId, path: refPath, sha256, sizeBytes});
};

const collectRestorableRefs = (episodeIdToRestore: string): RestorableRef[] => {
  const collected = new Map<string, RestorableRef>();
  const episodeRoot = path.join(restoreRoot, episodeRepositoryRoot(episodeIdToRestore));
  const manifestPath = path.join(episodeRoot, "media/source-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    if (isRecord(manifest) && Array.isArray(manifest.assets)) {
      for (const asset of manifest.assets) {
        if (isRecord(asset)) collectFromArtifactRef(asset.artifactRef, collected);
      }
    }
  }
  const indexPath = path.join(episodeRoot, "artifact-index.json");
  if (fs.existsSync(indexPath)) {
    const index = readJson(indexPath);
    if (isRecord(index) && Array.isArray(index.artifacts)) {
      for (const record of index.artifacts) {
        if (isRecord(record)) collectFromArtifactRef(record.ref, collected);
      }
    }
  }
  return [...collected.values()].sort((left, right) => left.path.localeCompare(right.path));
};

const listFilesRecursive = (directory: string): string[] => {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, {withFileTypes: true});
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
};

const findCandidate = (ref: RestorableRef, searchRoots: string[]): string | undefined => {
  const basename = path.basename(ref.path);
  for (const root of searchRoots) {
    const hashedExact = path.join(root, ref.sha256);
    const hashedWithExt = `${hashedExact}${path.extname(ref.path)}`;
    for (const candidate of [hashedExact, hashedWithExt]) {
      if (fs.existsSync(candidate) && hashFile(candidate) === ref.sha256) return candidate;
    }
    for (const filePath of listFilesRecursive(root)) {
      if (path.basename(filePath) !== basename) continue;
      if (hashFile(filePath) === ref.sha256) return filePath;
    }
  }
  return undefined;
};

const refs = collectRestorableRefs(episodeId);
if (refs.length === 0) {
  console.log(`media restore: ${episodeId} has no binary media artifact refs`);
  process.exit(0);
}

const searchRoots = [path.join(restoreRoot, "downloads"), process.env.MEDIA_STORE_DIR].filter(
  (value): value is string => Boolean(value),
);

const missing: RestorableRef[] = [];
const mismatched: Array<RestorableRef & {actualSha256: string}> = [];
let ok = 0;
let restored = 0;

for (const ref of refs) {
  const absolute = path.join(restoreRoot, ref.path);
  if (fs.existsSync(absolute)) {
    const actualSha256 = hashFile(absolute);
    if (actualSha256 === ref.sha256) {
      ok += 1;
      continue;
    }
    mismatched.push({...ref, actualSha256});
    if (parsed.verifyOnly) continue;
  } else if (parsed.verifyOnly) {
    missing.push(ref);
    continue;
  }

  const candidate = findCandidate(ref, searchRoots);
  if (!candidate) {
    missing.push(ref);
    continue;
  }
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.copyFileSync(candidate, absolute);
  const copiedSha = hashFile(absolute);
  if (copiedSha !== ref.sha256) {
    fs.rmSync(absolute);
    mismatched.push({...ref, actualSha256: copiedSha});
    continue;
  }
  restored += 1;
}

console.log(
  `media restore: episode=${episodeId} ok=${ok} restored=${restored} missing=${missing.length} mismatched=${mismatched.length}`,
);
for (const ref of missing) {
  console.error(`MISSING ${ref.path} sha256=${ref.sha256} size=${ref.sizeBytes}`);
}
for (const ref of mismatched) {
  console.error(`MISMATCH ${ref.path} expected=${ref.sha256} actual=${ref.actualSha256}`);
}
if (missing.length > 0 || mismatched.length > 0) {
  process.exitCode = 1;
}
