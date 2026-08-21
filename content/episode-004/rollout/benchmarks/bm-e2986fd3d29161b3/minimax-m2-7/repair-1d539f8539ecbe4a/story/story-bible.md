# Story Bible — Devin / Cognition (episode-004)

## Product Identity
**Devin** — an autonomous AI software engineer. Cognition's product that accepts coding tasks, executes them in a sandboxed cloud environment (browser, code editor, shell), and delivers results for human review.

- **What it is not**: a code suggestion tool, a chatbot that outputs code blocks, an IDE plugin that autocompletes
- **What it is**: a task executor that plans, browses, writes, runs, and reports back

## Key Terms

| Term | Definition | Source |
|---|---|---|
| Autonomous execution | Devin completes assigned coding tasks in its own sandboxed environment (browser, shell, code editor); engineer reviews the result | claim-devin-001, 003 |
| Teammate positioning | Official framing: engineer assigns task, Devin completes it, engineer reviews | claim-devin-009 |
| Parallel Devins | Devin 2.0 capability: multiple concurrent Devin instances, each with independent cloud IDE | claim-devin-006 |
| COBOL modernization | Legacy enterprise scenario: Mercedes used Devin to analyze and update 200K lines of COBOL | claim-devin-007 |
| Agent-native IDE | Devin 2.0 interface with integrated development environment for interaction | claim-devin-004 |

## Characters (Sources Only)

| Entity | Role | Evidence |
|---|---|---|
| Scott Wu, Steven Hao, Walden Yan | Co-founders of Cognition; all IOI gold medalists | claim-devin-012 |
| Founders Fund / Peter Thiel | Seed investor; $21M at $350M valuation | claim-devin-014 |
| Mercedes-Benz R&D/IT | Enterprise customer; Devin deployed across departments after pilot | claim-devin-007 |
| Cognition engineers | Internal users; 89% of code committed by Devin | claim-devin-008 |

## World State at Story Open
- Cognition is a 2023-founded AI coding startup with three IOI gold medalist founders
- Devin is the first product, announced 2024-03-12 with an official demo
- The product can autonomously browse, code, and execute; engineers review the output
- Official demo had 1.22M+ views as of August 2026
- Seed valuation: $350M (Founders Fund)

## World State at Story Close
- Devin 2.0 released (April 2025): $20/month personal plan, parallel Devins
- Mercedes-Benz partnership announced (April 2026): 200K COBOL lines, estimated 8 months → 8 days
- Series D announced (May 2026): over $1B raised at $25B pre-money valuation
- Cognition's own engineers: 89% of code committed by Devin

## World Rules
- Official positioning requires human review; Devin does not operate unsupervised
- Pricing is a distribution mechanism, not a discount narrative
- Valuation reflects market pricing of potential, not revenue or profit claims
- COBOL 8-month estimate is project estimation, not a measured comparison

## Excluded / Forbidden
- No origin anecdote for the idea; founder motivation is summarized from IOI background (claim-devin-013) without invented scenes
- No SWE-bench statistics narrated (research background only)
- No "回看开场" as a default ending
- No third-party testimonials without source documentation
- No manufactured crisis, antagonist, or pivot invented from thin air

## Claim Map

| Claim ID | Content | Allowed in Narration | Notes |
|---|---|---|---|
| claim-devin-001 | Devin uses browser, code editor, terminal to execute autonomously | Yes | Core capability |
| claim-devin-002 | Devin announced 2024-03-12 as "first AI software engineer" | Yes | Context, not tagline |
| claim-devin-003 | Devin UI includes task planning, browser, code editor, terminal | Yes | Product definition |
| claim-devin-004 | Every Devin action is visible: page opens, file changes, commands run | Yes | Differentiator from chat |
| claim-devin-005 | $500/month team plan (Dec 2024 GA); $20/month personal (Apr 2025 Devin 2.0) | Yes | Pricing evolution; do not conflate |
| claim-devin-006 | Devin 2.0: parallel Devins with independent cloud IDEs | Yes | Product capability |
| claim-devin-007 | Mercedes: 200K COBOL lines, estimated 8 months → 8 days | Yes | Enterprise validation |
| claim-devin-008 | 89% of Cognition's own code committed by Devin | Yes | Internal adoption proof |
| claim-devin-009 | Devin positioned as teammate: engineer assigns, reviews result | Yes | Demand framing |
| claim-devin-010 | SWE-bench 13.86% (research background only) | No | Not narrated |
| claim-devin-011 | 2025 performance metrics: PR merge 34%→67%, 4x speed (research background) | No | Not narrated |
| claim-devin-012 | Three IOI gold medalist founders | Yes | Founder credibility |
| claim-devin-013 | Scott Wu: IOI background gives advantage in teaching AI complex decisions | Yes | Founding logic |
| claim-devin-014 | Founders Fund seed: $21M at $350M valuation | Yes | Cold-start valuation |
| claim-devin-015 | Official demo 1.22M+ views | Yes | Cold-start proof |
| claim-devin-016 | May 2026: $1B+ at $25B pre-money | Yes | Market pricing |

## Source Map

| Source ID | Type | Key Use |
|---|---|---|
| src-devin-001 | Official blog | Product capability, official positioning |
| src-devin-002 | Official YouTube (demo) | Primary visual evidence: autonomous execution |
| src-devin-003 | Official YouTube (tutorial) | Secondary visual: IDE session |
| src-devin-004 | Official blog (Devin 2.0) | Pricing, parallel Devins |
| src-devin-005 | Media (VentureBeat) | Price comparison context |
| src-devin-006 | Official blog (Mercedes) | Enterprise case |
| src-devin-007 | TechCrunch (Series D) | Valuation |
| src-devin-008 | Official blog (Series D) | 89% internal code stat |
| src-devin-011 | Official YouTube (Mercedes) | Enterprise video evidence |
| src-devin-012 | Official YouTube (IDE extension) | Internal Devin use |
| src-devin-013 | Official YouTube (Upwork) | External task demo |
| src-devin-014 | Official YouTube (parallel) | Parallel Devin demo |
| src-devin-015 | Official YouTube (overview) | Product overview |
| src-devin-016 | Wikipedia | Founder background, seed round |
| src-devin-017 | Bloomberg | Founder IOI, market context |

## Technical Boundary
- "Autonomous" refers to product behavior (task-to-result), not a claim of unsupervised operation or 100% success rate
- SWE-bench and internal metrics are research background only
- COBOL 8-month estimate is project estimation, not a measured result comparison
- No model architecture, training data, or security mechanism details

## Narrative Constraints
- Maximum 3 distinct product actions shown
- Every new concept must connect to a preceding question it answers
-相邻 claims only labeled `causal` when source supports causation; otherwise `sequence-only`
- Zero-background viewer must understand product in the first 20 seconds from visible action, not description
- Hook: 0–3s = what happened; 3–10s = scale or cost; 10–20s = what answer viewer waits for
- Story ends at capital validation ($25B valuation) or product state with Claim support; no trend wrap-up
- Opening frame should show an already-occurred result, not action about to begin
