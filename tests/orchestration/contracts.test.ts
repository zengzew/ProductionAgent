import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  agentExecutionResultSchema,
  artifactRefSchema,
  assertReferenceOnlyState,
  buildArtifactRef,
  createAgentRunner,
  createInitialProductionState,
  emptyArtifactIndex,
  markStaleTransitively,
  mergeArtifactRefs,
  mergeCompletedAgents,
  readArtifactIndex,
  registerCandidate,
  runSelectedOrchestrator,
  selectArtifact,
  selectOrchestrator,
  writeArtifactIndex,
  type ArtifactDependency,
  type ArtifactRef,
} from "../../src/orchestration";

const temporaryDirectories: string[] = [];

const temporaryRepo = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "production-agent-contracts-"));
  temporaryDirectories.push(directory);
  return directory;
};

const writeArtifact = (repoRoot: string, repositoryPath: string, body: string): void => {
  const filePath = path.join(repoRoot, repositoryPath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, body);
};

const makeRef = (repoRoot: string, logicalName: string, previous?: ArtifactRef): ArtifactRef =>
  buildArtifactRef({
    repoRoot,
    artifactId: `episode-test:story:${logicalName}`,
    episodeId: "episode-test",
    path: `content/episode-test/story/${logicalName}.md`,
    mediaType: "text/markdown",
    schemaVersion: "test-v1",
    producer: "test",
    previous,
    createdAt: "2026-08-05T00:00:00.000Z",
  });

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe("M1.1 orchestration contracts", () => {
  it("validates repository-relative, hash-bound artifact references", () => {
    const repoRoot = temporaryRepo();
    writeArtifact(repoRoot, "content/episode-test/story/script.md", "same bytes\n");
    const first = makeRef(repoRoot, "script");
    const same = makeRef(repoRoot, "script", first);
    writeArtifact(repoRoot, "content/episode-test/story/script.md", "changed bytes\n");
    const changed = makeRef(repoRoot, "script", same);

    expect(same.revision).toBe(first.revision);
    expect(same.sha256).toBe(first.sha256);
    expect(changed.revision).toBe(first.revision + 1);
    expect(changed.sha256).not.toBe(first.sha256);
    expect(() => artifactRefSchema.parse({...first, path: "/tmp/script.md"})).toThrow();
  });

  it("keeps registry selection reference-only and invalidates descendants transitively", () => {
    const repoRoot = temporaryRepo();
    for (const name of ["facts", "script", "render"]) {
      writeArtifact(repoRoot, `content/episode-test/story/${name}.md`, `${name}\n`);
    }
    const facts = makeRef(repoRoot, "facts");
    const script = makeRef(repoRoot, "script");
    const render = makeRef(repoRoot, "render");
    const dependency = (ref: ArtifactRef): ArtifactDependency => ({
      artifactId: ref.artifactId,
      path: ref.path,
      sha256: ref.sha256,
      relation: "reads",
    });

    let index = emptyArtifactIndex("episode-test");
    index = selectArtifact(registerCandidate(index, facts, "exec-facts", []), facts);
    index = selectArtifact(
      registerCandidate(index, script, "exec-script", [dependency(facts)]),
      script,
    );
    index = selectArtifact(
      registerCandidate(index, render, "exec-render", [dependency(script)]),
      render,
    );
    const stale = markStaleTransitively(index, [facts.artifactId]);
    const registryPath = path.join(repoRoot, "content/episode-test/artifact-index.json");
    writeArtifactIndex(registryPath, stale);

    expect(stale.artifacts.filter((record) => record.state === "stale")).toHaveLength(3);
    expect(stale.selected).toEqual({});
    expect(readArtifactIndex(registryPath)).toEqual(stale);
    expect(JSON.stringify(stale)).not.toContain("facts\n");
  });

  it("rejects artifact bodies and oversized decision summaries in ProductionState", () => {
    const state = createInitialProductionState({episodeId: "episode-test", runId: "run-1"});
    expect(assertReferenceOnlyState(state)).toEqual(state);
    expect(() => assertReferenceOnlyState({...state, content: "full script"})).toThrow(
      /forbidden artifact body/u,
    );
    expect(() =>
      assertReferenceOnlyState({
        ...state,
        decisions: {test: {code: "TEST", summary: "界".repeat(167)}},
      }),
    ).toThrow(/500 UTF-8 bytes/u);
  });

  it("keeps the agent runner framework-neutral and validates result completeness", async () => {
    const repoRoot = temporaryRepo();
    writeArtifact(repoRoot, "content/episode-test/story/prompt.md", "prompt\n");
    const promptRef = makeRef(repoRoot, "prompt");
    const request = {
      contractVersion: "agent-execution-v1" as const,
      executionId: "exec-1",
      episodeId: "episode-test",
      agentName: "research-analyst" as const,
      attempt: 1,
      revisionRound: 0,
      promptRef,
      inputArtifacts: [promptRef],
      expectedOutputs: [
        {artifactId: "episode-test:story:result", path: "result.md", schemaVersion: "v1"},
      ],
      upstreamGateRefs: [],
      revisionBudgetRemaining: 0,
    };
    const runner = createAgentRunner((validRequest) =>
      agentExecutionResultSchema.parse({
        contractVersion: "agent-execution-result-v1",
        executionId: validRequest.executionId,
        status: "SUCCEEDED",
        outputArtifacts: [],
        decision: {code: "OK", summary: "fixture"},
      }),
    );

    await expect(runner(request)).rejects.toThrow(/missing declared outputs/u);
  });

  it("defaults invalid or absent orchestration modes to manual", async () => {
    expect(selectOrchestrator(undefined)).toBe("manual");
    expect(selectOrchestrator("future-mode")).toBe("manual");
    expect(selectOrchestrator("langgraph")).toBe("langgraph");

    const calls: string[] = [];
    const selected = await runSelectedOrchestrator({
      value: "langgraph",
      manual: () => calls.push("manual"),
      langgraph: () => calls.push("langgraph"),
    });
    expect(selected.mode).toBe("langgraph");
    expect(calls).toEqual(["langgraph"]);
  });

  it("uses deterministic, idempotent reducers for checkpointed reference state", () => {
    const repoRoot = temporaryRepo();
    writeArtifact(repoRoot, "content/episode-test/story/one.md", "one\n");
    writeArtifact(repoRoot, "content/episode-test/story/two.md", "two\n");
    const one = makeRef(repoRoot, "one");
    const two = makeRef(repoRoot, "two");

    expect(mergeArtifactRefs({one}, {two})).toEqual(mergeArtifactRefs({two}, {one}));
    expect(mergeArtifactRefs({one}, {one})).toEqual({one});
    expect(mergeCompletedAgents(["story-director"], ["research-analyst"])).toEqual([
      "research-analyst",
      "story-director",
    ]);
  });

  it("isolates all direct LangGraph imports in lg-compat", () => {
    const sourceRoot = path.resolve(import.meta.dirname, "../../src/orchestration");
    const collectTypeScript = (directory: string): string[] =>
      fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory()
          ? collectTypeScript(entryPath)
          : entry.name.endsWith(".ts")
            ? [entryPath]
            : [];
      });
    const directImports = collectTypeScript(sourceRoot).filter((filePath) =>
      fs.readFileSync(filePath, "utf8").includes('from "@langchain/langgraph'),
    );

    expect(directImports).toEqual([path.join(sourceRoot, "lg-compat.ts")]);
  });
});
