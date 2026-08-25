import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {assertSpawnSucceeded} from "../lib/platform/process";
import {
  copyBytesAtomically,
  FineGrainedCacheStore,
  normalizeNarration,
  sha256Bytes,
  sha256File,
  sha256Json,
  type CacheKind,
} from "../lib/platform/cache";
import {
  artifactRefIsIndexed,
  assertArtifactRefBytes,
  buildArtifactRef,
  emptyArtifactIndex,
  readArtifactIndex,
  readArtifactIndexVersion,
  registerCandidate,
  writeArtifactIndexCas,
} from "../orchestration/artifact-registry";
import {readHumanDecision} from "../orchestration/human-decision";
import {episodeIdSchema} from "../orchestration/identity";
import {
  artifactDependencySchema,
  artifactRefSchema,
  type ArtifactDependency,
  type ArtifactRef,
} from "../orchestration/schemas/artifact";
import {type ClipIndex, type ClipIndexItem} from "./clip-index";
import {getMediaSource, isMediaSourceAdmitted, isMediaSourceRightsApproved} from "./discovery";
import {
  createMediaEvent,
  createMediaEventSink,
  type CreateMediaEventInput,
  type MediaEventSink,
  type MediaEventType,
} from "./events";
import {readMediaSourceManifest} from "./manifest";
import {
  mediaTmpRepositoryPath,
  mediaVerificationClipRepositoryPath,
  mediaVerificationRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";
import {
  MEDIA_VERIFICATION_SCHEMA_VERSION,
  mediaAssetSchema,
  mediaClipRefSchema,
  mediaVerificationSchema,
  type MediaAsset,
  type MediaSource,
  type MediaSourceManifest,
  type MediaVerification,
  type MediaVerificationVerdict,
} from "./schemas";
import {
  readMediaClipIndex,
  readMediaUnderstandingStatus,
  serializeIndexArtifact,
} from "./understanding";
import {
  assertClaimIdsInLedger,
  mediaRetrievalResultSchema,
  readClaimEntries,
  readClaimLedger,
  type ClaimLedgerEntry,
  type MediaRetrievalCandidate,
  type MediaRetrievalResult,
} from "./retrieve";

/**
 * WP-M5.06 multimodal clip verification.
 *
 * Takes one Top-K CandidateClip from a WP-M5.05 `media-retrieval-result-v1`
 * artifact and runs a short-clip-level multimodal verification. Only the
 * candidate window is ever materialized (`startMs..endMs` of the original or
 * its normalized proxy) and handed to Codex — the whole long video is never
 * exposed. Codex observes, diagnoses, and scores; deterministic code performs
 * the final authorization (`assertMediaClipVerified`).
 *
 * Fail-closed: the candidate must exist in the current, hash-valid retrieval
 * artifact; the clip must exist in the current, hash-valid ClipIndex; the
 * source media must be current-episode, byte-hash-valid, still admitted and
 * rights-approved (decisions re-read); cross-episode/stale/tampered inputs
 * abort before any cache consult or provider call. The provider output must
 * validate against `mediaVerificationProviderOutputSchema`; malformed or
 * incomplete output fails closed. `uncertain` is never treated as `pass`.
 *
 * The verification result is persisted as a hash-bound `media-verification-v1`
 * artifact under `content/<ep>/media/verifications/<segmentId>/<clipId>.json`,
 * registered in the episode artifact registry with full lineage, and cached in
 * the M4 fine-grained cache (`media-verify` / `media-verify-clip` kinds). A
 * cache hit still re-runs the complete rights/hash/episode gate. LangGraph
 * state only ever holds the outcome refs/status — never clip bytes or
 * verification bodies.
 *
 * Boundaries: retrieval ≠ verification, verification ≠ rights approval, and
 * verification ≠ factual truth authorization. Nothing here grants rights,
 * modifies the Claim Ledger, or authorizes Remotion.
 */

export const MEDIA_VERIFICATION_REQUEST_SCHEMA_VERSION = "media-verification-request-v1" as const;
export const MEDIA_VERIFICATION_TOOL_VERSION = "media-verification-v1" as const;
export const MEDIA_VERIFICATION_PROMPT_VERSION = "media-verification-prompt-v1" as const;
export {MEDIA_VERIFICATION_SCHEMA_VERSION} from "./schemas";
export const MEDIA_VERIFICATION_CACHE_SCHEMA_VERSION = "media-verify-cache-v1" as const;
export const MEDIA_VERIFICATION_CACHE_IMPLEMENTATION_VERSION =
  "media-verify-cache-impl-v1" as const;
export const MEDIA_VERIFICATION_CLIP_CACHE_SCHEMA_VERSION = "media-verify-clip-cache-v1" as const;
export const MEDIA_VERIFICATION_CLIP_CACHE_IMPLEMENTATION_VERSION =
  "media-verify-clip-cache-impl-v1" as const;
export const MEDIA_VERIFICATION_CLIP_SCHEMA_VERSION = "media-verification-clip-v1" as const;

/** Code/config files whose hashes bind the verification cache identity. */
export const MEDIA_VERIFICATION_DEPENDENCY_PATHS = [
  "src/media/verify.ts",
  "src/media/retrieve.ts",
  "src/media/clip-index.ts",
  "src/media/understanding.ts",
  "src/media/manifest.ts",
  "src/media/events.ts",
  "src/media/paths.ts",
  "src/media/schemas.ts",
  "src/lib/platform/cache.ts",
  "src/orchestration/schemas/artifact.ts",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const sortedHashes = (hashes: Record<string, string>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const key of Object.keys(hashes).sort()) {
    const value = hashes[key];
    if (!value || !/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`media verification cache dependency hash invalid: ${key}`);
    }
    output[key] = value;
  }
  return output;
};

const hashExistingRepositoryFiles = (
  repoRoot: string,
  repositoryPaths: readonly string[],
): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const repositoryPath of repositoryPaths) {
    const absolute = resolveMediaRepositoryPath(repoRoot, repositoryPath);
    if (fs.existsSync(absolute)) {
      output[repositoryPath] = sha256File(absolute);
    }
  }
  return output;
};

/* ------------------------------------------------------------------------- *
 * Provider contract (provider-neutral media verifier)
 * ------------------------------------------------------------------------- */

export const mediaVerificationProviderOutputSchema = z
  .object({
    verdict: z.enum(["pass", "reject", "uncertain"]),
    relevance: z.number().min(0).max(1),
    claimMatch: z.number().min(0).max(1),
    visualQuality: z.number().min(0).max(1),
    misleadingRisk: z.number().min(0).max(1),
    observedActions: z.array(z.string().min(1)).default([]),
    observedEntities: z.array(z.string().min(1)).default([]),
    observedText: z.array(z.string().min(1)).default([]),
    recommendedStartMs: z.number().int().nonnegative(),
    recommendedEndMs: z.number().int().positive(),
    reasons: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.recommendedEndMs <= value.recommendedStartMs) {
      context.addIssue({
        code: "custom",
        path: ["recommendedEndMs"],
        message: "recommendedEndMs must be greater than recommendedStartMs",
      });
    }
    if (value.verdict === "pass" && (value.relevance < 0.5 || value.claimMatch < 0.5)) {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "pass verdict requires relevance and claimMatch to be at least 0.5",
      });
    }
  });

export type MediaVerificationProviderOutput = z.infer<typeof mediaVerificationProviderOutputSchema>;

/** One keyframe still Codex may see alongside the short clip. */
export type MediaVerificationProviderKeyframe = {
  path: string;
  timestampMs: number | null;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
};

/**
 * The ONLY media payload of a verification: the materialized short clip
 * (`startMs..endMs` of the original/proxy). The provider never receives the
 * whole long video — no original asset path and no original bytes are exposed.
 */
export type MediaVerificationProviderClip = {
  path: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
  startMs: number;
  endMs: number;
  sourceMediaId: string;
  /** Original media SHA-256 for context only — never the original bytes. */
  sourceMediaSha256: string;
};

export type MediaVerificationProviderInput = {
  episodeId: string;
  segmentId: string;
  clipId: string;
  claimIds: string[];
  /** Current Claim Ledger text of the requested claims. */
  claims: Array<{id: string; claim: string}>;
  narration: string;
  visualIntent: string;
  /** Short verification clip bytes — the only moving media Codex may watch. */
  clip: MediaVerificationProviderClip;
  /** Few optional keyframe stills of the same candidate window. */
  keyframes: MediaVerificationProviderKeyframe[];
  clipMetadata: {
    textSummary: string;
    observedText: string;
    keywords: string[];
    entities: string[];
    semanticTags: string[];
    speaker: string | null;
  };
};

/**
 * Provider-neutral media verification contract.
 *
 * `verify` returns structured output which the pipeline re-validates with
 * `mediaVerificationProviderOutputSchema`; malformed/incomplete output fails
 * closed. The provider observes and scores only — it has no repository access,
 * cannot modify Artifacts, cannot change rights/admission, cannot touch the
 * Claim Ledger, and cannot declare facts true. Production uses the bounded
 * Codex file handoff below; deterministic providers exist only for tests.
 */
export type MediaVerificationProvider = {
  readonly id: string;
  readonly model: string | null;
  readonly verificationVersion: string;
  verify(input: MediaVerificationProviderInput): Promise<MediaVerificationProviderOutput>;
};

/**
 * Deterministic test stub: returns a fixed output (or derives one from the
 * input via `output(input)`). Never touches the network, never reads media
 * bytes itself — the pipeline materializes and hashes everything.
 */
export const createDeterministicVerificationProvider = (
  options: {
    id?: string;
    model?: string | null;
    verificationVersion?: string;
    output?:
      | MediaVerificationProviderOutput
      | ((input: MediaVerificationProviderInput) => MediaVerificationProviderOutput);
  } = {},
): MediaVerificationProvider => {
  const id = options.id ?? "deterministic-stub";
  const model = options.model ?? null;
  const verificationVersion = options.verificationVersion ?? "deterministic-verify-v1";
  const output = options.output;
  return {
    id,
    model,
    verificationVersion,
    verify: async (input) => {
      if (output) {
        return typeof output === "function" ? output(input) : output;
      }
      // Default: a deterministic pass over the exact candidate window.
      return {
        verdict: "pass",
        relevance: 0.9,
        claimMatch: 0.9,
        visualQuality: 0.8,
        misleadingRisk: 0.1,
        observedActions: [],
        observedEntities: [],
        observedText: [],
        recommendedStartMs: input.clip.startMs,
        recommendedEndMs: input.clip.endMs,
        reasons: ["deterministic stub observed the short clip only"],
      };
    },
  };
};

export const CODEX_MEDIA_VERIFICATION_REQUEST_VERSION =
  "codex-media-verification-request-v1" as const;
export const CODEX_MEDIA_VERIFICATION_RESULT_VERSION =
  "codex-media-verification-result-v1" as const;

const codexMediaVerificationResultSchema = z
  .object({
    schemaVersion: z.literal(CODEX_MEDIA_VERIFICATION_RESULT_VERSION),
    executor: z.literal("codex"),
    model: z.literal("gpt-5.6"),
    requestHash: sha256Schema,
    completedAt: z.string().datetime(),
    output: mediaVerificationProviderOutputSchema,
  })
  .strict();

const repositoryRelativeMediaPath = (repoRoot: string, absolutePath: string): string => {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(absolutePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`MEDIA_VERIFY_CODEX_PATH_OUTSIDE_REPOSITORY:${absolutePath}`);
  }
  return relative.split(path.sep).join("/");
};

export const codexMediaVerificationHandoffPaths = (input: {
  episodeId: string;
  segmentId: string;
  clipId: string;
}): {requestPath: string; resultPath: string} => {
  const verificationPath = mediaVerificationRepositoryPath(
    input.episodeId,
    input.segmentId,
    input.clipId,
  );
  const base = verificationPath.replace(/\.json$/u, "");
  return {
    requestPath: `${base}.codex-request.json`,
    resultPath: `${base}.codex-result.json`,
  };
};

const writeJsonAtomically = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};

/**
 * Production media verification is an explicit Codex file handoff, not a
 * hosted VLM API. The first run writes a bounded request containing only the
 * short clip and its keyframes, then fails closed as pending. Codex inspects
 * those local files and writes the result file; the next run verifies the
 * request hash and structured output before the canonical artifact is built.
 */
export const createCodexMediaVerificationProvider = (input: {
  repoRoot: string;
}): MediaVerificationProvider => ({
  id: "codex",
  model: "gpt-5.6",
  verificationVersion: "codex-media-verification-v1",
  verify: async (providerInput) => {
    const paths = codexMediaVerificationHandoffPaths(providerInput);
    const requestBody = {
      schemaVersion: CODEX_MEDIA_VERIFICATION_REQUEST_VERSION,
      executor: "codex" as const,
      model: "gpt-5.6" as const,
      boundedMediaOnly: true as const,
      episodeId: providerInput.episodeId,
      segmentId: providerInput.segmentId,
      clipId: providerInput.clipId,
      claimIds: providerInput.claimIds,
      claims: providerInput.claims,
      narration: providerInput.narration,
      visualIntent: providerInput.visualIntent,
      clip: {
        ...providerInput.clip,
        path: repositoryRelativeMediaPath(input.repoRoot, providerInput.clip.path),
      },
      keyframes: providerInput.keyframes.map((keyframe) => ({
        ...keyframe,
        path: repositoryRelativeMediaPath(input.repoRoot, keyframe.path),
      })),
      clipMetadata: providerInput.clipMetadata,
      resultContract: {
        schemaVersion: CODEX_MEDIA_VERIFICATION_RESULT_VERSION,
        envelope: ["executor", "model", "requestHash", "completedAt", "output"],
        output: {
          verdict: ["pass", "reject", "uncertain"],
          scores: ["relevance", "claimMatch", "visualQuality", "misleadingRisk"],
          observations: ["observedActions", "observedEntities", "observedText"],
          range: ["recommendedStartMs", "recommendedEndMs"],
          explanation: ["reasons"],
        },
        instruction:
          "Inspect only the listed clip and keyframes. Copy this requestHash into the result envelope; do not alter rights or claim facts.",
      },
    };
    const requestHash = sha256Json(requestBody);
    const request = {...requestBody, requestHash};
    const requestPath = resolveMediaRepositoryPath(input.repoRoot, paths.requestPath);
    const resultPath = resolveMediaRepositoryPath(input.repoRoot, paths.resultPath);
    writeJsonAtomically(requestPath, request);
    if (!fs.existsSync(resultPath)) {
      throw new Error(`MEDIA_VERIFY_CODEX_RESULT_PENDING:${paths.resultPath}`);
    }
    let parsed: z.infer<typeof codexMediaVerificationResultSchema>;
    try {
      parsed = codexMediaVerificationResultSchema.parse(
        JSON.parse(fs.readFileSync(resultPath, "utf8")) as unknown,
      );
    } catch (error) {
      throw new Error("MEDIA_VERIFY_CODEX_RESULT_INVALID", {cause: error});
    }
    if (parsed.requestHash !== requestHash) {
      throw new Error("MEDIA_VERIFY_CODEX_REQUEST_HASH_MISMATCH");
    }
    return parsed.output;
  },
});

/* ------------------------------------------------------------------------- *
 * Short clip materialization
 * ------------------------------------------------------------------------- */

export type ShortClipExtractionInput = {
  inputPath: string;
  startMs: number;
  endMs: number;
  outputPath: string;
  /** Original/analysis-source media type of the asset being cut. */
  mediaType: string;
};

/** Deterministic contract: writes only the candidate window to outputPath. */
export type ShortClipExtractor = {
  readonly id: string;
  readonly version: string;
  extract(input: ShortClipExtractionInput): void;
};

/**
 * Default extractor: exact-seek + bounded re-encode of the candidate window.
 * The window is clamped to the media duration by the caller's gate. Any ffmpeg
 * failure fails closed (`MEDIA_VERIFY_CLIP_EXTRACTION_FAILED`).
 */
export const createFfmpegShortClipExtractor = (
  input: {ffmpegPath?: string} = {},
): ShortClipExtractor => {
  const ffmpegPath = input.ffmpegPath ?? "ffmpeg";
  return {
    id: "ffmpeg",
    version: "ffmpeg-short-clip-v1",
    extract: ({inputPath, startMs, endMs, outputPath, mediaType}) => {
      const durationSeconds = ((endMs - startMs) / 1000).toFixed(3);
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(startMs / 1000),
        "-i",
        inputPath,
        "-t",
        durationSeconds,
      ];
      if (mediaType.startsWith("audio/")) {
        args.push("-vn", "-c:a", "aac", "-b:a", "128k");
      } else {
        args.push(
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
        );
      }
      args.push("-movflags", "+faststart", outputPath);
      const result = spawnSync(ffmpegPath, args, {encoding: "utf8"});
      try {
        assertSpawnSucceeded(ffmpegPath, args, result);
      } catch (error) {
        throw new Error(
          `MEDIA_VERIFY_CLIP_EXTRACTION_FAILED:${error instanceof Error ? error.message : String(error)}`,
          {cause: error},
        );
      }
      if (!fs.existsSync(outputPath)) {
        throw new Error("MEDIA_VERIFY_CLIP_EXTRACTION_FAILED:no-output");
      }
    },
  };
};

export type StubShortClipBytesInput = {
  bytes?: Uint8Array;
  version?: string;
};

/**
 * Deterministic test extractor: writes fixed bytes regardless of the window.
 * Pipeline mechanics (hashing, caching, registration) are exercised without
 * any media tool.
 */
export const createStubShortClipExtractor = (
  input: StubShortClipBytesInput = {},
): ShortClipExtractor => ({
  id: "stub-short-clip",
  version: input.version ?? "stub-short-clip-v1",
  extract: ({outputPath}) => {
    const bytes = input.bytes ?? Buffer.from("M5.06 deterministic stub short clip bytes\n", "utf8");
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    fs.writeFileSync(outputPath, bytes);
  },
});

const extensionForMediaType = (mediaType: string): string => {
  if (mediaType === "video/mp4") return "mp4";
  if (mediaType === "audio/mpeg") return "mp3";
  if (mediaType === "audio/wav" || mediaType === "audio/x-wav") return "wav";
  if (mediaType.startsWith("video/")) return "mp4";
  if (mediaType.startsWith("audio/")) return "m4a";
  throw new Error(`MEDIA_VERIFY_CLIP_MEDIA_TYPE_UNSUPPORTED:${mediaType}`);
};

/* ------------------------------------------------------------------------- *
 * Verification request
 * ------------------------------------------------------------------------- */

export const mediaVerificationRequestSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_VERIFICATION_REQUEST_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    /** Final-script segment identity. */
    segmentId: z.string().regex(/^seg-[a-z0-9-]+$/u),
    /** Candidate clip identity; must exist in the retrieval result + ClipIndex. */
    clipId: z.string().min(1),
    /** Claim Ledger ids (sorted, unique); verification is claim-bound. */
    claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).min(1),
    narration: z.string().min(1).max(5000),
    visualIntent: z.string().min(1).max(1000),
    /** Hash-bound `media-retrieval-result-v1` artifact the candidate comes from. */
    retrievalResultRef: artifactRefSchema,
    /** Max keyframe stills attached to the provider call (0 = none). */
    maxKeyframes: z.number().int().min(0).max(16).default(4),
  })
  .strict();

export type MediaVerificationRequest = z.infer<typeof mediaVerificationRequestSchema>;

/** Canonical request used for cache identity and result persistence. */
export const normalizeVerificationRequest = (
  input: MediaVerificationRequest,
): MediaVerificationRequest =>
  mediaVerificationRequestSchema.parse({
    schemaVersion: MEDIA_VERIFICATION_REQUEST_SCHEMA_VERSION,
    episodeId: input.episodeId,
    segmentId: input.segmentId,
    clipId: input.clipId,
    claimIds: [...new Set(input.claimIds)].sort(),
    narration: normalizeNarration(input.narration),
    visualIntent: normalizeNarration(input.visualIntent),
    retrievalResultRef: input.retrievalResultRef,
    maxKeyframes: input.maxKeyframes,
  });

/* ------------------------------------------------------------------------- *
 * Cache identity
 * ------------------------------------------------------------------------- */

export type VerificationClipIdentityInput = {
  episodeId: string;
  clipId: string;
  mediaSha256: string;
  analysisSourceSha256: string;
  startMs: number;
  endMs: number;
  extractorId: string;
  extractorVersion: string;
  dependencyHashes: Record<string, string>;
};

/**
 * Short-clip identity: source media SHA + analysis source SHA + exact window +
 * extractor id/version + dependency hashes. A source change, window change,
 * or extractor change produces a different identity — stale clip bytes are
 * never reused.
 */
export const buildVerificationClipIdentityKey = (input: VerificationClipIdentityInput): string => {
  if (!/^[a-f0-9]{64}$/u.test(input.mediaSha256)) {
    throw new Error("verification clip identity mediaSha256 must be a SHA-256 digest");
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_VERIFICATION_CLIP_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_VERIFICATION_CLIP_CACHE_IMPLEMENTATION_VERSION,
    episodeId: input.episodeId,
    clipId: input.clipId,
    mediaSha256: input.mediaSha256,
    analysisSourceSha256: input.analysisSourceSha256,
    startMs: input.startMs,
    endMs: input.endMs,
    extractorId: input.extractorId,
    extractorVersion: input.extractorVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

export type MediaVerificationCacheKeyInput = {
  episodeId: string;
  segmentId: string;
  clipId: string;
  /** SHA-256 of the materialized short clip bytes Codex will see. */
  clipBytesSha256: string;
  mediaSha256: string;
  indexSha256: string;
  retrievalResultSha256: string;
  claimIds: string[];
  narration: string;
  visualIntent: string;
  providerId: string;
  model: string | null;
  verificationVersion: string;
  promptVersion: string;
  schemaVersion: string;
  dependencyHashes: Record<string, string>;
};

/**
 * Verification identity: episode + segment + clip + candidate clip bytes SHA +
 * source/index/retrieval hashes + claimIds + narration + visualIntent +
 * provider/model/version + prompt version + schema version + dependency
 * hashes. Any of these changing produces a different key, so a stale entry can
 * never be reused; identical input always yields the identical key.
 */
export const buildMediaVerificationCacheKey = (input: MediaVerificationCacheKeyInput): string => {
  for (const label of [
    "clipBytesSha256",
    "mediaSha256",
    "indexSha256",
    "retrievalResultSha256",
  ] as const) {
    if (!/^[a-f0-9]{64}$/u.test(input[label])) {
      throw new Error(`media verification cache ${label} must be a SHA-256 digest`);
    }
  }
  return sha256Json({
    cacheSchemaVersion: MEDIA_VERIFICATION_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_VERIFICATION_CACHE_IMPLEMENTATION_VERSION,
    episodeId: input.episodeId,
    segmentId: input.segmentId,
    clipId: input.clipId,
    clipBytesSha256: input.clipBytesSha256,
    mediaSha256: input.mediaSha256,
    indexSha256: input.indexSha256,
    retrievalResultSha256: input.retrievalResultSha256,
    claimIds: [...new Set(input.claimIds)].sort(),
    narration: normalizeNarration(input.narration),
    visualIntent: normalizeNarration(input.visualIntent),
    providerId: input.providerId,
    model: input.model,
    verificationVersion: input.verificationVersion,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });
};

/* ------------------------------------------------------------------------- *
 * Gates (fail-closed, run before any cache consult or provider call)
 * ------------------------------------------------------------------------- */

const artifactFileValid = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    const filePath = resolveMediaRepositoryPath(repoRoot, ref.path);
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    return (
      stat.size === ref.sizeBytes &&
      sha256File(filePath) === ref.sha256 &&
      artifactRefIsIndexed(repoRoot, ref)
    );
  } catch {
    return false;
  }
};

const decisionDependencies = (
  source: MediaSourceManifest["sources"][number],
): ArtifactDependency[] => {
  const dependencies: ArtifactDependency[] = [];
  for (const ref of [source.admissionDecisionRef, source.rightsDecisionRef]) {
    if (ref) {
      dependencies.push(
        artifactDependencySchema.parse({
          artifactId: ref.artifactId,
          path: ref.path,
          sha256: ref.sha256,
          relation: "reads",
        }),
      );
    }
  }
  return dependencies;
};

const readDependencies = (refs: readonly ArtifactRef[]): ArtifactDependency[] =>
  refs.map((ref) =>
    artifactDependencySchema.parse({
      artifactId: ref.artifactId,
      path: ref.path,
      sha256: ref.sha256,
      relation: "reads",
    }),
  );

const dedupeDependencies = (dependencies: readonly ArtifactDependency[]): ArtifactDependency[] => {
  const seen = new Set<string>();
  const output: ArtifactDependency[] = [];
  for (const dependency of dependencies) {
    const key = `${dependency.artifactId}:${dependency.sha256}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(dependency);
  }
  return output;
};

const gateRetrievalResult = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  ref: ArtifactRef;
  clipId: string;
}): {result: MediaRetrievalResult; candidate: MediaRetrievalCandidate} => {
  const {repoRoot, episodeId, segmentId, clipId} = input;
  const ref = artifactRefSchema.parse(input.ref);
  if (ref.episodeId !== episodeId) {
    throw new Error(`MEDIA_VERIFY_RETRIEVAL_REF_EPISODE_MISMATCH:${ref.episodeId}:${episodeId}`);
  }
  if (!artifactRefIsIndexed(repoRoot, ref)) {
    throw new Error(`MEDIA_VERIFY_RETRIEVAL_NOT_REGISTERED:${ref.artifactId}`);
  }
  let bytes: Buffer;
  try {
    assertArtifactRefBytes(repoRoot, ref);
    bytes = fs.readFileSync(resolveMediaRepositoryPath(repoRoot, ref.path));
  } catch (error) {
    throw new Error(`MEDIA_VERIFY_RETRIEVAL_TAMPERED:${ref.artifactId}`, {cause: error});
  }
  let result: MediaRetrievalResult;
  try {
    result = mediaRetrievalResultSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  } catch (error) {
    throw new Error(`MEDIA_VERIFY_RETRIEVAL_INVALID:${ref.artifactId}`, {cause: error});
  }
  if (result.episodeId !== episodeId || result.segmentId !== segmentId) {
    throw new Error(`MEDIA_VERIFY_RETRIEVAL_MISMATCH:${ref.artifactId}`);
  }
  const candidate = result.candidates.find(
    (value) => value.clipId === clipId && value.episodeId === episodeId,
  );
  if (!candidate) {
    throw new Error(`MEDIA_VERIFY_CANDIDATE_NOT_IN_RESULT:${clipId}`);
  }
  return {result, candidate};
};

const assertMediaAssetBytesOrThrow = (repoRoot: string, asset: MediaAsset): void => {
  const filePath = resolveMediaRepositoryPath(repoRoot, asset.artifactRef.path);
  let actual: Buffer;
  try {
    actual = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`MEDIA_VERIFY_ASSET_TAMPERED:${asset.mediaId}`, {cause: error});
  }
  if (
    actual.byteLength !== asset.artifactRef.sizeBytes ||
    sha256File(filePath) !== asset.artifactRef.sha256
  ) {
    throw new Error(`MEDIA_VERIFY_ASSET_TAMPERED:${asset.mediaId}`);
  }
};

const gateVerificationMedia = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
  mediaId: string;
}): {asset: MediaAsset; source: MediaSource} => {
  const {repoRoot, episodeId, manifest} = input;
  const rawAsset = manifest.assets.find((candidate) => candidate.mediaId === input.mediaId);
  if (!rawAsset) {
    throw new Error(`MEDIA_VERIFY_ASSET_UNKNOWN:${input.mediaId}`);
  }
  const asset = mediaAssetSchema.parse(rawAsset);
  if (asset.episodeId !== episodeId) {
    throw new Error(`MEDIA_VERIFY_ASSET_EPISODE_MISMATCH:${asset.mediaId}:${episodeId}`);
  }
  const recorded = manifest.assets.find((candidate) => candidate.mediaId === asset.mediaId);
  if (!recorded || JSON.stringify(recorded) !== JSON.stringify(asset)) {
    throw new Error(`MEDIA_VERIFY_ASSET_STALE:${asset.mediaId}`);
  }
  const source = getMediaSource(manifest, asset.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_VERIFY_SOURCE_UNKNOWN:${asset.mediaSourceId}`);
  }
  // Current admission/rights are re-checked on every run (including cache
  // hits and gate re-validations) — never served from stale state.
  if (!isMediaSourceAdmitted(source)) {
    throw new Error(`MEDIA_VERIFY_SOURCE_NOT_ADMITTED:${source.sourceId}`);
  }
  if (!isMediaSourceRightsApproved(source)) {
    throw new Error(`MEDIA_VERIFY_SOURCE_RIGHTS_NOT_APPROVED:${source.sourceId}`);
  }
  if (source.admissionDecisionRef) {
    readHumanDecision(repoRoot, source.admissionDecisionRef, episodeId);
  }
  if (source.rightsDecisionRef) {
    readHumanDecision(repoRoot, source.rightsDecisionRef, episodeId);
  }
  if (asset.rightsStatus !== "approved") {
    throw new Error(`MEDIA_VERIFY_ASSET_RIGHTS_NOT_APPROVED:${asset.mediaId}`);
  }
  if (!artifactRefIsIndexed(repoRoot, asset.artifactRef)) {
    throw new Error(`MEDIA_VERIFY_ASSET_NOT_REGISTERED:${asset.mediaId}`);
  }
  assertMediaAssetBytesOrThrow(repoRoot, asset);
  return {asset, source};
};

const gateVerificationClipIndex = (input: {
  repoRoot: string;
  episodeId: string;
  asset: MediaAsset;
  candidate: MediaRetrievalCandidate;
  clipId: string;
}): {indexRef: ArtifactRef; index: ClipIndex; item: ClipIndexItem} => {
  const {repoRoot, episodeId, asset, candidate, clipId} = input;
  if (candidate.mediaId !== asset.mediaId) {
    throw new Error(`MEDIA_VERIFY_CANDIDATE_MEDIA_MISMATCH:${clipId}`);
  }
  const status = readMediaUnderstandingStatus(repoRoot, episodeId, asset.mediaId);
  const indexRef = status?.stages["clip-index"]?.ref ?? null;
  if (!indexRef) {
    throw new Error(`MEDIA_VERIFY_INDEX_MISSING:${asset.mediaId}`);
  }
  if (!artifactFileValid(repoRoot, indexRef)) {
    if (!artifactRefIsIndexed(repoRoot, indexRef)) {
      throw new Error(`MEDIA_VERIFY_INDEX_NOT_REGISTERED:${indexRef.artifactId}`);
    }
    throw new Error(`MEDIA_VERIFY_INDEX_TAMPERED:${indexRef.artifactId}`);
  }
  let index: ClipIndex;
  try {
    index = readMediaClipIndex(repoRoot, episodeId, asset.mediaId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("MEDIA_INDEX_ARTIFACT_MISMATCH")) {
      throw new Error(`MEDIA_VERIFY_INDEX_MISMATCH:${asset.mediaId}`, {cause: error});
    }
    throw new Error(`MEDIA_VERIFY_INDEX_INVALID:${asset.mediaId}`, {cause: error});
  }
  if (
    index.episodeId !== episodeId ||
    index.mediaId !== asset.mediaId ||
    index.mediaRef.sha256 !== asset.sha256 ||
    index.sourceSha256 !== asset.sha256
  ) {
    throw new Error(`MEDIA_VERIFY_INDEX_MISMATCH:${asset.mediaId}`);
  }
  const item = index.items.find((value) => value.clipId === clipId);
  if (!item) {
    throw new Error(`MEDIA_VERIFY_CLIP_NOT_IN_INDEX:${clipId}`);
  }
  if (item.mediaRef.sha256 !== asset.sha256) {
    throw new Error(`MEDIA_VERIFY_INDEX_MISMATCH:${asset.mediaId}`);
  }
  if (item.startMs !== candidate.startMs || item.endMs !== candidate.endMs) {
    throw new Error(`MEDIA_VERIFY_CLIP_WINDOW_MISMATCH:${clipId}`);
  }
  if (asset.durationMs !== null && item.endMs > asset.durationMs) {
    throw new Error(`MEDIA_VERIFY_WINDOW_OUT_OF_BOUNDS:${clipId}`);
  }
  return {indexRef, index, item};
};

const verifyClaimGate = (
  repoRoot: string,
  episodeId: string,
  claimIds: readonly string[],
): {binding: {path: string; sha256: string; sizeBytes: number}; entries: ClaimLedgerEntry[]} => {
  try {
    const binding = readClaimLedger(repoRoot, episodeId);
    const entries = readClaimEntries(repoRoot, episodeId);
    assertClaimIdsInLedger({claimIds, entries});
    return {binding, entries};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^MEDIA_RETRIEVE_CLAIM_/u, "MEDIA_VERIFY_CLAIM_"), {
      cause: error,
    });
  }
};

/* ------------------------------------------------------------------------- *
 * Short clip materialization + persistence
 * ------------------------------------------------------------------------- */

const registerVerificationCandidate = (input: {
  repoRoot: string;
  episodeId: string;
  ref: ArtifactRef;
  executionId: string;
  dependencies: readonly ArtifactDependency[];
}): void => {
  const filePath = path.resolve(input.repoRoot, `content/${input.episodeId}/artifact-index.json`);
  const expectedVersion = readArtifactIndexVersion(filePath);
  let index = fs.existsSync(filePath)
    ? readArtifactIndex(filePath)
    : emptyArtifactIndex(input.episodeId);
  index = registerCandidate(index, input.ref, input.executionId, [...input.dependencies]);
  writeArtifactIndexCas({
    filePath,
    index,
    expectedVersion,
    casRoot: input.repoRoot,
  });
};

const publishVerificationClip = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  clipId: string;
  extension: string;
  mediaType: string;
  artifactId: string;
  bytes: Uint8Array;
  dependencies: readonly ArtifactDependency[];
  executionId: string;
  producer: string;
  now: () => string;
}): ArtifactRef => {
  const filePath = resolveMediaRepositoryPath(
    input.repoRoot,
    mediaVerificationClipRepositoryPath(
      input.episodeId,
      input.segmentId,
      input.clipId,
      input.extension,
    ),
  );
  copyBytesAtomically(filePath, Buffer.from(input.bytes));
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: mediaVerificationClipRepositoryPath(
      input.episodeId,
      input.segmentId,
      input.clipId,
      input.extension,
    ),
    mediaType: input.mediaType,
    schemaVersion: MEDIA_VERIFICATION_CLIP_SCHEMA_VERSION,
    producer: input.producer,
    createdAt: input.now(),
  });
  registerVerificationCandidate({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref,
    executionId: input.executionId,
    dependencies: input.dependencies,
  });
  return ref;
};

export type MaterializeVerificationClipResult = {
  ref: ArtifactRef;
  bytes: Buffer;
  sha256: string;
  cacheHit: boolean;
  reused: boolean;
};

const materializeVerificationClip = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  clipId: string;
  asset: MediaAsset;
  analysisSource: MediaAsset;
  source: MediaSource;
  startMs: number;
  endMs: number;
  extractor: ShortClipExtractor;
  cache: FineGrainedCacheStore | null;
  dependencyHashes: Record<string, string>;
  emit: (
    eventType: MediaEventType,
    extra?: Omit<
      CreateMediaEventInput,
      "eventType" | "occurredAt" | "episodeId" | "mediaId" | "mediaSourceId"
    >,
  ) => void;
  now: () => string;
  executionId: string;
}): MaterializeVerificationClipResult => {
  const {repoRoot, episodeId, segmentId, clipId, asset, analysisSource, startMs, endMs} = input;
  const extension = extensionForMediaType(analysisSource.mediaType);
  const identityKey = buildVerificationClipIdentityKey({
    episodeId,
    clipId,
    mediaSha256: asset.sha256,
    analysisSourceSha256: analysisSource.sha256,
    startMs,
    endMs,
    extractorId: input.extractor.id,
    extractorVersion: input.extractor.version,
    dependencyHashes: input.dependencyHashes,
  });
  const cacheMetadata = {
    schemaVersion: "media-verify-clip-cache-metadata-v1",
    episodeId,
    segmentId,
    clipId,
    cacheKey: identityKey,
    artifactId: `${episodeId}:media-verification-clip:${clipId.replace(/[^a-z0-9-]/gu, "-")}`,
    mediaType: analysisSource.mediaType,
    startMs,
    endMs,
    sourceMediaSha256: asset.sha256,
  };
  const dependencies = dedupeDependencies([
    ...readDependencies([asset.artifactRef, analysisSource.artifactRef]),
    ...decisionDependencies(input.source),
  ]);
  const producer = `${MEDIA_VERIFICATION_TOOL_VERSION}:clip:${input.extractor.id}:${input.extractor.version}`;

  if (input.cache) {
    const looked = input.cache.lookup({
      kind: "media-verify-clip" as CacheKind,
      cacheKey: identityKey,
      stage: "media-verify-clip",
      logicalItem: `${episodeId}:${clipId}`,
      validateMetadata: (value) => {
        const parsed = z
          .object({
            schemaVersion: z.literal("media-verify-clip-cache-metadata-v1"),
            episodeId: episodeIdSchema,
            segmentId: z.string().min(1),
            clipId: z.string().min(1),
            cacheKey: sha256Schema,
            artifactId: z.string().min(1),
            mediaType: z.string().min(1),
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().positive(),
            sourceMediaSha256: sha256Schema,
          })
          .strict()
          .parse(value);
        if (
          parsed.episodeId !== episodeId ||
          parsed.segmentId !== segmentId ||
          parsed.clipId !== clipId ||
          parsed.cacheKey !== identityKey ||
          parsed.artifactId !== cacheMetadata.artifactId ||
          parsed.mediaType !== analysisSource.mediaType ||
          parsed.startMs !== startMs ||
          parsed.endMs !== endMs ||
          parsed.sourceMediaSha256 !== asset.sha256
        ) {
          throw new Error("media verify clip cache metadata mismatch");
        }
        return parsed;
      },
    });
    if (looked.hit) {
      input.emit("media.verification.cache.hit", {
        cacheKey: identityKey,
        sha256: looked.entry.payload.sha256,
        sizeBytes: looked.entry.payload.sizeBytes,
        mediaType: analysisSource.mediaType,
        clipId,
        segmentId,
        reason: "clip",
      });
      const ref = publishVerificationClip({
        repoRoot,
        episodeId,
        segmentId,
        clipId,
        extension,
        mediaType: analysisSource.mediaType,
        artifactId: cacheMetadata.artifactId,
        bytes: looked.bytes,
        dependencies,
        executionId: input.executionId,
        producer,
        now: input.now,
      });
      return {ref, bytes: looked.bytes, sha256: ref.sha256, cacheHit: true, reused: false};
    }
    input.emit("media.verification.cache.miss", {
      cacheKey: identityKey,
      clipId,
      segmentId,
      reason: `clip:${looked.reason}`,
    });
  }

  // Extract to a temp path first; only a successful, hashed extraction is ever
  // copied to the repository path and registered. Failed/temp fragments are
  // never registered as usable artifacts.
  const temporaryOutput = resolveMediaRepositoryPath(
    repoRoot,
    `${mediaTmpRepositoryPath(episodeId)}/verify-${process.pid}-${crypto.randomBytes(6).toString("hex")}.${extension}`,
  );
  try {
    input.extractor.extract({
      inputPath: resolveMediaRepositoryPath(repoRoot, analysisSource.artifactRef.path),
      startMs,
      endMs,
      outputPath: temporaryOutput,
      mediaType: analysisSource.mediaType,
    });
    const bytes = fs.readFileSync(temporaryOutput);
    const ref = publishVerificationClip({
      repoRoot,
      episodeId,
      segmentId,
      clipId,
      extension,
      mediaType: analysisSource.mediaType,
      artifactId: cacheMetadata.artifactId,
      bytes,
      dependencies,
      executionId: input.executionId,
      producer,
      now: input.now,
    });
    if (input.cache) {
      input.cache.put({
        kind: "media-verify-clip" as CacheKind,
        cacheKey: identityKey,
        stage: "media-verify-clip",
        logicalItem: `${episodeId}:${clipId}`,
        mediaType: analysisSource.mediaType,
        bytes,
        metadata: cacheMetadata,
      });
    }
    return {ref, bytes, sha256: ref.sha256, cacheHit: false, reused: false};
  } finally {
    if (fs.existsSync(temporaryOutput)) {
      fs.rmSync(temporaryOutput, {force: true});
    }
  }
};

/* ------------------------------------------------------------------------- *
 * Verification artifact persistence
 * ------------------------------------------------------------------------- */

const publishVerificationArtifact = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  clipId: string;
  artifactId: string;
  bytes: Uint8Array;
  dependencies: readonly ArtifactDependency[];
  executionId: string;
  producer: string;
  now: () => string;
}): ArtifactRef => {
  const filePath = resolveMediaRepositoryPath(
    input.repoRoot,
    mediaVerificationRepositoryPath(input.episodeId, input.segmentId, input.clipId),
  );
  copyBytesAtomically(filePath, Buffer.from(input.bytes));
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: mediaVerificationRepositoryPath(input.episodeId, input.segmentId, input.clipId),
    mediaType: "application/json",
    schemaVersion: MEDIA_VERIFICATION_SCHEMA_VERSION,
    producer: input.producer,
    createdAt: input.now(),
  });
  registerVerificationCandidate({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref,
    executionId: input.executionId,
    dependencies: input.dependencies,
  });
  return ref;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
};

const roundScore = (value: number): number => Math.round(value * 1e6) / 1e6;

/* ------------------------------------------------------------------------- *
 * Main entry point
 * ------------------------------------------------------------------------- */

export type VerifyMediaClipInput = {
  repoRoot: string;
  episodeId: string;
  request: MediaVerificationRequest;
  /** Media verifier; deterministic stub in tests, Codex file handoff in production. */
  provider: MediaVerificationProvider;
  cache?: FineGrainedCacheStore | null;
  shortClipExtractor?: ShortClipExtractor;
  eventSink?: MediaEventSink;
  cacheDependencyHashes?: Record<string, string>;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export type MediaVerificationOutcome = {
  /** Hash-bound ArtifactRef of the persisted `media-verification-v1` artifact. */
  artifactRef: ArtifactRef;
  /** Hash-bound ArtifactRef of the short verification clip bytes. */
  clipArtifactRef: ArtifactRef;
  /** Reference-only status for LangGraph state (never the result body). */
  status: "ready";
  verdict: MediaVerificationVerdict;
  episodeId: string;
  segmentId: string;
  clipId: string;
  cacheHit: boolean;
  reused: boolean;
  cacheKey: string;
  clipCacheHit: boolean;
};

const VERIFICATION_SCOPE_MEDIA_ID = (episodeId: string): string =>
  `${episodeId}:media:verification`;
const VERIFICATION_SCOPE_SOURCE_ID = (episodeId: string): string =>
  `${episodeId}:media-source:verification`;

export const verifyMediaClip = async (
  input: VerifyMediaClipInput,
): Promise<MediaVerificationOutcome> => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});

  const request = normalizeVerificationRequest(mediaVerificationRequestSchema.parse(input.request));
  if (request.episodeId !== episodeId) {
    throw new Error(`MEDIA_VERIFY_EPISODE_MISMATCH:${request.episodeId}:${episodeId}`);
  }

  const emit = (
    eventType: MediaEventType,
    extra: Omit<
      CreateMediaEventInput,
      "eventType" | "occurredAt" | "episodeId" | "mediaId" | "mediaSourceId"
    > = {},
  ): void => {
    eventSink(
      createMediaEvent({
        eventType,
        occurredAt: now(),
        episodeId,
        mediaId: VERIFICATION_SCOPE_MEDIA_ID(episodeId),
        mediaSourceId: VERIFICATION_SCOPE_SOURCE_ID(episodeId),
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        segmentId: request.segmentId,
        clipId: request.clipId,
        ...(request.claimIds.length > 0 ? {claimIds: request.claimIds} : {}),
        ...extra,
      }),
    );
  };

  emit("media.verification.started", {});
  try {
    // 1. Retrieval artifact gate: the candidate must exist in the current,
    //    hash-valid, episode-scoped retrieval result.
    const {candidate} = gateRetrievalResult({
      repoRoot,
      episodeId,
      segmentId: request.segmentId,
      ref: request.retrievalResultRef,
      clipId: request.clipId,
    });

    // 2. Claim Ledger is part of the query identity: ids must be current.
    const {entries: claimEntries} = verifyClaimGate(repoRoot, episodeId, request.claimIds);

    // 3. Media gate: current admission/rights + byte-hash validity. Runs before
    //    any cache consult or provider call.
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const {asset, source} = gateVerificationMedia({
      repoRoot,
      episodeId,
      manifest,
      mediaId: candidate.mediaId,
    });

    // 4. ClipIndex gate: the clip exists in the current hash-valid index with
    //    the exact candidate window.
    const {indexRef, item} = gateVerificationClipIndex({
      repoRoot,
      episodeId,
      asset,
      candidate,
      clipId: request.clipId,
    });

    // 5. Short clip materialization: only `startMs..endMs` is ever handed to
    //    Codex. Analysis source: normalized proxy preferred, original
    //    otherwise — lineage always anchors to the original.
    const proxy = manifest.assets.find(
      (value) => value.kind === "proxy" && value.derivedFromMediaId === asset.mediaId,
    );
    let analysisSource: MediaAsset;
    if (proxy) {
      assertMediaAssetBytesOrThrow(repoRoot, proxy);
      if (!proxy.derivedFromMediaRef || proxy.derivedFromMediaRef.sha256 !== asset.sha256) {
        throw new Error(`MEDIA_VERIFY_PROXY_STALE:${proxy.mediaId}`);
      }
      analysisSource = proxy;
    } else {
      analysisSource = asset;
    }
    const dependencyHashes =
      input.cacheDependencyHashes ??
      hashExistingRepositoryFiles(repoRoot, MEDIA_VERIFICATION_DEPENDENCY_PATHS);
    const extractor = input.shortClipExtractor ?? createFfmpegShortClipExtractor();
    const executionId = `media-verification:${request.segmentId}:${request.clipId}`;
    const clipResult = materializeVerificationClip({
      repoRoot,
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      asset,
      analysisSource,
      source,
      startMs: candidate.startMs,
      endMs: candidate.endMs,
      extractor,
      cache: input.cache ?? null,
      dependencyHashes,
      emit,
      now,
      executionId,
    });

    // 6. Provider input: short clip + few keyframes only. Keyframes are the
    //    candidate window's own stills, hash-validated and bounded.
    const keyframeRefs = item.keyframeRefs.filter((ref) => artifactFileValid(repoRoot, ref));
    const keyframes: MediaVerificationProviderKeyframe[] = keyframeRefs
      .slice(0, request.maxKeyframes)
      .map((ref) => {
        const filename = ref.path.split("/").at(-1) ?? "";
        const match = /^keyframe-(\d+)-(\d+)\.jpg$/u.exec(filename);
        return {
          path: resolveMediaRepositoryPath(repoRoot, ref.path),
          timestampMs: match ? Number(match[2]) : null,
          sha256: ref.sha256,
          sizeBytes: ref.sizeBytes,
          mediaType: ref.mediaType,
        };
      });

    // 7. Deterministic cache identity.
    const cacheKey = buildMediaVerificationCacheKey({
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      clipBytesSha256: clipResult.sha256,
      mediaSha256: asset.sha256,
      indexSha256: indexRef.sha256,
      retrievalResultSha256: request.retrievalResultRef.sha256,
      claimIds: request.claimIds,
      narration: request.narration,
      visualIntent: request.visualIntent,
      providerId: input.provider.id,
      model: input.provider.model,
      verificationVersion: input.provider.verificationVersion,
      promptVersion: MEDIA_VERIFICATION_PROMPT_VERSION,
      schemaVersion: MEDIA_VERIFICATION_SCHEMA_VERSION,
      dependencyHashes,
    });
    const artifactId = `${episodeId}:media-verification:${request.clipId.replace(/[^a-z0-9-]/gu, "-")}`;
    const cacheMetadata = {
      schemaVersion: "media-verify-cache-metadata-v1",
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      cacheKey,
      artifactId,
    };
    const dependencies = dedupeDependencies([
      ...readDependencies([
        clipResult.ref,
        request.retrievalResultRef,
        indexRef,
        asset.artifactRef,
      ]),
      ...decisionDependencies(source),
    ]);

    const cache = input.cache ?? null;
    if (cache) {
      const looked = cache.lookup({
        kind: "media-verify" as CacheKind,
        cacheKey,
        stage: "media-verify",
        logicalItem: `${episodeId}:${request.segmentId}:${request.clipId}`,
        validateMetadata: (value) => {
          const parsed = z
            .object({
              schemaVersion: z.literal("media-verify-cache-metadata-v1"),
              episodeId: episodeIdSchema,
              segmentId: z.string().min(1),
              clipId: z.string().min(1),
              cacheKey: sha256Schema,
              artifactId: z.string().min(1),
            })
            .strict()
            .parse(value);
          if (
            parsed.episodeId !== episodeId ||
            parsed.segmentId !== request.segmentId ||
            parsed.clipId !== request.clipId ||
            parsed.cacheKey !== cacheKey ||
            parsed.artifactId !== artifactId
          ) {
            throw new Error("media verify cache metadata mismatch");
          }
          return parsed;
        },
      });
      if (looked.hit) {
        const parsed = mediaVerificationSchema.parse(
          JSON.parse(looked.bytes.toString("utf8")) as unknown,
        );
        if (
          parsed.episodeId !== episodeId ||
          parsed.segmentId !== request.segmentId ||
          parsed.clipId !== request.clipId ||
          parsed.cacheKey !== cacheKey
        ) {
          throw new Error("MEDIA_VERIFY_CACHE_KEY_MISMATCH");
        }
        emit("media.verification.cache.hit", {
          cacheKey,
          sha256: looked.entry.payload.sha256,
          sizeBytes: looked.entry.payload.sizeBytes,
          mediaType: "application/json",
          clipId: request.clipId,
          verdict: parsed.verdict,
          reason: "verification",
        });
        const ref = publishVerificationArtifact({
          repoRoot,
          episodeId,
          segmentId: request.segmentId,
          clipId: request.clipId,
          artifactId,
          bytes: looked.bytes,
          dependencies,
          executionId,
          producer: `${MEDIA_VERIFICATION_TOOL_VERSION}:${input.provider.id}:${input.provider.verificationVersion}`,
          now,
        });
        emit("media.verification.completed", {
          artifactRef: ref,
          sha256: ref.sha256,
          sizeBytes: ref.sizeBytes,
          mediaType: "application/json",
          cacheKey,
          clipId: request.clipId,
          verdict: parsed.verdict,
          reason: "cache-hit",
        });
        return {
          artifactRef: ref,
          clipArtifactRef: clipResult.ref,
          status: "ready",
          verdict: parsed.verdict,
          episodeId,
          segmentId: request.segmentId,
          clipId: request.clipId,
          cacheHit: true,
          reused: false,
          cacheKey,
          clipCacheHit: clipResult.cacheHit,
        };
      }
      emit("media.verification.cache.miss", {
        cacheKey,
        clipId: request.clipId,
        reason: `verification:${looked.reason}`,
      });
    }

    // 8. Provider call — Codex sees ONLY the short clip (+ keyframes).
    const claims = claimEntries
      .filter((entry) => request.claimIds.includes(entry.id))
      .map((entry) => ({id: entry.id, claim: entry.claim}));
    const providerInput: MediaVerificationProviderInput = {
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      claimIds: request.claimIds,
      claims,
      narration: request.narration,
      visualIntent: request.visualIntent,
      clip: {
        path: resolveMediaRepositoryPath(repoRoot, clipResult.ref.path),
        sha256: clipResult.sha256,
        sizeBytes: clipResult.ref.sizeBytes,
        mediaType: analysisSource.mediaType,
        startMs: candidate.startMs,
        endMs: candidate.endMs,
        sourceMediaId: asset.mediaId,
        sourceMediaSha256: asset.sha256,
      },
      keyframes,
      clipMetadata: {
        textSummary: item.textSummary,
        observedText: item.observedText,
        keywords: item.keywords,
        entities: item.entities,
        semanticTags: item.semanticTags,
        speaker: item.speaker,
      },
    };
    let rawOutput: unknown;
    try {
      rawOutput = await input.provider.verify(providerInput);
    } catch (error) {
      if (errorMessage(error).startsWith("MEDIA_VERIFY_CODEX_")) throw error;
      throw new Error(`MEDIA_VERIFY_PROVIDER_FAILED:${errorMessage(error)}`, {cause: error});
    }
    let output: MediaVerificationProviderOutput;
    try {
      output = mediaVerificationProviderOutputSchema.parse(rawOutput);
    } catch (error) {
      throw new Error("MEDIA_VERIFY_PROVIDER_OUTPUT_INVALID", {cause: error});
    }
    // The recommended range must lie inside the candidate range.
    if (
      output.recommendedStartMs < candidate.startMs ||
      output.recommendedEndMs > candidate.endMs ||
      output.recommendedEndMs <= output.recommendedStartMs
    ) {
      throw new Error(`MEDIA_VERIFY_RECOMMENDED_RANGE_OUT_OF_BOUNDS:${request.clipId}`);
    }

    // 9. Build the verification record. The embedded artifactRef is the
    //    content hash of the record body without the self-referential
    //    artifactRef field; the authoritative file binding is the external ref
    //    returned below and registered in the registry.
    const clipRef = mediaClipRefSchema.parse({
      clipId: request.clipId,
      episodeId,
      mediaId: asset.mediaId,
      sourceMediaRef: asset.artifactRef,
      startMs: candidate.startMs,
      endMs: candidate.endMs,
      claimIds: request.claimIds,
      visualIntent: request.visualIntent,
      transcriptRefs: item.transcriptRefs,
      createdAt: now(),
    });
    const verificationId = artifactId;
    const bodyWithoutArtifactRef = {
      schemaVersion: MEDIA_VERIFICATION_SCHEMA_VERSION,
      verificationId,
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      clipRef,
      mediaRef: asset.artifactRef,
      retrievalResultRef: request.retrievalResultRef,
      clipArtifactRef: clipResult.ref,
      claimIds: request.claimIds,
      cacheKey,
      verdict: output.verdict,
      relevance: roundScore(output.relevance),
      claimMatch: roundScore(output.claimMatch),
      visualQuality: roundScore(output.visualQuality),
      misleadingRisk: roundScore(output.misleadingRisk),
      observedActions: output.observedActions,
      observedEntities: output.observedEntities,
      observedText: output.observedText,
      recommendedStartMs: output.recommendedStartMs,
      recommendedEndMs: output.recommendedEndMs,
      reasons: output.reasons,
      provider: input.provider.id,
      model: input.provider.model,
      verificationVersion: input.provider.verificationVersion,
      promptVersion: MEDIA_VERIFICATION_PROMPT_VERSION,
      toolVersion: MEDIA_VERIFICATION_TOOL_VERSION,
      sourceSha256: asset.sha256,
      createdAt: now(),
    };
    const contentBytes = Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8");
    const embeddedArtifactRef = artifactRefSchema.parse({
      artifactId: verificationId,
      episodeId,
      path: mediaVerificationRepositoryPath(episodeId, request.segmentId, request.clipId),
      mediaType: "application/json",
      schemaVersion: MEDIA_VERIFICATION_SCHEMA_VERSION,
      revision: 1,
      sha256: sha256Bytes(contentBytes),
      sizeBytes: contentBytes.byteLength,
      producer: `${MEDIA_VERIFICATION_TOOL_VERSION}:${input.provider.id}:${input.provider.verificationVersion}`,
      createdAt: now(),
    });
    const body = mediaVerificationSchema.parse({
      ...bodyWithoutArtifactRef,
      artifactRef: embeddedArtifactRef,
    });
    const bytes = Buffer.from(serializeIndexArtifact(body), "utf8");
    const ref = publishVerificationArtifact({
      repoRoot,
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      artifactId,
      bytes,
      dependencies,
      executionId,
      producer: `${MEDIA_VERIFICATION_TOOL_VERSION}:${input.provider.id}:${input.provider.verificationVersion}`,
      now,
    });
    if (cache) {
      cache.put({
        kind: "media-verify" as CacheKind,
        cacheKey,
        stage: "media-verify",
        logicalItem: `${episodeId}:${request.segmentId}:${request.clipId}`,
        mediaType: "application/json",
        bytes,
        metadata: cacheMetadata,
      });
    }
    emit("media.verification.completed", {
      artifactRef: ref,
      sha256: ref.sha256,
      sizeBytes: ref.sizeBytes,
      mediaType: "application/json",
      cacheKey,
      clipId: request.clipId,
      verdict: body.verdict,
      reason: "produced",
    });
    return {
      artifactRef: ref,
      clipArtifactRef: clipResult.ref,
      status: "ready",
      verdict: body.verdict,
      episodeId,
      segmentId: request.segmentId,
      clipId: request.clipId,
      cacheHit: false,
      reused: false,
      cacheKey,
      clipCacheHit: clipResult.cacheHit,
    };
  } catch (error) {
    emit("media.verification.failed", {reason: errorMessage(error)});
    throw error;
  }
};

/* ------------------------------------------------------------------------- *
 * Readers (artifact bytes remain the source of truth)
 * ------------------------------------------------------------------------- */

export const readMediaVerification = (
  repoRoot: string,
  episodeId: string,
  segmentId: string,
  clipId: string,
): MediaVerification => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaVerificationRepositoryPath(episodeId, segmentId, clipId),
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_VERIFY_RESULT_MISSING:${clipId}`);
  }
  const parsed = mediaVerificationSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
  );
  if (
    parsed.episodeId !== episodeId ||
    parsed.segmentId !== segmentId ||
    parsed.clipId !== clipId
  ) {
    throw new Error(`MEDIA_VERIFY_ARTIFACT_MISMATCH:${clipId}`);
  }
  return parsed;
};

/* ------------------------------------------------------------------------- *
 * Deterministic authorization gate
 * ------------------------------------------------------------------------- */

export type AssertMediaClipVerifiedInput = {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  clipId: string;
  /** Hash-bound ArtifactRef of the `media-verification-v1` artifact. */
  verificationRef: ArtifactRef;
};

/**
 * The M5.06 deterministic authorization gate. A clip is usable only when ALL
 * of the following hold — any single failure fails closed:
 *
 * - `verification.verdict === "pass"`;
 * - current source admission + rights approval (decisions re-read);
 * - source media byte-hash-valid and registered;
 * - clip/index/retrieval refs valid (candidate still in the current retrieval
 *   artifact, clip still in the current ClipIndex with the exact window);
 * - verification ArtifactRef byte-hash-valid and registered;
 * - recommended range legal (inside the candidate range);
 * - episode identity matches everywhere.
 *
 * Codex cannot bypass this gate: it observes and scores, this function
 * authorizes. Returns the verification body on success, throws `MEDIA_VERIFY_*`
 * otherwise.
 */
export const assertMediaClipVerified = (input: AssertMediaClipVerifiedInput): MediaVerification => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId, segmentId, clipId} = input;
  const ref = artifactRefSchema.parse(input.verificationRef);
  if (ref.episodeId !== episodeId) {
    throw new Error(`MEDIA_VERIFY_EPISODE_MISMATCH:${ref.episodeId}:${episodeId}`);
  }
  if (!artifactRefIsIndexed(repoRoot, ref)) {
    throw new Error(`MEDIA_VERIFY_VERIFICATION_NOT_REGISTERED:${ref.artifactId}`);
  }
  let verification: MediaVerification;
  try {
    assertArtifactRefBytes(repoRoot, ref);
    verification = mediaVerificationSchema.parse(
      JSON.parse(
        fs.readFileSync(resolveMediaRepositoryPath(repoRoot, ref.path), "utf8"),
      ) as unknown,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("ARTIFACT_HASH_MISMATCH")) {
      throw new Error(`MEDIA_VERIFY_VERIFICATION_TAMPERED:${ref.artifactId}`, {cause: error});
    }
    throw new Error(`MEDIA_VERIFY_VERIFICATION_INVALID:${ref.artifactId}`, {cause: error});
  }
  if (
    verification.episodeId !== episodeId ||
    verification.segmentId !== segmentId ||
    verification.clipId !== clipId
  ) {
    throw new Error(`MEDIA_VERIFY_ARTIFACT_MISMATCH:${clipId}`);
  }
  if (
    verification.artifactRef.artifactId !== ref.artifactId ||
    verification.artifactRef.path !== ref.path
  ) {
    throw new Error(`MEDIA_VERIFY_ARTIFACT_MISMATCH:${clipId}`);
  }
  if (verification.verdict !== "pass") {
    throw new Error(`MEDIA_VERIFY_NOT_PASSED:${clipId}:${verification.verdict}`);
  }
  if (
    verification.recommendedStartMs < verification.clipRef.startMs ||
    verification.recommendedEndMs > verification.clipRef.endMs ||
    verification.recommendedEndMs <= verification.recommendedStartMs
  ) {
    throw new Error(`MEDIA_VERIFY_RECOMMENDED_RANGE_OUT_OF_BOUNDS:${clipId}`);
  }

  // Retrieval artifact must still be current and contain the candidate.
  const {candidate} = gateRetrievalResult({
    repoRoot,
    episodeId,
    segmentId: verification.segmentId,
    ref: verification.retrievalResultRef,
    clipId: verification.clipId,
  });
  if (
    candidate.startMs !== verification.clipRef.startMs ||
    candidate.endMs !== verification.clipRef.endMs ||
    candidate.mediaRef.sha256 !== verification.mediaRef.sha256
  ) {
    throw new Error(`MEDIA_VERIFY_ARTIFACT_MISMATCH:${clipId}`);
  }

  // Source media must still be admitted/rights-approved and byte-hash-valid.
  const manifest = readMediaSourceManifest(repoRoot, episodeId);
  const {asset} = gateVerificationMedia({
    repoRoot,
    episodeId,
    manifest,
    mediaId: verification.clipRef.mediaId,
  });
  if (asset.artifactRef.sha256 !== verification.mediaRef.sha256) {
    throw new Error(`MEDIA_VERIFY_ARTIFACT_MISMATCH:${clipId}`);
  }

  // The clip must still exist in the current ClipIndex with the exact window.
  gateVerificationClipIndex({
    repoRoot,
    episodeId,
    asset,
    candidate,
    clipId: verification.clipId,
  });

  // The short clip bytes Codex saw must still be hash-valid + registered.
  if (!artifactRefIsIndexed(repoRoot, verification.clipArtifactRef)) {
    throw new Error(`MEDIA_VERIFY_CLIP_NOT_REGISTERED:${verification.clipArtifactRef.artifactId}`);
  }
  try {
    assertArtifactRefBytes(repoRoot, verification.clipArtifactRef);
  } catch (error) {
    throw new Error(`MEDIA_VERIFY_CLIP_TAMPERED:${verification.clipArtifactRef.artifactId}`, {
      cause: error,
    });
  }
  return verification;
};

export const isMediaClipVerified = (input: AssertMediaClipVerifiedInput): boolean => {
  try {
    assertMediaClipVerified(input);
    return true;
  } catch {
    return false;
  }
};
