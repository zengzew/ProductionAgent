<!-- director-brief-gate
{
  "rubricVersion": "director-brief-v1",
  "reviewedFiles": {
    "factsSha256": "2ad183f94c0ef5cf8b1de352e8577c42322e56a7affa5a272ae980fefa8b5dee",
    "sourcesSha256": "988cfcc4bc1af26d5fa98c84970e82a80ca057bbc7cdc7840f29f6e002cf5d2d",
    "timelineSha256": "7036193e40d4e877bfbefcbf758279de6941f8f5b074d78fdb2fb825f07601c8"
  },
  "coreStoryQuestion": "How do we know Devin actually works as an AI software engineer?",
  "audiencePromise": "You will see Devin execute a task in real time, then see enterprise-scale evidence that its output is trusted and adopted.",
  "sourcedAnswer": "Devin completes tasks with visible steps in its own browser, code editor, and terminal. Mercedes-Benz let Devin modernize 200,000 lines of COBOL code in 8 days instead of the estimated 8 months. Cognition engineers now have Devin handle 89% of their code commits. Markets priced this at $2.5 billion pre-money.",
  "factBoundary": "Do not claim Devin operates without human oversight (it delivers results for engineer review). Do not claim SWE-bench scores prove real-world success. Do not convert the Mercedes case from an estimated timeline to a measured comparison. Do not describe claim-devin-010 (SWE-bench 13.86%) or claim-devin-011 (PR merge rates / 4x speed) as positive narration evidence.",
  "emotionalArc": [
    {
      "beatId": "beat-01",
      "viewerState": "Watching an AI execute a task they can verify themselves",
      "storyMove": "Show Devin opening a web page, writing code, modifying a file, and running a command—each step visible in its own interface. Establish the product as an autonomous executor, not a code suggester.",
      "targetRange": "0–20 seconds",
      "claimIds": ["claim-devin-001", "claim-devin-003", "claim-devin-004"]
    },
    {
      "beatId": "beat-02",
      "viewerState": "Wondering whether this is production-ready or just a demo",
      "storyMove": "Provide two layers of evidence: Mercedes trusted Devin on a 200,000-line COBOL codebase (8 months → 8 days), and Cognition's own engineers now have Devin commit 89% of their code. One is external validation; one is insider adoption.",
      "targetRange": "20–45 seconds",
      "claimIds": ["claim-devin-007", "claim-devin-008"]
    },
    {
      "beatId": "beat-03",
      "viewerState": "Asking what the market thinks this is worth",
      "storyMove": "Close on the May 2026 fundraise: $1 billion+ at $2.5 billion pre-money valuation. Source-matched to TechCrunch reporting and Cognition's own Series D blog.",
      "targetRange": "45–65 seconds",
      "claimIds": ["claim-devin-016"]
    }
  ],
  "revealOrder": [
    {
      "order": 1,
      "reveal": "Devin accepts a task and begins executing it visibly—browser opens, code editor shows changes, terminal runs commands.",
      "withheldAnswer": "Who chose to build this, why competitive programmers, and how the founding team thinks about the problem.",
      "purpose": "Give the audience a verifiable first impression they can trust before introducing scale or market context. No abstraction yet."
    },
    {
      "order": 2,
      "reveal": "Mercedes-Benz used Devin on a 200,000-line COBOL modernization project and completed in 8 days instead of the estimated 8 months.",
      "withheldAnswer": "The exact scope of Mercedes deployment beyond the pilot, number of engineers involved, or whether this represents typical Devin performance.",
      "purpose": "Prove the product works on a real enterprise workload with a specific, verifiable number. Establishes that the capability is not limited to toy demos."
    },
    {
      "order": 3,
      "reveal": "Cognition's own engineers now have Devin commit 89% of the company's code.",
      "withheldAnswer": "The breakdown of remaining 11%, whether this includes all codebases, or whether this rate is improving.",
      "purpose": "Signal insider trust: the people who built Devin use it daily. Complements the external Mercedes case with internal adoption evidence."
    },
    {
      "order": 4,
      "reveal": "In May 2026, Cognition raised over $1 billion at a $2.5 billion pre-money valuation.",
      "withheldAnswer": "Investors' specific thesis, use of funds, or any forward-looking revenue projections.",
      "purpose": "Markets price products. This closes the narrative with a concrete, source-matched capital markets verdict rather than an abstract summary of scale."
    }
  ],
  "blockers": [],
  "verdict": "READY",
  "returnTo": "none"
}
-->

# Director Brief — Episode 004: Devin

## Core Story Question

**How do we know Devin actually works as an AI software engineer?**

This question must be answered through observable action, enterprise evidence, and insider adoption—not through benchmark scores or developer testimonials.

---

## Audience Promise

The viewer will see Devin execute a task in real time with visible steps, then receive two layers of evidence that its output is trusted at scale: a named enterprise case (Mercedes-Benz) and the company's own internal adoption rate. The episode closes on a market-priced valuation, not a feature list.

---

## Sourced Answer

Devin completes tasks with visible steps in its own browser, code editor, and terminal. Mercedes-Benz let Devin modernize 200,000 lines of COBOL code in 8 days instead of the estimated 8 months. Cognition engineers now have Devin handle 89% of their code commits. Markets priced this at $2.5 billion pre-money.

---

## Fact Boundary

| Do Not Use | Reason |
|---|---|
| claim-devin-010 (SWE-bench 13.86%) | Benchmark score, not narration evidence; allowedInNarration=false |
| claim-devin-011 (PR merge 34%→67%, 4× speed) | Company self-reported绩效口径; allowedInNarration=false |
| "Mercedes实测对比 8 months → 8 days" | The 8 months is an estimate; not a measured before/after; must be phrased as "estimated 8 months → 8 days" |
| Any claim that Devin works without human review | claim-devin-009 explicitly states Devin delivers results for engineer review |

---

## Visual Evidence Plan

| Timestamp | Asset Type | Action Shown | Claim Verified |
|---|---|---|---|
| 0–10s | Official demo video (src-devin-002) | Devin's browser opens page, editor shows code changes, terminal runs command | claim-devin-001, claim-devin-004 |
| 20–30s | Official Mercedes blog screenshot or COBOL code still (src-devin-006) | Show code volume + timeline result | claim-devin-007 |
| 30–40s | Official Series D blog still (src-devin-008) | "89% of code committed by Devin" label | claim-devin-008 |
| 50–60s | TechCrunch article or official blog valuation header (src-devin-007) | "$2.5B pre-money" figure | claim-devin-016 |

---

## Story Angle Comparison

### Angle A — Product-in-Action (SELECTED)
Devin executes tasks autonomously → Mercedes trusted it on 200K lines of COBOL → Cognition engineers let it commit 89% of their code → Market priced it at $2.5B.

**Why selected:** Leads with observable action. Directly answers "how do we know it works?" through visible execution, enterprise adoption, and insider usage. No abstract claims.

### Angle B — Competitive Programmer Advantage
Three IOI gold medalists built Devin → Their competitive programming background gives them an edge in teaching AI complex decision-making → Demo went viral → Enterprise clients adopted.

**Not selected:** The competitive programming origin is interesting background but does not directly answer whether Devin works in practice. The origin story is not the proof of execution.

### Angle C — Pricing Democratization
Devin launched at $500/month for teams → Devin 2.0 introduced $20/month personal tier → Enterprise adoption and internal usage prove the product outgrew its initial price point.

**Not selected:** Pricing evolution is a distribution story, not a capability proof. The $20/month tier matters for access but does not answer whether the product actually works.

---

## Structure Targets

- **Total runtime:** 55–70 seconds (target 60 seconds ± 5 seconds with TTS pauses and last-frame hold)
- **Act 1 (0–20s):** Hook. Show Devin executing a task visibly. State the product identity.
- **Act 2 (20–45s):** Evidence layer. Mercedes case (enterprise trust) + 89% internal code (insider trust).
- **Act 3 (45–65s):** Market verdict. $2.5B pre-money valuation, $1B+ raised.
- **No Act 3 fallback:** Do not close on "the product is still improving" or any forward-looking statement without source support.

---

## Key Constraints

1. **No invented claims.** Every fact in the final narration must map to an allowedInNarration=true Claim ID.
2. **No crisis or antagonist.** The story has a tension (autonomous execution vs. human verification) but not a villain.
3. **No benchmark-to-success conversion.** SWE-bench numbers are not success rates.
4. **Demo video is evidence, not decoration.** The official demo (src-devin-002) must carry the product definition in Act 1, not sit as a background cut.
5. **No version-release chronology.** Act 2 does not narrate the timeline from v1 to v2; it selects the two strongest proof points regardless of date order.

---

## Alignment Check

All four output files (director-brief.md, story-bible.md, story-angle.md, three-act-structure.md) share:

- The same core question: "How do we know Devin works?"
- The same three-beat emotional arc (visible execution → enterprise + insider evidence → market pricing)
- The same closing evidence: $2.5B pre-money valuation
- No blockers
- verdict: READY
