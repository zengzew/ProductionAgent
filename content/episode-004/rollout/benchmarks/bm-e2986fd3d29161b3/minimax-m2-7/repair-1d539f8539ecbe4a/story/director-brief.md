<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "Devin 抓住的需求是：工程师想把重复性编程任务交给 AI 做，自己专注审查和决策。冷启动靠什么？产品自己会干活、能被看见。2024-03-12 官方演示证明它能自主执行而非输出代码，播放超 122 万次。定价策略如何改变分发范围？2024-12 GA 时 $500/月团队版，2025-04-03 Devin 2.0 降到 $20/月个人套餐，打开非企业用户。市场给它的价格是什么？2026-05-27 以 25 亿美元 pre-money 估值融资超 10 亿美元。",
  "audiencePromise": "You will see a product that does the work your tools cannot—autonomously executing code tasks while you review the results—and understand how its pricing and enterprise validation led to a $2.5B valuation.",
  "sourcedAnswer": "Cognition's founders (three IOI gold medalists) built Devin to let engineers hand off coding tasks. The 2024-03-12 demo showed Devin autonomously browsing, writing, and executing code—visible in real time. Pricing evolved from $500/month team-only (Dec 2024 GA) to $20/month personal (Apr 2025 Devin 2.0). Mercedes-Benz validated enterprise demand: Devin reduced a COBOL modernization from an estimated 8 months to 8 days. By May 2026 Cognition raised over $1B at a $25B pre-money valuation.",
  "factBoundary": "Do not claim Devin works without human oversight; official positioning is engineer assigns task, reviews result. Do not describe the $500→$20 transition as the same plan dropping in price; $500 was the Dec 2024 GA team plan, $20 is the Apr 2025 Devin 2.0 personal entry price. SWE-bench 13.86% and internal performance metrics are research-background only; do not narrate them. Mercedes 8-month estimate is project estimate, not measured comparison.",
  "emotionalArc": [
    {
      "beatId": "hook",
      "viewerState": "Unaware that an AI can independently execute coding tasks",
      "storyMove": "Show Devin autonomously browsing, writing code, and running commands—visible in real time on screen",
      "targetRange": "0–3s",
      "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"]
    },
    {
      "beatId": "demand",
      "viewerState": "Wants to know who needs this and why",
      "storyMove": "Establish Devin as a teammate: engineer hands off tasks, reviews results",
      "targetRange": "3–10s",
      "claimIds": ["claim-devin-009", "claim-devin-013"]
    },
    {
      "beatId": "cold-start",
      "viewerState": "Curious how the market discovered and accepted Devin",
      "storyMove": "Official demo reached 1.22M+ views on launch day; $350M seed valuation confirmed the bet",
      "targetRange": "10–20s",
      "claimIds": ["claim-devin-015", "claim-devin-014", "claim-devin-012"]
    },
    {
      "beatId": "pricing-pivot",
      "viewerState": "Asks how access expanded beyond enterprise teams",
      "storyMove": "Devin 2.0 dropped to $20/month personal plan; parallel Devins enable simultaneous work",
      "targetRange": "20–40s",
      "claimIds": ["claim-devin-005", "claim-devin-006"]
    },
    {
      "beatId": "enterprise-validation",
      "viewerState": "Demands proof this works outside a demo",
      "storyMove": "Mercedes-Benz: Devin analyzed 200K lines of COBOL, cut modernization from estimated 8 months to 8 days",
      "targetRange": "40–55s",
      "claimIds": ["claim-devin-007", "claim-devin-006"]
    },
    {
      "beatId": "capital-validation",
      "viewerState": "Wants the market's verdict on the whole story",
      "storyMove": "May 2026: over $1B raised at $25B pre-money valuation; Cognition's own engineers commit 89% of code via Devin",
      "targetRange": "55–70s",
      "claimIds": ["claim-devin-016", "claim-devin-008"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin autonomously browses, writes code, and executes commands on screen",
      "withheldAnswer": "Why the market accepted this; pricing path; enterprise validation",
      "purpose": "Establish product capability with visible, independently-verifiable action—not a chat suggestion"
    },
    {
      "order": 2,
      "reveal": "Engineers assign tasks; Devin completes them for human review",
      "withheldAnswer": "Cold-start mechanism; valuation",
      "purpose": "Define the demand/problem without inventing a founder anecdote"
    },
    {
      "order": 3,
      "reveal": "Official demo: 1.22M+ views; Founders Fund seed at $350M valuation",
      "withheldAnswer": "Pricing evolution; Mercedes case",
      "purpose": "Prove cold-start: product was seen and valued at launch"
    },
    {
      "order": 4,
      "reveal": "Devin 2.0: $20/month personal plan; parallel Devins with independent cloud IDEs",
      "withheldAnswer": "Mercedes case; final valuation",
      "purpose": "Show distribution strategy shift from enterprise-only to mass access"
    },
    {
      "order": 5,
      "reveal": "Mercedes-Benz: Devin analyzed 200K lines of COBOL, reduced modernization from estimated 8 months to 8 days",
      "withheldAnswer": "Full valuation figure",
      "purpose": "Provide enterprise-scale proof that autonomous execution works outside a demo"
    },
    {
      "order": 6,
      "reveal": "May 2026: $1B+ raised at $25B pre-money; 89% of Cognition's own code committed by Devin",
      "withheldAnswer": "None—story ends here",
      "purpose": "Deliver market pricing as the final answer; stop, do not add trend or callback"
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief — Devin / Cognition (episode-004)

## Core Story Question
Devin抓住了什么需求，怎么让第一批人用起来，市场后来给了它什么价。

## Story Thesis
Devin promises to hand off repetitive coding tasks to an autonomous AI teammate so engineers focus on review and decisions. The evidence shows that promise through: (1) an official demo proving autonomous execution capability on launch day; (2) pricing evolution from enterprise-only ($500/month) to personal ($20/month) expanding the user base; (3) Mercedes-Benz validating enterprise-scale deployment with a concrete COBOL modernization result; and (4) a $25B pre-money valuation confirming market pricing.

## Selection Logic: Three Angles Compared

| Angle | Central Tension | Evidence Available | Weakness |
|---|---|---|---|
| A: IOI founders build AI to replace themselves | Competitive programming background → product choice | Founder quotes (IOI/algorithm advantage); no origin anecdote for demand | Origin story gap; too meta |
| B: AI that actually does the job vs. AI that suggests | Autonomous execution vs. chat copilot | Official demo (122万+ views); visible execution; Mercedes COBOL case | Technical claim needs visible proof; narrative can slip into feature list |
| **C: Pricing strategy as distribution story** | **Enterprise-only ($500) → mass access ($20) → enterprise validation (Mercedes)** | **Pricing timeline; parallel Devins; Mercedes case; $25B valuation** | **Pricing history alone doesn't prove product value** |

**Selected: Angle B** — Leads with visible autonomous execution, grounds pricing strategy as distribution expansion, ends with Mercedes validation and market pricing. This directly shows product capability rather than explaining it through features.

## Audience Promise
You will see a product that does the work your tools cannot—autonomously executing code tasks while you review the results—and understand how its pricing and enterprise validation led to a $2.5B valuation.

## Fact Boundary
- Do not claim Devin works without human oversight; official positioning is engineer assigns task, reviews result
- Do not describe the $500→$20 transition as the same plan dropping in price; $500 was Dec 2024 GA team plan, $20 is Apr 2025 Devin 2.0 personal entry price
- SWE-bench 13.86% and internal performance metrics are research-background only; do not narrate them
- Mercedes 8-month estimate is project estimate, not measured comparison
- Do not use "回看开场" as default ending; stop at capital validation

## Visual Requirement
- Official demo video (src-devin-002) is the primary evidence for autonomous execution: Devin's own interface showing browser, code editor, terminal actions in real time. Must enter before 10s.
- Official tutorial video (src-devin-003) for IDE session structure if additional product action needed.
- Mercedes official video (src-devin-011) or COBOL blog (src-devin-006) for enterprise validation.
- No third-party stock footage or decorative screenshots.

## Emotional Arc

| Beat | Time | Viewer State | Story Move | Claims |
|---|---|---|---|---|
| Hook | 0–3s | Unaware AI can independently execute | Show Devin autonomously browsing, writing code, running commands—visible in real time | claim-devin-001, 003, 004 |
| Demand | 3–10s | Wants to know who needs this | Engineer hands off; Devin completes; human reviews | claim-devin-009, 013 |
| Cold Start | 10–20s | Curious how market discovered it | Demo 1.22M+ views; $350M seed valuation | claim-devin-015, 014, 012 |
| Pricing Pivot | 20–40s | Asking how access expanded | Devin 2.0: $20/month personal; parallel Devins | claim-devin-005, 006 |
| Enterprise Validation | 40–55s | Demands proof beyond demo | Mercedes: 200K COBOL lines, 8 months → 8 days | claim-devin-007, 006 |
| Capital Validation | 55–70s | Wants market's verdict | $1B+ raised at $25B pre-money; 89% own code via Devin | claim-devin-016, 008 |

## Reveal Order

1. **Reveal: Devin autonomously executes on screen** → Withheld: why market accepted it; pricing path; enterprise proof
   - Purpose: Establish product capability with visible, independently-verifiable action

2. **Reveal: Engineer assigns task; Devin completes for review** → Withheld: cold-start mechanism; valuation
   - Purpose: Define demand/problem without inventing founder anecdote

3. **Reveal: Demo reached 1.22M+ views; $350M seed valuation** → Withheld: pricing evolution; Mercedes case
   - Purpose: Prove cold-start via public visibility, not internal claims

4. **Reveal: Devin 2.0 at $20/month personal; parallel Devins** → Withheld: Mercedes case; final valuation
   - Purpose: Show distribution strategy shift from enterprise-only to mass access

5. **Reveal: Mercedes-Benz: 200K COBOL lines, estimated 8 months → 8 days** → Withheld: full valuation figure
   - Purpose: Provide enterprise-scale proof that autonomous execution works outside a demo

6. **Reveal: May 2026: $1B+ raised at $25B pre-money; 89% own code via Devin** → Withheld: none
   - Purpose: Deliver market pricing as final answer; stop

## Story Chain: causal vs. sequence-only

- Demo views → seed valuation: **sequence-only** (public visibility does not prove valuation causation)
- Pricing drop to $20/month → expanded user base: **causal** (price is a documented distribution mechanism)
- Mercedes case → enterprise credibility: **causal** (documented deployment is a reference customer)
- Enterprise validation → $25B valuation: **sequence-only** (market pricing is documented; internal reasoning is not)

## Tonal Guardrails
- Autonomous execution is a visible product behavior, not a philosophical claim about AI replacing jobs
- Pricing is a strategic distribution choice, not a discount story
- Mercedes result is a documented enterprise deployment, not an unverified before/after
- $25B valuation is market pricing of the company's potential, not a statement about revenue or profit

## Blocker Log
None.

## Verdict
READY — all story decisions are executable with current research package. No missing origin data, cold-start evidence, or product capability claims block the narrative.
