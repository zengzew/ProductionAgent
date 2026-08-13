import type {AgentName} from "../orchestration/schemas/agent";
import {loadDatasetRecords} from "./loader-internal";
import type {ModalityName} from "./schemas";

export type GoldenLoadPurpose = "regression-evaluation";

export const loadGoldenSamples = (options: {
  manifestPath: string;
  role?: AgentName;
  requiredModalities?: readonly ModalityName[];
  purpose: GoldenLoadPurpose;
}) => {
  if (options.purpose !== "regression-evaluation") {
    throw new Error("Golden samples are restricted to regression evaluation");
  }
  return loadDatasetRecords({
    manifestPath: options.manifestPath,
    expectedDataset: "golden",
    role: options.role,
    requiredModalities: options.requiredModalities,
  }).map(({sample}) => sample);
};
