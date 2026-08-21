import {SCRIPT_DRAFT_REQUIRED_MARKERS} from "../script-writer-evaluate";
import type {
  BenchmarkCandidateResult,
  BenchmarkResult,
} from "../../../schemas/role-model-benchmark";
import type {
  AutoRepairDiagnosis,
  AutoRepairFailureClass,
  AutoRepairTarget,
} from "../../../schemas/role-model-auto";
import {isProtectedRepairPath} from "./protected";
import {readAutoRepositoryFile} from "./paths";
import {getRoleModelContract, resolveRoleContractPath} from "../role-contract";

const DENY_PATHS = [
  "config/agent-model-policy.json",
  "editorial-calibration/",
  "prompts/v4/",
  "src/lib/editorial/",
  "src/editorial-calibration/",
  "src/orchestration/agents/benchmark/script-writer-evaluate.ts",
] as const;

const allowFor = (
  target: AutoRepairTarget,
  role: BenchmarkResult["agentName"],
  episodeId: string,
  promptPath: string,
): string[] => {
  if (target === "stop" || target === "candidate-output") return [];
  if (target === "transport") {
    return [
      "src/orchestration/agents/providers/hosted-chat.ts",
      "src/orchestration/agents/adapters/hosted-agent.ts",
    ];
  }
  if (target === "adapter") return ["src/orchestration/agents/adapters/hosted-agent.ts"];
  if (target === "cli") {
    return [
      "scripts/benchmark-role.ts",
      "scripts/benchmark-auto.ts",
      "src/lib/episode/cli.ts",
      "src/lib/episode/paths.ts",
    ];
  }
  if (target === "harness") {
    return [
      "src/orchestration/agents/benchmark/role-model-benchmark.ts",
      "config/role-model-benchmark.json",
      "config/role-model-auto-repair.json",
    ];
  }
  const contract = getRoleModelContract(role);
  return [
    promptPath,
    ...contract.repairFairness.allowPaths.map((item) => resolveRoleContractPath(episodeId, item)),
  ];
};

const denyFor = (role: BenchmarkResult["agentName"], episodeId: string): string[] => [
  ...DENY_PATHS,
  ...getRoleModelContract(role).repairFairness.denyPaths.map((item) =>
    resolveRoleContractPath(episodeId, item),
  ),
  `content/${episodeId}/story/`,
  `content/${episodeId}/research/`,
];

const diagnosis = (input: {
  code: AutoRepairFailureClass;
  target: AutoRepairTarget;
  candidateId: string | null;
  evidence: string;
  role: BenchmarkResult["agentName"];
  episodeId: string;
  promptPath: string;
  instruction: string;
}): AutoRepairDiagnosis => ({
  code: input.code,
  target: input.target,
  candidateId: input.candidateId,
  evidence: input.evidence,
  allowPaths: allowFor(input.target, input.role, input.episodeId, input.promptPath).filter(
    (item) => !isProtectedRepairPath(item, input.episodeId),
  ),
  denyPaths: denyFor(input.role, input.episodeId),
  instruction: input.instruction,
});

export const promptDeclaresScriptDraftTemplate = (markdown: string): boolean =>
  SCRIPT_DRAFT_REQUIRED_MARKERS.every((marker) => markdown.includes(marker));

const classifyFailureDetail = (
  detail: string,
): {code: AutoRepairFailureClass; target: AutoRepairTarget} | undefined => {
  const lower = detail.toLowerCase();
  if (lower.includes("missing api key") || lower.includes("auth")) {
    return {code: "transport-auth", target: "stop"};
  }
  if (lower.includes("timeout") || lower.includes("超时")) {
    return {code: "transport-timeout", target: "harness"};
  }
  if (lower.includes("markdown-only")) {
    return {code: "transport-markdown-only", target: "candidate-output"};
  }
  if (lower.includes("malformed json")) {
    return {code: "transport-malformed-json", target: "candidate-output"};
  }
  if (lower.includes("undeclared output")) {
    return {code: "adapter-undeclared-output", target: "adapter"};
  }
  if (lower.includes("incomplete output")) {
    return {code: "artifact-contract-missing-fields", target: "candidate-output"};
  }
  if (lower.includes("benchmark_input_tampered")) {
    return {code: "harness-input-tampered", target: "stop"};
  }
  if (lower.includes("benchmark_canonical_tampered")) {
    return {code: "harness-canonical-tampered", target: "stop"};
  }
  return undefined;
};

const classifyCandidate = (input: {
  candidate: BenchmarkCandidateResult;
  episodeId: string;
  role: BenchmarkResult["agentName"];
  promptPath: string;
  promptHasTemplate: boolean;
}): AutoRepairDiagnosis | undefined => {
  const {candidate} = input;
  const detail = candidate.failureDetail ?? "";
  const fromDetail = detail ? classifyFailureDetail(detail) : undefined;
  if (fromDetail) {
    return diagnosis({
      ...fromDetail,
      candidateId: candidate.candidateId,
      evidence: detail || candidate.status,
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction:
        fromDetail.target === "candidate-output"
          ? "Re-issue the hosted call with the declared outputs envelope. Do not edit validators."
          : fromDetail.target === "stop"
            ? "Stop. Do not mutate protected files."
            : "Repair only the authorized transport/adapter files.",
    });
  }

  const failures = candidate.hardValidators.failures;
  if (failures.includes("script-draft-missing-segments")) {
    const target: AutoRepairTarget = input.promptHasTemplate
      ? "candidate-output"
      : "artifact-output-contract";
    return diagnosis({
      code: "artifact-contract-missing-segments",
      target,
      candidateId: candidate.candidateId,
      evidence: failures.join(","),
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction: input.promptHasTemplate
        ? "Rewrite only the candidate script-draft.md using the declared ## seg-* template."
        : "Declare the ## seg-* script-draft template in the Script Writer prompt. Do not change the evaluator.",
    });
  }

  const fieldFailures = failures.filter(
    (item) =>
      item === "script-draft-not-draft-ready" ||
      item.endsWith(":missing-section") ||
      item.endsWith(":missing-claim-ids") ||
      item.endsWith(":missing-source-identity") ||
      item.endsWith(":missing-visual-intent") ||
      item.endsWith(":missing-fact-boundary") ||
      item.endsWith(":missing-narration") ||
      item.endsWith(":invalid-target-seconds"),
  );
  if (fieldFailures.length > 0) {
    return diagnosis({
      code: "artifact-contract-missing-fields",
      target: "candidate-output",
      candidateId: candidate.candidateId,
      evidence: fieldFailures.join(","),
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction: "Repair only the candidate artifact fields. Do not relax the parser.",
    });
  }

  const structuralFailures = failures.filter(
    (item) =>
      item === "role-output-empty" ||
      item.startsWith("missing-output:") ||
      item === "role-output-gate-invalid" ||
      item === "role-output-gate-unparseable" ||
      item.endsWith("-not-ready") ||
      item.endsWith("-not-pass") ||
      item.endsWith("-blocked") ||
      item.endsWith("-threshold-failed"),
  );
  if (structuralFailures.length > 0) {
    return diagnosis({
      code: "artifact-contract-missing-fields",
      target: "candidate-output",
      candidateId: candidate.candidateId,
      evidence: structuralFailures.join(","),
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction:
        "Repair only the candidate declared outputs. Do not relax the role schema or hard validators.",
    });
  }

  const unsupported = failures.filter((item) => item.startsWith("unsupported-claim:"));
  if (unsupported.length > 0 || candidate.factualContract.unsupportedClaimCount > 0) {
    return diagnosis({
      code: "editorial-unsupported-claim",
      target: "candidate-output",
      candidateId: candidate.candidateId,
      evidence:
        unsupported.join(",") || `unsupported=${candidate.factualContract.unsupportedClaimCount}`,
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction:
        "Rewrite only the candidate draft to drop unsupported claims. Do not change validators.",
    });
  }

  if (candidate.hardValidators.status === "FAIL") {
    return diagnosis({
      code: "editorial-hard-validator",
      target: "candidate-output",
      candidateId: candidate.candidateId,
      evidence: failures.join(",") || "hard-validator-failed",
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction: "Repair only the candidate output. Do not weaken hard validators.",
    });
  }

  if (candidate.ineligibilityReasons.includes("unsupported-factual-regression")) {
    return diagnosis({
      code: "factual-regression",
      target: "candidate-output",
      candidateId: candidate.candidateId,
      evidence: "unsupported-factual-regression",
      role: input.role,
      episodeId: input.episodeId,
      promptPath: input.promptPath,
      instruction: "Repair only the candidate output. Do not change Claim validators.",
    });
  }

  return undefined;
};

export const diagnoseBenchmarkResult = (input: {
  repoRoot: string;
  result: BenchmarkResult;
  promptPath: string;
}): AutoRepairDiagnosis[] => {
  const promptHasTemplate = (() => {
    try {
      return promptDeclaresScriptDraftTemplate(
        readAutoRepositoryFile(input.repoRoot, input.promptPath),
      );
    } catch {
      return false;
    }
  })();
  const diagnoses: AutoRepairDiagnosis[] = [];
  for (const candidate of input.result.candidates) {
    const found = classifyCandidate({
      candidate,
      episodeId: input.result.episodeId,
      role: input.result.agentName,
      promptPath: input.promptPath,
      promptHasTemplate,
    });
    if (found) diagnoses.push(found);
  }
  return diagnoses;
};

export const selectRepair = (
  diagnoses: readonly AutoRepairDiagnosis[],
): AutoRepairDiagnosis | undefined => {
  const rank = (target: AutoRepairTarget): number => {
    if (target === "stop") return 0;
    if (target === "artifact-output-contract") return 1;
    if (
      target === "transport" ||
      target === "adapter" ||
      target === "cli" ||
      target === "harness"
    ) {
      return 2;
    }
    if (target === "candidate-output") return 3;
    return 9;
  };
  return [...diagnoses].sort((left, right) => rank(left.target) - rank(right.target))[0];
};

export const candidateOutputRepairAppendix = (diagnosis: AutoRepairDiagnosis): string =>
  [
    "CANDIDATE OUTPUT REPAIR:",
    `Failure class: ${diagnosis.code}`,
    `Evidence: ${diagnosis.evidence}`,
    diagnosis.instruction,
    'ONLY return one JSON object {"outputs":[...]}.',
    "Every declared output must be returned exactly once with its declared artifactId, path, and schemaVersion.",
    "Do not invent claims. Do not edit validators, Goal 3.2, or canonical files.",
  ].join("\n");
