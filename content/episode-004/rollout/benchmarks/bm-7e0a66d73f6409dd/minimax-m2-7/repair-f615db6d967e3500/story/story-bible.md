# Story Bible — Episode 004: Devin

## Product Identity

**Devin** is an autonomous AI software engineer developed by Cognition. It accepts a task, then independently uses a web browser, code editor, and terminal to complete it—delivering results for a human engineer to review. It is not a code autocomplete tool. It is not a chatbot that suggests next steps. It is an agent that executes tasks end-to-end and surfaces verified output.

**Cognition** is the company behind Devin. Founded in August 2023 by three competitive programmers who each won gold medals at the International Olympiad in Informatics (IOI): Scott Wu, Steven Hao, and Walden Yan.

---

## The Problem the Story Answers

**"How do we know Devin actually works as an AI software engineer?"**

This is not answered by benchmark scores or founder testimonials. It is answered by:

1. **Seeing it execute** — Devin's own interface shows it opening browsers, writing code, and running commands, each step visible.
2. **Enterprise trust** — Mercedes-Benz used Devin on a real, large-scale codebase (200,000 lines of COBOL) and saw the modernization complete in 8 days instead of the estimated 8 months.
3. **Internal adoption** — Cognition's own engineers now have Devin commit 89% of the company's code.
4. **Market pricing** — In May 2026, markets valued Cognition at $2.5 billion pre-money and put in over $1 billion.

---

## Key Facts (Narration-Approved)

| Claim ID | Fact | Source | Notes |
|---|---|---|---|
| claim-devin-001 | Devin accepts tasks and uses its own browser, code editor, and terminal to execute autonomously | src-devin-001, src-devin-002, src-devin-013 | Official blog + demo video; visible in demo |
| claim-devin-003 | Devin's interface includes task planning, browser, code editor, terminal | src-devin-001, src-devin-002, src-devin-003 | Verified in official demo and tutorial |
| claim-devin-004 | Each step is visible: opening pages, modifying files, executing commands | src-devin-002, src-devin-003, src-devin-015 | Verified in official tutorial |
| claim-devin-007 | Mercedes used Devin to modernize 200K lines of COBOL in 8 days instead of estimated 8 months | src-devin-006, src-devin-011 | Official blog + official customer video |
| claim-devin-008 | 89% of Cognition's own code is committed by Devin | src-devin-007, src-devin-008 | Official Series D blog |
| claim-devin-009 | Devin delivers results for engineer review; engineers own the final output | src-devin-001, src-devin-003, src-devin-015 | Core product positioning |
| claim-devin-012 | Three IOI gold medalists founded Cognition | src-devin-016, src-devin-017 | Wikipedia + Bloomberg |
| claim-devin-013 | Competitive programming background gives advantage in teaching AI complex decisions | src-devin-016, src-devin-017 | Founder-reported; background only |
| claim-devin-014 | $21M seed at $350M valuation (Founders Fund) | src-devin-016 | Wikipedia / WSJ |
| claim-devin-015 | Official demo video has 122万+ views | src-devin-002 | YouTube; as of 2026-08-16 |
| claim-devin-016 | $1B+ raised at $2.5B pre-money (May 2026) | src-devin-007 | TechCrunch reporting |

---

## Excluded Facts

| Claim ID | Fact | Reason Excluded |
|---|---|---|
| claim-devin-010 | SWE-bench 13.86% | Benchmark score; allowedInNarration=false; not a success rate |
| claim-devin-011 | PR merge 34%→67%, 4× speed | Company self-reported performance report; allowedInNarration=false |

---

## Character Notes

**Scott Wu, Steven Hao, Walden Yan — Founders**

- Three IOI gold medalists. Scott Wu is the most publicly prominent; he has spoken about competitive programming giving them an edge in building an AI that reasons through complex decisions.
- They do not appear as characters in the narration. Their competitive programming background provides background context only.
- No invented motivations or private moments.

**Mercedes-Benz (Enterprise Customer)**

- Appears as a named, verifiable customer case. The project: analyzing and modernizing over 200,000 lines of COBOL legacy code.
- The 8-day result was achieved in a four-week pilot context. The 8-month estimate is a project estimation, not a measured before/after.
- No additional Mercedes executives are named in narration.

**Cognition Engineers (Internal Users)**

- Represented as a collective adoption metric: 89% of company code committed by Devin.
- Not individual engineers named or described.

---

## Product Mechanics (What the Viewer Must Understand)

1. **Devin is not autocomplete.** It does not suggest the next line of code. It opens its own browser, writes code, runs tests, and produces a finished deliverable.
2. **Devin works in a sandboxed environment.** It has its own cloud-based IDE with shell, code editor, and browser access.
3. **Devin is not unsupervised.** The official positioning is that engineers give Devin tasks and review the output. Devin handles the execution; humans own the result.
4. **Devin can run in parallel.** Devin 2.0 can spin up multiple instances, each with its own cloud IDE, working on different tasks simultaneously.

---

## Visual Assets Required

| Asset | Source | Purpose | Timestamp |
|---|---|---|---|
| Official demo video (Devin executing a task) | src-devin-002 | Act 1: Define product as autonomous executor | 0–10s |
| Mercedes blog screenshot or code still | src-devin-006 | Act 2: Enterprise evidence | 20–30s |
| Cognition Series D blog still ("89% committed by Devin") | src-devin-008 | Act 2: Internal adoption evidence | 30–40s |
| Valuation figure from TechCrunch or official blog | src-devin-007 | Act 3: Market verdict | 50–60s |

---

## Phraseology Notes

- **Always:** "Devin accepts a task and executes it" or "Devin executes a task" — not "Devin codes for you"
- **Always:** "Mercedes trusted Devin" or "Mercedes used Devin" — not "Mercedes replaced engineers with Devin"
- **Always:** "89% of Cognition's code is committed by Devin" — not "89% of all code everywhere is written by Devin"
- **Always:** "estimated 8 months → 8 days" — not "8 months to 8 days improvement"
- **Never:** "Devin works autonomously" (it is not unsupervised; engineers review output)
- **Never:** SWE-bench numbers as proof of real-world capability

---

## The Narrative Chain

**Visible execution** (claim-devin-001, claim-devin-004)
↓ (causal: seeing is believing; proof of capability)
**Enterprise adoption** (claim-devin-007: Mercedes case)
↓ (sequence-only: not proven causal chain; enterprise decision ≠ direct result of demo views)
**Internal adoption** (claim-devin-008: 89% code)
↓ (sequence-only: insider trust ≠ external proof; both are independent evidence layers)
**Market pricing** (claim-devin-016: $2.5B valuation)

Note: Only the first link (visible execution → product capability) carries a causal claim. The subsequent links are sequenced evidence, not proven causal chains.
