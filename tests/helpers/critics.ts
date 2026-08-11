import {
  criticRubrics,
  legacyReturnTo,
  recomputeCriticEvaluation,
  type ArtifactRef,
  type ContentCriticName,
  type ContentCriticOutput,
  type CriticIssue,
  type CriticName,
  type CriticResult,
} from "../../src/orchestration";
import {artifactFixture, writeArtifactFixture} from "./artifacts";

type ScoreOverrides = Partial<Record<string, number>>;

const passingScoreValues: Readonly<Record<CriticName, Readonly<Record<string, number>>>> = {
  "oral-judge": {chineseNaturalness: 4, spokenDelivery: 4, informationFidelity: 4},
  "audience-critic": {
    hook: 13,
    conflict: 13,
    humanElement: 8,
    productClarity: 13,
    growthLogic: 13,
    technologyExplanation: 13,
    naturalChinese: 13,
  },
  "fact-guardian": {
    claimCoverage: 1,
    semanticFidelity: 1,
    sourceIdentityAttribution: 1,
    metricAndTimeScope: 1,
    causalityInferenceBoundary: 1,
    visualTruthBoundary: 1,
  },
  "retention-critic": {
    first3Seconds: 20,
    first30Seconds: 20,
    midVideoEngagement: 20,
    endingSatisfaction: 20,
  },
  "compliance-critic": {platformPolicy: 1, advertisingLanguage: 1, brandSafety: 1},
  "delivery-critic": {
    artifactIntegrity: 1,
    durationAndVerticalFormat: 1,
    captionIntegrityAndTiming: 1,
    audioIntelligibilityAndSync: 1,
    firstFrameComprehension: 1,
    evidenceRightsReadability: 1,
    renderContinuitySafeArea: 1,
  },
};

export const criticVersionFixture = (critic: CriticName): string => criticRubrics[critic].version;

export const criticScoresFixture = (
  critic: CriticName,
  overrides: ScoreOverrides = {},
): Array<{id: string; score: number; evidenceIssueIds: string[]}> =>
  criticRubrics[critic].dimensions.map(({id}) => ({
    id,
    score: overrides[id] ?? passingScoreValues[critic][id]!,
    evidenceIssueIds: [],
  }));

export const criticIssueFixture = (
  input: {
    critic?: CriticName;
    category?: CriticIssue["category"];
    id?: string;
    severity?: CriticIssue["severity"];
    status?: CriticIssue["status"];
    artifact?: ArtifactRef;
    ownerAgent?: CriticIssue["ownerAgent"];
    routeTarget?: CriticIssue["routeTarget"];
  } = {},
): CriticIssue => {
  const critic = input.critic ?? "audience-critic";
  const artifact = input.artifact ?? artifactFixture();
  const ownerAgent = input.ownerAgent ?? "script-writer";
  const routeTarget = input.routeTarget ?? ownerAgent;
  return {
    id: input.id ?? `issue-${critic}-r1-01`,
    category: input.category ?? "attention.hook",
    severity: input.severity ?? "high",
    status: input.status ?? "open",
    ownerAgent,
    routeTarget,
    affectedArtifact: {
      artifactId: artifact.artifactId,
      path: artifact.path,
      sha256: artifact.sha256,
      locator: {kind: "whole-artifact", value: artifact.artifactId},
    },
    evidence: [
      {
        kind: "artifact-observation",
        observed: "fixture observation",
        expected: "fixture expectation",
        claimIds: [],
      },
    ],
    suggestedCorrection: {
      objective: "correct the fixture issue",
      acceptanceChecks: ["the fixture issue is resolved"],
    },
    constraintsNotToBreak: [
      {
        id: "fixture-constraint",
        description: "preserve the fixture contract",
        artifactRefs: [artifact],
        claimIds: [],
      },
    ],
  };
};

export const criticResultFixture = (input: {
  critic: CriticName;
  episodeId?: string;
  executionId?: string;
  round?: number;
  reviewedArtifacts?: ArtifactRef[];
  scores?: ScoreOverrides;
  issues?: CriticIssue[];
  rubricVersion?: string;
  dimensionFloors?: Record<string, number>;
  passedThresholds?: boolean;
  verdict?: "PASS" | "REJECT";
}): CriticResult => {
  const canonicalRubricVersion = criticVersionFixture(input.critic);
  const issues = input.issues ?? [];
  const computed = recomputeCriticEvaluation({
    critic: input.critic,
    rubricVersion: canonicalRubricVersion,
    dimensions: criticScoresFixture(input.critic, input.scores),
    issues,
  });
  return {
    schemaVersion: "critic-output-v1",
    episodeId: input.episodeId ?? "episode-test",
    executionId: input.executionId ?? `exec-${input.critic}`,
    critic: input.critic,
    round: input.round ?? 1,
    rubricVersion: input.rubricVersion ?? canonicalRubricVersion,
    reviewedArtifacts: input.reviewedArtifacts ?? [artifactFixture()],
    evaluation: {
      ...computed.evaluation,
      ...(input.dimensionFloors ? {dimensionFloors: input.dimensionFloors} : {}),
      ...(input.passedThresholds === undefined ? {} : {passedThresholds: input.passedThresholds}),
    },
    issues,
    blockers: computed.blockers,
    verdict: input.verdict ?? computed.verdict,
    primaryRoute: null,
    returnTo: "none",
  };
};

export const allPassingCriticResultsFixture = (episodeId = "episode-test"): CriticResult[] =>
  (Object.keys(criticRubrics) as CriticName[]).map((critic) =>
    criticResultFixture({critic, episodeId}),
  );

export const routedCriticResultFixture = (
  input: Parameters<typeof criticResultFixture>[0],
): CriticResult => {
  const result = criticResultFixture(input);
  const primary = result.issues[0];
  const route =
    result.verdict === "REJECT" && primary
      ? {
          ownerAgent: primary.ownerAgent,
          routeTarget: primary.routeTarget,
          restartAt: primary.routeTarget,
          reasonCode: primary.category,
          issueIds: result.issues.map((issue) => issue.id),
        }
      : null;
  return {
    ...result,
    primaryRoute: route,
    returnTo: route === null ? "none" : legacyReturnTo(result.critic, route.routeTarget),
  };
};

export const contentCriticOutputFixture = (input: {
  repoRoot: string;
  episodeId: string;
  critic: ContentCriticName;
  round: number;
  executionId: string;
  reviewedArtifacts: ArtifactRef[];
  issues?: CriticIssue[];
  scores?: ScoreOverrides;
}): ContentCriticOutput => {
  const issues = input.issues ?? [];
  const result = criticResultFixture({...input, issues});
  const route =
    result.verdict === "REJECT"
      ? {
          ownerAgent: "viral-director" as const,
          routeTarget: "viral-director" as const,
          restartAt: "viral-director",
          reasonCode: "attention.hook" as const,
          issueIds: issues.map((issue) => issue.id),
        }
      : null;
  return {
    result: {
      ...result,
      primaryRoute: route,
      returnTo: route === null ? "none" : legacyReturnTo(input.critic, route.routeTarget),
    },
    resultRef: writeArtifactFixture({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
      artifactId: `${input.episodeId}:reports:${input.critic}-r${input.round}`,
      relativePath: `content/${input.episodeId}/reports/${input.critic}-r${input.round}.md`,
      body: "reference-only critic report\n",
      producer: input.critic,
    }),
  };
};
