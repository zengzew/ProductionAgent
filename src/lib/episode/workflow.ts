import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const storyRoleSchema = z.enum([
  "research-analyst",
  "story-director",
  "viral-director",
  "script-writer",
  "oral-rewriter",
  "oral-judge",
  "audience-critic",
  "fact-guardian",
  "visual-director",
  "retention-critic",
  "delivery-critic",
]);

export const orderedStoryRoles = storyRoleSchema.options;

const routedCreativeRoleSchema = z.enum([
  "research-analyst",
  "story-director",
  "viral-director",
  "script-writer",
  "oral-rewriter",
  "visual-director",
]);

const workflowStageSchema = z.object({
  id: storyRoleSchema,
  owner: storyRoleSchema,
  status: z.enum(["complete", "pending", "rejected"]),
  artifacts: z.array(z.string().min(1)),
  decision: z.string().min(1),
});

const workflowDecisionSchema = z.object({
  id: z.string().regex(/^decision-[a-z0-9-]+$/u),
  owner: storyRoleSchema,
  decision: z.string().min(1),
  rationale: z.string().min(1),
  artifact: z.string().min(1),
  claimIds: z.array(z.string().regex(/^claim-[a-z0-9-]+$/u)),
});

const reviewRouteSchema = z.object({
  feedbackId: z.string().regex(/^feedback-[a-z0-9-]+$/u),
  owner: routedCreativeRoleSchema,
  resolutionArtifacts: z.array(z.string().min(1)).min(1),
  status: z.enum(["resolved", "open"]),
});

const reviewCycleSchema = z.object({
  id: z.string().regex(/^review-[a-z0-9-]+$/u),
  critic: z.enum(["audience-critic", "retention-critic", "delivery-critic"]),
  round: z.number().int().positive(),
  reportPath: z.string().min(1),
  reportSha256: sha256Schema,
  verdict: z.enum(["PASS", "REJECT"]),
  routes: z.array(reviewRouteSchema),
});

export const directorWorkflowSchema = z
  .object({
    schemaVersion: z.literal("director-workflow-v1"),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    coreStoryQuestion: z.string().min(1),
    currentStatus: z.enum(["in-progress", "story-approved", "delivery-approved"]),
    revisionPolicy: z.object({
      maximumCreativeRounds: z.number().int().min(1).max(5),
      scriptChangeRestartsAt: z.literal("oral-judge"),
      visualChangeRestartsAt: z.literal("retention-critic"),
    }),
    stages: z.array(workflowStageSchema).length(orderedStoryRoles.length),
    decisions: z.array(workflowDecisionSchema).min(8),
    reviewCycles: z.array(reviewCycleSchema).min(1),
  })
  .superRefine((workflow, context) => {
    const stageIds = workflow.stages.map((stage) => stage.id);
    if (new Set(stageIds).size !== orderedStoryRoles.length) {
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "workflow stages 必须让每个正式角色恰好出现一次",
      });
    }
  });

export type DirectorWorkflow = z.infer<typeof directorWorkflowSchema>;
