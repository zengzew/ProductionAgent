import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {captionPartsFromPlan, splitCaptionText} from "./captions";
import {chatJson} from "./llm";
import {loadPolishV2Config, promptText, repoPath, type PolishStyle} from "./pipeline-v2-config";
import {ensureDir, episodeId, episodeRoot, outputEpisodeRoot, readJson, writeJson} from "./project";
import {scriptSchema, type Script} from "../schemas/episode";

const candidateSchema = z.object({
  segments: z.array(z.object({id: z.string().min(1), narration: z.string().min(1)})),
});
const polishJudgeEvidenceSchema = z.object({
  segmentId: z.string().min(1),
  observation: z.string().min(1),
});
const polishJudgeCheckSchema = z.object({
  result: z.enum(["pass", "fail"]),
  evidence: z.array(polishJudgeEvidenceSchema).min(1),
});
export const polishJudgeSchema = z.object({
  scores: z.object({
    translationese: z.number().min(0).max(10),
    spokenChinese: z.number().min(0).max(10),
    informationFidelity: z.number().min(0).max(10),
  }),
  checks: z.object({
    translatedSyntax: polishJudgeCheckSchema,
    sourceAttributionLanguage: polishJudgeCheckSchema,
    productStageLanguage: polishJudgeCheckSchema,
    turnDirection: polishJudgeCheckSchema,
    sentenceCadence: polishJudgeCheckSchema,
    spokenBreath: polishJudgeCheckSchema,
    informationFidelity: polishJudgeCheckSchema,
  }),
  issues: z.array(z.string()),
  verdict: z.enum(["pass", "rewrite"]),
});

export type HardConstraintReport = {
  passed: boolean;
  bannedTermHits: string[];
  missingProtectedTerms: string[];
  unexplainedFirstTerms: string[];
  arabicDigitHits: string[];
  longSentences: Array<{segmentId: string; sentence: string; chars: number}>;
};

export const selectStyleSamples = (
  directory: string,
  count: number,
  random: () => number = Math.random,
) => {
  const files = fs
    .readdirSync(directory)
    .filter(
      (file) =>
        /\.(?:md|txt)$/u.test(file) &&
        file.toLowerCase() !== "readme.md" &&
        fs.statSync(path.join(directory, file)).isFile(),
    );
  for (let index = files.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [files[index], files[selected]] = [files[selected]!, files[index]!];
  }
  return files.slice(0, count).map((file) => ({
    file,
    content: fs.readFileSync(path.join(directory, file), "utf8").trim(),
  }));
};

const narration = (script: Script): string =>
  script.segments.map((segment) => segment.narration).join("\n");

export const evaluateHardConstraints = (
  source: Script,
  candidate: Script,
  style: PolishStyle,
): HardConstraintReport => {
  const sourceText = narration(source);
  const output = narration(candidate);
  const bannedTermHits = style.bannedTerms.filter((term) => output.includes(term));
  const missingProtectedTerms = Object.keys(style.protectedTerms).filter(
    (term) => sourceText.includes(term) && !output.includes(term),
  );
  const unexplainedFirstTerms = Object.entries(style.protectedTerms)
    .filter(([term]) => sourceText.includes(term))
    .filter(([term, explanations]) => {
      const index = output.indexOf(term);
      return (
        index >= 0 && !explanations.some((word) => output.slice(index, index + 64).includes(word))
      );
    })
    .map(([term]) => term);
  const arabicDigitHits = style.numberReading.rejectArabicDigits
    ? [...new Set(output.normalize("NFKC").match(/\d+/gu) ?? [])]
    : [];
  const longSentences = candidate.segments.flatMap((segment) =>
    segment.narration
      .split(/[。！？!?]/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .map((sentence) => ({
        segmentId: segment.id,
        sentence,
        chars: Array.from(sentence.replace(/\s/gu, "")).length,
      }))
      .filter(({chars}) => chars > style.maxSentenceChars),
  );
  return {
    passed:
      bannedTermHits.length +
        missingProtectedTerms.length +
        unexplainedFirstTerms.length +
        arabicDigitHits.length +
        longSentences.length ===
      0,
    bannedTermHits,
    missingProtectedTerms,
    unexplainedFirstTerms,
    arabicDigitHits,
    longSentences,
  };
};

const merge = (source: Script, raw: unknown): Script => {
  const byId = new Map(
    candidateSchema.parse(raw).segments.map((segment) => [segment.id, segment.narration]),
  );
  if (byId.size !== source.segments.length) throw new Error("polish 返回的段落数量不完整");
  return scriptSchema.parse({
    ...source,
    segments: source.segments.map((segment) => {
      const nextNarration = byId.get(segment.id);
      if (!nextNarration) throw new Error(`polish 返回缺少 ${segment.id}`);
      return {...segment, narration: nextNarration};
    }),
  });
};

const sourceFromDraft = (): Script => {
  const base = scriptSchema.parse(readJson<unknown>(path.join(episodeRoot, "story/script.json")));
  const markdown = fs.readFileSync(path.join(episodeRoot, "story/script-draft.md"), "utf8");
  const blocks = markdown.split(/(?=^## seg-[a-z0-9-]+\s*$)/gmu).slice(1);
  const byId = new Map(
    blocks.map((block) => [
      block.match(/^## (seg-[a-z0-9-]+)/mu)?.[1],
      block
        .replace(/^## seg-[a-z0-9-]+\s*/u, "")
        .trim()
        .replace(/\s*\n\s*/gu, ""),
    ]),
  );
  return scriptSchema.parse({
    ...base,
    segments: base.segments.map((segment) => ({
      ...segment,
      narration: byId.get(segment.id) ?? segment.narration,
    })),
  });
};

export const fillTemplate = (value: string, replacements: Record<string, string>): string =>
  value.replace(/\{\{([A-Z_]+)\}\}/gu, (placeholder, key: string) => {
    const replacement = replacements[key];
    if (replacement === undefined) {
      throw new Error(`Prompt 模板包含未知占位符：${placeholder}`);
    }
    return replacement;
  });

export const createPolishedCaptionPlan = (candidate: Script, maxLineChars = 16) => ({
  segments: candidate.segments.map((segment) => {
    const cues = splitCaptionText(segment.narration, maxLineChars).map((part) => part.text);
    captionPartsFromPlan(segment.narration, cues, maxLineChars);
    return {segmentId: segment.id, cues};
  }),
});

export const runPolish = async () => {
  const runId = new Date().toISOString().replace(/[:.]/gu, "-");
  const reportDirectory = path.join(outputEpisodeRoot, "polish", runId);
  const reportPath = path.join(reportDirectory, "judge-report.json");
  ensureDir(reportDirectory);
  try {
    const {config, style} = loadPolishV2Config();
    const apiKey = process.env[config.llm.apiKeyEnv];
    if (!apiKey) throw new Error(`polish 需要环境变量 ${config.llm.apiKeyEnv}`);
    const client = {
      endpoint: config.llm.endpoint,
      apiKey,
      model: process.env[config.llm.modelEnv] ?? config.llm.defaultModel,
      temperature: config.llm.temperature,
      network: config.llm.network,
    };
    const source = sourceFromDraft();
    const samples = selectStyleSamples(repoPath(config.acceptedSamplesDir), config.sampleCount);
    const rules = `${fs.readFileSync(repoPath(config.voiceGuide), "utf8")}\n机器硬约束：\n${JSON.stringify(style, null, 2)}`;
    const system = promptText(config.prompts.polishSystem);
    let candidate = merge(
      source,
      await chatJson<unknown>(client, [
        {role: "system", content: system},
        {
          role: "user",
          content: fillTemplate(promptText(config.prompts.polishUser), {
            STYLE_RULES: rules,
            FEW_SHOTS:
              samples.map((sample) => `### ${sample.file}\n${sample.content}`).join("\n\n") ||
              "本次没有人工样本。",
            SCRIPT: JSON.stringify(source, null, 2),
          }),
        },
      ]),
    );
    const rounds = [];
    for (let round = 1; round <= config.maxRounds; round += 1) {
      const judge = polishJudgeSchema.parse(
        await chatJson<unknown>(client, [
          {role: "system", content: promptText(config.prompts.judgeSystem)},
          {
            role: "user",
            content: fillTemplate(promptText(config.prompts.judgeUser), {
              ORIGINAL: JSON.stringify(
                source.segments.map(({id, narration: text}) => ({id, narration: text})),
                null,
                2,
              ),
              CANDIDATE: JSON.stringify(
                candidate.segments.map(({id, narration: text}) => ({id, narration: text})),
                null,
                2,
              ),
            }),
          },
        ]),
      );
      const hardConstraints = evaluateHardConstraints(source, candidate, style);
      const passed =
        hardConstraints.passed &&
        judge.verdict === "pass" &&
        Object.values(judge.checks).every((check) => check.result === "pass") &&
        judge.scores.translationese >= config.thresholds.translationese &&
        judge.scores.spokenChinese >= config.thresholds.spokenChinese &&
        judge.scores.informationFidelity >= config.thresholds.informationFidelity;
      rounds.push({round, ...judge, hardConstraints, passed});
      if (passed || round === config.maxRounds) break;
      candidate = merge(
        source,
        await chatJson<unknown>(client, [
          {role: "system", content: system},
          {
            role: "user",
            content: fillTemplate(promptText(config.prompts.rewriteUser), {
              STYLE_RULES: rules,
              CANDIDATE: JSON.stringify(candidate, null, 2),
              JUDGE: JSON.stringify(rounds.at(-1), null, 2),
            }),
          },
        ]),
      );
    }
    const status = rounds.at(-1)?.passed ? "passed" : "max-rounds-exhausted";
    const report = {
      schemaVersion: 1,
      runId,
      episodeId,
      generatedAt: new Date().toISOString(),
      status,
      model: client.model,
      promptVersion: config.promptVersion,
      judgeRubricVersion: config.judgeRubricVersion,
      selectedSamples: samples.map((sample) => sample.file),
      sourceSha256: crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex"),
      candidateSha256: crypto.createHash("sha256").update(JSON.stringify(candidate)).digest("hex"),
      rounds,
    };
    writeJson(reportPath, report);
    writeJson(path.join(episodeRoot, "production/polish-judge-report.json"), report);
    writeJson(path.join(episodeRoot, "story/polished-script.json"), candidate);
    writeJson(
      path.join(episodeRoot, "story/polished-caption-plan.json"),
      createPolishedCaptionPlan(candidate),
    );
    return {runId, reportPath, status, source, candidate, rounds};
  } catch (error) {
    writeJson(reportPath, {
      schemaVersion: 1,
      runId,
      episodeId,
      generatedAt: new Date().toISOString(),
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      rounds: [],
    });
    throw error;
  }
};
