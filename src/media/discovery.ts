import crypto from "node:crypto";
import fs from "node:fs";
import {persistHumanDecision} from "../orchestration/human-decision";
import type {ArtifactRef} from "../orchestration/schemas/artifact";
import {humanDecisionSchema, type HumanDecision} from "../orchestration/schemas/human-decision";
import {mediaDiscoveryFileConfig, type MediaDiscoveryConfig} from "./discovery-config";
import {
  emptyMediaSourceManifest,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaSource,
  setMediaSourceAdmission,
  writeMediaSourceManifestCas,
} from "./manifest";
import {mediaSourceManifestRepositoryPath, resolveMediaRepositoryPath} from "./paths";
import {
  mediaSourceManifestSchema,
  mediaSourceSchema,
  mediaSourceTypeSchema,
  type MediaRightsStatus,
  type MediaSource,
  type MediaSourceManifest,
  type MediaSourceType,
} from "./schemas";

const sha256Hex = (bytes: Buffer): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const DEFAULT_PUBLISHER = "unknown";
const DEFAULT_RIGHTS_BASIS = "Awaiting structured human rights review";

const manifestPathFor = (episodeId: string): string => mediaSourceManifestRepositoryPath(episodeId);

const readOrCreateManifest = (repoRoot: string, episodeId: string): MediaSourceManifest =>
  fs.existsSync(resolveMediaRepositoryPath(repoRoot, manifestPathFor(episodeId)))
    ? readMediaSourceManifest(repoRoot, episodeId)
    : emptyMediaSourceManifest({episodeId});

const assertCandidateUrlAllowed = (input: {
  sourceUrl: string;
  sourceType: MediaSourceType;
  config: MediaDiscoveryConfig;
}): void => {
  if (input.sourceType === "local-approved") {
    if (input.sourceUrl !== "") {
      throw new Error(
        `MEDIA_DISCOVERY_LOCAL_SOURCE_URL_INVALID:${input.sourceUrl}:local-approved sources must use an empty sourceUrl`,
      );
    }
    return;
  }
  if (input.sourceUrl === "") {
    throw new Error(`MEDIA_DISCOVERY_URL_REQUIRED:${input.sourceType}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(input.sourceUrl);
  } catch {
    throw new Error(`MEDIA_DISCOVERY_URL_INVALID:${input.sourceUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`MEDIA_DISCOVERY_HTTPS_REQUIRED:${input.sourceUrl}`);
  }
  // Exact hostname match against the allowlist; URL.hostname is normalized, so
  // `example.com` never matches `fooexample.com` or `example.com.evil.net`.
  if (!input.config.allowedHosts.includes(parsed.hostname)) {
    throw new Error(`MEDIA_DISCOVERY_HOST_NOT_ALLOWED:${parsed.hostname}`);
  }
};

const assertCandidateSourceType = (input: {
  sourceType: unknown;
  config: MediaDiscoveryConfig;
}): MediaSourceType => {
  const parsed = mediaSourceTypeSchema.safeParse(input.sourceType);
  if (!parsed.success) {
    throw new Error(`MEDIA_DISCOVERY_SOURCE_TYPE_NOT_ALLOWED:${String(input.sourceType)}`);
  }
  if (!input.config.allowedSourceTypes.includes(parsed.data)) {
    throw new Error(`MEDIA_DISCOVERY_SOURCE_TYPE_NOT_ALLOWED:${parsed.data}`);
  }
  return parsed.data;
};

export type ProposeMediaSourceInput = {
  repoRoot: string;
  episodeId: string;
  /** Partial source descriptor; the missing fields receive audit-safe defaults. */
  source: {
    sourceId: string;
    sourceUrl?: string;
    publisher?: string;
    sourceType: MediaSourceType;
    rightsBasis?: string;
    rightsStatus?: MediaRightsStatus;
    notes?: string;
  };
  expectedManifestVersion?: string | null;
  config?: MediaDiscoveryConfig;
};

export type ProposeMediaSourceResult = {
  manifest: MediaSourceManifest;
  source: MediaSource;
  /** Control hash of the source-manifest just written by CAS. */
  version: string;
};

/**
 * Proposes one candidate locator. A URL never becomes a MediaAsset here: no
 * bytes are downloaded and nothing is written under `media/assets/`. The source
 * always enters the manifest as `admissionStatus=pending` with
 * `rightsStatus=review-required` (or `unknown`) — never pre-approved.
 */
export const proposeMediaSource = (input: ProposeMediaSourceInput): ProposeMediaSourceResult => {
  const config = input.config ?? mediaDiscoveryFileConfig;
  const {episodeId, sourceId} = {episodeId: input.episodeId, sourceId: input.source.sourceId};

  if (!sourceId.startsWith(`${episodeId}:media-source:`)) {
    if (/^episode-[a-z0-9-]+:media-source:/u.test(sourceId)) {
      throw new Error(`MEDIA_DISCOVERY_EPISODE_MISMATCH:${sourceId}:${episodeId}`);
    }
    throw new Error(`MEDIA_DISCOVERY_SOURCE_ID_INVALID:${sourceId}`);
  }

  const sourceType = assertCandidateSourceType({sourceType: input.source.sourceType, config});
  assertCandidateUrlAllowed({
    sourceUrl: input.source.sourceUrl ?? "",
    sourceType,
    config,
  });

  const rightsStatus = input.source.rightsStatus ?? "review-required";
  if (rightsStatus !== "review-required" && rightsStatus !== "unknown") {
    throw new Error(`MEDIA_DISCOVERY_RIGHTS_STATE_INVALID:${rightsStatus}`);
  }

  const source = mediaSourceSchema.parse({
    sourceId,
    episodeId,
    sourceUrl: input.source.sourceUrl ?? "",
    publisher: input.source.publisher ?? DEFAULT_PUBLISHER,
    sourceType,
    admissionStatus: "pending",
    admissionReason: "",
    rightsBasis: input.source.rightsBasis ?? DEFAULT_RIGHTS_BASIS,
    rightsStatus,
    notes: input.source.notes ?? "",
  });

  const manifest = readOrCreateManifest(input.repoRoot, episodeId);
  const alreadyKnown = manifest.sources.some((candidate) => candidate.sourceId === sourceId);
  if (!alreadyKnown && manifest.sources.length >= config.maxCandidatesPerEpisode) {
    throw new Error(
      `MEDIA_DISCOVERY_CANDIDATE_LIMIT:${episodeId}:${config.maxCandidatesPerEpisode}`,
    );
  }

  const registered = registerMediaSource({manifest, source});
  const currentVersion = readMediaSourceManifestVersion(input.repoRoot, episodeId);
  const version = writeMediaSourceManifestCas({
    repoRoot: input.repoRoot,
    manifest: registered,
    expectedVersion: input.expectedManifestVersion ?? currentVersion ?? null,
  });
  const registeredSource = registered.sources.find((candidate) => candidate.sourceId === sourceId);
  if (!registeredSource) {
    throw new Error(`MEDIA_SOURCE_UNKNOWN:${sourceId}`);
  }
  return {manifest: registered, source: registeredSource, version};
};

/**
 * The HumanDecision must anchor to the exact source-manifest bytes the reviewer
 * approved. Cross-episode refs are rejected by the caller before this check.
 */
const assertDecisionAnchoredToSourceManifest = (input: {
  repoRoot: string;
  episodeId: string;
  sourceId: string;
  decision: HumanDecision;
}): void => {
  const manifestPath = manifestPathFor(input.episodeId);
  const manifestFile = resolveMediaRepositoryPath(input.repoRoot, manifestPath);
  const currentSha = sha256Hex(fs.readFileSync(manifestFile));
  const manifestRefs = input.decision.artifactRefs.filter((ref) => ref.path === manifestPath);
  if (manifestRefs.length === 0) {
    throw new Error(`MEDIA_DISCOVERY_DECISION_REF_NOT_RELATED:${input.sourceId}`);
  }
  if (!manifestRefs.some((ref) => ref.sha256 === currentSha)) {
    throw new Error(`MEDIA_DISCOVERY_DECISION_REF_STALE:${input.sourceId}`);
  }
};

const assertDecisionEnvelope = (input: {
  decision: unknown;
  episodeId: string;
  expectedGate: "media-admission" | "media-rights";
}): HumanDecision => {
  const raw =
    input.decision && typeof input.decision === "object" && !Array.isArray(input.decision)
      ? (input.decision as Record<string, unknown>)
      : null;
  const decisionKind = raw?.decision ?? raw?.action;
  if (decisionKind === "reject" && raw?.issue === undefined) {
    throw new Error("HUMAN_DECISION_REJECT_ISSUE_REQUIRED");
  }
  const decision = humanDecisionSchema.parse(input.decision);
  if (decision.gate !== input.expectedGate) {
    throw new Error(`MEDIA_DISCOVERY_GATE_MISMATCH:${decision.gate}`);
  }
  if (decision.decision === "direct-edit") {
    throw new Error("MEDIA_DISCOVERY_DECISION_KIND_INVALID");
  }
  if (decision.artifactRefs.some((ref) => ref.episodeId !== input.episodeId)) {
    throw new Error("MEDIA_DISCOVERY_DECISION_EPISODE_MISMATCH");
  }
  return decision;
};

const writeWithExpectedVersion = (input: {
  repoRoot: string;
  episodeId: string;
  manifest: MediaSourceManifest;
  expectedManifestVersion?: string | null;
}): void => {
  const currentVersion = readMediaSourceManifestVersion(input.repoRoot, input.episodeId);
  writeMediaSourceManifestCas({
    repoRoot: input.repoRoot,
    manifest: input.manifest,
    expectedVersion: input.expectedManifestVersion ?? currentVersion ?? null,
  });
};

export type ApplyMediaSourceAdmissionInput = {
  repoRoot: string;
  episodeId: string;
  sourceId: string;
  decision: HumanDecision;
  expectedManifestVersion?: string | null;
};

export type ApplyMediaSourceDecisionResult = {
  manifest: MediaSourceManifest;
  decisionRef: ArtifactRef;
};

/**
 * Formal admission gate. The decision must be a `media-admission` HumanDecision
 * that has been persisted (this call persists it idempotently and returns its
 * hash-bound ref). `approve` sets admissionStatus=admitted; `reject` sets
 * rejected and requires a structured issue. A pending source can never become
 * admitted through any other discovery entry point.
 */
export const applyMediaSourceAdmission = (
  input: ApplyMediaSourceAdmissionInput,
): ApplyMediaSourceDecisionResult => {
  const manifest = readMediaSourceManifest(input.repoRoot, input.episodeId);
  const existing = manifest.sources.find((source) => source.sourceId === input.sourceId);
  if (!existing) {
    throw new Error(`MEDIA_SOURCE_UNKNOWN:${input.sourceId}`);
  }

  const decision = assertDecisionEnvelope({
    decision: input.decision,
    episodeId: input.episodeId,
    expectedGate: "media-admission",
  });
  assertDecisionAnchoredToSourceManifest({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    sourceId: input.sourceId,
    decision,
  });

  const persisted = persistHumanDecision({
    repoRoot: input.repoRoot,
    decision,
  });
  const decisionRef = persisted.decisionRef;

  if (
    existing.admissionDecisionRef &&
    existing.admissionDecisionRef.sha256 !== decisionRef.sha256
  ) {
    throw new Error(`MEDIA_DISCOVERY_ADMISSION_DECISION_CONFLICT:${input.sourceId}`);
  }

  const admissionStatus = decision.decision === "approve" ? "admitted" : "rejected";
  const updated = setMediaSourceAdmission({
    manifest,
    sourceId: input.sourceId,
    admissionStatus,
    reason: decision.reason,
    decidedBy: decision.reviewer,
    decidedAt: decision.timestamp,
  });
  // setMediaSourceAdmission rebuilds the source without the optional decision
  // refs, so the persisted refs are re-attached here.
  const withDecisionRefs = mediaSourceManifestSchema.parse({
    ...updated,
    sources: updated.sources.map((source) =>
      source.sourceId === input.sourceId
        ? mediaSourceSchema.parse({
            ...source,
            admissionDecisionRef: decisionRef,
            ...(existing.rightsDecisionRef ? {rightsDecisionRef: existing.rightsDecisionRef} : {}),
          })
        : source,
    ),
  });

  writeWithExpectedVersion({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    manifest: withDecisionRefs,
    expectedManifestVersion: input.expectedManifestVersion,
  });
  return {manifest: withDecisionRefs, decisionRef};
};

export type ApplyMediaSourceRightsInput = {
  repoRoot: string;
  episodeId: string;
  sourceId: string;
  decision: HumanDecision;
  expectedManifestVersion?: string | null;
};

/**
 * Formal rights gate. `approve` sets rightsStatus=approved; `reject` sets
 * rejected. Without an approved `media-rights` decision the source stays
 * review-required/unknown and cannot render.
 */
export const applyMediaSourceRights = (
  input: ApplyMediaSourceRightsInput,
): ApplyMediaSourceDecisionResult => {
  const manifest = readMediaSourceManifest(input.repoRoot, input.episodeId);
  const existing = manifest.sources.find((source) => source.sourceId === input.sourceId);
  if (!existing) {
    throw new Error(`MEDIA_SOURCE_UNKNOWN:${input.sourceId}`);
  }

  const decision = assertDecisionEnvelope({
    decision: input.decision,
    episodeId: input.episodeId,
    expectedGate: "media-rights",
  });
  assertDecisionAnchoredToSourceManifest({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    sourceId: input.sourceId,
    decision,
  });

  const persisted = persistHumanDecision({
    repoRoot: input.repoRoot,
    decision,
  });
  const decisionRef = persisted.decisionRef;

  if (existing.rightsDecisionRef && existing.rightsDecisionRef.sha256 !== decisionRef.sha256) {
    throw new Error(`MEDIA_DISCOVERY_RIGHTS_DECISION_CONFLICT:${input.sourceId}`);
  }

  const rightsStatus = decision.decision === "approve" ? "approved" : "rejected";
  const nextSource = mediaSourceSchema.parse({
    ...existing,
    rightsStatus,
    rightsDecisionRef: decisionRef,
  });
  const next = mediaSourceManifestSchema.parse({
    ...manifest,
    updatedAt: decision.timestamp,
    sources: manifest.sources.map((source) =>
      source.sourceId === input.sourceId ? nextSource : source,
    ),
  });

  writeWithExpectedVersion({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    manifest: next,
    expectedManifestVersion: input.expectedManifestVersion,
  });
  return {manifest: next, decisionRef};
};

/** All candidate sources recorded for the episode, in manifest order. */
export const listDiscoveredSources = (manifest: MediaSourceManifest): MediaSource[] =>
  mediaSourceManifestSchema.parse(manifest).sources;

export const getMediaSource = (
  manifest: MediaSourceManifest,
  sourceId: string,
): MediaSource | undefined =>
  mediaSourceManifestSchema.parse(manifest).sources.find((source) => source.sourceId === sourceId);

/**
 * A source counts as admitted only when a persisted, hash-bound
 * `media-admission` decision exists. Setting admissionStatus directly on the
 * manifest primitive is not enough.
 */
export const isMediaSourceAdmitted = (source: MediaSource): boolean => {
  const parsed = mediaSourceSchema.parse(source);
  return parsed.admissionStatus === "admitted" && parsed.admissionDecisionRef !== undefined;
};

/**
 * Rights count as approved only when a persisted, hash-bound `media-rights`
 * decision exists. LLM/VLM or metadata automation can never set this state;
 * only `applyMediaSourceRights` records the decision ref.
 */
export const isMediaSourceRightsApproved = (source: MediaSource): boolean => {
  const parsed = mediaSourceSchema.parse(source);
  return parsed.rightsStatus === "approved" && parsed.rightsDecisionRef !== undefined;
};
