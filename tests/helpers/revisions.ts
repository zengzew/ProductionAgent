import type {RevisionIssue} from "../../src/orchestration";
import {artifactFixture} from "./artifacts";

export const revisionArtifactFixture = (logicalName: string, sha256: string, revision = 1) =>
  artifactFixture({
    episodeId: "episode-revision",
    logicalName,
    sha256,
    revision,
  });

export const revisionIssueFixture = (
  input: {
    id?: string;
    severity?: RevisionIssue["severity"];
    status?: RevisionIssue["status"];
  } = {},
): RevisionIssue => {
  const artifact = revisionArtifactFixture("script", "a".repeat(64));
  return {
    id: input.id ?? "issue-target",
    category: "attention.hook",
    severity: input.severity ?? "high",
    status: input.status ?? "open",
    affectedArtifact: {
      artifactId: artifact.artifactId,
      path: artifact.path,
      sha256: artifact.sha256,
      locator: {kind: "whole-artifact", value: "script"},
    },
  };
};

export const revisionAttemptFixture = (
  revisionId: string,
  disposition: "rejected" | "quarantined" | "selected" = "rejected",
) => ({
  revisionId,
  executionId: `exec-${revisionId}`,
  ownerAgent: "script-writer" as const,
  issueIds: ["issue-target"],
  before: [revisionArtifactFixture("script", "a".repeat(64))],
  candidate: [
    revisionArtifactFixture(
      "script",
      disposition === "selected" ? "b".repeat(64) : "c".repeat(64),
      2,
    ),
  ],
  evaluations: [],
  disposition,
  regressionIds: [],
  oscillationIds: [],
  createdAt: "2026-08-08T00:00:00.000Z",
});
