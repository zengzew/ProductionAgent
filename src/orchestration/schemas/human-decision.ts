import {z} from "zod";
import {artifactRefSchema} from "./artifact";
import {
  agentOwnerSchema,
  artifactLocatorSchema,
  issueCategorySchema,
  routeTargetSchema,
} from "./critic-output";

const nonNegativeInteger = z.number().int().nonnegative();

const boundedString = (name: string, maxBytes = 500) =>
  z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= maxBytes, {
      message: `${name} must not exceed ${maxBytes} UTF-8 bytes`,
    });

/** Stable identifiers are deliberately transport-safe because they become artifact filenames. */
export const humanDecisionIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u, "decisionId must be transport-safe");

export const humanDecisionGates = [
  "content-approval",
  "unfreeze-approval",
  "final-approval",
] as const;

export const humanDecisionGateSchema = z.enum(humanDecisionGates);
export const humanDecisionKinds = ["approve", "reject", "direct-edit"] as const;
export const humanDecisionKindSchema = z.enum(humanDecisionKinds);

export const humanDecisionAuthorizationSchema = z
  .object({
    artifactId: z.string().min(1),
    owner: agentOwnerSchema,
  })
  .strict();

export const humanDecisionIssueSchema = z
  .object({
    category: issueCategorySchema,
    severity: z.enum(["low", "medium", "high", "blocker"]),
    locator: artifactLocatorSchema,
    affectedArtifactRef: artifactRefSchema.optional(),
    /** These fields are recorded as a proposal only; routing is recomputed from policy. */
    ownerAgent: agentOwnerSchema.optional(),
    routeTarget: routeTargetSchema.optional(),
    restartAt: z.string().min(1).optional(),
  })
  .strict();

export const humanDecisionEditSchema = z
  .object({
    artifactId: z.string().min(1),
    owner: agentOwnerSchema,
    before: artifactRefSchema,
    after: artifactRefSchema,
    changedLocators: z.array(artifactLocatorSchema).min(1),
    provenance: z
      .object({
        source: z.literal("human"),
        reviewer: z.string().min(1),
        decisionId: humanDecisionIdSchema,
        timestamp: z.string().datetime({offset: true}),
        approvalEpoch: nonNegativeInteger,
      })
      .strict()
      .optional(),
  })
  .strict();

export const humanDecisionBaseSchema = z
  .object({
    schemaVersion: z.literal("human-decision-v1").default("human-decision-v1"),
    decisionId: humanDecisionIdSchema,
    gate: humanDecisionGateSchema,
    decision: humanDecisionKindSchema,
    reviewer: z.string().min(1).max(200),
    timestamp: z.string().datetime({offset: true}),
    reason: boundedString("human decision reason"),
    /** References only. Bodies are always read from the canonical artifact files. */
    artifactRefs: z.array(artifactRefSchema).min(1),
    approvalEpoch: nonNegativeInteger,
    authorizations: z.array(humanDecisionAuthorizationSchema).default([]),
    issue: humanDecisionIssueSchema.optional(),
    edits: z.array(humanDecisionEditSchema).default([]),
  })
  .strict();

const canonicalizeAliases = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const output = {...input};
  if (output.decision === undefined && typeof output.action === "string") {
    output.decision = output.action;
  }
  if (output.gate === "content" || output.gate === "content_gate") {
    output.gate = "content-approval";
  } else if (
    output.gate === "unfreeze" ||
    output.gate === "production-unfreeze" ||
    output.gate === "unfreeze_gate"
  ) {
    output.gate = "unfreeze-approval";
  } else if (output.gate === "final" || output.gate === "final_gate") {
    output.gate = "final-approval";
  }
  if (output.reviewer === undefined && typeof output.actorId === "string") {
    output.reviewer = output.actorId;
  }
  if (output.timestamp === undefined && typeof output.decidedAt === "string") {
    output.timestamp = output.decidedAt;
  }
  if (output.artifactRefs === undefined && Array.isArray(output.relatedArtifactRefs)) {
    output.artifactRefs = output.relatedArtifactRefs;
  }
  if (output.approvalEpoch === undefined && typeof output.requestedApprovalEpoch === "number") {
    output.approvalEpoch = output.requestedApprovalEpoch;
  }
  if (output.edits === undefined && Array.isArray(output.directEdits)) {
    output.edits = output.directEdits;
  }
  for (const alias of [
    "action",
    "actorId",
    "decidedAt",
    "relatedArtifactRefs",
    "requestedApprovalEpoch",
    "directEdits",
  ]) {
    delete output[alias];
  }
  return output;
};

export const humanDecisionSchema = z
  .preprocess(canonicalizeAliases, humanDecisionBaseSchema)
  .superRefine((value, context) => {
    const artifactIds = value.artifactRefs.map((ref) => ref.artifactId);
    if (new Set(artifactIds).size !== artifactIds.length) {
      context.addIssue({
        code: "custom",
        path: ["artifactRefs"],
        message: "human decision artifact references must be unique",
      });
    }
    const episodeId = value.artifactRefs[0]?.episodeId;
    for (const [index, ref] of value.artifactRefs.entries()) {
      if (episodeId && ref.episodeId !== episodeId) {
        context.addIssue({
          code: "custom",
          path: ["artifactRefs", index, "episodeId"],
          message: "human decision artifact references must belong to one episode",
        });
      }
    }
    if (value.decision === "direct-edit" && value.edits.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["edits"],
        message: "direct-edit decisions require at least one edit",
      });
    }
    if (value.decision !== "direct-edit" && value.edits.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["edits"],
        message: "only direct-edit decisions may contain edits",
      });
    }
    if (value.decision === "reject" && value.issue === undefined) {
      context.addIssue({
        code: "custom",
        path: ["issue"],
        message: "reject decisions require structured issue routing metadata",
      });
    }
    const editIds = new Set<string>();
    for (const [index, edit] of value.edits.entries()) {
      if (editIds.has(edit.artifactId)) {
        context.addIssue({
          code: "custom",
          path: ["edits", index, "artifactId"],
          message: "human decision edit artifact IDs must be unique",
        });
      }
      editIds.add(edit.artifactId);
      if (edit.before.artifactId !== edit.artifactId || edit.after.artifactId !== edit.artifactId) {
        context.addIssue({
          code: "custom",
          path: ["edits", index, "artifactId"],
          message: "human decision edit references must use artifactId",
        });
      }
      if (edit.before.episodeId !== edit.after.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["edits", index],
          message: "human decision edit references must belong to one episode",
        });
      }
      if (edit.after.producer !== `human:${value.reviewer}`) {
        context.addIssue({
          code: "custom",
          path: ["edits", index, "after", "producer"],
          message: "human direct edit after refs must carry the reviewer provenance",
        });
      }
      if (
        edit.provenance &&
        (edit.provenance.reviewer !== value.reviewer ||
          edit.provenance.decisionId !== value.decisionId ||
          edit.provenance.timestamp !== value.timestamp ||
          edit.provenance.approvalEpoch !== value.approvalEpoch)
      ) {
        context.addIssue({
          code: "custom",
          path: ["edits", index, "provenance"],
          message: "human direct edit provenance must match its parent decision",
        });
      }
      if (edit.before.sha256 === edit.after.sha256 || edit.after.revision <= edit.before.revision) {
        context.addIssue({
          code: "custom",
          path: ["edits", index, "after"],
          message: "human direct edits must create a newer hash-bound artifact version",
        });
      }
    }
  });

export const humanLockedRangeSchema = z
  .object({
    lockId: z.string().min(1),
    artifactRef: artifactRefSchema,
    locator: artifactLocatorSchema,
    sourceDecisionRef: artifactRefSchema.optional(),
    reviewer: z.string().min(1).optional(),
    decisionId: humanDecisionIdSchema.optional(),
  })
  .strict();

export const productionAuthorizationSchema = z
  .object({
    decisionRef: artifactRefSchema,
    manifestRef: artifactRefSchema,
    decisionId: humanDecisionIdSchema,
    gate: z.enum(["content-approval", "unfreeze-approval"]),
    approvalEpoch: nonNegativeInteger,
  })
  .strict();

export const humanIssueArtifactSchema = z
  .object({
    schemaVersion: z.literal("human-issue-v1"),
    issueId: z.string().min(1),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    sourceDecisionId: humanDecisionIdSchema,
    gate: humanDecisionGateSchema,
    approvalEpoch: nonNegativeInteger,
    status: z.literal("open"),
    category: issueCategorySchema,
    severity: z.enum(["low", "medium", "high", "blocker"]),
    ownerAgent: agentOwnerSchema,
    routeTarget: routeTargetSchema,
    restartAt: z.string().min(1),
    affectedArtifactRef: artifactRefSchema,
    locator: artifactLocatorSchema,
    summary: boundedString("human issue summary"),
  })
  .strict();

export type HumanDecisionGate = z.infer<typeof humanDecisionGateSchema>;
export type HumanDecisionKind = z.infer<typeof humanDecisionKindSchema>;
export type HumanDecisionAuthorization = z.infer<typeof humanDecisionAuthorizationSchema>;
export type HumanDecisionIssue = z.infer<typeof humanDecisionIssueSchema>;
export type HumanDecisionEdit = z.infer<typeof humanDecisionEditSchema>;
export type HumanDecision = z.infer<typeof humanDecisionSchema>;
export type HumanLockedRange = z.infer<typeof humanLockedRangeSchema>;
export type ProductionAuthorization = z.infer<typeof productionAuthorizationSchema>;
export type HumanIssueArtifact = z.infer<typeof humanIssueArtifactSchema>;
