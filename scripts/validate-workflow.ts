import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {parseDirectorBriefGate, parseRetentionGate} from "../src/lib/story";
import {directorWorkflowSchema, orderedStoryRoles} from "../src/lib/workflow";
import {episodeId, episodeRoot, readJson, repoRoot} from "../src/lib/project";

const workflowPath = path.join(episodeRoot, "story/workflow.json");
const errors: string[] = [];
const hashFile = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const resolveArtifact = (relativePath: string): string => path.join(repoRoot, relativePath);

if (!fs.existsSync(workflowPath)) {
  console.error(`缺少导演工作流清单：${path.relative(repoRoot, workflowPath)}`);
  process.exit(1);
}

const workflow = directorWorkflowSchema.parse(readJson<unknown>(workflowPath));
if (workflow.episodeId !== episodeId) {
  errors.push(`workflow episodeId 应为 ${episodeId}，当前 ${workflow.episodeId}`);
}

const stageIds = workflow.stages.map((stage) => stage.id);
if (JSON.stringify(stageIds) !== JSON.stringify(orderedStoryRoles)) {
  errors.push("workflow stages 必须按正式角色顺序完整列出");
}
for (const stage of workflow.stages) {
  if (stage.owner !== stage.id) errors.push(`${stage.id} 的 owner 必须是同名负责角色`);
  if (stage.status === "complete" && stage.artifacts.length === 0) {
    errors.push(`${stage.id} 已完成但没有交付 artifact`);
  }
  for (const artifact of stage.artifacts) {
    if (stage.status === "complete" && !fs.existsSync(resolveArtifact(artifact))) {
      errors.push(`${stage.id} 的 artifact 不存在：${artifact}`);
    }
  }
}

const requiredDecisionOwners = new Map([
  ["decision-core-story-question", "story-director"],
  ["decision-attention-strategy", "viral-director"],
  ["decision-information-draft", "script-writer"],
  ["decision-spoken-delivery", "oral-rewriter"],
  ["decision-audience-clearance", "audience-critic"],
  ["decision-factual-clearance", "fact-guardian"],
  ["decision-visual-language", "visual-director"],
  ["decision-production-readiness", "retention-critic"],
  ["decision-final-delivery", "delivery-critic"],
]);
const decisionMap = new Map(workflow.decisions.map((decision) => [decision.id, decision]));
for (const [decisionId, owner] of requiredDecisionOwners) {
  const decision = decisionMap.get(decisionId);
  if (!decision) {
    errors.push(`workflow 缺少重大决策 owner：${decisionId}`);
    continue;
  }
  if (decision.owner !== owner) errors.push(`${decisionId} 必须由 ${owner} 负责`);
  if (!fs.existsSync(resolveArtifact(decision.artifact))) {
    errors.push(`${decisionId} 的决策 artifact 不存在：${decision.artifact}`);
  }
}

const directorBriefPath = path.join(episodeRoot, "story/director-brief.md");
if (fs.existsSync(directorBriefPath)) {
  const directorBrief = parseDirectorBriefGate(fs.readFileSync(directorBriefPath, "utf8"));
  if (workflow.coreStoryQuestion !== directorBrief.coreStoryQuestion) {
    errors.push("workflow coreStoryQuestion 与 director-brief.md 不一致");
  }
}

const cyclesByCritic = new Map<string, typeof workflow.reviewCycles>();
for (const cycle of workflow.reviewCycles) {
  const reportPath = resolveArtifact(cycle.reportPath);
  if (!fs.existsSync(reportPath)) {
    errors.push(`review cycle 报告不存在：${cycle.reportPath}`);
    continue;
  }
  if (hashFile(reportPath) !== cycle.reportSha256) {
    errors.push(`${cycle.id} reportSha256 与当前报告不一致`);
  }
  cyclesByCritic.set(cycle.critic, [...(cyclesByCritic.get(cycle.critic) ?? []), cycle]);

  if (cycle.critic === "retention-critic") {
    const report = parseRetentionGate(fs.readFileSync(reportPath, "utf8"));
    if (report.round !== cycle.round || report.verdict !== cycle.verdict) {
      errors.push(`${cycle.id} 与 retention report 的 round/verdict 不一致`);
    }
    const feedbackById = new Map(report.viewerExitRisks.map((risk) => [risk.id, risk]));
    for (const route of cycle.routes) {
      const feedback = feedbackById.get(route.feedbackId);
      if (!feedback) {
        errors.push(`${cycle.id} 路由了报告中不存在的反馈：${route.feedbackId}`);
      } else if (feedback.returnTo !== route.owner) {
        errors.push(`${cycle.id} 的 ${route.feedbackId} owner 与报告 returnTo 不一致`);
      }
      for (const artifact of route.resolutionArtifacts) {
        if (route.status === "resolved" && !fs.existsSync(resolveArtifact(artifact))) {
          errors.push(`${cycle.id} 的修订 artifact 不存在：${artifact}`);
        }
      }
    }
  }

  if (cycle.verdict === "REJECT") {
    if (cycle.routes.length === 0) errors.push(`${cycle.id} REJECT 但没有反馈路由`);
    if (cycle.routes.some((route) => route.status !== "resolved")) {
      errors.push(`${cycle.id} 仍有未闭环反馈`);
    }
  } else if (cycle.routes.some((route) => route.status === "open")) {
    errors.push(`${cycle.id} PASS 仍包含 open 路由`);
  }
}

for (const [critic, cycles] of cyclesByCritic) {
  const ordered = [...cycles].sort((left, right) => left.round - right.round);
  for (const [index, cycle] of ordered.entries()) {
    if (
      cycle.verdict === "REJECT" &&
      !ordered.slice(index + 1).some((item) => item.verdict === "PASS")
    ) {
      errors.push(`${critic} 的 REJECT 后没有后续 PASS，修订循环未闭合`);
    }
  }
}

const requiredForStoryApproval = orderedStoryRoles.slice(0, -1);
if (workflow.currentStatus === "story-approved" || workflow.currentStatus === "delivery-approved") {
  for (const role of requiredForStoryApproval) {
    if (workflow.stages.find((stage) => stage.id === role)?.status !== "complete") {
      errors.push(`${workflow.currentStatus} 要求 ${role} 为 complete`);
    }
  }
}
if (
  workflow.currentStatus === "delivery-approved" &&
  workflow.stages.find((stage) => stage.id === "delivery-critic")?.status !== "complete"
) {
  errors.push("delivery-approved 要求 delivery-critic 为 complete");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const rejectedCycles = workflow.reviewCycles.filter((cycle) => cycle.verdict === "REJECT").length;
console.log(
  `workflow validation passed: ${workflow.stages.length} owners, ${workflow.decisions.length} decisions, ${workflow.reviewCycles.length} reviews, ${rejectedCycles} closed revisions, status=${workflow.currentStatus}`,
);
