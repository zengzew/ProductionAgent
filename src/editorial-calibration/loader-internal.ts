import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {AgentName} from "../orchestration/schemas/agent";
import {
  editorialDatasetManifestSchema,
  editorialSampleSchema,
  type EditorialDatasetManifest,
  type EditorialDatasetName,
  type EditorialSample,
  type ModalityName,
} from "./schemas";

export interface DatasetLoadOptions {
  manifestPath: string;
  expectedDataset: EditorialDatasetName;
  role?: AgentName;
  requiredModalities?: readonly ModalityName[];
}

export interface LoadedEditorialRecord {
  sample: EditorialSample;
  manifest: EditorialDatasetManifest;
  recordPath: string;
}

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

const hashFile = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const sortedEntries = (manifest: EditorialDatasetManifest) =>
  [...manifest.entries].sort((left, right) => {
    const leftKey = `${left.sampleId}\u0000${left.recordVersion}\u0000${left.path}`;
    const rightKey = `${right.sampleId}\u0000${right.recordVersion}\u0000${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

const resolveContainedRecord = (manifestPath: string, relativePath: string): string => {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Editorial record path must be relative: ${relativePath}`);
  }
  const manifestDirectory = fs.realpathSync(path.dirname(manifestPath));
  const recordPath = path.resolve(manifestDirectory, relativePath);
  const realRecordPath = fs.realpathSync(recordPath);
  if (
    realRecordPath !== manifestDirectory &&
    !realRecordPath.startsWith(`${manifestDirectory}${path.sep}`)
  ) {
    throw new Error(`Editorial record escapes its dataset directory: ${relativePath}`);
  }
  return realRecordPath;
};

const verifyApproval = (
  sample: EditorialSample,
  dataset: EditorialDatasetName,
  roles: readonly AgentName[],
): void => {
  if (sample.review.status !== "approved") {
    throw new Error(`${sample.sampleId} is not explicitly human-approved`);
  }
  if (sample.review.reviewer.kind !== "human") {
    throw new Error(`${sample.sampleId} approval is not human`);
  }
  if (sample.review.approvedFor.dataset !== dataset) {
    throw new Error(`${sample.sampleId} approval does not cover ${dataset}`);
  }
  if (sample.datasetMembership.length !== 1 || sample.datasetMembership[0] !== dataset) {
    throw new Error(`${sample.sampleId} record membership does not match ${dataset}`);
  }
  for (const role of roles) {
    if (!sample.review.approvedFor.roles.includes(role)) {
      throw new Error(`${sample.sampleId} approval does not cover role ${role}`);
    }
  }
  if (
    sample.origin.kind === "productionagent-generated" &&
    dataset === "reference" &&
    !sample.review.allowProductionAgentGenerated
  ) {
    throw new Error(
      `${sample.sampleId} is ProductionAgent output without explicit promotion approval`,
    );
  }
};

export const loadDatasetRecords = ({
  manifestPath,
  expectedDataset,
  role,
  requiredModalities = [],
}: DatasetLoadOptions): LoadedEditorialRecord[] => {
  const manifest = editorialDatasetManifestSchema.parse(readJson(manifestPath));
  if (manifest.dataset !== expectedDataset) {
    throw new Error(
      `Refusing ${manifest.dataset} manifest through ${expectedDataset} loader: ${manifestPath}`,
    );
  }

  const loaded: LoadedEditorialRecord[] = [];
  for (const entry of sortedEntries(manifest)) {
    if (role && !entry.roles.includes(role)) continue;
    const recordPath = resolveContainedRecord(manifestPath, entry.path);
    const actualHash = hashFile(recordPath);
    if (actualHash !== entry.sha256) {
      throw new Error(`Editorial record hash mismatch: ${entry.sampleId}@${entry.recordVersion}`);
    }
    const sample = editorialSampleSchema.parse(readJson(recordPath));
    if (sample.sampleId !== entry.sampleId || sample.recordVersion !== entry.recordVersion) {
      throw new Error(`Editorial record identity mismatch: ${entry.path}`);
    }
    verifyApproval(sample, manifest.dataset, entry.roles);
    if (
      requiredModalities.some((modality) => sample.modalityChecks[modality].status !== "checked")
    ) {
      continue;
    }
    loaded.push({sample, manifest, recordPath});
  }
  return loaded;
};
