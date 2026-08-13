import fs from "node:fs";
import path from "node:path";
import type {AgentName} from "../orchestration/schemas/agent";
import {loadDatasetRecords} from "./loader-internal";
import type {EditorialSample, ModalityName} from "./schemas";

export interface ReferenceLoadOptions {
  manifestPath: string;
  role: AgentName;
  requiredModalities?: readonly ModalityName[];
  legacyStyleApprovedDirectory?: string;
}

export interface GenerationSafeReference {
  sampleId: string;
  recordVersion: string;
  title: string;
  role: AgentName;
  roleGuidance: string;
  exclusions: string[];
  analysis: {
    scriptAndNarration: string;
    narrativeArchitecture: string;
    visualLanguage: string;
    audioAndCaptions: string;
    crossModalSync: string;
    retentionAndPayoff: string;
  };
  transferablePatterns: EditorialSample["analysis"]["transferablePatterns"];
}

export interface LegacyApprovedStyleSample {
  source: "style/approved";
  role: "oral-rewriter";
  file: string;
  content: string;
}

const toGenerationSafeReference = (
  sample: EditorialSample,
  role: AgentName,
): GenerationSafeReference => {
  const mapping = sample.roleMappings.find((candidate) => candidate.role === role);
  if (!mapping) {
    throw new Error(`${sample.sampleId} manifest role ${role} has no role mapping`);
  }
  const patternIds = new Set(mapping.patternIds);
  return {
    sampleId: sample.sampleId,
    recordVersion: sample.recordVersion,
    title: sample.title,
    role,
    roleGuidance: mapping.use,
    exclusions: mapping.exclusions,
    analysis: {
      scriptAndNarration: sample.analysis.scriptAndNarration.summary,
      narrativeArchitecture: sample.analysis.narrativeArchitecture.summary,
      visualLanguage: sample.analysis.visualLanguage.summary,
      audioAndCaptions: sample.analysis.audioAndCaptions.summary,
      crossModalSync: sample.analysis.crossModalSync.summary,
      retentionAndPayoff: sample.analysis.retentionAndPayoff.summary,
    },
    transferablePatterns: sample.analysis.transferablePatterns.filter(
      (pattern) => patternIds.has(pattern.patternId) && pattern.applicableRoles.includes(role),
    ),
  };
};

export const loadLegacyApprovedStyleSamples = (
  directory: string,
  role: AgentName,
): LegacyApprovedStyleSample[] => {
  if (role !== "oral-rewriter" || !fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, {withFileTypes: true})
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== "README.md" &&
        [".md", ".txt"].includes(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((file) => ({
      source: "style/approved" as const,
      role: "oral-rewriter" as const,
      file,
      content: fs.readFileSync(path.join(directory, file), "utf8"),
    }));
};

export const loadRoleReferences = ({
  manifestPath,
  role,
  requiredModalities,
  legacyStyleApprovedDirectory,
}: ReferenceLoadOptions): {
  references: GenerationSafeReference[];
  legacyApprovedStyle: LegacyApprovedStyleSample[];
} => ({
  references: loadDatasetRecords({
    manifestPath,
    expectedDataset: "reference",
    role,
    requiredModalities,
  }).map(({sample}) => toGenerationSafeReference(sample, role)),
  legacyApprovedStyle: legacyStyleApprovedDirectory
    ? loadLegacyApprovedStyleSamples(legacyStyleApprovedDirectory, role)
    : [],
});
