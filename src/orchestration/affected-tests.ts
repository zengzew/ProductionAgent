import path from "node:path";

export type VerificationLayer = "fast" | "contract" | "production";

export type AffectedTestRule = {
  /** Exact file, or a directory prefix ending with `/`. */
  match: string;
  tests: readonly string[];
  layer: VerificationLayer;
};

const layerRank: Record<VerificationLayer, number> = {
  fast: 0,
  contract: 1,
  production: 2,
};

export const FULL_SUITE_PATHS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "vitest.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
]);

const MEDIA_UNIT_TESTS = [
  "tests/media-contract.test.ts",
  "tests/media-discovery.test.ts",
  "tests/media-ingest.test.ts",
  "tests/media-index.test.ts",
  "tests/media-retrieve.test.ts",
  "tests/media-verify.test.ts",
  "tests/media-selection.test.ts",
  "tests/media-remotion.test.ts",
] as const;

const EDITORIAL_TESTS = [
  "tests/story-quality.test.ts",
  "tests/story-pipeline.test.ts",
  "tests/editorial-text-rules.test.ts",
  "tests/creative-roles.test.ts",
  "tests/oral-review-rubric.test.ts",
  "tests/editorial-calibration.test.ts",
] as const;

const DELIVERY_TESTS = [
  "tests/delivery.test.ts",
  "tests/captions.test.ts",
  "tests/tts.test.ts",
  "tests/comparison.test.ts",
  "tests/scene-animation.test.ts",
] as const;

const EPISODE_LIB_TESTS = [
  "tests/production-contract.test.ts",
  "tests/render-contract.test.ts",
  "tests/director-workflow.test.ts",
  "tests/lib/episode/paths.test.ts",
  "tests/correctness-contracts.test.ts",
] as const;

const SCRIPT_TESTS = [
  "tests/scripts/validation.test.ts",
  "tests/scripts/restore-media.test.ts",
  "tests/validation-entrypoints.test.ts",
  "tests/wrapper-episode.test.ts",
] as const;

const ROLE_MODEL_TESTS = [
  "tests/orchestration/role-model-contract.test.ts",
  "tests/orchestration/role-model-benchmark.test.ts",
  "tests/orchestration/role-model-auto.test.ts",
  "tests/orchestration/role-model-review.test.ts",
  "tests/orchestration/role-model-rollout.test.ts",
  "tests/orchestration/hosted-agent.test.ts",
] as const;

const CONTENT_LOOP_TESTS = [
  "tests/orchestration/content-loop.test.ts",
  "tests/orchestration/content-loop-bounded.test.ts",
  "tests/orchestration/content-loop-paths.test.ts",
  "tests/orchestration/foundation-content-loop.test.ts",
] as const;

/**
 * Exact file rules win over directory fallbacks for the same changed path.
 * Directory rules ending with `/` apply only when no exact rule matched.
 */
export const AFFECTED_TEST_RULES: readonly AffectedTestRule[] = [
  {match: "src/media/verify.ts", tests: ["tests/media-verify.test.ts"], layer: "contract"},
  {match: "src/media/select.ts", tests: ["tests/media-selection.test.ts"], layer: "contract"},
  {
    match: "src/media/discovery.ts",
    tests: ["tests/media-discovery.test.ts"],
    layer: "contract",
  },
  {match: "src/media/ingest.ts", tests: ["tests/media-ingest.test.ts"], layer: "contract"},
  {
    match: "src/media/clip-index.ts",
    tests: ["tests/media-index.test.ts"],
    layer: "contract",
  },
  {match: "src/media/retrieve.ts", tests: ["tests/media-retrieve.test.ts"], layer: "contract"},
  {
    match: "src/media/render.ts",
    tests: ["tests/media-remotion.test.ts"],
    layer: "contract",
  },
  {
    match: "src/media/remotion.tsx",
    tests: ["tests/media-remotion.test.ts"],
    layer: "contract",
  },
  {
    match: "src/media/manifest.ts",
    tests: ["tests/media-contract.test.ts", "tests/media-ingest.test.ts"],
    layer: "contract",
  },
  {match: "src/media/schemas.ts", tests: ["tests/media-contract.test.ts"], layer: "contract"},
  {match: "src/media/", tests: MEDIA_UNIT_TESTS, layer: "contract"},
  {
    match: "src/orchestration/verification.ts",
    tests: ["tests/orchestration/verification.test.ts"],
    layer: "fast",
  },
  {
    match: "src/orchestration/affected-tests.ts",
    tests: ["tests/orchestration/verification.test.ts"],
    layer: "fast",
  },
  {
    match: "src/orchestration/artifact-registry.ts",
    tests: [
      "tests/orchestration/contracts.test.ts",
      "tests/orchestration/failure-suite.test.ts",
      "tests/orchestration/artifact-hash-cache.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/checkpoint.ts",
    tests: [
      "tests/orchestration/checkpoint-resume.test.ts",
      "tests/orchestration/checkpoint-migration.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/checkpoint-integrity.ts",
    tests: [
      "tests/orchestration/checkpoint-resume.test.ts",
      "tests/orchestration/checkpoint-migration.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/replay.ts",
    tests: ["tests/orchestration/replay.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/concurrency.ts",
    tests: ["tests/orchestration/concurrency.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/human-decision.ts",
    tests: ["tests/orchestration/hitl.test.ts", "tests/orchestration/locked-range.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/freeze.ts",
    tests: ["tests/orchestration/freeze-content.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/pre-render-gate.ts",
    tests: [
      "tests/orchestration/production-entrypoint.test.ts",
      "tests/orchestration/graph-production-closure.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/production-entrypoint.ts",
    tests: ["tests/orchestration/production-entrypoint.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/production.ts",
    tests: [
      "tests/orchestration/production-adapters.test.ts",
      "tests/orchestration/production-entrypoint.test.ts",
      "tests/orchestration/delivery-loop.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/identity.ts",
    tests: ["tests/orchestration/identity.test.ts"],
    layer: "fast",
  },
  {
    match: "src/orchestration/reducers.ts",
    tests: ["tests/orchestration/reducers.test.ts"],
    layer: "fast",
  },
  {
    match: "src/orchestration/routing.ts",
    tests: ["tests/orchestration/routing.test.ts"],
    layer: "fast",
  },
  {
    match: "src/orchestration/revision.ts",
    tests: [
      "tests/orchestration/revision-detect.test.ts",
      "tests/orchestration/revision-select.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/evaluation.ts",
    tests: ["tests/orchestration/critic-output.test.ts", ...CONTENT_LOOP_TESTS],
    layer: "contract",
  },
  {
    match: "src/orchestration/failure-replay.ts",
    tests: ["tests/orchestration/failure-suite.test.ts", "tests/orchestration/replay.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/observability.ts",
    tests: [
      "tests/orchestration/observability-complete.test.ts",
      "tests/orchestration/event-sink.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/observability-gate.ts",
    tests: ["tests/orchestration/observability-complete.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/legacy-import.ts",
    tests: [
      "tests/orchestration/legacy-import.test.ts",
      "tests/orchestration/legacy-backfill.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/entry.ts",
    tests: [
      "tests/orchestration/orchestrator-switch.test.ts",
      "tests/orchestration/production-entrypoint.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/lg-compat.ts",
    tests: [
      "tests/orchestration/graph-execution.test.ts",
      "tests/orchestration/orchestrator-switch.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/graph/media-lifecycle.ts",
    tests: [
      "tests/orchestration/graph-production-closure.test.ts",
      "tests/orchestration/production-adapters.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/graph/production-subgraph.ts",
    tests: [
      "tests/orchestration/graph-production-closure.test.ts",
      "tests/orchestration/production-adapters.test.ts",
      "tests/orchestration/delivery-loop.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/graph/content-subgraph.ts",
    tests: ["tests/orchestration/graph-execution.test.ts", ...CONTENT_LOOP_TESTS],
    layer: "contract",
  },
  {
    match: "src/orchestration/graph/main-graph.ts",
    tests: [
      "tests/orchestration/graph-execution.test.ts",
      "tests/orchestration/m4-exit-e2e.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/agents/benchmark/",
    tests: [
      ...ROLE_MODEL_TESTS,
      "tests/orchestration/role-aware-evaluate.test.ts",
      "tests/orchestration/script-writer-evaluate.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/agents/adapters/hosted-agent.ts",
    tests: ["tests/orchestration/hosted-agent.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/agents/adapters/content-loop.ts",
    tests: CONTENT_LOOP_TESTS,
    layer: "contract",
  },
  {
    match: "src/orchestration/agents/adapters/codex-capability.ts",
    tests: ["tests/orchestration/codex-capability-gates.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/agents/adapters/role-model-rollout.ts",
    tests: ["tests/orchestration/role-model-rollout.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/agents/adapters/",
    tests: [
      "tests/orchestration/adapters.test.ts",
      "tests/orchestration/production-adapters.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/schemas/delivery-critic.ts",
    tests: ["tests/orchestration/delivery-loop.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/schemas/human-decision.ts",
    tests: ["tests/orchestration/hitl.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/schemas/migrations/",
    tests: ["tests/orchestration/checkpoint-migration.test.ts"],
    layer: "contract",
  },
  {
    match: "src/orchestration/config/checkpoint.ts",
    tests: [
      "tests/orchestration/checkpoint-resume.test.ts",
      "tests/orchestration/checkpoint-migration.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "src/orchestration/config/codex-capability-gates.ts",
    tests: ["tests/orchestration/codex-capability-gates.test.ts"],
    layer: "contract",
  },
  {match: "src/orchestration/", tests: ["tests/orchestration"], layer: "contract"},
  {match: "src/lib/editorial/", tests: EDITORIAL_TESTS, layer: "fast"},
  {match: "src/lib/delivery/", tests: DELIVERY_TESTS, layer: "fast"},
  {match: "src/lib/episode/", tests: EPISODE_LIB_TESTS, layer: "fast"},
  {
    match: "src/lib/platform/cache.ts",
    tests: ["tests/orchestration/cache.test.ts"],
    layer: "contract",
  },
  {match: "src/lib/platform/network.ts", tests: ["tests/network.test.ts"], layer: "fast"},
  {
    match: "src/lib/platform/",
    tests: ["tests/orchestration/cache.test.ts", "tests/network.test.ts"],
    layer: "contract",
  },
  {
    match: "src/compositions/",
    tests: ["tests/composition-shared.test.ts", "tests/scene-animation.test.ts"],
    layer: "fast",
  },
  {
    match: "src/editorial-calibration/",
    tests: ["tests/editorial-calibration.test.ts"],
    layer: "fast",
  },
  {
    match: "src/schemas/",
    tests: ["tests/research-schema.test.ts", "tests/orchestration/contracts.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/validate-research.ts",
    tests: ["tests/research-schema.test.ts", "tests/validation-entrypoints.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/validate-story.ts",
    tests: [
      "tests/story-pipeline.test.ts",
      "tests/story-quality.test.ts",
      "tests/validation-entrypoints.test.ts",
      "tests/wrapper-episode.test.ts",
    ],
    layer: "fast",
  },
  {
    match: "scripts/validate-content.ts",
    tests: ["tests/validation-entrypoints.test.ts", "tests/story-quality.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/validate-workflow.ts",
    tests: ["tests/director-workflow.test.ts", "tests/wrapper-episode.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/validate-episode.ts",
    tests: ["tests/validation-entrypoints.test.ts", "tests/wrapper-episode.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/lib/episode-validation.ts",
    tests: ["tests/validation-entrypoints.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/ci-scope.ts",
    tests: ["tests/orchestration/verification.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/validate-delivery.ts",
    tests: ["tests/delivery.test.ts", "tests/validation-entrypoints.test.ts"],
    layer: "fast",
  },
  {
    match: "scripts/restore-media.ts",
    tests: ["tests/scripts/restore-media.test.ts"],
    layer: "contract",
  },
  {match: "scripts/lib/", tests: ["tests/scripts/validation.test.ts"], layer: "fast"},
  {match: "scripts/", tests: SCRIPT_TESTS, layer: "fast"},
  {
    match: "config/editorial-text-rules.json",
    tests: ["tests/editorial-text-rules.test.ts"],
    layer: "fast",
  },
  {
    match: "config/production-contract.json",
    tests: ["tests/production-contract.test.ts"],
    layer: "fast",
  },
  {
    match: "config/checkpoint.json",
    tests: [
      "tests/orchestration/checkpoint-resume.test.ts",
      "tests/orchestration/checkpoint-migration.test.ts",
    ],
    layer: "contract",
  },
  {
    match: "config/codex-capability-gates.json",
    tests: ["tests/orchestration/codex-capability-gates.test.ts"],
    layer: "contract",
  },
  {
    match: "config/media-discovery.json",
    tests: ["tests/media-discovery.test.ts"],
    layer: "contract",
  },
  {match: "config/media-ingest.json", tests: ["tests/media-ingest.test.ts"], layer: "contract"},
  {match: "config/", tests: ["tests/production-contract.test.ts"], layer: "contract"},
  {
    match: "tests/helpers/media-e2e-pipeline.ts",
    tests: ["tests/media-e2e.test.ts"],
    layer: "production",
  },
  {match: "tests/media-e2e.test.ts", tests: ["tests/media-e2e.test.ts"], layer: "production"},
];

const normalizePath = (value: string): string => value.split(path.sep).join("/");

const maxLayer = (layers: readonly VerificationLayer[]): VerificationLayer => {
  let current: VerificationLayer = "fast";
  for (const layer of layers) {
    if (layerRank[layer] > layerRank[current]) current = layer;
  }
  return current;
};

const matchesRule = (changedPath: string, rule: AffectedTestRule): boolean => {
  if (rule.match.endsWith("/")) {
    return changedPath === rule.match.slice(0, -1) || changedPath.startsWith(rule.match);
  }
  return changedPath === rule.match;
};

const rulesForPath = (changedPath: string): AffectedTestRule[] => {
  const exact = AFFECTED_TEST_RULES.filter(
    (rule) => !rule.match.endsWith("/") && matchesRule(changedPath, rule),
  );
  if (exact.length > 0) return exact;
  return AFFECTED_TEST_RULES.filter(
    (rule) => rule.match.endsWith("/") && matchesRule(changedPath, rule),
  );
};

export const isFullSuitePath = (changedPath: string): boolean =>
  FULL_SUITE_PATHS.has(normalizePath(changedPath));

export const pathNeedsTypecheck = (changedPath: string): boolean => {
  const normalized = normalizePath(changedPath);
  return (
    normalized.endsWith(".ts") ||
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".mjs") ||
    normalized === "package.json" ||
    normalized === "tsconfig.json" ||
    normalized === "vitest.config.ts" ||
    normalized === "pnpm-lock.yaml" ||
    normalized === "pnpm-workspace.yaml"
  );
};

export const inferVerificationLayer = (
  changedPaths: readonly string[],
  options: {fullSuite?: boolean} = {},
): VerificationLayer => {
  if (options.fullSuite || changedPaths.some((value) => isFullSuitePath(value))) {
    return "production";
  }
  const layers: VerificationLayer[] = [];
  for (const changed of changedPaths.map(normalizePath)) {
    if (changed.endsWith(".test.ts") && changed.startsWith("tests/")) {
      layers.push(changed.includes("media-e2e") ? "production" : "fast");
    }
    layers.push(...rulesForPath(changed).map((rule) => rule.layer));
  }
  return maxLayer(layers);
};

export const affectedTestsFor = (changedPaths: readonly string[]): string[] => {
  const tests = new Set<string>();
  for (const changed of changedPaths.map(normalizePath)) {
    if (changed.endsWith(".test.ts") && changed.startsWith("tests/")) {
      tests.add(changed);
    }
    for (const rule of rulesForPath(changed)) {
      for (const test of rule.tests) tests.add(test);
    }
  }
  return [...tests].sort();
};

export const episodeIdsFromPaths = (changedPaths: readonly string[]): string[] => {
  const ids = new Set<string>();
  for (const changed of changedPaths.map(normalizePath)) {
    if (
      !changed.startsWith("content/") &&
      !changed.startsWith("output/") &&
      !changed.startsWith("public/episodes/")
    ) {
      continue;
    }
    const match = /(?:^|\/)(episode-[a-z0-9-]+)(?:\/|$)/u.exec(changed);
    if (match?.[1]) ids.add(match[1]);
  }
  return [...ids].sort();
};

export type ChangeScope = {
  layer: VerificationLayer;
  fullSuite: boolean;
  needsTypecheck: boolean;
  needsLint: boolean;
  needsContractTests: boolean;
  affectedTests: string[];
  episodeIds: string[];
};

/** Classifies a git/CI diff so episode-only work does not pull the Vitest suite. */
export const buildChangeScope = (
  changedPaths: readonly string[],
  options: {fullSuite?: boolean} = {},
): ChangeScope => {
  const fullSuite = Boolean(
    options.fullSuite || changedPaths.some((value) => isFullSuitePath(value)),
  );
  const layer = inferVerificationLayer(changedPaths, {fullSuite});
  const needsTypecheck = fullSuite || changedPaths.some((value) => pathNeedsTypecheck(value));
  const needsContractTests = fullSuite || layer === "contract" || layer === "production";
  return {
    layer,
    fullSuite,
    needsTypecheck,
    needsLint: needsTypecheck || needsContractTests,
    needsContractTests,
    affectedTests: fullSuite ? [] : affectedTestsFor(changedPaths),
    episodeIds: episodeIdsFromPaths(changedPaths),
  };
};
