import fs from "node:fs";
import path from "node:path";
import {factSchema} from "../../../schemas/episode";
import {parseDeliveryGate} from "../../../lib/delivery/delivery";
import {
  findOralReviewDecisionErrors,
  parseCriticGate,
  parseDirectorBriefGate,
  parseFactCheckGate,
  parseFinalScript,
  parseOralReviewGate,
  parseRetentionGate,
  parseViralStrategyGate,
  parseVisualPlanGate,
} from "../../../lib/editorial/story";
import type {AgentExecutionRequest, AgentName} from "../../schemas/agent";
import type {ArtifactRef} from "../../schemas/artifact";
import {evaluateScriptWriterDraft, type ScriptWriterEvaluation} from "./script-writer-evaluate";

export type RoleBenchmarkEvaluation = ScriptWriterEvaluation;

const readArtifact = (repoRoot: string, artifact: ArtifactRef): string => {
  const absolute = path.resolve(repoRoot, artifact.path);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
};

const outputFor = (
  repoRoot: string,
  outputArtifacts: readonly ArtifactRef[],
  suffix: string,
): string => {
  const artifact = outputArtifacts.find((item) => item.path.endsWith(suffix));
  return artifact ? readArtifact(repoRoot, artifact) : "";
};

const factsBoundary = (
  factsJson: string,
): {allowedClaimIds: string[]; unsupportedClaimIds: (claimIds: readonly string[]) => string[]} => {
  const facts = JSON.parse(factsJson) as unknown;
  if (!Array.isArray(facts)) throw new Error("facts.json must be an array");
  const allowed = new Map(
    facts.map((item) => {
      const fact = factSchema.parse(item);
      return [fact.id, fact.allowedInNarration && fact.confidence !== "low"] as const;
    }),
  );
  const allowedClaimIds = [...allowed.entries()]
    .filter(([, canNarrate]) => canNarrate)
    .map(([id]) => id)
    .sort();
  return {
    allowedClaimIds,
    unsupportedClaimIds: (claimIds) =>
      claimIds.filter((claimId) => allowed.get(claimId) !== true).sort(),
  };
};

const gateFailure = (failures: string[], error: unknown): void => {
  failures.push(
    error instanceof Error ? "role-output-gate-invalid" : "role-output-gate-unparseable",
  );
};

const evaluateRoleGate = (role: AgentName, output: string, failures: string[]): void => {
  try {
    if (role === "story-director") {
      const gate = parseDirectorBriefGate(output);
      if (gate.verdict !== "READY") failures.push("director-brief-not-ready");
      if (gate.blockers.length > 0 || gate.returnTo !== "none")
        failures.push("director-brief-blocked");
      return;
    }
    if (role === "viral-director") {
      const gate = parseViralStrategyGate(output);
      const floorPass = Object.values(gate.scores).every((score) => score >= 3);
      if (gate.verdict !== "READY") failures.push("viral-strategy-not-ready");
      if (gate.total < gate.threshold || !floorPass)
        failures.push("viral-strategy-threshold-failed");
      if (gate.blockers.length > 0 || gate.returnTo !== "none")
        failures.push("viral-strategy-blocked");
      return;
    }
    if (role === "oral-rewriter") {
      const segments = parseFinalScript(output);
      if (segments.some((segment) => segment.claimIds.length === 0))
        failures.push("final-script-missing-claims");
      if (!/^状态：\s*`?story-approved`?\s*$/mu.test(output))
        failures.push("final-script-not-story-approved");
      return;
    }
    if (role === "oral-judge") {
      const gate = parseOralReviewGate(output);
      const decisionErrors = findOralReviewDecisionErrors(gate);
      if (decisionErrors.length > 0) failures.push("oral-review-decision-invalid");
      if (gate.verdict !== "PASS") failures.push("oral-review-not-pass");
      return;
    }
    if (role === "audience-critic") {
      const gate = parseCriticGate(output);
      const floors = {
        hook: 9,
        conflict: 9,
        humanElement: 6,
        productClarity: 9,
        growthLogic: 9,
        technologyExplanation: 9,
        naturalChinese: 9,
      } as const;
      const floorPass = Object.entries(floors).every(
        ([dimension, floor]) => gate.scores[dimension as keyof typeof floors] >= floor,
      );
      const highRisk = gate.viewerExitRisks.some((risk) => risk.severity === "high");
      if (gate.verdict !== "PASS") failures.push("audience-critic-not-pass");
      if (gate.total < gate.threshold || !floorPass)
        failures.push("audience-critic-threshold-failed");
      if (gate.blockers.length > 0 || highRisk || gate.returnTo !== "none")
        failures.push("audience-critic-blocked");
      return;
    }
    if (role === "fact-guardian") {
      const gate = parseFactCheckGate(output);
      if (gate.verdict !== "PASS" || gate.blockers.length > 0 || gate.returnTo !== "none") {
        failures.push("fact-check-not-pass");
      }
      return;
    }
    if (role === "visual-director") {
      const gate = parseVisualPlanGate(output);
      if (
        gate.verdict !== "READY" ||
        gate.unresolvedAssets.length > 0 ||
        gate.returnTo !== "none"
      ) {
        failures.push("visual-plan-not-ready");
      }
      return;
    }
    if (role === "retention-critic") {
      const gate = parseRetentionGate(output);
      const highRisk = Object.values(gate.windows).some((window) => window.dropOffRisk === "high");
      if (gate.verdict !== "PASS" || gate.total < gate.threshold)
        failures.push("retention-threshold-failed");
      if (gate.blockers.length > 0 || highRisk || gate.returnTo !== "none")
        failures.push("retention-critic-blocked");
      return;
    }
    if (role === "delivery-critic") {
      const gate = parseDeliveryGate(output);
      if (gate.verdict !== "PASS" || gate.blockers.length > 0 || gate.returnTo !== "none") {
        failures.push("delivery-critic-not-pass");
      }
      return;
    }
    if (role === "research-analyst") {
      const facts = JSON.parse(output) as unknown;
      if (!Array.isArray(facts)) failures.push("research-facts-not-array");
      return;
    }
  } catch (error) {
    gateFailure(failures, error);
  }
};

const roleOutput = (role: AgentName, repoRoot: string, outputs: readonly ArtifactRef[]): string => {
  const suffixByRole: Partial<Record<AgentName, string>> = {
    "story-director": "/story/director-brief.md",
    "viral-director": "/story/viral-strategy.md",
    "script-writer": "/story/script-draft.md",
    "oral-rewriter": "/story/final-script.md",
    "oral-judge": "/story/oral-review.md",
    "audience-critic": "/story/critic-report.md",
    "fact-guardian": "/story/fact-check-report.md",
    "visual-director": "/story/visual-plan.md",
    "retention-critic": "/story/retention-report.md",
    "delivery-critic": "/production/delivery-critic-report.md",
    "research-analyst": "/research/facts.json",
  };
  return outputFor(repoRoot, outputs, suffixByRole[role] ?? "");
};

/**
 * Roles whose machine-readable gate binds Claims to narration evidence.
 * Only these roles are subject to the factual boundary; the Claim IDs come
 * exclusively from the gate's positive structure fields, never from a
 * full-text regex over the Markdown body.
 */
const claimBoundaryRoles = new Set<AgentName>([
  "story-director",
  "viral-director",
  "oral-rewriter",
]);

/**
 * Positive narration-evidence Claims taken from machine-readable gate fields.
 *
 * - story-director: `emotionalArc[].claimIds` (factBoundary text may name
 *   excluded Claims and must NOT count as narration evidence).
 * - viral-director: `claimIds` of the viral strategy gate.
 * - oral-rewriter: segment `Claim IDs` plus `Narration units` claim cells.
 *
 * Critic roles (oral-judge, audience-critic, fact-guardian, retention-critic)
 * and research-analyst return no narration-bound Claims: they may reference
 * any existing Claim to review, reject, or explain a blocker without that
 * reference being a factual regression.
 */
const positiveNarrationClaimIds = (role: AgentName, output: string): string[] => {
  switch (role) {
    case "story-director":
      return [
        ...new Set(parseDirectorBriefGate(output).emotionalArc.flatMap((beat) => beat.claimIds)),
      ].sort();
    case "viral-director":
      return [...new Set(parseViralStrategyGate(output).claimIds)].sort();
    case "oral-rewriter":
      return [
        ...new Set(
          parseFinalScript(output).flatMap((segment) => [
            ...segment.claimIds,
            ...segment.narrationUnits.flatMap((unit) => unit.claimIds),
          ]),
        ),
      ].sort();
    default:
      return [];
  }
};

export const evaluateRoleBenchmarkOutput = (input: {
  repoRoot: string;
  request: AgentExecutionRequest;
  outputArtifacts: readonly ArtifactRef[];
  status: "SUCCEEDED" | "FAILED";
  factsJson?: string;
}): RoleBenchmarkEvaluation => {
  const outputLength = input.outputArtifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  const output = roleOutput(input.request.agentName, input.repoRoot, input.outputArtifacts);
  if (input.request.agentName === "script-writer") {
    return evaluateScriptWriterDraft({
      markdown: output,
      factsJson: input.factsJson ?? "[]",
    });
  }

  const hardFailures: string[] = [];
  const expectedPaths = input.request.expectedOutputs.map((expected) => expected.path);
  for (const expected of expectedPaths) {
    const artifact = input.outputArtifacts.find((candidate) =>
      candidate.path.endsWith(expected.replace(/^content\/episode-[^/]+\//u, "/")),
    );
    if (!artifact || artifact.sizeBytes <= 0) {
      hardFailures.push(`missing-output:${expected}`);
    }
  }
  if (!output) hardFailures.push("role-output-empty");
  if (output) evaluateRoleGate(input.request.agentName, output, hardFailures);

  const bindsNarrationClaims = claimBoundaryRoles.has(input.request.agentName);
  let claimIds: string[] = [];
  let unsupportedClaimIds: string[] = [];
  let claimCoverage = 1;
  try {
    const facts = factsBoundary(input.factsJson ?? "[]");
    if (bindsNarrationClaims) {
      try {
        claimIds = positiveNarrationClaimIds(input.request.agentName, output);
      } catch {
        // The gate is unparseable: evaluateRoleGate already recorded
        // role-output-gate-invalid. Leave the boundary empty instead of
        // guessing Claims from free text.
        claimIds = [];
      }
      unsupportedClaimIds = facts.unsupportedClaimIds(claimIds);
      const covered = claimIds.filter((claimId) => facts.allowedClaimIds.includes(claimId)).length;
      claimCoverage =
        facts.allowedClaimIds.length === 0 ? 1 : covered / facts.allowedClaimIds.length;
    }
  } catch {
    // facts.json is a frozen input for every enabled role; an unparseable
    // file fails closed through the facts-unparseable hard failure and
    // schemaValid=false, so no unsupported Claim marking is needed here.
    hardFailures.push("facts-unparseable");
  }
  for (const claimId of unsupportedClaimIds) hardFailures.push(`unsupported-claim:${claimId}`);

  const schemaFailures = new Set([
    "role-output-empty",
    "role-output-gate-invalid",
    "role-output-gate-unparseable",
    "facts-unparseable",
    "research-facts-not-array",
  ]);
  const hasMissingOutput = hardFailures.some((failure) => failure.startsWith("missing-output:"));
  return {
    schemaValid:
      input.status === "SUCCEEDED" &&
      !hasMissingOutput &&
      hardFailures.every((failure) => !schemaFailures.has(failure)),
    hardFailures: [...new Set(hardFailures)].sort(),
    claimIds,
    unsupportedClaimIds,
    claimCoverage,
    outputLength: outputLength || Buffer.byteLength(output, "utf8"),
  };
};
