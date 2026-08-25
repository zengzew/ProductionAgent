import path from "node:path";
import {describe, expect, it} from "vitest";
import {
  assertCodexCapabilityContracts,
  codexCapabilityAgentNames,
  codexCapabilityGates,
  resolveCodexCapabilityGate,
} from "../../src/orchestration";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("Codex capability gates", () => {
  it("assigns exactly the non-text capability roles to Codex 5.6", () => {
    expect(Object.keys(codexCapabilityGates.roles)).toEqual(codexCapabilityAgentNames);
    expect(codexCapabilityGates.executor).toEqual({
      kind: "codex",
      model: "gpt-5.6",
      interaction: "in-session-file-handoff",
      apiKeyRequired: false,
    });
    expect(codexCapabilityGates.mediaVerification).toMatchObject({
      executor: "codex",
      model: "gpt-5.6",
      handoff: "bounded-local-files",
      wholeSourceMediaAllowed: false,
    });
  });

  it("keeps every role contract present and every completion gate explicit", () => {
    expect(() => assertCodexCapabilityContracts(repoRoot)).not.toThrow();
    for (const agentName of codexCapabilityAgentNames) {
      const gate = resolveCodexCapabilityGate(agentName);
      expect(gate.requiredCapabilities.length).toBeGreaterThan(0);
      expect(gate.completionValidators.every((command) => command.startsWith("pnpm "))).toBe(true);
    }
  });
});
