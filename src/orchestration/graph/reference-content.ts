import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {episodeConfigSchema} from "../../schemas/episode";
import {
  sourceFirstWorkflowSchema,
  validateSourceFirstWorkflow,
  validateSourceFirstStory,
} from "../../lib/editorial/source-first";
import {buildArtifactRef, assertArtifactRefBytes} from "../artifact-registry";
import {ensureArtifactIndexForRefs} from "../human-decision";
import {pauseForExternalCapability, type FoundationNode} from "../lg-compat";
import {
  createObservabilityCheckpoint,
  createStageStartedEvent,
  createStageTerminalEvent,
  createCheckpointCommittedEvent,
  type ObservabilityEventSink,
} from "../observability-gate";

export const referenceContentStages = [
  {
    role: "research-analyst",
    files: [
      "research/facts.json",
      "research/sources.json",
      "research/timeline.json",
      "research/technology.md",
      "research/growth-data.md",
    ],
  },
  {role: "spine-extractor", files: ["story/story-spine.md"]},
  {role: "narrative-adapter", files: ["story/script-draft.md"]},
  {
    role: "script-editor",
    files: ["story/final-script.md", "story/critic-report.md", "story/caption-plan.json"],
  },
  {role: "fact-guardian", files: ["story/fact-check-report.md"]},
  {role: "visual-director", files: ["story/visual-plan.md"]},
] as const;

export const usesReferenceContent = (repoRoot: string, episodeId: string): boolean => {
  const file = path.join(repoRoot, "content", episodeId, "episode.config.json");
  if (!fs.existsSync(file)) return false;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    production?: {referenceStory?: unknown};
  };
  if (raw.production?.referenceStory === undefined) return false;
  return Boolean(episodeConfigSchema.parse(raw).production.referenceStory);
};

/** File-backed capability handoffs, one checkpointed stage per invocation.
 * Imports reviewed artifacts; never generates model scores or human decisions.
 */
export const createReferenceContentNode =
  (options: {
    repoRoot: string;
    now?: () => string;
    eventSink?: ObservabilityEventSink;
  }): FoundationNode =>
  async (state) => {
    const {repoRoot} = options;
    const now = options.now ?? (() => new Date().toISOString());
    const episodeRoot = path.join(repoRoot, "content", state.episodeId);
    const workflowPath = `content/${state.episodeId}/story/workflow.json`;
    const stage = referenceContentStages.find(({role}) => !state.decisions[`reference:${role}`]);
    const role = stage?.role ?? "reference-validation";
    const readErrors = (): string[] => {
      try {
        const workflow = sourceFirstWorkflowSchema.parse(
          JSON.parse(fs.readFileSync(path.join(repoRoot, workflowPath), "utf8")),
        );
        const errors = validateSourceFirstWorkflow({
          workflow,
          episodeId: state.episodeId,
          resolveArtifact: (relative) => {
            const absolute = path.resolve(repoRoot, relative);
            if (!absolute.startsWith(`${episodeRoot}${path.sep}`))
              throw new Error("REFERENCE_ARTIFACT_OUTSIDE_EPISODE");
            return absolute;
          },
        });
        if (stage) {
          if (workflow.stages.find((item) => item.id === stage.role)?.status !== "complete")
            errors.push(`${stage.role} is not complete`);
          for (const file of stage.files)
            if (!fs.existsSync(path.join(episodeRoot, file))) errors.push(`Missing ${file}`);
        } else {
          if (workflow.currentStatus === "in-progress")
            errors.push("Story handoff is still in progress");
          errors.push(...validateSourceFirstStory({episodeId: state.episodeId, episodeRoot}));
        }
        if ((stage?.role === "research-analyst" || !stage) && errors.length === 0) {
          const result = spawnSync(
            process.execPath,
            [
              "--import",
              "tsx",
              path.join(repoRoot, "scripts/validate-research.ts"),
              "--episode",
              state.episodeId,
            ],
            {cwd: repoRoot, encoding: "utf8"},
          );
          if (result.status !== 0)
            errors.push(
              `Research validation failed: ${result.stderr || result.stdout || result.error?.message}`,
            );
        }
        return errors;
      } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
      }
    };
    const errors = readErrors();
    if (errors.length) {
      pauseForExternalCapability({
        capability: `reference-content:${role}`,
        episodeId: state.episodeId,
        runId: state.runId,
        approvalEpoch: state.approvalEpoch,
        expectedOutputPath: workflowPath,
        inputArtifacts: Object.values(state.artifacts),
        nextAction: `Follow agents/reference-producer.md and ${stage ? `agents/${role}.md` : "the fact/visual correction routes"}. Complete the current file handoff, update workflow.json honestly, then resume. ${errors.join("; ").slice(0, 1800)}`,
      });
      const remaining = readErrors();
      if (remaining.length)
        throw new Error(`REFERENCE_CONTENT_INCOMPLETE:${role}:${remaining.join(";")}`);
    }
    for (const ref of Object.values(state.artifacts)) assertArtifactRefBytes(repoRoot, ref);
    const files = stage ? stage.files : ["story/workflow.json", "episode.config.json"];
    const refs = files.map((file) => {
      const repositoryPath = `content/${state.episodeId}/${file}`;
      const artifactId = `${state.episodeId}:reference:${file.replace(/[^a-z0-9-]+/gu, "-")}`;
      return buildArtifactRef({
        repoRoot,
        artifactId,
        episodeId: state.episodeId,
        path: repositoryPath,
        mediaType: file.endsWith(".json") ? "application/json" : "text/markdown",
        schemaVersion: "reference-content-v1",
        producer: `reference-handoff:${role}`,
        createdAt: now(),
        previous: state.artifacts[artifactId],
      });
    });
    const decision = {
      code: stage ? "REFERENCE_STAGE_RECORDED" : "REFERENCE_CONTENT_READY",
      summary: `Verified file handoff: ${role}. No creative score or human approval inferred.`,
    };
    const update = {
      phase: "content_eval" as const,
      artifacts: Object.fromEntries(refs.map((ref) => [ref.artifactId, ref])),
      decisions: {[stage ? `reference:${role}` : "reference-content"]: decision},
      ...(!stage ? {gates: {"reference-content": "pass" as const}} : {}),
    };
    ensureArtifactIndexForRefs({
      repoRoot,
      episodeId: state.episodeId,
      refs,
      executionId: `${state.runId}:reference:${role}`,
    });
    if (options.eventSink) {
      const occurredAt = now();
      const executionId = `${state.runId}:reference:${role}:epoch-${state.approvalEpoch}`;
      const inputArtifacts = Object.values(state.artifacts);
      const nextState = {
        ...state,
        ...update,
        artifacts: {...state.artifacts, ...update.artifacts},
        decisions: {...state.decisions, ...update.decisions},
        gates: {...state.gates, ...update.gates},
      };
      const checkpoint = createObservabilityCheckpoint({
        state: nextState,
        checkpointId: `${executionId}:checkpoint`,
        committedAt: occurredAt,
      });
      const common = {
        state,
        stage: `reference:${role}`,
        executionId,
        attempt: 1,
        inputArtifacts,
        occurredAt,
      };
      options.eventSink(createStageStartedEvent(common));
      options.eventSink(
        createCheckpointCommittedEvent({
          ...common,
          state: nextState,
          outputArtifacts: refs,
          checkpoint,
        }),
      );
      options.eventSink(
        createStageTerminalEvent({
          ...common,
          state: nextState,
          outputArtifacts: refs,
          checkpoint,
          status: "succeeded",
        }),
      );
    }
    return update;
  };
