import crypto from "node:crypto";
import path from "node:path";
import {z} from "zod";
import {readJson, repoRoot} from "./project";

const ruleScopeSchema = z.enum(["polish", "story", "content"]);

const bannedPatternSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  label: z.string().min(1),
  pattern: z.string().min(1),
  flags: z.literal("u"),
  scopes: z.array(ruleScopeSchema).min(1),
  examples: z.array(z.string().min(1)).min(1),
});

export const editorialTextRulesSchema = z.object({
  schemaVersion: z.literal("editorial-text-rules-v1"),
  sentenceLength: z.object({
    unit: z.literal("unicode-code-points-excluding-whitespace"),
    delimitersPattern: z.string().min(1),
    targetCharacters: z.number().int().positive(),
    maximumCharacters: z.number().int().positive(),
    enforcementScopes: z.array(ruleScopeSchema),
  }),
  bannedPatterns: z.array(bannedPatternSchema).min(1),
  compatibilityExemptions: z.array(
    z.object({
      id: z.string().min(1),
      episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
      narrationSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      ruleIds: z.array(z.string().min(1)).min(1),
    }),
  ),
  protectedTerms: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  numberReading: z.object({
    normalizeForSpeech: z.boolean(),
    rejectArabicDigits: z.boolean(),
    enforcementScopes: z.array(ruleScopeSchema),
    examples: z.array(z.string().min(1)),
  }),
});

export type EditorialTextRules = z.infer<typeof editorialTextRulesSchema>;
export type RuleScope = z.infer<typeof ruleScopeSchema>;

export type TextRuleViolation = {
  id: string;
  label: string;
  match: string;
};

const validateRuleReferences = (rules: EditorialTextRules): EditorialTextRules => {
  const ruleIds = new Set(rules.bannedPatterns.map((rule) => rule.id));
  if (ruleIds.size !== rules.bannedPatterns.length) {
    throw new Error("editorial text rule id 不得重复");
  }
  for (const exemption of rules.compatibilityExemptions) {
    for (const ruleId of exemption.ruleIds) {
      if (!ruleIds.has(ruleId)) {
        throw new Error(`文本规则兼容例外引用了不存在的 rule id：${ruleId}`);
      }
    }
  }
  for (const rule of rules.bannedPatterns) {
    new RegExp(rule.pattern, rule.flags);
  }
  new RegExp(rules.sentenceLength.delimitersPattern, "u");
  return rules;
};

export const loadEditorialTextRules = (relativePath = "config/editorial-text-rules.json") => {
  const resolved = path.resolve(repoRoot, relativePath);
  if (path.relative(repoRoot, resolved).startsWith("..")) {
    throw new Error(`非法文本规则路径：${relativePath}`);
  }
  return validateRuleReferences(editorialTextRulesSchema.parse(readJson<unknown>(resolved)));
};

const exemptRuleIds = (
  rules: EditorialTextRules,
  episodeId: string | undefined,
  narration: string,
): Set<string> => {
  if (!episodeId) return new Set();
  const narrationSha256 = crypto.createHash("sha256").update(narration).digest("hex");
  return new Set(
    rules.compatibilityExemptions
      .filter(
        (exemption) =>
          exemption.episodeId === episodeId && exemption.narrationSha256 === narrationSha256,
      )
      .flatMap((exemption) => exemption.ruleIds),
  );
};

export const findTextRuleViolations = (
  narration: string,
  rules: EditorialTextRules,
  scope: RuleScope,
  episodeId?: string,
): TextRuleViolation[] => {
  const exemptions = exemptRuleIds(rules, episodeId, narration);
  return rules.bannedPatterns.flatMap((rule) => {
    if (!rule.scopes.includes(scope) || exemptions.has(rule.id)) return [];
    const match = new RegExp(rule.pattern, rule.flags).exec(narration)?.[0];
    return match ? [{id: rule.id, label: rule.label, match}] : [];
  });
};

export const countSentenceCharacters = (sentence: string): number =>
  Array.from(sentence.replace(/\s/gu, "")).length;

export const findLongSentences = (
  narration: string,
  rules: EditorialTextRules,
  scope: RuleScope,
): Array<{sentence: string; chars: number}> => {
  if (!rules.sentenceLength.enforcementScopes.includes(scope)) return [];
  return narration
    .split(new RegExp(rules.sentenceLength.delimitersPattern, "u"))
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => ({sentence, chars: countSentenceCharacters(sentence)}))
    .filter(({chars}) => chars > rules.sentenceLength.maximumCharacters);
};

export const findArabicDigitHits = (
  narration: string,
  rules: EditorialTextRules,
  scope: RuleScope,
): string[] =>
  rules.numberReading.rejectArabicDigits && rules.numberReading.enforcementScopes.includes(scope)
    ? [...new Set(narration.normalize("NFKC").match(/\d+/gu) ?? [])]
    : [];
