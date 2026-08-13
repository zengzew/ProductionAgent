import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import type {AgentName} from "../src/orchestration/schemas/agent";
import {loadCalibrationSamples} from "../src/editorial-calibration/calibration-loader";
import {loadGoldenSamples} from "../src/editorial-calibration/golden-loader";
import * as generationSafeApi from "../src/editorial-calibration/index";
import {
  loadLegacyApprovedStyleSamples,
  loadRoleReferences,
} from "../src/editorial-calibration/reference-loader";
import {
  editorialDatasetManifestSchema,
  editorialHumanFeedbackSchema,
  editorialPromptPolicySchema,
  editorialRegistrySchema,
  editorialSampleSchema,
  type EditorialDatasetName,
} from "../src/editorial-calibration/schemas";

const temporaryDirectories: string[] = [];
const checkedAt = "2026-08-13T17:00:00+08:00";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

const temporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-calibration-"));
  temporaryDirectories.push(directory);
  return directory;
};

const checkedModality = () => ({
  status: "checked",
  checkedAt,
  method: "fixture inspection",
  evidence: ["fixture evidence"],
  limitations: [],
});

const makeSample = ({
  id,
  dataset = "reference",
  roles = ["story-director"],
  approval = "approved",
  unavailableAudio = false,
  unavailableVideo = false,
  origin = "third-party",
  marker = "fixture",
}: {
  id: string;
  dataset?: EditorialDatasetName;
  roles?: AgentName[];
  approval?: "approved" | "pending";
  unavailableAudio?: boolean;
  unavailableVideo?: boolean;
  origin?: "third-party" | "productionagent-generated";
  marker?: string;
}) => {
  const patternId = `${id}-transfer`;
  const evidenceModalities = unavailableVideo ? ["video"] : ["video", "metadata"];
  const dimension = {
    summary: marker,
    evidence: [
      {
        timeRange: {startSeconds: 0, endSeconds: 2},
        observation: marker,
        modalities: evidenceModalities,
      },
    ],
  };
  return {
    schemaVersion: "editorial-sample-v1",
    sampleId: id,
    recordVersion: "1.0.0",
    title: id,
    language: "zh-CN",
    source: {
      platform: "fixture",
      canonicalUrl: `https://example.com/${id}`,
      sourceId: id,
      pageTitle: id,
      capturedAt: checkedAt,
      provenance: {
        suppliedBy: "test",
        acquisition: "fixture",
        mediaStoredInRepository: false,
        notes: [],
      },
    },
    origin:
      origin === "third-party"
        ? {kind: "third-party"}
        : {kind: "productionagent-generated", episodeId: "episode-fixture"},
    durationSeconds: 10,
    review:
      approval === "approved"
        ? {
            status: "approved",
            reviewer: {kind: "human", id: "fixture-reviewer"},
            reviewedAt: checkedAt,
            decisionId: `decision-${id}`,
            approvedFor: {dataset, roles},
            allowProductionAgentGenerated: false,
            rationale: "fixture approval",
          }
        : {
            status: "pending",
            submittedAt: checkedAt,
            requestedDataset: dataset,
            requestedRoles: roles,
            note: "awaiting human approval",
          },
    datasetMembership: approval === "approved" ? [dataset] : [],
    proposedUse: {dataset, roles, rationale: "fixture use"},
    modalityChecks: {
      video: unavailableVideo
        ? {status: "unavailable", reason: "fixture video unavailable"}
        : checkedModality(),
      audio: unavailableAudio
        ? {status: "unavailable", reason: "fixture audio unavailable"}
        : checkedModality(),
      transcript: checkedModality(),
      captions: checkedModality(),
      metadata: checkedModality(),
    },
    analysis: {
      scriptAndNarration: dimension,
      narrativeArchitecture: dimension,
      visualLanguage: dimension,
      audioAndCaptions: dimension,
      crossModalSync: dimension,
      retentionAndPayoff: dimension,
      transferablePatterns: [
        {
          patternId,
          name: marker,
          description: marker,
          evidenceRanges: [{startSeconds: 0, endSeconds: 2}],
          applicableRoles: roles,
          guardrail: "do not copy product-specific claims",
        },
      ],
      productSpecificPatterns: [
        {
          patternId: `${id}-specific`,
          name: marker,
          description: marker,
          evidenceRanges: [{startSeconds: 0, endSeconds: 2}],
          applicableRoles: roles,
          guardrail: "never transfer this fact",
        },
      ],
    },
    roleMappings: roles.map((role) => ({
      role,
      use: `use ${patternId}`,
      exclusions: ["product-specific facts"],
      patternIds: [patternId],
    })),
    transcriptPolicy: {
      fullTranscriptStored: false,
      storedMaterial: "structured paraphrase only",
    },
  };
};

const writeDataset = (
  root: string,
  dataset: EditorialDatasetName,
  records: Array<{sample: ReturnType<typeof makeSample>; roles: AgentName[]}>,
): string => {
  const datasetDirectory = path.join(root, dataset);
  const recordsDirectory = path.join(datasetDirectory, "records");
  fs.mkdirSync(recordsDirectory, {recursive: true});
  const entries = records.map(({sample, roles}) => {
    const recordPath = path.join(recordsDirectory, `${sample.sampleId}.json`);
    const content = `${JSON.stringify(sample, null, 2)}\n`;
    fs.writeFileSync(recordPath, content);
    return {
      sampleId: sample.sampleId,
      recordVersion: sample.recordVersion,
      path: `records/${sample.sampleId}.json`,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      roles,
    };
  });
  const manifestPath = path.join(datasetDirectory, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "editorial-dataset-manifest-v1",
        dataset,
        version: "1.0.0",
        createdAt: checkedAt,
        entries,
      },
      null,
      2,
    )}\n`,
  );
  return manifestPath;
};

describe("editorial calibration datasets", () => {
  it("filters reference samples by the approved role", () => {
    const root = temporaryDirectory();
    const manifestPath = writeDataset(root, "reference", [
      {sample: makeSample({id: "visual", roles: ["visual-director"]}), roles: ["visual-director"]},
      {sample: makeSample({id: "story", roles: ["story-director"]}), roles: ["story-director"]},
    ]);

    const result = loadRoleReferences({manifestPath, role: "story-director"});

    expect(result.references.map((sample) => sample.sampleId)).toEqual(["story"]);
    expect(JSON.stringify(result)).not.toContain("visual-transfer");
  });

  it("rejects manifest membership without explicit human approval", () => {
    const root = temporaryDirectory();
    const manifestPath = writeDataset(root, "reference", [
      {
        sample: makeSample({id: "pending", approval: "pending"}),
        roles: ["story-director"],
      },
    ]);

    expect(() => loadRoleReferences({manifestPath, role: "story-director"})).toThrow(
      /not explicitly human-approved/u,
    );
  });

  it("prevents calibration and golden leakage into generation context", async () => {
    const root = temporaryDirectory();
    const referenceManifest = writeDataset(root, "reference", [
      {
        sample: makeSample({id: "reference-safe", marker: "REFERENCE_VISIBLE"}),
        roles: ["story-director"],
      },
    ]);
    const calibrationManifest = writeDataset(root, "calibration", [
      {
        sample: makeSample({
          id: "calibration-hidden",
          dataset: "calibration",
          roles: ["retention-critic"],
          marker: "CALIBRATION_SECRET",
        }),
        roles: ["retention-critic"],
      },
    ]);
    const goldenManifest = writeDataset(root, "golden", [
      {
        sample: makeSample({
          id: "golden-hidden",
          dataset: "golden",
          marker: "GOLDEN_SECRET",
        }),
        roles: ["story-director"],
      },
    ]);

    const generationContext = loadRoleReferences({
      manifestPath: referenceManifest,
      role: "story-director",
    });
    expect(JSON.stringify(generationContext)).toContain("REFERENCE_VISIBLE");
    expect(JSON.stringify(generationContext)).not.toMatch(/CALIBRATION_SECRET|GOLDEN_SECRET/u);
    expect(() =>
      loadRoleReferences({manifestPath: goldenManifest, role: "story-director"}),
    ).toThrow(/Refusing golden manifest/u);
    expect("loadGoldenSamples" in generationSafeApi).toBe(false);
    expect("loadCalibrationSamples" in generationSafeApi).toBe(false);

    expect(
      loadCalibrationSamples({manifestPath: calibrationManifest, role: "retention-critic"})[0]
        ?.sampleId,
    ).toBe("calibration-hidden");
    expect(
      loadGoldenSamples({
        manifestPath: goldenManifest,
        purpose: "regression-evaluation",
      })[0]?.sampleId,
    ).toBe("golden-hidden");
  });

  it("rejects claims based on an unavailable modality and filters required modalities", () => {
    expect(() =>
      editorialSampleSchema.parse(makeSample({id: "invalid-video", unavailableVideo: true})),
    ).toThrow(/unchecked modality: video/u);

    const root = temporaryDirectory();
    const manifestPath = writeDataset(root, "reference", [
      {
        sample: makeSample({id: "no-audio", unavailableAudio: true}),
        roles: ["story-director"],
      },
    ]);
    expect(
      loadRoleReferences({
        manifestPath,
        role: "story-director",
        requiredModalities: ["audio"],
      }).references,
    ).toEqual([]);
  });

  it("loads manifest entries in a deterministic order", () => {
    const root = temporaryDirectory();
    const manifestPath = writeDataset(root, "reference", [
      {sample: makeSample({id: "z-last"}), roles: ["story-director"]},
      {sample: makeSample({id: "a-first"}), roles: ["story-director"]},
    ]);

    const load = () =>
      loadRoleReferences({manifestPath, role: "story-director"}).references.map(
        (sample) => sample.sampleId,
      );
    expect(load()).toEqual(["a-first", "z-last"]);
    expect(load()).toEqual(load());
  });

  it("keeps style/approved compatibility scoped to oral-rewriter", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, "README.md"), "instructions");
    fs.writeFileSync(path.join(directory, "z-last.txt"), "last");
    fs.writeFileSync(path.join(directory, "a-first.md"), "first");
    fs.writeFileSync(path.join(directory, "ignored.json"), "{}\n");

    expect(loadLegacyApprovedStyleSamples(directory, "story-director")).toEqual([]);
    expect(
      loadLegacyApprovedStyleSamples(directory, "oral-rewriter").map((sample) => sample.file),
    ).toEqual(["a-first.md", "z-last.txt"]);
  });

  it("does not allow ProductionAgent output to self-promote into reference", () => {
    const generated = makeSample({id: "self-output", origin: "productionagent-generated"});
    expect(() => editorialSampleSchema.parse(generated)).toThrow(
      /without explicit human approval/u,
    );
  });

  it("keeps human editorial feedback structured but outside approval and generation context", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const calibrationRoot = path.join(repositoryRoot, "editorial-calibration");
    const registry = editorialRegistrySchema.parse(
      JSON.parse(fs.readFileSync(path.join(calibrationRoot, "registry.json"), "utf8")),
    );
    const feedbackFiles = fs
      .readdirSync(path.join(calibrationRoot, registry.humanFeedbackDirectory))
      .filter((file) => file.endsWith(".json"))
      .sort();
    expect(feedbackFiles).toEqual(["visual-density-narrative-tension-v1.json"]);

    const feedback = editorialHumanFeedbackSchema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(calibrationRoot, registry.humanFeedbackDirectory, feedbackFiles[0]!),
          "utf8",
        ),
      ),
    );
    expect(feedback.scope.sampleIds).toHaveLength(4);
    expect(feedback.sampleGrounding.map((item) => item.sampleId).sort()).toEqual(
      [...feedback.scope.sampleIds].sort(),
    );
    expect(feedback.boundaries).toMatchObject({
      datasetApprovalGranted: false,
      promptTuningAuthorized: false,
      automaticPromotionAllowed: false,
    });
    expect("editorialHumanFeedbackSchema" in generationSafeApi).toBe(false);
  });

  it("integrates approved findings as role-scoped policy without approving or loading intake", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const calibrationRoot = path.join(repositoryRoot, "editorial-calibration");
    const registry = editorialRegistrySchema.parse(
      JSON.parse(fs.readFileSync(path.join(calibrationRoot, "registry.json"), "utf8")),
    );
    const intakeSamples = fs
      .readdirSync(path.join(calibrationRoot, registry.intakeDirectory))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) =>
        editorialSampleSchema.parse(
          JSON.parse(
            fs.readFileSync(path.join(calibrationRoot, registry.intakeDirectory, file), "utf8"),
          ),
        ),
      );
    const samplePatterns = new Map(
      intakeSamples.map((sample) => [
        sample.sampleId,
        new Set(sample.analysis.transferablePatterns.map((pattern) => pattern.patternId)),
      ]),
    );
    const policy = editorialPromptPolicySchema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(calibrationRoot, registry.policyDirectory, "prompt-editorial-policy-v1.json"),
          "utf8",
        ),
      ),
    );

    expect(policy.approval).toMatchObject({
      datasetApprovalGranted: false,
      promptTuningAuthorized: true,
    });
    expect(policy.invariants).toEqual({
      factualHardGatesPreserved: true,
      claimBoundariesPreserved: true,
      validatorsWeakened: false,
      m1M2BehaviorChanged: false,
      episodeArtifactsChanged: false,
      m3Started: false,
      runtimeReferenceLoading: false,
      rawTranscriptInPrompt: false,
    });

    for (const rule of policy.rules) {
      for (const finding of rule.sourceFindings) {
        expect(samplePatterns.get(finding.sampleId)).toBeDefined();
        for (const patternId of finding.patternIds) {
          expect(samplePatterns.get(finding.sampleId)).toContain(patternId);
        }
      }
    }

    const expectedIntegratedRoles = [
      "audience-critic",
      "oral-rewriter",
      "retention-critic",
      "script-writer",
      "story-director",
      "viral-director",
      "visual-director",
    ];
    expect(policy.roleIntegrations.map((integration) => integration.role).sort()).toEqual(
      expectedIntegratedRoles,
    );
    for (const integration of policy.roleIntegrations) {
      expect(integration.referenceContext).toBe("distilled-policy-only");
      expect(integration.sourceSampleIds.length).toBeLessThan(intakeSamples.length);
      for (const promptFile of integration.promptFiles) {
        expect(fs.readFileSync(path.join(repositoryRoot, promptFile), "utf8")).toContain(
          "editorial-policy-v1",
        );
      }
    }

    expect(policy.criticCalibrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({role: "audience-critic", action: "integrated"}),
        expect.objectContaining({role: "retention-critic", action: "integrated"}),
        expect.objectContaining({role: "oral-judge", action: "unchanged", ruleIds: []}),
      ]),
    );
    expect("editorialPromptPolicySchema" in generationSafeApi).toBe(false);
    expect(
      fs.readFileSync(path.join(repositoryRoot, "agents/oral-judge.md"), "utf8"),
    ).not.toContain("editorial-policy-v1");
  });

  it("parses the repository registry, empty manifests, and pending intake records", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const calibrationRoot = path.join(repositoryRoot, "editorial-calibration");
    const registry = editorialRegistrySchema.parse(
      JSON.parse(fs.readFileSync(path.join(calibrationRoot, "registry.json"), "utf8")),
    );
    expect(registry.systemVersion).toBe("1.2.0");
    for (const dataset of ["reference", "calibration", "golden"] as const) {
      const manifest = editorialDatasetManifestSchema.parse(
        JSON.parse(
          fs.readFileSync(path.join(calibrationRoot, registry.datasets[dataset].manifest), "utf8"),
        ),
      );
      expect(manifest.dataset).toBe(dataset);
      expect(manifest.entries).toEqual([]);
    }
    const intakeFiles = fs
      .readdirSync(path.join(calibrationRoot, registry.intakeDirectory))
      .filter((file) => file.endsWith(".json"))
      .sort();
    expect(intakeFiles).toHaveLength(7);
    const intakeSamples = intakeFiles.map((file) =>
      editorialSampleSchema.parse(
        JSON.parse(
          fs.readFileSync(path.join(calibrationRoot, registry.intakeDirectory, file), "utf8"),
        ),
      ),
    );
    for (const sample of intakeSamples) {
      expect(sample.review.status).toBe("pending");
      expect(sample.datasetMembership).toEqual([]);
      expect(sample.transcriptPolicy.fullTranscriptStored).toBe(false);
    }

    const heldOutGoldenIds = [
      "xhs-6a65d34b000000000f017d9d",
      "xhs-6a6ad1fd000000001003c477",
      "xhs-6a6f5b240000000032030c1f",
    ];
    const heldOutGoldenSamples = intakeSamples.filter((sample) =>
      heldOutGoldenIds.includes(sample.sampleId),
    );
    expect(heldOutGoldenSamples.map((sample) => sample.sampleId).sort()).toEqual(heldOutGoldenIds);
    for (const sample of heldOutGoldenSamples) {
      expect(sample.proposedUse.dataset).toBe("golden");
      expect(sample.review).toMatchObject({
        status: "pending",
        requestedDataset: "golden",
      });
      expect(
        Object.values(sample.modalityChecks).every((check) => check.status === "checked"),
      ).toBe(true);
    }
  });
});
