import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  mediaRetrievalRequestSchema,
  mediaVerificationSchema,
  readMediaRetrievalResult,
  retrieveMediaCandidates,
} from "../src/media";
import {mediaVerificationRequestSchema, rebindMediaVerification} from "../src/media/verify";
import {parseEpisodeFlag} from "../src/lib/episode/cli";
import {installCliErrorHandlers} from "./lib/validation";

installCliErrorHandlers();

const episodeId = parseEpisodeFlag(process.argv) ?? process.env.EPISODE_ID ?? "episode-001";
const repoRoot = path.resolve(import.meta.dirname, "..");

const flagValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`参数 ${flag} 缺少值`);
  if (process.argv.indexOf(flag, index + 1) >= 0) throw new Error(`参数 ${flag} 不能重复`);
  return value;
};

for (const argument of process.argv.slice(2)) {
  if (argument === "--episode" || argument === "--clip-id") continue;
  if (argument.startsWith("--")) throw new Error(`未知参数：${argument}`);
}

const clipId = flagValue("--clip-id");
const scriptPath = path.join(repoRoot, `content/${episodeId}/story/script.json`);
const scriptSchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string().regex(/^seg-[a-z0-9-]+$/u),
        claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).min(1),
        narration: z.string().min(1),
        visualIntent: z.string().min(1),
      }),
    )
    .min(1),
});
const script = scriptSchema.parse(JSON.parse(fs.readFileSync(scriptPath, "utf8")) as unknown);

const unresolved: Array<{segmentId: string; clipId: string; reason: string}> = [];
const refreshed: Array<{segmentId: string; sha256: string; candidateCount: number}> = [];
const rebound: Array<{segmentId: string; clipId: string; sha256: string}> = [];

for (const segment of script.segments) {
  const request = mediaRetrievalRequestSchema.parse({
    schemaVersion: "media-retrieval-request-v1",
    episodeId,
    segmentId: segment.id,
    claimIds: segment.claimIds,
    narration: segment.narration,
    visualIntent: segment.visualIntent,
    preferredMediaTypes: [],
    topK: 25,
  });
  const retrieval = await retrieveMediaCandidates({
    repoRoot,
    episodeId,
    request,
  });
  const result = readMediaRetrievalResult(repoRoot, episodeId, segment.id);
  refreshed.push({
    segmentId: segment.id,
    sha256: retrieval.artifactRef.sha256,
    candidateCount: result.candidates.length,
  });

  const verificationDirectory = path.resolve(
    repoRoot,
    `content/${episodeId}/media/verifications/${segment.id}`,
  );
  if (!fs.existsSync(verificationDirectory)) continue;
  for (const filename of fs
    .readdirSync(verificationDirectory)
    .filter((value) => value.endsWith(".json"))) {
    const verificationPath = path.join(verificationDirectory, filename);
    const raw = mediaVerificationSchema.parse(
      JSON.parse(fs.readFileSync(verificationPath, "utf8")) as unknown,
    );
    if (clipId && raw.clipId !== clipId) continue;
    if (!result.candidates.some((candidate) => candidate.clipId === raw.clipId)) continue;
    try {
      const outcome = rebindMediaVerification({
        repoRoot,
        episodeId,
        request: mediaVerificationRequestSchema.parse({
          schemaVersion: "media-verification-request-v1",
          episodeId,
          segmentId: segment.id,
          clipId: raw.clipId,
          claimIds: segment.claimIds,
          narration: segment.narration,
          visualIntent: segment.visualIntent,
          retrievalResultRef: retrieval.artifactRef,
          maxKeyframes: 4,
        }),
      });
      rebound.push({
        segmentId: segment.id,
        clipId: raw.clipId,
        sha256: outcome.artifactRef.sha256,
      });
    } catch (error) {
      unresolved.push({
        segmentId: segment.id,
        clipId: raw.clipId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      episodeId,
      refreshed,
      rebound,
      externalCapabilityRequired: unresolved,
    },
    null,
    2,
  ),
);
if (unresolved.length > 0) process.exitCode = 2;
