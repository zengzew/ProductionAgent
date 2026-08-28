import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {
  assertArtifactRefBytes,
  artifactRefBytesMatch,
  artifactRefIsIndexed,
  buildArtifactRef,
  readArtifactIndex,
  snapshotSelectedArtifactHistory,
} from "../artifact-registry";
import {ensureArtifactIndexForRefs} from "../human-decision";
import {
  buildMediaRenderPlanForTimeline,
  assertMediaRenderPlanRenderable,
  type MediaRenderProxyExtractor,
} from "../../media/render";
import {
  createCodexMediaVerificationProvider,
  rebindMediaVerification,
  readMediaVerification,
  verifyMediaClip,
  type MediaVerificationProvider,
  type ShortClipExtractor,
} from "../../media/verify";
import {
  readMediaRetrievalResult,
  retrieveMediaCandidates,
} from "../../media/retrieve";
import {readMediaSourceManifest} from "../../media/manifest";
import {
  getMediaSource,
  isMediaSourceAdmitted,
  isMediaSourceRightsApproved,
} from "../../media/discovery";
import {
  readMediaClipIndex,
  readMediaUnderstandingStatus,
} from "../../media/understanding";
import {selectVisualSlotForSegment} from "../../media/select";
import {
  mediaClipIndexRepositoryPath,
  mediaRenderPlanRepositoryPath,
  mediaSourceManifestRepositoryPath,
  mediaUnderstandingStatusRepositoryPath,
  mediaVerificationRepositoryPath,
} from "../../media/paths";
import {mediaSourceManifestSchema} from "../../media/schemas";
import {scriptSchema} from "../../schemas/episode";
import {generatedCaptionsPath} from "../../lib/episode/render-contract";
import {hashArtifactInputs} from "../observability";
import {pauseForExternalCapability, type FoundationNode, type ProductionGraphDestination} from "../lg-compat";
import type {ProductionState, ProductionStateUpdate} from "../state";
import {
  mediaGraphStageCheckpointSchema,
  mediaGraphStageNames,
  type MediaGraphIssueSummary,
  type MediaGraphStageName,
} from "../schemas/media-graph";
import type {ArtifactRef} from "../schemas/artifact";
import {
  deliveryCriticReportMarkdown,
  deliveryCriticResultPath,
  deliveryCriticReviewPackagePath,
  readDeliveryCriticResult,
  readDeliveryCriticReviewPackage,
  validateDeliveryCriticResult,
  writeDeliveryCriticReviewPackage,
  type DeliveryCriticResult,
  type DeliveryCriticReviewPackage,
} from "../schemas/delivery-critic";
import {PRE_RENDER_GATE_SCHEMA_VERSION, runPreRenderGate} from "../pre-render-gate";
import {productionStageNames as productionStageOrder, type ProductionStageName} from "../schemas/production";

export type MediaLifecycleOptions = {
  repoRoot: string;
  episodeId?: string;
  enabled?: boolean;
  verificationProvider?: MediaVerificationProvider;
  shortClipExtractor?: ShortClipExtractor;
  proxyExtractor?: MediaRenderProxyExtractor;
  cache?: import("../../lib/platform/cache").FineGrainedCacheStore | null;
  now?: () => string;
  maxRepairRounds?: number;
  env?: NodeJS.ProcessEnv;
};

export type MediaLifecycleNodes = {
  nodes: Partial<Record<MediaGraphStageName | "pre-render-repair", FoundationNode>>;
  chooseStart: (state: ProductionState) => ProductionGraphDestination;
  afterProductionStage: (
    state: ProductionState,
    stage: ProductionStageName,
  ) => ProductionGraphDestination;
  afterMediaStage: (
    state: ProductionState,
    stage: MediaGraphStageName,
  ) => ProductionGraphDestination;
};

const mediaStageDestination: Record<MediaGraphStageName, ProductionGraphDestination> = {
  discovery: "media_discovery",
  retrieve: "media_retrieve",
  verify: "media_verify",
  select: "media_select",
  "render-plan": "media_render_plan",
  "pre-render": "media_pre_render",
  "delivery-critic": "media_delivery_critic",
};

const uniqueRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] => {
  const map = new Map<string, ArtifactRef>();
  for (const ref of refs) map.set(`${ref.artifactId}:${ref.revision}:${ref.sha256}`, ref);
  return [...map.values()].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
};

const repositoryFile = (repoRoot: string, repositoryPath: string): string => {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, repositoryPath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`MEDIA_GRAPH_PATH_ESCAPES_REPOSITORY:${repositoryPath}`);
  }
  return absolute;
};

const currentRef = (repoRoot: string, ref: ArtifactRef | null | undefined): boolean =>
  Boolean(ref && artifactRefBytesMatch(repoRoot, ref));

const indexedRefFor = (
  repoRoot: string,
  episodeId: string,
  artifactId: string,
  repositoryPath: string,
): ArtifactRef | undefined => {
  const indexPath = repositoryFile(repoRoot, `content/${episodeId}/artifact-index.json`);
  if (!fs.existsSync(indexPath)) return undefined;
  try {
    const index = readArtifactIndex(indexPath);
    const pointer = index.selected[artifactId];
    return index.artifacts
      .map((record) => record.ref)
      .filter(
        (ref) =>
          ref.artifactId === artifactId &&
          ref.path === repositoryPath &&
          (!pointer ||
            (pointer.revision === ref.revision &&
              pointer.sha256 === ref.sha256 &&
              pointer.path === ref.path)),
      )
      .sort((left, right) => right.revision - left.revision)
      .find((ref) => artifactRefBytesMatch(repoRoot, ref));
  } catch {
    return undefined;
  }
};

const latestIndexedRefFor = (
  repoRoot: string,
  episodeId: string,
  artifactId: string,
  repositoryPath: string,
): ArtifactRef | undefined => {
  const indexPath = repositoryFile(repoRoot, `content/${episodeId}/artifact-index.json`);
  if (!fs.existsSync(indexPath)) return undefined;
  try {
    const index = readArtifactIndex(indexPath);
    return index.artifacts
      .filter(
        (record) =>
          record.state === "selected" &&
          record.ref.artifactId === artifactId &&
          record.ref.path === repositoryPath,
      )
      .map((record) => record.ref)
      .sort((left, right) => right.revision - left.revision)[0];
  } catch {
    return undefined;
  }
};

const refForFile = (input: {
  repoRoot: string;
  episodeId: string;
  state: ProductionState;
  artifactId: string;
  repositoryPath: string;
  mediaType: string;
  schemaVersion: string;
  producer: string;
  createdAt: string;
  previous?: ArtifactRef;
}): ArtifactRef => {
  const fromState = [
    input.state.artifacts[input.artifactId],
    ...Object.values(input.state.artifacts).filter((ref) => ref.path === input.repositoryPath),
  ]
    .filter((ref): ref is ArtifactRef => Boolean(ref))
    .sort((left, right) => right.revision - left.revision)[0];
  const indexed = indexedRefFor(
    input.repoRoot,
    input.episodeId,
    input.artifactId,
    input.repositoryPath,
  );
  if (indexed) return indexed;
  const indexedPrevious = latestIndexedRefFor(
    input.repoRoot,
    input.episodeId,
    input.artifactId,
    input.repositoryPath,
  );
  const previous = [input.previous, fromState, indexedPrevious]
    .filter((ref): ref is ArtifactRef => Boolean(ref))
    .sort((left, right) => right.revision - left.revision)[0];
  return buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: input.artifactId,
    episodeId: input.episodeId,
    path: input.repositoryPath,
    mediaType: input.mediaType,
    schemaVersion: input.schemaVersion,
    producer: input.producer,
    ...(previous ? {previous} : {}),
    createdAt: input.createdAt,
  });
};

const findStateRef = (state: ProductionState, predicate: (ref: ArtifactRef) => boolean): ArtifactRef | undefined =>
  Object.values(state.artifacts)
    .filter(predicate)
    .sort((left, right) => right.revision - left.revision || left.artifactId.localeCompare(right.artifactId))[0];

const outputRefsFor = (state: ProductionState, stage: MediaGraphStageName): ArtifactRef[] =>
  state.mediaStages[stage]?.outputArtifacts ?? [];

const successfulMediaRefs = (
  state: ProductionState,
  stages: readonly MediaGraphStageName[],
): ArtifactRef[] =>
  uniqueRefs(
    stages.flatMap((stage) => {
      const checkpoint = state.mediaStages[stage];
      return checkpoint && (checkpoint.status === "SUCCEEDED" || checkpoint.status === "SKIPPED")
        ? checkpoint.outputArtifacts
        : [];
    }),
  );

const refsAtPaths = (state: ProductionState, paths: readonly string[]): ArtifactRef[] =>
  uniqueRefs(
    paths.flatMap((repositoryPath) => {
      const ref = findStateRef(state, (candidate) => candidate.path === repositoryPath);
      return ref ? [ref] : [];
    }),
  );

const mediaInputsFor = (state: ProductionState, stage: MediaGraphStageName): ArtifactRef[] => {
  const common = state.contentManifestRef ? [state.contentManifestRef] : [];
  const episodeId = state.episodeId;
  if (stage === "discovery") {
    return uniqueRefs(common);
  }
  if (stage === "retrieve") {
    return uniqueRefs([
      ...common,
      ...successfulMediaRefs(state, ["discovery"]),
      ...refsAtPaths(state, [
        `content/${episodeId}/story/script.json`,
        `content/${episodeId}/research/facts.json`,
      ]),
    ]);
  }
  if (stage === "verify") {
    return uniqueRefs([...common, ...successfulMediaRefs(state, ["discovery", "retrieve"])]);
  }
  if (stage === "select") {
    return uniqueRefs([...common, ...successfulMediaRefs(state, ["discovery", "retrieve", "verify"])]);
  }
  if (stage === "render-plan") {
    return uniqueRefs([
      ...common,
      ...successfulMediaRefs(state, ["discovery", "retrieve", "verify", "select"]),
      ...refsAtPaths(state, [
        `content/${episodeId}/production/timeline.json`,
        generatedCaptionsPath(episodeId),
      ]),
    ]);
  }
  if (stage === "pre-render") {
    return uniqueRefs([
      ...common,
      ...successfulMediaRefs(state, ["render-plan"]),
      ...refsAtPaths(state, [
        `content/${episodeId}/story/script.json`,
        `content/${episodeId}/story/caption-plan.json`,
        generatedCaptionsPath(episodeId),
        `content/${episodeId}/production/timeline.json`,
        `output/${episodeId}/subtitles_zh.srt`,
      ]),
    ]);
  }
  return uniqueRefs([
    ...common,
    ...successfulMediaRefs(state, ["render-plan", "pre-render"]),
    ...refsAtPaths(state, [
      `output/${episodeId}/vertical_9x16.mp4`,
      `output/${episodeId}/subtitles_zh.srt`,
      `content/${episodeId}/production/timeline.json`,
      `content/${episodeId}/production/tts-metadata.json`,
      `output/${episodeId}/inspection.json`,
    ]),
  ]);
};

const mediaInputsForProductionStage = (
  state: ProductionState,
  stage: ProductionStageName,
): ArtifactRef[] => {
  const early: MediaGraphStageName[] = ["discovery", "retrieve", "verify", "select"];
  const render: MediaGraphStageName[] = [...early, "render-plan", "pre-render"];
  const mediaStages: readonly MediaGraphStageName[] =
    stage === "validate:delivery"
      ? [...render, "delivery-critic"]
      : stage === "render:smoke" || stage === "render:vertical" || stage === "inspect:output"
        ? render
        : early;
  return successfulMediaRefs(state, mediaStages);
};

const makeIssue = (input: {
  issueId: string;
  category: z.infer<typeof import("../schemas/critic-output").issueCategorySchema>;
  returnTo: MediaGraphIssueSummary["returnTo"];
  restartAt: string;
  summary: string;
}): MediaGraphIssueSummary => ({
  issueId: input.issueId,
  category: input.category,
  severity: "blocker",
  owner: "production-executor",
  locator: {kind: "whole-artifact", value: "pre-render-gate"},
  returnTo: input.returnTo,
  restartAt: input.restartAt,
  summary: input.summary.slice(0, 500),
});

const checkpointUpdate = (input: {
  state: ProductionState;
  stage: MediaGraphStageName;
  inputArtifacts: readonly ArtifactRef[];
  outputArtifacts: readonly ArtifactRef[];
  status?: "SUCCEEDED" | "SKIPPED" | "FAILED";
  issues?: readonly MediaGraphIssueSummary[];
  decision: {code: string; summary: string};
  failure?: {code: string; retryable: boolean; detail: string};
  extraArtifacts?: readonly ArtifactRef[];
}): ProductionStateUpdate => {
  const attempt = (input.state.mediaStages[input.stage]?.attempt ?? 0) + 1;
  const checkpoint = mediaGraphStageCheckpointSchema.parse({
    stage: input.stage,
    status: input.status ?? "SUCCEEDED",
    attempt,
    inputSetHash: hashArtifactInputs(input.inputArtifacts),
    inputArtifacts: uniqueRefs(input.inputArtifacts),
    outputArtifacts: uniqueRefs(input.outputArtifacts),
    issues: [...(input.issues ?? [])],
    decision: {
      code: input.decision.code,
      summary: input.decision.summary.slice(0, 500),
    },
    ...(input.failure ? {failure: input.failure} : {}),
  });
  const artifactRefs = [...input.outputArtifacts, ...(input.extraArtifacts ?? [])];
  return {
    phase: input.status === "FAILED" ? "production_revision" : "production",
    mediaStages: {[input.stage]: checkpoint},
    artifacts: Object.fromEntries(artifactRefs.map((ref) => [ref.artifactId, ref])),
    attempts: {[`media:${input.stage}`]: attempt},
    decisions: {
      [`media:${input.stage}`]: {
        code: input.decision.code,
        summary: input.decision.summary.slice(0, 500),
      },
    },
  };
};

const ensureRefs = (input: {repoRoot: string; episodeId: string; refs: readonly ArtifactRef[]; executionId: string}): void => {
  const refs = uniqueRefs(input.refs);
  if (refs.length === 0) return;
  ensureArtifactIndexForRefs({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    refs,
    executionId: input.executionId,
  });
};

const mediaStageReusable = (
  repoRoot: string,
  state: ProductionState,
  stage: MediaGraphStageName,
): boolean => {
  const checkpoint = state.mediaStages[stage];
  if (!checkpoint || (checkpoint.status !== "SUCCEEDED" && checkpoint.status !== "SKIPPED")) return false;
  const inputs = mediaInputsFor(state, stage);
  return (
    checkpoint.inputSetHash === hashArtifactInputs(inputs) &&
    checkpoint.inputArtifacts.every((ref) => artifactRefBytesMatch(repoRoot, ref)) &&
    checkpoint.outputArtifacts.every((ref) => artifactRefBytesMatch(repoRoot, ref)) &&
    checkpoint.outputArtifacts.every(
      (ref) => !artifactRefIsIndexed(repoRoot, ref) || currentRef(repoRoot, ref),
    )
  );
};

const pauseForMediaCapability = (input: {
  capability: string;
  state: ProductionState;
  inputArtifacts: readonly ArtifactRef[];
  expectedOutputPath: string;
  requiredContract: string;
  nextAction: string;
  extra?: Record<string, unknown>;
}): never => {
  const inputSetHash = hashArtifactInputs(input.inputArtifacts);
  pauseForExternalCapability({
    gate: "external-capability",
    stage: input.capability,
    capability: input.capability,
    episodeId: input.state.episodeId,
    runId: input.state.runId,
    threadId: input.state.episodeId,
    approvalEpoch: input.state.approvalEpoch,
    inputArtifacts: uniqueRefs(input.inputArtifacts),
    artifactRefs: uniqueRefs(input.inputArtifacts),
    inputSetHash,
    requiredContract: input.requiredContract,
    expectedOutputPath: input.expectedOutputPath,
    resumeCommand: `ORCHESTRATOR=langgraph pnpm orchestrate --episode ${input.state.episodeId} --run ${input.state.runId} --resume`,
    nextAction: input.nextAction,
    ...(input.extra ?? {}),
  });
  throw new Error(`EXTERNAL_CAPABILITY_UNRESOLVED:${input.capability}`);
};

const readScript = (repoRoot: string, episodeId: string) => {
  const filePath = repositoryFile(repoRoot, `content/${episodeId}/story/script.json`);
  if (!fs.existsSync(filePath)) throw new Error(`MEDIA_GRAPH_SCRIPT_MISSING:${episodeId}`);
  return scriptSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};

const nowString = (input: MediaLifecycleOptions): string =>
  (input.now ?? (() => new Date().toISOString()))();

const sourceManifestRef = (input: {
  repoRoot: string;
  state: ProductionState;
  now: string;
}): ArtifactRef =>
  refForFile({
    repoRoot: input.repoRoot,
    episodeId: input.state.episodeId,
    state: input.state,
    artifactId: `${input.state.episodeId}:media:source-manifest`,
    repositoryPath: mediaSourceManifestRepositoryPath(input.state.episodeId),
    mediaType: "application/json",
    schemaVersion: "media-source-manifest-v1",
    producer: "orchestrator:media-discovery",
    createdAt: input.now,
  });

const discoveryNode = (input: MediaLifecycleOptions): FoundationNode => (state) => {
  const now = nowString(input);
  const inputs = mediaInputsFor(state, "discovery");
  const manifestPath = mediaSourceManifestRepositoryPath(state.episodeId);
  const absoluteManifest = repositoryFile(input.repoRoot, manifestPath);
  if (!fs.existsSync(absoluteManifest)) {
    return pauseForMediaCapability({
      capability: "media-discovery",
      state,
      inputArtifacts: inputs,
      expectedOutputPath: manifestPath,
      requiredContract: "media-source-manifest-v1",
      nextAction: `Provide an admitted, rights-approved media-source-manifest-v1 at ${manifestPath}, register the current asset refs, then resume this run.`,
    });
  }
  const manifest = mediaSourceManifestSchema.parse(
    JSON.parse(fs.readFileSync(absoluteManifest, "utf8")) as unknown,
  );
  const manifestRef = sourceManifestRef({repoRoot: input.repoRoot, state, now});
  const outputs: ArtifactRef[] = [manifestRef];
  for (const asset of manifest.assets) {
    const source = getMediaSource(manifest, asset.mediaSourceId);
    if (!source || !isMediaSourceAdmitted(source) || !isMediaSourceRightsApproved(source)) {
      return pauseForMediaCapability({
        capability: "media-discovery-admission",
        state,
        inputArtifacts: [...inputs, manifestRef],
        expectedOutputPath: manifestPath,
        requiredContract: "media-source-manifest-v1",
        nextAction: `Complete the formal media admission and rights decision for ${asset.mediaId}, update the manifest without changing unrelated sources, then resume.`,
        extra: {mediaId: asset.mediaId, sourceId: asset.mediaSourceId},
      });
    }
    assertArtifactRefBytes(input.repoRoot, asset.artifactRef);
    if (!artifactRefIsIndexed(input.repoRoot, asset.artifactRef)) {
      return pauseForMediaCapability({
        capability: "media-discovery-registry",
        state,
        inputArtifacts: [...inputs, manifestRef, asset.artifactRef],
        expectedOutputPath: `content/${state.episodeId}/artifact-index.json`,
        requiredContract: "artifact-index-v1",
        nextAction: `Register and select the current asset ref ${asset.artifactRef.artifactId} in the episode artifact index, then resume.`,
        extra: {mediaId: asset.mediaId},
      });
    }
    outputs.push(asset.artifactRef);
    if (!asset.mediaType.startsWith("video/") && !asset.mediaType.startsWith("audio/")) continue;
    const status = readMediaUnderstandingStatus(input.repoRoot, state.episodeId, asset.mediaId);
    const clipStatus = status?.stages["clip-index"];
    const clipReady =
      Boolean(status) &&
      status!.mediaSha256 === asset.sha256 &&
      clipStatus?.availability === "available" &&
      Boolean(clipStatus.ref) &&
      currentRef(input.repoRoot, clipStatus.ref);
    if (!clipReady) {
      return pauseForMediaCapability({
        capability: "media-discovery-indexing",
        state,
        inputArtifacts: [...inputs, manifestRef, asset.artifactRef],
        expectedOutputPath: mediaClipIndexRepositoryPath(state.episodeId, asset.mediaId.slice(`${state.episodeId}:media:`.length)),
        requiredContract: "media-source-manifest-v1 + media-clip-index-v1 + media-understanding-status-v1",
        nextAction: `Run the bounded media indexing pipeline for ${asset.mediaId} and verify the current clip-index/status artifacts, then resume. Do not substitute a synthetic clip index.`,
        extra: {mediaId: asset.mediaId},
      });
    }
    readMediaClipIndex(input.repoRoot, state.episodeId, asset.mediaId);
    outputs.push(clipStatus!.ref!);
    const statusPath = mediaUnderstandingStatusRepositoryPath(
      state.episodeId,
      asset.mediaId.slice(`${state.episodeId}:media:`.length),
    );
    const statusFile = repositoryFile(input.repoRoot, statusPath);
    if (fs.existsSync(statusFile)) {
      outputs.push(
        refForFile({
          repoRoot: input.repoRoot,
          episodeId: state.episodeId,
          state,
          artifactId: `${state.episodeId}:media:understanding-status-${asset.mediaId.slice(`${state.episodeId}:media:`.length)}`,
          repositoryPath: statusPath,
          mediaType: "application/json",
          schemaVersion: "media-understanding-status-v1",
          producer: "orchestrator:media-discovery",
          createdAt: now,
        }),
      );
    }
  }
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: outputs,
    executionId: `${state.runId}:media:discovery`,
  });
  return checkpointUpdate({
    state,
    stage: "discovery",
    inputArtifacts: inputs,
    outputArtifacts: outputs,
    decision: {
      code: "MEDIA_DISCOVERY_READY",
      summary: `admitted ${manifest.sources.length} source(s) and discovered ${manifest.assets.length} asset(s)`,
    },
  });
};

const retrieveNode = (input: MediaLifecycleOptions): FoundationNode => async (state) => {
  const inputs = mediaInputsFor(state, "retrieve");
  const script = readScript(input.repoRoot, state.episodeId);
  const outputs: ArtifactRef[] = [];
  for (const segment of script.segments) {
    const outcome = await retrieveMediaCandidates({
      repoRoot: input.repoRoot,
      episodeId: state.episodeId,
      request: {
        schemaVersion: "media-retrieval-request-v1",
        episodeId: state.episodeId,
        segmentId: segment.id,
        claimIds: segment.claimIds,
        narration: segment.narration,
        visualIntent: segment.visualIntent,
        preferredMediaTypes: ["video", "audio"],
        topK: 3,
        durationTargetMs: Math.round(segment.targetSeconds * 1000),
      },
      cache: input.cache,
      runId: state.runId,
      traceId: `${state.episodeId}:run:${state.runId}`,
      now: input.now,
    });
    outputs.push(outcome.artifactRef);
  }
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: outputs,
    executionId: `${state.runId}:media:retrieve`,
  });
  return checkpointUpdate({
    state,
    stage: "retrieve",
    inputArtifacts: inputs,
    outputArtifacts: outputs,
    decision: {
      code: "MEDIA_RETRIEVAL_COMPLETED",
      summary: `retrieval completed for ${outputs.length} script segment(s)`,
    },
  });
};

const pendingResultPath = (error: unknown): string | undefined => {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("MEDIA_VERIFY_CODEX_RESULT_PENDING:")
    ? message.slice("MEDIA_VERIFY_CODEX_RESULT_PENDING:".length)
    : undefined;
};

const verifyNode = (input: MediaLifecycleOptions): FoundationNode => async (state) => {
  const inputs = mediaInputsFor(state, "verify");
  const script = readScript(input.repoRoot, state.episodeId);
  const retrievalRefs = outputRefsFor(state, "retrieve");
  const outputs: ArtifactRef[] = [];
  const verifiedClipIds = new Set<string>();
  const provider = input.verificationProvider ?? createCodexMediaVerificationProvider({repoRoot: input.repoRoot});
  for (const segment of script.segments) {
    const retrievalRef = retrievalRefs.find((ref) => ref.artifactId === `${state.episodeId}:media-retrieval:${segment.id}`);
    if (!retrievalRef) throw new Error(`MEDIA_GRAPH_RETRIEVAL_REF_MISSING:${segment.id}`);
    const retrieval = readMediaRetrievalResult(input.repoRoot, state.episodeId, segment.id);
    const candidate = retrieval.candidates[0];
    if (!candidate) continue;
    // A verification artifact is clip-scoped while retrieval candidates are
    // segment-scoped. If two segments choose the same clip, verify it once;
    // the later selection remains fail-closed until it has segment-scoped
    // evidence instead of creating a same-revision identity collision.
    if (verifiedClipIds.has(candidate.clipId)) continue;
    verifiedClipIds.add(candidate.clipId);
    const request = {
      schemaVersion: "media-verification-request-v1" as const,
      episodeId: state.episodeId,
      segmentId: segment.id,
      clipId: candidate.clipId,
      claimIds: segment.claimIds,
      narration: segment.narration,
      visualIntent: segment.visualIntent,
      retrievalResultRef: retrievalRef,
      maxKeyframes: 3,
    };
    try {
      const verificationPath = repositoryFile(
        input.repoRoot,
        mediaVerificationRepositoryPath(state.episodeId, segment.id, candidate.clipId),
      );
      if (fs.existsSync(verificationPath)) {
        const previous = readMediaVerification(input.repoRoot, state.episodeId, segment.id, candidate.clipId);
        if (previous.verdict === "pass" && previous.retrievalResultRef.sha256 === retrievalRef.sha256) {
          const rebound = rebindMediaVerification({
            repoRoot: input.repoRoot,
            episodeId: state.episodeId,
            request,
            executionId: `${state.runId}:media:verify:rebind:${segment.id}`,
            now: input.now,
          });
          outputs.push(rebound.artifactRef, rebound.clipArtifactRef);
          continue;
        }
      }
      const outcome = await verifyMediaClip({
        repoRoot: input.repoRoot,
        episodeId: state.episodeId,
        request,
        provider,
        cache: input.cache,
        shortClipExtractor: input.shortClipExtractor,
        runId: state.runId,
        traceId: `${state.episodeId}:run:${state.runId}`,
        now: input.now,
      });
      outputs.push(outcome.artifactRef, outcome.clipArtifactRef);
    } catch (error) {
      const resultPath = pendingResultPath(error);
      if (!resultPath) throw error;
      pauseForMediaCapability({
        capability: "media-verification",
        state,
        inputArtifacts: [...inputs, retrievalRef, candidate.mediaRef, candidate.indexRef],
        expectedOutputPath: resultPath,
        requiredContract: "codex-media-verification-result-v1",
        nextAction: `Inspect only the bounded short clip and keyframes named by the Codex request, write the hash-bound result JSON at ${resultPath}, then resume. Do not edit rights or claim facts.`,
        extra: {segmentId: segment.id, clipId: candidate.clipId},
      });
    }
  }
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: outputs,
    executionId: `${state.runId}:media:verify`,
  });
  return checkpointUpdate({
    state,
    stage: "verify",
    inputArtifacts: inputs,
    outputArtifacts: outputs.length > 0 ? outputs : [state.contentManifestRef!],
    decision: {
      code: "MEDIA_VERIFICATION_COMPLETED",
      summary: `verified ${outputs.filter((ref) => ref.artifactId.includes(":media-verification:")).length} candidate clip(s); unrepresented segments remain fallback-only`,
    },
  });
};

const selectNode = (input: MediaLifecycleOptions): FoundationNode => async (state) => {
  const inputs = mediaInputsFor(state, "select");
  const script = readScript(input.repoRoot, state.episodeId);
  const retrievalRefs = outputRefsFor(state, "retrieve");
  const outputs: ArtifactRef[] = [];
  for (const segment of script.segments) {
    const retrievalRef = retrievalRefs.find((ref) => ref.artifactId === `${state.episodeId}:media-retrieval:${segment.id}`);
    const outcome = await selectVisualSlotForSegment({
      repoRoot: input.repoRoot,
      episodeId: state.episodeId,
      segment: {
        segmentId: segment.id,
        claimIds: segment.claimIds,
        narration: segment.narration,
        visualIntent: segment.visualIntent,
        durationTargetMs: Math.round(segment.targetSeconds * 1000),
      },
      ...(retrievalRef ? {retrievalResultRef: retrievalRef} : {}),
      runId: state.runId,
      traceId: `${state.episodeId}:run:${state.runId}`,
      now: input.now,
    });
    outputs.push(outcome.artifactRef);
  }
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: outputs,
    executionId: `${state.runId}:media:select`,
  });
  return checkpointUpdate({
    state,
    stage: "select",
    inputArtifacts: inputs,
    outputArtifacts: outputs,
    decision: {
      code: "MEDIA_VISUAL_SELECTION_COMPLETED",
      summary: `selected a visual slot for ${outputs.length} script segment(s)`,
    },
  });
};

const renderPlanNode = (input: MediaLifecycleOptions): FoundationNode => (state) => {
  const inputs = mediaInputsFor(state, "render-plan");
  const planArtifactId = `${state.episodeId}:media:render-plan`;
  const planRepositoryPath = mediaRenderPlanRepositoryPath(state.episodeId);
  const previousPlan =
    state.mediaStages["render-plan"]?.outputArtifacts.find(
      (ref) => ref.artifactId === planArtifactId && currentRef(input.repoRoot, ref),
    ) ??
    indexedRefFor(input.repoRoot, state.episodeId, planArtifactId, planRepositoryPath);
  if (previousPlan) {
    snapshotSelectedArtifactHistory({
      repoRoot: input.repoRoot,
      episodeId: state.episodeId,
      refs: [previousPlan],
    });
  }
  const plan = buildMediaRenderPlanForTimeline({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    ...(previousPlan ? {previousArtifactRef: previousPlan} : {}),
    cache: input.cache,
    proxyExtractor: input.proxyExtractor,
    runId: state.runId,
    traceId: `${state.episodeId}:run:${state.runId}`,
    now: input.now,
  });
  assertMediaRenderPlanRenderable({repoRoot: input.repoRoot, episodeId: state.episodeId});
  const planRef = refForFile({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    state,
    artifactId: planArtifactId,
    repositoryPath: planRepositoryPath,
    mediaType: "application/json",
    schemaVersion: "media-render-plan-v1",
    producer: "media-render-v1",
    createdAt: plan.createdAt,
    ...(previousPlan ? {previous: previousPlan} : {}),
  });
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: [planRef],
    executionId: `${state.runId}:media:render-plan`,
  });
  return checkpointUpdate({
    state,
    stage: "render-plan",
    inputArtifacts: inputs,
    outputArtifacts: [planRef],
    decision: {
      code: "MEDIA_RENDER_PLAN_READY",
      summary: `render plan bound to timeline ${plan.timelineSha256}`,
    },
  });
};

const preRenderNode = (input: MediaLifecycleOptions): FoundationNode => (state) => {
  const preRenderPaths = [
    `content/${state.episodeId}/story/script.json`,
    `content/${state.episodeId}/story/caption-plan.json`,
    generatedCaptionsPath(state.episodeId),
    `content/${state.episodeId}/production/timeline.json`,
    `output/${state.episodeId}/subtitles_zh.srt`,
  ];
  const canonicalRefs = preRenderPaths.flatMap((repositoryPath) => {
    const existing = findStateRef(state, (ref) => ref.path === repositoryPath);
    if (existing) return [existing];
    if (!fs.existsSync(repositoryFile(input.repoRoot, repositoryPath))) return [];
    const leaf = repositoryPath.split("/").at(-1)?.replace(/\.[^.]+$/u, "") ?? "artifact";
    return [
      refForFile({
        repoRoot: input.repoRoot,
        episodeId: state.episodeId,
        state,
        artifactId: `${state.episodeId}:production:pre-render-input-${leaf}`,
        repositoryPath,
        mediaType: repositoryPath.endsWith(".srt") ? "application/x-subrip" : "application/json",
        schemaVersion: "pre-render-input-v1",
        producer: "orchestrator:pre-render-gate",
        createdAt: nowString(input),
      }),
    ];
  });
  const inputs = uniqueRefs([...mediaInputsFor(state, "pre-render"), ...canonicalRefs]);
  const gate = runPreRenderGate({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    inputArtifacts: inputs,
    now: input.now,
  });
  const repositoryPath = `content/${state.episodeId}/production/pre-render-gate.json`;
  const previousGate = findStateRef(state, (ref) => ref.path === repositoryPath);
  if (previousGate) {
    snapshotSelectedArtifactHistory({
      repoRoot: input.repoRoot,
      episodeId: state.episodeId,
      refs: [previousGate],
    });
  }
  const absolute = repositoryFile(input.repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  const gateRef = refForFile({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    state,
    artifactId: `${state.episodeId}:production:pre-render-gate`,
    repositoryPath,
    mediaType: "application/json",
    schemaVersion: PRE_RENDER_GATE_SCHEMA_VERSION,
    producer: "orchestrator:pre-render-gate",
    createdAt: gate.checkedAt,
  });
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: [gateRef],
    executionId: `${state.runId}:media:pre-render`,
  });
  if (gate.verdict === "PASS") {
    return checkpointUpdate({
      state,
      stage: "pre-render",
      inputArtifacts: inputs,
      outputArtifacts: [gateRef],
      extraArtifacts: canonicalRefs,
      decision: {code: "PRE_RENDER_GATE_PASSED", summary: "pre-render contract gates passed"},
    });
  }
  const issue = makeIssue({
    issueId: `${state.episodeId}:pre-render:${gate.inputSetHash.slice(0, 12)}`,
    category: gate.returnTo === "captions" ? "delivery.caption-timing" : "delivery.timeline",
    returnTo: gate.returnTo,
    restartAt: gate.returnTo === "content" ? "content-approval" : "timeline",
    summary: gate.blockers.join("; ") || "pre-render gate rejected the current production inputs",
  });
  return checkpointUpdate({
    state,
    stage: "pre-render",
    inputArtifacts: inputs,
    outputArtifacts: [],
    extraArtifacts: [gateRef, ...canonicalRefs],
    status: "FAILED",
    issues: [issue],
    decision: {code: "PRE_RENDER_GATE_REJECTED", summary: issue.summary},
    failure: {
      code: "PRE_RENDER_GATE_REJECTED",
      retryable: false,
      detail: issue.summary,
    },
  });
};

const preRenderRepairNode = (): FoundationNode => (state) => {
  const checkpoint = state.mediaStages["pre-render"];
  const issue = checkpoint?.issues[0];
  if (!issue) return {phase: "halted", haltReason: "MEDIA_PRE_RENDER_ISSUE_MISSING"};
  if (issue.returnTo === "content") {
    return {
      phase: "halted",
      productionRepair: {
        ...state.productionRepair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds: [issue.issueId],
        decision: {
          code: "MEDIA_PRE_RENDER_CONTENT_BOUNDARY",
          summary: "pre-render detected a content mismatch; human content review is required",
        },
      },
      haltReason: "MEDIA_PRE_RENDER_CONTENT_BOUNDARY",
    };
  }
  if (state.productionRepair.round >= state.productionRepair.maxRounds) {
    return {
      phase: "halted",
      productionRepair: {
        ...state.productionRepair,
        status: "human-escalation",
        route: null,
        forceRerunStage: null,
        issueIds: [issue.issueId],
        decision: {
          code: "MEDIA_PRE_RENDER_REPAIR_BUDGET_EXHAUSTED",
          summary: "pre-render repair budget is exhausted",
        },
      },
      haltReason: "MEDIA_PRE_RENDER_REPAIR_BUDGET_EXHAUSTED",
    };
  }
  const routeTarget = issue.returnTo === "captions" ? "captions" : "timeline";
  const restartAt = "timeline" as const;
  const authorizedArtifactIds = new Set<string>();
  for (const stage of productionStageOrder.slice(productionStageOrder.indexOf(restartAt))) {
    for (const ref of state.productionStages[stage]?.outputArtifacts ?? []) authorizedArtifactIds.add(ref.artifactId);
  }
  const nextRound = state.productionRepair.round + 1;
  return {
    phase: "production_revision",
    productionRepair: {
      ...state.productionRepair,
      status: "repairing",
      round: nextRound,
      route: {
        ownerAgent: "production-executor",
        routeTarget,
        restartAt,
        reasonCode: "delivery.caption-timing",
        issueIds: [issue.issueId],
      },
      forceRerunStage: restartAt,
      issueIds: [issue.issueId],
      authorizedArtifactIds: [...authorizedArtifactIds].sort(),
      staleArtifactIds: [],
      decision: {
        code: "MEDIA_PRE_RENDER_REPAIR_ROUTED",
        summary: `production-executor/${routeTarget} reruns from timeline`,
      },
    },
    budget: {
      ...state.budget,
      roundsUsed: {
        ...state.budget.roundsUsed,
        production: nextRound,
        "production-executor": nextRound,
      },
    },
  } satisfies ProductionStateUpdate;
};

const pickPackageRef = (state: ProductionState): ArtifactRef | undefined =>
  findStateRef(state, (ref) => ref.artifactId === `${state.episodeId}:media:render-plan`);

const deliveryPackageFor = (input: MediaLifecycleOptions, state: ProductionState): {package: DeliveryCriticReviewPackage; ref: ArtifactRef} => {
  const now = nowString(input);
  const episodeId = state.episodeId;
  const requireRef = (repositoryPath: string, label: string): ArtifactRef => {
    const ref = findStateRef(state, (candidate) => candidate.path === repositoryPath);
    if (!ref || !artifactRefBytesMatch(input.repoRoot, ref)) throw new Error(`MEDIA_DELIVERY_CRITIC_${label}_MISSING`);
    return ref;
  };
  const video = requireRef(`output/${episodeId}/vertical_9x16.mp4`, "VIDEO");
  const subtitles = requireRef(`output/${episodeId}/subtitles_zh.srt`, "SUBTITLES");
  const timeline = requireRef(`content/${episodeId}/production/timeline.json`, "TIMELINE");
  const inspection = requireRef(`output/${episodeId}/inspection.json`, "INSPECTION");
  const ttsMetadata = findStateRef(state, (ref) => ref.path === `content/${episodeId}/production/tts-metadata.json`) ?? null;
  const plan = pickPackageRef(state) ?? null;
  const preRenderGate = findStateRef(state, (ref) => ref.path === `content/${episodeId}/production/pre-render-gate.json`) ?? null;
  const keyframes: ArtifactRef[] = [];
  try {
    const manifest = readMediaSourceManifest(input.repoRoot, episodeId);
    for (const asset of manifest.assets) {
      const status = readMediaUnderstandingStatus(input.repoRoot, episodeId, asset.mediaId);
      for (const entry of status?.stages.keyframes?.entries ?? []) {
        if (artifactRefBytesMatch(input.repoRoot, entry.ref)) keyframes.push(entry.ref);
      }
    }
  } catch {
    // The package remains bounded; any missing optional keyframe is represented by
    // the current clip/plan refs and cannot make the external reviewer see more media.
  }
  const clips = successfulMediaRefs(state, ["verify"]).filter((ref) =>
    ref.artifactId.includes(":media-verification-clip:"),
  );
  const inputArtifacts = uniqueRefs([
    ...mediaInputsFor(state, "delivery-critic"),
    video,
    subtitles,
    timeline,
    inspection,
    ...(ttsMetadata ? [ttsMetadata] : []),
    ...(plan ? [plan] : []),
    ...(preRenderGate ? [preRenderGate] : []),
    ...keyframes,
    ...clips,
  ]);
  for (const artifact of inputArtifacts) {
    assertArtifactRefBytes(input.repoRoot, artifact);
  }
  const inputSetHash = hashArtifactInputs(inputArtifacts);
  let createdAt = now;
  const previousPackageRef = findStateRef(
    state,
    (candidate) => candidate.artifactId === `${episodeId}:delivery:critic-review-package`,
  );
  let previousPackage: DeliveryCriticReviewPackage | undefined;
  try {
    previousPackage = readDeliveryCriticReviewPackage(input.repoRoot, episodeId, state.runId);
    if (previousPackage.inputSetHash === inputSetHash) createdAt = previousPackage.createdAt;
  } catch {
    // A missing or malformed prior package is replaced by the current bounded package.
  }
  const packageBody = {
    schemaVersion: "delivery-critic-review-package-v1" as const,
    packageId: `${episodeId}:delivery:critic-review-package`,
    episodeId,
    runId: state.runId,
    boundedMediaOnly: true as const,
    inputSetHash,
    inputArtifacts,
    reviewedVideo: video,
    reviewedSubtitles: subtitles,
    reviewedTimeline: timeline,
    inspection,
    ttsMetadata,
    renderPlan: plan,
    preRenderGate,
    reviewedKeyframes: uniqueRefs(keyframes),
    reviewedClips: uniqueRefs(clips),
    createdAt,
  } satisfies DeliveryCriticReviewPackage;
  if (previousPackageRef && previousPackage?.inputSetHash !== inputSetHash) {
    snapshotSelectedArtifactHistory({
      repoRoot: input.repoRoot,
      episodeId,
      refs: [previousPackageRef],
    });
  }
  const ref = writeDeliveryCriticReviewPackage({
    repoRoot: input.repoRoot,
    episodeId,
    runId: state.runId,
    package: packageBody,
    ...(previousPackageRef ? {previous: previousPackageRef} : {}),
  });
  return {package: packageBody, ref};
};

const effectiveGate = (input: MediaLifecycleOptions, state: ProductionState, result: DeliveryCriticResult) => {
  if (
    input.env?.GRAPH_CANARY_FAULT === "delivery-caption-cue" &&
    state.mediaStages["delivery-critic"]?.decision.code !== "GRAPH_CANARY_FAULT_INJECTED"
  ) {
    return {
      ...result.deliveryGate,
      blockers: ["GRAPH_CANARY_FAULT:delivery-caption-cue"],
      verdict: "REJECT" as const,
      returnTo: "captions" as const,
    };
  }
  return result.deliveryGate;
};

const deliveryCriticNode = (input: MediaLifecycleOptions): FoundationNode => (state) => {
  const inputs = mediaInputsFor(state, "delivery-critic");
  const prepared = deliveryPackageFor(input, state);
  const resultAttempt = (state.mediaStages["delivery-critic"]?.attempt ?? 0) + 1;
  const resultPath = deliveryCriticResultPath(state.episodeId, state.runId, resultAttempt);
  const resultFile = repositoryFile(input.repoRoot, resultPath);
  if (!fs.existsSync(resultFile)) {
    return pauseForMediaCapability({
      capability: "media-delivery-critic",
      state,
      inputArtifacts: [...inputs, prepared.ref],
      expectedOutputPath: resultPath,
      requiredContract: "delivery-critic-result-v1",
      nextAction: `Inspect the bounded review package at ${deliveryCriticReviewPackagePath(state.episodeId, state.runId)}, write a package/hash-bound delivery-critic-result-v1 at ${resultPath}, then resume.`,
      extra: {packagePath: deliveryCriticReviewPackagePath(state.episodeId, state.runId)},
    });
  }
  let validated: DeliveryCriticResult;
  try {
    const result = readDeliveryCriticResult(input.repoRoot, state.episodeId, state.runId, resultAttempt);
    const packageFromDisk = readDeliveryCriticReviewPackage(input.repoRoot, state.episodeId, state.runId);
    validated = validateDeliveryCriticResult({
      repoRoot: input.repoRoot,
      episodeId: state.episodeId,
      runId: state.runId,
      threadId: state.episodeId,
      packageRef: prepared.ref,
      package: packageFromDisk,
      result,
    });
  } catch (error) {
    return pauseForMediaCapability({
      capability: "media-delivery-critic",
      state,
      inputArtifacts: [...inputs, prepared.ref],
      expectedOutputPath: resultPath,
      requiredContract: "delivery-critic-result-v1",
      nextAction: `The existing Delivery Critic result is missing, malformed, stale, or hash-bound to an older package. Re-inspect ${deliveryCriticReviewPackagePath(state.episodeId, state.runId)}, replace only the result JSON at ${resultPath}, then resume.`,
      extra: {
        packagePath: deliveryCriticReviewPackagePath(state.episodeId, state.runId),
        validationError: error instanceof Error ? error.message : String(error),
      },
    });
  }
  const gate = effectiveGate(input, state, validated);
  const reportPath = `content/${state.episodeId}/production/delivery-critic-report.md`;
  const reportAbsolute = repositoryFile(input.repoRoot, reportPath);
  const previousReport = findStateRef(state, (ref) => ref.path === reportPath);
  if (previousReport) {
    snapshotSelectedArtifactHistory({
      repoRoot: input.repoRoot,
      episodeId: state.episodeId,
      refs: [previousReport],
    });
  }
  fs.mkdirSync(path.dirname(reportAbsolute), {recursive: true});
  fs.writeFileSync(reportAbsolute, deliveryCriticReportMarkdown(gate), "utf8");
  const reportRef = refForFile({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    state,
    artifactId: `${state.episodeId}:delivery:critic-report`,
    repositoryPath: reportPath,
    mediaType: "text/markdown",
    schemaVersion: "delivery-critic-report-v1",
    producer: "orchestrator:media-delivery-critic",
    createdAt: validated.completedAt,
  });
  const resultRef = refForFile({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    state,
    artifactId: `${state.episodeId}:delivery:critic-result`,
    repositoryPath: resultPath,
    mediaType: "application/json",
    schemaVersion: "delivery-critic-result-v1",
    producer: "external:delivery-critic",
    createdAt: validated.completedAt,
  });
  ensureRefs({
    repoRoot: input.repoRoot,
    episodeId: state.episodeId,
    refs: [prepared.ref, reportRef, resultRef],
    executionId: `${state.runId}:media:delivery-critic`,
  });
  const faultInjected = gate !== validated.deliveryGate;
  const mediaRoute = validated.issues.find((issue) => issue.returnTo.startsWith("media-"))?.returnTo;
  const mediaIssues: MediaGraphIssueSummary[] = validated.issues
    .filter((issue) => issue.returnTo.startsWith("media-"))
    .map((issue) => ({
      issueId: issue.issueId,
      category: issue.category,
      severity: issue.severity,
      owner: issue.owner,
      locator: issue.locator,
      returnTo: issue.returnTo as MediaGraphIssueSummary["returnTo"],
      restartAt: issue.returnTo,
      summary: issue.summary,
    }));
  if (faultInjected) {
    mediaIssues.push(
      makeIssue({
        issueId: `${state.episodeId}:delivery:canary-caption-cue`,
        category: "delivery.caption-timing",
        returnTo: "captions",
        restartAt: "timeline",
        summary: "controlled canary fault rejected one delivery caption cue",
      }),
    );
  }
  const decisionCode = faultInjected
    ? "GRAPH_CANARY_FAULT_INJECTED"
    : validated.verdict === "PASS"
      ? "DELIVERY_CRITIC_PASS"
      : mediaRoute
        ? `DELIVERY_CRITIC_REJECTED_${mediaRoute}`
        : "DELIVERY_CRITIC_REJECTED";
  const update = checkpointUpdate({
    state,
    stage: "delivery-critic",
    inputArtifacts: inputs,
    outputArtifacts: [prepared.ref, reportRef, resultRef],
    issues: mediaIssues,
    decision: {
      code: decisionCode,
      summary:
        validated.verdict === "PASS"
          ? "external Delivery Critic passed the bounded package"
          : `external Delivery Critic rejected the package; returnTo=${gate.returnTo}`,
    },
  });
  return update;
};

const deliveryResultRoute = (state: ProductionState): ProductionGraphDestination | undefined => {
  const code = state.mediaStages["delivery-critic"]?.decision.code ?? "";
  const mediaRoute = code.match(/^DELIVERY_CRITIC_REJECTED_(media-.+)$/u)?.[1] as
    | MediaGraphIssueSummary["returnTo"]
    | undefined;
  if (!mediaRoute) return undefined;
  const target = Object.entries(mediaStageDestination).find(([stage]) => `media-${stage}` === mediaRoute)?.[1];
  return target;
};

export const createMediaLifecycle = (input: MediaLifecycleOptions): MediaLifecycleNodes | undefined => {
  if (input.enabled === false) return undefined;
  const enabled =
    input.enabled ??
    (input.episodeId
      ? fs.existsSync(repositoryFile(input.repoRoot, mediaSourceManifestRepositoryPath(input.episodeId)))
      : false);
  // The default decision is made by the entrypoint with the real episode id.
  // Direct callers can force the lifecycle with enabled:true.
  if (!enabled) return undefined;
  const nodes: MediaLifecycleNodes["nodes"] = {
    discovery: discoveryNode(input),
    retrieve: retrieveNode(input),
    verify: verifyNode(input),
    select: selectNode(input),
    "render-plan": renderPlanNode(input),
    "pre-render": preRenderNode(input),
    "pre-render-repair": preRenderRepairNode(),
    "delivery-critic": deliveryCriticNode(input),
  };
  const chooseStart = (state: ProductionState): ProductionGraphDestination => {
    const first = mediaGraphStageNames.find((stage) => !mediaStageReusable(input.repoRoot, state, stage));
    return first ? mediaStageDestination[first] : "production_ready";
  };
  const afterProductionStage = (
    state: ProductionState,
    stage: ProductionStageName,
  ): ProductionGraphDestination => {
    if (stage === "timeline") {
      const mediaStart = chooseStart(state);
      if (mediaStart !== "production_ready") return mediaStart;
      return "render:smoke";
    }
    if (stage === "inspect:output") return "media_delivery_critic";
    if (stage === "validate:delivery") return "production_ready";
    const index = productionStageOrder.indexOf(stage);
    return productionStageOrder[index + 1] ?? "production_ready";
  };
  const afterMediaStage = (
    state: ProductionState,
    stage: MediaGraphStageName,
  ): ProductionGraphDestination => {
    if (stage === "pre-render" && state.mediaStages[stage]?.status === "FAILED") {
      return "media_pre_render_repair";
    }
    if (stage === "delivery-critic") {
      return deliveryResultRoute(state) ?? "validate:delivery";
    }
    if (stage === "select") return "media_render_plan";
    if (stage === "render-plan") return "media_pre_render";
    if (stage === "pre-render") return "render:smoke";
    return mediaStageDestination[mediaGraphStageNames[mediaGraphStageNames.indexOf(stage) + 1] ?? "delivery-critic"];
  };
  return {nodes, chooseStart, afterProductionStage, afterMediaStage};
};

export const mediaProductionInputArtifacts = mediaInputsForProductionStage;
