import fs from "node:fs";
import path from "node:path";
import {
  createSqliteCheckpointer,
  resumeAfterStubApproval,
  type LocalCheckpointer,
} from "./lg-compat";

export const DEFAULT_CHECKPOINT_PATH = ".orchestration/checkpoints.sqlite";

export const createLocalCheckpoint = (input: {
  repoRoot: string;
  databasePath?: string;
}): LocalCheckpointer => {
  const requested = input.databasePath ?? DEFAULT_CHECKPOINT_PATH;
  const absolutePath = path.resolve(input.repoRoot, requested);
  const relative = path.relative(input.repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("checkpoint path must stay inside the repository");
  }
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  return createSqliteCheckpointer(absolutePath);
};

export const checkpointConfig = (episodeId: string) => ({
  configurable: {thread_id: episodeId},
});

// The concrete Command generic includes graph node names and must not leak past
// lg-compat. `never` keeps callers framework-neutral while preserving the runtime value.
export const resumeCheckpoint = (value: unknown): never => resumeAfterStubApproval(value) as never;
