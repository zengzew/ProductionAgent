import {z} from "zod";
import {artifactRefSchema} from "../orchestration/schemas/artifact";

const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTimeSchema = z.string().datetime({offset: true});

export const mediaSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u);

const scopedSlugPattern = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

const scopedIdSlug = (value: string, episodeId: string, kind: string): string =>
  value.startsWith(`${episodeId}:${kind}:`) ? value.slice(`${episodeId}:${kind}:`.length) : "";

const validScopedSlug = (value: string, episodeId: string, kind: string): boolean => {
  const slug = scopedIdSlug(value, episodeId, kind);
  return slug.length > 0 && scopedSlugPattern.test(slug);
};

const sourceUrlSchema = z.union([z.string().url(), z.literal("")]);

export const mediaSourceTypeSchema = z.enum([
  "official",
  "founder",
  "product-demo",
  "media",
  "platform",
  "analysis",
  "social",
  "local-approved",
]);

export const mediaAcquisitionMethodSchema = z.enum([
  "download",
  "browser-capture",
  "manual-import",
  "local-approved",
]);

export const mediaRightsStatusSchema = z.enum([
  "approved",
  "review-required",
  "rejected",
  "unknown",
]);

export const mediaSourceAdmissionStatusSchema = z.enum(["pending", "admitted", "rejected"]);

export const mediaTypeSchema = z
  .string()
  .min(1)
  .regex(/^(video|audio|image)\/[a-z0-9][a-z0-9.+-]*$/u);

export const mediaSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    episodeId: episodeIdSchema,
    sourceUrl: sourceUrlSchema,
    publisher: z.string().min(1),
    sourceType: mediaSourceTypeSchema,
    admissionStatus: mediaSourceAdmissionStatusSchema,
    admissionReason: z.string().max(1000).default(""),
    admittedAt: isoDateTimeSchema.optional(),
    admittedBy: z.string().min(1).optional(),
    rejectedAt: isoDateTimeSchema.optional(),
    rejectedBy: z.string().min(1).optional(),
    rightsBasis: z.string().min(1),
    rightsStatus: mediaRightsStatusSchema,
    /** Hash-bound ArtifactRef of the persisted `media-admission` HumanDecision. */
    admissionDecisionRef: artifactRefSchema.optional(),
    /** Hash-bound ArtifactRef of the persisted `media-rights` HumanDecision. */
    rightsDecisionRef: artifactRefSchema.optional(),
    accessedAt: isoDateTimeSchema.optional(),
    notes: z.string().max(2000).default(""),
  })
  .strict()
  .superRefine((value, context) => {
    if (!validScopedSlug(value.sourceId, value.episodeId, "media-source")) {
      context.addIssue({
        code: "custom",
        path: ["sourceId"],
        message: "sourceId must use a valid episode-scoped media-source identity",
      });
    }
    if (value.admissionDecisionRef && value.admissionDecisionRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["admissionDecisionRef", "episodeId"],
        message: "admission decision ref belongs to another episode",
      });
    }
    if (value.rightsDecisionRef && value.rightsDecisionRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["rightsDecisionRef", "episodeId"],
        message: "rights decision ref belongs to another episode",
      });
    }
    if (value.admissionStatus === "admitted" && (!value.admittedAt || !value.admittedBy)) {
      context.addIssue({
        code: "custom",
        path: ["admissionStatus"],
        message: "admitted media source requires admittedAt and admittedBy",
      });
    }
    if (value.admissionStatus === "rejected" && (!value.rejectedAt || !value.rejectedBy)) {
      context.addIssue({
        code: "custom",
        path: ["admissionStatus"],
        message: "rejected media source requires rejectedAt and rejectedBy",
      });
    }
  });

export const mediaAssetSchema = z
  .object({
    mediaId: z.string().min(1),
    episodeId: episodeIdSchema,
    mediaSourceId: z.string().min(1),
    sourceUrl: sourceUrlSchema,
    publisher: z.string().min(1),
    sourceType: mediaSourceTypeSchema,
    acquisitionMethod: mediaAcquisitionMethodSchema,
    originalFilename: z.string().min(1),
    mediaType: mediaTypeSchema,
    sha256: sha256Schema,
    sizeBytes: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    fps: z.number().positive().nullable(),
    audioChannels: z.number().int().positive().nullable(),
    capturedAt: isoDateTimeSchema,
    accessedAt: isoDateTimeSchema,
    publishedAt: z.string().min(1).nullable(),
    rightsBasis: z.string().min(1),
    rightsStatus: mediaRightsStatusSchema,
    artifactRef: artifactRefSchema,
    kind: z.enum(["original", "proxy"]),
    derivedFromMediaId: z.string().min(1).optional(),
    /** Hash-bound ArtifactRef of the original this proxy was derived from. */
    derivedFromMediaRef: artifactRefSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!validScopedSlug(value.mediaId, value.episodeId, "media")) {
      context.addIssue({
        code: "custom",
        path: ["mediaId"],
        message: "mediaId must use a valid episode-scoped media identity",
      });
    }
    if (!validScopedSlug(value.mediaSourceId, value.episodeId, "media-source")) {
      context.addIssue({
        code: "custom",
        path: ["mediaSourceId"],
        message: "mediaSourceId must use a valid episode media-source identity",
      });
    }
    if (value.artifactRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef", "episodeId"],
        message: "artifactRef belongs to another episode",
      });
    }
    if (value.artifactRef.artifactId !== value.mediaId) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef", "artifactId"],
        message: "artifactRef.artifactId must equal mediaId",
      });
    }
    if (!value.artifactRef.path.startsWith(`content/${value.episodeId}/media/assets/`)) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef", "path"],
        message: "artifactRef.path must stay inside this episode media assets directory",
      });
    }
    if (value.artifactRef.sha256 !== value.sha256) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef", "sha256"],
        message: "artifactRef.sha256 must equal MediaAsset.sha256",
      });
    }
    if (value.artifactRef.sizeBytes !== value.sizeBytes) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef", "sizeBytes"],
        message: "artifactRef.sizeBytes must equal MediaAsset.sizeBytes",
      });
    }
    if (value.artifactRef.mediaType !== value.mediaType) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef", "mediaType"],
        message: "artifactRef.mediaType must equal MediaAsset.mediaType",
      });
    }
    if (value.kind === "proxy") {
      if (
        !value.derivedFromMediaId ||
        !validScopedSlug(value.derivedFromMediaId, value.episodeId, "media")
      ) {
        context.addIssue({
          code: "custom",
          path: ["derivedFromMediaId"],
          message: "proxy media must declare a valid episode-scoped original mediaId",
        });
      }
      if (!value.derivedFromMediaRef) {
        context.addIssue({
          code: "custom",
          path: ["derivedFromMediaRef"],
          message: "proxy media must declare a hash-bound derivedFromMediaRef",
        });
      } else if (
        value.derivedFromMediaRef.episodeId !== value.episodeId ||
        value.derivedFromMediaRef.artifactId !== value.derivedFromMediaId
      ) {
        context.addIssue({
          code: "custom",
          path: ["derivedFromMediaRef"],
          message: "derivedFromMediaRef must anchor this episode original mediaId",
        });
      }
    }
    if (value.kind === "original" && value.derivedFromMediaId) {
      context.addIssue({
        code: "custom",
        path: ["derivedFromMediaId"],
        message: "original media must not declare derivedFromMediaId",
      });
    }
    if (value.kind === "original" && value.derivedFromMediaRef) {
      context.addIssue({
        code: "custom",
        path: ["derivedFromMediaRef"],
        message: "original media must not declare derivedFromMediaRef",
      });
    }
  });

export const mediaClipRefSchema = z
  .object({
    clipId: z.string().min(1),
    episodeId: episodeIdSchema,
    mediaId: z.string().min(1),
    sourceMediaRef: artifactRefSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    claimIds: z.array(z.string().min(1)).min(1),
    visualIntent: z.string().min(1),
    transcriptRefs: z.array(artifactRefSchema).default([]),
    verificationRef: artifactRefSchema.optional(),
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!validScopedSlug(value.clipId, value.episodeId, "media-clip")) {
      context.addIssue({
        code: "custom",
        path: ["clipId"],
        message: "clipId must use a valid episode-scoped media-clip identity",
      });
    }
    if (!validScopedSlug(value.mediaId, value.episodeId, "media")) {
      context.addIssue({
        code: "custom",
        path: ["mediaId"],
        message: "mediaId must use a valid episode-scoped media identity",
      });
    }
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "endMs must be greater than startMs",
      });
    }
    if (value.sourceMediaRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["sourceMediaRef", "episodeId"],
        message: "sourceMediaRef belongs to another episode",
      });
    }
    if (value.sourceMediaRef.artifactId !== value.mediaId) {
      context.addIssue({
        code: "custom",
        path: ["sourceMediaRef", "artifactId"],
        message: "sourceMediaRef.artifactId must equal mediaId",
      });
    }
    for (const [index, ref] of value.transcriptRefs.entries()) {
      if (ref.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["transcriptRefs", index],
          message: "transcript ref belongs to another episode",
        });
      }
    }
    if (
      value.verificationRef &&
      (value.verificationRef.episodeId !== value.episodeId ||
        !validScopedSlug(value.verificationRef.artifactId, value.episodeId, "media-verification"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["verificationRef"],
        message: "verification ref must use this episode media-verification identity",
      });
    }
  });

export const mediaVerificationVerdictSchema = z.enum(["pass", "reject", "uncertain"]);
export type MediaVerificationVerdictValue = z.infer<typeof mediaVerificationVerdictSchema>;

export const MEDIA_VERIFICATION_SCHEMA_VERSION = "media-verification-v1" as const;

const zeroToOne = z.number().min(0).max(1);
const claimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/u);

/**
 * WP-M5.06 formal `media-verification-v1` record.
 *
 * A verification is a VLM observation/score record over ONE short candidate
 * clip plus optional keyframes — never over a whole long video. It answers
 * only "what did this short clip actually show, and does it fit the current
 * narration/claim/visualIntent?" — it does NOT grant rights, does NOT modify
 * the Claim Ledger, and is NOT a factual-truth authorization. The embedded
 * `artifactRef.sha256` is the content hash of the record body without the
 * self-referential `artifactRef` field; the authoritative file binding is the
 * external ArtifactRef returned by the pipeline and stored in the registry.
 */
export const mediaVerificationSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_VERIFICATION_SCHEMA_VERSION),
    verificationId: z.string().min(1),
    episodeId: episodeIdSchema,
    /** Final-script segment this verification serves. */
    segmentId: z.string().regex(/^seg-[a-z0-9-]+$/u),
    clipId: z.string().min(1),
    /** Candidate MediaClipRef (candidate range = clipRef.startMs..endMs). */
    clipRef: mediaClipRefSchema,
    /** Hash-bound original MediaAsset the candidate was retrieved from. */
    mediaRef: artifactRefSchema,
    /** Hash-bound `media-retrieval-result-v1` artifact the candidate came from. */
    retrievalResultRef: artifactRefSchema,
    /** Hash-bound bytes of the short verification clip the VLM actually saw. */
    clipArtifactRef: artifactRefSchema,
    /** Claim Ledger ids this verification was run against (sorted, unique). */
    claimIds: z.array(claimIdSchema).min(1),
    /** M4 fine-grained cache key of this verification run. */
    cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
    verdict: mediaVerificationVerdictSchema,
    relevance: zeroToOne,
    claimMatch: zeroToOne,
    visualQuality: zeroToOne,
    misleadingRisk: zeroToOne,
    observedActions: z.array(z.string().min(1)).default([]),
    observedEntities: z.array(z.string().min(1)).default([]),
    observedText: z.array(z.string().min(1)).default([]),
    /** Must lie strictly inside the candidate range (clipRef.startMs..endMs). */
    recommendedStartMs: z.number().int().nonnegative(),
    recommendedEndMs: z.number().int().positive(),
    reasons: z.array(z.string().min(1)).min(1),
    provider: z.string().min(1),
    model: z.string().min(1).nullable(),
    verificationVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    toolVersion: z.string().min(1),
    /** SHA-256 of the original media bytes this verification describes. */
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    artifactRef: artifactRefSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!validScopedSlug(value.verificationId, value.episodeId, "media-verification")) {
      context.addIssue({
        code: "custom",
        path: ["verificationId"],
        message: "verificationId must use a valid episode-scoped media-verification identity",
      });
    }
    if (value.clipRef.clipId !== value.clipId || value.clipRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["clipRef"],
        message: "clipRef must match verification episode and clipId",
      });
    }
    if (
      value.claimIds.length !== value.clipRef.claimIds.length ||
      [...value.claimIds].sort().join("\u0000") !==
        [...value.clipRef.claimIds].sort().join("\u0000")
    ) {
      context.addIssue({
        code: "custom",
        path: ["claimIds"],
        message: "claimIds must equal clipRef.claimIds",
      });
    }
    if (
      value.mediaRef.episodeId !== value.episodeId ||
      value.mediaRef.artifactId !== value.clipRef.mediaId ||
      value.mediaRef.sha256 !== value.clipRef.sourceMediaRef.sha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["mediaRef"],
        message: "mediaRef must be the hash-bound source media of clipRef",
      });
    }
    if (value.sourceSha256 !== value.mediaRef.sha256) {
      context.addIssue({
        code: "custom",
        path: ["sourceSha256"],
        message: "sourceSha256 must equal mediaRef.sha256",
      });
    }
    if (
      value.retrievalResultRef.episodeId !== value.episodeId ||
      !value.retrievalResultRef.artifactId.startsWith(`${value.episodeId}:media-retrieval:`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["retrievalResultRef"],
        message: "retrievalResultRef must be this episode media-retrieval artifact",
      });
    }
    if (
      value.clipArtifactRef.episodeId !== value.episodeId ||
      !value.clipArtifactRef.artifactId.startsWith(`${value.episodeId}:media-verification-clip:`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["clipArtifactRef"],
        message: "clipArtifactRef must be this episode media-verification-clip artifact",
      });
    }
    if (value.recommendedEndMs <= value.recommendedStartMs) {
      context.addIssue({
        code: "custom",
        path: ["recommendedEndMs"],
        message: "recommendedEndMs must be greater than recommendedStartMs",
      });
    }
    // The recommended range must lie inside the candidate range.
    if (
      value.recommendedStartMs < value.clipRef.startMs ||
      value.recommendedEndMs > value.clipRef.endMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["recommendedEndMs"],
        message: "recommended range must lie inside the candidate clip range",
      });
    }
    if (value.verdict === "pass" && (value.relevance < 0.5 || value.claimMatch < 0.5)) {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "pass verdict requires relevance and claimMatch to be at least 0.5",
      });
    }
    if (
      value.artifactRef.episodeId !== value.episodeId ||
      value.artifactRef.artifactId !== value.verificationId ||
      !value.artifactRef.path.startsWith(`content/${value.episodeId}/media/verifications/`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef"],
        message: "artifactRef must use this episode verification identity and verifications path",
      });
    }
  });

export const mediaUsageDecisionKindSchema = z.enum(["use-real", "fallback", "reject"]);

export const mediaUsageDecisionSchema = z
  .object({
    decisionId: z.string().min(1),
    episodeId: episodeIdSchema,
    segmentId: z.string().min(1),
    claimIds: z.array(z.string().min(1)).min(1),
    clipId: z.string().min(1).nullable(),
    clipRef: mediaClipRefSchema.nullable(),
    decision: mediaUsageDecisionKindSchema,
    reason: z.string().min(1).max(1000),
    fallbackReason: z.string().max(1000).optional(),
    gate: z
      .object({
        sourceAdmitted: z.boolean(),
        rightsApproved: z.boolean(),
        hashValid: z.boolean(),
        verificationPassed: z.boolean(),
      })
      .strict(),
    decidedBy: z.string().min(1),
    decidedAt: isoDateTimeSchema,
    artifactRef: artifactRefSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!validScopedSlug(value.decisionId, value.episodeId, "media-usage-decision")) {
      context.addIssue({
        code: "custom",
        path: ["decisionId"],
        message: "decisionId must use a valid episode-scoped media-usage-decision identity",
      });
    }
    if (
      value.artifactRef.episodeId !== value.episodeId ||
      value.artifactRef.artifactId !== value.decisionId ||
      !value.artifactRef.path.startsWith(`content/${value.episodeId}/media/decisions/`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["artifactRef"],
        message:
          "artifactRef must use this episode media-usage-decision identity and decisions path",
      });
    }
    if (value.decision === "fallback" && !value.fallbackReason) {
      context.addIssue({
        code: "custom",
        path: ["fallbackReason"],
        message: "fallback decision requires a structured fallbackReason",
      });
    }
    if (value.clipRef && value.clipId && value.clipRef.clipId !== value.clipId) {
      context.addIssue({
        code: "custom",
        path: ["clipId"],
        message: "clipId must match clipRef.clipId",
      });
    }
    if (value.clipRef && value.clipRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["clipRef", "episodeId"],
        message: "clipRef belongs to another episode",
      });
    }
    if (value.decision === "use-real") {
      if (!value.clipRef || !value.clipId) {
        context.addIssue({
          code: "custom",
          path: ["decision"],
          message: "use-real decision requires clipId and clipRef",
        });
      } else if (!value.clipRef.verificationRef) {
        context.addIssue({
          code: "custom",
          path: ["clipRef", "verificationRef"],
          message: "use-real decision requires clipRef.verificationRef",
        });
      }
      if (
        !value.gate.sourceAdmitted ||
        !value.gate.rightsApproved ||
        !value.gate.hashValid ||
        !value.gate.verificationPassed
      ) {
        context.addIssue({
          code: "custom",
          path: ["gate"],
          message: "use-real decision requires all deterministic gates to pass",
        });
      }
    }
  });

export const mediaSourceManifestSchema = z
  .object({
    schemaVersion: z.literal("media-source-manifest-v1"),
    episodeId: episodeIdSchema,
    updatedAt: isoDateTimeSchema,
    sources: z.array(mediaSourceSchema),
    assets: z.array(mediaAssetSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const sourceIds = new Set<string>();
    for (const [index, source] of value.sources.entries()) {
      if (source.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "episodeId"],
          message: "media source belongs to another episode",
        });
      }
      if (sourceIds.has(source.sourceId)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "sourceId"],
          message: "duplicate media source id",
        });
      }
      sourceIds.add(source.sourceId);
    }
    const mediaIds = new Set<string>();
    for (const [index, asset] of value.assets.entries()) {
      if (asset.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "episodeId"],
          message: "media asset belongs to another episode",
        });
      }
      if (mediaIds.has(asset.mediaId)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "mediaId"],
          message: "duplicate media asset id",
        });
      }
      mediaIds.add(asset.mediaId);
      const source = value.sources.find((candidate) => candidate.sourceId === asset.mediaSourceId);
      if (!source) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "mediaSourceId"],
          message: "media asset references an unknown media source",
        });
        continue;
      }
      if (
        source.sourceUrl !== asset.sourceUrl ||
        source.publisher !== asset.publisher ||
        source.sourceType !== asset.sourceType
      ) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "sourceUrl"],
          message: "media asset provenance does not match its media source",
        });
      }
    }
  });

export type MediaSourceType = z.infer<typeof mediaSourceTypeSchema>;
export type MediaAcquisitionMethod = z.infer<typeof mediaAcquisitionMethodSchema>;
export type MediaRightsStatus = z.infer<typeof mediaRightsStatusSchema>;
export type MediaSourceAdmissionStatus = z.infer<typeof mediaSourceAdmissionStatusSchema>;
export type MediaSource = z.infer<typeof mediaSourceSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type MediaClipRef = z.infer<typeof mediaClipRefSchema>;
export type MediaVerificationVerdict = z.infer<typeof mediaVerificationVerdictSchema>;
export type MediaVerification = z.infer<typeof mediaVerificationSchema>;
export type MediaUsageDecisionKind = z.infer<typeof mediaUsageDecisionKindSchema>;
export type MediaUsageDecision = z.infer<typeof mediaUsageDecisionSchema>;
export type MediaSourceManifest = z.infer<typeof mediaSourceManifestSchema>;
