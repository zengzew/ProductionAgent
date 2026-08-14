import crypto from "node:crypto";
import {stableJson} from "./stable-json";
import {assertReferenceOnlyState, type ProductionState} from "./state";

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

/**
 * Hashes only the persisted production state channels. LangGraph framework metadata,
 * checkpoint ids, and transport ordering are deliberately outside this control hash.
 */
export const productionStateControlHash = (state: ProductionState): string =>
  sha256(stableJson(assertReferenceOnlyState(state)));

export class CheckpointIntegrityError extends Error {
  readonly code:
    | "CHECKPOINT_CONTROL_HASH_MISSING"
    | "CHECKPOINT_CONTROL_HASH_MISMATCH"
    | "CHECKPOINT_STATE_REFERENCE_ONLY_VIOLATION";

  constructor(code: CheckpointIntegrityError["code"], message: string) {
    super(`[${code}] ${message}`);
    this.name = "CheckpointIntegrityError";
    this.code = code;
  }
}

export const assertCheckpointControlHash = (input: {
  state: ProductionState;
  expectedHash: unknown;
  requireHash?: boolean;
}): string => {
  let actual: string;
  try {
    actual = productionStateControlHash(input.state);
  } catch (error) {
    throw new CheckpointIntegrityError(
      "CHECKPOINT_STATE_REFERENCE_ONLY_VIOLATION",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (input.expectedHash === undefined || input.expectedHash === null) {
    if (input.requireHash) {
      throw new CheckpointIntegrityError(
        "CHECKPOINT_CONTROL_HASH_MISSING",
        `checkpoint for ${input.state.episodeId} has no persisted production-state control hash`,
      );
    }
    return actual;
  }
  if (typeof input.expectedHash !== "string" || !/^[a-f0-9]{64}$/u.test(input.expectedHash)) {
    throw new CheckpointIntegrityError(
      "CHECKPOINT_CONTROL_HASH_MISMATCH",
      `checkpoint for ${input.state.episodeId} has an invalid production-state control hash`,
    );
  }
  if (input.expectedHash !== actual) {
    throw new CheckpointIntegrityError(
      "CHECKPOINT_CONTROL_HASH_MISMATCH",
      `checkpoint for ${input.state.episodeId} does not match its persisted production-state control hash`,
    );
  }
  return actual;
};
