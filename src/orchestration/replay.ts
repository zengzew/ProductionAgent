import {assertArtifactRefsBytes, assertArtifactRefsSelected} from "./artifact-registry";
import {restoreVerifiedCheckpoint, type VerifiedCheckpoint} from "./checkpoint";
import {assertExecutionLogMatchesState, verifyExecutionEventLog} from "./observability";
import type {ExecutionEvent} from "./schemas/execution-event";
import type {ProductionState} from "./state";

const stateArtifactRefs = (state: ProductionState) => [
  ...(state.contentManifestRef ? [state.contentManifestRef] : []),
  ...Object.values(state.artifacts),
];

const uniqueRefs = (state: ProductionState) => [
  ...new Map(
    stateArtifactRefs(state).map((ref) => [`${ref.artifactId}:${ref.revision}:${ref.sha256}`, ref]),
  ).values(),
];

export type VerifiedReplayState = VerifiedCheckpoint & {
  events: ExecutionEvent[];
  eventLogSha256: string;
};

/**
 * Strict replay boundary. It restores only the persisted checkpoint, verifies the event-log
 * digest/order, and checks every referenced artifact's current bytes and selected registry
 * version before a caller may resume a graph.
 */
export const restoreVerifiedReplayState = async (input: {
  checkpointer: Parameters<typeof restoreVerifiedCheckpoint>[0]["checkpointer"];
  config: Parameters<typeof restoreVerifiedCheckpoint>[0]["config"];
  repoRoot: string;
  eventLogPath: string;
  expectedEventLogSha256: string;
}): Promise<VerifiedReplayState> => {
  const checkpoint = await restoreVerifiedCheckpoint({
    checkpointer: input.checkpointer,
    config: input.config,
  });
  const refs = uniqueRefs(checkpoint.state);
  assertArtifactRefsBytes(input.repoRoot, refs, {boundary: "checkpoint-resume"});
  assertArtifactRefsSelected(input.repoRoot, refs);
  const eventLog = verifyExecutionEventLog({
    filePath: input.eventLogPath,
    expectedSha256: input.expectedEventLogSha256,
    episodeId: checkpoint.state.episodeId,
  });
  assertExecutionLogMatchesState({events: eventLog.events, state: checkpoint.state});
  return {
    ...checkpoint,
    events: eventLog.events,
    eventLogSha256: eventLog.sha256,
  };
};
