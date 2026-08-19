import type {RoleModelBenchmarkConfig} from "../../../config/role-model-benchmark";
import type {AutoRepairDiagnosis} from "../../../schemas/role-model-auto";
import {applyCatalogRepair, type CatalogRepairResult} from "./catalog";
import {isProtectedRepairPath} from "./protected";

export type AppliedRepair = CatalogRepairResult & {
  diagnosis: AutoRepairDiagnosis;
  mode: "catalog" | "candidate-output" | "rejected";
};

export const assertRepairAuthorization = (
  diagnosis: AutoRepairDiagnosis,
  episodeId: string,
  files: readonly string[],
): void => {
  for (const file of files) {
    if (isProtectedRepairPath(file, episodeId)) {
      throw new Error(`PROTECTED_PATH_MUTATED:${file}`);
    }
    if (diagnosis.denyPaths.some((deny) => file === deny || file.startsWith(deny))) {
      throw new Error(`PROTECTED_PATH_MUTATED:${file}`);
    }
    if (
      diagnosis.allowPaths.length > 0 &&
      !diagnosis.allowPaths.some((allow) => file === allow || file.startsWith(allow))
    ) {
      throw new Error(`REPAIR_PATH_NOT_AUTHORIZED:${file}`);
    }
  }
};

export const applyAuthorizedRepair = (input: {
  repoRoot: string;
  episodeId: string;
  diagnosis: AutoRepairDiagnosis;
  promptPath: string;
  config: RoleModelBenchmarkConfig;
}): AppliedRepair => {
  if (input.diagnosis.target === "stop") {
    return {
      applied: false,
      sharedInputChanged: false,
      files: [],
      detail: input.diagnosis.instruction,
      diagnosis: input.diagnosis,
      mode: "rejected",
    };
  }
  if (input.diagnosis.target === "candidate-output") {
    return {
      applied: true,
      sharedInputChanged: false,
      files: [],
      detail: "authorized candidate-output rerun",
      diagnosis: input.diagnosis,
      mode: "candidate-output",
    };
  }
  const catalog = applyCatalogRepair({
    repoRoot: input.repoRoot,
    diagnosis: input.diagnosis,
    promptPath: input.promptPath,
    config: input.config,
  });
  assertRepairAuthorization(input.diagnosis, input.episodeId, catalog.files);
  return {...catalog, diagnosis: input.diagnosis, mode: catalog.applied ? "catalog" : "rejected"};
};
