import {describe, expect, it} from "vitest";
import {findTextRuleViolations, loadEditorialTextRules} from "../src/lib/editorial-text-rules";
import {loadPolishV2Config} from "../src/lib/pipeline-v2-config";

describe("editorial text rule contract", () => {
  const rules = loadEditorialTextRules();

  it("is the versioned style source loaded by polish", () => {
    const {config, style} = loadPolishV2Config();
    expect(config.styleRules).toBe("config/editorial-text-rules.json");
    expect(style).toEqual(rules);
    expect(rules.schemaVersion).toBe("editorial-text-rules-v1");
  });

  it("rejects every configured example in polish, story and content", () => {
    for (const rule of rules.bannedPatterns) {
      for (const example of rule.examples) {
        for (const scope of ["polish", "story", "content"] as const) {
          expect(
            findTextRuleViolations(example, rules, scope).map((violation) => violation.id),
            `${rule.id} must be enforced in ${scope}`,
          ).toContain(rule.id);
        }
      }
    }
  });

  it("produces identical banned-rule decisions in both validators and polish", () => {
    const narration = rules.bannedPatterns.map((rule) => rule.examples[0]).join("。");
    const decisions = (["polish", "story", "content"] as const).map((scope) =>
      findTextRuleViolations(narration, rules, scope).map((violation) => violation.id),
    );
    expect(decisions[1]).toEqual(decisions[0]);
    expect(decisions[2]).toEqual(decisions[0]);
  });
});
