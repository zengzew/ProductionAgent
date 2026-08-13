import {z} from "zod";
import {agentNameSchema, agentNames} from "../orchestration/schemas/agent";

export const editorialDatasetNames = ["reference", "calibration", "golden"] as const;
export const editorialDatasetNameSchema = z.enum(editorialDatasetNames);

export const calibrationRoleNames = [
  "oral-judge",
  "audience-critic",
  "fact-guardian",
  "retention-critic",
  "delivery-critic",
] as const;
export const calibrationRoleNameSchema = z.enum(calibrationRoleNames);

export const modalityNames = ["video", "audio", "transcript", "captions", "metadata"] as const;
export const modalityNameSchema = z.enum(modalityNames);

const timestampSchema = z.string().datetime({offset: true});
const semanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const checkedModalitySchema = z.object({
  status: z.literal("checked"),
  checkedAt: timestampSchema,
  method: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string().min(1)).default([]),
});

const uncheckedModalitySchema = z.object({
  status: z.enum(["unavailable", "not-checked"]),
  reason: z.string().min(1),
});

export const modalityCheckSchema = z.discriminatedUnion("status", [
  checkedModalitySchema,
  uncheckedModalitySchema,
]);

export const modalityChecksSchema = z.object({
  video: modalityCheckSchema,
  audio: modalityCheckSchema,
  transcript: modalityCheckSchema,
  captions: modalityCheckSchema,
  metadata: modalityCheckSchema,
});

const requestedReviewSchema = z.object({
  status: z.literal("pending"),
  submittedAt: timestampSchema,
  requestedDataset: editorialDatasetNameSchema,
  requestedRoles: z.array(agentNameSchema).min(1),
  note: z.string().min(1),
});

const reviewerSchema = z.object({
  kind: z.literal("human"),
  id: z.string().min(1),
});

const approvedReviewSchema = z.object({
  status: z.literal("approved"),
  reviewer: reviewerSchema,
  reviewedAt: timestampSchema,
  decisionId: z.string().min(1),
  approvedFor: z.object({
    dataset: editorialDatasetNameSchema,
    roles: z.array(agentNameSchema).min(1),
  }),
  allowProductionAgentGenerated: z.boolean().default(false),
  rationale: z.string().min(1),
});

const rejectedReviewSchema = z.object({
  status: z.literal("rejected"),
  reviewer: reviewerSchema,
  reviewedAt: timestampSchema,
  decisionId: z.string().min(1),
  rationale: z.string().min(1),
});

export const humanReviewSchema = z.discriminatedUnion("status", [
  requestedReviewSchema,
  approvedReviewSchema,
  rejectedReviewSchema,
]);

const timeRangeSchema = z
  .object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
  })
  .refine((range) => range.endSeconds > range.startSeconds, {
    message: "endSeconds must be greater than startSeconds",
  });

export const editorialEvidenceSchema = z.object({
  timeRange: timeRangeSchema,
  observation: z.string().min(1),
  modalities: z.array(modalityNameSchema).min(1),
});

const analysisDimensionSchema = z.object({
  summary: z.string().min(1),
  evidence: z.array(editorialEvidenceSchema).min(1),
});

const patternSchema = z.object({
  patternId: identifierSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  evidenceRanges: z.array(timeRangeSchema).min(1),
  applicableRoles: z.array(agentNameSchema).min(1),
  guardrail: z.string().min(1),
});

const roleMappingSchema = z.object({
  role: agentNameSchema,
  use: z.string().min(1),
  exclusions: z.array(z.string().min(1)).min(1),
  patternIds: z.array(identifierSchema).min(1),
});

export const editorialSampleSchema = z
  .object({
    schemaVersion: z.literal("editorial-sample-v1"),
    sampleId: identifierSchema,
    recordVersion: semanticVersionSchema,
    title: z.string().min(1),
    language: z.string().min(1),
    source: z.object({
      platform: z.string().min(1),
      canonicalUrl: z.string().url(),
      sourceId: z.string().min(1),
      pageTitle: z.string().min(1),
      authorDisplayName: z.string().min(1).optional(),
      capturedAt: timestampSchema,
      provenance: z.object({
        suppliedBy: z.string().min(1),
        acquisition: z.string().min(1),
        mediaSha256: sha256Schema.optional(),
        mediaStoredInRepository: z.boolean(),
        notes: z.array(z.string().min(1)).default([]),
      }),
    }),
    origin: z.discriminatedUnion("kind", [
      z.object({kind: z.literal("third-party")}),
      z.object({
        kind: z.literal("productionagent-generated"),
        episodeId: z.string().min(1),
      }),
      z.object({kind: z.literal("other"), description: z.string().min(1)}),
    ]),
    durationSeconds: z.number().positive(),
    review: humanReviewSchema,
    datasetMembership: z.array(editorialDatasetNameSchema).max(1),
    proposedUse: z.object({
      dataset: editorialDatasetNameSchema,
      roles: z.array(agentNameSchema).min(1),
      rationale: z.string().min(1),
    }),
    modalityChecks: modalityChecksSchema,
    analysis: z.object({
      scriptAndNarration: analysisDimensionSchema,
      narrativeArchitecture: analysisDimensionSchema,
      visualLanguage: analysisDimensionSchema,
      audioAndCaptions: analysisDimensionSchema,
      crossModalSync: analysisDimensionSchema,
      retentionAndPayoff: analysisDimensionSchema,
      transferablePatterns: z.array(patternSchema).min(1),
      productSpecificPatterns: z.array(patternSchema).min(1),
    }),
    roleMappings: z
      .array(roleMappingSchema)
      .min(1)
      .max(agentNames.length - 1),
    transcriptPolicy: z.object({
      fullTranscriptStored: z.literal(false),
      storedMaterial: z.string().min(1),
    }),
  })
  .superRefine((sample, context) => {
    const checkedModalities = new Set(
      modalityNames.filter((name) => sample.modalityChecks[name].status === "checked"),
    );
    const dimensions = [
      sample.analysis.scriptAndNarration,
      sample.analysis.narrativeArchitecture,
      sample.analysis.visualLanguage,
      sample.analysis.audioAndCaptions,
      sample.analysis.crossModalSync,
      sample.analysis.retentionAndPayoff,
    ];
    for (const [dimensionIndex, dimension] of dimensions.entries()) {
      for (const [evidenceIndex, evidence] of dimension.evidence.entries()) {
        for (const modality of evidence.modalities) {
          if (!checkedModalities.has(modality)) {
            context.addIssue({
              code: "custom",
              path: ["analysis", dimensionIndex, "evidence", evidenceIndex, "modalities"],
              message: `Evidence cannot use unchecked modality: ${modality}`,
            });
          }
        }
        if (evidence.timeRange.endSeconds > sample.durationSeconds + 0.05) {
          context.addIssue({
            code: "custom",
            path: ["analysis", dimensionIndex, "evidence", evidenceIndex, "timeRange"],
            message: "Evidence range exceeds media duration",
          });
        }
      }
    }

    const roleMappings = new Map(sample.roleMappings.map((mapping) => [mapping.role, mapping]));
    if (roleMappings.size !== sample.roleMappings.length) {
      context.addIssue({
        code: "custom",
        path: ["roleMappings"],
        message: "Role mappings must be unique",
      });
    }
    for (const role of sample.proposedUse.roles) {
      if (!roleMappings.has(role)) {
        context.addIssue({
          code: "custom",
          path: ["proposedUse", "roles"],
          message: `Proposed role is missing a role mapping: ${role}`,
        });
      }
    }

    const membership = sample.datasetMembership[0];
    if (!membership) return;
    if (sample.review.status !== "approved") {
      context.addIssue({
        code: "custom",
        path: ["datasetMembership"],
        message: "Dataset membership requires explicit human approval",
      });
      return;
    }
    if (sample.review.approvedFor.dataset !== membership) {
      context.addIssue({
        code: "custom",
        path: ["review", "approvedFor", "dataset"],
        message: "Approval dataset must match dataset membership",
      });
    }
    if (
      sample.origin.kind === "productionagent-generated" &&
      membership === "reference" &&
      !sample.review.allowProductionAgentGenerated
    ) {
      context.addIssue({
        code: "custom",
        path: ["review", "allowProductionAgentGenerated"],
        message: "ProductionAgent output cannot enter reference without explicit human approval",
      });
    }
  });

const editorialFeedbackSignalSchema = z.object({
  signalId: identifierSchema,
  dimension: z.enum(["visual-density", "narrative-tension"]),
  humanPreference: z.string().min(1),
  positiveIndicators: z.array(z.string().min(1)).min(1),
  transferGuardrails: z.array(z.string().min(1)).min(1),
  applicableRoles: z.array(agentNameSchema).min(1),
});

const editorialFeedbackGroundingSchema = z.object({
  sampleId: identifierSchema,
  evidence: z.array(editorialEvidenceSchema).min(1),
});

export const editorialHumanFeedbackSchema = z
  .object({
    schemaVersion: z.literal("editorial-human-feedback-v1"),
    feedbackId: identifierSchema,
    recordVersion: semanticVersionSchema,
    authoredAt: timestampSchema,
    author: z.object({
      kind: z.literal("human"),
      id: z.string().min(1),
    }),
    language: z.string().min(1),
    scope: z.object({
      kind: z.literal("cross-sample"),
      sampleIds: z.array(identifierSchema).min(1),
    }),
    summary: z.string().min(1),
    signals: z.array(editorialFeedbackSignalSchema).min(1),
    sampleGrounding: z.array(editorialFeedbackGroundingSchema).min(1),
    boundaries: z.object({
      datasetApprovalGranted: z.literal(false),
      promptTuningAuthorized: z.literal(false),
      automaticPromotionAllowed: z.literal(false),
      note: z.string().min(1),
    }),
  })
  .superRefine((feedback, context) => {
    const scopedIds = new Set(feedback.scope.sampleIds);
    if (scopedIds.size !== feedback.scope.sampleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["scope", "sampleIds"],
        message: "Feedback scope sampleIds must be unique",
      });
    }

    const groundedIds = new Set<string>();
    for (const [index, grounding] of feedback.sampleGrounding.entries()) {
      if (!scopedIds.has(grounding.sampleId)) {
        context.addIssue({
          code: "custom",
          path: ["sampleGrounding", index, "sampleId"],
          message: "Grounded sample must be included in feedback scope",
        });
      }
      if (groundedIds.has(grounding.sampleId)) {
        context.addIssue({
          code: "custom",
          path: ["sampleGrounding", index, "sampleId"],
          message: "Feedback grounding sampleIds must be unique",
        });
      }
      groundedIds.add(grounding.sampleId);
    }
    for (const sampleId of scopedIds) {
      if (!groundedIds.has(sampleId)) {
        context.addIssue({
          code: "custom",
          path: ["sampleGrounding"],
          message: `Feedback scope is missing grounding for sample: ${sampleId}`,
        });
      }
    }
  });

const editorialPolicySourceFindingSchema = z.object({
  sampleId: identifierSchema,
  recordVersion: semanticVersionSchema,
  patternIds: z.array(identifierSchema).min(1),
});

const editorialPolicyRuleSchema = z.object({
  ruleId: identifierSchema,
  name: z.string().min(1),
  distilledRule: z.string().min(1),
  sourceFindings: z.array(editorialPolicySourceFindingSchema).min(1),
  sourceFeedbackSignalIds: z.array(identifierSchema).default([]),
  applicableRoles: z.array(agentNameSchema).min(1),
  guardrails: z.array(z.string().min(1)).min(1),
});

const editorialPolicyRoleIntegrationSchema = z.object({
  role: agentNameSchema,
  promptFiles: z.array(z.string().min(1)).min(1),
  ruleIds: z.array(identifierSchema).min(1),
  sourceSampleIds: z.array(identifierSchema).min(1),
  roleSpecificExample: z.string().min(1),
  referenceContext: z.literal("distilled-policy-only"),
});

const editorialPolicyCriticCalibrationSchema = z.object({
  role: z.enum(["audience-critic", "retention-critic", "oral-judge"]),
  action: z.enum(["integrated", "unchanged"]),
  ruleIds: z.array(identifierSchema),
  rationale: z.string().min(1),
});

export const editorialPromptPolicySchema = z
  .object({
    schemaVersion: z.literal("editorial-prompt-policy-v1"),
    policyId: identifierSchema,
    policyVersion: semanticVersionSchema,
    effectiveAt: timestampSchema,
    approval: z.object({
      reviewer: reviewerSchema,
      decisionId: z.string().min(1),
      scope: z.literal("prompt-editorial-policy-integration"),
      datasetApprovalGranted: z.literal(false),
      promptTuningAuthorized: z.literal(true),
      rationale: z.string().min(1),
    }),
    sourceFeedback: z.object({
      feedbackId: identifierSchema,
      recordVersion: semanticVersionSchema,
      path: z.string().min(1),
    }),
    rules: z.array(editorialPolicyRuleSchema).min(1),
    roleIntegrations: z.array(editorialPolicyRoleIntegrationSchema).min(1),
    criticCalibrations: z.array(editorialPolicyCriticCalibrationSchema).length(3),
    rejectedPatterns: z
      .array(
        z.object({
          patternId: identifierSchema,
          reason: z.string().min(1),
        }),
      )
      .min(1),
    invariants: z.object({
      factualHardGatesPreserved: z.literal(true),
      claimBoundariesPreserved: z.literal(true),
      validatorsWeakened: z.literal(false),
      m1M2BehaviorChanged: z.literal(false),
      episodeArtifactsChanged: z.literal(false),
      m3Started: z.literal(false),
      runtimeReferenceLoading: z.literal(false),
      rawTranscriptInPrompt: z.literal(false),
    }),
  })
  .superRefine((policy, context) => {
    const rules = new Map(policy.rules.map((rule) => [rule.ruleId, rule]));
    if (rules.size !== policy.rules.length) {
      context.addIssue({code: "custom", path: ["rules"], message: "Policy ruleIds must be unique"});
    }

    const integratedRoles = new Set<string>();
    for (const [index, integration] of policy.roleIntegrations.entries()) {
      if (integratedRoles.has(integration.role)) {
        context.addIssue({
          code: "custom",
          path: ["roleIntegrations", index, "role"],
          message: "Policy role integrations must be unique",
        });
      }
      integratedRoles.add(integration.role);
      for (const ruleId of integration.ruleIds) {
        const rule = rules.get(ruleId);
        if (!rule) {
          context.addIssue({
            code: "custom",
            path: ["roleIntegrations", index, "ruleIds"],
            message: `Unknown policy rule: ${ruleId}`,
          });
        } else if (!rule.applicableRoles.includes(integration.role)) {
          context.addIssue({
            code: "custom",
            path: ["roleIntegrations", index, "ruleIds"],
            message: `Policy rule is not approved for role: ${ruleId} -> ${integration.role}`,
          });
        }
      }
    }

    const criticRoles = new Set(policy.criticCalibrations.map((item) => item.role));
    for (const required of ["audience-critic", "retention-critic", "oral-judge"] as const) {
      if (!criticRoles.has(required)) {
        context.addIssue({
          code: "custom",
          path: ["criticCalibrations"],
          message: `Missing critic calibration decision: ${required}`,
        });
      }
    }
    for (const [index, calibration] of policy.criticCalibrations.entries()) {
      if (calibration.action === "unchanged" && calibration.ruleIds.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["criticCalibrations", index, "ruleIds"],
          message: "Unchanged critic calibration cannot declare integrated rules",
        });
      }
      for (const ruleId of calibration.ruleIds) {
        const rule = rules.get(ruleId);
        if (!rule?.applicableRoles.includes(calibration.role)) {
          context.addIssue({
            code: "custom",
            path: ["criticCalibrations", index, "ruleIds"],
            message: `Critic calibration rule is missing or not approved: ${ruleId}`,
          });
        }
      }
    }
  });

export const editorialManifestEntrySchema = z.object({
  sampleId: identifierSchema,
  recordVersion: semanticVersionSchema,
  path: z.string().min(1),
  sha256: sha256Schema,
  roles: z.array(agentNameSchema).min(1),
});

export const editorialDatasetManifestSchema = z
  .object({
    schemaVersion: z.literal("editorial-dataset-manifest-v1"),
    dataset: editorialDatasetNameSchema,
    version: semanticVersionSchema,
    createdAt: timestampSchema,
    entries: z.array(editorialManifestEntrySchema),
  })
  .superRefine((manifest, context) => {
    const identities = new Set<string>();
    for (const [index, entry] of manifest.entries.entries()) {
      const identity = `${entry.sampleId}@${entry.recordVersion}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index],
          message: `Duplicate manifest identity: ${identity}`,
        });
      }
      identities.add(identity);
      if (
        manifest.dataset === "calibration" &&
        entry.roles.some(
          (role) => !calibrationRoleNames.includes(role as (typeof calibrationRoleNames)[number]),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "roles"],
          message: "Calibration entries may target Critic/Judge roles only",
        });
      }
    }
  });

export const editorialRegistrySchema = z.object({
  schemaVersion: z.literal("editorial-calibration-registry-v1"),
  systemVersion: semanticVersionSchema,
  datasets: z.object({
    reference: z.object({manifest: z.string().min(1), version: semanticVersionSchema}),
    calibration: z.object({manifest: z.string().min(1), version: semanticVersionSchema}),
    golden: z.object({manifest: z.string().min(1), version: semanticVersionSchema}),
  }),
  intakeDirectory: z.string().min(1),
  humanFeedbackDirectory: z.string().min(1),
  policyDirectory: z.string().min(1),
  legacyCompatibility: z.object({
    styleApprovedDirectory: z.string().min(1),
    mappedRole: z.literal("oral-rewriter"),
  }),
});

export type EditorialDatasetName = z.infer<typeof editorialDatasetNameSchema>;
export type ModalityName = z.infer<typeof modalityNameSchema>;
export type EditorialSample = z.infer<typeof editorialSampleSchema>;
export type EditorialHumanFeedback = z.infer<typeof editorialHumanFeedbackSchema>;
export type EditorialPromptPolicy = z.infer<typeof editorialPromptPolicySchema>;
export type EditorialDatasetManifest = z.infer<typeof editorialDatasetManifestSchema>;
export type EditorialManifestEntry = z.infer<typeof editorialManifestEntrySchema>;
