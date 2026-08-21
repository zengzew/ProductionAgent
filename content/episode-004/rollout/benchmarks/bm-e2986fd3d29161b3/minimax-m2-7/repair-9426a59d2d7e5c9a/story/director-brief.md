<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "Three IOI gold medalists built an AI that does software engineering work autonomously. How did an official demo get 1.22M views, and what did the market eventually pay for it?",
  "audiencePromise": "You will see an AI actually doing a programming task end-to-end, understand why it changed how software gets built, and learn what a Fortune 500 company and investors concluded it's worth.",
  "sourcedAnswer": "Cognition's founders, all IOI gold medalists, released Devin as an autonomous agent that accepts tasks and independently writes, tests, and submits code through its own browser, shell, and IDE. The March 2024 demo reached 1.22M views without paid ads. After launching at $500/month for teams, Devin 2.0 introduced a $20/month personal plan with parallel execution. In April 2026, Mercedes-Benz publicly credited Devin with cutting a COBOL modernization project from an estimated 8 months to 8 days across 200,000 lines of code. One month later, Cognition raised over $1 billion at a $25 billion pre-money valuation.",
  "factBoundary": "SWE-bench 13.86% does not enter narration. Mercedes '8 months' is project estimate, not a measured before/after. $500/month was the GA team-tier price; $20/month is the Devin 2.0 personal plan price — not the same product tier reduced in price. 89% internal code figure is company-reported and does not enter narration. Goldman Sachs pilot is excluded (media-only, no company confirmation in sources).",
  "emotionalArc": [
    {
      "beatId": "beat-1",
      "viewerState": "Anticipation — viewer is watching something that looks like a real coding task in progress",
      "storyMove": "Devin's interface appears. A task is entered. Devin opens a browser, writes code, runs commands, and produces a test result — all visible on screen.",
      "targetRange": "0–12 seconds",
      "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004", "claim-devin-009"]
    },
    {
      "beatId": "beat-2",
      "viewerState": "Understanding — viewer grasps what makes this different from autocomplete",
      "storyMove": "Voice/b-text identifies Devin as the product and names its core value: it works autonomously, not just suggests. Founders named as context.",
      "targetRange": "12–22 seconds",
      "claimIds": ["claim-devin-002", "claim-devin-012", "claim-devin-013"]
    },
    {
      "beatId": "beat-3",
      "viewerState": "Scale signal — viewer sees the market noticed",
      "storyMove": "Demo reached 1.22M views. Founders Fund seed: $21M at $350M valuation on the day of release.",
      "targetRange": "22–32 seconds",
      "claimIds": ["claim-devin-014", "claim-devin-015"]
    },
    {
      "beatId": "beat-4",
      "viewerState": "Strategic choice — viewer sees the product evolved and its price changed",
      "storyMove": "Devin 2.0 launches parallel Devins and drops to $20/month personal plan. The company made a deliberate move to reach more users.",
      "targetRange": "32–42 seconds",
      "claimIds": ["claim-devin-005", "claim-devin-006"]
    },
    {
      "beatId": "beat-5",
      "viewerState": "Verification — viewer sees a real enterprise result, not a demo",
      "storyMove": "Mercedes-Benz: Devin analyzed 200,000 lines of COBOL code and cut modernization time from an estimated 8 months to 8 days. Mercedes then deployed the full product suite.",
      "targetRange": "42–54 seconds",
      "claimIds": ["claim-devin-007"]
    },
    {
      "beatId": "beat-6",
      "viewerState": "Resolution — viewer sees what the market concluded the product is worth",
      "storyMove": "May 2026: Cognition raised over $1 billion at a $25 billion pre-money valuation. The market priced an autonomous AI software engineer at a level that makes the question of 'what it is worth' concrete.",
      "targetRange": "54–68 seconds",
      "claimIds": ["claim-devin-016"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin's interface is performing a task autonomously — browser, code editor, shell all active",
      "withheldAnswer": "Who is watching this and why does it matter?",
      "purpose": "Hook: show the observable behavior first. Viewers who have used copilots will immediately notice Devin is doing more than suggesting — it is executing."
    },
    {
      "order": 2,
      "reveal": "This is Devin, by Cognition. Three IOI gold medalists built it as an autonomous agent that completes tasks and hands engineers a reviewed result.",
      "withheldAnswer": "How did anyone find out about it?",
      "purpose": "Name the product and establish credibility through founder background. Establish the 'teammate' model: task goes in, PR comes out."
    },
    {
      "order": 3,
      "reveal": "The official demo reached 1.22 million views. On release day, Founders Fund invested $21 million at a $350 million valuation.",
      "withheldAnswer": "Did the product deliver on that early signal?",
      "purpose": "Cold start: viewers can verify the demo exists. Market pricing on the same day anchors the scale of attention."
    },
    {
      "order": 4,
      "reveal": "Devin 2.0 introduced parallel execution and a $20/month personal plan. The earlier team tier was $500/month.",
      "withheldAnswer": "Who actually paid for it?",
      "purpose": "Show product evolution and deliberate pricing strategy. Do not frame $20 as a price cut from $500 — they are different tiers. The move to personal pricing signals broader access."
    },
    {
      "order": 5,
      "reveal": "Mercedes-Benz used Devin to modernize over 200,000 lines of COBOL code in an estimated 8 days — versus an 8-month estimate without it.",
      "withheldAnswer": "What does this mean for the product's trajectory?",
      "purpose": "Enterprise proof point with a named client, a specific technical result, and a deployment outcome. Anchor '8 days' as a project estimate from the blog, not a controlled experiment."
    },
    {
      "order": 6,
      "reveal": "In May 2026, Cognition raised over $1 billion at a $25 billion pre-money valuation.",
      "withheldAnswer": "none",
      "purpose": "Positive ending anchored in capital markets evidence. Do not close with a question or 'what's next' — the valuation is the answer to what the market concluded."
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief — Episode 004: Devin by Cognition

## Reviewed Research Files

| File | SHA-256 |
|------|---------|
| facts.json | `2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee` |
| sources.json | `988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d` |
| timeline.json | `7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8` |

## Core Story Question

**Three IOI gold medalists built an AI that does software engineering work autonomously. How did an official demo get 1.22M views, and what did the market eventually pay for it?**

## Sourced Answer

Cognition's founders — all three IOI gold medalists — released Devin as an autonomous agent that accepts tasks and independently writes, tests, and submits code through its own browser, shell, and IDE. The March 2024 demo reached 1.22M views without paid ads. After launching at $500/month for teams, Devin 2.0 introduced a $20/month personal plan with parallel execution. In April 2026, Mercedes-Benz publicly credited Devin with cutting a COBOL modernization project from an estimated 8 months to 8 days across 200,000 lines of code. One month later, Cognition raised over $1 billion at a $25 billion pre-money valuation.

## Audience Promise

You will see an AI actually doing a programming task end-to-end, understand why it changed how software gets built, and learn what a Fortune 500 company and investors concluded it's worth.

## Story Thesis

> Devin promises to complete software engineering tasks autonomously — not suggest code, but execute, test, and deliver.
>
> The evidence shows that promise through an official demo that reached 1.22M views without paid promotion, a deliberate pricing expansion from enterprise teams to individual developers, a named Fortune 500 customer with a specific measured result, and a capital markets valuation of $25 billion.

## Angle Comparison

| Angle | Promise | Evidence Type | Weakness |
|-------|---------|---------------|----------|
| **A: Founder credibility** | "Elite engineers built the tool they wished existed" | IOI gold medals, seed valuation on release day | Credibility does not prove product behavior |
| **B: Pricing evolution** | "We started expensive, then made it accessible" | $500 → $20 pricing tiers | Pricing story alone skips what the product does |
| **C: Autonomous execution** | "An AI that works end-to-end, not just suggests" | Visible demo, Mercedes result, $25B valuation | Requires viewer to understand what autonomous means vs. copilot |

**Selected: Angle C** — It is the only angle that is simultaneously demonstrable on screen, falsifiable from available sources, and aligned with how Cognition positioned the product from day one.

## Fact Boundary

- SWE-bench 13.86% does not enter narration (benchmark score, background only).
- Mercedes "8 months" is a project estimate from the official blog, not a controlled before/after measurement.
- $500/month was the GA team-tier price; $20/month is the Devin 2.0 personal plan price. They are different tiers. Do not frame $20 as a discount on $500.
- 89% internal code commit figure is company-reported and does not enter narration.
- Goldman Sachs pilot is excluded: media-reported only, no company confirmation in the source package.
- PR merge rate 34%→67% and 4x speed improvement are excluded (company-reported performance, not user-facing proof).

## Emotional Arc

| Beat | Time | Viewer State | Story Move | Claims |
|------|------|--------------|------------|--------|
| 1 | 0–12s | Anticipation — watching a real coding task | Devin interface: task entered → browser opens → code written → commands run → test result visible | claim-devin-001, 003, 004, 009 |
| 2 | 12–22s | Understanding — what makes this different | Product named. Core value: autonomous, not a suggestion tool. Founders as credibility signal. | claim-devin-002, 012, 013 |
| 3 | 22–32s | Scale signal — the market noticed | Demo 1.22M views. Founders Fund seed: $21M / $350M valuation on release day. | claim-devin-014, 015 |
| 4 | 32–42s | Strategic choice — product evolved, price changed | Devin 2.0: parallel Devins + $20/month personal plan. Deliberate move to broader access. | claim-devin-005, 006 |
| 5 | 42–54s | Verification — real enterprise result | Mercedes: 200K lines COBOL, estimated 8 months → 8 days. Full deployment follows. | claim-devin-007 |
| 6 | 54–68s | Resolution — market concluded the value | May 2026: $1B+ raised at $25B pre-money valuation. | claim-devin-016 |

## Reveal Order

1. **Show autonomous execution first** — Devin's interface performing a task. Withhold: who is watching and why it matters. Purpose: hook built on observable behavior, not description.
2. **Name the product and its model** — "Devin by Cognition — three IOI gold medalists built it as an autonomous teammate." Withhold: how did anyone find out? Purpose: establish product identity and credibility.
3. **Cold start signal** — Demo reached 1.22M views. Founders Fund invested $21M at $350M on release day. Withhold: did the product deliver? Purpose: viewers can verify the demo exists; market pricing anchors the scale.
4. **Product evolution and pricing choice** — Devin 2.0: parallel execution, $20/month personal plan. Earlier team tier was $500/month. Withhold: who actually paid? Purpose: show deliberate strategy, not just feature list.
5. **Enterprise proof point** — Mercedes-Benz result: 200K lines COBOL, estimated 8 months → 8 days. Full deployment follows. Withhold: what does this mean for trajectory? Purpose: named client, specific technical result, deployment outcome.
6. **Capital markets resolution** — $1B+ raised at $25B pre-money in May 2026. Withhold: none. Purpose: positive ending anchored in verifiable market pricing.

## Choke Points

- **First 3 seconds:** Must show Devin doing something visible. Opening with a logo or founder quote violates the "result before history" rule.
- **Mercedes figure:** "Estimated 8 months" must be said as-is. Saying "cut from 8 months to 8 days" without the estimate qualifier misrepresents the source.
- **Price comparison:** $20/month is Devin 2.0 personal plan. $500/month was GA team tier. Must not imply the same tier dropped in price.
- **Ending:** Closes on the $25B valuation — no question, no "what's next."

## Blockers

None.

## Verdict

**READY** — All required narrative beats are supported by sourced Claims. The story uses a single coherent angle (autonomous execution), progresses from visible product behavior to market validation, and ends on a capital markets data point without manufactured tension.
