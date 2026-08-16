import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  copyBytesAtomically,
  normalizeNarration,
  sha256Bytes,
  sha256File,
} from "../lib/fine-grained-cache";
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
  mediaVerificationRepositoryPath,
  mediaVisualSlotRepositoryPath,
  resolveMediaRepositoryPath,
} from "./paths";
import {
  MEDIA_VERIFICATION_SCHEMA_VERSION,
  mediaAssetSchema,
  mediaClipRefSchema,
  mediaVerificationSchema,
  type MediaAsset,
  type MediaClipRef,
  type MediaSource,
  type MediaSourceManifest,
  type MediaVerification,
} from "./schemas";
import {serializeIndexArtifact} from "./understanding";
import {
  claimLedgerRepositoryPath,
  MEDIA_RETRIEVAL_SCHEMA_VERSION,
  mediaRetrievalResultSchema,
  SOURCE_PREFERENCE_TIERS,
  type MediaRetrievalCandidate,
  type MediaRetrievalResult,
} from "./retrieve";

/**
 * WP-M5.07 Visual Director real-media-first selection.
 *
 * Turns ONE final-script segment's visual need ({claimIds, narration,
 * visualIntent, target duration}) into a formal, hash-bound `visual-slot-v1`
 * artifact by deterministically selecting the best REAL media candidate out
 * of a WP-M5.05 retrieval result, restricted to candidates with a WP-M5.06
 * `pass` verification whose source is still admitted and rights-approved.
 *
 * Real-media-first, never real-media-at-all-costs: when no candidate can be
 * used, the slot records a structured fallback reason and a deterministic
 * fallback stage (official screenshot → data/evidence card → programmatic
 * visual). Evidence fit dominates: a high retrieval score is NOT enough — a
 * clip whose VLM verification is reject/uncertain, whose rights were revoked,
 * whose bytes were tampered with, or that belongs to another episode can
 * never be selected (fail-closed). Retrieval ≠ verification ≠ selection:
 * this module only authorizes the SLOT, it does not grant rights and does not
 * authorize Remotion (M5.08).
 *
 * The slot is persisted under `content/<ep>/media/selections/<segmentId>.json`,
 * registered in the episode artifact registry with full lineage (retrieval
 * result + verification refs + media assets + admission/rights decisions), and
 * only ever referenced (never copied) by LangGraph state.
 */

export const MEDIA_VISUAL_SLOT_SCHEMA_VERSION = "visual-slot-v1" as const;
export const MEDIA_VISUAL_SELECTION_VERSION = "visual-selection-v1" as const;
export const MEDIA_VISUAL_SELECTION_TOOL_VERSION = "media-selection-v1" as const;
export const MEDIA_VISUAL_SELECTION_CONFIG_VERSION = "visual-selection-config-v1" as const;

const isoDateTimeSchema = z.string().datetime({offset: true});
const claimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/u);
const segmentIdSchema = z.string().regex(/^seg-[a-z0-9-]+$/u);

/* ------------------------------------------------------------------------- *
 * Selected type + fallback reasons
 * ------------------------------------------------------------------------- */

export const visualSlotSelectedTypeSchema = z.enum([
  "real-media",
  "official-screenshot",
  "data-evidence-card",
  "programmatic-visual",
]);
export type VisualSlotSelectedType = z.infer<typeof visualSlotSelectedTypeSchema>;

export const REAL_MEDIA_FALLBACK_TYPES = [
  "REAL_MEDIA_NOT_FOUND",
  "REAL_MEDIA_NOT_VERIFIED",
  "REAL_MEDIA_RIGHTS_BLOCKED",
  "REAL_MEDIA_LOW_EVIDENCE_FIT",
  "REAL_MEDIA_LOW_VISUAL_QUALITY",
  "REAL_MEDIA_MISLEADING_RISK",
] as const;

export const visualSlotFallbackTypeSchema = z.enum(REAL_MEDIA_FALLBACK_TYPES);
export type VisualSlotFallbackType = z.infer<typeof visualSlotFallbackTypeSchema>;

/**
 * Fixed fallback stage order when no real media is usable:
 * official screenshot → data/evidence card → programmatic visual.
 */
export const VISUAL_FALLBACK_STAGE_ORDER: readonly VisualSlotSelectedType[] = [
  "official-screenshot",
  "data-evidence-card",
  "programmatic-visual",
];

/* ------------------------------------------------------------------------- *
 * Deterministic selection configuration
 * ------------------------------------------------------------------------- */

export const visualSelectionConfigSchema = z
  .object({
    version: z.literal(MEDIA_VISUAL_SELECTION_CONFIG_VERSION),
    weights: z
      .object({
        /** Claim evidence fit (retrieval `scoreBreakdown.claim`). */
        claimFit: z.number().min(0).max(1),
        /** Visual-intent fit (retrieval `scoreBreakdown.visualIntent`). */
        visualIntentFit: z.number().min(0).max(1),
        /** Deterministic WP-M5.05 retrieval score of the candidate. */
        retrievalScore: z.number().min(0).max(1),
        /** WP-M5.06 VLM claimMatch score. */
        verificationClaimMatch: z.number().min(0).max(1),
        /** WP-M5.06 VLM relevance score. */
        verificationRelevance: z.number().min(0).max(1),
        /** WP-M5.06 VLM visualQuality score. */
        visualQuality: z.number().min(0).max(1),
        /** Misleading-risk safety = 1 - misleadingRisk. */
        misleadingRiskSafety: z.number().min(0).max(1),
        /** Deterministic source trust tier (official/founder highest). */
        sourceTrust: z.number().min(0).max(1),
        /** Proximity of the recommended clip window to the segment target. */
        durationSuitability: z.number().min(0).max(1),
      })
      .strict(),
    gates: z
      .object({
        /** Below this visualQuality a pass-verified clip is unusable. */
        minVisualQuality: z.number().min(0).max(1),
        /** Above this misleadingRisk a pass-verified clip is unusable. */
        maxMisleadingRisk: z.number().min(0).max(1),
        /** Claim-bound segments require at least one matched claim. */
        requireClaimEvidence: z.boolean(),
      })
      .strict(),
    /**
     * Fixed total-order tie-breaker. Selection is deterministic: identical
     * inputs always produce the identical winner, never a random one.
     */
    tieBreaker: z.literal(
      "score-desc:sourceTrust-desc:rank-asc:mediaId-asc:startMs-asc:clipId-asc",
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const total = Object.values(value.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 1e-9) {
      context.addIssue({
        code: "custom",
        path: ["weights"],
        message: "selection weights must sum to 1",
      });
    }
  });

export type VisualSelectionConfig = z.infer<typeof visualSelectionConfigSchema>;

export const DEFAULT_VISUAL_SELECTION_CONFIG: VisualSelectionConfig = {
  version: MEDIA_VISUAL_SELECTION_CONFIG_VERSION,
  weights: {
    claimFit: 0.2,
    visualIntentFit: 0.1,
    retrievalScore: 0.15,
    verificationClaimMatch: 0.15,
    verificationRelevance: 0.1,
    visualQuality: 0.1,
    misleadingRiskSafety: 0.1,
    sourceTrust: 0.05,
    durationSuitability: 0.05,
  },
  gates: {
    minVisualQuality: 0.5,
    maxMisleadingRisk: 0.5,
    requireClaimEvidence: true,
  },
  tieBreaker: "score-desc:sourceTrust-desc:rank-asc:mediaId-asc:startMs-asc:clipId-asc",
};

/* ------------------------------------------------------------------------- *
 * Formal visual slot (`visual-slot-v1`)
 * ------------------------------------------------------------------------- */

export const visualSlotGateSchema = z
  .object({
    sourceAdmitted: z.boolean(),
    rightsApproved: z.boolean(),
    hashValid: z.boolean(),
    verificationPassed: z.boolean(),
    episodeIsolated: z.boolean(),
  })
  .strict();

export const visualSlotSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_VISUAL_SLOT_SCHEMA_VERSION),
    /** Episode-scoped identity: `<episode>:media-visual-slot:<segmentId>`. */
    slotId: z.string().min(1),
    episodeId: episodeIdSchema,
    /** Final-script segment this slot serves. */
    segmentId: segmentIdSchema,
    /** Claim Ledger ids the segment is bound to (sorted, unique). */
    claimIds: z.array(claimIdSchema).min(1),
    /** Normalized visual need of the segment (the only thing the Visual
     *  Director proposes — never an arbitrary clip id). */
    visualIntent: z.string().min(1),
    selectedType: visualSlotSelectedTypeSchema,
    /** Chosen real clip when selectedType is real-media; null otherwise. */
    selectedMediaClipRef: mediaClipRefSchema.nullable(),
    /** Hash-bound `media-verification-v1` ref backing the chosen clip. */
    verificationRef: artifactRefSchema.nullable(),
    /** Structured fallback reason; null when real media was selected. */
    fallbackType: visualSlotFallbackTypeSchema.nullable(),
    /** Human-readable fallback explanation; null when real media was selected. */
    fallbackReason: z.string().max(2000).nullable(),
    /** Deterministic selection score of the chosen clip; 0 on fallback. */
    selectionScore: z.number().min(0).max(1),
    /** Non-empty deterministic audit trail. */
    reasons: z.array(z.string().min(1)).min(1),
    /** Selection algorithm version that produced this slot. */
    selectionVersion: z.literal(MEDIA_VISUAL_SELECTION_VERSION),
    /** Deterministic hard gates observed during selection. Quality/evidence/
     *  risk failures are not hard-gate failures: they surface in fallbackType
     *  while the hard gates may still all pass. */
    gate: visualSlotGateSchema,
    /** Selection configuration used (weights + gates + tie-breaker). */
    config: visualSelectionConfigSchema,
    /** Embedded ref (content hash of the body without this field). */
    artifactRef: artifactRefSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const slug = value.slotId.slice(`${value.episodeId}:media-visual-slot:`.length);
    if (value.slotId !== `${value.episodeId}:media-visual-slot:${value.segmentId}`) {
      context.addIssue({
        code: "custom",
        path: ["slotId"],
        message: "slotId must use this episode media-visual-slot identity for the segment",
      });
    } else if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(slug)) {
      context.addIssue({
        code: "custom",
        path: ["slotId"],
        message: "slotId must use a valid media-visual-slot slug",
      });
    }
    if (
      value.artifactRef.episodeId !== value.episodeId ||
      value.artifactRef.artifactId !== value.slotId ||
      !value.artifactRef.path.startsWith(`content/${value.episodeId}/media/selections/`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef"],
        message: "artifactRef must use this episode visual-slot identity and selections path",
      });
    }
    if (
      [...value.claimIds].sort().join("\u0000") !==
      [...new Set(value.claimIds)].sort().join("\u0000")
    ) {
      context.addIssue({
        code: "custom",
        path: ["claimIds"],
        message: "claimIds must be sorted and unique",
      });
    }
    const gateAllTrue =
      value.gate.sourceAdmitted &&
      value.gate.rightsApproved &&
      value.gate.hashValid &&
      value.gate.verificationPassed &&
      value.gate.episodeIsolated;
    if (value.selectedType === "real-media") {
      if (!value.selectedMediaClipRef || !value.verificationRef) {
        context.addIssue({
          code: "custom",
          path: ["selectedType"],
          message: "real-media selection requires selectedMediaClipRef and verificationRef",
        });
      } else {
        if (value.selectedMediaClipRef.episodeId !== value.episodeId) {
          context.addIssue({
            code: "custom",
            path: ["selectedMediaClipRef", "episodeId"],
            message: "selected clip belongs to another episode",
          });
        }
        const clipSlug = value.selectedMediaClipRef.clipId.replace(/[^a-z0-9-]/gu, "-");
        if (
          value.verificationRef.artifactId !== `${value.episodeId}:media-verification:${clipSlug}`
        ) {
          context.addIssue({
            code: "custom",
            path: ["verificationRef"],
            message: "verificationRef must be the verification artifact of the selected clip",
          });
        }
      }
      if (value.fallbackType !== null || value.fallbackReason !== null) {
        context.addIssue({
          code: "custom",
          path: ["fallbackType"],
          message: "real-media selection must not carry a fallback reason",
        });
      }
      if (value.selectionScore <= 0) {
        context.addIssue({
          code: "custom",
          path: ["selectionScore"],
          message: "real-media selection requires a positive selection score",
        });
      }
      if (!gateAllTrue) {
        context.addIssue({
          code: "custom",
          path: ["gate"],
          message: "real-media selection requires all deterministic gates to pass",
        });
      }
    } else {
      if (value.selectedMediaClipRef !== null || value.verificationRef !== null) {
        context.addIssue({
          code: "custom",
          path: ["selectedMediaClipRef"],
          message: "fallback selection must not carry clip or verification refs",
        });
      }
      if (!value.fallbackType || !value.fallbackReason) {
        context.addIssue({
          code: "custom",
          path: ["fallbackType"],
          message: "fallback selection requires a structured fallbackType and fallbackReason",
        });
      }
      if (value.selectionScore !== 0) {
        context.addIssue({
          code: "custom",
          path: ["selectionScore"],
          message: "fallback selection must carry selection score 0",
        });
      }
    }
  });

export type VisualSlot = z.infer<typeof visualSlotSchema>;

/* ------------------------------------------------------------------------- *
 * Inputs
 * ------------------------------------------------------------------------- */

/** The ONLY visual need the Visual Director may propose for one segment. */
export type VisualSlotSegmentInput = {
  segmentId: string;
  claimIds: string[];
  narration: string;
  visualIntent: string;
  /** Soft clip-duration target (ms) for the duration-suitability term. */
  durationTargetMs?: number | null;
};

export type SelectVisualSlotForSegmentInput = {
  repoRoot: string;
  episodeId: string;
  segment: VisualSlotSegmentInput;
  /** Optional explicit retrieval ref; defaults to the canonical retrieval
   *  artifact of the segment derived from the episode registry. */
  retrievalResultRef?: ArtifactRef;
  config?: VisualSelectionConfig;
  eventSink?: MediaEventSink;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

/** Reference-only outcome for LangGraph state — never the slot body. */
export type VisualSlotOutcome = {
  /** Hash-bound ArtifactRef of the persisted `visual-slot-v1` artifact. */
  artifactRef: ArtifactRef;
  status: "ready";
  episodeId: string;
  segmentId: string;
  selectedType: VisualSlotSelectedType;
  fallbackType: VisualSlotFallbackType | null;
};

/* ------------------------------------------------------------------------- *
 * Small helpers
 * ------------------------------------------------------------------------- */

const roundScore = (value: number): number => Math.round(value * 1e6) / 1e6;

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
};

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

const readDependencies = (refs: readonly ArtifactRef[]): ArtifactDependency[] =>
  refs.map((ref) =>
    artifactDependencySchema.parse({
      artifactId: ref.artifactId,
      path: ref.path,
      sha256: ref.sha256,
      relation: "reads",
    }),
  );

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

/** Finds the registered (external) ref for an artifactId, if any. */
const findRegisteredRef = (
  repoRoot: string,
  episodeId: string,
  artifactId: string,
): ArtifactRef | undefined => {
  const filePath = path.resolve(repoRoot, `content/${episodeId}/artifact-index.json`);
  if (!fs.existsSync(filePath)) return undefined;
  const index = readArtifactIndex(filePath);
  const record = index.artifacts.find((candidate) => candidate.ref.artifactId === artifactId);
  return record?.ref;
};

const artifactBytesMatch = (repoRoot: string, ref: ArtifactRef, filePath: string): boolean => {
  try {
    const stat = fs.statSync(filePath);
    return stat.size === ref.sizeBytes && sha256File(filePath) === ref.sha256;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------------- *
 * Retrieval gate (fail-closed)
 * ------------------------------------------------------------------------- */

const gateRetrievalResult = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  ref: ArtifactRef | undefined;
}): {result: MediaRetrievalResult; ref: ArtifactRef} | null => {
  const {repoRoot, episodeId, segmentId} = input;
  const canonicalPath = resolveMediaRepositoryPath(
    repoRoot,
    `content/${episodeId}/media/candidates/${segmentId}.json`,
  );
  const fileExists = fs.existsSync(canonicalPath);
  let ref: ArtifactRef | undefined = input.ref;
  if (!ref) {
    if (!fileExists) return null; // no retrieval was ever produced → NOT_FOUND
    ref = findRegisteredRef(repoRoot, episodeId, `${episodeId}:media-retrieval:${segmentId}`);
    if (!ref) {
      throw new Error(
        `MEDIA_SELECT_RETRIEVAL_NOT_REGISTERED:${episodeId}:media-retrieval:${segmentId}`,
      );
    }
  }
  ref = artifactRefSchema.parse(ref);
  if (ref.episodeId !== episodeId) {
    throw new Error(`MEDIA_SELECT_RETRIEVAL_REF_EPISODE_MISMATCH:${ref.episodeId}:${episodeId}`);
  }
  if (!artifactRefIsIndexed(repoRoot, ref)) {
    throw new Error(`MEDIA_SELECT_RETRIEVAL_NOT_REGISTERED:${ref.artifactId}`);
  }
  const filePath = resolveMediaRepositoryPath(repoRoot, ref.path);
  if (!artifactBytesMatch(repoRoot, ref, filePath)) {
    throw new Error(`MEDIA_SELECT_RETRIEVAL_TAMPERED:${ref.artifactId}`);
  }
  let result: MediaRetrievalResult;
  try {
    result = mediaRetrievalResultSchema.parse(
      JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
    );
  } catch (error) {
    throw new Error(`MEDIA_SELECT_RETRIEVAL_INVALID:${ref.artifactId}`, {cause: error});
  }
  if (result.episodeId !== episodeId || result.segmentId !== segmentId) {
    throw new Error(`MEDIA_SELECT_RETRIEVAL_MISMATCH:${ref.artifactId}`);
  }
  if (result.schemaVersion !== MEDIA_RETRIEVAL_SCHEMA_VERSION) {
    throw new Error(`MEDIA_SELECT_RETRIEVAL_INVALID:${ref.artifactId}`);
  }
  return {result, ref};
};

/* ------------------------------------------------------------------------- *
 * Verification gate (fail-closed)
 * ------------------------------------------------------------------------- */

const readVerificationForCandidate = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  candidate: MediaRetrievalCandidate;
}): {verification: MediaVerification; ref: ArtifactRef} | null => {
  const {repoRoot, episodeId, segmentId, candidate} = input;
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaVerificationRepositoryPath(episodeId, segmentId, candidate.clipId),
  );
  if (!fs.existsSync(filePath)) return null;
  let verification: MediaVerification;
  try {
    verification = mediaVerificationSchema.parse(
      JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
    );
  } catch (error) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_INVALID:${candidate.clipId}`, {cause: error});
  }
  if (verification.episodeId !== episodeId) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_EPISODE_MISMATCH:${candidate.clipId}:${episodeId}`);
  }
  if (verification.segmentId !== segmentId || verification.clipId !== candidate.clipId) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_MISMATCH:${candidate.clipId}`);
  }
  if (verification.schemaVersion !== MEDIA_VERIFICATION_SCHEMA_VERSION) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_INVALID:${candidate.clipId}`);
  }
  // Embedded ref must be self-consistent (hash of the body without artifactRef).
  const bodyWithoutArtifactRef = {...verification};
  Reflect.deleteProperty(bodyWithoutArtifactRef, "artifactRef");
  if (
    sha256Bytes(Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8")) !==
    verification.artifactRef.sha256
  ) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_TAMPERED:${candidate.clipId}`);
  }
  // The registered ref must bind the exact file bytes.
  const registered = findRegisteredRef(repoRoot, episodeId, verification.artifactRef.artifactId);
  if (!registered || registered.path !== verification.artifactRef.path) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_NOT_REGISTERED:${candidate.clipId}`);
  }
  if (!artifactBytesMatch(repoRoot, registered, filePath)) {
    throw new Error(`MEDIA_SELECT_VERIFICATION_TAMPERED:${candidate.clipId}`);
  }
  return {verification, ref: registered};
};

/* ------------------------------------------------------------------------- *
 * Media gate (fail-closed; rights revocation → structured fallback)
 * ------------------------------------------------------------------------- */

type MediaGateResult = {
  asset: MediaAsset;
  source: MediaSource;
  admissionBlocked: boolean;
  rightsBlocked: boolean;
};

const gateMediaForCandidate = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
  candidate: MediaRetrievalCandidate;
}): MediaGateResult => {
  const {repoRoot, episodeId, manifest, candidate} = input;
  const rawAsset = manifest.assets.find((value) => value.mediaId === candidate.mediaId);
  if (!rawAsset) {
    throw new Error(`MEDIA_SELECT_ASSET_UNKNOWN:${candidate.mediaId}`);
  }
  const asset = mediaAssetSchema.parse(rawAsset);
  if (asset.episodeId !== episodeId) {
    throw new Error(`MEDIA_SELECT_ASSET_EPISODE_MISMATCH:${asset.mediaId}:${episodeId}`);
  }
  const recorded = manifest.assets.find((value) => value.mediaId === asset.mediaId);
  if (!recorded || JSON.stringify(recorded) !== JSON.stringify(asset)) {
    throw new Error(`MEDIA_SELECT_ASSET_STALE:${asset.mediaId}`);
  }
  // The retrieval candidate must still point at the current asset bytes.
  if (candidate.mediaRef.sha256 !== asset.artifactRef.sha256) {
    throw new Error(`MEDIA_SELECT_ASSET_MISMATCH:${candidate.mediaId}`);
  }
  const source = getMediaSource(manifest, asset.mediaSourceId);
  if (!source) {
    throw new Error(`MEDIA_SELECT_SOURCE_UNKNOWN:${asset.mediaSourceId}`);
  }
  // Current admission/rights are re-read on every selection (never cached
  // state). A revoked source makes the candidate ineligible with a structured
  // REAL_MEDIA_RIGHTS_BLOCKED fallback — fail-closed, never selected.
  const admissionBlocked = !isMediaSourceAdmitted(source);
  const rightsBlocked =
    admissionBlocked || !isMediaSourceRightsApproved(source) || asset.rightsStatus !== "approved";
  if (source.admissionDecisionRef) {
    readHumanDecision(repoRoot, source.admissionDecisionRef, episodeId);
  }
  if (source.rightsDecisionRef) {
    readHumanDecision(repoRoot, source.rightsDecisionRef, episodeId);
  }
  // Tampering is an integrity failure: even a rights-blocked candidate must
  // fail closed instead of silently falling back.
  if (!artifactRefIsIndexed(repoRoot, asset.artifactRef)) {
    throw new Error(`MEDIA_SELECT_ASSET_NOT_REGISTERED:${asset.mediaId}`);
  }
  if (
    !artifactBytesMatch(
      repoRoot,
      asset.artifactRef,
      resolveMediaRepositoryPath(repoRoot, asset.artifactRef.path),
    )
  ) {
    throw new Error(`MEDIA_SELECT_ASSET_TAMPERED:${asset.mediaId}`);
  }
  return {asset, source, admissionBlocked, rightsBlocked};
};

/* ------------------------------------------------------------------------- *
 * Candidate assessment + deterministic scoring
 * ------------------------------------------------------------------------- */

type CandidateAssessment = {
  candidate: MediaRetrievalCandidate;
  verification: MediaVerification | null;
  /** Registered (external) verification ref binding the artifact bytes. */
  verificationRef: ArtifactRef | null;
  admissionBlocked: boolean;
  rightsBlocked: boolean;
  evidenceBlocked: boolean;
  qualityBlocked: boolean;
  misleadingBlocked: boolean;
  sourceTrust: number;
  clipDurationMs: number;
};

const assessCandidates = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  claimIds: readonly string[];
  result: MediaRetrievalResult;
  manifest: MediaSourceManifest;
  config: VisualSelectionConfig;
}): CandidateAssessment[] => {
  const {repoRoot, episodeId, segmentId, claimIds, result, manifest, config} = input;
  const assessments: CandidateAssessment[] = [];
  for (const candidate of result.candidates) {
    const verificationResult = readVerificationForCandidate({
      repoRoot,
      episodeId,
      segmentId,
      candidate,
    });
    if (!verificationResult) {
      assessments.push({
        candidate,
        verification: null,
        verificationRef: null,
        admissionBlocked: false,
        rightsBlocked: false,
        evidenceBlocked: false,
        qualityBlocked: false,
        misleadingBlocked: false,
        sourceTrust: 0,
        clipDurationMs: candidate.endMs - candidate.startMs,
      });
      continue;
    }
    const verification = verificationResult.verification;
    if (verification.verdict !== "pass") {
      // reject/uncertain is never selectable, whatever the retrieval score.
      assessments.push({
        candidate,
        verification: null,
        verificationRef: null,
        admissionBlocked: false,
        rightsBlocked: false,
        evidenceBlocked: false,
        qualityBlocked: false,
        misleadingBlocked: false,
        sourceTrust: 0,
        clipDurationMs: candidate.endMs - candidate.startMs,
      });
      continue;
    }
    const {source, admissionBlocked, rightsBlocked} = gateMediaForCandidate({
      repoRoot,
      episodeId,
      manifest,
      candidate,
    });
    // Evidence-fit gate: claim-bound segments require real claim evidence.
    const evidenceBlocked =
      config.gates.requireClaimEvidence &&
      claimIds.length > 0 &&
      candidate.matchedClaimIds.length === 0;
    const qualityBlocked = verification.visualQuality < config.gates.minVisualQuality;
    const misleadingBlocked = verification.misleadingRisk > config.gates.maxMisleadingRisk;
    assessments.push({
      candidate,
      verification,
      verificationRef: verificationResult.ref,
      admissionBlocked,
      rightsBlocked,
      evidenceBlocked,
      qualityBlocked,
      misleadingBlocked,
      sourceTrust: (SOURCE_PREFERENCE_TIERS[source.sourceType] ?? 1) / 5,
      clipDurationMs: verification.recommendedEndMs - verification.recommendedStartMs,
    });
  }
  return assessments;
};

/** Deterministic weighted score of one eligible candidate. */
export const scoreVisualSlotCandidate = (input: {
  assessment: CandidateAssessment;
  config: VisualSelectionConfig;
  durationTargetMs: number | null;
}): number => {
  const {assessment, config, durationTargetMs} = input;
  const verification = assessment.verification!;
  const durationSuitability =
    durationTargetMs === null
      ? 0.5
      : 1 -
        Math.min(
          1,
          Math.abs(assessment.clipDurationMs - durationTargetMs) / Math.max(durationTargetMs, 1000),
        );
  const weights = config.weights;
  const total =
    weights.claimFit * assessment.candidate.scoreBreakdown.claim +
    weights.visualIntentFit * assessment.candidate.scoreBreakdown.visualIntent +
    weights.retrievalScore * assessment.candidate.score +
    weights.verificationClaimMatch * verification.claimMatch +
    weights.verificationRelevance * verification.relevance +
    weights.visualQuality * verification.visualQuality +
    weights.misleadingRiskSafety * (1 - verification.misleadingRisk) +
    weights.sourceTrust * assessment.sourceTrust +
    weights.durationSuitability * durationSuitability;
  return roundScore(total);
};

/**
 * Deterministic total order — never random:
 * score desc → sourceTrust desc → retrieval rank asc → mediaId asc →
 * startMs asc → clipId asc. The clipId is content-derived, so the order is
 * always total.
 */
export const compareVisualSlotCandidates = (
  left: CandidateAssessment & {score: number},
  right: CandidateAssessment & {score: number},
): number => {
  if (right.score !== left.score) return right.score - left.score;
  if (right.sourceTrust !== left.sourceTrust) return right.sourceTrust - left.sourceTrust;
  if (left.candidate.rank !== right.candidate.rank) {
    return left.candidate.rank - right.candidate.rank;
  }
  if (left.candidate.mediaId !== right.candidate.mediaId) {
    return left.candidate.mediaId < right.candidate.mediaId ? -1 : 1;
  }
  if (left.candidate.startMs !== right.candidate.startMs) {
    return left.candidate.startMs - right.candidate.startMs;
  }
  if (left.candidate.clipId !== right.candidate.clipId) {
    return left.candidate.clipId < right.candidate.clipId ? -1 : 1;
  }
  return 0;
};

/* ------------------------------------------------------------------------- *
 * Fallback stage decision (deterministic)
 * ------------------------------------------------------------------------- */

/** Admitted, rights-approved, hash-valid original image assets. Not captureAssets. */
export const listOfficialScreenshotAssets = (repoRoot: string, episodeId: string): MediaAsset[] => {
  try {
    const manifest = readMediaSourceManifest(repoRoot, episodeId);
    return manifest.assets
      .filter((asset) => {
        if (asset.kind !== "original" || !asset.mediaType.startsWith("image/")) return false;
        if (asset.rightsStatus !== "approved") return false;
        const source = getMediaSource(manifest, asset.mediaSourceId);
        if (!source) return false;
        if (!isMediaSourceAdmitted(source) || !isMediaSourceRightsApproved(source)) return false;
        try {
          assertArtifactRefBytes(repoRoot, asset.artifactRef);
          return true;
        } catch {
          return false;
        }
      })
      .sort((left, right) => left.mediaId.localeCompare(right.mediaId));
  } catch {
    return [];
  }
};

export const findOfficialScreenshotAsset = (
  repoRoot: string,
  episodeId: string,
): MediaAsset | undefined => listOfficialScreenshotAssets(repoRoot, episodeId)[0];

const episodeHasOfficialScreenshot = (repoRoot: string, episodeId: string): boolean =>
  listOfficialScreenshotAssets(repoRoot, episodeId).length > 0;

const episodeHasDataEvidence = (repoRoot: string, episodeId: string): boolean => {
  try {
    const factsPath = resolveMediaRepositoryPath(repoRoot, claimLedgerRepositoryPath(episodeId));
    if (!fs.existsSync(factsPath)) return false;
    const raw = JSON.parse(fs.readFileSync(factsPath, "utf8")) as unknown;
    if (!Array.isArray(raw)) return false;
    return raw.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        ((entry as Record<string, unknown>).metricName ?? "") !== "",
    );
  } catch {
    return false;
  }
};

/**
 * Deterministic fallback stage in the fixed order:
 * official screenshot → data/evidence card → programmatic visual.
 */
export const fallbackStageFor = (repoRoot: string, episodeId: string): VisualSlotSelectedType => {
  if (episodeHasOfficialScreenshot(repoRoot, episodeId)) return "official-screenshot";
  if (episodeHasDataEvidence(repoRoot, episodeId)) return "data-evidence-card";
  return "programmatic-visual";
};

/* ------------------------------------------------------------------------- *
 * Persistence + registry
 * ------------------------------------------------------------------------- */

const registerVisualSlotCandidate = (input: {
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

const publishVisualSlotArtifact = (input: {
  repoRoot: string;
  episodeId: string;
  segmentId: string;
  slotId: string;
  bytes: Uint8Array;
  dependencies: readonly ArtifactDependency[];
  executionId: string;
  producer: string;
  now: () => string;
}): ArtifactRef => {
  const filePath = resolveMediaRepositoryPath(
    input.repoRoot,
    mediaVisualSlotRepositoryPath(input.episodeId, input.segmentId),
  );
  copyBytesAtomically(filePath, Buffer.from(input.bytes));
  const ref = buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.slotId,
    episodeId: input.episodeId,
    path: mediaVisualSlotRepositoryPath(input.episodeId, input.segmentId),
    mediaType: "application/json",
    schemaVersion: MEDIA_VISUAL_SLOT_SCHEMA_VERSION,
    producer: input.producer,
    createdAt: input.now(),
  });
  registerVisualSlotCandidate({
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

const SELECTION_SCOPE_MEDIA_ID = (episodeId: string): string => `${episodeId}:media:selection`;
const SELECTION_SCOPE_SOURCE_ID = (episodeId: string): string =>
  `${episodeId}:media-source:selection`;

export const selectVisualSlotForSegment = async (
  input: SelectVisualSlotForSegmentInput,
): Promise<VisualSlotOutcome> => {
  const repoRoot = path.resolve(input.repoRoot);
  const {episodeId} = input;
  const now = input.now ?? (() => new Date().toISOString());
  const eventSink = input.eventSink ?? createMediaEventSink({repoRoot, episodeId});
  const config = visualSelectionConfigSchema.parse(input.config ?? DEFAULT_VISUAL_SELECTION_CONFIG);

  const segment = {
    segmentId: segmentIdSchema.parse(input.segment.segmentId),
    claimIds: [...new Set(input.segment.claimIds)].sort(),
    narration: normalizeNarration(input.segment.narration),
    visualIntent: normalizeNarration(input.segment.visualIntent),
    durationTargetMs:
      input.segment.durationTargetMs === null || input.segment.durationTargetMs === undefined
        ? null
        : input.segment.durationTargetMs,
  };
  if (segment.claimIds.length === 0) {
    throw new Error(`MEDIA_SELECT_CLAIM_IDS_REQUIRED:${segment.segmentId}`);
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
        mediaId: SELECTION_SCOPE_MEDIA_ID(episodeId),
        mediaSourceId: SELECTION_SCOPE_SOURCE_ID(episodeId),
        ...(input.runId ? {runId: input.runId} : {}),
        ...(input.traceId ? {traceId: input.traceId} : {}),
        segmentId: segment.segmentId,
        claimIds: segment.claimIds,
        ...extra,
      }),
    );
  };

  emit("media.selection.started", {});
  try {
    const reasons: string[] = [];
    reasons.push(
      `segment ${segment.segmentId} claim-bound with ${segment.claimIds.length} claim(s)`,
    );

    // 1. Retrieval gate: candidates must come from the current hash-valid
    //    retrieval artifact. No retrieval at all → REAL_MEDIA_NOT_FOUND.
    const gated = gateRetrievalResult({
      repoRoot,
      episodeId,
      segmentId: segment.segmentId,
      ref: input.retrievalResultRef,
    });
    let result: MediaRetrievalResult | null = null;
    let retrievalRef: ArtifactRef | null = null;
    if (gated) {
      result = gated.result;
      retrievalRef = gated.ref;
      reasons.push(
        `retrieval result ${retrievalRef.artifactId} produced ${result.candidates.length} candidate(s)`,
      );
    } else {
      reasons.push("no retrieval result exists for this segment");
    }

    // The manifest is only required when candidates exist (a retrieval result
    // is always built from a manifest, so its absence is fail-closed there);
    // a segment without any retrieval must still produce a NOT_FOUND slot.
    let manifest: MediaSourceManifest | null = null;
    let assessments: CandidateAssessment[] = [];
    if (result) {
      manifest = readMediaSourceManifest(repoRoot, episodeId);
      assessments = assessCandidates({
        repoRoot,
        episodeId,
        segmentId: segment.segmentId,
        claimIds: segment.claimIds,
        result,
        manifest,
        config,
      });
      const verified = assessments.filter((assessment) => assessment.verification !== null);
      if (verified.length > 0) {
        reasons.push(`${verified.length} candidate(s) carry a valid pass verification`);
      }
    }

    // 2. Deterministic fallback determination (fixed priority).
    const passVerified = assessments.filter((assessment) => assessment.verification !== null);
    const rightsOk = passVerified.filter((assessment) => !assessment.rightsBlocked);
    const evidenceOk = rightsOk.filter((assessment) => !assessment.evidenceBlocked);
    const qualityOk = evidenceOk.filter((assessment) => !assessment.qualityBlocked);
    const eligible = qualityOk.filter((assessment) => !assessment.misleadingBlocked);

    let fallbackType: VisualSlotFallbackType | null = null;
    let fallbackReason: string | null = null;
    let selectedAssessment: (CandidateAssessment & {score: number}) | null = null;

    if (result === null || result.candidates.length === 0) {
      fallbackType = "REAL_MEDIA_NOT_FOUND";
      fallbackReason = "retrieval produced no candidates for this segment";
    } else if (passVerified.length === 0) {
      fallbackType = "REAL_MEDIA_NOT_VERIFIED";
      fallbackReason = "no candidate has a valid pass verification (missing, reject, or uncertain)";
    } else if (rightsOk.length === 0) {
      fallbackType = "REAL_MEDIA_RIGHTS_BLOCKED";
      fallbackReason = "every pass-verified candidate lost source admission or rights approval";
    } else if (evidenceOk.length === 0) {
      fallbackType = "REAL_MEDIA_LOW_EVIDENCE_FIT";
      fallbackReason = "every pass-verified candidate lacks sufficient claim evidence";
    } else if (qualityOk.length === 0) {
      fallbackType = "REAL_MEDIA_LOW_VISUAL_QUALITY";
      fallbackReason = `every pass-verified candidate is below visual quality ${config.gates.minVisualQuality}`;
    } else if (eligible.length === 0) {
      fallbackType = "REAL_MEDIA_MISLEADING_RISK";
      fallbackReason = `every pass-verified candidate exceeds misleading risk ${config.gates.maxMisleadingRisk}`;
    }

    const gate = {
      sourceAdmitted: passVerified.some((assessment) => !assessment.admissionBlocked),
      rightsApproved: rightsOk.length > 0,
      hashValid: true,
      verificationPassed: passVerified.length > 0,
      episodeIsolated: true,
    };

    let selectedType: VisualSlotSelectedType;
    let selectedMediaClipRef: MediaClipRef | null = null;
    let verificationRef: ArtifactRef | null = null;
    let selectionScore = 0;

    if (fallbackType === null && eligible.length > 0) {
      const scored = eligible.map((assessment) => ({
        ...assessment,
        score: scoreVisualSlotCandidate({
          assessment,
          config,
          durationTargetMs: segment.durationTargetMs,
        }),
      }));
      scored.sort(compareVisualSlotCandidates);
      selectedAssessment = scored[0]!;
      const verification = selectedAssessment.verification!;
      selectedType = "real-media";
      selectedMediaClipRef = verification.clipRef;
      verificationRef = selectedAssessment.verificationRef;
      selectionScore = selectedAssessment.score;
      reasons.push(
        `selected ${selectedAssessment.candidate.clipId} score ${selectionScore.toFixed(6)} ` +
          `(claimFit=${selectedAssessment.candidate.scoreBreakdown.claim.toFixed(3)}, ` +
          `relevance=${verification.relevance.toFixed(3)}, claimMatch=${verification.claimMatch.toFixed(3)}, ` +
          `quality=${verification.visualQuality.toFixed(3)}, risk=${verification.misleadingRisk.toFixed(3)}, ` +
          `tie-breaker=${config.tieBreaker})`,
      );
    } else {
      const stage = fallbackStageFor(repoRoot, episodeId);
      selectedType = stage;
      fallbackType ??= "REAL_MEDIA_NOT_FOUND";
      fallbackReason ??= "no usable real media candidate";
      reasons.push(`fallback ${fallbackType}: ${fallbackReason}`);
      reasons.push(
        `fallback stage ${stage} (official screenshot → data/evidence card → programmatic visual)`,
      );
    }

    // 3. Persist the slot as a hash-bound artifact + register with lineage.
    const slotId = `${episodeId}:media-visual-slot:${segment.segmentId}`;
    if (passVerified.length > 0 && manifest === null) {
      throw new Error(`MEDIA_SELECT_MANIFEST_MISSING:${episodeId}`);
    }
    const activeManifest = manifest;
    const dependencies = dedupeDependencies([
      ...(retrievalRef ? readDependencies([retrievalRef]) : []),
      ...(verificationRef ? readDependencies([verificationRef]) : []),
      ...passVerified.flatMap((assessment) => {
        const mediaGate = (() => {
          try {
            return gateMediaForCandidate({
              repoRoot,
              episodeId,
              manifest: activeManifest!,
              candidate: assessment.candidate,
            });
          } catch {
            return null;
          }
        })();
        return [
          ...(assessment.verificationRef ? readDependencies([assessment.verificationRef]) : []),
          ...(mediaGate ? readDependencies([mediaGate.asset.artifactRef]) : []),
          ...(mediaGate ? decisionDependencies(mediaGate.source) : []),
        ];
      }),
    ]);

    const bodyWithoutArtifactRef = {
      schemaVersion: MEDIA_VISUAL_SLOT_SCHEMA_VERSION,
      slotId,
      episodeId,
      segmentId: segment.segmentId,
      claimIds: segment.claimIds,
      visualIntent: segment.visualIntent,
      selectedType,
      selectedMediaClipRef,
      verificationRef,
      fallbackType,
      fallbackReason,
      selectionScore,
      reasons,
      selectionVersion: MEDIA_VISUAL_SELECTION_VERSION,
      gate,
      config,
      createdAt: now(),
    };
    const contentBytes = Buffer.from(serializeIndexArtifact(bodyWithoutArtifactRef), "utf8");
    const embeddedArtifactRef = artifactRefSchema.parse({
      artifactId: slotId,
      episodeId,
      path: mediaVisualSlotRepositoryPath(episodeId, segment.segmentId),
      mediaType: "application/json",
      schemaVersion: MEDIA_VISUAL_SLOT_SCHEMA_VERSION,
      revision: 1,
      sha256: sha256Bytes(contentBytes),
      sizeBytes: contentBytes.byteLength,
      producer: `${MEDIA_VISUAL_SELECTION_TOOL_VERSION}:${config.version}`,
      createdAt: now(),
    });
    const body = visualSlotSchema.parse({
      ...bodyWithoutArtifactRef,
      artifactRef: embeddedArtifactRef,
    });
    const bytes = Buffer.from(serializeIndexArtifact(body), "utf8");
    const executionId = `media-selection:${segment.segmentId}`;
    const ref = publishVisualSlotArtifact({
      repoRoot,
      episodeId,
      segmentId: segment.segmentId,
      slotId,
      bytes,
      dependencies,
      executionId,
      producer: `${MEDIA_VISUAL_SELECTION_TOOL_VERSION}:${config.version}`,
      now,
    });
    emit("media.selection.completed", {
      artifactRef: ref,
      sha256: ref.sha256,
      sizeBytes: ref.sizeBytes,
      mediaType: "application/json",
      selectedType,
      ...(fallbackType ? {fallbackType} : {}),
      reason: fallbackType === null ? "real-media" : `fallback:${fallbackType}`,
    });
    return {
      artifactRef: ref,
      status: "ready",
      episodeId,
      segmentId: segment.segmentId,
      selectedType,
      fallbackType,
    };
  } catch (error) {
    emit("media.selection.failed", {reason: errorMessage(error)});
    throw error;
  }
};

/* ------------------------------------------------------------------------- *
 * Script-driven entry point (one formal VisualSlot per final-script segment)
 * ------------------------------------------------------------------------- */

export type SelectVisualSlotsForScriptInput = {
  repoRoot: string;
  episodeId: string;
  config?: VisualSelectionConfig;
  eventSink?: MediaEventSink;
  runId?: string;
  traceId?: string;
  now?: () => string;
};

export const selectVisualSlotsForScript = async (
  input: SelectVisualSlotsForScriptInput,
): Promise<VisualSlotOutcome[]> => {
  const repoRoot = path.resolve(input.repoRoot);
  const scriptPath = path.resolve(repoRoot, `content/${input.episodeId}/story/script.json`);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`MEDIA_SELECT_SCRIPT_MISSING:${input.episodeId}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(scriptPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`MEDIA_SELECT_SCRIPT_INVALID:${input.episodeId}`, {cause: error});
  }
  const parsed = z.object({segments: z.array(z.unknown())}).safeParse(raw);
  if (!parsed.success || parsed.data.segments.length === 0) {
    throw new Error(`MEDIA_SELECT_SCRIPT_INVALID:${input.episodeId}`);
  }
  const outcomes: VisualSlotOutcome[] = [];
  for (const rawSegment of parsed.data.segments) {
    const segment = z
      .object({
        id: segmentIdSchema,
        claimIds: z.array(claimIdSchema).min(1),
        narration: z.string().min(1),
        visualIntent: z.string().min(1),
        targetSeconds: z.number().positive().optional(),
      })
      .parse(rawSegment);
    outcomes.push(
      await selectVisualSlotForSegment({
        repoRoot,
        episodeId: input.episodeId,
        segment: {
          segmentId: segment.id,
          claimIds: segment.claimIds,
          narration: segment.narration,
          visualIntent: segment.visualIntent,
          durationTargetMs: segment.targetSeconds ? Math.round(segment.targetSeconds * 1000) : null,
        },
        config: input.config,
        eventSink: input.eventSink,
        runId: input.runId,
        traceId: input.traceId,
        now: input.now,
      }),
    );
  }
  return outcomes;
};

/* ------------------------------------------------------------------------- *
 * Reader (artifact bytes remain the source of truth)
 * ------------------------------------------------------------------------- */

export const readVisualSlot = (
  repoRoot: string,
  episodeId: string,
  segmentId: string,
): VisualSlot => {
  const filePath = resolveMediaRepositoryPath(
    repoRoot,
    mediaVisualSlotRepositoryPath(episodeId, segmentId),
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`MEDIA_SELECT_SLOT_MISSING:${segmentId}`);
  }
  const parsed = visualSlotSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  if (parsed.episodeId !== episodeId || parsed.segmentId !== segmentId) {
    throw new Error(`MEDIA_SELECT_ARTIFACT_MISMATCH:${segmentId}`);
  }
  return parsed;
};
