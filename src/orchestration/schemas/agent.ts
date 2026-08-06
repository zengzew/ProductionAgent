import {z} from "zod";
import {artifactRefSchema} from "./artifact";

export const agentNames = [
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
] as const;

export const agentNameSchema = z.enum(agentNames);

export const expectedOutputSchema = z.object({
  artifactId: z.string().min(1),
  path: z.string().min(1),
  schemaVersion: z.string().min(1),
});

export const agentExecutionRequestSchema = z.object({
  contractVersion: z.literal("agent-execution-v1"),
  executionId: z.string().min(1),
  episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
  agentName: agentNameSchema,
  attempt: z.number().int().positive(),
  revisionRound: z.number().int().nonnegative(),
  promptRef: artifactRefSchema,
  inputArtifacts: z.array(artifactRefSchema),
  expectedOutputs: z.array(expectedOutputSchema),
  upstreamGateRefs: z.array(artifactRefSchema),
  revisionBudgetRemaining: z.number().int().nonnegative(),
});

export const agentExecutionResultSchema = z
  .object({
    contractVersion: z.literal("agent-execution-result-v1"),
    executionId: z.string().min(1),
    status: z.enum(["SUCCEEDED", "REJECTED", "FAILED"]),
    outputArtifacts: z.array(artifactRefSchema),
    criticResultRef: artifactRefSchema.optional(),
    decision: z.object({
      code: z.string().min(1),
      summary: z.string().min(1),
    }),
    failure: z
      .object({
        code: z.string().min(1),
        retryable: z.boolean(),
        detail: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "FAILED" && !value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "FAILED results require failure details",
      });
    }
    if (value.status !== "FAILED" && value.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "failure details are only valid for FAILED results",
      });
    }
  });

export type AgentName = z.infer<typeof agentNameSchema>;
export type AgentExecutionRequest = z.infer<typeof agentExecutionRequestSchema>;
export type AgentExecutionResult = z.infer<typeof agentExecutionResultSchema>;
