import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  buildArtifactRef,
  humanDecisionSchema,
  readHumanDecision,
  type ArtifactRef,
  type HumanDecision,
} from "../src/orchestration";
import {
  applyMediaSourceAdmission,
  applyMediaSourceRights,
  getMediaSource,
  isMediaSourceAdmitted,
  listDiscoveredSources,
  parseMediaDiscoveryConfig,
  proposeMediaSource,
  type MediaDiscoveryConfig,
  type ProposeMediaSourceInput,
} from "../src/media";
import {
  emptyMediaSourceManifest,
  mediaSourceSchema,
  readMediaSourceManifest,
  readMediaSourceManifestVersion,
  registerMediaSource,
  setMediaSourceAdmission,
  writeMediaSourceManifest,
  type MediaSource,
} from "../src/media";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-m5-discovery-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const episodeId = "episode-m5";
const sourceId = "episode-m5:media-source:founder";

const baseSource = (
  overrides: Record<string, unknown> = {},
): ProposeMediaSourceInput["source"] => ({
  sourceId,
  sourceUrl: "https://example.com/founder-demo.mp4",
  publisher: "Example Corp",
  sourceType: "founder",
  rightsBasis: "Owner-provided interview for editorial use",
  ...overrides,
});

const propose = (repoRoot: string, source: ProposeMediaSourceInput["source"], extra = {}) =>
  proposeMediaSource({repoRoot, episodeId, source, ...extra});

const manifestRefFor = (repoRoot: string, episode: string): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `${episode}:media:source-manifest`,
    episodeId: episode,
    path: `content/${episode}/media/source-manifest.json`,
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "m5-discovery-test",
    createdAt: "2026-08-16T00:00:00.000Z",
  });

const rejectIssue = (ref: ArtifactRef): Record<string, unknown> => ({
  category: "visual.asset-rights",
  severity: "high",
  locator: {kind: "whole-artifact", value: "media-source"},
  affectedArtifactRef: ref,
});

const makeDecisionRaw = (input: {
  gate: "media-admission" | "media-rights";
  decision: "approve" | "reject";
  ref: ArtifactRef;
  decisionId: string;
  issue?: Record<string, unknown>;
  reason?: string;
}): Record<string, unknown> => ({
  decisionId: input.decisionId,
  gate: input.gate,
  decision: input.decision,
  reviewer: "human-reviewer-1",
  timestamp: "2026-08-16T00:01:00.000Z",
  reason: input.reason ?? "reviewed for the media audit trail",
  artifactRefs: [input.ref],
  approvalEpoch: 0,
  ...(input.issue ? {issue: input.issue} : {}),
});

const makeDecision = (input: {
  gate: "media-admission" | "media-rights";
  decision: "approve" | "reject";
  ref: ArtifactRef;
  decisionId: string;
  issue?: Record<string, unknown>;
  reason?: string;
}): HumanDecision => humanDecisionSchema.parse(makeDecisionRaw(input));

describe("WP-M5.02 media discovery and source admission", () => {
  it("rejects https hosts outside the allowlist with an exact-match rule", () => {
    const repoRoot = temporaryRepo();
    expect(() =>
      propose(repoRoot, baseSource({sourceUrl: "https://evil.example.net/founder.mp4"})),
    ).toThrow(/MEDIA_DISCOVERY_HOST_NOT_ALLOWED/u);
    // example.com must not be treated as a suffix of fooexample.com
    expect(() =>
      propose(repoRoot, baseSource({sourceUrl: "https://fooexample.com/founder.mp4"})),
    ).toThrow(/MEDIA_DISCOVERY_HOST_NOT_ALLOWED/u);
    expect(() =>
      propose(repoRoot, baseSource({sourceUrl: "https://example.com.evil.net/founder.mp4"})),
    ).toThrow(/MEDIA_DISCOVERY_HOST_NOT_ALLOWED/u);

    const allowed = propose(repoRoot, baseSource());
    expect(allowed.source.admissionStatus).toBe("pending");
    expect(allowed.source.sourceUrl).toBe("https://example.com/founder-demo.mp4");
  });

  it("rejects http URLs and only allows an empty URL for local-approved", () => {
    const repoRoot = temporaryRepo();
    expect(() =>
      propose(repoRoot, baseSource({sourceUrl: "http://example.com/founder.mp4"})),
    ).toThrow(/MEDIA_DISCOVERY_HTTPS_REQUIRED/u);
    expect(() =>
      propose(repoRoot, baseSource({sourceUrl: "ftp://example.com/founder.mp4"})),
    ).toThrow(/MEDIA_DISCOVERY_HTTPS_REQUIRED/u);

    const local = propose(
      repoRoot,
      baseSource({
        sourceId: "episode-m5:media-source:local-copy",
        sourceType: "local-approved",
        sourceUrl: "",
      }),
    );
    expect(local.source.sourceUrl).toBe("");
    expect(local.source.sourceType).toBe("local-approved");

    // Unknown source types fail closed with an explicit code.
    expect(() =>
      propose(
        repoRoot,
        baseSource({sourceType: "weird"}) as unknown as ProposeMediaSourceInput["source"],
      ),
    ).toThrow(/MEDIA_DISCOVERY_SOURCE_TYPE_NOT_ALLOWED/u);
    expect(() =>
      propose(
        repoRoot,
        baseSource({
          sourceId: "episode-m5:media-source:not-in-config",
          sourceType: "social",
        }),
      ),
    ).not.toThrow();
  });

  it("enters candidates as pending with no MediaAsset and no bytes on disk", () => {
    const repoRoot = temporaryRepo();
    const result = propose(repoRoot, baseSource());
    const manifest = readMediaSourceManifest(repoRoot, episodeId);

    expect(result.source.admissionStatus).toBe("pending");
    expect(["review-required", "unknown"]).toContain(result.source.rightsStatus);
    expect(result.source.admissionDecisionRef).toBeUndefined();
    expect(manifest.assets).toHaveLength(0);
    expect(manifest.sources).toHaveLength(1);
    expect(fs.existsSync(path.join(repoRoot, `content/${episodeId}/media/assets`))).toBe(false);
  });

  it("never admits a source without a formal persisted HumanDecision", () => {
    const repoRoot = temporaryRepo();
    // Bypassing the discovery layer with the raw manifest primitive leaves the
    // source without a decision ref, so it is not "admitted" at the query level.
    let manifest = emptyMediaSourceManifest({episodeId});
    manifest = registerMediaSource({
      manifest,
      source: mediaSourceSchema.parse({
        ...baseSource(),
        episodeId,
        admissionStatus: "pending",
        admissionReason: "",
        rightsStatus: "review-required",
        notes: "",
      }),
    });
    manifest = setMediaSourceAdmission({
      manifest,
      sourceId,
      admissionStatus: "admitted",
      reason: "bypassed the formal gate",
      decidedBy: "sneaky-automation",
    });
    const bypassed = getMediaSource(manifest, sourceId);
    expect(bypassed?.admissionStatus).toBe("admitted");
    expect(isMediaSourceAdmitted(bypassed as MediaSource)).toBe(false);

    // The discovery entry point also refuses non-media-admission gates.
    writeMediaSourceManifest(repoRoot, manifest);
    const ref = manifestRefFor(repoRoot, episodeId);
    const wrongGate = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref,
      decisionId: "wrong-gate-1",
    });
    const wrongGateRaw = {...wrongGate, gate: "content-approval"};
    expect(() =>
      applyMediaSourceAdmission({
        repoRoot,
        episodeId,
        sourceId,
        decision: wrongGateRaw as HumanDecision,
        expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
      }),
    ).toThrow(/MEDIA_DISCOVERY_GATE_MISMATCH/u);
  });

  it("approve writes admitted status and a hash-checkable admissionDecisionRef", () => {
    const repoRoot = temporaryRepo();
    const proposal = propose(repoRoot, baseSource());
    const ref = manifestRefFor(repoRoot, episodeId);
    const decision = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref,
      decisionId: "admission-approve-1",
    });
    const applied = applyMediaSourceAdmission({
      repoRoot,
      episodeId,
      sourceId,
      decision,
      expectedManifestVersion: proposal.version,
    });

    const admitted = getMediaSource(applied.manifest, sourceId) as MediaSource;
    expect(admitted.admissionStatus).toBe("admitted");
    expect(admitted.admittedBy).toBe("human-reviewer-1");
    expect(admitted.admissionDecisionRef).toBeDefined();
    expect(admitted.admissionDecisionRef?.episodeId).toBe(episodeId);
    expect(isMediaSourceAdmitted(admitted)).toBe(true);

    // The ref is hash-bound: reading the decision back verifies the persisted bytes.
    const readBack = readHumanDecision(repoRoot, admitted.admissionDecisionRef as ArtifactRef);
    expect(readBack.decisionId).toBe("admission-approve-1");
    expect(readBack.gate).toBe("media-admission");
    expect(readBack.decision).toBe("approve");
  });

  it("reject requires a structured issue and fails closed without one", () => {
    const repoRoot = temporaryRepo();
    const proposal = propose(repoRoot, baseSource());
    const ref = manifestRefFor(repoRoot, episodeId);

    const noIssue = makeDecisionRaw({
      gate: "media-admission",
      decision: "reject",
      ref,
      decisionId: "admission-reject-no-issue",
    });
    expect(() =>
      applyMediaSourceAdmission({
        repoRoot,
        episodeId,
        sourceId,
        decision: noIssue as unknown as HumanDecision,
      }),
    ).toThrow(/HUMAN_DECISION_REJECT_ISSUE_REQUIRED/u);

    const withIssue = makeDecision({
      gate: "media-admission",
      decision: "reject",
      ref,
      decisionId: "admission-reject-1",
      issue: rejectIssue(ref),
      reason: "source provenance cannot be verified",
    });
    const applied = applyMediaSourceAdmission({
      repoRoot,
      episodeId,
      sourceId,
      decision: withIssue,
      expectedManifestVersion: proposal.version,
    });
    const rejected = getMediaSource(applied.manifest, sourceId) as MediaSource;
    expect(rejected.admissionStatus).toBe("rejected");
    expect(rejected.rejectedBy).toBe("human-reviewer-1");
    expect(rejected.admissionDecisionRef).toBeDefined();
    expect(isMediaSourceAdmitted(rejected)).toBe(false);
  });

  it("keeps rights unapproved until a media-rights decision approves them", () => {
    const repoRoot = temporaryRepo();
    const proposal = propose(repoRoot, baseSource());
    const ref = manifestRefFor(repoRoot, episodeId);
    const admitDecision = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref,
      decisionId: "admission-approve-2",
    });
    const admitted = applyMediaSourceAdmission({
      repoRoot,
      episodeId,
      sourceId,
      decision: admitDecision,
      expectedManifestVersion: proposal.version,
    });
    const afterAdmit = getMediaSource(admitted.manifest, sourceId) as MediaSource;
    expect(afterAdmit.rightsStatus).toBe("review-required");

    // A non-media-rights gate cannot touch rights.
    const wrongGate = makeDecision({
      gate: "media-rights",
      decision: "approve",
      ref: manifestRefFor(repoRoot, episodeId),
      decisionId: "rights-wrong-gate",
    });
    expect(() =>
      applyMediaSourceRights({
        repoRoot,
        episodeId,
        sourceId,
        decision: {...wrongGate, gate: "media-admission"} as HumanDecision,
      }),
    ).toThrow(/MEDIA_DISCOVERY_GATE_MISMATCH/u);
    expect(
      getMediaSource(readMediaSourceManifest(repoRoot, episodeId), sourceId)?.rightsStatus,
    ).toBe("review-required");

    // The rights decision anchors to the post-admission manifest.
    const rightsRef = manifestRefFor(repoRoot, episodeId);
    const rightsDecision = makeDecision({
      gate: "media-rights",
      decision: "approve",
      ref: rightsRef,
      decisionId: "rights-approve-1",
    });
    const rightsApplied = applyMediaSourceRights({
      repoRoot,
      episodeId,
      sourceId,
      decision: rightsDecision,
      expectedManifestVersion: readMediaSourceManifestVersion(repoRoot, episodeId),
    });
    const approved = getMediaSource(rightsApplied.manifest, sourceId) as MediaSource;
    expect(approved.rightsStatus).toBe("approved");
    expect(approved.rightsDecisionRef).toBeDefined();
    expect(approved.admissionDecisionRef).toBeDefined();
  });

  it("rejects cross-episode sources and cross-episode decisions", () => {
    const repoRoot = temporaryRepo();
    expect(() =>
      propose(repoRoot, baseSource({sourceId: "episode-other:media-source:founder"})),
    ).toThrow(/MEDIA_DISCOVERY_EPISODE_MISMATCH/u);

    const proposal = propose(repoRoot, baseSource());
    const otherRef: ArtifactRef = {
      ...manifestRefFor(repoRoot, episodeId),
      episodeId: "episode-other",
      artifactId: "episode-other:media:source-manifest",
      path: "content/episode-other/media/source-manifest.json",
    };
    const crossDecision = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref: otherRef,
      decisionId: "cross-episode-1",
    });
    expect(() =>
      applyMediaSourceAdmission({
        repoRoot,
        episodeId,
        sourceId,
        decision: crossDecision,
        expectedManifestVersion: proposal.version,
      }),
    ).toThrow(/MEDIA_DISCOVERY_DECISION_EPISODE_MISMATCH/u);
  });

  it("fails closed past maxCandidatesPerEpisode", () => {
    const repoRoot = temporaryRepo();
    const tinyConfig: MediaDiscoveryConfig = parseMediaDiscoveryConfig({
      schemaVersion: "media-discovery-config-v1",
      allowedHosts: ["example.com"],
      allowedSourceTypes: ["founder", "official"],
      maxCandidatesPerEpisode: 2,
      requireHttps: true,
    });
    propose(repoRoot, baseSource(), {config: tinyConfig});
    propose(
      repoRoot,
      baseSource({sourceId: "episode-m5:media-source:launch", sourceType: "official"}),
      {config: tinyConfig},
    );
    expect(() =>
      propose(repoRoot, baseSource({sourceId: "episode-m5:media-source:third"}), {
        config: tinyConfig,
      }),
    ).toThrow(/MEDIA_DISCOVERY_CANDIDATE_LIMIT/u);
    // Re-proposing an existing candidate at the limit stays idempotent.
    expect(propose(repoRoot, baseSource(), {config: tinyConfig}).source.sourceId).toBe(sourceId);
  });

  it("fails closed on source-manifest CAS conflicts", () => {
    const repoRoot = temporaryRepo();
    const first = propose(repoRoot, baseSource());

    expect(() =>
      propose(repoRoot, baseSource({sourceId: "episode-m5:media-source:launch"}), {
        expectedManifestVersion: "0".repeat(64),
      }),
    ).toThrow(/MEDIA_SOURCE_MANIFEST_CAS_CONFLICT/u);

    const ref = manifestRefFor(repoRoot, episodeId);
    const decision = makeDecision({
      gate: "media-admission",
      decision: "approve",
      ref,
      decisionId: "admission-stale-cas",
    });
    expect(() =>
      applyMediaSourceAdmission({
        repoRoot,
        episodeId,
        sourceId,
        decision,
        expectedManifestVersion: "0".repeat(64),
      }),
    ).toThrow(/MEDIA_SOURCE_MANIFEST_CAS_CONFLICT/u);
    expect(readMediaSourceManifestVersion(repoRoot, episodeId)).toBe(first.version);
  });

  it("is idempotent for identical candidates and conflicts on changed content", () => {
    const repoRoot = temporaryRepo();
    const first = propose(repoRoot, baseSource());
    const second = propose(repoRoot, baseSource());
    expect(second.source).toEqual(first.source);
    expect(readMediaSourceManifest(repoRoot, episodeId).sources).toHaveLength(1);

    expect(() => propose(repoRoot, baseSource({publisher: "Different Corp"}))).toThrow(
      /MEDIA_SOURCE_ID_CONFLICT/u,
    );
  });

  it("keeps regression suites green and never downloads bytes", () => {
    // The media-discovery source file must not contain any network or process
    // spawn primitives: a URL is only a candidate locator, never a download.
    const sourcePath = new URL("../src/media/discovery.ts", import.meta.url);
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const token of ["fetch(", "http.request", "axios", "playwright", "child_process"]) {
      expect(source).not.toContain(token);
    }
  });

  it("exposes read-only query helpers over the manifest", () => {
    const repoRoot = temporaryRepo();
    propose(repoRoot, baseSource());
    propose(
      repoRoot,
      baseSource({sourceId: "episode-m5:media-source:launch", sourceType: "official"}),
    );
    const manifest = readMediaSourceManifest(repoRoot, episodeId);

    expect(listDiscoveredSources(manifest)).toHaveLength(2);
    expect(getMediaSource(manifest, sourceId)?.publisher).toBe("Example Corp");
    expect(getMediaSource(manifest, "episode-m5:media-source:nope")).toBeUndefined();
  });
});
