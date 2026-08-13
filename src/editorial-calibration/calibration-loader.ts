import type {AgentName} from "../orchestration/schemas/agent";
import {loadDatasetRecords} from "./loader-internal";
import {calibrationRoleNameSchema, type ModalityName} from "./schemas";

export const loadCalibrationSamples = (options: {
  manifestPath: string;
  role: AgentName;
  requiredModalities?: readonly ModalityName[];
}) => {
  calibrationRoleNameSchema.parse(options.role);
  return loadDatasetRecords({
    manifestPath: options.manifestPath,
    expectedDataset: "calibration",
    role: options.role,
    requiredModalities: options.requiredModalities,
  }).map(({sample}) => sample);
};
