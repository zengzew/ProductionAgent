# Story Bible — Episode 004: Devin by Cognition

## Product Identity

**Devin** is an autonomous AI software engineer by Cognition. It accepts a software engineering task and independently executes it through a sandboxed cloud environment that includes a browser, code editor, and terminal. The engineer receives a tested result for review — not a suggestion, but a completed deliverable.

- **Founded by:** Scott Wu, Steven Hao, Walden Yan (all IOI gold medalists)
- **Company:** Cognition
- **Founded:** August 2023
- **Headquarters:** San Francisco
- **First product release:** March 12, 2024

## Product Capability Model

Devin is positioned as an autonomous teammate, not a coding assistant:

| Capability | Detail | Source |
|------------|--------|--------|
| Task acceptance | Engineer submits a task description | claim-devin-009 |
| Autonomous execution | Devin uses its own browser, shell, code editor | claim-devin-001 |
| Visible steps | Every action — open page, write code, run command — is visible in real time | claim-devin-004 |
| Deliverable output | Devin produces a tested, submittable result for engineer review | claim-devin-009 |
| Parallel execution (2.0) | Multiple Devins can run simultaneously, each with its own cloud IDE | claim-devin-006 |
| Pricing tiers | Team: $500/month (GA, Dec 2024). Personal: $20/month (Devin 2.0, Apr 2025) | claim-devin-005 |

## Key Events (Story-Relevant Only)

| Date | Event | Story Function | Claims |
|------|-------|---------------|--------|
| 2024-03-12 | Devin released as "first AI software engineer"; official demo published | Problem / Hook | claim-devin-002, 001, 003 |
| 2024-03-12 | Demo reaches 122万+ views; Founders Fund invests $21M at $350M valuation | Cold Start | claim-devin-014, 015 |
| 2024-12-10 | Devin GA: team tier $500/month | Distribution anchor | claim-devin-005 |
| 2025-04-03 | Devin 2.0: parallel Devins, $20/month personal plan | Turning Point / Access | claim-devin-005, 006 |
| 2026-04-27 | Mercedes-Benz partnership announced: 200K lines COBOL, estimated 8 months → 8 days | Enterprise Validation | claim-devin-007 |
| 2026-05-27 | Cognition raises $1B+ at $25B pre-money valuation | Market Pricing / Ending | claim-devin-016 |

## Characters

| Character | Role | Key Fact | Source |
|-----------|------|----------|--------|
| Scott Wu | Co-founder, CEO | IOI gold medalist; said competition programming background gives advantage in building AI that makes complex decisions | claim-devin-012, 013 |
| Steven Hao | Co-founder | IOI gold medalist | claim-devin-012 |
| Walden Yan | Co-founder | IOI gold medalist | claim-devin-012 |
| Mercedes-Benz | Enterprise customer | Deployed Devin for COBOL modernization; cited specific time reduction | claim-devin-007 |

## Key Numbers (Allowed in Narration)

| Metric | Value | Context | Claim |
|--------|-------|---------|-------|
| Demo views | 122万+ | Official YouTube, as of 2026-08-16 | claim-devin-015 |
| Seed valuation | $350M | Founders Fund, 2024-03 | claim-devin-014 |
| Seed amount | $21M | Founders Fund, 2024-03 | claim-devin-014 |
| Team tier price | $500/month | GA, Dec 2024 | claim-devin-005 |
| Personal plan price | $20/month | Devin 2.0, Apr 2025 | claim-devin-005 |
| COBOL lines | 200,000 | Mercedes-Benz engagement | claim-devin-007 |
| Mercedes modernization time | 8 days (vs. 8-month estimate) | Project estimate from official blog | claim-devin-007 |
| Series D valuation | $25B pre-money ($26B post) | May 2026 | claim-devin-016 |
| Series D amount | $1B+ | May 2026 | claim-devin-016 |

## Excluded Data (Not in Narration)

| Data | Reason | Claim |
|------|--------|-------|
| SWE-bench 13.86% | Benchmark score; not a user-facing proof | claim-devin-010 |
| PR merge rate 34%→67% | Company-reported internal metric | claim-devin-011 |
| 4x problem-solving speed | Company-reported internal metric | claim-devin-011 |
| 89% internal code commits | Company-reported; implies productivity/quality without basis | claim-devin-008 |
| Goldman Sachs pilot | Media-only source; no company confirmation | growth-data.md |

## Verified Product Footage Available

| Video | Date | Content | Use |
|-------|------|---------|-----|
| Official demo (src-devin-002) | 2024-03-12 | Devin receives task, opens browser, writes code, runs commands | Beat 1 hook |
| Upwork demo (src-devin-013) | 2024-03-15 | Devin takes real Upwork job, writes CV model, runs | Beat 1 alternative |
| Getting Started (src-devin-003) | 2026-03-16 | Session flow, task input, cloud IDE execution | Beat 1 / 2 |
| Mercedes video (src-devin-011) | 2026-04-27 | Customer interview with Cognition team | Beat 5 |
| Parallel Devins (src-devin-014) | 2025-04-24 | Multiple Devins running simultaneously | Beat 4 |
| Devin Overview (src-devin-015) | 2026-06-11 | Agent-native overview, task-to-PR workflow | Beat 2 |

## Narrative Geography

- **Opening:** Devin executing a task (from official demo or tutorial)
- **Beat 2:** Product identity and founder context (via on-screen text or b-roll of team)
- **Beat 3:** Capital markets data — either as sourced graphic or text overlay with CredibilityTag
- **Beat 4:** Devin 2.0 parallel execution — from official parallel Devins video
- **Beat 5:** Mercedes result — sourced graphic showing "200K lines / 8 days" with official video available as B-roll
- **Closing:** Capital markets resolution — sourced graphic for $25B / $1B+ figures

## Constraints Summary

- Do not show a generic copilot suggestion interface — it must be Devin's own execution UI
- Do not compare $500 and $20 as a direct price drop — they are different tiers
- Do not use "8 months" without the estimate qualifier for Mercedes
- Do not close with a question or forward-looking statement
- Maximum 3 product actions across the full runtime
