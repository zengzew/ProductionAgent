import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  copyBytesAtomically,
  FineGrainedCacheStore,
  normalizeNarration,
  sha256File,
  sha256Json,
  type CacheKind,
} from "../lib/platform/cache";
import {
  artifactRefIsIndexed,
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
import {mediaRetrievalCandidateRepositoryPath, resolveMediaRepositoryPath} from "./paths";
import {
  mediaAssetSchema,
  type MediaAsset,
  type MediaSource,
  type MediaSourceManifest,
  type MediaSourceType,
} from "./schemas";
import {
  readMediaClipIndex,
  readMediaUnderstandingStatus,
  serializeIndexArtifact,
} from "./understanding";

/**
 * WP-M5.05 claim-to-clip retrieval.
 *
 * Turns one segment query ({narration, claimIds, visualIntent}) into a
 * deterministic Top-K list of CandidateClips over the episode's hash-valid
 * `media-clip-index-v1` indexes. The Claim Ledger (`research/facts.json`) is
 * the primary query key; the result is persisted as a hash-bound
 * `media-retrieval-result-v1` artifact under
 * `content/<ep>/media/candidates/<segmentId>.json` and registered in the
 * episode artifact registry.
 *
 * Fail-closed: unknown claim ids, missing/tampered/malformed/cross-episode
 * indexes, tampered or unregistered media bytes, stale manifest records, and
 * tampered HumanDecisions abort the query before any cache consult. Sources
 * that are not currently admitted/rights-approved are excluded from the
 * corpus (their clips are never returned), and a cache hit still re-runs the
 * full rights/hash/episode gate.
 *
 * Retrieval is candidate generation only: a CandidateClip is NOT verified
 * (M5.06) and NOT approved for rendering (M5.07/M5.08). Nothing here calls a
 * VLM and nothing here authorizes Remotion.
 */

export const MEDIA_RETRIEVAL_SCHEMA_VERSION = "media-retrieval-result-v1" as const;
export const MEDIA_RETRIEVAL_REQUEST_SCHEMA_VERSION = "media-retrieval-request-v1" as const;
export const MEDIA_RETRIEVAL_TOOL_VERSION = "media-retrieval-v1" as const;
export const MEDIA_RETRIEVAL_CACHE_SCHEMA_VERSION = "media-retrieve-cache-v1" as const;
export const MEDIA_RETRIEVAL_CACHE_IMPLEMENTATION_VERSION = "media-retrieve-cache-impl-v1" as const;
export const MEDIA_RETRIEVAL_RANKING_VERSION = "media-retrieval-ranking-v1" as const;

/** Code/config files whose hashes bind the retrieval cache identity. */
export const MEDIA_RETRIEVAL_DEPENDENCY_PATHS = [
  "src/media/retrieve.ts",
  "src/media/clip-index.ts",
  "src/media/understanding.ts",
  "src/media/events.ts",
  "src/media/paths.ts",
  "src/media/schemas.ts",
  "src/schemas/episode.ts",
  "src/lib/platform/cache.ts",
  "src/orchestration/schemas/artifact.ts",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTimeSchema = z.string().datetime({offset: true});

const sortedHashes = (hashes: Record<string, string>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const key of Object.keys(hashes).sort()) {
    const value = hashes[key];
    if (!value || !/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`media retrieval cache dependency hash invalid: ${key}`);
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
 * Retrieval request
 * ------------------------------------------------------------------------- */

export const mediaRetrievalRequestSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_RETRIEVAL_REQUEST_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    /** Final-script segment identity (`seg-<id>`). */
    segmentId: z.string().regex(/^seg-[a-z0-9-]+$/u),
    /** Claim Ledger ids; empty means weaker evidence mode. */
    claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)).default([]),
    narration: z.string().min(1).max(5000),
    visualIntent: z.string().min(1).max(1000),
    /** Optional media-kind filter: "video" | "audio". */
    preferredMediaTypes: z
      .array(z.enum(["video", "audio"]))
      .max(2)
      .default([]),
    topK: z.number().int().min(1).max(50),
    /** Optional soft duration target used by the duration suitability term. */
    durationTargetMs: z.number().int().positive().nullable().optional(),
    /** Optional hard upper bound on clip duration (eligible clips only). */
    maxDurationMs: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maxDurationMs !== null && value.maxDurationMs !== undefined) {
      if (value.maxDurationMs <= 0) {
        context.addIssue({
          code: "custom",
          path: ["maxDurationMs"],
          message: "maxDurationMs must be positive",
        });
      }
    }
    if (value.durationTargetMs !== null && value.durationTargetMs !== undefined) {
      if (value.durationTargetMs <= 0) {
        context.addIssue({
          code: "custom",
          path: ["durationTargetMs"],
          message: "durationTargetMs must be positive",
        });
      }
    }
  });

export type MediaRetrievalRequest = z.infer<typeof mediaRetrievalRequestSchema>;

/** Canonical request used for cache identity and result persistence. */
export const normalizeRetrievalRequest = (input: MediaRetrievalRequest): MediaRetrievalRequest =>
  mediaRetrievalRequestSchema.parse({
    schemaVersion: MEDIA_RETRIEVAL_REQUEST_SCHEMA_VERSION,
    episodeId: input.episodeId,
    segmentId: input.segmentId,
    claimIds: [...new Set(input.claimIds)].sort(),
    narration: normalizeNarration(input.narration),
    visualIntent: normalizeNarration(input.visualIntent),
    preferredMediaTypes: [...new Set(input.preferredMediaTypes)].sort(),
    topK: input.topK,
    ...(input.durationTargetMs !== null && input.durationTargetMs !== undefined
      ? {durationTargetMs: input.durationTargetMs}
      : {}),
    ...(input.maxDurationMs !== null && input.maxDurationMs !== undefined
      ? {maxDurationMs: input.maxDurationMs}
      : {}),
  });

/* ------------------------------------------------------------------------- *
 * Ranking configuration (deterministic hybrid)
 * ------------------------------------------------------------------------- */

export const mediaRetrievalRankingConfigSchema = z
  .object({
    version: z.literal(MEDIA_RETRIEVAL_RANKING_VERSION),
    weights: z
      .object({
        claim: z.number().min(0).max(1),
        lexical: z.number().min(0).max(1),
        metadata: z.number().min(0).max(1),
        visualIntent: z.number().min(0).max(1),
        sourcePreference: z.number().min(0).max(1),
        duration: z.number().min(0).max(1),
      })
      .strict(),
    /** Multiplier applied to a claim-mode clip with zero claim evidence. */
    claimlessPenalty: z.number().min(0).max(1),
    /** Candidates below this total score are dropped (never padding Top-K). */
    minRelevanceScore: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((value, context) => {
    const total = Object.values(value.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 1e-9) {
      context.addIssue({
        code: "custom",
        path: ["weights"],
        message: "ranking weights must sum to 1",
      });
    }
  });

export type MediaRetrievalRankingConfig = z.infer<typeof mediaRetrievalRankingConfigSchema>;

export const DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG: MediaRetrievalRankingConfig = {
  version: MEDIA_RETRIEVAL_RANKING_VERSION,
  weights: {
    claim: 0.4,
    lexical: 0.2,
    metadata: 0.15,
    visualIntent: 0.1,
    sourcePreference: 0.1,
    duration: 0.05,
  },
  claimlessPenalty: 0.5,
  minRelevanceScore: 0.1,
};

/**
 * Deterministic source trust/preference tiers following the M5 real-media
 * preference order. Ties inside a tier are resolved by the total tie-breaker.
 */
export const SOURCE_PREFERENCE_TIERS: Record<MediaSourceType, number> = {
  official: 5,
  founder: 5,
  "product-demo": 4,
  media: 4,
  platform: 3,
  "local-approved": 3,
  analysis: 2,
  social: 1,
};

/* ------------------------------------------------------------------------- *
 * Claim Ledger
 * ------------------------------------------------------------------------- */

export const claimLedgerEntrySchema = z.object({
  id: z.string().regex(/^claim-[a-z0-9-]+$/u),
  claim: z.string().min(1),
  // Research facts carry many extra fields; retrieval only consumes id + claim.
});

export type ClaimLedgerEntry = z.infer<typeof claimLedgerEntrySchema>;

export const claimLedgerRepositoryPath = (episodeId: string): string =>
  `content/${episodeId}/research/facts.json`;

export type ClaimLedgerBinding = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

/** Reads the Claim Ledger binding (path/sha256/size) for an episode. */
export const readClaimLedger = (repoRoot: string, episodeId: string): ClaimLedgerBinding => {
  const filePath = resolveMediaRepositoryPath(repoRoot, claimLedgerRepositoryPath(episodeId));
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_RETRIEVE_CLAIM_LEDGER_MISSING:${episodeId}`);
  }
  const stat = fs.statSync(filePath);
  return {
    path: claimLedgerRepositoryPath(episodeId),
    sha256: sha256File(filePath),
    sizeBytes: stat.size,
  };
};

/** Parses the Claim Ledger entries; malformed or duplicate entries fail closed. */
export const readClaimEntries = (repoRoot: string, episodeId: string): ClaimLedgerEntry[] => {
  const filePath = resolveMediaRepositoryPath(repoRoot, claimLedgerRepositoryPath(episodeId));
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_RETRIEVE_CLAIM_LEDGER_MISSING:${episodeId}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`MEDIA_RETRIEVE_CLAIM_LEDGER_INVALID:${episodeId}`, {cause: error});
  }
  if (!Array.isArray(raw)) {
    throw new Error(`MEDIA_RETRIEVE_CLAIM_LEDGER_INVALID:${episodeId}`);
  }
  const entries = raw.map((value) => {
    try {
      return claimLedgerEntrySchema.parse(value);
    } catch (error) {
      throw new Error(`MEDIA_RETRIEVE_CLAIM_LEDGER_INVALID:${episodeId}`, {cause: error});
    }
  });
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`MEDIA_RETRIEVE_CLAIM_LEDGER_INVALID:${episodeId}:duplicate:${entry.id}`);
    }
    seen.add(entry.id);
  }
  return entries;
};

/** Every requested claim id must exist in the current Claim Ledger. */
export const assertClaimIdsInLedger = (input: {
  claimIds: readonly string[];
  entries: readonly ClaimLedgerEntry[];
}): void => {
  const known = new Set(input.entries.map((entry) => entry.id));
  for (const claimId of input.claimIds) {
    if (!known.has(claimId)) {
      throw new Error(`MEDIA_RETRIEVE_CLAIM_UNKNOWN:${claimId}`);
    }
  }
};

/* ------------------------------------------------------------------------- *
 * Deterministic lexical scoring primitives
 * ------------------------------------------------------------------------- */

/** Unique normalized terms (length >= 2); CJK runs stay whole phrases. */
export const queryTerms = (text: string): string[] => {
  const terms = text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  return [...new Set(terms)];
};

/** Fraction of query terms present (as substrings) in the target text. */
export const termOverlap = (terms: readonly string[], text: string): number => {
  if (terms.length === 0) return 0;
  const target = text.normalize("NFKC").toLowerCase();
  const matched = terms.filter((term) => target.includes(term)).length;
  return matched / terms.length;
};

const roundScore = (value: number): number => Math.round(value * 1e6) / 1e6;

const clipTextOf = (item: ClipIndexItem): string =>
  [item.observedText, item.textSummary].filter((value) => value.length > 0).join(" ");

/* ------------------------------------------------------------------------- *
 * Candidate scoring + ranking
 * ------------------------------------------------------------------------- */

export type RetrievalScoreBreakdown = {
  claim: number;
  lexical: number;
  metadata: number;
  visualIntent: number;
  sourcePreference: number;
  duration: number;
};

export type ScoredCandidate = {
  item: ClipIndexItem;
  asset: MediaAsset;
  source: MediaSource;
  indexRef: ArtifactRef;
  score: number;
  breakdown: RetrievalScoreBreakdown;
  matchedClaimIds: string[];
  reasons: string[];
};

const scoreCandidate = (input: {
  item: ClipIndexItem;
  asset: MediaAsset;
  source: MediaSource;
  indexRef: ArtifactRef;
  claimEntries: readonly ClaimLedgerEntry[];
  request: MediaRetrievalRequest;
  config: MediaRetrievalRankingConfig;
}): ScoredCandidate => {
  const {item, asset, source, indexRef, claimEntries, request, config} = input;
  const clipText = clipTextOf(item);
  const claimMode = request.claimIds.length > 0;
  const reasons: string[] = [];

  // Claim evidence fit: per-claim term overlap against the clip's own text.
  const claimById = new Map(claimEntries.map((entry) => [entry.id, entry]));
  let claimScore = 0;
  let matchedClaimIds: string[] = [];
  if (claimMode) {
    const fits: Array<{claimId: string; fit: number}> = [];
    for (const claimId of request.claimIds) {
      const entry = claimById.get(claimId);
      const fit = entry ? termOverlap(queryTerms(entry.claim), clipText) : 0;
      fits.push({claimId, fit});
    }
    matchedClaimIds = fits.filter(({fit}) => fit > 0).map(({claimId}) => claimId);
    const coverage = matchedClaimIds.length / request.claimIds.length;
    const maxFit = fits.reduce((max, {fit}) => Math.max(max, fit), 0);
    claimScore = roundScore(0.6 * coverage + 0.4 * maxFit);
    if (claimScore > 0) {
      for (const {claimId, fit} of fits) {
        if (fit > 0) reasons.push(`claim evidence ${claimId} fit ${roundScore(fit).toFixed(3)}`);
      }
    } else {
      reasons.push("no claim evidence");
    }
  }

  // Lexical: narration terms against the clip's observed text / summary.
  const lexicalScore = termOverlap(queryTerms(request.narration), clipText);
  if (lexicalScore > 0) reasons.push(`narration overlap ${roundScore(lexicalScore).toFixed(3)}`);

  // Metadata: query terms (claims + narration + visual intent) against
  // keywords/entities/semanticTags/speaker.
  const queryForMetadata = [
    ...request.claimIds
      .map((claimId) => claimById.get(claimId)?.claim ?? "")
      .filter((text) => text.length > 0),
    request.narration,
    request.visualIntent,
  ].join(" ");
  const metadataText = [
    ...item.keywords,
    ...item.entities,
    ...item.semanticTags,
    ...(item.speaker ? [item.speaker] : []),
  ].join(" ");
  const metadataScore = termOverlap(queryTerms(queryForMetadata), metadataText);
  if (metadataScore > 0) reasons.push(`metadata overlap ${roundScore(metadataScore).toFixed(3)}`);

  // Visual intent: visualIntent terms against summary + semantic tags + text.
  const visualIntentScore = termOverlap(
    queryTerms(request.visualIntent),
    [item.textSummary, ...item.semanticTags, item.observedText].join(" "),
  );
  if (visualIntentScore > 0) {
    reasons.push(`visual intent overlap ${roundScore(visualIntentScore).toFixed(3)}`);
  }

  // Source preference: deterministic trust tier for the current source.
  const tier = SOURCE_PREFERENCE_TIERS[source.sourceType] ?? 1;
  const sourcePreferenceScore = tier / 5;
  reasons.push(`source preference ${source.sourceType} (${tier}/5)`);

  // Duration suitability: proximity to the soft target, neutral without one.
  const durationMs = item.endMs - item.startMs;
  const durationScore =
    request.durationTargetMs === null || request.durationTargetMs === undefined
      ? 0.5
      : 1 -
        Math.min(
          1,
          Math.abs(durationMs - request.durationTargetMs) /
            Math.max(request.durationTargetMs, 1000),
        );
  reasons.push(`duration proximity ${roundScore(durationScore).toFixed(3)} (${durationMs}ms)`);

  const weights = config.weights;
  let total =
    weights.claim * claimScore +
    weights.lexical * lexicalScore +
    weights.metadata * metadataScore +
    weights.visualIntent * visualIntentScore +
    weights.sourcePreference * sourcePreferenceScore +
    weights.duration * durationScore;
  if (claimMode && claimScore === 0) {
    total *= config.claimlessPenalty;
    reasons.push(`claimless penalty ${config.claimlessPenalty} applied (claim-bound mode)`);
  }
  const score = roundScore(total);

  return {
    item,
    asset,
    source,
    indexRef,
    score,
    breakdown: {
      claim: roundScore(claimScore),
      lexical: roundScore(lexicalScore),
      metadata: roundScore(metadataScore),
      visualIntent: roundScore(visualIntentScore),
      sourcePreference: roundScore(sourcePreferenceScore),
      duration: roundScore(durationScore),
    },
    matchedClaimIds,
    reasons,
  };
};

/**
 * Deterministic total order:
 * score desc → source preference desc → mediaId asc → startMs asc → clipId asc.
 * The clipId is content-derived, so the order is always total and never random.
 */
export const compareScoredCandidates = (left: ScoredCandidate, right: ScoredCandidate): number => {
  if (right.score !== left.score) return right.score - left.score;
  const leftTier = SOURCE_PREFERENCE_TIERS[left.source.sourceType] ?? 1;
  const rightTier = SOURCE_PREFERENCE_TIERS[right.source.sourceType] ?? 1;
  if (rightTier !== leftTier) return rightTier - leftTier;
  if (left.asset.mediaId !== right.asset.mediaId) {
    return left.asset.mediaId < right.asset.mediaId ? -1 : 1;
  }
  if (left.item.startMs !== right.item.startMs) return left.item.startMs - right.item.startMs;
  return left.item.clipId < right.item.clipId ? -1 : left.item.clipId > right.item.clipId ? 1 : 0;
};

/* ------------------------------------------------------------------------- *
 * Corpus gate (fail-closed, runs before any cache consult)
 * ------------------------------------------------------------------------- */

const assertMediaAssetBytesOrThrow = (repoRoot: string, asset: MediaAsset): void => {
  const filePath = resolveMediaRepositoryPath(repoRoot, asset.artifactRef.path);
  let actual: Buffer;
  try {
    actual = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`MEDIA_RETRIEVE_ASSET_TAMPERED:${asset.mediaId}`, {cause: error});
  }
  if (
    actual.byteLength !== asset.artifactRef.sizeBytes ||
    sha256File(filePath) !== asset.artifactRef.sha256
  ) {
    throw new Error(`MEDIA_RETRIEVE_ASSET_TAMPERED:${asset.mediaId}`);
  }
};

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

type EligibleIndex = {
  asset: MediaAsset;
  source: MediaSource;
  indexRef: ArtifactRef;
  index: ClipIndex;
};

/**
 * The WP-M5.05 corpus gate. Every video/audio original of the current episode
 * must be provably current and its clip index must be hash-valid and
 * episode-scoped — otherwise the query fails closed. Sources that are not
 * currently admitted/rights-approved are excluded from the corpus (never
 * returned), and image assets are out of scope (no index exists for them).
 */
const gateEligibleCorpus = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
}): {eligible: EligibleIndex[]; indexRefs: ArtifactRef[]} => {
  const {repoRoot, episodeId, manifest} = input;
  const eligible: EligibleIndex[] = [];
  const indexRefs: ArtifactRef[] = [];
  for (const rawAsset of manifest.assets) {
    if (rawAsset.kind !== "original") continue;
    if (rawAsset.mediaType.startsWith("image/")) continue;
    const asset = mediaAssetSchema.parse(rawAsset);
    if (asset.episodeId !== episodeId) {
      throw new Error(`MEDIA_RETRIEVE_EPISODE_MISMATCH:${asset.mediaId}:${episodeId}`);
    }
    const recorded = manifest.assets.find((candidate) => candidate.mediaId === asset.mediaId);
    if (!recorded || JSON.stringify(recorded) !== JSON.stringify(asset)) {
      throw new Error(`MEDIA_RETRIEVE_ASSET_STALE:${asset.mediaId}`);
    }
    const source = getMediaSource(manifest, asset.mediaSourceId);
    if (!source) {
      throw new Error(`MEDIA_RETRIEVE_SOURCE_UNKNOWN:${asset.mediaSourceId}`);
    }
    // Current admission/rights are re-checked on every run (including cache
    // hits). A source that is not currently admitted/rights-approved is
    // excluded from the corpus — its clips are never returned.
    if (!isMediaSourceAdmitted(source)) continue;
    if (!isMediaSourceRightsApproved(source)) continue;
    if (asset.rightsStatus !== "approved") continue;
    if (source.admissionDecisionRef) {
      readHumanDecision(repoRoot, source.admissionDecisionRef, episodeId);
    }
    if (source.rightsDecisionRef) {
      readHumanDecision(repoRoot, source.rightsDecisionRef, episodeId);
    }
    if (!artifactRefIsIndexed(repoRoot, asset.artifactRef)) {
      throw new Error(`MEDIA_RETRIEVE_ASSET_NOT_REGISTERED:${asset.mediaId}`);
    }
    assertMediaAssetBytesOrThrow(repoRoot, asset);

    const status = readMediaUnderstandingStatus(repoRoot, episodeId, asset.mediaId);
    const indexRef = status?.stages["clip-index"]?.ref ?? null;
    if (!indexRef) {
      throw new Error(`MEDIA_RETRIEVE_INDEX_MISSING:${asset.mediaId}`);
    }
    if (!artifactFileValid(repoRoot, indexRef)) {
      if (!artifactRefIsIndexed(repoRoot, indexRef)) {
        throw new Error(`MEDIA_RETRIEVE_INDEX_NOT_REGISTERED:${indexRef.artifactId}`);
      }
      throw new Error(`MEDIA_RETRIEVE_INDEX_TAMPERED:${indexRef.artifactId}`);
    }
    let index: ClipIndex;
    try {
      index = readMediaClipIndex(repoRoot, episodeId, asset.mediaId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("MEDIA_INDEX_ARTIFACT_MISMATCH")) {
        throw new Error(`MEDIA_RETRIEVE_INDEX_MISMATCH:${asset.mediaId}`, {cause: error});
      }
      throw new Error(`MEDIA_RETRIEVE_INDEX_INVALID:${asset.mediaId}`, {cause: error});
    }
    if (
      index.episodeId !== episodeId ||
      index.mediaId !== asset.mediaId ||
      index.mediaRef.sha256 !== asset.sha256 ||
      index.sourceSha256 !== asset.sha256
    ) {
      throw new Error(`MEDIA_RETRIEVE_INDEX_MISMATCH:${asset.mediaId}`);
    }
    if (asset.durationMs !== null) {
      for (const item of index.items) {
        if (item.endMs > asset.durationMs || item.startMs >= item.endMs) {
          throw new Error(`MEDIA_RETRIEVE_WINDOW_OUT_OF_BOUNDS:${item.clipId}`);
        }
      }
    }
    eligible.push({asset, source, indexRef, index});
    indexRefs.push(indexRef);
  }
  return {eligible, indexRefs};
};

/* ------------------------------------------------------------------------- *
 * Cache identity
 * ------------------------------------------------------------------------- */

export type MediaRetrievalCacheKeyInput = {
  episodeId: string;
  request: MediaRetrievalRequest;
  claimLedger: ClaimLedgerBinding;
  clipIndexHashes: Record<string, string>;
  mediaEligibilityHash: string;
  rankingConfig: MediaRetrievalRankingConfig;
  dependencyHashes: Record<string, string>;
};

const mediaEligibilityStateHash = (input: {
  episodeId: string;
  manifest: MediaSourceManifest;
}): string =>
  sha256Json(
    input.manifest.assets
      .filter((asset) => asset.kind === "original" && !asset.mediaType.startsWith("image/"))
      .map((asset) => {
        const source = getMediaSource(input.manifest, asset.mediaSourceId);
        return {
          mediaId: asset.mediaId,
          sha256: asset.sha256,
          assetRightsStatus: asset.rightsStatus,
          sourceAdmissionStatus: source?.admissionStatus ?? null,
          sourceRightsStatus: source?.rightsStatus ?? null,
          admissionDecisionSha256: source?.admissionDecisionRef?.sha256 ?? null,
          rightsDecisionSha256: source?.rightsDecisionRef?.sha256 ?? null,
        };
      })
      .sort((left, right) => left.mediaId.localeCompare(right.mediaId)),
  );

/**
 * Retrieval identity: episode + normalized request + Claim Ledger hash + every
 * eligible ClipIndex hash + current admission/rights eligibility state +
 * ranking config + tool version + dependency hashes. Any of these changing
 * produces a different key, so a stale entry can never be reused.
 */
export const buildMediaRetrievalCacheKey = (input: MediaRetrievalCacheKeyInput): string =>
  sha256Json({
    cacheSchemaVersion: MEDIA_RETRIEVAL_CACHE_SCHEMA_VERSION,
    implementationVersion: MEDIA_RETRIEVAL_CACHE_IMPLEMENTATION_VERSION,
    episodeId: input.episodeId,
    request: normalizeRetrievalRequest(input.request),
    claimLedger: {
      path: input.claimLedger.path,
      sha256: input.claimLedger.sha256,
      sizeBytes: input.claimLedger.sizeBytes,
    },
    clipIndexHashes: Object.fromEntries(
      Object.entries(input.clipIndexHashes).sort(([left], [right]) => left.localeCompare(right)),
    ),
    mediaEligibilityHash: input.mediaEligibilityHash,
    rankingConfig: input.rankingConfig,
    toolVersion: MEDIA_RETRIEVAL_TOOL_VERSION,
    dependencyHashes: sortedHashes(input.dependencyHashes),
  });

/* ------------------------------------------------------------------------- *
 * Result schema
 * ------------------------------------------------------------------------- */

export const mediaRetrievalEvidenceModeSchema = z.enum(["claim-bound", "weaker-textual"]);
export type MediaRetrievalEvidenceMode = z.infer<typeof mediaRetrievalEvidenceModeSchema>;

export const mediaRetrievalGateSchema = z
  .object({
    sourceAdmitted: z.boolean(),
    rightsApproved: z.boolean(),
    hashValid: z.boolean(),
    episodeIsolated: z.boolean(),
    claimLedgerValid: z.boolean(),
  })
  .strict();

export const mediaRetrievalScoreBreakdownSchema = z
  .object({
    claim: z.number().min(0).max(1),
    lexical: z.number().min(0).max(1),
    metadata: z.number().min(0).max(1),
    visualIntent: z.number().min(0).max(1),
    sourcePreference: z.number().min(0).max(1),
    duration: z.number().min(0).max(1),
  })
  .strict();

export const mediaRetrievalCandidateSchema = z
  .object({
    rank: z.number().int().positive(),
    clipId: z.string().min(1),
    episodeId: episodeIdSchema,
    mediaId: z.string().min(1),
    mediaSourceId: z.string().min(1),
    mediaRef: artifactRefSchema,
    indexRef: artifactRefSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    score: z.number().min(0).max(1),
    matchedClaimIds: z.array(z.string().min(1)).default([]),
    scoreBreakdown: mediaRetrievalScoreBreakdownSchema,
    reasons: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "endMs must be greater than startMs",
      });
    }
    if (
      value.mediaRef.episodeId !== value.episodeId ||
      value.indexRef.episodeId !== value.episodeId
    ) {
      context.addIssue({
        code: "custom",
        path: ["episodeId"],
        message: "candidate refs must belong to the query episode",
      });
    }
  });

export type MediaRetrievalCandidate = z.infer<typeof mediaRetrievalCandidateSchema>;

export const mediaRetrievalResultSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_RETRIEVAL_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    segmentId: z.string().regex(/^seg-[a-z0-9-]+$/u),
    /** Normalized retrieval request (canonical claimIds / text). */
    request: mediaRetrievalRequestSchema,
    evidenceMode: mediaRetrievalEvidenceModeSchema,
    candidates: z.array(mediaRetrievalCandidateSchema),
    rankingConfig: mediaRetrievalRankingConfigSchema,
    /** Hash-bound refs of every eligible ClipIndex consumed. */
    clipIndexRefs: z.array(artifactRefSchema),
    /** Hash binding of the Claim Ledger consumed by this query. */
    claimLedger: z
      .object({
        path: z.string().min(1),
        sha256: sha256Schema,
        sizeBytes: z.number().int().nonnegative(),
      })
      .strict(),
    gate: mediaRetrievalGateSchema,
    cacheKey: sha256Schema,
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.request.episodeId !== value.episodeId ||
      value.request.segmentId !== value.segmentId
    ) {
      context.addIssue({
        code: "custom",
        path: ["request"],
        message: "request must match the result episode and segment",
      });
    }
    if (value.evidenceMode === "claim-bound" && value.request.claimIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidenceMode"],
        message: "claim-bound mode requires claimIds",
      });
    }
  });

export type MediaRetrievalResult = z.infer<typeof mediaRetrievalResultSchema>;

/* ------------------------------------------------------------------------- *
 * Persistence + registry
 * ------------------------------------------------------------------------- */

const registerRetrievalCandidate = (input: {
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

const publishRetrievalArtifact = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  repositoryPath: string;
  artifactId: string;
  bytes: Uint8Array;
  dependencies: readonly ArtifactDependency[];
  executionId: string;
  producer: string;
  now: () => string;
}): ArtifactRef => {
  const filePath = resolveMediaRepositoryPath(input.repoRoot, input.repositoryPath);
  copyBytesAtomically(filePath, Buffer.from(input.bytes));
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.repositoryPath,
    mediaType: "application/json",
    schemaVersion: MEDIA_RETRIEVAL_SCHEMA_VERSION,
    producer: input.producer,
    createdAt: input.now(),
  });
  registerRetrievalCandidate({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    ref,
    executionId: input.executionId,
    dependencies: input.dependencies,
  });
  return ref;
};

/* ------------------------------------------------------------------------- *
 * Main entry point
 * ------------------------------------------------------------------------- */

export type RetrieveMediaCandidatesInput = {
  repoRoot: string;
  episodeId: string;
  request: MediaRetrievalRequest;
  cache?: FineGrainedCacheStore | null;
  rankingConfig?: MediaRetrievalRankingConfig;
  eventSink?: MediaEventSink;
  cacheDependencyHashes?: Record<string, string>;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export type MediaRetrievalOutcome = {
  /** Hash-bound ArtifactRef of the persisted `media-retrieval-result-v1` artifact. */
  artifactRef: ArtifactRef;
  /** Reference-only status for LangGraph state (never the result body). */
  status: "ready";
  episodeId: string;
  segmentId: string;
  cacheHit: boolean;
  reused: boolean;
  cacheKey: string;
  candidateCount: number;
  evidenceMode: MediaRetrievalEvidenceMode;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
};

const RETRIEVAL_SCOPE_MEDIA_ID = (episodeId: string): string => `${episodeId}:media:retrieval`;
const RETRIEVAL_SCOPE_SOURCE_ID = (episodeId: string): string =>
  `${episodeId}:media-source:retrieval`;

export const retrieveMediaCandidates = async (
  input: RetrieveMediaCandidatesInput,
): Promise<MediaRetrievalOutcome> => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});
  const rankingConfig = mediaRetrievalRankingConfigSchema.parse(
    input.rankingConfig ?? DEFAULT_MEDIA_RETRIEVAL_RANKING_CONFIG,
  );

  const request = normalizeRetrievalRequest(mediaRetrievalRequestSchema.parse(input.request));
  if (request.episodeId !== episodeId) {
    throw new Error(`MEDIA_RETRIEVE_EPISODE_MISMATCH:${request.episodeId}:${episodeId}`);
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
        mediaId: RETRIEVAL_SCOPE_MEDIA_ID(episodeId),
        mediaSourceId: RETRIEVAL_SCOPE_SOURCE_ID(episodeId),
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        segmentId: request.segmentId,
        ...(request.claimIds.length > 0 ? {claimIds: request.claimIds} : {}),
        ...extra,
      }),
    );
  };

  emit("media.retrieval.started", {});
  try {
    // 1. Claim Ledger is the primary query key: parse + validate claim ids.
    const claimLedgerBinding = readClaimLedger(repoRoot, episodeId);
    const claimEntries = readClaimEntries(repoRoot, episodeId);
    assertClaimIdsInLedger({claimIds: request.claimIds, entries: claimEntries});

    // 2. Corpus gate: current admission/rights + media/index integrity. Runs
    //    before any cache consult; a failed gate never reaches the cache.
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    const {eligible, indexRefs} = gateEligibleCorpus({repoRoot, episodeId, manifest});
    const mediaEligibilityHash = mediaEligibilityStateHash({episodeId, manifest});

    // 3. Deterministic cache identity.
    const clipIndexHashes = Object.fromEntries(
      eligible.map(({asset, indexRef}) => [asset.mediaId, indexRef.sha256]),
    );
    const dependencyHashes =
      input.cacheDependencyHashes ??
      hashExistingRepositoryFiles(repoRoot, MEDIA_RETRIEVAL_DEPENDENCY_PATHS);
    const cacheKey = buildMediaRetrievalCacheKey({
      episodeId,
      request,
      claimLedger: claimLedgerBinding,
      clipIndexHashes,
      mediaEligibilityHash,
      rankingConfig,
      dependencyHashes,
    });

    const cache = input.cache ?? null;
    const artifactId = `${episodeId}:media-retrieval:${request.segmentId}`;
    const repositoryPath = mediaRetrievalCandidateRepositoryPath(episodeId, request.segmentId);
    const executionId = `media-retrieval:${request.segmentId}`;
    const dependencies = eligible.flatMap(({asset, source, indexRef}) => [
      ...readDependencies([asset.artifactRef, indexRef]),
      ...decisionDependencies(source),
    ]);

    const cacheMetadata = {
      schemaVersion: "media-retrieve-cache-metadata-v1",
      episodeId,
      segmentId: request.segmentId,
      cacheKey,
      artifactId,
    };

    const buildResult = (): Buffer => {
      const evidenceMode: MediaRetrievalEvidenceMode =
        request.claimIds.length > 0 ? "claim-bound" : "weaker-textual";

      const scored: ScoredCandidate[] = [];
      for (const {asset, source, indexRef, index} of eligible) {
        for (const item of index.items) {
          if (request.preferredMediaTypes.length > 0) {
            const kind = asset.mediaType.startsWith("video/") ? "video" : "audio";
            if (!request.preferredMediaTypes.includes(kind)) continue;
          }
          const durationMs = item.endMs - item.startMs;
          if (request.maxDurationMs !== null && request.maxDurationMs !== undefined) {
            if (durationMs > request.maxDurationMs) continue;
          }
          scored.push(
            scoreCandidate({
              item,
              asset,
              source,
              indexRef,
              claimEntries,
              request,
              config: rankingConfig,
            }),
          );
        }
      }
      scored.sort(compareScoredCandidates);

      const candidates: MediaRetrievalCandidate[] = [];
      for (const candidate of scored) {
        if (candidate.score < rankingConfig.minRelevanceScore) {
          break; // sorted, so every remaining candidate is below the floor too
        }
        candidates.push(
          mediaRetrievalCandidateSchema.parse({
            rank: candidates.length + 1,
            clipId: candidate.item.clipId,
            episodeId,
            mediaId: candidate.asset.mediaId,
            mediaSourceId: candidate.asset.mediaSourceId,
            mediaRef: candidate.asset.artifactRef,
            indexRef: candidate.indexRef,
            startMs: candidate.item.startMs,
            endMs: candidate.item.endMs,
            score: candidate.score,
            matchedClaimIds: candidate.matchedClaimIds,
            scoreBreakdown: candidate.breakdown,
            reasons: candidate.reasons,
          }),
        );
        if (candidates.length >= request.topK) break;
      }

      const result = mediaRetrievalResultSchema.parse({
        schemaVersion: MEDIA_RETRIEVAL_SCHEMA_VERSION,
        episodeId,
        segmentId: request.segmentId,
        request,
        evidenceMode,
        candidates,
        rankingConfig,
        clipIndexRefs: [...indexRefs].sort((left, right) =>
          left.artifactId.localeCompare(right.artifactId),
        ),
        claimLedger: claimLedgerBinding,
        gate: {
          sourceAdmitted: true,
          rightsApproved: true,
          hashValid: true,
          episodeIsolated: true,
          claimLedgerValid: true,
        },
        cacheKey,
        createdAt: now(),
      });
      return Buffer.from(serializeIndexArtifact(result), "utf8");
    };

    const rankSummary = (result: MediaRetrievalResult): string =>
      result.candidates
        .slice(0, 20)
        .map((candidate) => `${candidate.rank}:${candidate.clipId}:${candidate.score.toFixed(3)}`)
        .join(",")
        .slice(0, 1000);

    if (cache) {
      const looked = cache.lookup({
        kind: "media-retrieve" as CacheKind,
        cacheKey,
        stage: "media-retrieve",
        logicalItem: `${episodeId}:${request.segmentId}`,
        validateMetadata: (value) => {
          const parsed = z
            .object({
              schemaVersion: z.literal("media-retrieve-cache-metadata-v1"),
              episodeId: episodeIdSchema,
              segmentId: z.string().min(1),
              cacheKey: sha256Schema,
              artifactId: z.string().min(1),
            })
            .strict()
            .parse(value);
          if (
            parsed.episodeId !== episodeId ||
            parsed.segmentId !== request.segmentId ||
            parsed.cacheKey !== cacheKey ||
            parsed.artifactId !== artifactId
          ) {
            throw new Error("media retrieve cache metadata mismatch");
          }
          return parsed;
        },
      });
      if (looked.hit) {
        const parsed = mediaRetrievalResultSchema.parse(
          JSON.parse(looked.bytes.toString("utf8")) as unknown,
        );
        if (
          parsed.episodeId !== episodeId ||
          parsed.segmentId !== request.segmentId ||
          parsed.cacheKey !== cacheKey
        ) {
          throw new Error("MEDIA_RETRIEVE_CACHE_KEY_MISMATCH");
        }
        emit("media.retrieval.cache.hit", {
          cacheKey,
          sha256: looked.entry.payload.sha256,
          sizeBytes: looked.entry.payload.sizeBytes,
          mediaType: "application/json",
        });
        const ref = publishRetrievalArtifact({
          repoRoot,
          episodeId,
          segmentId: request.segmentId,
          repositoryPath,
          artifactId,
          bytes: looked.bytes,
          dependencies,
          executionId,
          producer: `${MEDIA_RETRIEVAL_TOOL_VERSION}:${rankingConfig.version}`,
          now,
        });
        emit("media.retrieval.completed", {
          artifactRef: ref,
          sha256: ref.sha256,
          sizeBytes: ref.sizeBytes,
          mediaType: "application/json",
          cacheKey,
          candidateCount: parsed.candidates.length,
          rankSummary: rankSummary(parsed),
          reason: "cache-hit",
        });
        return {
          artifactRef: ref,
          status: "ready",
          episodeId,
          segmentId: request.segmentId,
          cacheHit: true,
          reused: false,
          cacheKey,
          candidateCount: parsed.candidates.length,
          evidenceMode: parsed.evidenceMode,
        };
      }
      emit("media.retrieval.cache.miss", {
        cacheKey,
        reason: `media-retrieve:${looked.reason}`,
      });
    }

    // 4. Produce (deterministic), persist as a hash-bound artifact, cache it.
    const bytes = buildResult();
    const ref = publishRetrievalArtifact({
      repoRoot,
      episodeId,
      segmentId: request.segmentId,
      repositoryPath,
      artifactId,
      bytes,
      dependencies,
      executionId,
      producer: `${MEDIA_RETRIEVAL_TOOL_VERSION}:${rankingConfig.version}`,
      now,
    });
    if (cache) {
      cache.put({
        kind: "media-retrieve" as CacheKind,
        cacheKey,
        stage: "media-retrieve",
        logicalItem: `${episodeId}:${request.segmentId}`,
        mediaType: "application/json",
        bytes,
        metadata: cacheMetadata,
      });
    }
    const parsedResult = mediaRetrievalResultSchema.parse(
      JSON.parse(bytes.toString("utf8")) as unknown,
    );
    emit("media.retrieval.completed", {
      artifactRef: ref,
      sha256: ref.sha256,
      sizeBytes: ref.sizeBytes,
      mediaType: "application/json",
      cacheKey,
      candidateCount: parsedResult.candidates.length,
      rankSummary: rankSummary(parsedResult),
      reason: "produced",
    });
    return {
      artifactRef: ref,
      status: "ready",
      episodeId,
      segmentId: request.segmentId,
      cacheHit: false,
      reused: false,
      cacheKey,
      candidateCount: parsedResult.candidates.length,
      evidenceMode: parsedResult.evidenceMode,
    };
  } catch (error) {
    emit("media.retrieval.failed", {reason: errorMessage(error)});
    throw error;
  }
};

/* ------------------------------------------------------------------------- *
 * Readers (artifact bytes remain the source of truth)
 * ------------------------------------------------------------------------- */

export const readMediaRetrievalResult = (
  repoRoot: string,
  episodeId: string,
  segmentId: string,
): MediaRetrievalResult => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaRetrievalCandidateRepositoryPath(episodeId, segmentId),
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_RETRIEVAL_RESULT_MISSING:${segmentId}`);
  }
  const parsed = mediaRetrievalResultSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
  );
  if (parsed.episodeId !== episodeId || parsed.segmentId !== segmentId) {
    throw new Error(`MEDIA_RETRIEVAL_ARTIFACT_MISMATCH:${segmentId}`);
  }
  return parsed;
};
