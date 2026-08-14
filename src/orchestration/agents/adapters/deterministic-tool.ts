import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {episodeConfigSchema, scriptSchema} from "../../../schemas/episode";
import {
  generatedCaptionsPath,
  generatedTimelinePath,
  getRenderContract,
} from "../../../lib/render-contract";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  markStaleTransitively,
  readArtifactIndex,
  registerCandidate,
  selectArtifact,
  writeArtifactIndex,
} from "../../artifact-registry";
import {contentManifestSchema, type ContentManifest} from "../../schemas/freeze-manifest";
import {
  productionStageCheckpointSchema,
  productionIssueDraftSchema,
  productionIssueSchema,
  productionStageReceiptSchema,
  productionStageRequestSchema,
  productionStageResultSchema,
  type ProductionStageCheckpoint,
  type ProductionIssue,
  type ProductionIssueDraft,
  type ProductionStageName,
  type ProductionStageReceipt,
  type ProductionStageRequest,
  type ProductionStageResult,
} from "../../schemas/production";
import type {ArtifactDependency, ArtifactIndex, ArtifactRef} from "../../schemas/artifact";
import {stableJson, stableJsonEqual} from "../../stable-json";
import {parseDeliveryGate} from "../../../lib/delivery";

type OutputDeclaration = {
  artifactId: string;
  path: string;
  mediaType: string;
  schemaVersion: string;
};

type StageDefinition = {
  script: string;
  args: (episodeId: string) => string[];
  outputs: (repoRoot: string, episodeId: string) => OutputDeclaration[];
};

export type DeterministicToolRunInput = {
  stage: ProductionStageName;
  scriptPath: string;
  args: string[];
  cwd: string;
  episodeId: string;
  environment?: Record<string, string>;
};

export type DeterministicToolRunResult = {
  stdout: string;
  stderr: string;
};

export type DeterministicToolRunner = (
  input: DeterministicToolRunInput,
) => DeterministicToolRunResult | Promise<DeterministicToolRunResult>;

export type ProductionWorkspace = {
  root: string;
  dispose: () => void;
};

export type ProductionWorkspaceFactory = (input: {
  repoRoot: string;
  episodeId: string;
  stage: ProductionStageName;
}) => ProductionWorkspace;

export type DeterministicToolAdapterOptions = {
  repoRoot: string;
  runTool?: DeterministicToolRunner;
  createWorkspace?: ProductionWorkspaceFactory;
  createdAt?: () => string;
  fixedStage?: ProductionStageName;
  /** Fine-grained caches are enabled for the real deterministic runner by default. */
  enableFineGrainedCache?: boolean;
  cacheRoot?: string;
};

export type ProductionStageAdapter = (
  request: ProductionStageRequest,
) => Promise<ProductionStageResult>;

const stageDefinitions: Readonly<Record<ProductionStageName, StageDefinition>> = {
  "materialize:story": {
    script: "scripts/materialize-story.ts",
    args: () => [],
    outputs: (_repoRoot, episodeId) => [
      {
        artifactId: `${episodeId}:story:script`,
        path: `content/${episodeId}/story/script.json`,
        mediaType: "application/json",
        schemaVersion: "script-v1",
      },
      {
        artifactId: `${episodeId}:story:narration`,
        path: `content/${episodeId}/story/narration.txt`,
        mediaType: "text/plain",
        schemaVersion: "narration-v1",
      },
    ],
  },
  "validate:content": {
    script: "scripts/validate-content.ts",
    args: () => [],
    outputs: () => [],
  },
  capture: {
    script: "scripts/capture-assets.ts",
    args: () => [],
    outputs: (repoRoot, episodeId) => {
      const config = episodeConfigSchema.parse(
        readJsonFile(path.join(repoRoot, `content/${episodeId}/episode.config.json`)),
      );
      return config.captureAssets.map((asset) => ({
        artifactId: `${episodeId}:production:capture-${asset.file.replace(/\.png$/u, "")}`,
        path: `public/episodes/${episodeId}/captured/${asset.file}`,
        mediaType: "image/png",
        schemaVersion: "capture-png-v1",
      }));
    },
  },
  tts: {
    script: "scripts/generate-tts.ts",
    args: () => [],
    outputs: (repoRoot, episodeId) => {
      const script = scriptSchema.parse(
        readJsonFile(path.join(repoRoot, `content/${episodeId}/story/script.json`)),
      );
      return [
        ...script.segments.map((segment) => ({
          artifactId: `${episodeId}:production:audio-${segment.id}`,
          path: `public/episodes/${episodeId}/audio/${segment.id}.mp3`,
          mediaType: "audio/mpeg",
          schemaVersion: "audio-mp3-v1",
        })),
        {
          artifactId: `${episodeId}:production:tts-metadata`,
          path: `content/${episodeId}/production/tts-metadata.json`,
          mediaType: "application/json",
          schemaVersion: "tts-metadata-v1",
        },
      ];
    },
  },
  timeline: {
    script: "scripts/build-timeline.ts",
    args: () => [],
    outputs: (_repoRoot, episodeId) => [
      {
        artifactId: `${episodeId}:production:timeline`,
        path: `content/${episodeId}/production/timeline.json`,
        mediaType: "application/json",
        schemaVersion: "timeline-v1",
      },
      {
        artifactId: `${episodeId}:production:generated-timeline`,
        path: generatedTimelinePath(episodeId),
        mediaType: "application/json",
        schemaVersion: "generated-timeline-v1",
      },
      {
        artifactId: `${episodeId}:production:generated-captions`,
        path: generatedCaptionsPath(episodeId),
        mediaType: "application/json",
        schemaVersion: "generated-captions-v1",
      },
      {
        artifactId: `${episodeId}:delivery:subtitles`,
        path: `output/${episodeId}/subtitles_zh.srt`,
        mediaType: "application/x-subrip",
        schemaVersion: "subtitles-srt-v1",
      },
    ],
  },
  "render:smoke": {
    script: "scripts/render.ts",
    args: () => ["smoke"],
    outputs: (_repoRoot, episodeId) => {
      getRenderContract(episodeId);
      return [
        {
          artifactId: `${episodeId}:delivery:smoke-video`,
          path: `output/${episodeId}/smoke_9x16.mp4`,
          mediaType: "video/mp4",
          schemaVersion: "video-smoke-v1",
        },
      ];
    },
  },
  "render:vertical": {
    script: "scripts/render.ts",
    args: () => ["vertical"],
    outputs: (_repoRoot, episodeId) => {
      getRenderContract(episodeId);
      return [
        {
          artifactId: `${episodeId}:delivery:vertical-video`,
          path: `output/${episodeId}/vertical_9x16.mp4`,
          mediaType: "video/mp4",
          schemaVersion: "video-vertical-v1",
        },
      ];
    },
  },
  "inspect:output": {
    script: "scripts/inspect-output.ts",
    args: () => [],
    outputs: (_repoRoot, episodeId) => [
      {
        artifactId: `${episodeId}:delivery:inspection`,
        path: `output/${episodeId}/inspection.json`,
        mediaType: "application/json",
        schemaVersion: "inspection-v1",
      },
    ],
  },
  "validate:delivery": {
    script: "scripts/validate-delivery.ts",
    args: () => [],
    outputs: () => [],
  },
};

const sha256 = (bytes: Buffer): string => crypto.createHash("sha256").update(bytes).digest("hex");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const boundedText = (value: string, maxBytes = 500): string => {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let output = value;
  while (Buffer.byteLength(output, "utf8") > maxBytes - 3) output = output.slice(0, -1);
  return `${output}...`;
};

const stageSlug = (stage: ProductionStageName): string => stage.replaceAll(":", "-");

const receiptDeclaration = (episodeId: string, stage: ProductionStageName): OutputDeclaration => ({
  artifactId: `${episodeId}:production:receipt-${stageSlug(stage)}`,
  path: `content/${episodeId}/production/adapter-receipts/${stageSlug(stage)}.json`,
  mediaType: "application/json",
  schemaVersion: "production-stage-receipt-v1",
});

const readJsonFile = (filePath: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`cannot read JSON artifact ${filePath}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
};

const resolveRepositoryPath = (repoRoot: string, repositoryPath: string): string => {
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(path.resolve(repoRoot), absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`repository path escapes root: ${repositoryPath}`);
  }
  return absolutePath;
};

const assertCurrentBytes = (repoRoot: string, ref: ArtifactRef, label: string): Buffer => {
  const filePath = resolveRepositoryPath(repoRoot, ref.path);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`${label} is missing: ${ref.path}`, {cause: error});
  }
  if (bytes.byteLength !== ref.sizeBytes || sha256(bytes) !== ref.sha256) {
    throw new Error(`${label} hash mismatch: ${ref.artifactId}`);
  }
  return bytes;
};

const readFrozenManifest = (repoRoot: string, ref: ArtifactRef): ContentManifest => {
  const bytes = assertCurrentBytes(repoRoot, ref, "content manifest");
  const manifest = contentManifestSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (manifest.episodeId !== ref.episodeId) {
    throw new Error("content manifest episode does not match its ArtifactRef");
  }
  for (const artifact of manifest.artifacts) {
    assertCurrentBytes(repoRoot, artifact, `frozen artifact ${artifact.artifactId}`);
  }
  return manifest;
};

const dedupeArtifactRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] => {
  const byId = new Map<string, ArtifactRef>();
  for (const ref of refs) {
    const previous = byId.get(ref.artifactId);
    if (previous && (previous.sha256 !== ref.sha256 || previous.revision !== ref.revision)) {
      throw new Error(`artifact input collision: ${ref.artifactId}`);
    }
    byId.set(ref.artifactId, previous ?? ref);
  }
  return [...byId.values()].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
};

const inputSetHash = (stage: ProductionStageName, refs: readonly ArtifactRef[]): string =>
  crypto
    .createHash("sha256")
    .update(
      stableJson({
        stage,
        artifacts: dedupeArtifactRefs(refs).map((ref) => ({
          artifactId: ref.artifactId,
          revision: ref.revision,
          sha256: ref.sha256,
          path: ref.path,
        })),
      }),
    )
    .digest("hex");

export const productionStageInputSetHash = inputSetHash;

const deliveryRouteTargets = ["captions", "timeline", "tts", "render"] as const;
type DeliveryRouteTarget = (typeof deliveryRouteTargets)[number];

const deliveryRouteTarget = (value: string): DeliveryRouteTarget | undefined =>
  deliveryRouteTargets.includes(value as DeliveryRouteTarget)
    ? (value as DeliveryRouteTarget)
    : undefined;

const categoryForDeliveryFailure = (input: {
  routeTarget: DeliveryRouteTarget;
  blocker: string;
  metrics: {
    captionWordBreaks: number;
    englishWordBreaks: number;
  };
}): ProductionIssueDraft["category"] => {
  const blocker = input.blocker.toLowerCase();
  if (input.routeTarget === "captions") {
    return input.metrics.captionWordBreaks > 0 || input.metrics.englishWordBreaks > 0
      ? "delivery.caption-split"
      : "delivery.caption-timing";
  }
  if (input.routeTarget === "timeline") {
    if (/时长|duration|micro|cue|时间/u.test(blocker)) return "delivery.caption-timing";
    return "delivery.timeline";
  }
  if (input.routeTarget === "tts") {
    return /时长|duration/u.test(blocker) ? "delivery.duration-audio" : "delivery.audio";
  }
  if (/时长|duration/u.test(blocker)) return "delivery.duration-render";
  if (/格式|format|分辨率|帧率|orientation|1080|1920|30\s*fps/u.test(blocker)) {
    return "delivery.format";
  }
  if (/来源|截图|证据|asset|manifest|readab|可辨|安全区/u.test(blocker)) {
    return "delivery.evidence-readability";
  }
  return "delivery.render";
};

const artifactForDeliveryTarget = (input: {
  routeTarget: DeliveryRouteTarget;
  episodeId: string;
  refs: readonly ArtifactRef[];
}): ArtifactRef | undefined => {
  const paths: Record<DeliveryRouteTarget, string[]> = {
    captions: [`output/${input.episodeId}/subtitles_zh.srt`],
    timeline: [`content/${input.episodeId}/production/timeline.json`],
    tts: [
      `content/${input.episodeId}/production/tts-metadata.json`,
      `public/episodes/${input.episodeId}/audio/`,
    ],
    render: [`output/${input.episodeId}/vertical_9x16.mp4`],
  };
  return input.refs.find((ref) =>
    paths[input.routeTarget].some((candidate) =>
      candidate.endsWith("/") ? ref.path.startsWith(candidate) : ref.path === candidate,
    ),
  );
};

const locatorForDeliveryTarget = (
  routeTarget: DeliveryRouteTarget,
  index: number,
): ProductionIssueDraft["locator"] => {
  if (routeTarget === "captions") return {kind: "srt-cue", value: String(index + 1)};
  if (routeTarget === "timeline") return {kind: "time-range", value: "whole-timeline"};
  return {kind: "whole-artifact", value: routeTarget};
};

const deliveryIssueDrafts = (input: {
  request: ProductionStageRequest;
  refs: readonly ArtifactRef[];
  report: string;
}): ProductionIssueDraft[] => {
  const gate = parseDeliveryGate(input.report);
  const routeTarget = deliveryRouteTarget(gate.returnTo);
  if (!routeTarget) return [];
  const blockers = gate.blockers.length > 0 ? gate.blockers : ["Delivery Critic verdict is REJECT"];
  const affectedArtifact = artifactForDeliveryTarget({
    routeTarget,
    episodeId: input.request.episodeId,
    refs: input.refs,
  });
  if (!affectedArtifact) return [];
  return blockers.map((blocker, index) => {
    const category = categoryForDeliveryFailure({
      routeTarget,
      blocker,
      metrics: gate.metrics,
    });
    return productionIssueDraftSchema.parse({
      issueId: `issue-delivery-r${input.request.attempt}-${String(index + 1).padStart(2, "0")}`,
      category,
      severity: "blocker",
      status: "open",
      ownerAgent: "production-executor",
      routeTarget,
      restartAt:
        routeTarget === "captions" || routeTarget === "timeline"
          ? "timeline"
          : routeTarget === "tts"
            ? "tts"
            : "render:smoke",
      affectedArtifact,
      locator: locatorForDeliveryTarget(routeTarget, index),
      summary: boundedText(blocker),
    });
  });
};

const dependencyRelation = (stage: ProductionStageName): ArtifactDependency["relation"] => {
  if (stage === "render:smoke" || stage === "render:vertical") return "renders";
  if (stage === "materialize:story" || stage === "timeline") return "materializes";
  return "reads";
};

const artifactDependency = (
  ref: ArtifactRef,
  relation: ArtifactDependency["relation"],
): ArtifactDependency => ({
  artifactId: ref.artifactId,
  path: ref.path,
  sha256: ref.sha256,
  relation,
});

const selectedRefFromIndex = (
  index: ArtifactIndex,
  artifactId: string,
): ArtifactRef | undefined => {
  const pointer = index.selected[artifactId];
  if (!pointer) return undefined;
  return index.artifacts.find(
    (record) =>
      record.ref.artifactId === artifactId &&
      record.ref.revision === pointer.revision &&
      record.ref.sha256 === pointer.sha256 &&
      record.ref.path === pointer.path,
  )?.ref;
};

const indexPath = (repoRoot: string, episodeId: string): string =>
  resolveRepositoryPath(repoRoot, `content/${episodeId}/artifact-index.json`);

const loadIndex = (repoRoot: string, episodeId: string): ArtifactIndex => {
  const filePath = indexPath(repoRoot, episodeId);
  return fs.existsSync(filePath) ? readArtifactIndex(filePath) : emptyArtifactIndex(episodeId);
};

const stageOutputDeclarations = (
  repoRoot: string,
  episodeId: string,
  stage: ProductionStageName,
): OutputDeclaration[] => [
  ...stageDefinitions[stage].outputs(repoRoot, episodeId),
  receiptDeclaration(episodeId, stage),
];

export const productionStageOutputDeclarations = stageOutputDeclarations;

const ensureUniqueDeclarations = (declarations: readonly OutputDeclaration[]): void => {
  const paths = new Set<string>();
  const ids = new Set<string>();
  for (const declaration of declarations) {
    if (paths.has(declaration.path))
      throw new Error(`duplicate production output path: ${declaration.path}`);
    if (ids.has(declaration.artifactId)) {
      throw new Error(`duplicate production output artifact: ${declaration.artifactId}`);
    }
    paths.add(declaration.path);
    ids.add(declaration.artifactId);
  }
};

const createDefaultWorkspace = (input: {
  repoRoot: string;
  episodeId: string;
  stage: ProductionStageName;
}): ProductionWorkspace => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), `production-agent-${stageSlug(input.stage)}-`),
  );
  const copy = (repositoryPath: string): void => {
    const source = path.join(input.repoRoot, repositoryPath);
    if (!fs.existsSync(source)) return;
    const target = path.join(root, repositoryPath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.cpSync(source, target, {recursive: true});
  };

  for (const repositoryPath of [
    "src",
    "scripts",
    "config",
    "prompts",
    "package.json",
    "tsconfig.json",
    "remotion.config.ts",
    "pnpm-workspace.yaml",
    `content/${input.episodeId}`,
    `public/episodes/${input.episodeId}`,
    `output/${input.episodeId}`,
  ]) {
    copy(repositoryPath);
  }
  for (const directory of ["node_modules", ".venv"]) {
    const source = path.join(input.repoRoot, directory);
    if (fs.existsSync(source)) fs.symlinkSync(source, path.join(root, directory), "dir");
  }

  return {
    root,
    dispose: () => fs.rmSync(root, {recursive: true, force: true}),
  };
};

const defaultRunTool: DeterministicToolRunner = (input) => {
  const executable = path.join(input.cwd, "node_modules/.bin/tsx");
  const args = [input.scriptPath, ...input.args, "--episode", input.episodeId];
  const result = spawnSync(executable, args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      EPISODE_ID: input.episodeId,
      ...(input.environment ?? {}),
    },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `production tool exited ${String(result.status)}: ${boundedText(detail || "no tool output")}`,
    );
  }
  return {stdout: result.stdout ?? "", stderr: result.stderr ?? ""};
};

const writeReceipt = (input: {
  repoRoot: string;
  episodeId: string;
  stage: ProductionStageName;
  inputSetHash: string;
  outputPaths: readonly string[];
}): void => {
  const declaration = receiptDeclaration(input.episodeId, input.stage);
  const receipt: ProductionStageReceipt = productionStageReceiptSchema.parse({
    schemaVersion: "production-stage-receipt-v1",
    episodeId: input.episodeId,
    stage: input.stage,
    inputSetHash: input.inputSetHash,
    status: "passed",
    command: stageDefinitions[input.stage].script,
    outputPaths: [...input.outputPaths].sort(),
  });
  const filePath = resolveRepositoryPath(input.repoRoot, declaration.path);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${stableJson(receipt)}\n`, "utf8");
};

const currentArtifactMatches = (repoRoot: string, ref: ArtifactRef): boolean => {
  try {
    assertCurrentBytes(repoRoot, ref, "cached artifact");
    return true;
  } catch {
    return false;
  }
};

const cacheIsValid = (input: {
  repoRoot: string;
  episodeId: string;
  stage: ProductionStageName;
  inputSetHash: string;
  cached: ProductionStageCheckpoint | undefined;
}): boolean => {
  const cached = input.cached;
  if (!cached || (cached.status !== "SUCCEEDED" && cached.status !== "SKIPPED")) return false;
  if (cached.inputSetHash !== input.inputSetHash || cached.outputArtifacts.length === 0)
    return false;
  let expected: OutputDeclaration[];
  try {
    expected = stageOutputDeclarations(input.repoRoot, input.episodeId, input.stage);
  } catch {
    return false;
  }
  let index: ArtifactIndex;
  try {
    index = loadIndex(input.repoRoot, input.episodeId);
  } catch {
    return false;
  }
  const expectedByKey = new Map(
    expected.map((declaration) => [`${declaration.artifactId}:${declaration.path}`, declaration]),
  );
  const cachedByKey = new Map(
    cached.outputArtifacts.map((artifact) => [`${artifact.artifactId}:${artifact.path}`, artifact]),
  );
  return (
    expectedByKey.size === cachedByKey.size &&
    [...expectedByKey.entries()].every(([key, declaration]) => {
      const artifact = cachedByKey.get(key);
      if (
        !artifact ||
        artifact.mediaType !== declaration.mediaType ||
        artifact.schemaVersion !== declaration.schemaVersion ||
        !currentArtifactMatches(input.repoRoot, artifact)
      ) {
        return false;
      }
      const selected = selectedRefFromIndex(index, artifact.artifactId);
      return Boolean(selected && stableJsonEqual(selected, artifact));
    })
  );
};

const aggregateValidationStages = new Set<ProductionStageName>([
  "validate:content",
  "capture",
  "tts",
  "timeline",
  "validate:delivery",
]);

type Promotion = {
  commit: () => void;
  rollback: () => void;
};

const promoteFiles = (input: {
  sourceRoot: string;
  targetRoot: string;
  declarations: readonly OutputDeclaration[];
}): Promotion => {
  const changed = changedOutputDeclarations(input);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-promote-"));
  const backups = new Map<string, string | undefined>();
  const temporaryFiles: Array<{temporary: string; target: string}> = [];
  const installedTargets: string[] = [];
  let finished = false;

  try {
    for (const [index, declaration] of changed.entries()) {
      const source = resolveRepositoryPath(input.sourceRoot, declaration.path);
      const target = resolveRepositoryPath(input.targetRoot, declaration.path);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      if (fs.existsSync(target)) {
        const backup = path.join(temporaryDirectory, `${index}.backup`);
        fs.copyFileSync(target, backup);
        backups.set(target, backup);
      } else {
        backups.set(target, undefined);
      }
      const temporary = path.join(temporaryDirectory, `${index}.candidate`);
      fs.copyFileSync(source, temporary);
      temporaryFiles.push({temporary, target});
    }
    for (const item of temporaryFiles) {
      fs.renameSync(item.temporary, item.target);
      installedTargets.push(item.target);
    }
  } catch (error) {
    for (const target of installedTargets.reverse()) {
      const backup = backups.get(target);
      if (backup) fs.copyFileSync(backup, target);
      else if (fs.existsSync(target)) fs.rmSync(target, {force: true});
    }
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    throw error;
  }

  const cleanup = (): void => {
    if (!finished) {
      finished = true;
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  };
  return {
    commit: cleanup,
    rollback: () => {
      if (finished) return;
      for (const target of installedTargets.reverse()) {
        const backup = backups.get(target);
        if (backup) fs.copyFileSync(backup, target);
        else if (fs.existsSync(target)) fs.rmSync(target, {force: true});
      }
      cleanup();
    },
  };
};

const productionIssueDeclaration = (input: {
  episodeId: string;
  issueId: string;
}): OutputDeclaration => ({
  artifactId: `${input.episodeId}:production:${input.issueId.replace(/[^a-z0-9-]+/gu, "-")}`,
  path: `content/${input.episodeId}/production/issues/${input.issueId}.json`,
  mediaType: "application/json",
  schemaVersion: "production-issue-v1",
});

const publishProductionIssue = (input: {
  repoRoot: string;
  stageRoot: string;
  episodeId: string;
  issue: ProductionIssueDraft;
  inputArtifacts: readonly ArtifactRef[];
  executionId: string;
  createdAt: string;
}): ProductionIssue => {
  const declaration = productionIssueDeclaration({
    episodeId: input.episodeId,
    issueId: input.issue.issueId,
  });
  const issuePath = resolveRepositoryPath(input.stageRoot, declaration.path);
  fs.mkdirSync(path.dirname(issuePath), {recursive: true});
  fs.writeFileSync(
    issuePath,
    `${stableJson({schemaVersion: "production-issue-v1", ...input.issue})}\n`,
    "utf8",
  );

  const registryFile = indexPath(input.repoRoot, input.episodeId);
  const previousIndexBytes = fs.existsSync(registryFile)
    ? fs.readFileSync(registryFile)
    : undefined;
  const index = loadIndex(input.repoRoot, input.episodeId);
  const previous = selectedRefFromIndex(index, declaration.artifactId);
  const ref = buildArtifactRef({
    repoRoot: input.stageRoot,
    artifactId: declaration.artifactId,
    episodeId: input.episodeId,
    path: declaration.path,
    mediaType: declaration.mediaType,
    schemaVersion: declaration.schemaVersion,
    producer: "production-adapter:validate:delivery",
    ...(previous ? {previous} : {}),
    createdAt: input.createdAt,
  });
  const dependencies = dedupeArtifactRefs(input.inputArtifacts).map((artifact) =>
    artifactDependency(artifact, "reviews"),
  );
  const promotion = promoteFiles({
    sourceRoot: input.stageRoot,
    targetRoot: input.repoRoot,
    declarations: [declaration],
  });
  try {
    let nextIndex = registerCandidate(index, ref, input.executionId, dependencies);
    nextIndex = selectArtifact(nextIndex, ref);
    writeArtifactIndex(registryFile, nextIndex);
    assertCurrentBytes(input.repoRoot, ref, `published production issue ${input.issue.issueId}`);
    promotion.commit();
    return productionIssueSchema.parse({...input.issue, issueRef: ref});
  } catch (error) {
    promotion.rollback();
    restoreIndex(registryFile, previousIndexBytes);
    throw error;
  }
};

const changedOutputDeclarations = (input: {
  sourceRoot: string;
  targetRoot: string;
  declarations: readonly OutputDeclaration[];
}): OutputDeclaration[] =>
  input.declarations.filter((declaration) => {
    const target = resolveRepositoryPath(input.targetRoot, declaration.path);
    const source = resolveRepositoryPath(input.sourceRoot, declaration.path);
    if (!fs.existsSync(source))
      throw new Error(`production output is missing: ${declaration.path}`);
    if (!fs.statSync(source).isFile())
      throw new Error(`production output is not a file: ${declaration.path}`);
    if (!fs.existsSync(target)) return true;
    if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isFile()) {
      throw new Error(`canonical production output is not a regular file: ${declaration.path}`);
    }
    const sourceBytes = fs.readFileSync(source);
    const targetBytes = fs.readFileSync(target);
    return !sourceBytes.equals(targetBytes);
  });

const restoreIndex = (filePath: string, previous: Buffer | undefined): void => {
  if (previous) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, previous);
  } else if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, {force: true});
  }
};

const artifactVersionKey = (ref: Pick<ArtifactRef, "artifactId" | "sha256">): string =>
  `${ref.artifactId}:${ref.sha256}`;

const historyPathFor = (episodeId: string, ref: ArtifactRef): string => {
  const safeArtifactId = ref.artifactId.replace(/[^a-z0-9-]+/gu, "-");
  const extension = path.extname(ref.path) || ".bin";
  return `content/${episodeId}/.artifact-history/${safeArtifactId}/r${ref.revision}-${ref.sha256}${extension}`;
};

type SnapshotTransaction = {
  index: ArtifactIndex;
  commit: () => void;
  rollback: () => void;
};

const snapshotSelectedArtifacts = (input: {
  repoRoot: string;
  episodeId: string;
  index: ArtifactIndex;
  stageRoot: string;
  declarations: readonly OutputDeclaration[];
}): SnapshotTransaction => {
  const changedPaths = new Set(
    changedOutputDeclarations({
      sourceRoot: input.stageRoot,
      targetRoot: input.repoRoot,
      declarations: input.declarations,
    }).map((declaration) => declaration.path),
  );
  const selectedRecords = input.index.artifacts.filter((record) => {
    const pointer = input.index.selected[record.ref.artifactId];
    return (
      record.state === "selected" &&
      pointer?.revision === record.ref.revision &&
      pointer.sha256 === record.ref.sha256 &&
      pointer.path === record.ref.path &&
      changedPaths.has(record.ref.path)
    );
  });
  const pathByArtifact = new Map<string, string>();
  const stagedSnapshots: Array<{temporary: string; target: string}> = [];
  const createdSnapshots: string[] = [];
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-history-"));

  try {
    for (const record of selectedRecords) {
      const source = resolveRepositoryPath(input.repoRoot, record.ref.path);
      const bytes = fs.readFileSync(source);
      if (bytes.byteLength !== record.ref.sizeBytes || sha256(bytes) !== record.ref.sha256) {
        continue;
      }
      const historyPath = historyPathFor(input.episodeId, record.ref);
      const target = resolveRepositoryPath(input.repoRoot, historyPath);
      if (fs.existsSync(target)) {
        const existing = fs.readFileSync(target);
        if (
          existing.byteLength !== record.ref.sizeBytes ||
          sha256(existing) !== record.ref.sha256
        ) {
          throw new Error(`historical artifact snapshot collision: ${historyPath}`);
        }
      } else {
        const temporary = path.join(temporaryDirectory, `${stagedSnapshots.length}.snapshot`);
        fs.writeFileSync(temporary, bytes);
        stagedSnapshots.push({temporary, target});
      }
      pathByArtifact.set(artifactVersionKey(record.ref), historyPath);
    }

    const migratePath = (ref: ArtifactRef): string | undefined =>
      pathByArtifact.get(artifactVersionKey(ref));
    const migratedRecords = input.index.artifacts.map((record) => {
      const migratedPath = migratePath(record.ref);
      const ref = migratedPath ? {...record.ref, path: migratedPath} : record.ref;
      return {
        ...record,
        ref,
        dependencies: record.dependencies.map((dependency) => {
          const dependencyPath = pathByArtifact.get(
            artifactVersionKey({artifactId: dependency.artifactId, sha256: dependency.sha256}),
          );
          return dependencyPath ? {...dependency, path: dependencyPath} : dependency;
        }),
      };
    });
    const migratedSelected = Object.fromEntries(
      Object.entries(input.index.selected).map(([artifactId, pointer]) => {
        const selected = input.index.artifacts.find(
          (record) =>
            record.ref.artifactId === artifactId &&
            record.ref.revision === pointer.revision &&
            record.ref.sha256 === pointer.sha256 &&
            record.ref.path === pointer.path,
        );
        const migratedPath = selected ? migratePath(selected.ref) : undefined;
        return [artifactId, migratedPath ? {...pointer, path: migratedPath} : pointer];
      }),
    );
    const nextIndex: ArtifactIndex = {
      ...input.index,
      artifacts: migratedRecords,
      selected: migratedSelected,
    };

    return {
      index: nextIndex,
      commit: () => {
        try {
          for (const snapshot of stagedSnapshots) {
            fs.mkdirSync(path.dirname(snapshot.target), {recursive: true});
            fs.renameSync(snapshot.temporary, snapshot.target);
            createdSnapshots.push(snapshot.target);
          }
          fs.rmSync(temporaryDirectory, {recursive: true, force: true});
        } catch (error) {
          for (const target of createdSnapshots) fs.rmSync(target, {force: true});
          fs.rmSync(temporaryDirectory, {recursive: true, force: true});
          throw error;
        }
      },
      rollback: () => {
        for (const target of createdSnapshots) fs.rmSync(target, {force: true});
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      },
    };
  } catch (error) {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    throw error;
  }
};

const publish = (input: {
  repoRoot: string;
  stageRoot: string;
  episodeId: string;
  stage: ProductionStageName;
  executionId: string;
  inputArtifacts: readonly ArtifactRef[];
  previousArtifacts: readonly ArtifactRef[];
  declarations: readonly OutputDeclaration[];
  authorizedArtifactIds?: readonly string[];
  createdAt: string;
}): ArtifactRef[] => {
  const registryFile = indexPath(input.repoRoot, input.episodeId);
  const previousIndexBytes = fs.existsSync(registryFile)
    ? fs.readFileSync(registryFile)
    : undefined;
  const index = loadIndex(input.repoRoot, input.episodeId);
  const previousById = new Map<string, ArtifactRef>();
  for (const ref of input.previousArtifacts) previousById.set(ref.artifactId, ref);
  for (const declaration of input.declarations) {
    const selected = selectedRefFromIndex(index, declaration.artifactId);
    if (selected && !previousById.has(declaration.artifactId))
      previousById.set(declaration.artifactId, selected);
  }

  const candidateRefs = input.declarations.map((declaration) =>
    buildArtifactRef({
      repoRoot: input.stageRoot,
      artifactId: declaration.artifactId,
      episodeId: input.episodeId,
      path: declaration.path,
      mediaType: declaration.mediaType,
      schemaVersion: declaration.schemaVersion,
      producer: `production-adapter:${input.stage}`,
      previous: previousById.get(declaration.artifactId),
      createdAt: input.createdAt,
    }),
  );
  if (input.authorizedArtifactIds) {
    const authorized = new Set(input.authorizedArtifactIds);
    const unauthorized = candidateRefs
      .filter((ref) => {
        const previous = previousById.get(ref.artifactId);
        const changed =
          !previous ||
          previous.sha256 !== ref.sha256 ||
          previous.revision !== ref.revision ||
          previous.path !== ref.path;
        return changed && !authorized.has(ref.artifactId);
      })
      .map((ref) => ref.artifactId)
      .sort();
    if (unauthorized.length > 0) {
      throw new Error(`PRODUCTION_UNAUTHORIZED_ARTIFACT:${unauthorized.join(",")}`);
    }
  }
  const snapshots = snapshotSelectedArtifacts({
    repoRoot: input.repoRoot,
    episodeId: input.episodeId,
    index,
    stageRoot: input.stageRoot,
    declarations: input.declarations,
  });
  let promotion: Promotion | undefined;

  try {
    promotion = promoteFiles({
      sourceRoot: input.stageRoot,
      targetRoot: input.repoRoot,
      declarations: input.declarations,
    });
    let nextIndex = snapshots.index;
    const dependencies = dedupeArtifactRefs(input.inputArtifacts).map((ref) =>
      artifactDependency(ref, dependencyRelation(input.stage)),
    );
    const selectedRefs: ArtifactRef[] = [];
    for (const ref of candidateRefs) {
      const previous = previousById.get(ref.artifactId);
      nextIndex = registerCandidate(nextIndex, ref, input.executionId, dependencies);
      const changed =
        !previous ||
        previous.sha256 !== ref.sha256 ||
        previous.revision !== ref.revision ||
        previous.path !== ref.path;
      if (changed) nextIndex = markStaleTransitively(nextIndex, [ref.artifactId]);
      nextIndex = selectArtifact(nextIndex, ref);
      selectedRefs.push(
        nextIndex.artifacts.find(
          (record) =>
            record.ref.artifactId === ref.artifactId &&
            record.ref.revision === ref.revision &&
            record.ref.sha256 === ref.sha256 &&
            record.state === "selected",
        )?.ref ?? ref,
      );
    }
    snapshots.commit();
    writeArtifactIndex(registryFile, nextIndex);
    for (const ref of selectedRefs) {
      assertCurrentBytes(input.repoRoot, ref, `published artifact ${ref.artifactId}`);
    }
    promotion.commit();
    return selectedRefs;
  } catch (error) {
    promotion?.rollback();
    snapshots.rollback();
    restoreIndex(registryFile, previousIndexBytes);
    throw error;
  }
};

const makeResult = (input: {
  request: ProductionStageRequest;
  status: ProductionStageResult["status"];
  inputArtifacts: ArtifactRef[];
  inputSetHash: string;
  outputArtifacts: ArtifactRef[];
  issues?: ProductionIssue[];
  decision: {code: string; summary: string};
  failure?: {code: string; retryable: boolean; detail: string};
}): ProductionStageResult =>
  productionStageResultSchema.parse({
    contractVersion: "production-stage-result-v1",
    executionId: input.request.executionId,
    episodeId: input.request.episodeId,
    stage: input.request.stage,
    status: input.status,
    attempt: input.request.attempt,
    inputSetHash: input.inputSetHash,
    inputArtifacts: input.inputArtifacts,
    outputArtifacts: input.outputArtifacts,
    issues: input.issues ?? [],
    decision: input.decision,
    ...(input.failure ? {failure: input.failure} : {}),
  });

const failedResult = (input: {
  request: ProductionStageRequest;
  inputArtifacts?: ArtifactRef[];
  inputSetHash?: string;
  code: string;
  retryable: boolean;
  detail: string;
  issues?: ProductionIssue[];
}): ProductionStageResult => {
  const inputArtifacts = input.inputArtifacts ?? [];
  return makeResult({
    request: input.request,
    status: "FAILED",
    inputArtifacts,
    inputSetHash:
      input.inputSetHash ??
      inputSetHash(
        input.request.stage,
        inputArtifacts.length ? inputArtifacts : [input.request.contentManifestRef],
      ),
    outputArtifacts: [],
    issues: input.issues,
    decision: {code: "PRODUCTION_STAGE_FAILED", summary: `${input.request.stage} failed`},
    failure: {
      code: input.code,
      retryable: input.retryable,
      detail: boundedText(input.detail),
    },
  });
};

/**
 * Runs the existing production script in an isolated workspace and publishes only
 * a complete, hash-verified output set. This is deliberately framework-neutral so
 * a LangGraph node can call it without importing LangGraph into the adapter layer.
 */
export const createDeterministicToolAdapter = (
  options: DeterministicToolAdapterOptions,
): ProductionStageAdapter => {
  const runTool = options.runTool ?? defaultRunTool;
  const createWorkspace = options.createWorkspace ?? createDefaultWorkspace;
  const createdAt = options.createdAt ?? (() => new Date().toISOString());
  const fineGrainedCacheEnabled = options.enableFineGrainedCache ?? options.runTool === undefined;
  const cacheRoot = options.cacheRoot ?? path.join(options.repoRoot, ".orchestration", "cache");

  return async (rawRequest) => {
    const request = productionStageRequestSchema.parse(rawRequest);
    if (options.fixedStage && options.fixedStage !== request.stage) {
      return failedResult({
        request,
        code: "PRODUCTION_STAGE_MISMATCH",
        retryable: false,
        detail: `adapter is fixed to ${options.fixedStage}, received ${request.stage}`,
      });
    }

    let normalizedInputs: ArtifactRef[] = [];
    let calculatedInputSetHash = inputSetHash(request.stage, [request.contentManifestRef]);
    try {
      const manifest = readFrozenManifest(options.repoRoot, request.contentManifestRef);
      if ((manifest.approvalEpoch ?? 0) !== (request.approvalEpoch ?? 0)) {
        throw new Error(
          `PRODUCTION_APPROVAL_EPOCH_MISMATCH:${request.approvalEpoch ?? 0}:${manifest.approvalEpoch ?? 0}`,
        );
      }
      const frozenById = new Map(
        manifest.artifacts.map((artifact) => [artifact.artifactId, artifact]),
      );
      const previousIds = new Set(request.previousArtifacts.map((artifact) => artifact.artifactId));
      normalizedInputs = dedupeArtifactRefs([
        request.contentManifestRef,
        ...request.inputArtifacts,
      ]);
      for (const artifact of normalizedInputs) {
        if (artifact.artifactId === request.contentManifestRef.artifactId) continue;
        const frozen = frozenById.get(artifact.artifactId);
        if (!frozen && !previousIds.has(artifact.artifactId)) {
          throw new Error(`production input is not in the frozen manifest: ${artifact.artifactId}`);
        }
        if (
          frozen &&
          (frozen.sha256 !== artifact.sha256 || frozen.revision !== artifact.revision)
        ) {
          throw new Error(`production input differs from frozen manifest: ${artifact.artifactId}`);
        }
        assertCurrentBytes(options.repoRoot, artifact, `production input ${artifact.artifactId}`);
      }
      calculatedInputSetHash = inputSetHash(request.stage, normalizedInputs);
      if (
        !request.forceRerun &&
        (!fineGrainedCacheEnabled || !aggregateValidationStages.has(request.stage)) &&
        request.cached &&
        cacheIsValid({
          repoRoot: options.repoRoot,
          episodeId: request.episodeId,
          stage: request.stage,
          inputSetHash: calculatedInputSetHash,
          cached: request.cached,
        })
      ) {
        return makeResult({
          request,
          status: "SKIPPED",
          inputArtifacts: normalizedInputs,
          inputSetHash: calculatedInputSetHash,
          outputArtifacts: request.cached.outputArtifacts,
          decision: {
            code: "PRODUCTION_STAGE_SKIPPED",
            summary: `${request.stage} output hashes remain valid; stage skipped`,
          },
        });
      }

      const workspace = createWorkspace({
        repoRoot: options.repoRoot,
        episodeId: request.episodeId,
        stage: request.stage,
      });
      try {
        const definition = stageDefinitions[request.stage];
        try {
          await runTool({
            stage: request.stage,
            scriptPath: definition.script,
            args: [...definition.args(request.episodeId)],
            cwd: workspace.root,
            episodeId: request.episodeId,
            environment: fineGrainedCacheEnabled
              ? {
                  PRODUCTION_CACHE_DIR: cacheRoot,
                  PRODUCTION_CACHE_EVENT_PATH: resolveRepositoryPath(
                    options.repoRoot,
                    `content/${request.episodeId}/observability/cache-events.jsonl`,
                  ),
                  PRODUCTION_CACHE_TRACE_ID:
                    request.executionId.split(":production:")[0] ?? request.executionId,
                  PRODUCTION_CACHE_EXECUTION_ID: request.executionId,
                }
              : undefined,
          });
        } catch (error) {
          if (request.stage === "validate:delivery") {
            const reportPath = path.join(
              workspace.root,
              `content/${request.episodeId}/production/delivery-critic-report.md`,
            );
            if (fs.existsSync(reportPath)) {
              const drafts = deliveryIssueDrafts({
                request,
                refs: [...normalizedInputs, ...request.previousArtifacts],
                report: fs.readFileSync(reportPath, "utf8"),
              });
              if (drafts.length > 0) {
                const issues = drafts.map((issue) =>
                  publishProductionIssue({
                    repoRoot: options.repoRoot,
                    stageRoot: workspace.root,
                    episodeId: request.episodeId,
                    issue,
                    inputArtifacts: normalizedInputs,
                    executionId: request.executionId,
                    createdAt: createdAt(),
                  }),
                );
                return failedResult({
                  request,
                  inputArtifacts: normalizedInputs,
                  inputSetHash: calculatedInputSetHash,
                  code: "DELIVERY_REJECTED",
                  retryable: false,
                  detail: "Delivery Critic returned REJECT; structured production issue(s) created",
                  issues,
                });
              }
            }
          }
          throw error;
        }
        const declarations = stageOutputDeclarations(
          workspace.root,
          request.episodeId,
          request.stage,
        );
        ensureUniqueDeclarations(declarations);
        const frozenPaths = new Set(manifest.artifacts.map((artifact) => artifact.path));
        for (const declaration of declarations) {
          if (frozenPaths.has(declaration.path)) {
            throw new Error(
              `production output would overwrite frozen artifact: ${declaration.path}`,
            );
          }
        }
        writeReceipt({
          repoRoot: workspace.root,
          episodeId: request.episodeId,
          stage: request.stage,
          inputSetHash: calculatedInputSetHash,
          outputPaths: declarations
            .filter((declaration) => declaration.schemaVersion !== "production-stage-receipt-v1")
            .map((declaration) => declaration.path),
        });
        const outputArtifacts = publish({
          repoRoot: options.repoRoot,
          stageRoot: workspace.root,
          episodeId: request.episodeId,
          stage: request.stage,
          executionId: request.executionId,
          inputArtifacts: normalizedInputs,
          previousArtifacts: request.previousArtifacts,
          declarations,
          authorizedArtifactIds: request.authorizedArtifactIds,
          createdAt: createdAt(),
        });
        return makeResult({
          request,
          status: "SUCCEEDED",
          inputArtifacts: normalizedInputs,
          inputSetHash: calculatedInputSetHash,
          outputArtifacts,
          decision: {
            code: "PRODUCTION_STAGE_SUCCEEDED",
            summary: `${request.stage} published ${outputArtifacts.length} hash-bound artifact(s)`,
          },
        });
      } finally {
        workspace.dispose();
      }
    } catch (error) {
      return failedResult({
        request,
        inputArtifacts: normalizedInputs,
        inputSetHash: calculatedInputSetHash,
        code: "PRODUCTION_TOOL_FAILED",
        retryable: false,
        detail: errorMessage(error),
      });
    }
  };
};

export const productionStageOrder: readonly ProductionStageName[] = [
  "materialize:story",
  "validate:content",
  "capture",
  "tts",
  "timeline",
  "render:smoke",
  "render:vertical",
  "inspect:output",
  "validate:delivery",
];

export const productionStageDefinition = (stage: ProductionStageName): StageDefinition =>
  stageDefinitions[stage];

export const productionStageReceiptPath = (episodeId: string, stage: ProductionStageName): string =>
  receiptDeclaration(episodeId, stage).path;

export const productionStageCheckpoint = (
  result: ProductionStageResult,
): ProductionStageCheckpoint =>
  productionStageCheckpointSchema.parse({
    stage: result.stage,
    status: result.status,
    attempt: result.attempt,
    inputSetHash: result.inputSetHash,
    outputArtifacts: result.outputArtifacts,
    issues: result.issues,
    decision: result.decision,
    ...(result.failure ? {failure: result.failure} : {}),
  });
