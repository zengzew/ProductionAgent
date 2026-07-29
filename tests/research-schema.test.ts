import {describe, expect, it} from "vitest";
import path from "node:path";
import {
  episodeConfigSchema,
  factSchema,
  researchTimelineSchema,
  scriptSchema,
  sourceSchema,
} from "../src/schemas/episode";
import {episodeRoot, readJson} from "../src/lib/project";

describe("episode source data", () => {
  it("matches the research and script schemas", () => {
    const config = readJson<unknown>(path.join(episodeRoot, "episode.config.json"));
    const sources = readJson<unknown[]>(path.join(episodeRoot, "research/sources.json"));
    const claims = readJson<unknown[]>(path.join(episodeRoot, "research/facts.json"));
    const timeline = readJson<unknown>(path.join(episodeRoot, "research/timeline.json"));
    const script = readJson<unknown>(path.join(episodeRoot, "story/script.json"));
    expect(episodeConfigSchema.safeParse(config).success).toBe(true);
    expect(sources.every((source) => sourceSchema.safeParse(source).success)).toBe(true);
    expect(claims.every((claim) => factSchema.safeParse(claim).success)).toBe(true);
    expect(researchTimelineSchema.safeParse(timeline).success).toBe(true);
    expect(scriptSchema.safeParse(script).success).toBe(true);
  });
});
