import fs from "node:fs";
import type {RoleModelBenchmarkConfig} from "../../../config/role-model-benchmark";
import type {AutoRepairDiagnosis} from "../../../schemas/role-model-auto";
import {planCatalogRepair, writeCatalogPlanToStaging} from "./catalog";
import {
  createRepairStagingRoot,
  diffStagedRepair,
  stageAllowedFiles,
  type RepairExecutor,
  type StagedRepairPatch,
} from "./executor";
import {
  assertFileSnapshotUnchanged,
  isProtectedRepairPath,
  snapshotProtectedPaths,
  snapshotRepositoryFiles,
} from "./protected";
import {writeAutoRepositoryFile} from "./paths";

export type AppliedRepair = {
  applied: boolean;
  sharedInputChanged: boolean;
  runtimeOverride: boolean;
  files: string[];
  detail: string;
  diagnosis: AutoRepairDiagnosis;
  mode: "catalog" | "candidate-output" | "executor" | "rejected";
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

const applyPatchToRepo = (repoRoot: string, patch: StagedRepairPatch): void => {
  for (const file of patch.files) {
    writeAutoRepositoryFile(repoRoot, file.path, file.content);
  }
};

export const applyAuthorizedRepair = async (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  diagnosis: AutoRepairDiagnosis;
  promptPath: string;
  config: RoleModelBenchmarkConfig;
  executor?: RepairExecutor;
}): Promise<AppliedRepair> => {
  if (input.diagnosis.target === "stop") {
    return {
      applied: false,
      sharedInputChanged: false,
      runtimeOverride: false,
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
      runtimeOverride: false,
      files: [],
      detail: "authorized candidate-output rerun",
      diagnosis: input.diagnosis,
      mode: "candidate-output",
    };
  }

  const stagingRoot = createRepairStagingRoot(input.runId);
  try {
    stageAllowedFiles(input.repoRoot, stagingRoot, input.diagnosis.allowPaths);
    const watched = [...input.diagnosis.allowPaths, ...input.diagnosis.denyPaths];
    const mainBefore = snapshotRepositoryFiles(input.repoRoot, watched);
    const protectedBefore = snapshotProtectedPaths({
      repoRoot: input.repoRoot,
      episodeId: input.episodeId,
    });

    let mode: AppliedRepair["mode"] = "catalog";
    let plan = planCatalogRepair({
      repoRoot: input.repoRoot,
      diagnosis: input.diagnosis,
      promptPath: input.promptPath,
      config: input.config,
    });

    if (input.executor) {
      await input.executor({
        diagnosis: input.diagnosis,
        allowPaths: input.diagnosis.allowPaths,
        denyPaths: input.diagnosis.denyPaths,
        repoRoot: input.repoRoot,
        episodeId: input.episodeId,
        promptPath: input.promptPath,
        stagingRoot,
        instruction: input.diagnosis.instruction,
      });
      assertFileSnapshotUnchanged(mainBefore, snapshotRepositoryFiles(input.repoRoot, watched));
      const protectedAfterExecutor = snapshotProtectedPaths({
        repoRoot: input.repoRoot,
        episodeId: input.episodeId,
      });
      if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfterExecutor)) {
        throw new Error("EXECUTOR_TOUCHED_WORKING_TREE:protected");
      }
      const staged = diffStagedRepair(input.repoRoot, stagingRoot);
      if (staged.files.length > 0) {
        mode = "executor";
        plan = {
          applied: true,
          sharedInputChanged: input.diagnosis.target === "artifact-output-contract",
          runtimeOverride: false,
          files: [...staged.files],
          detail: staged.detail,
        };
      } else if (!plan.applied) {
        return {
          applied: false,
          sharedInputChanged: false,
          runtimeOverride: false,
          files: [],
          detail: "executor and catalog produced no authorized patch",
          diagnosis: input.diagnosis,
          mode: "rejected",
        };
      } else {
        writeCatalogPlanToStaging(stagingRoot, plan);
      }
    } else if (plan.applied && plan.files.length > 0) {
      writeCatalogPlanToStaging(stagingRoot, plan);
    }

    const staged = diffStagedRepair(input.repoRoot, stagingRoot);
    const files = staged.files.map((file) => file.path);
    assertRepairAuthorization(input.diagnosis, input.episodeId, files);
    applyPatchToRepo(input.repoRoot, staged);
    return {
      applied: plan.applied || staged.files.length > 0,
      sharedInputChanged: plan.sharedInputChanged,
      runtimeOverride: plan.runtimeOverride,
      files,
      detail: plan.detail,
      diagnosis: input.diagnosis,
      mode,
    };
  } finally {
    fs.rmSync(stagingRoot, {recursive: true, force: true});
  }
};
