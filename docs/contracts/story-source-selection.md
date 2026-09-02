# Story-source selection

New product work starts with candidate preflight before an episode package is created. The preflight
asks only five universal questions:

1. Can a zero-context viewer understand the product or event?
2. Is there one audience-facing question?
3. Is there a sourced action, change or conflict that moves the story?
4. Are the core facts traceable?
5. Are real visuals discoverable with an explicit rights boundary?

Founder identity, first-person interviews, build friction, distribution, revenue and measurable
outcomes are not universal requirements. They become required only when the candidate selects a
story profile that needs them.

## Source strategies

The candidate selects one strategy; no strategy is inherently more factual or more creative:

- `single-spine`: one mature interview, profile, podcast, video or founder post supplies a coherent
  chain. This is the lowest-cost default when available.
- `multi-source`: several sources jointly cover the chain.
- `primary-led`: official product behavior and first-party material lead the story.
- `event-led`: a launch, acquisition, policy change, funding event or other dated event leads.
- `user-led`: user behavior, community activity or user accounts lead.

All sources live in one pool and may separately carry `spine`, `verification` and `visual` roles. A
source used as a spine does not become independent verification, and a discoverable visual does not
become licensed media.

## Story profiles

Profiles route evidence requirements instead of imposing one founder template on every product:

- `founder-journey`
- `product-mechanism`
- `cold-start-distribution`
- `business-turning-point`
- `market-event`
- `user-behavior`

Profiles may be combined. Only the evidence required by selected profiles must be supported;
unselected dimensions may be `not-applicable`.

Run the automatic preflight with:

```bash
pnpm validate:story-source -- --candidate candidates/<candidate>/story-source-preflight.json
```

`ready` means the candidate may become an episode and enter Research Analyst work. `research-more`
means the candidate remains viable but has a specific evidence gap. `reject` is reserved for a
fundamental absence of clarity/visual feasibility, a rights block or an explicit blocker. None of
these states creates a human approval pause.

The preflight does not freeze narration order. The Story Director still chooses the reveal order
after the full research package exists.
