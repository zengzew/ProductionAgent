import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {directorWorkflowSchema, type DirectorWorkflow} from "../lib/episode/workflow";
import {
  artifactIndexSchema,
  type ArtifactIndex,
  type ArtifactRef,
  type LegacyArtifactProvenance,
} from "./schemas/artifact";
import {
  buildArtifactRef,
  emptyArtifactIndex,
  readArtifactIndex,
  registerCandidate,
  selectArtifact,
} from "./artifact-registry";
import {
  hashArtifactInputs,
  hashObservabilityEvent,
  redactObservabilityValue,
  stableEventId,
} from "./observability";
import {
  observabilityEventSchema,
  type ExecutionEvent,
  type ObservabilityEvent,
} from "./schemas/execution-event";

/** A legacy import has no trustworthy historical wall-clock timestamp. */
export const LEGACY_IMPORT_UNAVAILABLE_AT = "1970-01-01T00:00:00.000Z";

const repositoryPathFor = (repoRoot: string, candidate: string): string => {
  const lexicalRoot = path.resolve(repoRoot);
  const root = fs.realpathSync(lexicalRoot);
  const lexicalCandidate = path.resolve(lexicalRoot, candidate);
  const lexicalRelative = path.relative(lexicalRoot, lexicalCandidate);
  const absolute =
    !lexicalRelative.startsWith("..") && !path.isAbsolute(lexicalRelative)
      ? path.resolve(root, lexicalRelative)
      : path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`LEGACY_PATH_ESCAPES_REPOSITORY:${candidate}`);
  }
  return relative.split(path.sep).join("/");
};

const absolutePathFor = (repoRoot: string, repositoryPath: string): string =>
  path.resolve(path.resolve(repoRoot), repositoryPath);

const isSubpath = (base: string, candidate: string): boolean => {
  const relative = path.relative(base, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const isSameOrSubpath = (base: string, candidate: string): boolean =>
  base === candidate || isSubpath(base, candidate);

const mediaTypeFor = (artifactPath: string): string => {
  const extension = path.extname(artifactPath).toLowerCase();
  return (
    {
      ".json": "application/json",
      ".md": "text/markdown",
      ".txt": "text/plain",
      ".srt": "application/x-subrip",
      ".vtt": "text/vtt",
      ".csv": "text/csv",
      ".yaml": "application/yaml",
      ".yml": "application/yaml",
      ".xml": "application/xml",
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".ts": "text/typescript",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    }[extension] ?? "application/octet-stream"
  );
};

export type LegacyPackageId =
  "episode-001-v1" | "episode-001-v2-goal3" | "episode-002-v1" | "episode-002-v2-goal3";

export type LegacyPackageSpec = {
  readonly packageId: LegacyPackageId;
  readonly episodeId: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly canonicalSourcePath: string;
  readonly aliases: readonly string[];
  readonly workflowPath: string;
  readonly requiredPaths: readonly string[];
  readonly excludedSourcePaths: readonly string[];
};

/**
 * The catalog is deliberately explicit. The v1 roots exclude their nested v2 package so one
 * physical file cannot silently become part of two different legacy packages.
 */
export const LEGACY_PACKAGE_SPECS: readonly LegacyPackageSpec[] = [
  {
    packageId: "episode-001-v1",
    episodeId: "episode-001",
    packageName: "episode-001",
    packageVersion: "v1",
    canonicalSourcePath: "content/episode-001",
    aliases: [],
    workflowPath: "content/episode-001/story/workflow.json",
    requiredPaths: ["content/episode-001/episode.config.json"],
    excludedSourcePaths: ["content/episode-001/v2-goal3"],
  },
  {
    packageId: "episode-001-v2-goal3",
    episodeId: "episode-001-v2-goal3",
    packageName: "episode-001",
    packageVersion: "v2-goal3",
    canonicalSourcePath: "content/episode-001/v2-goal3",
    aliases: ["content/episode-001-v2-goal3"],
    workflowPath: "content/episode-001/v2-goal3/story/workflow.json",
    requiredPaths: ["content/episode-001/v2-goal3/episode.config.json"],
    excludedSourcePaths: [],
  },
  {
    packageId: "episode-002-v1",
    episodeId: "episode-002",
    packageName: "episode-002",
    packageVersion: "v1",
    canonicalSourcePath: "content/episode-002",
    aliases: [],
    workflowPath: "content/episode-002/story/workflow.json",
    requiredPaths: ["content/episode-002/episode.config.json"],
    excludedSourcePaths: ["content/episode-002/v2-goal3"],
  },
  {
    packageId: "episode-002-v2-goal3",
    episodeId: "episode-002-v2-goal3",
    packageName: "episode-002",
    packageVersion: "v2-goal3",
    canonicalSourcePath: "content/episode-002/v2-goal3",
    aliases: ["content/episode-002-v2-goal3"],
    workflowPath: "content/episode-002/v2-goal3/story/workflow.json",
    requiredPaths: ["content/episode-002/v2-goal3/episode.config.json"],
    excludedSourcePaths: [],
  },
];

export const legacyPackageCatalog = LEGACY_PACKAGE_SPECS;

export type LegacyPackageProvenance = {
  packageId: LegacyPackageId;
  episodeId: string;
  packageName: string;
  packageVersion: string;
  canonicalSourcePath: string;
  aliases: string[];
  sourcePathUsed: string;
  resolvedFromAlias: boolean;
};

type LegacyPackageSelector = {
  packageId?: string;
  package?: string;
  sourcePath?: string;
  packagePath?: string;
  packageName?: string;
  packageVersion?: string;
};

export type LegacyPackageDiscovery = {
  spec: LegacyPackageSpec;
  canonicalSourcePath: string;
  canonicalAbsolutePath: string;
  sourcePathUsed: string;
  resolvedFromAlias: boolean;
  aliasToCanonical: Record<string, string>;
};

type LegacyImportInput = LegacyPackageSelector & {
  repoRoot: string;
  occurredAt?: string;
  expectedHashes?: Readonly<Record<string, string>>;
  expectedSha256ByPath?: Readonly<Record<string, string>>;
  artifactIndex?: ArtifactIndex;
  existingArtifactIndex?: ArtifactIndex;
};

const packageSpecForSelector = (input: LegacyPackageSelector): LegacyPackageSpec => {
  const selector = input.packageId ?? input.package ?? input.sourcePath ?? input.packagePath;
  const byNameAndVersion = LEGACY_PACKAGE_SPECS.filter(
    (spec) =>
      (input.packageName === undefined || spec.packageName === input.packageName) &&
      (input.packageVersion === undefined || spec.packageVersion === input.packageVersion),
  );

  if (!selector) {
    if (byNameAndVersion.length === 1) return byNameAndVersion[0]!;
    throw new Error("LEGACY_PACKAGE_SELECTOR_REQUIRED");
  }

  const normalizedSelector = selector.replaceAll("\\", "/").replace(/\/+$/u, "");
  const matches = LEGACY_PACKAGE_SPECS.filter((spec) => {
    const pathMatches =
      normalizedSelector === spec.canonicalSourcePath || spec.aliases.includes(normalizedSelector);
    const idMatches =
      normalizedSelector === spec.packageId ||
      normalizedSelector === spec.packageName ||
      normalizedSelector === `${spec.packageName}-${spec.packageVersion}`;
    return pathMatches || idMatches;
  }).filter((spec) => byNameAndVersion.includes(spec));

  if (matches.length !== 1) {
    throw new Error(`LEGACY_PACKAGE_UNKNOWN:${selector}`);
  }
  return matches[0]!;
};

const selectorPathFor = (input: LegacyPackageSelector, repoRoot: string): string | undefined => {
  const candidate =
    input.sourcePath ??
    input.packagePath ??
    (input.package?.includes("/") ? input.package : undefined);
  return candidate === undefined ? undefined : repositoryPathFor(repoRoot, candidate);
};

const lstatOrThrow = (
  absolutePath: string,
  repositoryPath: string,
  code = "LEGACY_MISSING_FILE",
) => {
  try {
    return fs.lstatSync(absolutePath);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT" || errno.code === "ENOTDIR") {
      throw new Error(`${code}:${repositoryPath}`, {cause: error});
    }
    throw new Error(
      `LEGACY_SOURCE_READ_FAILED:${repositoryPath}:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
};

const realpathOrThrow = (absolutePath: string, repositoryPath: string): string => {
  try {
    return fs.realpathSync(absolutePath);
  } catch (error) {
    throw new Error(
      `LEGACY_BROKEN_SYMLINK:${repositoryPath}:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
};

const canonicalRepositoryPathForAbsolute = (repoRoot: string, absolutePath: string): string =>
  repositoryPathFor(repoRoot, realpathOrThrow(absolutePath, absolutePath));

const selectPackageSpec = (input: LegacyPackageSelector, repoRoot: string): LegacyPackageSpec => {
  const pathSelector = selectorPathFor(input, repoRoot);
  const spec = packageSpecForSelector(
    pathSelector === undefined ? input : {...input, sourcePath: pathSelector},
  );
  if (
    pathSelector !== undefined &&
    pathSelector !== spec.canonicalSourcePath &&
    !spec.aliases.includes(pathSelector)
  ) {
    throw new Error(`LEGACY_PACKAGE_SELECTOR_CONFLICT:${pathSelector}:${spec.packageId}`);
  }
  return spec;
};

const resolveLegacyPackageInternal = (
  input: {repoRoot: string} & LegacyPackageSelector,
): LegacyPackageDiscovery => {
  const repoRoot = path.resolve(input.repoRoot);
  const spec = selectPackageSpec(input, repoRoot);
  const canonicalAbsolutePath = absolutePathFor(repoRoot, spec.canonicalSourcePath);
  const canonicalStat = lstatOrThrow(
    canonicalAbsolutePath,
    spec.canonicalSourcePath,
    "LEGACY_PACKAGE_MISSING",
  );
  const canonicalRealAbsolutePath = canonicalStat.isSymbolicLink()
    ? realpathOrThrow(canonicalAbsolutePath, spec.canonicalSourcePath)
    : realpathOrThrow(canonicalAbsolutePath, spec.canonicalSourcePath);
  if (!fs.statSync(canonicalRealAbsolutePath).isDirectory()) {
    throw new Error(`LEGACY_PACKAGE_NOT_DIRECTORY:${spec.canonicalSourcePath}`);
  }
  const canonicalRealPath = repositoryPathFor(repoRoot, canonicalRealAbsolutePath);
  if (canonicalRealPath !== spec.canonicalSourcePath) {
    throw new Error(
      `LEGACY_CANONICAL_SOURCE_MISMATCH:${spec.packageId}:${canonicalRealPath}:${spec.canonicalSourcePath}`,
    );
  }

  const selectedPath = selectorPathFor(input, repoRoot);
  const sourcePathUsed = selectedPath ?? spec.canonicalSourcePath;
  const resolvedFromAlias = spec.aliases.includes(sourcePathUsed);
  const aliasToCanonical: Record<string, string> = {};
  for (const alias of spec.aliases) {
    aliasToCanonical[alias] = spec.canonicalSourcePath;
    const aliasAbsolutePath = absolutePathFor(repoRoot, alias);
    let aliasStat: fs.Stats;
    try {
      aliasStat = fs.lstatSync(aliasAbsolutePath);
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === "ENOENT" || errno.code === "ENOTDIR") {
        continue;
      }
      throw error;
    }
    if (!aliasStat.isSymbolicLink()) {
      throw new Error(`LEGACY_ALIAS_NOT_SYMLINK:${alias}`);
    }
    const aliasRealAbsolutePath = realpathOrThrow(aliasAbsolutePath, alias);
    const aliasRealPath = repositoryPathFor(repoRoot, aliasRealAbsolutePath);
    if (aliasRealPath !== spec.canonicalSourcePath) {
      throw new Error(
        `LEGACY_ALIAS_MISMATCH:${alias}:${aliasRealPath}:${spec.canonicalSourcePath}`,
      );
    }
  }

  return {
    spec,
    canonicalSourcePath: spec.canonicalSourcePath,
    canonicalAbsolutePath: canonicalRealAbsolutePath,
    sourcePathUsed,
    resolvedFromAlias,
    aliasToCanonical,
  };
};

export const resolveLegacyPackage = (
  input: {repoRoot: string} & LegacyPackageSelector,
): LegacyPackageDiscovery => resolveLegacyPackageInternal(input);

export const discoverLegacyPackages = (
  input: string | {repoRoot: string; packageIds?: readonly string[]},
): LegacyPackageDiscovery[] => {
  const repoRoot = typeof input === "string" ? input : input.repoRoot;
  const packageIds = typeof input === "string" ? undefined : input.packageIds;
  const selectors = packageIds ?? LEGACY_PACKAGE_SPECS.map((spec) => spec.packageId);
  const seen = new Set<string>();
  return selectors.map((selector) => {
    if (seen.has(selector)) throw new Error(`LEGACY_PACKAGE_DUPLICATE_SELECTOR:${selector}`);
    seen.add(selector);
    return resolveLegacyPackage({repoRoot, packageId: selector});
  });
};

export const discoverLegacyPackage = resolveLegacyPackage;

type LegacyFileEntry = {
  absolutePath: string;
  repositoryPath: string;
};

const canonicalFileEntry = (
  repoRoot: string,
  absolutePath: string,
  label: string,
): LegacyFileEntry => {
  lstatOrThrow(absolutePath, label);
  const realAbsolutePath = realpathOrThrow(absolutePath, label);
  const repositoryPath = repositoryPathFor(repoRoot, realAbsolutePath);
  const stat = lstatOrThrow(realAbsolutePath, repositoryPath);
  if (!stat.isFile()) throw new Error(`LEGACY_FILE_REQUIRED:${repositoryPath}`);
  return {absolutePath: realAbsolutePath, repositoryPath};
};

const collectPackageFiles = (input: {
  repoRoot: string;
  discovery: LegacyPackageDiscovery;
  workflow: DirectorWorkflow;
}): LegacyFileEntry[] => {
  const repoRoot = path.resolve(input.repoRoot);
  const root = input.discovery.canonicalAbsolutePath;
  const excludedRoots = input.discovery.spec.excludedSourcePaths.map((value) =>
    path.resolve(repoRoot, value),
  );
  const registryPath = path.resolve(root, "artifact-index.json");
  const packageRoots = LEGACY_PACKAGE_SPECS.map((spec) =>
    path.resolve(repoRoot, spec.canonicalSourcePath),
  );
  const files = new Map<string, LegacyFileEntry>();

  const assertPackageBoundary = (absolutePath: string, repositoryPath: string): void => {
    if (!isSameOrSubpath(root, absolutePath)) {
      throw new Error(`LEGACY_PACKAGE_ESCAPE:${input.discovery.spec.packageId}:${repositoryPath}`);
    }
    for (const otherRoot of packageRoots) {
      if (otherRoot !== root && isSubpath(otherRoot, absolutePath) && !isSubpath(otherRoot, root)) {
        throw new Error(
          `LEGACY_CROSS_EPISODE_PACKAGE:${input.discovery.spec.packageId}:${repositoryPath}`,
        );
      }
    }
  };

  const visit = (absolutePath: string): void => {
    const repositoryPath = repositoryPathFor(repoRoot, absolutePath);
    const stat = lstatOrThrow(absolutePath, repositoryPath);
    const realAbsolutePath = stat.isSymbolicLink()
      ? realpathOrThrow(absolutePath, repositoryPath)
      : absolutePath;
    const targetStat = stat.isSymbolicLink() ? fs.statSync(realAbsolutePath) : stat;
    if (excludedRoots.some((excluded) => isSameOrSubpath(excluded, realAbsolutePath))) return;
    if (realAbsolutePath === registryPath) return;
    if (targetStat.isDirectory()) {
      assertPackageBoundary(realAbsolutePath, repositoryPath);
      for (const entry of fs
        .readdirSync(realAbsolutePath, {withFileTypes: true})
        .sort((left, right) => left.name.localeCompare(right.name))) {
        visit(path.join(realAbsolutePath, entry.name));
      }
      return;
    }
    if (targetStat.isFile()) {
      assertPackageBoundary(realAbsolutePath, repositoryPath);
      const entry = canonicalFileEntry(repoRoot, realAbsolutePath, repositoryPath);
      files.set(entry.repositoryPath, entry);
      return;
    }
    throw new Error(`LEGACY_UNSUPPORTED_ENTRY:${repositoryPath}`);
  };

  visit(root);

  const workflowPaths = [
    input.discovery.spec.workflowPath,
    ...input.discovery.spec.requiredPaths,
    ...input.workflow.stages.flatMap((stage) => stage.artifacts),
  ];
  for (const requestedPath of new Set(workflowPaths)) {
    const repositoryPath = repositoryPathFor(repoRoot, requestedPath);
    const absolutePath = absolutePathFor(repoRoot, repositoryPath);
    const entry = canonicalFileEntry(repoRoot, absolutePath, repositoryPath);
    const inAnotherPackage = packageRoots.some(
      (otherRoot) =>
        otherRoot !== root &&
        isSubpath(otherRoot, entry.absolutePath) &&
        !isSubpath(otherRoot, root),
    );
    if (inAnotherPackage) {
      throw new Error(
        `LEGACY_CROSS_EPISODE_PACKAGE:${input.discovery.spec.packageId}:${entry.repositoryPath}`,
      );
    }
    files.set(entry.repositoryPath, entry);
  }

  return [...files.values()].sort((left, right) =>
    left.repositoryPath.localeCompare(right.repositoryPath),
  );
};

const readWorkflow = (repoRoot: string, workflowPath: string): DirectorWorkflow => {
  const absolutePath = absolutePathFor(repoRoot, workflowPath);
  const stat = lstatOrThrow(absolutePath, workflowPath);
  const canonicalAbsolutePath = stat.isSymbolicLink()
    ? realpathOrThrow(absolutePath, workflowPath)
    : absolutePath;
  try {
    return directorWorkflowSchema.parse(
      JSON.parse(fs.readFileSync(canonicalAbsolutePath, "utf8")) as unknown,
    );
  } catch (error) {
    throw new Error(
      `LEGACY_WORKFLOW_INVALID:${workflowPath}:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
};

const sha256File = (absolutePath: string): {sha256: string; sizeBytes: number} => {
  const bytes = fs.readFileSync(absolutePath);
  return {
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
  };
};

const assertExpectedHashes = (input: {
  repoRoot: string;
  expectedHashes: Readonly<Record<string, string>> | undefined;
  files: readonly LegacyFileEntry[];
}): void => {
  if (!input.expectedHashes) return;
  const byPath = new Map(input.files.map((file) => [file.repositoryPath, file]));
  for (const [requestedPath, expectedSha256] of Object.entries(input.expectedHashes)) {
    if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
      throw new Error(`LEGACY_HASH_EXPECTATION_INVALID:${requestedPath}`);
    }
    const repositoryPath = repositoryPathFor(input.repoRoot, requestedPath);
    const file = byPath.get(
      canonicalRepositoryPathForAbsolute(
        input.repoRoot,
        absolutePathFor(input.repoRoot, repositoryPath),
      ),
    );
    if (!file) throw new Error(`LEGACY_MISSING_FILE:${repositoryPath}`);
    const actual = sha256File(file.absolutePath).sha256;
    if (actual !== expectedSha256) {
      throw new Error(`LEGACY_HASH_MISMATCH:${repositoryPath}:${expectedSha256}:${actual}`);
    }
  }
};

const stableArtifactId = (spec: LegacyPackageSpec, canonicalRepositoryPath: string): string => {
  const identityInput = `${spec.canonicalSourcePath}\u0000${canonicalRepositoryPath}`;
  const digest = crypto.createHash("sha256").update(identityInput, "utf8").digest("hex");
  return `${spec.episodeId}:legacy:${digest.slice(0, 20)}`;
};

const artifactProvenanceFor = (
  spec: LegacyPackageSpec,
  canonicalRepositoryPath: string,
): LegacyArtifactProvenance => ({
  packageId: spec.packageId,
  packageName: spec.packageName,
  packageVersion: spec.packageVersion,
  canonicalSourcePath: spec.canonicalSourcePath,
  canonicalRelativePath: canonicalRepositoryPath,
  aliases: [...spec.aliases],
});

const unavailableUsage = (): ExecutionEvent["usage"] => ({
  availability: "unavailable",
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  totalTokens: null,
  cost: {amount: null, currency: null, pricingVersion: null},
});

const unavailableCheckpoint = () => ({
  checkpointId: "unavailable" as const,
  availability: "unavailable" as const,
  artifactIndexSha256: null,
  workflowSha256: null,
  revisionLedgerSha256: null,
  stateSha256: null,
});

const legacyDecision = (
  stageId: string,
  status: string,
): NonNullable<ExecutionEvent["decision"]> => ({
  code: status === "complete" ? "LEGACY_STAGE_IMPORTED" : "LEGACY_STAGE_STATUS_RECORDED",
  summary: `legacy-derived stage=${stageId} status=${status}`,
  rubricVersion: null,
  score: null,
  verdict: null,
  issueIds: [],
  route: null,
  criticResultRef: null,
});

const canonicalLegacyEvent = (input: {
  eventType: ExecutionEvent["eventType"];
  occurredAt: string;
  episodeId: string;
  runId: string;
  stage: string;
  executionId: string;
  agentName: ExecutionEvent["agentName"];
  inputArtifacts: readonly ArtifactRef[];
  outputArtifacts: readonly ArtifactRef[];
  status: ExecutionEvent["status"];
  terminalStatus: "succeeded" | "failed" | "skipped" | null;
  decision: ExecutionEvent["decision"];
}): ObservabilityEvent => {
  const inputSetHash = hashArtifactInputs([...input.inputArtifacts]);
  const raw = {
    schemaVersion: "observability-event-v1" as const,
    eventId: stableEventId(input.executionId, input.eventType),
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    episodeId: input.episodeId,
    runId: input.runId,
    stage: input.stage,
    traceId: input.runId,
    executionId: input.executionId,
    parentExecutionId: null,
    agentName: input.agentName,
    executionKind: "deterministic-tool" as const,
    attempt: 1,
    revisionRound: 0,
    approvalEpoch: 0,
    checkpointVersion: "unavailable",
    inputSetHash,
    terminalStatus: input.terminalStatus,
    model: null,
    prompt: null,
    inputArtifacts: [...input.inputArtifacts],
    outputArtifacts: [...input.outputArtifacts],
    usage: unavailableUsage(),
    timing: {
      startedAt: input.occurredAt,
      endedAt: null,
      durationMs: null,
      queueMs: null,
      providerMs: null,
    },
    status: input.status,
    decision: input.decision,
    error: null,
    checkpoint: unavailableCheckpoint(),
    environment: {
      repositoryCommit: null,
      worktreeState: "unknown" as const,
      inputSetHash,
      runtime: "unavailable",
      runnerVersion: "legacy-derived",
    },
  };
  const redacted = redactObservabilityValue(raw) as Record<string, unknown>;
  return observabilityEventSchema.parse({
    ...redacted,
    eventHash: hashObservabilityEvent(redacted as ExecutionEvent),
  });
};

const compatibilityEvent = (event: ExecutionEvent): ExecutionEvent => {
  const compatible = {...event};
  for (const key of [
    "eventHash",
    "runId",
    "stage",
    "checkpointVersion",
    "inputSetHash",
    "terminalStatus",
  ]) {
    Reflect.deleteProperty(compatible, key);
  }
  compatible.schemaVersion = "agent-execution-event-v1";
  compatible.checkpoint = null;
  return compatible;
};

const buildLegacyEvents = (input: {
  packageId: LegacyPackageId;
  workflow: DirectorWorkflow;
  artifacts: Record<string, ArtifactRef>;
  repoRoot: string;
  occurredAt: string;
}): ObservabilityEvent[] => {
  const runId = `legacy:${input.packageId}:import`;
  const events: ObservabilityEvent[] = [];
  for (const stage of input.workflow.stages) {
    const outputArtifacts = stage.artifacts.map((requestedPath) => {
      const canonicalPath = canonicalRepositoryPathForAbsolute(
        input.repoRoot,
        absolutePathFor(input.repoRoot, repositoryPathFor(input.repoRoot, requestedPath)),
      );
      const ref = input.artifacts[canonicalPath];
      if (!ref) throw new Error(`LEGACY_ARTIFACT_NOT_IMPORTED:${canonicalPath}`);
      return ref;
    });
    const executionId = `legacy:${input.packageId}:${stage.id}`;
    const terminalStatus =
      stage.status === "complete"
        ? "succeeded"
        : stage.status === "rejected"
          ? "failed"
          : "skipped";
    const terminalEventType =
      terminalStatus === "succeeded"
        ? "execution.completed"
        : terminalStatus === "failed"
          ? "execution.failed"
          : "execution.skipped";
    events.push(
      canonicalLegacyEvent({
        eventType: "execution.started",
        occurredAt: input.occurredAt,
        episodeId: input.workflow.episodeId,
        runId,
        stage: stage.id,
        executionId,
        agentName: stage.owner,
        inputArtifacts: [],
        outputArtifacts: [],
        status: "STARTED",
        terminalStatus: null,
        decision: null,
      }),
      canonicalLegacyEvent({
        eventType: "checkpoint.committed",
        occurredAt: input.occurredAt,
        episodeId: input.workflow.episodeId,
        runId,
        stage: stage.id,
        executionId,
        agentName: stage.owner,
        inputArtifacts: [],
        outputArtifacts,
        status: "SUCCEEDED",
        terminalStatus: null,
        decision: {
          ...legacyDecision(stage.id, stage.status),
          code: "LEGACY_CHECKPOINT_UNAVAILABLE",
          summary: `legacy-derived checkpoint unavailable stage=${stage.id}`,
        },
      }),
      canonicalLegacyEvent({
        eventType: terminalEventType,
        occurredAt: input.occurredAt,
        episodeId: input.workflow.episodeId,
        runId,
        stage: stage.id,
        executionId,
        agentName: stage.owner,
        inputArtifacts: [],
        outputArtifacts,
        status:
          terminalStatus === "succeeded"
            ? "SUCCEEDED"
            : terminalStatus === "failed"
              ? "FAILED"
              : "SKIPPED",
        terminalStatus,
        decision: legacyDecision(stage.id, stage.status),
      }),
    );
  }
  return events;
};

const mergeLegacyRefs = (input: {
  repoRoot: string;
  index: ArtifactIndex;
  refs: readonly ArtifactRef[];
  packageId: LegacyPackageId;
}): {index: ArtifactIndex; refs: ArtifactRef[]} => {
  let index = artifactIndexSchema.parse(input.index);
  if (index.episodeId !== input.refs[0]?.episodeId && input.refs.length > 0) {
    throw new Error(`LEGACY_INDEX_EPISODE_MISMATCH:${input.packageId}`);
  }
  const chosen = new Map<string, ArtifactRef>();

  for (const ref of input.refs) {
    const recordsWithSamePath = index.artifacts.filter((record) => record.ref.path === ref.path);
    const recordsWithSameRealPath = index.artifacts.filter((record) => {
      try {
        return (
          canonicalRepositoryPathForAbsolute(
            input.repoRoot,
            absolutePathFor(input.repoRoot, record.ref.path),
          ) === ref.path
        );
      } catch {
        return false;
      }
    });
    for (const record of [...recordsWithSamePath, ...recordsWithSameRealPath]) {
      if (record.ref.artifactId !== ref.artifactId) {
        throw new Error(`LEGACY_ARTIFACT_PATH_COLLISION:${ref.path}:${record.ref.artifactId}`);
      }
    }
    const recordsWithSameId = index.artifacts.filter(
      (record) => record.ref.artifactId === ref.artifactId,
    );
    for (const record of recordsWithSameId) {
      if (record.ref.sha256 !== ref.sha256) {
        throw new Error(`LEGACY_HASH_MISMATCH:${ref.path}:${record.ref.sha256}:${ref.sha256}`);
      }
      if (record.ref.path !== ref.path) {
        throw new Error(`LEGACY_ALIAS_IDENTITY_CONFLICT:${ref.artifactId}`);
      }
      if (record.ref.producer !== "legacy-derived") {
        throw new Error(`LEGACY_CURRENT_ARTIFACT_CONFLICT:${ref.artifactId}`);
      }
      chosen.set(ref.path, record.ref);
    }
  }

  for (const ref of input.refs) {
    const selectedRef = chosen.get(ref.path) ?? ref;
    if (selectedRef === ref) {
      index = registerCandidate(index, ref, `legacy:${input.packageId}:import`, []);
    }
    index = selectArtifact(index, selectedRef);
    chosen.set(ref.path, selectedRef);
  }
  return {
    index,
    refs: input.refs.map((ref) => chosen.get(ref.path) ?? ref),
  };
};

const readExistingRegistry = (input: {
  repoRoot: string;
  discovery: LegacyPackageDiscovery;
  explicit?: ArtifactIndex;
}): ArtifactIndex | undefined => {
  if (input.explicit) return artifactIndexSchema.parse(input.explicit);
  const candidates = [
    `${input.discovery.spec.canonicalSourcePath}/artifact-index.json`,
    `content/${input.discovery.spec.episodeId}/artifact-index.json`,
  ];
  const existingPath = candidates.find((candidate) =>
    fs.existsSync(absolutePathFor(input.repoRoot, candidate)),
  );
  if (!existingPath) return undefined;
  try {
    return readArtifactIndex(absolutePathFor(input.repoRoot, existingPath));
  } catch (error) {
    throw new Error(
      `LEGACY_REGISTRY_INVALID:${existingPath}:${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
};

export type LegacyPackageImport = {
  packageId: LegacyPackageId;
  package: LegacyPackageProvenance;
  provenance: LegacyPackageProvenance;
  episodeId: string;
  workflowRef: ArtifactRef;
  artifacts: Record<string, ArtifactRef>;
  artifactIndex: ArtifactIndex;
  executionEvents: ExecutionEvent[];
  observabilityEvents: ObservabilityEvent[];
  events: ObservabilityEvent[];
  sourcePaths: string[];
  fileHashes: Record<string, string>;
  aliasToCanonical: Record<string, string>;
};

export const importLegacyPackage = (input: LegacyImportInput): LegacyPackageImport => {
  const repoRoot = path.resolve(input.repoRoot);
  const discovery = resolveLegacyPackageInternal(input);
  const workflow = readWorkflow(repoRoot, discovery.spec.workflowPath);
  if (workflow.episodeId !== discovery.spec.episodeId) {
    throw new Error(
      `LEGACY_CROSS_EPISODE_PACKAGE:${discovery.spec.packageId}:${workflow.episodeId}`,
    );
  }
  const files = collectPackageFiles({repoRoot, discovery, workflow});
  const expectedHashes = input.expectedHashes ?? input.expectedSha256ByPath;
  assertExpectedHashes({repoRoot, expectedHashes, files});
  const snapshots = files.map((file) => ({...file, ...sha256File(file.absolutePath)}));

  const occurredAt = input.occurredAt ?? LEGACY_IMPORT_UNAVAILABLE_AT;
  const workflowCanonicalPath = canonicalRepositoryPathForAbsolute(
    repoRoot,
    absolutePathFor(repoRoot, discovery.spec.workflowPath),
  );
  const refs = snapshots.map((file) => {
    const ref = buildArtifactRef({
      repoRoot,
      artifactId: stableArtifactId(discovery.spec, file.repositoryPath),
      episodeId: discovery.spec.episodeId,
      path: file.repositoryPath,
      mediaType: mediaTypeFor(file.repositoryPath),
      schemaVersion:
        file.repositoryPath === workflowCanonicalPath
          ? "director-workflow-v1"
          : "legacy-unversioned",
      producer: "legacy-derived",
      createdAt: occurredAt,
      legacyProvenance: artifactProvenanceFor(discovery.spec, file.repositoryPath),
    });
    if (ref.sha256 !== file.sha256 || ref.sizeBytes !== file.sizeBytes) {
      throw new Error(`LEGACY_HASH_MISMATCH:${file.repositoryPath}:${file.sha256}:${ref.sha256}`);
    }
    return ref;
  });

  for (const file of snapshots) {
    const after = sha256File(file.absolutePath);
    if (after.sha256 !== file.sha256 || after.sizeBytes !== file.sizeBytes) {
      throw new Error(
        `LEGACY_SOURCE_CHANGED:${file.repositoryPath}:${file.sha256}:${after.sha256}`,
      );
    }
  }

  const baseIndex = readExistingRegistry({
    repoRoot,
    discovery,
    explicit: input.existingArtifactIndex ?? input.artifactIndex,
  });
  const index = baseIndex
    ? artifactIndexSchema.parse(baseIndex)
    : emptyArtifactIndex(discovery.spec.episodeId);
  const merged = mergeLegacyRefs({
    repoRoot,
    index,
    refs,
    packageId: discovery.spec.packageId,
  });
  const artifacts = Object.fromEntries(merged.refs.map((ref) => [ref.path, ref])) as Record<
    string,
    ArtifactRef
  >;
  const executionEvents = buildLegacyEvents({
    packageId: discovery.spec.packageId,
    workflow,
    artifacts,
    repoRoot,
    occurredAt,
  });
  const provenance: LegacyPackageProvenance = {
    packageId: discovery.spec.packageId,
    episodeId: discovery.spec.episodeId,
    packageName: discovery.spec.packageName,
    packageVersion: discovery.spec.packageVersion,
    canonicalSourcePath: discovery.spec.canonicalSourcePath,
    aliases: [...discovery.spec.aliases],
    sourcePathUsed: discovery.sourcePathUsed,
    resolvedFromAlias: discovery.resolvedFromAlias,
  };
  return {
    packageId: discovery.spec.packageId,
    package: provenance,
    provenance,
    episodeId: discovery.spec.episodeId,
    workflowRef: artifacts[workflowCanonicalPath]!,
    artifacts,
    artifactIndex: merged.index,
    executionEvents,
    observabilityEvents: executionEvents,
    events: executionEvents,
    sourcePaths: snapshots.map((file) => file.repositoryPath),
    fileHashes: Object.fromEntries(snapshots.map((file) => [file.repositoryPath, file.sha256])),
    aliasToCanonical: discovery.aliasToCanonical,
  };
};

export type LegacyBackfillImport = {
  packages: LegacyPackageImport[];
  imports: LegacyPackageImport[];
  results: LegacyPackageImport[];
  byPackageId: Record<LegacyPackageId, LegacyPackageImport>;
  aliasToCanonical: Record<string, string>;
  artifactCount: number;
};

export const importLegacyPackages = (input: {
  repoRoot: string;
  packageIds?: readonly string[];
  occurredAt?: string;
}): LegacyBackfillImport => {
  const discoveries = discoverLegacyPackages({
    repoRoot: input.repoRoot,
    packageIds: input.packageIds,
  });
  const packages = discoveries.map((discovery) =>
    importLegacyPackage({
      repoRoot: input.repoRoot,
      packageId: discovery.spec.packageId,
      occurredAt: input.occurredAt,
    }),
  );
  const byPackageId = Object.fromEntries(
    packages.map((result) => [result.packageId, result]),
  ) as Record<LegacyPackageId, LegacyPackageImport>;
  return {
    packages,
    imports: packages,
    results: packages,
    byPackageId,
    aliasToCanonical: Object.assign({}, ...packages.map((result) => result.aliasToCanonical)),
    artifactCount: packages.reduce(
      (count, result) => count + Object.keys(result.artifacts).length,
      0,
    ),
  };
};

export const importAllLegacyPackages = importLegacyPackages;

export type LegacyEpisodeImport = {
  episodeId: "episode-001";
  workflowRef: ArtifactRef;
  artifacts: Record<string, ArtifactRef>;
  artifactIndex: ArtifactIndex;
  executionEvents: ExecutionEvent[];
};

/** M1 compatibility entry point. New callers should use importLegacyPackage/importLegacyPackages. */
export const importLegacyEpisode001 = (input: {
  repoRoot: string;
  occurredAt?: string;
}): LegacyEpisodeImport => {
  const imported = importLegacyPackage({
    repoRoot: input.repoRoot,
    packageId: "episode-001-v1",
    occurredAt: input.occurredAt,
  });
  return {
    episodeId: "episode-001",
    workflowRef: imported.workflowRef,
    artifacts: imported.artifacts,
    artifactIndex: imported.artifactIndex,
    // Preserve the M1 agent-execution-event-v1 shape for existing callers. M4-05's generic API
    // exposes the canonical start/checkpoint/terminal observability stream above.
    executionEvents: imported.executionEvents
      .filter((event) => event.eventType === "execution.completed")
      .map(compatibilityEvent),
  };
};
