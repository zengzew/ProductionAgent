import {describe, expect, it} from "vitest";
import {
  createRuntimeIdentity,
  runtimeIdBelongsToEpisode,
  runtimeIdentitySchema,
} from "../../src/orchestration";

describe("runtime identity episode scoping", () => {
  it("accepts the episode id and episode-prefixed thread or trace ids", () => {
    expect(runtimeIdBelongsToEpisode("episode-001", "episode-001")).toBe(true);
    expect(runtimeIdBelongsToEpisode("episode-001:run:abc", "episode-001")).toBe(true);
    expect(
      createRuntimeIdentity({
        episodeId: "episode-001",
        runId: "run-1",
        threadId: "episode-001",
        traceId: "episode-001:run:run-1",
      }).threadId,
    ).toBe("episode-001");
  });

  it("rejects substring collisions with longer episode ids", () => {
    expect(runtimeIdBelongsToEpisode("episode-001-v2-goal3", "episode-001")).toBe(false);
    expect(runtimeIdBelongsToEpisode("episode-0010", "episode-001")).toBe(false);
    expect(() =>
      runtimeIdentitySchema.parse({
        episodeId: "episode-001",
        runId: "run-1",
        threadId: "episode-001-v2-goal3",
        traceId: "episode-001:run:run-1",
      }),
    ).toThrow(/start with episodeId:/u);
  });
});
