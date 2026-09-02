import path from "node:path";
import {
  assessStorySourcePreflight,
  storySourcePreflightSchema,
} from "../src/lib/editorial/story-source-preflight";
import {finishValidation, installCliErrorHandlers, readJsonFile} from "./lib/validation";

installCliErrorHandlers();

const candidateIndex = process.argv.indexOf("--candidate");
const candidateArgument = candidateIndex < 0 ? undefined : process.argv[candidateIndex + 1];
if (!candidateArgument) {
  throw new Error("用法：pnpm validate:story-source -- --candidate <candidate-json>");
}
if (process.argv.indexOf("--candidate", candidateIndex + 1) >= 0) {
  throw new Error("参数 --candidate 不能重复");
}

const candidatePath = path.resolve(process.cwd(), candidateArgument);
const candidate = storySourcePreflightSchema.parse(readJsonFile<unknown>(candidatePath));
const assessment = assessStorySourcePreflight(candidate);
const scoreSummary = Object.entries(assessment.scores)
  .map(([key, value]) => `${key}=${value}`)
  .join(", ");

finishValidation(
  assessment.decision === "ready"
    ? []
    : [
        `story-source preflight=${assessment.decision}`,
        ...assessment.reasons,
        `scores: ${scoreSummary}`,
      ],
  `story-source preflight passed: ${candidate.product}, decision=ready, ${scoreSummary}`,
);
