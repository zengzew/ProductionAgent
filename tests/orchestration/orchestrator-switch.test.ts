import {describe, expect, it} from "vitest";
import {runSelectedOrchestrator, selectOrchestrator} from "../../src/orchestration";

describe("M1.2 manual/LangGraph rollout switch", () => {
  it("keeps manual as the default and safe fallback", () => {
    expect(selectOrchestrator()).toBe("manual");
    expect(selectOrchestrator("langgraph")).toBe("langgraph");
    expect(selectOrchestrator("manual")).toBe("manual");
    expect(selectOrchestrator("LANGGRAPH")).toBe("manual");
    expect(selectOrchestrator("invalid")).toBe("manual");
  });

  it("runs only the explicitly selected implementation", async () => {
    const calls: string[] = [];
    const manual = () => {
      calls.push("manual");
      return "manual-result";
    };
    const langgraph = () => {
      calls.push("langgraph");
      return "langgraph-result";
    };

    await expect(runSelectedOrchestrator({value: "manual", manual, langgraph})).resolves.toEqual({
      mode: "manual",
      result: "manual-result",
    });
    expect(calls).toEqual(["manual"]);

    calls.length = 0;
    await expect(runSelectedOrchestrator({value: "langgraph", manual, langgraph})).resolves.toEqual(
      {
        mode: "langgraph",
        result: "langgraph-result",
      },
    );
    expect(calls).toEqual(["langgraph"]);

    calls.length = 0;
    await expect(runSelectedOrchestrator({manual, langgraph})).resolves.toEqual({
      mode: "manual",
      result: "manual-result",
    });
    expect(calls).toEqual(["manual"]);
  });
});
