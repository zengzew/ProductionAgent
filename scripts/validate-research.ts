import path from "node:path";
import {
  episodeConfigSchema,
  factSchema,
  researchTimelineSchema,
  sourceSchema,
} from "../src/schemas/episode";
import {episodeRoot} from "../src/lib/project";
import {assertEpisodeMatchesProductionContract} from "../src/lib/production-contract";
import {finishValidation, installCliErrorHandlers, readJsonFile} from "./lib/validation";

installCliErrorHandlers();

const episodeConfig = episodeConfigSchema.parse(
  readJsonFile<unknown>(path.join(episodeRoot, "episode.config.json")),
);
assertEpisodeMatchesProductionContract(episodeConfig);
const sourcesRaw = readJsonFile<unknown[]>(path.join(episodeRoot, "research/sources.json"));
const claimsRaw = readJsonFile<unknown[]>(path.join(episodeRoot, "research/facts.json"));
const researchTimeline = researchTimelineSchema.parse(
  readJsonFile<unknown>(path.join(episodeRoot, "research/timeline.json")),
);
const sources = sourcesRaw.map((source) => sourceSchema.parse(source));
const claims = claimsRaw.map((claim) => factSchema.parse(claim));
const errors: string[] = [];

const assertUnique = (values: string[], label: string): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label} 重复：${value}`);
    seen.add(value);
  }
};

assertUnique(
  sources.map((source) => source.id),
  "source id",
);
assertUnique(
  claims.map((claim) => claim.id),
  "claim id",
);
assertUnique(
  researchTimeline.events.map((event) => event.id),
  "research timeline event id",
);

const sourceIds = new Set(sources.map((source) => source.id));
const factMap = new Map(claims.map((claim) => [claim.id, claim]));
for (const claim of claims) {
  for (const sourceId of claim.sourceIds) {
    if (!sourceIds.has(sourceId)) {
      errors.push(`${claim.id} 引用了不存在的来源 ${sourceId}`);
    }
  }
  if (claim.confidence === "low" && claim.allowedInNarration) {
    errors.push(`${claim.id} 是低可信度事实，但被允许进入旁白`);
  }
  if (
    claim.reportingType === "inference" &&
    !/分析|判断|限定|归因|假说|必须|没有/u.test(claim.notes)
  ) {
    errors.push(`${claim.id} 是推断，但 notes 未明确限定`);
  }
}

const accessedDates = new Set(sources.map((source) => source.accessedAt));
if (accessedDates.size !== 1 || !accessedDates.has(episodeConfig.asOf)) {
  errors.push(`所有来源应记录本次统一访问日期 ${episodeConfig.asOf}`);
}

if (researchTimeline.asOf !== episodeConfig.asOf) {
  errors.push(
    `research timeline asOf ${researchTimeline.asOf} 与 episode asOf ${episodeConfig.asOf} 不一致`,
  );
}

let previousSortDate = "";
for (const event of researchTimeline.events) {
  if (previousSortDate && event.sortDate < previousSortDate) {
    errors.push(`${event.id} 未按 sortDate 排序`);
  }
  previousSortDate = event.sortDate;

  const eventFactSourceIds = new Set<string>();
  for (const factId of event.factIds) {
    const fact = factMap.get(factId);
    if (!fact) {
      errors.push(`${event.id} 引用了不存在的 fact ${factId}`);
      continue;
    }
    fact.sourceIds.forEach((sourceId) => eventFactSourceIds.add(sourceId));
  }
  for (const sourceId of event.sourceIds) {
    if (!sourceIds.has(sourceId)) {
      errors.push(`${event.id} 引用了不存在的来源 ${sourceId}`);
    } else if (!eventFactSourceIds.has(sourceId)) {
      errors.push(`${event.id} 的来源 ${sourceId} 未被所列 fact 覆盖`);
    }
  }
  if (
    event.relationToPrevious === "source-supported-influence" &&
    !event.notes.match(/创始人|公司|访谈|来源/u)
  ) {
    errors.push(`${event.id} 标记为来源支持的影响关系，但 notes 未说明来源身份`);
  }
}

finishValidation(
  errors,
  `research validation passed: ${sources.length} sources, ${claims.length} facts, ${researchTimeline.events.length} events, all lineage resolved`,
);
