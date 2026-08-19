import fs from "node:fs";
import path from "node:path";
import {
  ROLE_MODEL_AUTO_CONTRACT_VERSION,
  type AutoJournalEvent,
} from "../../../schemas/role-model-auto";
import {stableJson} from "../../../stable-json";
import {autoRunRootPath, resolveAutoRepositoryPath} from "./paths";

export const autoJournalPath = (episodeId: string, runId: string): string =>
  `${autoRunRootPath(episodeId, runId)}/journal.jsonl`;

export const autoSummaryPath = (episodeId: string, runId: string): string =>
  `${autoRunRootPath(episodeId, runId)}/summary.json`;

export const createAutoJournal = (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  now: () => string;
}): {
  append: (
    phase: AutoJournalEvent["phase"],
    message: string,
    data?: Record<string, unknown>,
  ) => AutoJournalEvent;
  path: string;
} => {
  const relative = autoJournalPath(input.episodeId, input.runId);
  const absolute = resolveAutoRepositoryPath(input.repoRoot, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  let seq = 0;
  return {
    path: relative,
    append: (phase, message, data = {}) => {
      const event: AutoJournalEvent = {
        schemaVersion: ROLE_MODEL_AUTO_CONTRACT_VERSION,
        kind: "event",
        runId: input.runId,
        seq,
        at: input.now(),
        phase,
        message,
        data,
      };
      seq += 1;
      fs.appendFileSync(absolute, `${stableJson(event)}\n`);
      return event;
    },
  };
};
