import {describe, expect, it} from "vitest";
import {
  agentNames,
  buildRoleBenchmarkRequest,
  getRoleModelContract,
  loadRoleModelContractFile,
  roleContractIsExecutable,
  roleModelContractFile,
  runAutoPreflight,
} from "../../src/orchestration";
import {loadRoleModelBenchmarkConfig} from "../../src/orchestration/config/role-model-benchmark";

const repoRoot = new URL("../..", import.meta.url).pathname.replace(/\/$/u, "");

describe("role-aware benchmark contracts", () => {
  it("has one explicit contract for every current agent role", () => {
    const file = loadRoleModelContractFile();
    expect(Object.keys(file.roles).sort()).toEqual([...agentNames].sort());
    for (const role of agentNames) {
      const contract = getRoleModelContract(role, file);
      expect(
        contract.allowedFrozenInputs.some((item) =>
          contract.expectedOutputs.some((output) => output.path === item),
        ),
      ).toBe(false);
      expect(contract.hardValidators.length).toBeGreaterThan(0);
      expect(contract.promotionEligibility).toContain("clean-round-0");
      expect(contract.cacheIdentityVersion).toMatch(/-v[0-9]+$/u);
      expect(contract.repairFairness.maxPromotionRepairRound).toBe(0);
    }
  });

  it("builds exact frozen requests for every enabled text role", () => {
    for (const role of agentNames.filter((candidate) => roleContractIsExecutable(candidate))) {
      const request = buildRoleBenchmarkRequest({
        repoRoot,
        episodeId: "episode-004",
        role,
        createdAt: "2026-08-21T00:00:00.000Z",
      });
      const contract = getRoleModelContract(role);
      expect(request.agentName).toBe(role);
      expect(request.revisionRound).toBe(0);
      expect(request.inputArtifacts.map((artifact) => artifact.path)).toEqual(
        contract.allowedFrozenInputs.map((item) => item.replaceAll("<episodeId>", "episode-004")),
      );
      expect(request.expectedOutputs.map((output) => output.path)).toEqual(
        contract.expectedOutputs.map((item) => item.path.replaceAll("<episodeId>", "episode-004")),
      );
      expect(
        request.expectedOutputs.every((output) =>
          /^episode-[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/u.test(output.artifactId),
        ),
      ).toBe(true);
    }
  });

  it("routes Codex capability roles away from the hosted text benchmark", () => {
    const config = loadRoleModelBenchmarkConfig({repoRoot});
    for (const role of ["research-analyst", "visual-director", "delivery-critic"] as const) {
      const preflight = runAutoPreflight({
        repoRoot,
        episodeId: "episode-004",
        role,
        modelSet: config.defaultModelSet,
        config,
        env: {},
      });
      expect(preflight).toMatchObject({ok: false, code: "preflight-role-not-allowed"});
      expect(preflight.ok ? "" : preflight.detail).toContain(role);
    }
  });

  it("keeps the imported catalog hashable and deterministic", () => {
    expect(roleModelContractFile.schemaVersion).toBe("role-model-contracts-v1");
    expect(roleModelContractFile.roles["script-writer"]?.evaluator).toBe("script-writer");
  });
});
