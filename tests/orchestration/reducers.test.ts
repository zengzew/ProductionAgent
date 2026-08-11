import {describe, expect, it} from "vitest";
import {
  appendDedupeBy,
  createInitialProductionState,
  firstWriteImmutable,
  mergeArtifactRefs,
  mergeBudget,
  mergeCompletedAgents,
  mergeEvaluationSummaries,
  mergeEventSummaries,
  mergeMax,
  mergeNumberMap,
  mergeOptionalArtifactRef,
  mergeOptionalImmutable,
  mergePhase,
  mergeRevisionSummaries,
  mergeStrictRecord,
  pickBest,
  stableJson,
  upsertIssues,
  type ArtifactRef,
} from "../../src/orchestration";

const ref = (name: string, revision = 1): ArtifactRef => ({
  artifactId: `episode-reducer:story:${name}`,
  episodeId: "episode-reducer",
  path: `content/episode-reducer/story/${name}.md`,
  mediaType: "text/markdown",
  schemaVersion: "test-v1",
  revision,
  sha256: name
    .repeat(64)
    .slice(0, 64)
    .replace(/[^a-f0-9]/gu, "a"),
  sizeBytes: 1,
  producer: "test",
  createdAt: "2026-08-05T00:00:00.000Z",
});

const assertProperties = <T>(reducer: (left: T, right: T) => T, left: T, right: T): void => {
  const forward = reducer(left, right);
  expect(reducer(right, left)).toEqual(forward);
  expect(reducer(forward, forward)).toEqual(forward);
  expect(JSON.parse(JSON.stringify(forward))).toEqual(forward);
};

describe("M1.2 ProductionState reducer properties", () => {
  it("uses one recursive key-order-insensitive serialization contract", () => {
    expect(stableJson({b: 2, a: {d: 4, c: 3}})).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(firstWriteImmutable({a: 1, b: 2}, {b: 2, a: 1})).toEqual({a: 1, b: 2});
  });

  it("keeps scalar and reference reducers commutative, idempotent and serializable", () => {
    assertProperties(firstWriteImmutable, "episode-reducer", "episode-reducer");
    assertProperties(mergePhase, "story", "visual");
    assertProperties(mergeMax, 2, 7);
    assertProperties(mergeArtifactRefs, {script: ref("a")}, {visual: ref("b")});
    assertProperties(pickBest, {script: ref("a", 1)}, {script: ref("a", 2)});
    assertProperties(mergeOptionalArtifactRef, undefined, ref("a"));
    assertProperties(mergeOptionalImmutable, undefined, "halted safely");
  });

  it("keeps append/dedupe and record reducers independent of update ordering", () => {
    const state = createInitialProductionState({episodeId: "episode-reducer", runId: "run"});
    const evaluation = {
      evaluationId: "eval-a",
      resultRef: ref("a"),
      gate: "pass" as const,
      blockerCount: 0,
      issueIds: [],
    };
    const revision = {revisionId: "rev-a", artifactRef: ref("a")};
    const event = {eventId: "event-a", executionId: "exec-a", status: "SUCCEEDED"};
    const appendEvents = (left: (typeof event)[], right: (typeof event)[]) =>
      appendDedupeBy(left, right, (value) => value.eventId);
    assertProperties(appendEvents, [event], []);
    assertProperties(mergeEvaluationSummaries, [evaluation], []);
    assertProperties(mergeRevisionSummaries, [revision], []);
    assertProperties(mergeEventSummaries, [event], []);
    assertProperties(mergeCompletedAgents, ["story-director"], ["research-analyst"]);
    assertProperties<Record<string, string>>(mergeStrictRecord, {audience: "pass"}, {fact: "pass"});
    assertProperties(mergeNumberMap, {story: 1}, {story: 2, visual: 1});
    expect(state.events).toEqual([]);
  });

  it("merges issue status monotonically and rejects terminal conflicts symmetrically", () => {
    const issue = {
      issueId: "issue-a",
      issueRef: ref("a"),
      status: "open" as const,
      owner: "story-director",
    };
    assertProperties(upsertIssues, {"issue-a": issue}, {"issue-a": {...issue, status: "assigned"}});
    expect(() =>
      upsertIssues(
        {"issue-a": {...issue, status: "resolved"}},
        {"issue-a": {...issue, status: "escalated"}},
      ),
    ).toThrow(/terminal status collision/u);
    expect(() =>
      upsertIssues(
        {"issue-a": {...issue, status: "escalated"}},
        {"issue-a": {...issue, status: "resolved"}},
      ),
    ).toThrow(/terminal status collision/u);
  });

  it("merges budget counters without retry double counting", () => {
    const base = createInitialProductionState({episodeId: "episode-reducer", runId: "run"}).budget;
    const left = {...base, spentCostUsd: 1, roundsUsed: {story: 1}};
    const right = {...base, spentCostUsd: 2, spentWallclockSeconds: 3, roundsUsed: {story: 2}};
    assertProperties(mergeBudget, left, right);
  });

  it("rejects ambiguous concurrent collisions in either ordering", () => {
    const left = ref("a");
    const right = {...left, sha256: "b".repeat(64)};
    expect(() => mergeArtifactRefs({script: left}, {script: right})).toThrow(/revision collision/u);
    expect(() => mergeArtifactRefs({script: right}, {script: left})).toThrow(/revision collision/u);
    expect(() => mergeStrictRecord({critic: "pass"}, {critic: "fail"})).toThrow(/collision/u);
    expect(() => firstWriteImmutable("run-a", "run-b")).toThrow(/immutable/u);
  });
});
